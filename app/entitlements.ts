/**
 * RevenueCat entitlements.
 *
 * This module answers one question — "does this person have Pro?" — and does
 * the plumbing that makes the answer true everywhere at once:
 *
 *   1. RevenueCat is configured with the Firebase uid as the app user id, so a
 *      subscription and a Firebase account are the same identity. Without this
 *      the webhook has no idea whose claim to set.
 *   2. After a purchase or restore we call `refreshEntitlement`, which asks
 *      RevenueCat server-side and writes the custom claim immediately, instead
 *      of racing the webhook.
 *   3. We then force an ID token refresh so the claim is live in this session.
 *      Access unlocks without an app restart.
 *
 * What the UI reads from here is a convenience, not a security boundary. The
 * real gate is the custom claim, checked by Cloud Functions and Firestore
 * rules. Nothing here can grant access on its own.
 */
import { Platform } from 'react-native';
import { callable, ensureAuth, readProClaim, refreshIdToken } from './firebase';

/* ------------------------------------------------------------------ *
 * Types (declared locally so the app compiles without the native module)
 * ------------------------------------------------------------------ */

export interface PurchasePackage {
  identifier: string;
  packageType: string;
  product: {
    identifier: string;
    title: string;
    description: string;
    priceString: string;
    /** e.g. "P1M" / "P1Y". Present on subscription products. */
    subscriptionPeriod?: string | null;
  };
}

export interface ProOffering {
  identifier: string;
  packages: PurchasePackage[];
}

export interface EntitlementState {
  isPro: boolean;
  /** True until the first check completes. */
  loading: boolean;
  /** The store's expiry, when known. */
  expiresAt: string | null;
  /** Set when RevenueCat could not be reached or is not installed. */
  error: string | null;
}

/** The entitlement identifier configured in the RevenueCat dashboard. */
export const PRO_ENTITLEMENT_ID = 'pro';

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

/* ------------------------------------------------------------------ *
 * Native module, loaded defensively
 * ------------------------------------------------------------------ */

let Purchases: any = null;

/**
 * `react-native-purchases` needs a custom dev build. Requiring it lazily means
 * a JS-only environment degrades to "not Pro" rather than crashing at import.
 */
function loadPurchases(): any | null {
  if (Purchases) return Purchases;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Purchases = require('react-native-purchases').default;
    return Purchases;
  } catch {
    return null;
  }
}

export function isPurchasesAvailable(): boolean {
  return loadPurchases() !== null;
}

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

let configured = false;
let configuring: Promise<boolean> | null = null;

async function configureInternal(): Promise<boolean> {
  const sdk = loadPurchases();
  if (!sdk) {
    console.warn('[Purchases] react-native-purchases is unavailable — Pro features will stay locked.');
    return false;
  }

  const apiKey = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;
  if (!apiKey) {
    console.warn(`[Purchases] No RevenueCat key for ${Platform.OS}. See SETUP.md.`);
    return false;
  }

  // The uid has to exist before configure, so RevenueCat and Firebase agree on
  // who this is from the very first event.
  const uid = await ensureAuth();

  if (__DEV__ && sdk.setLogLevel && sdk.LOG_LEVEL) {
    sdk.setLogLevel(sdk.LOG_LEVEL.WARN);
  }
  sdk.configure({ apiKey, appUserID: uid });

  configured = true;
  return true;
}

/** Configure RevenueCat once. Safe to await from several places at startup. */
export async function configurePurchases(): Promise<boolean> {
  if (configured) return true;
  if (!configuring) {
    configuring = configureInternal().finally(() => {
      configuring = null;
    });
  }
  return configuring;
}

/* ------------------------------------------------------------------ *
 * Reading entitlement
 * ------------------------------------------------------------------ */

/**
 * Current Pro state.
 *
 * The Firebase claim is checked first because it is what the backend will
 * actually enforce — if RevenueCat says yes but the claim says no, the app
 * would show unlocked screens that then fail on every call. Treating the claim
 * as the display truth keeps the UI honest.
 */
