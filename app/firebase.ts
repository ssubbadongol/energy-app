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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  signInAnonymously,
  onAuthStateChanged,
  type Persistence,
  type User,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable, type HttpsCallable } from 'firebase/functions';

/**
 * Project config.
 *
 * Not secrets — these identify the project, and Firestore rules plus App Check
 * are what actually protect it — but they are environment, so they come from
 * `.env` rather than from source. There is deliberately no fallback: a
 * hardcoded default is how a build ends up quietly talking to the wrong
 * backend, and the previous default pointed at a hackathon project that no
 * longer exists.
 *
 * Values come from Firebase Console -> Project settings -> Your apps -> SDK
 * setup and configuration. See `.env.example`.
 */
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

/**
 * Complain clearly rather than crashing.
 *
 * Tasks, Focus and onboarding are local-first and still work without a
 * backend; it is Mentor, Pods and cross-device sync that will not. Booting
 * into a usable app with one loud line in the log beats a white screen that
 * says `auth/invalid-api-key` from four frames deep — and it matches how
 * `appCheck.ts` handles a missing native module.
 */
const missing = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error(
    `[firebase] Missing config: ${missing.join(', ')}. ` +
      'Copy .env.example to .env and fill in the EXPO_PUBLIC_FIREBASE_* values from ' +
      'Firebase Console -> Project settings -> Your apps. Mentor, Pods and sync will not work until you do.',
  );
}

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/**
 * Persist the session to disk.
 *
 * The JS SDK defaults to *in-memory* persistence on React Native, which for an
 * anonymous-auth app is quietly catastrophic: `signInAnonymously` mints a new
 * uid on every cold start, so tasks, mentor history, pod membership and the
 * Pro entitlement all belong to a user that no longer exists the next time the
 * app opens. Someone could pay for Pro and lose it on relaunch.
 *
 * `getReactNativePersistence` is only present in the package's React Native
 * build, which Metro resolves and TypeScript does not — hence the require and
 * the local type. Importing it normally fails to typecheck even though it
 * works at runtime.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getReactNativePersistence } = require('firebase/auth') as {
  getReactNativePersistence?: (storage: unknown) => Persistence;
};

function createAuth() {
  if (!getReactNativePersistence) {
    // Web, or a build where the RN entry point was not resolved.
    return getAuth(app);
  }
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    // Already initialised — a Fast Refresh re-run of this module.
    return getAuth(app);
  }
}

export const auth = createAuth();
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
