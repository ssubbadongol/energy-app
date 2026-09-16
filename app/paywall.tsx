/**
 * Soft Focus Pro paywall.
 *
 * Packages come from the RevenueCat "current" offering, so pricing and product
 * mix are changed in the dashboard rather than in a build. Nothing here is
 * trusted: the purchase result is reconciled server-side before the app treats
 * anyone as subscribed.
 */
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SageBackground } from '@/components/sage/Background';
import { curve, font, gutter, radius, sage, shadow, text } from '@/theme/sage';
import { useEntitlement } from '@/components/pro/EntitlementProvider';
import { getProOffering, purchase, restore, type ProOffering, type PurchasePackage } from './entitlements';
import { devProAvailable, grantDevPro, revokeDevPro } from './devPro';
import { AuthSheet } from '@/components/account/AuthSheet';
import { currentAccount, isRecoverable } from './accountService';
import { legal, openLegal } from './legal';
import { track } from './monitoring';

const BENEFITS = [
  { title: 'AI Mentor', body: 'A companion that knows how you work, and can add, finish and clear tasks for you while you talk.' },
  { title: 'Community Pods', body: 'Small anonymous rooms with three to five people going through the same week. They close on their own.' },
  { title: 'Kept safe', body: 'Pods are checked for abuse, and nobody ever sees your name or profile.' },
];

/** "P1M" -> "month". Falls back to the raw string for anything unusual. */
function periodLabel(period?: string | null): string {
  switch (period) {
    case 'P1W':
      return 'week';
    case 'P1M':
      return 'month';
    case 'P3M':
      return '3 months';
    case 'P6M':
      return '6 months';
    case 'P1Y':
      return 'year';
    default:
      return period ?? '';
  }
}

