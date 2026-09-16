/**
 * User reports, and the alert that makes them actionable.
 *
 * App Store Review Guideline 1.2 asks for four things from an app with
 * user-generated content: a filter, a way to report, a way to block abusive
 * users, and published contact information — plus action on reports within
 * 24 hours. As of February 2026 Apple states explicitly that apps with random
 * or anonymous chat are subject to it, which is exactly what pods are.
 *
 * The automatic classifier in `moderation.ts` is the filter. This module is
 * the report path, and it is deliberately not a second classifier: reports go
 * to a human queue and an email, and cost nothing per report. Blocking lives
 * on the client and in `pods.ts`, because it is a per-viewer preference rather
 * than a judgement about the message.
 *
 * The 24-hour obligation is the hard part for a one-person team asleep at 3am,
 * so reports also act on their own: two different people reporting the same
 * message hides it pending review. One report cannot, because in an anonymous
 * room a single malicious member would otherwise be able to silence anyone.
 */
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './admin';
import { paths } from './config';
import { MODERATION_ALERT_PASSWORD } from './secrets';

/** Distinct reporters needed before a message is hidden pending review. */
export const AUTO_HIDE_AT_REPORTS = 2;

/**
 * The mailbox that receives moderation alerts, and sends them.
 *
 * Both ends are the same address: `MODERATION_ALERT_PASSWORD` is this account's
 * Gmail app password, so it authenticates as itself to mail itself. It must
 * match `SUPPORT_EMAIL` in `app/legal.ts` and the address published on the
 * pages in `public/`, or the app tells users to write somewhere nobody reads.
 */
const ALERT_ADDRESS = 'support.softfocus@gmail.com';

/** Report reasons offered in the app. Anything else is rejected. */
const REASONS = [
  'harassment',
  'hate',
  'sexual',
  'self_harm',
  'spam',
  'personal_info',
  'other',
] as const;

export type ReportReason = (typeof REASONS)[number];

const REASON_LABELS: Record<ReportReason, string> = {
  harassment: 'Harassment or bullying',
  hate: 'Hate speech',
  sexual: 'Sexual content',
  self_harm: 'Encouraging self-harm',
  spam: 'Spam or advertising',
  personal_info: 'Sharing personal information',
  other: 'Something else',
};

interface ReportRequest {
  podId?: string;
  messageId?: string;
  reason?: string;
  note?: string;
}

interface ReportResult {
  ok: true;
  /** True when this report pushed the message over the auto-hide threshold. */
  hidden: boolean;
}

