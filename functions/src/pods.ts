/**
 * Community Pods — matchmaking.
 *
 * Joining and leaving are server-only. Clients can read pods and write
 * messages (under rules), but they can never mint a pod, change a member
 * count, or add themselves to a room — otherwise a modified build could sit in
 * every pod at once.
 *
 * Matchmaking is intentionally the simplest thing that works: find an open
 * room on the same topic, else open one. Fullest-first, so rooms reach the
 * three-person floor where they actually feel like company rather than
 * scattering everyone into empty rooms.
 */
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from './admin';
import {
  POD_ALIASES,
  POD_DURATIONS,
  POD_MAX_MEMBERS,
  POD_SUPPORT_STYLES,
  POD_TOPICS,
  paths,
  type PodDuration,
} from './config';
import { requireProCaller } from './entitlements';
import { getFlags } from './flags';

interface JoinRequest {
  topic?: string;
  supportStyle?: string;
  duration?: string;
}

export interface JoinResult {
  podId: string;
  alias: string;
  topic: string;
  supportStyle: string;
  duration: PodDuration;
  memberCount: number;
  expiresAt: string;
  /** True when this call opened a brand-new room. */
  created: boolean;
}

function validate(data: JoinRequest) {
  const topic = String(data.topic ?? '').trim();
  const supportStyle = String(data.supportStyle ?? '').trim();
  const duration = String(data.duration ?? '') as PodDuration;

  if (!(POD_TOPICS as readonly string[]).includes(topic)) {
    throw new HttpsError('invalid-argument', 'Unknown pod topic.');
  }
  if (!(POD_SUPPORT_STYLES as readonly string[]).includes(supportStyle)) {
    throw new HttpsError('invalid-argument', 'Unknown support style.');
  }
  if (!(duration in POD_DURATIONS)) {
    throw new HttpsError('invalid-argument', 'Pods run for 24h or 7d.');
  }
  return { topic, supportStyle, duration };
}

/** The room a user is already in, if any. Cheap: one collection-group read. */
async function findCurrentPod(uid: string): Promise<{ podId: string; alias: string } | null> {
  const snap = await db.collectionGroup('members').where('uid', '==', uid).where('active', '==', true).limit(5).get();

  for (const doc of snap.docs) {
    const podRef = doc.ref.parent.parent;
    if (!podRef) continue;
    const pod = await podRef.get();
    const data = pod.data();
    if (!pod.exists || data?.isActive !== true) continue;
    const expiresAt: Timestamp | undefined = data.expiresAt;
    if (expiresAt && expiresAt.toMillis() <= Date.now()) continue;
    return { podId: pod.id, alias: (doc.data().alias as string) ?? 'Someone' };
  }
  return null;
}

/**
 * Everyone this user has blocked.
 *
 * Blocking is written by the client into its own private subcollection, so
 * this is the server's only view of it. Kept small deliberately: the cap is a
 * bound on the work `hasBlockedMember` does per candidate room, and someone
 * who has blocked 200 people has a problem that matchmaking cannot solve.
 */
async function readBlockedUids(uid: string): Promise<Set<string>> {
  try {
    const snap = await db.collection(paths.userBlocks(uid)).select().limit(200).get();
    return new Set(snap.docs.map((d) => d.id));
  } catch (err) {
    // Fail open: never stop someone joining a room because we could not read
    // a preference. The client filters blocked messages regardless, so the
    // worst case is that they share a room with someone they cannot see.
    logger.warn('Could not read block list', { uid, err });
    return new Set();
  }
}

/** True when any active member of `podId` is in `blocked`. */
async function hasBlockedMember(podId: string, blocked: Set<string>): Promise<boolean> {
  if (blocked.size === 0) return false;
  const members = await db
    .collection(paths.podMembers(podId))
    .where('active', '==', true)
    .limit(POD_MAX_MEMBERS)
    .get();
  return members.docs.some((m) => blocked.has((m.data().uid as string) ?? m.id));
}

function pickAlias(taken: string[]): string {
  const free = POD_ALIASES.find((a) => !taken.includes(a));
  // With a five-person ceiling and ten aliases this cannot realistically run
  // out, but a stable fallback beats an exception if it ever does.
  return free ?? `Guest ${taken.length + 1}`;
}

