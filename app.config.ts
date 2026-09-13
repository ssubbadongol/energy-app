/**
 * Build variants.
 *
 * `app.json` holds everything that is true of Soft Focus regardless of which
 * build you are holding. This file layers the per-variant identity on top, so
 * a dev build installs *alongside* the real app instead of replacing it.
 *
 * That separation is the whole point. Pro is a subscription: testing it means
 * sandbox purchases, a RevenueCat app user id, custom claims and a Firebase
 * project full of throwaway pods. None of that should be able to touch the
 * build a real user has on their phone, and you should never have to uninstall
 * one to test the other.
 *
 *   development  Soft Focus Dev   com.tsuyo7.energyapp.dev    sandbox everything
 *   preview      Soft Focus Beta  com.tsuyo7.energyapp.beta   internal testers
 *   production   Soft Focus       com.tsuyo7.energyapp        the store build
 *
 * Selected by APP_VARIANT, which `eas.json` sets per build profile and which
 * defaults to development locally — the safe default, because the one you run
 * by accident should be the one that cannot charge anybody.
 */
import fs from 'fs';
import path from 'path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

type Variant = 'development' | 'preview' | 'production';

const variant: Variant = (() => {
  const raw = process.env.APP_VARIANT;
  if (raw === 'production' || raw === 'preview' || raw === 'development') return raw;
  // An unset APP_VARIANT is a local `expo start`, not a release.
  return 'development';
})();

interface VariantConfig {
  name: string;
  bundleId: string;
  scheme: string;
  /** Tints the launcher icon and splash so the variant is obvious at a glance. */
  tint: string;
  /**
   * App Attest environment. A dev build is signed with a development
   * provisioning profile, and attestation fails if these disagree.
   */
  appAttestEnvironment: 'development' | 'production';
  /** Native Firebase config, in preference order. First one present wins. */
  googleServices: { android: string[]; ios: string[] };
}

const VARIANTS: Record<Variant, VariantConfig> = {
  development: {
    name: 'Soft Focus Dev',
    bundleId: 'com.tsuyo7.energyapp.dev',
    scheme: 'softfocusdev',
    tint: '#FFE2C4',
    appAttestEnvironment: 'development',
    googleServices: {
      android: ['./google-services.dev.json', './google-services.json'],
      ios: ['./GoogleService-Info.dev.plist', './GoogleService-Info.plist'],
    },
  },
  preview: {
    name: 'Soft Focus Beta',
    bundleId: 'com.tsuyo7.energyapp.beta',
    scheme: 'softfocusbeta',
    tint: '#DCE4FF',
    appAttestEnvironment: 'production',
    googleServices: {
      android: ['./google-services.beta.json', './google-services.json'],
      ios: ['./GoogleService-Info.beta.plist', './GoogleService-Info.plist'],
    },
  },
  production: {
    name: 'Soft Focus',
    bundleId: 'com.tsuyo7.energyapp',
    scheme: 'energyapp',
    tint: '#E6F4FE',
    appAttestEnvironment: 'production',
    googleServices: {
      android: ['./google-services.json'],
      ios: ['./GoogleService-Info.plist'],
    },
  },
};

/**
 * Pick the first config file that actually exists.
 *
 * Returning undefined rather than a dangling path matters: Expo treats a
 * `googleServicesFile` pointing at a missing file as a hard prebuild error,
 * and a contributor who has not been given the Firebase files yet should
 * still be able to run the app (Mentor and Pods will refuse, loudly — see
 * `appCheck.ts` — which is the honest outcome).
 */
function firstExisting(candidates: string[]): string | undefined {
  return candidates.find((candidate) => fs.existsSync(path.resolve(__dirname, candidate)));
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const v = VARIANTS[variant];

  const androidGoogleServices = firstExisting(v.googleServices.android);
  const iosGoogleServices = firstExisting(v.googleServices.ios);

  return {
    ...config,
    // `slug` is deliberately inherited: it binds to the EAS project id, and all
    // three variants are the same project with different build profiles.
    name: v.name,
    slug: config.slug ?? 'energy-app',
    scheme: v.scheme,

    ios: {
      ...config.ios,
      bundleIdentifier: v.bundleId,
      googleServicesFile: iosGoogleServices,
      entitlements: {
        ...config.ios?.entitlements,
        'com.apple.developer.devicecheck.appattest-environment': v.appAttestEnvironment,
      },
    },

    android: {
      ...config.android,
      package: v.bundleId,
      googleServicesFile: androidGoogleServices,
      adaptiveIcon: {
        ...config.android?.adaptiveIcon,
        backgroundColor: v.tint,
      },
    },

    extra: {
      ...config.extra,
      /** Read back at runtime by `app/appEnv.ts`. */
      appVariant: variant,
    },
  };
};
