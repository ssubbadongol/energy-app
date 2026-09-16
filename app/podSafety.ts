/**
 * Reporting and blocking, from the client.
 *
 * Apple 1.2 requires an app with user-generated content to offer a way to
 * report content and a way to block abusive users, and — since February 2026 —
 * says explicitly that anonymous chat is covered by it. Pods are anonymous
 * chat, so this is not optional and it will be tested during review.
 *
 * The two halves are deliberately built differently:
 *
 *   Reporting  goes through a callable. It writes to a server-only queue and
 *              can hide a message for everybody, so it has to be adjudicated
 *              somewhere the client cannot reach.
 *
 *   Blocking   is a direct Firestore write to the user's own private
 *              subcollection. It is a statement about what *you* want to see,
 *              needs no adjudication, and must take effect instantly — a
 *              block that waits on a round trip is a block that fails at the
 *              exact moment someone needs it.
 */
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from '@react-native-firebase/firestore';
import { callable, db, ensureAuth } from './firebase';
import { devLog } from './devLog';
import { track } from './monitoring';

/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

/** Must match `REASONS` in `functions/src/reports.ts`. */
export type ReportReason =
  | 'harassment'
  | 'hate'
  | 'sexual'
  | 'self_harm'
  | 'spam'
  | 'personal_info'
  | 'other';

/** Offered in the report sheet, in this order. */
export const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'harassment', label: 'Harassment or bullying' },
  { key: 'hate', label: 'Hate speech' },
  { key: 'sexual', label: 'Sexual content' },
  { key: 'self_harm', label: 'Encouraging self-harm' },
  { key: 'spam', label: 'Spam or advertising' },
  { key: 'personal_info', label: 'Sharing personal information' },
  { key: 'other', label: 'Something else' },
];

const reportCallable = callable<
  { podId: string; messageId: string; reason: ReportReason; note?: string },
  { ok: true; hidden: boolean }
>('reportPodMessage');

export async function reportPodMessage(
  podId: string,
  messageId: string,
  reason: ReportReason,
  note?: string,
): Promise<{ hidden: boolean }> {
  const result = await reportCallable({ podId, messageId, reason, note });
  track('pod_message_reported', { reason });
  devLog('[pods] Reported message', messageId, reason);
  return { hidden: result.data?.hidden === true };
}

/* ------------------------------------------------------------------ *
 * Blocking
 * ------------------------------------------------------------------ */

export async function blockUser(blockedUid: string): Promise<void> {
  const uid = await ensureAuth();
  if (blockedUid === uid) return;
  // `createdAt` must be exactly `request.time` — the rule pins it so this
  // subcollection cannot become arbitrary client-controlled storage.
  await setDoc(doc(db, 'users', uid, 'blocks', blockedUid), { createdAt: serverTimestamp() });
  devLog('[pods] Blocked', blockedUid);
}

export async function unblockUser(blockedUid: string): Promise<void> {
  const uid = await ensureAuth();
  await deleteDoc(doc(db, 'users', uid, 'blocks', blockedUid));
  devLog('[pods] Unblocked', blockedUid);
}

/**
 * Live view of who this user has blocked.
 *
 * A listener rather than a fetch so a block applies to messages already on
 * screen the moment it is written, without the room having to be reopened.
 */
export function subscribeToBlocks(cb: (blocked: Set<string>) => void): () => void {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;

  ensureAuth()
    .then((uid) => {
      if (cancelled) return;
      unsubscribe = onSnapshot(
        collection(db, 'users', uid, 'blocks'),
        (snap) => cb(new Set(snap.docs.map((d) => d.id))),
        (err) => {
          // Failing closed here would hide the whole room; failing open shows
          // it unfiltered, which is wrong in a different way. An empty set plus
          // a warning is the honest middle: the user can block again.
          console.warn('[pods] Block listener failed', err);
          cb(new Set());
        },
      );
    })
    .catch((err) => console.warn('[pods] Could not subscribe to blocks', err));

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}
