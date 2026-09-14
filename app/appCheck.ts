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

/**
 * Debug token for simulators and sideloaded builds, where Play Integrity and
 * App Attest cannot produce a real attestation.
 *
 * Local dev only. It must never be set in a build you ship: a registered debug
 * token in a public bundle is a permanent App Check bypass for anyone who
 * extracts it.
 */
const DEBUG_TOKEN = process.env.EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN;

/** Which provider this build asks for. Logged, because it explains a lot. */
const PROVIDER_NAME = __DEV__ && DEBUG_TOKEN ? 'debug' : 'playIntegrity';

let appCheckInstance: any = null;
let active = false;

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

    // Fetch one token up front, so a failure is reported here — by the code
    // that can explain it — rather than as a permissions error somewhere else.
    await getToken(appCheckInstance, /* forceRefresh */ false);

    active = true;
    console.log(`[AppCheck] Active (${Platform.OS}) provider=${PROVIDER_NAME}`);
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
