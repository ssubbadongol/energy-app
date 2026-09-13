/**
 * Pod safety moderation.
 *
 * Fires on every new pod message. The classification call is a Gemini request
 * with `BLOCK_LOW_AND_ABOVE` thresholds and a one-token output budget — we
 * want the ratings the API attaches to the prompt, not a reply.
 *
 * The policy is deliberately asymmetric, because the two things being caught
 * are not the same problem:
 *
 *   Distress (dangerous content / self-harm, HIGH)
 *     The message STAYS in the pod. Someone saying they are struggling is the
 *     entire point of a peer-support room, and deleting it would punish them
 *     for reaching out. Instead the sender — and only the sender — is offered
 *     crisis resources, and the message is flagged for a human to look at.
 *
 *   Abuse (harassment / hate, HIGH)
 *     The text is redacted from the room and flagged. The original is kept in
 *     `moderationFlags` for review, never deleted outright.
 *
 * Note on categories: the Gemini API has no separate self-harm category —
 * self-harm and suicidal content are scored under HARM_CATEGORY_DANGEROUS_CONTENT.
 * That is why DANGEROUS_CONTENT drives the support path rather than the
 * removal path.
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './admin';
import { paths } from './config';
import { getFlags } from './flags';
import { classifyText, GeminiError, type HarmProbability, type SafetyRating } from './gemini';
import { GEMINI_API_KEY } from './secrets';

type ModerationStatus = 'ok' | 'support_offered' | 'redacted' | 'skipped' | 'error';

const ORDER: Record<HarmProbability, number> = {
  NEGLIGIBLE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

/** Highest probability seen for each category across prompt and output. */
function mergeRatings(...groups: SafetyRating[][]): Record<string, HarmProbability> {
  const worst: Record<string, HarmProbability> = {};
  for (const group of groups) {
    for (const r of group) {
      const current = worst[r.category];
      if (!current || ORDER[r.probability] > ORDER[current]) {
        worst[r.category] = r.probability;
      }
    }
  }
  return worst;
}

export const moderatePodMessage = onDocumentCreated(
  {
    document: 'pods/{podId}/messages/{messageId}',
    region: 'us-central1',
    secrets: [GEMINI_API_KEY],
    memory: '256MiB',
    timeoutSeconds: 30,
    // Bounded so a burst of messages cannot fan out into unbounded API spend.
    maxInstances: 10,
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { podId, messageId } = event.params;
    const data = snap.data();

    // System notices are ours; nothing to check.
    if (data.type !== 'user') return;

    const text = String(data.text ?? '').trim();
    const uid = String(data.uid ?? '');
    if (!text || !uid) return;

    // Clients are not allowed to set `expiresAt` (they would be able to
    // outlive the room), so the message inherits the pod's expiry here. This
    // is what the Firestore TTL policy on the `messages` collection group
    // reads.
    const podSnap = await db.doc(paths.pod(podId)).get();
    const expiresAt = podSnap.data()?.expiresAt ?? null;

    const finish = async (status: ModerationStatus, extra: Record<string, unknown> = {}) => {
      await snap.ref.update({
        expiresAt,
        moderation: { status, checkedAt: FieldValue.serverTimestamp(), ...extra },
      });
    };

    // Kill switch: deliver the message rather than blocking the room. A pod
    // going unmoderated for a few hours is a smaller harm than a pod going
    // silent, and the flag is only ever set by a billing emergency.
    const flags = await getFlags();
    if (!flags.podModerationEnabled) {
      logger.warn('Pod moderation skipped — kill switch is engaged', { podId, messageId });
      await finish('skipped', { reason: 'moderation_disabled' });
      return;
    }

    let ratings: Record<string, HarmProbability>;
    try {
      const result = await classifyText(GEMINI_API_KEY.value(), text);
      ratings = mergeRatings(result.promptSafetyRatings, result.safetyRatings);

      // A prompt blocked outright returns no ratings for the tripped category
      // in some responses; treat the block reason itself as a HIGH signal so
      // we never mark blocked content as clean.
      if (result.promptBlockReason === 'SAFETY' && Object.keys(ratings).length === 0) {
        ratings = { HARM_CATEGORY_DANGEROUS_CONTENT: 'HIGH' };
      }
    } catch (err) {
      // Fail open on delivery, but record it. Swallowing the message on an API
      // hiccup would make the room feel broken for no safety benefit.
      const message = err instanceof GeminiError ? err.message : String(err);
      logger.error('Safety classification failed', { podId, messageId, message });
      await finish('error', { reason: 'classifier_unavailable' });
      return;
    }

    const dangerous = ratings.HARM_CATEGORY_DANGEROUS_CONTENT === 'HIGH';
    const abusive =
      ratings.HARM_CATEGORY_HARASSMENT === 'HIGH' || ratings.HARM_CATEGORY_HATE_SPEECH === 'HIGH';

    if (!dangerous && !abusive) {
      await finish('ok', { ratings });
      return;
    }

    const category = dangerous ? 'dangerous_or_self_harm' : 'harassment_or_hate';

    // Flag for human review in both cases. The original text lives here and
    // nowhere else the room can reach.
    const flagRef = await db.collection(paths.moderationFlags).add({
      podId,
      messageId,
      uid,
      alias: data.alias ?? null,
      text,
      category,
      ratings,
      action: dangerous ? 'support_offered' : 'redacted',
      reviewed: false,
      reviewedBy: null,
      createdAt: FieldValue.serverTimestamp(),
    });

    if (dangerous) {
      // The message stays exactly as written. Offer the sender support.
      await db.collection(paths.supportPrompts(uid)).add({
        podId,
        messageId,
        flagId: flagRef.id,
        reason: 'dangerous_content',
        acknowledgedAt: null,
        createdAt: FieldValue.serverTimestamp(),
      });
      await finish('support_offered', { ratings, flagId: flagRef.id });
      logger.info('Support offered on pod message', { podId, messageId, flagId: flagRef.id });
      return;
    }

    // Abuse: redact in place, leaving a visible marker rather than a hole.
    await snap.ref.update({
      text: '',
      hidden: true,
      expiresAt,
      moderation: {
        status: 'redacted' satisfies ModerationStatus,
        checkedAt: FieldValue.serverTimestamp(),
        ratings,
        flagId: flagRef.id,
      },
    });
    logger.info('Pod message redacted', { podId, messageId, flagId: flagRef.id });
  },
);
