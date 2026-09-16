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
 * so it is guarded four ways and every guard has to pass:
 *
 *   1. The caller's uid must be listed in `config/devAccess`. Soft Focus runs
 *      a single project, so the paying users and the developers share a
 *      backend; this list is what keeps "the flag got left on" from meaning
 *      "the subscription is free for everyone". No client can read the
 *      document — nothing in `firestore.rules` grants that path.
 *   2. `config/flags.devProEnabled` must be explicitly `true`. The flag does
 *      not exist by default, and `getFlags` defaults it to false, so a fresh
 *      project refuses until someone deliberately turns it on.
 *   3. The project must be on the DEV_PROJECT_IDS allowlist in `config.ts`.
 *      A no-op while there is one project; a real guard the day there are two.
 *   4. Normal auth and App Check, exactly like every other callable.
 *
 * The grant expires after DEV_PRO_TTL_MS so a forgotten one cleans itself up,
 * and it is stamped `proStore: 'dev_override'` so it is obvious in the data
 * and distinguishable from anything RevenueCat wrote.
 */
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { db } from './admin';
import { DEV_ACCESS_DOC, DEV_PRO_TTL_MS, DEV_PROJECT_IDS } from './config';
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
 * Assert dev grants are permissible here, switched on, and that this caller is
 * one of the people allowed to use them.
 *
 * A caller who is not on the allowlist gets `not-found` rather than
 * `permission-denied`: to anyone who is not a developer, this function should
 * be indistinguishable from one that was never deployed. Same for the project
 * check.
 */
async function assertDevGrantsAllowed(uid: string): Promise<void> {
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

  // Read directly rather than through the flags cache: this is an
  // authorisation decision, and removing someone should take effect at once
  // rather than whenever an instance happens to refresh.
  const snap = await db.doc(DEV_ACCESS_DOC).get();
  const uids = snap.data()?.uids;
  const allowed = Array.isArray(uids) && uids.includes(uid);

  if (!allowed) {
    logger.error('Dev Pro grant attempted by a uid that is not on the allowlist', { uid });
    throw new HttpsError('not-found', 'Not available.');
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
    await assertDevGrantsAllowed(uid);

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
    await assertDevGrantsAllowed(uid);

    await setProEntitlement(uid, false, { eventType: 'DEV_REVOKE', store: 'dev_override' });
    logger.warn('Dev Pro revoked', { uid });
    return { pro: false, expiresAt: null };
  },
);
