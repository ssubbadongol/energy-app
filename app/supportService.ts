/**
 * Crisis-support offers.
 *
 * When the moderation function sees dangerous or self-harm content in a pod
 * message, it does not delete the message — it writes a prompt here, visible
 * only to the person who sent it. This module surfaces that.
 *
 * The tone matters: this is an offer, not an intervention. It appears once per
 * flag, it is dismissible, and dismissing it does nothing punitive.
 */
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from '@react-native-firebase/firestore';
import { db, ensureAuth } from './firebase';

export interface CrisisResource {
  region: string;
  name: string;
  detail: string;
  phone: string | null;
  url: string;
}

/**
 * Kept on the client as well as the server so the sheet renders instantly and
 * still works with no connection — the moment it is needed is the worst
 * possible time to be waiting on a network call.
 */
export const CRISIS_RESOURCES: CrisisResource[] = [
  {
    region: 'UK',
    name: 'Samaritans',
    detail: 'Free, 24/7, any kind of distress.',
    phone: '116 123',
    url: 'https://www.samaritans.org',
  },
  {
    region: 'UK',
    name: 'Shout',
    detail: 'Text-based support, if talking is too much.',
    phone: 'Text SHOUT to 85258',
    url: 'https://giveusashout.org',
  },
  {
    region: 'UK',
    name: 'NHS 111',
    detail: 'Urgent mental health help — choose option 2.',
    phone: '111',
    url: 'https://111.nhs.uk',
  },
  {
    region: 'International',
    name: 'Find a helpline',
    detail: 'Local crisis lines wherever you are.',
    phone: null,
    url: 'https://findahelpline.com',
  },
];

export interface SupportPrompt {
  id: string;
  podId: string | null;
  messageId: string | null;
  createdAt: Date | null;
}

/**
 * Watch for a pending offer.
 *
 * Only unacknowledged prompts come back, and only the newest one, so a rough
 * night does not turn into a queue of sheets.
 */
export function subscribeToSupportPrompts(cb: (prompt: SupportPrompt | null) => void): () => void {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;

  ensureAuth()
    .then((uid) => {
      if (cancelled) return;
      const q = query(
        collection(db, 'users', uid, 'supportPrompts'),
        where('acknowledgedAt', '==', null),
        orderBy('createdAt', 'desc'),
        limit(1),
      );
      unsubscribe = onSnapshot(
        q,
        (snap) => {
          const docSnap = snap.docs[0];
          if (!docSnap) {
            cb(null);
            return;
          }
          const data = docSnap.data();
          cb({
            id: docSnap.id,
            podId: data.podId ?? null,
            messageId: data.messageId ?? null,
            createdAt: data.createdAt?.toDate?.() ?? null,
          });
        },
        (err) => console.warn('[support] Listener failed', err),
      );
    })
    .catch(() => undefined);

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

/**
 * Mark an offer as seen.
 *
 * `dismissed` records whether they wanted the resources or not, which is worth
 * knowing in aggregate and is the only thing we store about their answer.
 */
export async function acknowledgeSupportPrompt(promptId: string, dismissed: boolean): Promise<void> {
  try {
    const uid = await ensureAuth();
    await updateDoc(doc(db, 'users', uid, 'supportPrompts', promptId), {
      acknowledgedAt: serverTimestamp(),
      dismissed,
    });
  } catch (err) {
    console.warn('[support] Could not acknowledge prompt', err);
  }
}
