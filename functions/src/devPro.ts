/**
 * Development-only Pro grants.
 *
 * Everything behind the paywall — the mentor, pods, the daily counter, the
 * degraded states — is gated on a real subscription. That is correct, and it
 * makes those features tedious to develop: a sandbox purchase per device per
 * rebuild, and StoreKit/Play sandbox accounts that expire on their own
 * schedule. This callable hands a developer a time-boxed `pro` claim so the
 * Pro surface can be worked on without buying it every morning.
 *
 * It is the one function in this backend that grants access without payment,
 * so it is guarded three ways and every guard has to pass:
 *
 *   1. The project must be on the DEV_PROJECT_IDS allowlist in `config.ts`.
 *      An allowlist rather than a denylist on purpose: the failure mode of
 *      forgetting to update it is that dev grants stop working, not that they
 *      start working in production.
 *   2. `config/flags.devProEnabled` must be explicitly `true`. The flag does
 *      not exist by default, and `getFlags` defaults it to false, so a fresh
 *      project refuses until someone deliberately turns it on.
 *   3. Normal auth and App Check, exactly like every other callable.
 *
 * The grant expires after DEV_PRO_TTL_MS so a forgotten one cleans itself up,
 * and it is stamped `proStore: 'dev_override'` so it is obvious in the data
 * and distinguishable from anything RevenueCat wrote.
 */
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { DEV_PRO_TTL_MS, DEV_PROJECT_IDS } from './config';
import { setProEntitlement } from './entitlements';
import { getFlags } from './flags';

/** The project this instance is running in, as the runtime reports it. */
function currentProjectId(): string | null {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  try {
    return JSON.parse(process.env.FIREBASE_CONFIG ?? '{}').projectId ?? null;
  } catch {
    return null;
  }
}

/**
 * Assert that dev grants are permissible here, then that they are switched on.
 *
 * Deliberately throws `not-found` for the project check rather than
 * `permission-denied`: in production this function should be indistinguishable
 * from one that was never deployed.
 */
async function assertDevGrantsAllowed(): Promise<void> {
  const projectId = currentProjectId();
  if (!projectId || !DEV_PROJECT_IDS.includes(projectId)) {
    logger.error('Dev Pro grant attempted outside a development project', { projectId });
    throw new HttpsError('not-found', 'Not available.');
  }

  const flags = await getFlags();
  if (!flags.devProEnabled) {
    throw new HttpsError(
      'failed-precondition',
      'Dev Pro grants are off. Set devProEnabled: true on config/flags to enable them.',
    );
  }
}

function requireCaller(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (!request.app) throw new HttpsError('failed-precondition', 'This app build could not be verified.');
  return uid;
}

/** Grant the caller Pro for DEV_PRO_TTL_MS. Never grants to anyone else. */
export const grantDevPro = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: true,
    memory: '256MiB',
    timeoutSeconds: 20,
    maxInstances: 3,
  },
  async (request: CallableRequest<void>) => {
    const uid = requireCaller(request);
    await assertDevGrantsAllowed();

    const expiresAt = new Date(Date.now() + DEV_PRO_TTL_MS);
    await setProEntitlement(uid, true, {
      expiresAt,
      productId: 'dev_override',
      store: 'dev_override',
      eventType: 'DEV_GRANT',
    });

    logger.warn('Dev Pro granted', { uid, expiresAt: expiresAt.toISOString() });
    return { pro: true, expiresAt: expiresAt.toISOString() };
  },
);

/** Hand it back, so the locked state can be tested too. */
export const revokeDevPro = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: true,
    memory: '256MiB',
    timeoutSeconds: 20,
    maxInstances: 3,
  },
  async (request: CallableRequest<void>) => {
    const uid = requireCaller(request);
    await assertDevGrantsAllowed();

    await setProEntitlement(uid, false, { eventType: 'DEV_REVOKE', store: 'dev_override' });
    logger.warn('Dev Pro revoked', { uid });
    return { pro: false, expiresAt: null };
  },
);
