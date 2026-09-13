/**
 * Per-user daily rate limiting for paid model calls.
 *
 * One counter doc per user, reset by date key rather than by a scheduled job
 * so there is nothing to run and nothing to fall behind. The whole check and
 * increment happens in a transaction so parallel requests from the same
 * account cannot both slip past the cap.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './admin';
import { MENTOR_DAILY_LIMIT, paths } from './config';

export interface RateLimitResult {
  allowed: boolean;
  used: number;
  limit: number;
  /** When the window rolls over — used for the friendly limit message. */
  resetsAt: Date;
}

/** UTC day key. Deliberately not local time: it must be stable server-side. */
function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function nextUtcMidnight(now: Date): Date {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

/**
 * Reserve one mentor call for `uid`.
 *
 * Increments only when the call is allowed, so a rejected request does not
 * push the user further past the cap.
 */
export async function consumeMentorCall(uid: string, limit = MENTOR_DAILY_LIMIT): Promise<RateLimitResult> {
  const now = new Date();
  const today = dayKey(now);
  const ref = db.doc(paths.mentorCounter(uid));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    const used = data?.date === today ? (data.count as number) ?? 0 : 0;

    if (used >= limit) {
      return { allowed: false, used, limit, resetsAt: nextUtcMidnight(now) };
    }

    tx.set(
      ref,
      {
        date: today,
        count: data?.date === today ? FieldValue.increment(1) : 1,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return { allowed: true, used: used + 1, limit, resetsAt: nextUtcMidnight(now) };
  });
}

/** Hands a call back when the model never actually ran (e.g. kill switch). */
export async function refundMentorCall(uid: string): Promise<void> {
  const today = dayKey(new Date());
  const ref = db.doc(paths.mentorCounter(uid));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (data?.date !== today || !data?.count) return;
    tx.update(ref, { count: Math.max(0, (data.count as number) - 1) });
  });
}

export async function readMentorUsage(uid: string, limit = MENTOR_DAILY_LIMIT): Promise<RateLimitResult> {
  const now = new Date();
  const snap = await db.doc(paths.mentorCounter(uid)).get();
  const data = snap.data();
  const used = data?.date === dayKey(now) ? (data.count as number) ?? 0 : 0;
  return { allowed: used < limit, used, limit, resetsAt: nextUtcMidnight(now) };
}