export default function Paywall() {
  const { isPro, refresh } = useEntitlement();
  const [offering, setOffering] = useState<ProOffering | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    track('paywall_viewed');
    let alive = true;
    getProOffering().then((result) => {
      if (!alive) return;
      setOffering(result);
      // Default to the best-value package when there is more than one.
      const annual = result?.packages.find((p) => p.product.subscriptionPeriod === 'P1Y');
      setSelected(annual?.identifier ?? result?.packages[0]?.identifier ?? null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * The package the user picked before we asked them to make an account.
   *
   * Held rather than discarded so accepting the account prompt continues
   * straight into the purchase they were already making — asking someone to
   * find the button again after a signup is how a sale is lost.
   */
  const [pendingPurchase, setPendingPurchase] = useState<PurchasePackage | null>(null);

  const buy = useCallback(
    async (pkg: PurchasePackage) => {
      /**
       * Pro needs a real account.
       *
       * An anonymous uid dies with the app install, and a subscription keyed to
       * one is a subscription the user loses on their next phone — which we
       * would then have to restore by hand, for someone who has already paid.
       * Guests keep every free feature; this is the one gate.
       */
      const account = await currentAccount();
      if (!isRecoverable(account.state)) {
        setPendingPurchase(pkg);
        return;
      }

      setBusy(pkg.identifier);
      const result = await purchase(pkg);
      setBusy(null);

      if (result.cancelled) return;
      if (result.error) {
        Alert.alert('Purchase not completed', result.error);
        return;
      }
      track('purchase_completed', { period: pkg.product.subscriptionPeriod ?? 'unknown' });
      // The purchase call already reconciled the claim and refreshed the
      // token; this just pulls the new state into the provider.
      await refresh();
      router.back();
    },
    [refresh],
  );

  const restorePurchases = useCallback(async () => {
    setBusy('restore');
    const result = await restore();
    setBusy(null);
    if (result.error) {
      Alert.alert('Restore', result.error);
      return;
    }
    await refresh();
    router.back();
  }, [refresh]);

  /**
   * Dev builds only, and the backend refuses anyway outside a development
   * project — see `devPro.ts`. Kept on the paywall rather than behind a hidden
   * gesture so that the thing you reach for when testing Pro is the same
   * screen a real subscriber sees.
   */
  const toggleDevPro = useCallback(
    async (grant: boolean) => {
      setBusy('dev');
      const result = grant ? await grantDevPro() : await revokeDevPro();
      setBusy(null);
      if (result.error) {
        Alert.alert('Dev Pro', result.error);
        return;
      }
      await refresh();
    },
    [refresh],
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <SageBackground />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Soft Focus Pro</Text>
        </View>
        <Text style={[text.title, { marginTop: 14 }]}>Someone in your corner</Text>
        <Text style={[text.body, { marginTop: 8, marginBottom: 24 }]}>
          Two things that are hard to do alone: talking it through, and not being the only one awake.
        </Text>

        <View style={styles.card}>
          {BENEFITS.map((b) => (
            <View key={b.title} style={styles.benefit}>
              <Text style={text.cardTitle}>{b.title}</Text>
              <Text style={[text.body, { marginTop: 4 }]}>{b.body}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 26, gap: 10 }}>
          {loading ? (
            <View style={{ paddingVertical: 28, alignItems: 'center' }}>
              <ActivityIndicator color={sage.primary} />
            </View>
          ) : !offering || offering.packages.length === 0 ? (
            <Text style={styles.warning}>
              Plans aren&apos;t loading right now. Check your connection, or come back in a moment.
            </Text>
          ) : (
            offering.packages.map((pkg) => {
              const active = selected === pkg.identifier;
              const period = periodLabel(pkg.product.subscriptionPeriod);
              return (
                <Pressable
                  key={pkg.identifier}
                  onPress={() => setSelected(pkg.identifier)}
                  style={[styles.plan, active && styles.planActive]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={text.cardTitle}>{pkg.product.title}</Text>
                    {period ? <Text style={text.meta}>Billed every {period}</Text> : null}
                  </View>
                  <Text style={styles.price}>{pkg.product.priceString}</Text>
                </Pressable>
              );
            })
          )}
        </View>

        {isPro ? (
          <Text style={styles.footnote}>You&apos;re already on Pro. Thank you. 💚</Text>
        ) : (
          <Pressable
            disabled={!selected || busy !== null}
            onPress={() => {
              const pkg = offering?.packages.find((p) => p.identifier === selected);
              if (pkg) buy(pkg);
            }}
            style={[styles.cta, (!selected || busy !== null) && { opacity: 0.5 }]}
          >
            {busy && busy !== 'restore' ? (
              <ActivityIndicator color={sage.onPrimary} />
            ) : (
              <Text style={text.button}>Subscribe</Text>
            )}
          </Pressable>
        )}

        <Pressable onPress={restorePurchases} disabled={busy !== null} style={{ paddingVertical: 14 }}>
          <Text style={styles.restore}>{busy === 'restore' ? 'Restoring…' : 'Restore purchases'}</Text>
        </Pressable>

        <Text style={styles.legal}>
          Subscriptions renew automatically until cancelled. Manage or cancel any time in your App Store or
          Google Play account settings.
        </Text>

        {/*
          Apple 3.1.2 requires tappable Terms of Use and Privacy Policy links on
          the screen where the purchase happens, inside the binary — links on
          the store listing alone are one of the most common subscription
          rejections. These open in an in-app browser so the purchase flow is
          not lost to read them.
        */}
        <View style={styles.legalLinks}>
          <Pressable onPress={() => void openLegal(legal.terms)} hitSlop={8} accessibilityRole="link">
            <Text style={styles.legalLink}>Terms of Use</Text>
          </Pressable>
          <Text style={styles.legalDot}>·</Text>
          <Pressable onPress={() => void openLegal(legal.privacy)} hitSlop={8} accessibilityRole="link">
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </Pressable>
        </View>

        {devProAvailable ? (
          <View style={styles.devBox}>
            <Text style={styles.devLabel}>DEV BUILD</Text>
            <Text style={[text.meta, { marginBottom: 10 }]}>
              Grants a 24-hour Pro claim without a purchase. Development projects only.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                disabled={busy !== null}
                onPress={() => toggleDevPro(true)}
                style={[styles.devBtn, busy !== null && { opacity: 0.5 }]}
              >
                <Text style={styles.devBtnText}>{busy === 'dev' ? '…' : 'Grant Pro'}</Text>
              </Pressable>
              <Pressable
                disabled={busy !== null}
                onPress={() => toggleDevPro(false)}
                style={[styles.devBtn, busy !== null && { opacity: 0.5 }]}
              >
                <Text style={styles.devBtnText}>Revoke</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <AuthSheet
        mode={pendingPurchase ? 'create' : null}
        reason="Pro follows your account, not your phone. Add an email now and your subscription survives a new device, a reinstall, or a lost phone."
        onClose={() => setPendingPurchase(null)}
        onDone={async () => {
          const pkg = pendingPurchase;
          setPendingPurchase(null);
          await refresh();
          // Straight back into the purchase they started.
          if (pkg) await buy(pkg);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: sage.bg },
  header: { paddingHorizontal: gutter, paddingTop: 6, alignItems: 'flex-end' },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 13,
    backgroundColor: sage.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.soft,
    ...curve,
  },
  closeText: { fontFamily: font.heading, fontSize: 14, color: sage.fgSecondary },

  scroll: { paddingHorizontal: gutter, paddingTop: 10, paddingBottom: 40 },

  badge: {
    alignSelf: 'flex-start',
    backgroundColor: sage.fillGreen,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontFamily: font.bodySemi,
    fontSize: 10.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: sage.primaryInk,
  },

  card: {
    backgroundColor: sage.surface,
    borderRadius: radius.card,
    padding: 18,
    gap: 16,
    ...shadow.card,
    ...curve,
  },
  benefit: { gap: 2 },

  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: sage.surface,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 16,
    ...shadow.soft,
    ...curve,
  },
  planActive: { borderColor: sage.primary, backgroundColor: sage.fillGreenAlt },
  price: { fontFamily: font.headingBold, fontSize: 16, color: sage.fg },

  warning: {
    fontFamily: font.body,
    fontSize: 12.5,
    lineHeight: 19,
    color: sage.clay,
    backgroundColor: sage.clayFill,
    borderRadius: radius.md,
    padding: 13,
  },

  cta: {
    backgroundColor: sage.primary,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 22,
    ...shadow.soft,
    ...curve,
  },
  restore: { fontFamily: font.ui, fontSize: 13, color: sage.primaryInk, textAlign: 'center' },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  legalLink: {
    fontFamily: font.ui,
    fontSize: 12.5,
    color: sage.primaryInk,
    textDecorationLine: 'underline',
  },
  legalDot: { fontFamily: font.ui, fontSize: 12.5, color: sage.fgFaint },
  footnote: {
    fontFamily: font.body,
    fontSize: 13,
    color: sage.primaryInk,
    textAlign: 'center',
    marginTop: 22,
  },
  legal: {
    fontFamily: font.body,
    fontSize: 11,
    lineHeight: 17,
    color: sage.fgMuted,
    textAlign: 'center',
    marginTop: 8,
  },

  /* Dev-only. Deliberately unlovely so it can never be mistaken for product. */
  devBox: {
    marginTop: 28,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: sage.fgMuted,
  },
  devLabel: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.5,
    color: sage.fgMuted,
    marginBottom: 6,
  },
  devBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: sage.fgMuted,
    alignItems: 'center',
  },
  devBtnText: {
    fontFamily: font.bodySemi,
    fontSize: 12,
    color: sage.fgMuted,
  },
});
