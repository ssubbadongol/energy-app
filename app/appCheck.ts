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
 * the JS SDK through a `CustomProvider`.
 *
 * Two things about the shape of this file:
 *
 *   - It exports a *provider factory* rather than initialising App Check
 *     itself. `initializeAppCheck` has to run before `getFirestore`, because
 *     Firestore captures the App Check provider when the instance is
 *     constructed and never looks again — so that call lives in `firebase.ts`,
 *     above the service getters. Functions resolves the provider per call,
 *     which is why callables worked while every Firestore read came back
 *     "Missing or insufficient permissions".
 *
 *   - The native module is configured *lazily*, on the first token request.
 *     Configuring it is async and `initializeAppCheck` is not, so the provider
 *     has to be constructible before the native side is ready.
 */
import { Platform } from 'react-native';
import { CustomProvider } from 'firebase/app-check';

/**
 * Debug token for simulators and sideloaded builds, where Play Integrity and
 * App Attest cannot produce a real attestation.
 *
 * Local dev only, and it must never be set in a build you ship: a registered
 * debug token in a public bundle is a permanent App Check bypass for anyone
 * who extracts it.
 */
const DEBUG_TOKEN = process.env.EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN;

/** App Check tokens live ~1h; refresh well before that. */
const TOKEN_TTL_MS = 30 * 60 * 1000;

/** Which provider this build asks for. Logged, because it explains a lot. */
const PROVIDER_NAME = __DEV__ && DEBUG_TOKEN ? 'debug' : 'playIntegrity';

interface NativeAppCheck {
  instance: any;
  mod: any;
}

let nativeModule: any = null;
let nativePromise: Promise<NativeAppCheck | null> | null = null;
let providerActive = false;

/**
 * Load `@react-native-firebase/app-check` if the native module is linked.
 *
 * Required at call time rather than imported at module scope so a missing
 * native module degrades to a warning instead of a red screen at startup.
 */
function loadNativeModule(): any | null {
  if (nativeModule) return nativeModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeModule = require('@react-native-firebase/app-check');
    return nativeModule;
  } catch (err) {
    // "module not available" and "module threw on load" are different problems
    // with the same symptom, and the second is invisible otherwise.
    console.warn('[AppCheck] Could not load @react-native-firebase/app-check:', (err as Error)?.message ?? err);
    return null;
  }
}

/**
 * Configure and initialise the native provider.
 *
 * v26 exports only the modular API — the namespaced `firebase.appCheck()`
 * accessor no longer exists, so reaching for it threw and was reported as the
 * module being absent.
 */
async function configureNative(): Promise<NativeAppCheck | null> {
  const mod = loadNativeModule();
  if (!mod) return null;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getApp } = require('@react-native-firebase/app');

  const provider = new mod.ReactNativeFirebaseAppCheckProvider();
  provider.configure({
    android: { provider: PROVIDER_NAME, debugToken: DEBUG_TOKEN },
    apple: {
      provider: __DEV__ && DEBUG_TOKEN ? 'debug' : 'appAttestWithDeviceCheckFallback',
      debugToken: DEBUG_TOKEN,
    },
  });

  const instance = mod.initializeAppCheck(getApp(), {
    provider,
    isTokenAutoRefreshEnabled: true,
  });

  return { instance, mod };
}

/** Configure the native side once, on first use. */
function ensureNative(): Promise<NativeAppCheck | null> {
  if (!nativePromise) {
    nativePromise = configureNative().catch((err) => {
      console.warn('[AppCheck] Native provider failed to configure:', (err as Error)?.message ?? err);
      return null;
    });
  }
  return nativePromise;
}

/**
 * The provider handed to `initializeAppCheck` in `firebase.ts`.
 *
 * Synchronous by necessity — it must exist before any Firebase service is
 * constructed — so all the async work happens inside `getToken`.
 */
export function createAppCheckProvider(): CustomProvider {
  return new CustomProvider({
    getToken: async () => {
      const native = await ensureNative();
      if (!native) {
        throw new Error('@react-native-firebase/app-check is unavailable; this build cannot attest.');
      }
      try {
        const { token } = await native.mod.getToken(native.instance, /* forceRefresh */ false);
        if (!token) throw new Error('Native App Check returned an empty token');
        providerActive = true;
        return { token, expireTimeMillis: Date.now() + TOKEN_TTL_MS };
      } catch (err) {
        // Without this the failure is invisible: the JS SDK swallows a
        // rejected getToken and sends the request with no App Check header, so
        // the server reports `app: MISSING`, Firestore rules deny, and the
        // cause never surfaces anywhere.
        console.error(
          '[AppCheck] Could not mint a token:',
          (err as Error)?.message ?? err,
          `| provider=${PROVIDER_NAME}`,
          `| debugTokenSet=${Boolean(DEBUG_TOKEN)}`,
          '| If provider=debug, that token must be registered under Firebase Console',
          '-> App Check -> your app -> Manage debug tokens.',
        );
        throw err;
      }
    },
  });
}

/**
 * Warm the native provider and report whether attestation is available.
 *
 * App Check itself is already initialised by the time this runs. This exists so
 * startup can wait for a real token before screens start making requests, and
 * so the UI can explain an unattested build rather than showing an opaque
 * permissions error on an unrelated screen.
 */
export async function setupAppCheck(): Promise<boolean> {
  const native = await ensureNative();

  if (!native) {
    console.warn(
      '[AppCheck] @react-native-firebase/app-check is not available. ' +
        'Mentor and Pods will be rejected by the backend until you run a dev/production ' +
        'build that includes it. See SETUP.md.',
    );
    return false;
  }

  try {
    await native.mod.getToken(native.instance, false);
    providerActive = true;
    console.log(`[AppCheck] Active (${Platform.OS}) provider=${PROVIDER_NAME}`);
    return true;
  } catch (err) {
    console.error('[AppCheck] Configured but could not mint a token:', (err as Error)?.message ?? err);
    return false;
  }
}

/** True once a real attestation token has been minted at least once. */
export function isAppCheckActive(): boolean {
  return providerActive;
}
