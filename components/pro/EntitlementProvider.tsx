/**
 * App-wide Pro state.
 *
 * One place resolves entitlement, so the Mentor tab and the Pods tab can never
 * disagree about it, and one listener re-checks when RevenueCat reports a
 * renewal or an expiry.
 *
 * This is presentation state. It decides what the user sees, not what they can
 * do — the Cloud Functions and Firestore rules decide that, from the custom
 * claim, and they do not ask the client.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  configurePurchases,
  getEntitlement,
  isPurchasesAvailable,
  onEntitlementChange,
  type EntitlementState,
} from '@/app/entitlements';
import { setupAppCheck } from '@/app/appCheck';
import { ensureAuth } from '@/app/firebase';

interface EntitlementContextValue extends EntitlementState {
  /** Re-read entitlement (after a purchase, or on returning to a gated tab). */
  refresh: () => Promise<void>;
  /** False when the build has no attestation — gated features will be refused. */
  appCheckReady: boolean;
  /** False when the purchases SDK is missing from this build. */
  purchasesAvailable: boolean;
}

const EntitlementContext = createContext<EntitlementContextValue>({
  isPro: false,
  loading: true,
  expiresAt: null,
  error: null,
  refresh: async () => undefined,
  appCheckReady: false,
  purchasesAvailable: false,
});

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<EntitlementState>({
    isPro: false,
    loading: true,
    expiresAt: null,
    error: null,
  });
  const [appCheckReady, setAppCheckReady] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const next = await getEntitlement();
    if (mounted.current) setState(next);
  }, []);

  useEffect(() => {
    mounted.current = true;

    (async () => {
      // App Check first: every subsequent Firestore read and callable carries
      // its token, and a request that leaves before it is ready is refused.
      const ready = await setupAppCheck().catch(() => false);
      if (mounted.current) setAppCheckReady(ready);

      // Sign in before anything that needs an identity.
      //
      // This used to happen only as a side effect of configuring RevenueCat,
      // which meant a build with no RevenueCat key — every build, before
      // payments are wired — never signed in at all, and every callable went
      // out unauthenticated. Auth is foundational and RevenueCat is optional,
      // so the order has to reflect that.
      try {
        await ensureAuth();
      } catch (err) {
        console.error('[entitlement] Anonymous sign-in failed', err);
        if (mounted.current) {
          setState({
            isPro: false,
            loading: false,
            expiresAt: null,
            error: 'Could not sign in. Check that Anonymous auth is enabled for this Firebase project.',
          });
        }
        return;
      }

      await configurePurchases().catch(() => false);
      await refresh();
    })();

    const unsubscribe = onEntitlementChange((isPro) => {
      if (mounted.current) setState((prev) => ({ ...prev, isPro, loading: false }));
    });

    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [refresh]);

  const value = useMemo<EntitlementContextValue>(
    () => ({
      ...state,
      refresh,
      appCheckReady,
      purchasesAvailable: isPurchasesAvailable(),
    }),
    [state, refresh, appCheckReady],
  );

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement(): EntitlementContextValue {
  return useContext(EntitlementContext);
}
