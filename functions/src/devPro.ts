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
 *   2. `config/devAccess.devProEnabled` must be explicitly `true`. Absent means
 *      off, so a fresh project refuses until someone deliberately turns it on.
 *      It lives on that document rather than `config/flags` because
 *      `config/flags` is readable by every signed-in user, and advertising
 *      that a free-Pro path exists is not something to do for nothing.
 *   3. The **attested app id** must be a development build (DEV_APP_IDS). It
 *      comes from the App Check token, so it is signed by Play Integrity /
 *      App Attest rather than claimed by the client, and a shipped build
 *      cannot forge it. This is the guard DEV_PROJECT_IDS was meant to be and
 *      cannot be while one project serves both variants.
 *   4. Normal auth and App Check, exactly like every other callable.
 *
 * The grant expires after DEV_PRO_TTL_MS so a forgotten one cleans itself up,
 * and it is stamped `proStore: 'dev_override'` so it is obvious in the data
 * and distinguishable from anything RevenueCat wrote.
 */
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { db } from './admin';
import { DEV_ACCESS_DOC, DEV_APP_IDS, DEV_PRO_TTL_MS, DEV_PROJECT_IDS } from './config';
import { setProEntitlement } from './entitlements';

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
async function assertDevGrantsAllowed(uid: string, appId: string | undefined): Promise<void> {
  const projectId = currentProjectId();
  if (!projectId || !DEV_PROJECT_IDS.includes(projectId)) {
    logger.error('Dev Pro grant attempted outside a development project', { projectId });
    throw new HttpsError('not-found', 'Not available.');
  }

  /**
   * The attested app must be a development build.
   *
   * This is the gate the project check cannot be, because one project serves
   * both variants. `appId` comes out of the verified App Check token, so it is
   * signed by Play Integrity / App Attest rather than claimed by the client —
   * a shipped build physically cannot present a dev app's attestation.
   *
   * It means a production user is refused even if every other guard fails
   * open: the flag left on, and their uid somehow on the allowlist.
   */
  if (!appId || !DEV_APP_IDS.includes(appId)) {
    logger.error('Dev Pro grant attempted from a non-development app', { uid, appId });
    throw new HttpsError('not-found', 'Not available.');
  }

  /**
   * Both remaining checks come from `config/devAccess` in a single read.
   *
   * `devProEnabled` used to live on `config/flags`, which is readable by every
   * signed-in user — so the app advertised that a free-Pro path existed. It
   * belongs here with the allowlist: same decision, same document, no client
   * can see either, and one read instead of two.
   *
   * Read directly rather than through the flags cache, because this is an
   * authorisation decision: removing someone must take effect at once rather
   * than whenever an instance happens to refresh.
   */
  const snap = await db.doc(DEV_ACCESS_DOC).get();
  const data = snap.data();

  // Opt-in, and absent means off — the one setting in this backend that fails
  // closed, because the cost of it being wrong is giving the product away.
  if (data?.devProEnabled !== true) {
    throw new HttpsError(
      'failed-precondition',
      'Dev Pro grants are off. Set devProEnabled: true on config/devAccess to enable them.',
    );
  }

  const uids = data?.uids;
  if (!Array.isArray(uids) || !uids.includes(uid)) {
    logger.error('Dev Pro grant attempted by a uid that is not on the allowlist', { uid });
    throw new HttpsError('not-found', 'Not available.');
  }
}

function requireCaller(request: CallableRequest<unknown>): { uid: string; appId: string | undefined } {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (!request.app) throw new HttpsError('failed-precondition', 'This app build could not be verified.');
  // `appId` rides in the verified App Check token — see `assertDevGrantsAllowed`.
  return { uid, appId: request.app.appId };
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
    const { uid, appId } = requireCaller(request);
    await assertDevGrantsAllowed(uid, appId);

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
    const { uid, appId } = requireCaller(request);
    await assertDevGrantsAllowed(uid, appId);

    await setProEntitlement(uid, false, { eventType: 'DEV_REVOKE', store: 'dev_override' });
    logger.warn('Dev Pro revoked', { uid });
    return { pro: false, expiresAt: null };
  },
);