export const reportPodMessage = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: true,
    memory: '256MiB',
    timeoutSeconds: 30,
    maxInstances: 10,
  },
  async (request: CallableRequest<ReportRequest>): Promise<ReportResult> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    if (!request.app) {
      throw new HttpsError('failed-precondition', 'This app build could not be verified.');
    }

    const podId = String(request.data?.podId ?? '').trim();
    const messageId = String(request.data?.messageId ?? '').trim();
    const rawReason = String(request.data?.reason ?? '').trim();
    // Free text is a prompt-injection and abuse surface, and nobody needs an
    // essay to report a message. Hard cap and no formatting.
    const note = String(request.data?.note ?? '').trim().slice(0, 300);

    if (!podId || !messageId) {
      throw new HttpsError('invalid-argument', 'podId and messageId are required.');
    }
    if (!REASONS.includes(rawReason as ReportReason)) {
      throw new HttpsError('invalid-argument', 'Unknown report reason.');
    }
    const reason = rawReason as ReportReason;

    /**
     * Only members of the room may report inside it.
     *
     * Reporting is not Pro-gated: a subscription that lapsed mid-pod must not
     * strip someone of the ability to report what is being said to them.
     */
    const member = await db.doc(paths.podMember(podId, uid)).get();
    if (!member.exists) {
      throw new HttpsError('permission-denied', 'You are not in this pod.');
    }

    const messageRef = db.doc(`${paths.podMessages(podId)}/${messageId}`);
    // Doc id is the reporter's uid, so re-reporting is idempotent for free.
    const reportRef = messageRef.collection('reports').doc(uid);

    const outcome = await db.runTransaction(async (tx) => {
      const [message, existing] = await Promise.all([tx.get(messageRef), tx.get(reportRef)]);

      if (!message.exists) {
        throw new HttpsError('not-found', 'That message is no longer here.');
      }
      const data = message.data() ?? {};

      if (data.uid === uid) {
        throw new HttpsError('invalid-argument', 'You cannot report your own message.');
      }

      // Already reported by this person: accept it silently rather than
      // erroring, so a double-tap does not look like a failure.
      if (existing.exists) {
        return { count: (data.reportCount as number) ?? 1, alreadyReported: true, text: '', authorUid: null };
      }

      const count = ((data.reportCount as number) ?? 0) + 1;

      tx.set(reportRef, {
        reporterUid: uid,
        reason,
        note: note || null,
        createdAt: FieldValue.serverTimestamp(),
      });

      const update: Record<string, unknown> = { reportCount: count };
      if (count >= AUTO_HIDE_AT_REPORTS && data.hidden !== true) {
        // Hide, but do not destroy the text: a moderator needs to see what was
        // actually said, and `moderationFlags` below keeps its own copy.
        update.hidden = true;
        update['moderation.status'] = 'reported_hidden';
        update.hiddenByReportsAt = FieldValue.serverTimestamp();
      }
      tx.update(messageRef, update);

      return {
        count,
        alreadyReported: false,
        text: String(data.text ?? ''),
        authorUid: (data.uid as string | null) ?? null,
      };
    });

    if (outcome.alreadyReported) {
      return { ok: true, hidden: outcome.count >= AUTO_HIDE_AT_REPORTS };
    }

    const hidden = outcome.count >= AUTO_HIDE_AT_REPORTS;

    /**
     * The human queue.
     *
     * Deterministic id so the same message reported by several people lands as
     * one review item rather than a pile, while the per-reporter records above
     * keep the count honest.
     */
    await db
      .collection(paths.moderationFlags)
      .doc(`report_${podId}_${messageId}`)
      .set(
        {
          podId,
          messageId,
          uid: outcome.authorUid,
          text: outcome.text,
          category: `user_report:${reason}`,
          source: 'user_report',
          reportCount: outcome.count,
          reasons: FieldValue.arrayUnion(reason),
          // `notes` is omitted rather than set to an empty union: the Admin SDK
          // rejects `arrayUnion()` with no arguments, which would have thrown
          // here on every report that carried no note — i.e. almost all of
          // them — losing the review queue entry and the alert email after the
          // message had already been reported.
          ...(note ? { notes: FieldValue.arrayUnion(note) } : {}),
          action: hidden ? 'auto_hidden' : 'awaiting_review',
          reviewed: false,
          reviewedBy: null,
          // Only on the first report. Re-stamping it on every merge would turn
          // "first reported at" into "last reported at", and the first is the
          // one the 24-hour review clock runs from.
          ...(outcome.count === 1 ? { createdAt: FieldValue.serverTimestamp() } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    logger.info('Pod message reported', { podId, messageId, reason, count: outcome.count, hidden });
    return { ok: true, hidden };
  },
);

/* ------------------------------------------------------------------ *
 * The alert
 * ------------------------------------------------------------------ */

/**
 * Email a flag the moment it is raised.
 *
 * Without this, "we act within 24 hours" depends on somebody remembering to
 * open the Firebase console. Sent over Gmail SMTP because it needs no domain,
 * no third-party account, and costs nothing — the volume here is a handful of
 * messages a week, far inside Gmail's sending limits.
 *
 * Failure is logged, never thrown: a bounced alert must not retry the trigger
 * and must never affect the report itself, which is already safely recorded.
 */
export const alertOnModerationFlag = onDocumentCreated(
  {
    document: 'moderationFlags/{flagId}',
    region: 'us-central1',
    secrets: [MODERATION_ALERT_PASSWORD],
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 5,
    retry: false,
  },
  async (event) => {
    const flag = event.data?.data();
    if (!flag) return;

    const flagId = event.params.flagId;
    const category = String(flag.category ?? 'unknown');
    const source = String(flag.source ?? 'classifier');

    /**
     * Distress flags are not moderation.
     *
     * `moderation.ts` writes a flag when it offers someone crisis resources.
     * That is a record, not a queue item — nobody should be emailed to go and
     * read what a person in difficulty wrote about themselves.
     */
    if (category === 'dangerous_or_self_harm') {
      logger.info('Distress flag recorded; no alert sent by design', { flagId });
      return;
    }

    const password = MODERATION_ALERT_PASSWORD.value();
    if (!password) {
      logger.error('Moderation flag raised but no alert password is configured', { flagId });
      return;
    }

    const reasonLabel = source === 'user_report'
      ? (REASON_LABELS[String(flag.reasons?.[0] ?? 'other') as ReportReason] ?? 'Reported')
      : 'Automatic filter';

    const lines = [
      `A pod message needs review.`,
      ``,
      `Flag:     ${flagId}`,
      `Source:   ${source === 'user_report' ? 'Reported by members' : 'Automatic filter'}`,
      `Reason:   ${reasonLabel}`,
      `Reports:  ${flag.reportCount ?? 1}`,
      `Action:   ${flag.action ?? 'awaiting_review'}`,
      `Pod:      ${flag.podId ?? '—'}`,
      `Message:  ${flag.messageId ?? '—'}`,
      ``,
      `Text:`,
      String(flag.text ?? '').slice(0, 1000) || '(empty)',
      ``,
      flag.notes?.length ? `Notes: ${flag.notes.join(' | ')}` : '',
      ``,
      `Review at:`,
      `https://console.firebase.google.com/project/soft-focus-app/firestore/data/~2FmoderationFlags~2F${flagId}`,
      ``,
      `Apple expects objectionable content to be actioned within 24 hours.`,
    ].filter((l) => l !== undefined);

    try {
      // Imported lazily so the module is only loaded in the one function that
      // needs it, rather than on every cold start of every function.
      const nodemailer = await import('nodemailer');
      const transport = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: ALERT_ADDRESS, pass: password },
      });

      await transport.sendMail({
        from: `Soft Focus moderation <${ALERT_ADDRESS}>`,
        to: ALERT_ADDRESS,
        subject: `[Soft Focus] ${flag.action === 'auto_hidden' ? 'Auto-hidden' : 'Review'}: ${reasonLabel}`,
        text: lines.join('\n'),
      });

      logger.info('Moderation alert sent', { flagId });
    } catch (err) {
      logger.error('Could not send the moderation alert', { flagId, err });
    }
  },
);
