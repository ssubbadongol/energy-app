/**
 * Firebase App Check for React Native.
 *
 * This is what stops someone lifting an anonymous ID token out of the app and
 * driving the Mentor or Pods endpoints from a script. Entitlement checks alone
 * do not cover that: a paying user could still automate 50 mentor calls a day
 * from curl, and a modified client could spam every pod at once.
 *
 * Getting a *real* attestation on a phone needs the platform APIs — Play
 * Integrity on Android, App Attest (with DeviceCheck fallback) on iOS. The
 * Firebase JS SDK cannot reach those; its built-in providers are reCAPTCHA,
 * which is web-only. So the native module mints the token and we hand it to
 * the JS SDK through a `CustomProvider`. Both SDKs end up agreeing on one
 * attestation, and every Firestore and Functions call carries it.
 *
 * The native module is optional at runtime on purpose: a dev build without the
 * Firebase native config should still boot, loudly, rather than hard-crash.
 */
import { Platform } from 'react-native';
import { CustomProvider, initializeAppCheck, type AppCheck } from 'firebase/app-check';
import { app } from './firebase';

/**
 * Debug token for simulators and CI, where Play Integrity and App Attest
 * cannot produce a real attestation.
 *
 * Set EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN in .env for local dev only and
 * register it under Firebase Console -> App Check -> Manage debug tokens.
 * It must never be set in a production build.
 */
const DEBUG_TOKEN = process.env.EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN;

/** App Check tokens live ~1h; refresh well before that. */
const TOKEN_TTL_MS = 30 * 60 * 1000;

let initialised: AppCheck | null = null;
let nativeAppCheck: any = null;

/**
 * Load `@react-native-firebase/app-check` if the native module is linked.
 *
 * Required at call time rather than imported at module scope so a missing
 * native module degrades to a warning instead of a red screen at startup.
 */
function loadNativeModule(): any | null {
  if (nativeAppCheck) return nativeAppCheck;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { firebase } = require('@react-native-firebase/app-check');
    nativeAppCheck = firebase.appCheck();
    return nativeAppCheck;
  } catch {
    return null;
  }
}

async function configureNative(): Promise<any | null> {
  const appCheck = loadNativeModule();
  if (!appCheck) return null;

  const provider = appCheck.newReactNativeFirebaseAppCheckProvider();
  provider.configure({
    android: {
      provider: __DEV__ && DEBUG_TOKEN ? 'debug' : 'playIntegrity',
      debugToken: DEBUG_TOKEN,
    },
    apple: {
      provider: __DEV__ && DEBUG_TOKEN ? 'debug' : 'appAttestWithDeviceCheckFallback',
      debugToken: DEBUG_TOKEN,
    },
  });

  await appCheck.initializeAppCheck({ provider, isTokenAutoRefreshEnabled: true });
  return appCheck;
}

/**
 * Initialise App Check once, at app start, before anything touches Firestore
 * or a callable. Safe to call more than once.
 *
 * Returns whether a real attestation provider is active — the UI uses this to
 * explain why Mentor and Pods are unavailable in an unattested build, instead
 * of showing an opaque `failed-precondition`.
 */
export async function setupAppCheck(): Promise<boolean> {
  if (initialised) return true;

  const native = await configureNative().catch((err) => {
    console.warn('[AppCheck] Native provider failed to configure:', err);
    return null;
  });

  if (!native) {
    console.warn(
      '[AppCheck] @react-native-firebase/app-check is not available. ' +
        'Mentor and Pods will be rejected by the backend until you run a dev/production ' +
        'build that includes it. See SETUP.md.',
    );
    return false;
  }

  initialised = initializeAppCheck(app, {
    provider: new CustomProvider({
      getToken: async () => {
        try {
          const { token } = await native.getToken(/* forceRefresh */ false);
          if (!token) throw new Error('Native App Check returned an empty token');
          return { token, expireTimeMillis: Date.now() + TOKEN_TTL_MS };
        } catch (err) {
          // Without this the failure is invisible: the JS SDK swallows a
          // rejected getToken and simply sends the request with no App Check
          // header, so the server reports `app: MISSING` and the client sees
          // a generic `unauthenticated`. The cause never surfaces anywhere.
          console.error(
            '[AppCheck] Could not mint a token:',
            (err as Error)?.message ?? err,
            `| provider=${__DEV__ && DEBUG_TOKEN ? 'debug' : 'playIntegrity'}`,
            `| debugTokenSet=${Boolean(DEBUG_TOKEN)}`,
            '| If provider=debug, that token must be registered under Firebase Console',
            '-> App Check -> your app -> Manage debug tokens.',
          );
          throw err;
        }
      },
    }),
    isTokenAutoRefreshEnabled: true,
  });

  console.log(
    `[AppCheck] Active (${Platform.OS}) provider=${__DEV__ && DEBUG_TOKEN ? 'debug' : 'playIntegrity'}`,
  );
  return true;
}

/** True once a real attestation provider is wired up. */
export function isAppCheckActive(): boolean {
  return initialised !== null;
}
