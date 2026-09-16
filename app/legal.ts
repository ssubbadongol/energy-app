/**
 * Where the legal documents live, and who to write to.
 *
 * One place, because these strings are load-bearing for store review and they
 * appear in several screens. Apple 3.1.2 requires tappable Terms and Privacy
 * links on the purchase screen *inside the binary* — links only on the store
 * listing are the single most common subscription rejection — and Apple 1.2
 * requires published contact information for reporting content.
 *
 * The pages themselves are in `public/` and deploy with
 * `firebase deploy --only hosting`. Keep the two in step: a legal link that
 * 404s is worse than no link at all.
 */

import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';

/** Firebase Hosting default domain for the `soft-focus-app` project. */
const SITE = 'https://soft-focus-app.web.app';

export const legal = {
  privacy: `${SITE}/privacy.html`,
  terms: `${SITE}/terms.html`,
  deleteAccount: `${SITE}/delete-account.html`,
  support: `${SITE}/support.html`,
} as const;

/**
 * The support inbox.
 *
 * Apple 1.2 requires published contact information for reporting content, so
 * this is the same address that appears on the pages under `public/` and in
 * `ALERT_ADDRESS` in `functions/src/reports.ts`. Change it in all three or the
 * app will publish one address and send moderation alerts to another.
 */
export const SUPPORT_EMAIL = 'support.softfocus@gmail.com';

/**
 * Where a user manages the subscription we cannot manage for them.
 *
 * Deleting a Soft Focus account does not stop App Store or Play billing — only
 * the store can. Every screen that offers deletion has to offer this too.
 */
export const MANAGE_SUBSCRIPTION = {
  ios: 'https://apps.apple.com/account/subscriptions',
  android: 'https://play.google.com/store/account/subscriptions',
} as const;

/**
 * Open one of these in the in-app browser.
 *
 * In-app rather than kicking out to Safari or Chrome, because a reviewer
 * checking Apple 3.1.2 taps the link on the purchase screen and must not lose
 * the purchase flow to do it — and because leaving the app to read a privacy
 * policy is how people stop reading privacy policies.
 *
 * Swallows its errors on purpose: a legal link that throws would take a screen
 * down with it, and there is nothing useful to tell the user if the system
 * browser refuses to open.
 */
export async function openLegal(url: string): Promise<void> {
  try {
    await openBrowserAsync(url, { presentationStyle: WebBrowserPresentationStyle.AUTOMATIC });
  } catch (err) {
    console.warn('[legal] Could not open', url, err);
  }
}
