/**
 * Firebase App Check.
 *
 * This is what stops someone lifting an anonymous ID token out of the app and
 * driving the Mentor or Pods endpoints from a script. Entitlement checks alone
 * do not cover that: a paying user could still automate their daily mentor
 * allowance from curl, and a modified client could spam every pod at once.
 *
 * Attestation comes from the platform — Play Integrity on Android, App Attest
 * with a DeviceCheck fallback on iOS. Because the whole client is now on the
 * native SDK, the token is attached to every Firestore, Functions and Auth
 * call automatically; there is no provider to bridge and nothing to keep in
 * sync. The previous arrangement handed a native token to the JS SDK through a
 * CustomProvider, and that token reached callables but never reached
 * Firestore, which denied every read.
 */
import { Platform } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import {
  getToken,
  initializeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from '@react-native-firebase/app-check';
import { devLog } from './devLog';

/**
 * Debug token for simulators and sideloaded builds, where Play Integrity and
 * App Attest cannot produce a real attestation.
 *
 * A registered debug token is a **bearer credential**: anyone holding the
 * string can mint valid App Check tokens for this project from curl, with no
 * copy of the app and no device. So it must never reach a shipped bundle.
 *
 * The `__DEV__ ?` is not decoration and is not the same as the check below.
 * `EXPO_PUBLIC_*` values are inlined into the bundle as string literals at
 * build time, so reading the variable at all was enough to embed the token —
 * and it did: a production export was scanned and the token was present, even
 * though the provider logic below correctly chose Play Integrity and never
 * used it. The value leaked without the feature being enabled.
 *
 * Metro folds `__DEV__` to `false` for any production bundle and the minifier
 * drops the dead branch, so wrapping the read is what actually removes the
 * literal. This is now structural rather than a matter of remembering to clear
 * an environment variable before a build.
 */
const DEBUG_TOKEN = __DEV__ ? process.env.EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN : undefined;

/** Which provider this build asks for. Logged, because it explains a lot. */
const PROVIDER_NAME = __DEV__ && DEBUG_TOKEN ? 'debug' : 'playIntegrity';

let appCheckInstance: any = null;
let active = false;

/**
 * Initialise App Check synchronously, before any other Firebase service.
 *
 * Order is the whole ballgame. Firestore captures its App Check provider when
 * the instance is constructed and never re-resolves it, so initialising App
 * Check from a React effect — after `getFirestore` has already run at module
 * import — leaves Firestore permanently sending no token. Measured: App Check
 * reported active at 09:43:53.252 and a read 300ms later was still denied on
 * `request.app != null`.
 *
 * Everything here is synchronous: `configure` and `initializeAppCheck` both
 * return immediately, and only the token fetch is async (see `setupAppCheck`).
 * So this can and must run at module scope in `firebase.ts`.
 */
export function initAppCheckSync(): void {
  if (appCheckInstance) return;
  try {
    const provider = new ReactNativeFirebaseAppCheckProvider();
    provider.configure({
      android: { provider: PROVIDER_NAME, debugToken: DEBUG_TOKEN },
      apple: {
        provider: __DEV__ && DEBUG_TOKEN ? 'debug' : 'appAttestWithDeviceCheckFallback',
        debugToken: DEBUG_TOKEN,
      },
    });
    appCheckInstance = initializeAppCheck(getApp(), {
      provider,
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.error('[AppCheck] Synchronous init failed:', (err as Error)?.message ?? err);
  }
}

/**
 * Initialise App Check once, before anything touches Firestore or a callable.
 *
 * Returns whether attestation is actually available — the UI uses this to
 * explain why Mentor and Pods are unavailable in an unattested build, instead
 * of showing an opaque permissions error on an unrelated screen.
 */
export async function setupAppCheck(): Promise<boolean> {
  if (active) return true;

  try {
    // Already initialised at module scope by `firebase.ts`; this is belt and
    // braces for any path that reaches here first.
    initAppCheckSync();
    if (!appCheckInstance) throw new Error('App Check was not initialised');

    // Fetch one token up front, so a failure is reported here — by the code
    // that can explain it — rather than as a permissions error somewhere else.
    await getToken(appCheckInstance, /* forceRefresh */ false);

    active = true;
    devLog(`[AppCheck] Active (${Platform.OS}) provider=${PROVIDER_NAME}`);
    return true;
  } catch (err) {
    console.error(
      '[AppCheck] Could not attest:',
      (err as Error)?.message ?? err,
      `| provider=${PROVIDER_NAME}`,
      `| debugTokenSet=${Boolean(DEBUG_TOKEN)}`,
      '| If provider=debug, that token must be registered under Firebase Console',
      '-> App Check -> your app -> Manage debug tokens.',
    );
    return false;
  }
}

/** True once a real attestation token has been minted at least once. */
export function isAppCheckActive(): boolean {
  return active;
}
