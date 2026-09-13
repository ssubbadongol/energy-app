/**
 * Firebase bootstrap.
 *
 * Auth, Firestore, Functions and App Check, initialised once.
 *
 * App Check is the piece that makes every server-side check meaningful: it
 * attests that a request came from a genuine, unmodified build of this app
 * (Play Integrity on Android, App Attest / DeviceCheck on iOS) rather than a
 * script holding a stolen anonymous token. Cloud Functions enforce it via
 * `enforceAppCheck: true`; Firestore rules enforce it via `request.app != null`.
 *
 * The web SDK's own App Check providers are reCAPTCHA-based and meaningless on
 * a phone, so the native token comes from `@react-native-firebase/app-check`
 * and is handed to the JS SDK through a CustomProvider. See `appCheck.ts`.
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable, type HttpsCallable } from 'firebase/functions';

const firebaseConfig = {
  apiKey: 'AIzaSyC49xk0IY6ER-NLetAgDu9Pk7cSsilKCPg',
  authDomain: 'leedshack26.firebaseapp.com',
  projectId: 'leedshack26',
  storageBucket: 'leedshack26.firebasestorage.app',
  messagingSenderId: '314817464747',
  appId: '1:314817464747:web:d2940c5697afab3564aaee',
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

/** Must match the region every callable is deployed to. */
export const FUNCTIONS_REGION = 'us-central1';
export const functions = getFunctions(app, FUNCTIONS_REGION);

/** Typed `httpsCallable`, so call sites do not re-declare shapes. */
export function callable<Req, Res>(name: string): HttpsCallable<Req, Res> {
  return httpsCallable<Req, Res>(functions, name);
}

/* ------------------------------------------------------------------ *
 * Anonymous auth
 * ------------------------------------------------------------------ */

let signInPromise: Promise<User> | null = null;

/**
 * Resolve to a signed-in user, signing in anonymously the first time.
 *
 * Concurrent callers share one in-flight sign-in — otherwise the first screen
 * to render can fire three of them and create three anonymous accounts.
 */
export async function ensureAuth(): Promise<string> {
  if (auth.currentUser) return auth.currentUser.uid;

  if (!signInPromise) {
    signInPromise = signInAnonymously(auth)
      .then((cred) => cred.user)
      .finally(() => {
        signInPromise = null;
      });
  }

  const user = await signInPromise;
  return user.uid;
}

export function onAuthChange(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

/**
 * Force a fresh ID token.
 *
 * Called straight after a purchase so the new `pro` custom claim is in the
 * token immediately, instead of waiting up to an hour for the normal refresh.
 * The same hourly refresh is what makes a lapsed subscription lose access
 * without us having to do anything.
 */
export async function refreshIdToken(): Promise<void> {
  await auth.currentUser?.getIdToken(true);
}

/** Reads the `pro` claim out of the current token. */
export async function readProClaim(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  const result = await user.getIdTokenResult();
  return result.claims.pro === true;
}
