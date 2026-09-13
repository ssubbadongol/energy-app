/**
 * RevenueCat -> Firebase entitlement sync.
 *
 * Two paths, on purpose:
 *
 *   1. `revenueCatWebhook` is the source of truth. RevenueCat calls it on
 *      every subscription lifecycle event, including the ones no client is
 *      around to observe (renewals at 3am, expirations, billing failures).
 *
 *   2. `refreshEntitlement` is the client's escape hatch. Right after a
 *      purchase or a restore the app calls it, we ask RevenueCat directly what
 *      this user owns, and we write the claim before the webhook has landed.
 *      Without it the first minute after paying is a race.
 *
 * `app_user_id` is always the Firebase uid — the client calls
 * `Purchases.logIn(uid)` before it ever shows a paywall.
 */
import { onRequest, onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { timingSafeEqual } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './admin';
import { paths } from './config';
import { setProEntitlement } from './entitlements';
import { REVENUECAT_WEBHOOK_SECRET, REVENUECAT_API_KEY } from './secrets';

/** The entitlement identifier configured in the RevenueCat dashboard. */
export const PRO_ENTITLEMENT_ID = 'pro';

/**
 * Events that mean "this account has access right now".
 *
 * CANCELLATION is deliberately in the grant list: it means auto-renew was
 * turned off, not that access ended. Access ends at EXPIRATION. Same for
 * BILLING_ISSUE — that starts a grace period, and cutting someone off mid-grace
 * is both wrong and a support ticket.
 */
const GRANTING_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
  'CANCELLATION',
  'BILLING_ISSUE',
  'TRANSFER',
]);

const REVOKING_EVENTS = new Set(['EXPIRATION', 'SUBSCRIPTION_PAUSED', 'REFUND']);

interface RevenueCatEvent {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  product_id?: string;
  store?: string;
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number;
  entitlement_ids?: string[] | null;
  transferred_to?: string[];
  transferred_from?: string[];
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export const revenueCatWebhook = onRequest(
  {
    region: 'us-central1',
    secrets: [REVENUECAT_WEBHOOK_SECRET],
    memory: '256MiB',
    timeoutSeconds: 30,
    maxInstances: 10,
    // The endpoint is public by necessity; the shared secret is the gate.
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const provided = req.get('Authorization') ?? '';
    if (!safeEqual(provided, REVENUECAT_WEBHOOK_SECRET.value())) {
      logger.warn('Rejected RevenueCat webhook with bad Authorization header');
      res.status(401).send('Unauthorized');
      return;
    }

    const event: RevenueCatEvent = req.body?.event ?? {};
    const type = event.type ?? 'UNKNOWN';
    const eventId = event.id;

    // RevenueCat retries on non-2xx, so the handler has to be idempotent.
    if (eventId) {
      const ref = db.doc(paths.revenueCatEvent(eventId));
      const seen = await ref.get();
      if (seen.exists) {
        logger.info('Ignoring duplicate RevenueCat event', { eventId, type });
        res.status(200).send('Duplicate');
        return;
      }
      await ref.set({
        type,
        appUserId: event.app_user_id ?? null,
        receivedAt: FieldValue.serverTimestamp(),
      });
    }

    // Events that carry no subscriber (e.g. TEST) still deserve a 200 so
    // RevenueCat stops retrying them.
    const uid = event.app_user_id ?? event.original_app_user_id;
    if (!uid) {
      logger.info('RevenueCat event without an app_user_id', { type });
      res.status(200).send('Ignored');
      return;
    }

    // Entitlement-scoped events for other entitlements are not ours.
    if (event.entitlement_ids && !event.entitlement_ids.includes(PRO_ENTITLEMENT_ID)) {
      logger.info('RevenueCat event for another entitlement', { type, ids: event.entitlement_ids });
      res.status(200).send('Ignored');
      return;
    }

    const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;

    try {
      if (type === 'TRANSFER') {
        // Access moves: revoke everywhere it left, grant everywhere it landed.
        await Promise.all([
          ...(event.transferred_from ?? []).map((from) =>
            setProEntitlement(from, false, { eventType: type, store: event.store ?? null }),
          ),
          ...(event.transferred_to ?? []).map((to) =>
            setProEntitlement(to, true, {
              expiresAt,
              productId: event.product_id ?? null,
              store: event.store ?? null,
              eventType: type,
            }),
          ),
        ]);
      } else if (REVOKING_EVENTS.has(type)) {
        await setProEntitlement(uid, false, { eventType: type, store: event.store ?? null });
      } else if (GRANTING_EVENTS.has(type)) {
        // Trust the expiry over the event name: a RENEWAL that already expired
        // is not access.
        const active = !expiresAt || expiresAt.getTime() > Date.now();
        await setProEntitlement(uid, active, {
          expiresAt,
          productId: event.product_id ?? null,
          store: event.store ?? null,
          eventType: type,
        });
      } else {
        logger.info('Unhandled RevenueCat event type', { type, uid });
      }
    } catch (err) {
      logger.error('Failed to apply RevenueCat event', { type, uid, err });
      // 500 so RevenueCat retries — the dedupe doc above makes that safe.
      res.status(500).send('Retry');
      return;
    }

    res.status(200).send('OK');
  },
);

/**
 * Ask RevenueCat what this user owns, right now, and write the claim.
 *
 * Called by the app immediately after a purchase or restore, before it forces
 * a token refresh. Auth-gated but not Pro-gated, for obvious reasons.
 */
export const refreshEntitlement = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: true,
    secrets: [REVENUECAT_API_KEY],
    memory: '256MiB',
    timeoutSeconds: 30,
    maxInstances: 10,
  },
  async (request: CallableRequest<void>) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    if (!request.app) throw new HttpsError('failed-precondition', 'This app build could not be verified.');

    const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      headers: {
        Authorization: `Bearer ${REVENUECAT_API_KEY.value()}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      logger.error('RevenueCat subscriber lookup failed', { uid, status: response.status, detail: detail.slice(0, 300) });
      throw new HttpsError('unavailable', 'Could not confirm your subscription. Please try again.');
    }

    const body = (await response.json()) as any;
    const entitlement = body?.subscriber?.entitlements?.[PRO_ENTITLEMENT_ID];
    const expiresRaw: string | null = entitlement?.expires_date ?? null;
    const expiresAt = expiresRaw ? new Date(expiresRaw) : null;

    // A null expiry on a present entitlement means a lifetime/non-renewing
    // purchase, which is still active.
    const isPro = Boolean(entitlement) && (!expiresAt || expiresAt.getTime() > Date.now());

    await setProEntitlement(uid, isPro, {
      expiresAt,
      productId: entitlement?.product_identifier ?? null,
      store: entitlement?.store ?? null,
      eventType: 'CLIENT_REFRESH',
    });

    return { pro: isPro, expiresAt: expiresAt?.toISOString() ?? null };
  },
);