export async function getEntitlement(): Promise<EntitlementState> {
  const base: EntitlementState = { isPro: false, loading: false, expiresAt: null, error: null };

  const claim = await readProClaim().catch(() => false);
  if (claim) return { ...base, isPro: true };

  const ok = await configurePurchases();
  if (!ok) {
    return { ...base, error: 'Purchases are unavailable in this build.' };
  }

  try {
    const info = await Purchases.getCustomerInfo();
    const entitlement = info?.entitlements?.active?.[PRO_ENTITLEMENT_ID];
    if (!entitlement) return base;

    // RevenueCat says Pro but the token does not yet — the usual case right
    // after a purchase, or on a fresh install restoring an old subscription.
    // Reconcile server-side; that call writes the claim and refreshes the
    // token, and its return value is the backend's own answer, so it is the
    // one worth trusting here.
    const confirmed = await syncEntitlementToBackend();
    return {
      ...base,
      isPro: confirmed,
      expiresAt: entitlement.expirationDate ?? null,
      error: confirmed ? null : 'Your subscription is active but could not be verified. Pull to retry.',
    };
  } catch (err) {
    console.warn('[Purchases] getCustomerInfo failed', err);
    return { ...base, error: 'Could not check your subscription.' };
  }
}

/**
 * Have the backend re-read RevenueCat and rewrite the claim, then refresh the
 * local token. This is the step that makes access appear without a restart.
 */
export async function syncEntitlementToBackend(): Promise<boolean> {
  try {
    const refresh = callable<void, { pro: boolean; expiresAt: string | null }>('refreshEntitlement');
    const { data } = await refresh();
    // Force refresh so the new claim is in the token this session already
    // holds — otherwise the app waits up to an hour for the normal rotation.
    await refreshIdToken();
    return data.pro;
  } catch (err) {
    console.warn('[Purchases] Backend entitlement sync failed', err);
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Offerings and purchase
 * ------------------------------------------------------------------ */

export async function getProOffering(): Promise<ProOffering | null> {
  if (!(await configurePurchases())) return null;
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings?.current;
    if (!current) return null;
    return {
      identifier: current.identifier,
      packages: current.availablePackages ?? [],
    };
  } catch (err) {
    console.warn('[Purchases] getOfferings failed', err);
    return null;
  }
}

export interface PurchaseOutcome {
  isPro: boolean;
  cancelled: boolean;
  error: string | null;
}

export async function purchase(pkg: PurchasePackage): Promise<PurchaseOutcome> {
  if (!(await configurePurchases())) {
    return { isPro: false, cancelled: false, error: 'Purchases are unavailable in this build.' };
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const active = Boolean(customerInfo?.entitlements?.active?.[PRO_ENTITLEMENT_ID]);
    if (!active) {
      return { isPro: false, cancelled: false, error: 'The purchase went through but Pro is not active yet.' };
    }
    const isPro = await syncEntitlementToBackend();
    return { isPro, cancelled: false, error: null };
  } catch (err: any) {
    if (err?.userCancelled) {
      return { isPro: false, cancelled: true, error: null };
    }
    console.warn('[Purchases] purchase failed', err);
    return { isPro: false, cancelled: false, error: err?.message ?? 'The purchase did not complete.' };
  }
}

export async function restore(): Promise<PurchaseOutcome> {
  if (!(await configurePurchases())) {
    return { isPro: false, cancelled: false, error: 'Purchases are unavailable in this build.' };
  }
  try {
    const info = await Purchases.restorePurchases();
    const active = Boolean(info?.entitlements?.active?.[PRO_ENTITLEMENT_ID]);
    if (!active) {
      return { isPro: false, cancelled: false, error: 'No previous Soft Focus Pro purchase was found.' };
    }
    const isPro = await syncEntitlementToBackend();
    return { isPro, cancelled: false, error: null };
  } catch (err: any) {
    console.warn('[Purchases] restore failed', err);
    return { isPro: false, cancelled: false, error: err?.message ?? 'Could not restore purchases.' };
  }
}

/**
 * Subscribe to RevenueCat's own change notifications (renewal, expiry,
 * cross-device restore). Each one re-syncs the backend claim so a lapsed
 * subscription loses access without waiting for the next cold start.
 */
export function onEntitlementChange(cb: (isPro: boolean) => void): () => void {
  const sdk = loadPurchases();
  if (!sdk?.addCustomerInfoUpdateListener) return () => undefined;

  const handler = async (info: any) => {
    const active = Boolean(info?.entitlements?.active?.[PRO_ENTITLEMENT_ID]);
    const confirmed = active ? await syncEntitlementToBackend() : false;
    if (!active) await refreshIdToken().catch(() => undefined);
    cb(confirmed);
  };

  sdk.addCustomerInfoUpdateListener(handler);
  return () => sdk.removeCustomerInfoUpdateListener?.(handler);
}
