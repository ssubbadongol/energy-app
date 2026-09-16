/**
 * Community Pods — client.
 *
 * Split by trust: joining and leaving go through Cloud Functions (a client
 * must never be able to mint a room or add itself to one), while reading and
 * posting go straight to Firestore so the room feels live.
 *
 * Posting directly is safe because the rules pin the message shape exactly —
 * the author's own uid, the alias matchmaking gave them, `moderation.status`
 * of `pending`, and nothing else. The moderation trigger takes it from there.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from '@react-native-firebase/firestore';
import { callable, callableErrorCode, db, ensureAuth } from './firebase';
import { subscribeToBlocks } from './podSafety';

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type PodDuration = '24h' | '7d';

export const POD_TOPICS = [
  'Getting started',
  'Quiet co-study',
  'Executive dysfunction',
  'Anxiety spiral',
  'Sensory reset',
  'Late-night work',
] as const;

export const POD_SUPPORT_STYLES = ['Listening', 'Practical', 'Body doubling'] as const;

export const POD_MAX_MEMBERS = 5;

/** Remembers which room this device is in, so resuming costs two reads. */
const CURRENT_POD_KEY = '@sf_current_pod';

export interface Pod {
  id: string;
  topic: string;
  supportStyle: string;
  duration: PodDuration;
  memberCount: number;
  expiresAt: Date | null;
  isActive: boolean;
}

export interface PodMessage {
  id: string;
  type: 'user' | 'system';
  text: string;
  uid: string | null;
  alias: string | null;
  hidden: boolean;
  /** 'pending' until the safety check finishes; 'redacted' if it was removed. */
  moderationStatus: string;
  createdAt: Date | null;
  /** True when this message was written by the person reading it. */
  mine: boolean;
}

export interface Membership {
  podId: string;
  alias: string;
  topic: string;
  supportStyle: string;
  duration: PodDuration;
  memberCount: number;
  expiresAt: string;
  created: boolean;
}

export type PodBlockReason = 'needs_pro' | 'unverified_build' | 'signed_out' | 'paused' | 'unknown';

export class PodUnavailable extends Error {
  constructor(readonly reason: PodBlockReason, message: string) {
    super(message);
    this.name = 'PodUnavailable';
  }
}

function toPodError(err: unknown): PodUnavailable {
  const code = callableErrorCode(err);
  const message = (err as Error)?.message ?? 'Something went wrong.';
  switch (code) {
    case 'permission-denied':
      return new PodUnavailable('needs_pro', 'Pods are part of Soft Focus Pro.');
    case 'failed-precondition':
      return new PodUnavailable('unverified_build', 'This app build could not be verified.');
    case 'unauthenticated':
      return new PodUnavailable('signed_out', 'Sign in again to join a pod.');
    case 'unavailable':
      return new PodUnavailable('paused', message);
    default:
      console.warn('[pods] Unexpected failure', err);
      return new PodUnavailable('unknown', 'Could not reach the pods right now.');
  }
}

/* ------------------------------------------------------------------ *
 * Browsing
 * ------------------------------------------------------------------ */

/**
 * Rooms with a free seat.
 *
 * Expiry and seat count are filtered here rather than in the query so the
 * whole list needs one composite index instead of several, and so a pod that
 * expires between the read and the render still disappears.
 */
export async function listOpenPods(max = 30): Promise<Pod[]> {
  const q = query(
    collection(db, 'pods'),
    where('isActive', '==', true),
    orderBy('expiresAt', 'asc'),
    fsLimit(max * 2),
  );

  const snap = await getDocs(q);
  const now = Date.now();

  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        topic: data.topic ?? 'Pod',
        supportStyle: data.supportStyle ?? 'Listening',
        duration: (data.duration ?? '24h') as PodDuration,
        memberCount: data.memberCount ?? 0,
        expiresAt: data.expiresAt?.toDate?.() ?? null,
        isActive: data.isActive === true,
      };
    })
    .filter((p) => (p.expiresAt?.getTime() ?? 0) > now)
    .slice(0, max);
}

/**
 * The room this device is currently in, if any.
 *
 * The pod id is remembered locally so this costs two document reads rather
 * than scanning every open room and checking membership one by one — that
 * version ran on every app open and grew with the size of the product.
 *
 * A local pointer is exactly as durable as the account it belongs to:
 * membership is tied to an anonymous uid, which is itself device-bound, so
 * there is no case where the pointer is lost but the membership survives.
 */
