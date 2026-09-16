/**
 * Account deletion.
 *
 * Required by App Store Review Guideline 5.1.1(v) and by Google Play's account
 * deletion policy, both of which want deletion initiated from inside the app.
 * It runs server-side because the client cannot be trusted to finish the job
 * and because `recursiveDelete` and `deleteUser` are Admin-SDK only.
 *
 * The one deliberate exception to "delete everything" is moderation evidence.
 * Pods are anonymous rooms; if deleting your account also erased the record of
 * what you posted, deletion would become the exit route for anyone who wanted
 * to harass a room and vanish. So a reported or flagged message's record
 * survives, and the message itself is tombstoned rather than removed — the
 * room keeps its shape, and a human reviewing a report still has something to
 * review. This is disclosed in the privacy policy and on the deletion page,
 * which is what makes it a legitimate interest rather than a broken promise.
 */
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, db } from './admin';
import { paths } from './config';

/**
 * Pod messages rewritten per run.
 *
 * A user cannot be in many pods at once, and pods are capped, so this is a
 * generous ceiling rather than a real constraint — it exists so a corrupted
 * membership record cannot turn deletion into a timeout.
 */
const MAX_MESSAGES_TO_TOMBSTONE = 500;

interface DeleteResult {
  deleted: true;
  /** Pod messages tombstoned rather than removed. */
  tombstoned: number;
}

export const deleteAccount = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: true,
    memory: '512MiB',
    // recursiveDelete on a heavy account is the slow part; be generous, since
    // a half-finished deletion is much worse than a slow one.
    timeoutSeconds: 300,
    maxInstances: 5,
  },
  async (request: CallableRequest<void>): Promise<DeleteResult> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    if (!request.app) {
      throw new HttpsError('failed-precondition', 'This app build could not be verified.');
    }

    logger.info('Account deletion requested', { uid });

    let tombstoned = 0;

    /* ---- 1. Leave every pod, and tombstone what was said there ---- */
    try {
      const memberships = await db.collectionGroup('members').where('uid', '==', uid).get();

      for (const member of memberships.docs) {
        const podRef = member.ref.parent.parent;
        if (!podRef) continue;

        /**
         * Same accounting as `leavePod`, then remove the record entirely.
         *
         * `leavePod` only marks a member inactive, so the seat is released
         * exactly once. Decrementing unconditionally here would double-count
         * anyone who had already left a room and leave it permanently showing
         * fewer members than it has.
         */
        await db
          .runTransaction(async (tx) => {
            const [pod, fresh] = await Promise.all([tx.get(podRef), tx.get(member.ref)]);
            if (!fresh.exists) return;

            const wasActive = fresh.data()?.active === true;
            const alias = (fresh.data()?.alias as string) ?? null;

            if (pod.exists && wasActive) {
              const remaining = Math.max(0, ((pod.data()?.memberCount as number) ?? 1) - 1);
              tx.update(podRef, {
                memberCount: remaining,
                ...(alias ? { aliasesUsed: FieldValue.arrayRemove(alias) } : {}),
                isActive: remaining > 0,
                updatedAt: FieldValue.serverTimestamp(),
              });
            }

            // The membership record carries the uid, so it cannot survive.
            tx.delete(member.ref);
          })
          .catch((err) => logger.warn('Could not leave pod during deletion', { uid, err }));

        if (tombstoned >= MAX_MESSAGES_TO_TOMBSTONE) continue;

        const mine = await db
          .collection(paths.podMessages(podRef.id))
          .where('uid', '==', uid)
          .limit(MAX_MESSAGES_TO_TOMBSTONE - tombstoned)
          .get();

        if (mine.empty) continue;

        const batch = db.batch();
        for (const message of mine.docs) {
          batch.update(message.ref, {
            // The text goes; the document stays, so the conversation does not
            // develop holes and a moderator can still see that something was
            // here. `moderationFlags` keeps the original where one was raised.
            text: '',
            uid: null,
            hidden: true,
            'moderation.status': 'author_deleted',
            authorDeletedAt: FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
        tombstoned += mine.size;
      }
    } catch (err) {
      // Never block deletion on the pod cleanup. The user asked to be deleted;
      // an orphaned seat in a room that expires within 7 days is a far smaller
      // problem than refusing them.
      logger.error('Pod cleanup failed during deletion, continuing', { uid, err });
    }

    /* ---- 2. Everything under users/{uid} ---- */
    try {
      await db.recursiveDelete(db.doc(paths.user(uid)));
    } catch (err) {
      logger.error('recursiveDelete failed', { uid, err });
      throw new HttpsError('internal', 'Could not delete your data. Please try again.');
    }

    /* ---- 3. The login itself ---- */
    try {
      await adminAuth.deleteUser(uid);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      // Already gone is a success, not a failure — this runs on retry paths.
      if (code !== 'auth/user-not-found') {
        logger.error('deleteUser failed', { uid, err });
        throw new HttpsError('internal', 'Could not remove your login. Please contact support.');
      }
    }

    logger.info('Account deleted', { uid, tombstoned });
    return { deleted: true, tombstoned };
  },
);
