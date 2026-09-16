/**
 * Which build is this?
 *
 * `app.config.ts` decides the variant at build time and stamps it into
 * `extra.appVariant`; this is the runtime side of that. Anything that should
 * behave differently in a dev build — a visible badge, a louder log, a
 * willingness to talk to the Firestore emulator — asks here rather than
 * reading `__DEV__`, because `__DEV__` describes how the JS was bundled and
 * says nothing about which Firebase project or which App Store account the
 * build is wired to.
 */
import Constants from 'expo-constants';

export type AppVariant = 'development' | 'preview' | 'production';

export const APP_VARIANT: AppVariant = (() => {
  const raw = Constants.expoConfig?.extra?.appVariant;
  return raw === 'production' || raw === 'preview' || raw === 'development' ? raw : 'development';
})();

export const isDevBuild = APP_VARIANT === 'development';
export const isPreviewBuild = APP_VARIANT === 'preview';
export const isProductionBuild = APP_VARIANT === 'production';

/** Shown in the dev/beta badge. Empty in production, where it is not rendered. */
export const VARIANT_LABEL = isDevBuild ? 'DEV' : isPreviewBuild ? 'BETA' : '';