export async function getCurrentMembership(): Promise<{ podId: string; alias: string; pod: Pod } | null> {
  try {
    const podId = await AsyncStorage.getItem(CURRENT_POD_KEY);
    if (!podId) return null;

    const uid = await ensureAuth();
    const [podDoc, member] = await Promise.all([
      getDoc(doc(db, 'pods', podId)),
      getDoc(doc(db, 'pods', podId, 'members', uid)),
    ]);

    if (!podDoc.exists() || !member.exists() || member.data()?.active !== true) {
      await AsyncStorage.removeItem(CURRENT_POD_KEY);
      return null;
    }

    const data = podDoc.data();
    const expiresAt = data.expiresAt?.toDate?.() ?? null;
    // A closed room is not a membership — forget it rather than showing a
    // dead pod the listener would never populate.
    if (data.isActive !== true || !expiresAt || expiresAt.getTime() <= Date.now()) {
      await AsyncStorage.removeItem(CURRENT_POD_KEY);
      return null;
    }

    const alias = member.data()?.alias ?? 'You';
    aliasCache.set(podId, alias);

    return {
      podId,
      alias,
      pod: {
        id: podId,
        topic: data.topic ?? 'Pod',
        supportStyle: data.supportStyle ?? 'Listening',
        duration: (data.duration ?? '24h') as PodDuration,
        memberCount: data.memberCount ?? 1,
        expiresAt,
        isActive: true,
      },
    };
  } catch (err) {
    console.warn('[pods] Could not resolve current membership', err);
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Joining and leaving (server-side)
 * ------------------------------------------------------------------ */

export async function joinPod(
  topic: string,
  supportStyle: string,
  duration: PodDuration,
): Promise<Membership> {
  try {
    const fn = callable<{ topic: string; supportStyle: string; duration: string }, Membership>('joinPod');
    const { data } = await fn({ topic, supportStyle, duration });
    aliasCache.set(data.podId, data.alias);
    await AsyncStorage.setItem(CURRENT_POD_KEY, data.podId);
    return data;
  } catch (err) {
    throw toPodError(err);
  }
}

export async function leavePod(podId: string): Promise<void> {
  try {
    const fn = callable<{ podId: string }, { ok: true }>('leavePod');
    await fn({ podId });
  } catch (err) {
    throw toPodError(err);
  } finally {
    // Clear the local pointer either way. If the server call failed we still
    // want the user out of the room rather than stuck staring at it.
    aliasCache.delete(podId);
    await AsyncStorage.removeItem(CURRENT_POD_KEY).catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ *
 * Messages
 * ------------------------------------------------------------------ */

const aliasCache = new Map<string, string>();

/**
 * The alias matchmaking assigned in this pod.
 *
 * The rules compare every posted message against it, so a stale or guessed
 * value fails the write rather than posting under the wrong name.
 */
async function getAlias(podId: string, uid: string): Promise<string> {
  const cached = aliasCache.get(podId);
  if (cached) return cached;

  const snap = await getDoc(doc(db, 'pods', podId, 'members', uid));
  const alias = snap.data()?.alias;
  if (!alias) throw new PodUnavailable('unknown', "You're not in this pod any more.");
  aliasCache.set(podId, alias);
  return alias;
}

/**
 * Live messages for a room, with blocked members filtered out.
 *
 * Filtering happens here rather than in the query because Firestore cannot
 * express "not in this set" against an arbitrary list, and because the rules
 * deliberately let a member read the whole room — blocking is a per-viewer
 * preference, not a change to what the room contains.
 *
 * Both listeners feed one render: `emit` re-runs the filter whenever either
 * the messages or the block set changes, so blocking someone clears their
 * messages from the screen immediately rather than on the next reopen.
 */
export function subscribeToPodMessages(
  podId: string,
  onChange: (messages: PodMessage[]) => void,
  onError?: (err: Error) => void,
): () => void {
  let unsubscribeMessages: (() => void) | null = null;
  let unsubscribeBlocks: (() => void) | null = null;
  let cancelled = false;

  let latest: PodMessage[] = [];
  let blocked = new Set<string>();

  const emit = () => {
    if (cancelled) return;
    onChange(latest.filter((m) => !(m.uid && blocked.has(m.uid))));
  };

  ensureAuth()
    .then((uid) => {
      if (cancelled) return;

      unsubscribeBlocks = subscribeToBlocks((next) => {
        blocked = next;
        emit();
      });

      const q = query(collection(db, 'pods', podId, 'messages'), orderBy('createdAt', 'asc'), fsLimit(200));
      unsubscribeMessages = onSnapshot(
        q,
        (snap) => {
          latest = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              type: data.type === 'system' ? ('system' as const) : ('user' as const),
              text: data.text ?? '',
              uid: data.uid ?? null,
              alias: data.alias ?? null,
              hidden: data.hidden === true,
              moderationStatus: data.moderation?.status ?? 'pending',
              createdAt: data.createdAt?.toDate?.() ?? null,
              mine: data.uid === uid,
            };
          });
          emit();
        },
        (err) => {
          console.warn('[pods] Message listener failed', err);
          onError?.(err);
        },
      );
    })
    .catch((err) => onError?.(err));

  return () => {
    cancelled = true;
    unsubscribeMessages?.();
    unsubscribeBlocks?.();
  };
}

/**
 * Post to a pod.
 *
 * The shape here is not cosmetic — it is exactly what the security rules
 * accept. `moderation.status` starts at `pending` and only the moderation
 * function may move it, and `expiresAt` is deliberately absent so nobody can
 * outlive the room they are posting in.
 */
export async function sendPodMessage(podId: string, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (trimmed.length > 500) {
    throw new PodUnavailable('unknown', 'Messages are limited to 500 characters.');
  }

  const uid = await ensureAuth();
  const alias = await getAlias(podId, uid);

  await addDoc(collection(db, 'pods', podId, 'messages'), {
    uid,
    alias,
    type: 'user',
    text: trimmed,
    createdAt: serverTimestamp(),
    hidden: false,
    moderation: { status: 'pending' },
  });
}

/** "closes in 9h" / "closes in 4d", for the room header. */
export function formatExpiry(expiresAt: Date | string | null): string {
  if (!expiresAt) return '';
  const end = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  const ms = end.getTime() - Date.now();
  if (ms <= 0) return 'closed';
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return 'closes soon';
  if (hours < 48) return `closes in ${hours}h`;
  return `closes in ${Math.round(hours / 24)}d`;
}

export { Timestamp };