export const joinPod = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: true,
    memory: '256MiB',
    timeoutSeconds: 30,
    maxInstances: 20,
  },
  async (request: CallableRequest<JoinRequest>): Promise<JoinResult> => {
    const { uid } = await requireProCaller(request);

    const flags = await getFlags();
    if (!flags.podsEnabled) {
      throw new HttpsError('unavailable', flags.reason ?? 'Pods are paused right now. Try again shortly.');
    }

    const { topic, supportStyle, duration } = validate(request.data ?? {});

    // Already in a room: hand it straight back rather than shuffling them.
    const current = await findCurrentPod(uid);
    if (current) {
      const pod = await db.doc(paths.pod(current.podId)).get();
      const data = pod.data()!;
      return {
        podId: current.podId,
        alias: current.alias,
        topic: data.topic,
        supportStyle: data.supportStyle,
        duration: data.duration,
        memberCount: data.memberCount ?? 1,
        expiresAt: (data.expiresAt as Timestamp).toDate().toISOString(),
        created: false,
      };
    }

    const now = Timestamp.now();

    // Fullest-first among rooms that still have a seat.
    const candidates = await db
      .collection(paths.pods)
      .where('isActive', '==', true)
      .where('topic', '==', topic)
      .where('duration', '==', duration)
      .where('memberCount', '<', POD_MAX_MEMBERS)
      .orderBy('memberCount', 'desc')
      .limit(10)
      .get();

    /**
     * Rooms containing someone this user blocked are skipped entirely.
     *
     * Blocking hides messages on the client, but being repeatedly matched into
     * a room with someone you blocked is its own kind of harm — and Apple 1.2
     * asks for the ability to block abusive users, not merely to mute them.
     * Read once, outside the loop, and only when there is anything to check.
     */
    const blocked = await readBlockedUids(uid);

    for (const candidate of candidates.docs) {
      const data = candidate.data();
      if ((data.expiresAt as Timestamp)?.toMillis() <= now.toMillis()) continue;

      if (await hasBlockedMember(candidate.id, blocked)) {
        logger.info('Skipping pod containing a blocked member', { uid, podId: candidate.id });
        continue;
      }

      try {
        const joined = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(candidate.ref);
          const pod = fresh.data();
          // Re-check inside the transaction: two people can race the last seat.
          if (!fresh.exists || pod?.isActive !== true) return null;
          if ((pod.memberCount ?? 0) >= POD_MAX_MEMBERS) return null;
          if ((pod.expiresAt as Timestamp).toMillis() <= Date.now()) return null;

          const alias = pickAlias((pod.aliasesUsed as string[]) ?? []);

          tx.set(db.doc(paths.podMember(fresh.id, uid)), {
            uid,
            alias,
            active: true,
            joinedAt: FieldValue.serverTimestamp(),
            expiresAt: pod.expiresAt,
          });
          tx.update(candidate.ref, {
            memberCount: FieldValue.increment(1),
            aliasesUsed: FieldValue.arrayUnion(alias),
            updatedAt: FieldValue.serverTimestamp(),
          });
          tx.set(db.collection(paths.podMessages(fresh.id)).doc(), {
            type: 'system',
            text: `${alias} joined.`,
            createdAt: FieldValue.serverTimestamp(),
            expiresAt: pod.expiresAt,
            moderation: { status: 'skipped' },
          });

          return {
            alias,
            memberCount: (pod.memberCount ?? 0) + 1,
            expiresAt: (pod.expiresAt as Timestamp).toDate().toISOString(),
            topic: pod.topic as string,
            supportStyle: pod.supportStyle as string,
            duration: pod.duration as PodDuration,
          };
        });

        if (joined) {
          logger.info('Joined existing pod', { uid, podId: candidate.id, memberCount: joined.memberCount });
          return { podId: candidate.id, created: false, ...joined };
        }
      } catch (err) {
        logger.warn('Pod join transaction failed, trying next candidate', { podId: candidate.id, err });
      }
    }

    // Nothing open — open a room.
    const expiresAt = Timestamp.fromMillis(Date.now() + POD_DURATIONS[duration]);
    const alias = POD_ALIASES[0];
    const podRef = db.collection(paths.pods).doc();

    const batch = db.batch();
    batch.set(podRef, {
      topic,
      supportStyle,
      duration,
      memberCount: 1,
      aliasesUsed: [alias],
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt,
    });
    batch.set(db.doc(paths.podMember(podRef.id, uid)), {
      uid,
      alias,
      active: true,
      joinedAt: FieldValue.serverTimestamp(),
      expiresAt,
    });
    batch.set(db.collection(paths.podMessages(podRef.id)).doc(), {
      type: 'system',
      text: 'This pod is open. Be kind — everyone here is anonymous, and it closes on its own.',
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
      moderation: { status: 'skipped' },
    });
    await batch.commit();

    logger.info('Created pod', { uid, podId: podRef.id, topic, duration });
    return {
      podId: podRef.id,
      alias,
      topic,
      supportStyle,
      duration,
      memberCount: 1,
      expiresAt: expiresAt.toDate().toISOString(),
      created: true,
    };
  },
);

export const leavePod = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: true,
    memory: '256MiB',
    timeoutSeconds: 30,
    maxInstances: 10,
  },
  async (request: CallableRequest<{ podId?: string }>): Promise<{ ok: true }> => {
    // Leaving is not a paid action — a lapsed subscriber must still be able to
    // get out of a room, so this checks auth and App Check but not Pro.
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    if (!request.app) throw new HttpsError('failed-precondition', 'This app build could not be verified.');

    const podId = String(request.data?.podId ?? '').trim();
    if (!podId) throw new HttpsError('invalid-argument', 'podId is required.');

    const podRef = db.doc(paths.pod(podId));
    const memberRef = db.doc(paths.podMember(podId, uid));

    await db.runTransaction(async (tx) => {
      const [pod, member] = await Promise.all([tx.get(podRef), tx.get(memberRef)]);
      if (!member.exists || member.data()?.active !== true) return;

      const alias = (member.data()?.alias as string) ?? 'Someone';
      const remaining = Math.max(0, ((pod.data()?.memberCount as number) ?? 1) - 1);

      tx.update(memberRef, { active: false, leftAt: FieldValue.serverTimestamp() });
      tx.update(podRef, {
        memberCount: remaining,
        aliasesUsed: FieldValue.arrayRemove(alias),
        // An empty room stops taking joins; TTL sweeps the document itself.
        isActive: remaining > 0,
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (remaining > 0) {
        tx.set(db.collection(paths.podMessages(podId)).doc(), {
          type: 'system',
          text: `${alias} left.`,
          createdAt: FieldValue.serverTimestamp(),
          expiresAt: pod.data()?.expiresAt ?? null,
          moderation: { status: 'skipped' },
        });
      }
    });

    logger.info('Left pod', { uid, podId });
    return { ok: true };
  },
);
