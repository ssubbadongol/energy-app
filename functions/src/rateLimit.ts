/**
 * Per-user rate limiting for paid model calls.
 *
 * Two ceilings, enforced together in one transaction:
 *
 *   daily  bounds the monthly bill — what a single account can cost us
 *   burst  bounds the *rate* — what a single account can do to everyone else
 *
 * The daily cap alone is not enough. Fifty messages can be spent in ten
 * seconds by a retry loop, which trips Gemini's own per-minute quota and makes
 * the app fail for every other user at that moment. The burst window is what
 * stops one client's bad minute becoming everybody's.
 *
 * Both live in one counter document per user, reset by key comparison rather
 * than by a scheduled job, so there is nothing to run and nothing to fall
 * behind. The whole check-and-increment happens inside a transaction, so
 * parallel requests from the same account cannot both slip past.
 *
 * Structurally this is server-only and cannot be moved or faked by a client:
 *
 *   - It runs inside the callable, before Gemini is touched.
 *   - The counter lives at `users/{uid}/counters/mentorDaily`, which
 *     `firestore.rules` marks `allow write: if false` — the owner can read
 *     their own usage but cannot reset it.
 *   - The identity it keys on comes from the verified Firebase token, not
 *     from anything in the request body.
 *   - Minting a fresh anonymous uid does not evade it: the mentor is
 *     Pro-gated, so a new identity needs a new subscription. That is the
 *     property that makes a per-uid limit meaningful here at all.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './admin';
import { MENTOR_BURST_LIMIT, MENTOR_DAILY_LIMIT, paths } from './config';

export interface RateLimitResult {
  allowed: boolean;
  used: number;
  limit: number;
  /** When the window rolls over — used for the friendly limit message. */
  resetsAt: Date;
  /** Which ceiling refused. Only meaningful when `allowed` is false. */
  kind?: 'daily' | 'burst';
}

/** UTC day key. Deliberately not local time: it must be stable server-side. */
function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Fixed bucket index for the burst window.
 *
 * A fixed bucket rather than a true sliding window because it needs no list of
 * timestamps and no second read: two integers in the document the transaction
 * already holds. The known trade is that a user can spend one bucket's
 * allowance at the end of one window and another at the start of the next —
 * twice the limit across a boundary. At six a minute that worst case is twelve
 * in a few seconds, which is still two orders of magnitude below what this
 * exists to stop, and the daily cap sits behind it regardless.
 */
function burstKey(now: Date): number {
  return Math.floor(now.getTime() / MENTOR_BURST_LIMIT.windowMs);
}

function nextUtcMidnight(now: Date): Date {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

function burstWindowEnd(now: Date): Date {
  return new Date((burstKey(now) + 1) * MENTOR_BURST_LIMIT.windowMs);
}

/**
 * Reserve one mentor call for `uid`.
 *
 * Increments only when the call is allowed, so a rejected request does not
 * push the user further past either cap — otherwise a client retrying against
 * the burst limit would extend its own lockout indefinitely.
 */
export async function consumeMentorCall(uid: string, limit = MENTOR_DAILY_LIMIT): Promise<RateLimitResult> {
  const now = new Date();
  const today = dayKey(now);
  const bucket = burstKey(now);
  const ref = db.doc(paths.mentorCounter(uid));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();

    const used = data?.date === today ? ((data.count as number) ?? 0) : 0;
    const burstUsed = data?.burstKey === bucket ? ((data.burstCount as number) ?? 0) : 0;

    // Burst first: it is the cheaper refusal and the more urgent one, and its
    // window clears in under a minute rather than at midnight.
    if (burstUsed >= MENTOR_BURST_LIMIT.messages) {
      return {
        allowed: false,
        used,
        limit,
        resetsAt: burstWindowEnd(now),
        kind: 'burst' as const,
      };
    }

    if (used >= limit) {
      return { allowed: false, used, limit, resetsAt: nextUtcMidnight(now), kind: 'daily' as const };
    }

    tx.set(
      ref,
      {
        date: today,
        count: data?.date === today ? FieldValue.increment(1) : 1,
        burstKey: bucket,
        burstCount: data?.burstKey === bucket ? FieldValue.increment(1) : 1,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return { allowed: true, used: used + 1, limit, resetsAt: nextUtcMidnight(now) };
  });
}

/**
 * Hands a call back when the model never actually ran (e.g. kill switch).
 *
 * Refunds the burst counter too. A call that never reached Gemini consumed no
 * quota and should not hold the user's rate window open.
 */
export async function refundMentorCall(uid: string): Promise<void> {
  const now = new Date();
  const today = dayKey(now);
  const bucket = burstKey(now);
  const ref = db.doc(paths.mentorCounter(uid));

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!data) return;

    const update: Record<string, unknown> = {};
    if (data.date === today && data.count) {
      update.count = Math.max(0, (data.count as number) - 1);
    }
    if (data.burstKey === bucket && data.burstCount) {
      update.burstCount = Math.max(0, (data.burstCount as number) - 1);
    }
    if (Object.keys(update).length > 0) tx.update(ref, update);
  });
}

export async function readMentorUsage(uid: string, limit = MENTOR_DAILY_LIMIT): Promise<RateLimitResult> {
  const now = new Date();
  const snap = await db.doc(paths.mentorCounter(uid)).get();
  const data = snap.data();
  const used = data?.date === dayKey(now) ? ((data.count as number) ?? 0) : 0;
  return { allowed: used < limit, used, limit, resetsAt: nextUtcMidnight(now) };
}
