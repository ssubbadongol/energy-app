/**
 * Accounts.
 *
 * Soft Focus has two identity states on purpose:
 *
 *   guest   An anonymous Firebase user, created silently on first launch.
 *           Tasks, the timer, life reminders and onboarding all work here and
 *           always will. Apple's 5.1.1 is explicit that features which do not
 *           need an account must be reachable without one, and a wellbeing app
 *           whose first screen is a signup form is a wellbeing app nobody
 *           opens twice.
 *
 *   linked  The same user, with an email credential attached. Required before
 *           we will take money, because a subscription tied to an identifier
 *           that dies with the app install is a subscription the user loses
 *           and we then have to refund by hand.
 *
 * The important property of `linkEmailAccount` is that the **uid does not
 * change**. RevenueCat is configured with the uid as its `appUserID`, the Pro
 * custom claim is keyed by uid, and every task and mentor message lives under
 * `users/{uid}` — so linking in place means none of that has to migrate.
 * Signing in to a *different* existing account is the case where the uid does
 * change, and `signInExisting` deals with the consequences explicitly.
 */
import {
  EmailAuthProvider,
  linkWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from '@react-native-firebase/auth';
import { auth, ensureAuth, refreshIdToken, type User } from './firebase';
import { devLog } from './devLog';
import { track } from './monitoring';

export type AccountState = 'guest' | 'linked-unverified' | 'linked-verified';

export interface AccountInfo {
  state: AccountState;
  email: string | null;
  uid: string;
}

/** True when this user can recover their data on another device. */
export function isRecoverable(state: AccountState): boolean {
  return state !== 'guest';
}

export function readAccount(): AccountInfo | null {
  const user = auth.currentUser;
  if (!user) return null;
  return {
    state: user.isAnonymous ? 'guest' : user.emailVerified ? 'linked-verified' : 'linked-unverified',
    email: user.email,
    uid: user.uid,
  };
}

export async function currentAccount(): Promise<AccountInfo> {
  await ensureAuth();
  // `ensureAuth` guarantees a user, so the fallback below is unreachable —
  // it exists only to keep the return type honest.
  return readAccount() ?? { state: 'guest', email: null, uid: '' };
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export type AccountErrorCode =
  | 'email-in-use'
  | 'invalid-email'
  | 'weak-password'
  | 'wrong-password'
  | 'user-not-found'
  | 'too-many-requests'
  | 'network'
  | 'requires-recent-login'
  | 'unknown';

export class AccountError extends Error {
  constructor(
    readonly code: AccountErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AccountError';
  }
}

/**
 * Firebase error codes, translated into something a person would say.
 *
 * Deliberately not surfacing the raw code: "auth/weak-password" tells the user
 * nothing about what to do next, and the default English messages read like a
 * stack trace.
 */
function toAccountError(err: unknown): AccountError {
  const raw = (err as { code?: string })?.code ?? '';
  const code = raw.startsWith('auth/') ? raw.slice('auth/'.length) : raw;

  switch (code) {
    case 'email-already-in-use':
    case 'credential-already-in-use':
      return new AccountError(
        'email-in-use',
        'There is already an account with that email. Sign in to it instead.',
      );
    case 'invalid-email':
      return new AccountError('invalid-email', "That doesn't look like an email address.");
    case 'weak-password':
      return new AccountError('weak-password', 'Use at least 8 characters.');
    case 'wrong-password':
    case 'invalid-credential':
      return new AccountError('wrong-password', 'That email and password do not match.');
    case 'user-not-found':
      return new AccountError('user-not-found', 'No account with that email.');
    case 'too-many-requests':
      return new AccountError(
        'too-many-requests',
        'Too many attempts. Wait a few minutes and try again.',
      );
    case 'network-request-failed':
      return new AccountError('network', 'No connection. Try again when you are back online.');
    case 'requires-recent-login':
      return new AccountError(
        'requires-recent-login',
        'For your security, sign in again before doing that.',
      );
    default:
      console.warn('[account] Unexpected auth failure', err);
      return new AccountError('unknown', 'Something went wrong. Please try again.');
  }
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/**
 * Deliberately permissive. The only authority on whether an address exists is
 * the verification email, so a strict regex here can only reject addresses that
 * are in fact valid — and it is disproportionately the unusual ones, which
 * belong to people already used to being told their email is wrong.
 */
export function isPlausibleEmail(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.length >= 5 && trimmed.includes('@') && !/\s/.test(trimmed);
}

/** Firebase enforces 6; 8 is the current baseline advice and costs nothing. */
export const MIN_PASSWORD_LENGTH = 8;

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Linking and signing in
 * ------------------------------------------------------------------ */

/**
 * Attach an email credential to the current anonymous user.
 *
 * The uid survives, so nothing has to move: tasks stay under the same
 * document, RevenueCat keeps the same `appUserID`, and an existing Pro claim
 * remains valid. This is the path a guest takes on the way to the paywall.
 */
export async function linkEmailAccount(
  email: string,
  password: string,
  displayName?: string | null,
): Promise<AccountInfo> {
  await ensureAuth();
  const user = auth.currentUser;
  if (!user) throw new AccountError('unknown', 'Not signed in. Restart the app and try again.');

  if (!user.isAnonymous) {
    throw new AccountError('unknown', 'This device is already signed in to an account.');
  }

  try {
    const credential = EmailAuthProvider.credential(email.trim(), password);
    await linkWithCredential(user, credential);

    if (displayName) {
      await updateProfile(user, { displayName }).catch(() => {
        // Cosmetic. A failure here must not fail the link.
      });
    }

    // Best-effort: an account that exists but is unverified is still usable,
    // and a bounced verification email should not undo the signup.
    await sendVerification().catch(() => {});

    track('account_linked');
    devLog('[account] Linked email to existing uid', user.uid);
    return readAccount() ?? { state: 'linked-unverified', email: user.email, uid: user.uid };
  } catch (err) {
    throw toAccountError(err);
  }
}

/**
 * Sign in to an account that already exists — the new-phone case.
 *
 * Unlike linking, this **replaces** the uid. Every caller must therefore
 * re-point RevenueCat and re-read the entitlement afterwards; `onAccountSwitched`
 * below exists so no call site has to remember that, and
 * `components/pro/EntitlementProvider.tsx` wires it up.
 */
export async function signInExisting(email: string, password: string): Promise<AccountInfo> {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    devLog('[account] Signed in to existing uid', cred.user.uid);
    // The Pro claim rides in the token, which was just minted for a different
    // user — force a refresh so the app does not spend a minute thinking a
    // paying customer is on the free tier.
    await refreshIdToken().catch(() => {});
    return readAccount() ?? { state: 'linked-unverified', email: cred.user.email, uid: cred.user.uid };
  } catch (err) {
    throw toAccountError(err);
  }
}

/**
 * Sign out, and immediately become a guest again.
 *
 * Never leave the app with no user: every screen calls `ensureAuth`, and a
 * signed-out state that half the app cannot handle is a crash waiting for the
 * first person who taps this button.
 */
export async function signOutToGuest(): Promise<string> {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('[account] Sign-out failed', err);
  }
  return ensureAuth();
}

/* ------------------------------------------------------------------ *
 * Verification and recovery
 * ------------------------------------------------------------------ */

export async function sendVerification(): Promise<void> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    throw new AccountError('unknown', 'Add an email to your account first.');
  }
  if (user.emailVerified) return;
  try {
    await sendEmailVerification(user);
  } catch (err) {
    throw toAccountError(err);
  }
}

