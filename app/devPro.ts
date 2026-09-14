/**
 * Dev-only Pro grants — client side.
 *
 * Pairs with the `grantDevPro` / `revokeDevPro` callables. Both refuse outright
 * unless the backend is running in a development project with the
 * `devProEnabled` flag on, so this module cannot unlock anything by itself; the
 * `isDevBuild` check here is about not showing the control, not about security.
 *
 * The point is to make the *locked* state as easy to reach as the unlocked one.
 * Pro features are easy to develop while permanently subscribed and easy to
 * ship broken for everyone who is not, so being able to flip back in two taps
 * is the part that actually catches bugs.
 */
import { callable, callableErrorCode, ensureAuth, refreshIdToken } from './firebase';
import { isDevBuild } from './appEnv';

export interface DevProResult {
  pro: boolean;
  expiresAt: string | null;
  error: string | null;
}

/** True when the UI should offer the dev Pro controls at all. */
export const devProAvailable = isDevBuild;

async function call(name: 'grantDevPro' | 'revokeDevPro'): Promise<DevProResult> {
  if (!isDevBuild) {
    return { pro: false, expiresAt: null, error: 'Dev Pro is only available in a development build.' };
  }
  try {
    // The callable rejects an anonymous-but-not-signed-in caller with
    // `unauthenticated`, which reads as a backend fault when it is really a
    // startup ordering problem. Guarantee the identity here rather than
    // assuming some other screen got there first.
    await ensureAuth();
    const fn = callable<void, { pro: boolean; expiresAt: string | null }>(name);
    const { data } = await fn();
    // The claim was just rewritten server-side; without this the token in this
    // session still says the old thing and the gates will not budge.
    await refreshIdToken();
    return { pro: data.pro, expiresAt: data.expiresAt, error: null };
  } catch (err: any) {
    const code = callableErrorCode(err);
    const message: string =
      code === 'failed-precondition'
        ? 'Dev Pro is off. Set devProEnabled: true on config/flags in Firestore.'
        : code === 'unauthenticated'
          // Every callable sets `enforceAppCheck`, and the Functions SDK
          // rejects a missing App Check token *before* the handler runs — as
          // `unauthenticated`, not `failed-precondition`. So this code almost
          // always means attestation, not sign-in, and saying "you are not
          // signed in" sends you looking in the wrong place. Ask for both, in
          // the order they actually fail.
          ? 'Request was not verified. Check the App Check debug token is registered for this app, and that anonymous auth is enabled.'
        : code === 'not-found'
          ? 'Not available for this account. Add your uid to config/devAccess in Firestore (SETUP.md §9.6).'
          : (err?.message ?? 'Dev Pro call failed.');
    console.warn(`[devPro] ${name} failed`, err);
    return { pro: false, expiresAt: null, error: message };
  }
}

/** Grant this account Pro for 24 hours. */
export function grantDevPro(): Promise<DevProResult> {
  return call('grantDevPro');
}

/** Drop it again, to see what a non-subscriber sees. */
export function revokeDevPro(): Promise<DevProResult> {
  return call('revokeDevPro');
}
