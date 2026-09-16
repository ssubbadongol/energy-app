/**
 * Agreeing to the pod rules, once.
 *
 * App Store Review Guideline 1.2 asks that users of an app with
 * user-generated content have *agreed* to terms with a no-tolerance policy for
 * objectionable content and abusive users. Publishing those terms is not the
 * same as the user accepting them, so this records the acceptance.
 *
 * Stored in two places on purpose:
 *
 *   AsyncStorage  so the gate does not flash on every launch while a network
 *                 read resolves — the common case is "already accepted", and
 *                 that should cost nothing.
 *   Firestore     so the acceptance survives a reinstall and is visible to us
 *                 if it is ever disputed.
 *
 * The local copy is a cache, never the authority: a device that has never seen
 * the gate must show it even if the server says the account accepted it on
 * another phone — the point is that *this person* read the rules.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, serverTimestamp, setDoc } from '@react-native-firebase/firestore';
import { db, ensureAuth } from './firebase';
import { devLog } from './devLog';

const LOCAL_KEY = '@soft_focus_pod_terms_accepted';

/**
 * Bump this when the pod rules change materially.
 *
 * A new version re-shows the gate. That is the whole reason it is versioned —
 * "they agreed to some earlier text" is not a defence worth relying on.
 */
export const POD_TERMS_VERSION = 1;

export async function hasAcceptedPodTerms(): Promise<boolean> {
  try {
    const local = await AsyncStorage.getItem(LOCAL_KEY);
    if (Number(local) >= POD_TERMS_VERSION) return true;
  } catch {
    // Unreadable storage just means we show the gate again. Harmless.
  }

  try {
    const uid = await ensureAuth();
    const snap = await getDoc(doc(db, 'users', uid));
    const accepted = Number(snap.data()?.podTermsVersion ?? 0);
    if (accepted >= POD_TERMS_VERSION) {
      // Warm the cache so the next launch is instant.
      await AsyncStorage.setItem(LOCAL_KEY, String(accepted)).catch(() => {});
      return true;
    }
  } catch (err) {
    console.warn('[pods] Could not check terms acceptance', err);
  }

  return false;
}

export async function acceptPodTerms(): Promise<void> {
  // Local first, and never blocked by the network: someone who accepted the
  // rules should not be shown the gate twice because they were on a train.
  await AsyncStorage.setItem(LOCAL_KEY, String(POD_TERMS_VERSION)).catch(() => {});

  try {
    const uid = await ensureAuth();
    await setDoc(
      doc(db, 'users', uid),
      {
        podTermsVersion: POD_TERMS_VERSION,
        podTermsAcceptedAt: serverTimestamp(),
      },
      { merge: true },
    );
    devLog('[pods] Recorded pod terms acceptance', POD_TERMS_VERSION);
  } catch (err) {
    console.warn('[pods] Could not record terms acceptance remotely', err);
  }
}
