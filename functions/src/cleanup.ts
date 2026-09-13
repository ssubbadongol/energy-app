/**
 * Expired-pod sweeper.
 *
 * Firestore TTL is the primary mechanism for making pods ephemeral, but it has
 * two properties that need covering:
 *
 *   - Deletion is best-effort within 24h of the expiry, not at it.
 *   - Deleting a document does NOT delete its subcollections, so a swept pod
 *     would otherwise leave its messages orphaned and undeletable.
 *
 * So: TTL is the safety net, and this job is the thing that actually closes
 * rooms on time and removes their contents. It runs hourly and is cheap —
 * it only touches pods that have already expired.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from './admin';
import { paths } from './config';

/** Pods closed per run. Keeps a backlog from blowing the timeout. */
const MAX_PODS_PER_RUN = 200;

export const sweepExpiredPods = onSchedule(
  {
    schedule: 'every 1 hours',
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 300,
    maxInstances: 1,
  },
  async () => {
    const now = Timestamp.now();
    const expired = await db
      .collection(paths.pods)
      .where('expiresAt', '<=', now)
      .limit(MAX_PODS_PER_RUN)
      .get();

    if (expired.empty) {
      logger.debug('No expired pods to sweep');
      return;
    }

    let closed = 0;
    for (const pod of expired.docs) {
      try {
        // recursiveDelete handles the messages and members subcollections that
        // a plain delete (and TTL) would leave behind.
        await db.recursiveDelete(pod.ref);
        closed++;
      } catch (err) {
        logger.error('Failed to sweep pod', { podId: pod.id, err });
      }
    }

    logger.info('Swept expired pods', { found: expired.size, closed });
  },
);

/**
 * Trims mentor history so a heavy user's conversation cannot grow without
 * bound. Only the turns we would ever replay plus a generous margin are kept,
 * which also caps what a future export or breach could expose.
 */
const MENTOR_HISTORY_KEEP = 200;

export const trimMentorHistory = onSchedule(
  {
    schedule: 'every 24 hours',
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 540,
    maxInstances: 1,
  },
  async () => {
    // Only users who actually used the mentor recently are worth scanning.
    const since = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await db
      .collectionGroup('mentorMessages')
      .where('createdAt', '>=', since)
      .select()
      .limit(5000)
      .get();

    const uids = new Set<string>();
    for (const doc of recent.docs) {
      const uid = doc.ref.parent.parent?.id;
      if (uid) uids.add(uid);
    }

    let trimmed = 0;
    for (const uid of uids) {
      const overflow = await db
        .collection(paths.mentorMessages(uid))
        .orderBy('createdAt', 'desc')
        .offset(MENTOR_HISTORY_KEEP)
        .limit(500)
        .get();

      if (overflow.empty) continue;

      const batch = db.batch();
      overflow.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      trimmed += overflow.size;
    }

    logger.info('Trimmed mentor history', { users: uids.size, deleted: trimmed });
  },
);
