/**
 * Server-side Pro entitlement checks.
 *
 * The client is never trusted with this. A caller is Pro when the Firebase
 * custom claim says so; the Firestore mirror on the user doc is a fallback for
 * the window between a webhook landing and the client refreshing its token,
 * and it is what Firestore rules read (rules cannot see arbitrary claims
 * without a token refresh either, so both surfaces agree).
 */
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, db } from './admin';
import { paths } from './config';

export interface ProStatus {
  isPro: boolean;
  source: 'claim' | 'firestore' | 'none';
  expiresAt: Date | null;
}

/**
 * Resolve Pro for a uid.
 *
 * Order matters: the claim is authoritative and free to read (it is already in
 * the verified token), the Firestore mirror is the catch-up path.
 */
export async function resolveProStatus(uid: string, tokenClaims?: Record<string, unknown>): Promise<ProStatus> {
  if (tokenClaims?.pro === true) {
    const exp = typeof tokenClaims.proExpiresAt === 'number' ? new Date(tokenClaims.proExpiresAt) : null;
    // A claim that has aged past its own expiry is stale — fall through to the
    // mirror rather than honouring it.
    if (!exp || exp.getTime() > Date.now()) {
      return { isPro: true, source: 'claim', expiresAt: exp };
    }
  }

  const snap = await db.doc(paths.user(uid)).get();
  const data = snap.data();
  if (data?.pro === true) {
    const expiresAt: Date | null = data.proExpiresAt?.toDate?.() ?? null;
    if (!expiresAt || expiresAt.getTime() > Date.now()) {
      return { isPro: true, source: 'firestore', expiresAt };
    }
  }

  return { isPro: false, source: 'none', expiresAt: null };
}

/**
 * Guard for callable functions: verifies auth, App Check and Pro in one place.
 *
 * Throws the `HttpsError` codes the client checks for, so the app can tell
 * "sign in again" from "you need Pro" from "this build is not trusted".
 */
export async function requireProCaller(request: CallableRequest<unknown>): Promise<{ uid: string; pro: ProStatus }> {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in before using this feature.');
  }

  // App Check is enforced declaratively via `enforceAppCheck: true` on each
  // callable. This is belt-and-braces so a misconfigured deploy still fails
  // closed rather than silently accepting scripted traffic.
  if (!request.app) {
    logger.warn('Callable reached handler without an App Check token', { uid });
    throw new HttpsError('failed-precondition', 'This app build could not be verified.');
  }

  const pro = await resolveProStatus(uid, request.auth?.token as Record<string, unknown> | undefined);
  if (!pro.isPro) {
    throw new HttpsError('permission-denied', 'A Soft Focus Pro subscription is required.');
  }

  return { uid, pro };
}

/**
 * Write entitlement to both places the rest of the system reads it.
 *
 * Custom claims are capped at 1000 bytes, so only the two fields that gate
 * access go into the token; everything else stays on the user doc.
 */
export async function setProEntitlement(
  uid: string,
  isPro: boolean,
  opts: { expiresAt?: Date | null; productId?: string | null; store?: string | null; eventType?: string | null } = {},
): Promise<void> {
  const { expiresAt = null, productId = null, store = null, eventType = null } = opts;

  const existing = (await adminAuth.getUser(uid).catch(() => null))?.customClaims ?? {};
  await adminAuth.setCustomUserClaims(uid, {
    ...existing,
    pro: isPro,
    proExpiresAt: isPro && expiresAt ? expiresAt.getTime() : null,
  });

  await db.doc(paths.user(uid)).set(
    {
      pro: isPro,
      proExpiresAt: expiresAt,
      proProductId: productId,
      proStore: store,
      proLastEvent: eventType,
      proUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  logger.info('Entitlement updated', { uid, isPro, productId, store, eventType });
}
