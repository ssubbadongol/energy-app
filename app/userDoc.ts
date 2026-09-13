/**
 * The Firestore user document.
 *
 * Local `userProfileStorage` stays the source of truth for the app's own
 * preferences — it is instant and works offline. This module mirrors the parts
 * the *server* needs (name, tags, tone, goals) up to `users/{uid}`, because
 * the mentor Cloud Function personalises from there and never sees the device.
 *
 * The subscription fields on this document are written only by the Admin SDK;
 * Firestore rules reject any client write that touches them.
 */
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, ensureAuth } from './firebase';
import { loadUserProfile, type MentorTone } from './userProfileStorage';

export interface RemoteUserProfile {
  name: string | null;
  tags: string[];
  goals: string[];
  mentorTone: MentorTone;
  pro: boolean;
}

const EMPTY: RemoteUserProfile = {
  name: null,
  tags: [],
  goals: [],
  mentorTone: 'Gentle',
  pro: false,
};

export async function getRemoteProfile(): Promise<RemoteUserProfile> {
  try {
    const uid = await ensureAuth();
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return EMPTY;
    const data = snap.data();
    return {
      name: data.name ?? null,
      tags: Array.isArray(data.tags) ? data.tags : [],
      goals: Array.isArray(data.goals) ? data.goals : [],
      mentorTone: data.mentorTone === 'Direct' ? 'Direct' : 'Gentle',
      pro: data.pro === true,
    };
  } catch (err) {
    console.warn('[userDoc] Could not read profile', err);
    return EMPTY;
  }
}

/**
 * Push the locally-held profile up so the mentor can personalise.
 *
 * Merge-only, and it never writes an entitlement field — rules would reject
 * the whole document if it did.
 */
export async function syncProfileToFirestore(extra: { tags?: string[]; goals?: string[] } = {}): Promise<void> {
  try {
    const uid = await ensureAuth();
    const local = await loadUserProfile();

    const payload: Record<string, unknown> = {
      name: local.name?.trim() || null,
      mentorTone: local.mentorTone,
      defaultEnergy: local.defaultEnergy,
      updatedAt: serverTimestamp(),
    };
    if (extra.tags) payload.tags = extra.tags;
    if (extra.goals) payload.goals = extra.goals;

    await setDoc(doc(db, 'users', uid), payload, { merge: true });
  } catch (err) {
    console.warn('[userDoc] Could not sync profile', err);
  }
}

/**
 * Watch the entitlement mirror.
 *
 * Gives the app a live signal when the RevenueCat webhook lands — useful when
 * a subscription is bought or lapses on another device.
 */
export function watchProMirror(cb: (isPro: boolean) => void): () => void {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;

  ensureAuth()
    .then((uid) => {
      if (cancelled) return;
      unsubscribe = onSnapshot(
        doc(db, 'users', uid),
        (snap) => cb(snap.data()?.pro === true),
        (err) => console.warn('[userDoc] Pro mirror listener failed', err),
      );
    })
    .catch(() => undefined);

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}
