/**
 * Firebase bootstrap — React Native Firebase.
 *
 * Auth, Firestore, Functions and App Check all come from the *native* SDK.
 *
 * This used to be the Firebase JS SDK with the native module bridged in for
 * App Check alone, and that arrangement does not work: the JS SDK held a valid
 * App Check token but never attached it to Firestore requests, so every rule
 * checking `request.app != null` denied while callables — which fetch the
 * token themselves at call time — kept working. Measured directly against the
 * live rules: `request.auth != null` passed and `request.app != null` was
 * denied on the same request.
 *
 * With the native SDK there is no bridge to fail. App Check attaches to every
 * Firestore, Functions and Auth call automatically, and the three share one
 * session rather than two SDKs disagreeing about who is signed in.
 *
 * Configuration comes from `google-services.json` / `GoogleService-Info.plist`
 * at build time, which `app.config.ts` picks per variant — so there is no
 * config object here and no `EXPO_PUBLIC_FIREBASE_*` to keep in sync.
 */
import { Platform } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { initAppCheckSync } from './appCheck';
import { devLog } from './devLog';

export const app = getApp();

/**
 * App Check first, before any service instance exists.
 *
 * Firestore captures its App Check provider at construction and never looks
 * again, so this must run before `getFirestore` — not from a React effect,
 * which is what left every read denied on `request.app != null` while App
 * Check itself reported active 300ms earlier.
 */
initAppCheckSync();

export const auth = getAuth(app);

/**
 * Derived from the auth instance rather than imported: the package does not
 * re-export its `User` type from the index, and deriving it cannot drift.
 */
export type User = NonNullable<typeof auth.currentUser>;
export const db = getFirestore(app);

/** Must match the region every callable is deployed to. */
export const FUNCTIONS_REGION = 'us-central1';
export const functions = getFunctions(app, FUNCTIONS_REGION);

/**
 * Typed `httpsCallable`, so call sites do not re-declare shapes.
 *
 * Note the error codes differ from the JS SDK's: React Native Firebase reports
 * them bare (`permission-denied`), not namespaced (`functions/permission-denied`).
 * `callableErrorCode` below normalises that for call sites.
 */
export function callable<Req, Res>(name: string) {
  return httpsCallable<Req, Res>(functions, name);
}

/**
 * The bare error code from a failed callable, whichever SDK shape it arrives in.
 *
 * Pro gating reads these, so getting it wrong fails open or fails closed
 * silently — worth normalising in one place rather than at every call site.
 */
export function callableErrorCode(err: unknown): string {
  const raw = (err as { code?: string })?.code ?? '';
  return raw.startsWith('functions/') ? raw.slice('functions/'.length) : raw;
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
 *
 * The native SDK persists the session to disk by default, so the uid survives
 * a cold start. The JS SDK did not, which silently issued a new identity on
 * every launch and abandoned that user's tasks, history and entitlement.
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

/**
 * One-line startup diagnostic.
 *
 * Firestore reports every rule failure as the same opaque "Missing or
 * insufficient permissions", with no indication of which condition failed, so
 * printing what the client is presenting is the cheapest way to attribute one.
 *
 * Development only, via `devLog`. This line carries the project id, the app id
 * and the user's uid, and it ran on every launch — in a shipped build that is
 * three pieces of account-identifying infrastructure written to the device log
 * for any process with log access to read.
 */
export function logFirebaseIdentity(): void {
  devLog(
    '[firebase] identity |',
    `project=${app.options.projectId}`,
    `| appId=${app.options.appId}`,
    `| platform=${Platform.OS}`,
    `| uid=${auth.currentUser?.uid ?? 'NONE'}`,
    `| anonymous=${auth.currentUser?.isAnonymous ?? 'n/a'}`,
  );
}