/**
 * Re-read the verification flag from the server.
 *
 * `emailVerified` is a snapshot taken when the token was minted, so a user who
 * clicks the link in their inbox and comes back to the app still reads as
 * unverified until the user record is reloaded.
 */
export async function refreshVerification(): Promise<AccountState> {
  const user = auth.currentUser;
  if (!user) return 'guest';
  try {
    await user.reload();
  } catch (err) {
    console.warn('[account] Could not reload the user record', err);
  }
  return readAccount()?.state ?? 'guest';
}

export async function resetPassword(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (err) {
    throw toAccountError(err);
  }
}

/* ------------------------------------------------------------------ *
 * Switch notification
 * ------------------------------------------------------------------ */

type SwitchListener = (uid: string) => void | Promise<void>;
const switchListeners = new Set<SwitchListener>();

/**
 * Fired when the signed-in uid changes under the app's feet — a sign-in to an
 * existing account, a sign-out, or an account deletion.
 *
 * RevenueCat in particular must be told: it was configured with the old uid and
 * will keep reporting that user's entitlements until it is re-pointed.
 */
export function onAccountSwitched(listener: SwitchListener): () => void {
  switchListeners.add(listener);
  return () => switchListeners.delete(listener);
}

export async function notifyAccountSwitched(uid: string): Promise<void> {
  for (const listener of switchListeners) {
    try {
      await listener(uid);
    } catch (err) {
      console.warn('[account] A switch listener failed', err);
    }
  }
}

export type { User };
