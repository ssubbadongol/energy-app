/**
 * Settings.
 *
 * This screen exists because four store requirements need somewhere to live
 * and none of them had one:
 *
 *   5.1.1(v)   account deletion, initiated from inside the app
 *   Play       the same, plus a web route for people who uninstalled
 *   3.1.2      reachable Terms and Privacy links in the binary
 *   1.2        published contact information for reporting content
 *
 * It is also where a guest becomes recoverable. The framing throughout is that
 * an account is for *keeping* things, not for permission to use the app —
 * because that is true, and because a wellbeing app that nags for a signup is
 * one people delete.
 */
import { router } from 'expo-router';
import {
  ChevronRight,
  LogOut,
  Mail,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SageBackground } from '@/components/sage/Background';
import { useEntitlement } from '@/components/pro/EntitlementProvider';
import { haptic } from '@/components/primitives/usePressScale';
import { curve, font, gutter, radius, sage, shadow, text } from '@/theme/sage';
import {
  currentAccount,
  refreshVerification,
  sendVerification,
  signOutToGuest,
  notifyAccountSwitched,
  type AccountInfo,
} from '../accountService';
import { AuthSheet } from '../../components/account/AuthSheet';
import { deleteAccount } from '../deleteAccount';
import { MANAGE_SUBSCRIPTION, SUPPORT_EMAIL, legal, openLegal } from '../legal';
import { CLOCK_FORMATS, type ClockFormat, clockFormatExample, clockFormatLabel } from '../clockFormat';
import { getUserProfileSync, saveUserProfile } from '../userProfileStorage';
import { restore } from '../entitlements';

export default function SettingsScreen() {
  const { isPro, refresh } = useEntitlement();
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [clock, setClock] = useState<ClockFormat>(() => getUserProfileSync().clock);
  const [authOpen, setAuthOpen] = useState<'create' | 'signin' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setAccount(await currentAccount());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---------------- verification ---------------- */

  const checkVerified = useCallback(async () => {
    setBusy('verify');
    try {
      // `emailVerified` is baked into the token, so someone who just clicked
      // the link in their inbox still reads as unverified until we reload.
      await refreshVerification();
      const next = await currentAccount();
      setAccount(next);
      if (next.state === 'linked-verified') {
        haptic('success');
        Alert.alert('Verified', 'Your email is confirmed. You can get back into this account any time.');
      } else {
        Alert.alert(
          'Not yet',
          "We can't see a confirmation. Check your inbox — and your spam folder, which is where it usually is.",
        );
      }
    } finally {
      setBusy(null);
    }
  }, []);

  const resend = useCallback(async () => {
    setBusy('resend');
    try {
      await sendVerification();
      Alert.alert('Sent', `Check ${account?.email ?? 'your inbox'}.`);
    } catch (err) {
      Alert.alert('Not sent', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  }, [account?.email]);

  /* ---------------- sign out ---------------- */

  const confirmSignOut = useCallback(() => {
    Alert.alert(
      'Sign out?',
      isPro
        ? 'Your subscription stays with your account. Sign back in on any device to get it back.'
        : 'You can sign back in any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            setBusy('signout');
            try {
              const uid = await signOutToGuest();
              // RevenueCat is still pointed at the old uid until it is told.
              await notifyAccountSwitched(uid);
              await refresh();
              await load();
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  }, [isPro, refresh, load]);

  /* ---------------- deletion ---------------- */

  const confirmDelete = useCallback(() => {
    /**
     * Two steps, and the first one is about billing.
     *
     * Deleting the account does not cancel an App Store or Play subscription —
     * only the store can do that. Someone who deletes without cancelling keeps
     * being charged for an app they no longer have an account for, so the
     * warning comes first and links straight to the place that can stop it.
     */
    const proceed = () => {
      Alert.alert(
        'Delete everything?',
        'Your tasks, your mentor history and your account will be erased. This cannot be undone.',
        [
          { text: 'Keep my account', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              setBusy('delete');
              try {
                await deleteAccount();
                haptic('success');
                await refresh();
                await load();
                Alert.alert(
                  'Deleted',
                  'Everything is gone. You can keep using Soft Focus as a guest.',
                  [{ text: 'OK', onPress: () => router.replace('/(tabs)') }],
                );
              } catch (err) {
                Alert.alert(
                  'Not deleted',
                  err instanceof Error
                    ? err.message
                    : `Something went wrong. Email ${SUPPORT_EMAIL} and we'll do it by hand.`,
                );
              } finally {
                setBusy(null);
              }
            },
          },
        ],
      );
    };

    if (isPro) {
      Alert.alert(
        'Cancel your subscription first',
        'Deleting your account does not stop the billing — only the App Store or Google Play can do that. Cancel there first, or you will keep being charged.',
        [
          { text: 'Back', style: 'cancel' },
          {
            text: 'Open subscriptions',
            onPress: () =>
              void Linking.openURL(
                Platform.OS === 'ios' ? MANAGE_SUBSCRIPTION.ios : MANAGE_SUBSCRIPTION.android,
              ),
          },
          { text: 'Already cancelled', style: 'destructive', onPress: proceed },
        ],
      );
    } else {
      proceed();
    }
  }, [isPro, refresh, load]);

  /* ---------------- render ---------------- */

  const state = account?.state ?? 'guest';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <SageBackground />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Text style={styles.backArrow}>‹</Text>
          </Pressable>
          <Text style={text.title}>Settings</Text>
        </View>

        {/* ---- Account ---- */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>

        {state === 'guest' ? (
          <View style={styles.card}>
            <Text style={text.cardTitle}>You&apos;re using Soft Focus as a guest</Text>
            <Text style={[text.body, { marginTop: 6 }]}>
              That&apos;s completely fine — everything works. But your tasks and history live on this
              phone only. Add an email and they&apos;ll follow you to the next one.
            </Text>
            <Pressable
              onPress={() => setAuthOpen('create')}
              style={styles.primaryBtn}
              accessibilityRole="button"
            >
              <Text style={text.button}>Add an email</Text>
            </Pressable>
            <Pressable onPress={() => setAuthOpen('signin')} style={{ paddingVertical: 12 }}>
              <Text style={[text.meta, { textAlign: 'center' }]}>
                I already have an account
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={text.cardTitle} numberOfLines={1}>
                  {account?.email}
                </Text>
                <Text style={text.meta}>
                  {state === 'linked-verified' ? 'Email confirmed' : 'Email not confirmed yet'}
                </Text>
              </View>
              {state === 'linked-verified' ? (
                <ShieldCheck size={20} color={sage.primary} strokeWidth={1.9} />
              ) : (
                <TriangleAlert size={20} color={sage.clay} strokeWidth={1.9} />
              )}
            </View>

            {state === 'linked-unverified' && (
              <View style={styles.warnBox}>
                <Text style={[text.body, { color: sage.fgBody }]}>
                  Until you confirm it, this email can&apos;t get you back into your account — so a
                  new phone would mean starting over.
                </Text>
                <View style={styles.warnActions}>
                  <Pressable onPress={checkVerified} disabled={busy !== null} style={styles.smallBtn}>
                    {busy === 'verify' ? (
                      <ActivityIndicator size="small" color={sage.primaryInk} />
                    ) : (
                      <Text style={styles.smallBtnText}>I&apos;ve confirmed it</Text>
                    )}
                  </Pressable>
                  <Pressable onPress={resend} disabled={busy !== null} style={styles.smallBtn}>
                    {busy === 'resend' ? (
                      <ActivityIndicator size="small" color={sage.primaryInk} />
                    ) : (
                      <Text style={styles.smallBtnText}>Resend</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ---- Subscription ---- */}
        <Text style={styles.sectionLabel}>SUBSCRIPTION</Text>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={text.cardTitle}>{isPro ? 'Soft Focus Pro' : 'Free'}</Text>
              <Text style={text.meta}>
                {isPro ? 'Mentor and pods unlocked' : 'Mentor and pods are part of Pro'}
              </Text>
            </View>
            {isPro ? <Sparkles size={19} color={sage.primary} strokeWidth={1.9} /> : null}
          </View>

          {!isPro && (
            <Pressable onPress={() => router.push('/paywall')} style={styles.primaryBtn}>
              <Text style={text.button}>See Pro</Text>
            </Pressable>
          )}

          <Row
            label="Restore purchases"
            onPress={async () => {
              setBusy('restore');
              try {
                const result = await restore();
                await refresh();
                Alert.alert(
                  result.isPro ? 'Restored' : 'Nothing to restore',
                  result.isPro
                    ? 'Pro is back on this device.'
                    : result.error ?? "We couldn't find a purchase on this store account.",
                );
              } finally {
                setBusy(null);
              }
            }}
            busy={busy === 'restore'}
          />
          <Row
            label="Manage or cancel"
            onPress={() =>
              void Linking.openURL(
                Platform.OS === 'ios' ? MANAGE_SUBSCRIPTION.ios : MANAGE_SUBSCRIPTION.android,
              )
            }
          />
        </View>

        {/* ---- Display ---- */}
        <Text style={styles.sectionLabel}>CLOCK</Text>
        <View style={styles.card}>
          <Text style={text.cardTitle}>How times are written</Text>
          <Text style={[text.meta, { marginTop: 3 }]}>
            Task times, life routines and reminders all follow this.
          </Text>
          <View style={styles.segment}>
            {CLOCK_FORMATS.map((option) => {
              const on = clock === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    if (on) return;
                    haptic('selection');
                    setClock(option);
                    void saveUserProfile({ clock: option });
                  }}
                  style={[styles.segmentBtn, on && styles.segmentBtnOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${clockFormatLabel[option]} clock, for example ${clockFormatExample[option]}`}
                >
                  <Text style={[styles.segmentLabel, on && { color: sage.primaryDeep }]}>
                    {clockFormatLabel[option]}
                  </Text>
                  {/* The example does the explaining — "12-hour" is a name, "9 PM" is the answer. */}
                  <Text style={[styles.segmentExample, on && { color: sage.primaryInk }]}>
                    {clockFormatExample[option]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ---- Legal. Apple 3.1.2 wants these reachable from inside the app. ---- */}
        <Text style={styles.sectionLabel}>ABOUT</Text>
        <View style={styles.card}>
          <Row label="Privacy Policy" onPress={() => void openLegal(legal.privacy)} first />
          <Row label="Terms of Use" onPress={() => void openLegal(legal.terms)} />
          <Row label="Support and contact" onPress={() => void openLegal(legal.support)} />
          <Row
            label="Email us"
            icon={<Mail size={17} color={sage.fgSecondary} strokeWidth={1.8} />}
            onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          />
        </View>

        {/* ---- Danger ---- */}
        {state !== 'guest' && (
          <Pressable
            onPress={confirmSignOut}
            disabled={busy !== null}
            style={styles.dangerRow}
            accessibilityRole="button"
          >
            <LogOut size={17} color={sage.fgSecondary} strokeWidth={1.9} />
            <Text style={[styles.dangerLabel, { color: sage.fgSecondary }]}>
              {busy === 'signout' ? 'Signing out…' : 'Sign out'}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={confirmDelete}
          disabled={busy !== null}
          style={styles.dangerRow}
          accessibilityRole="button"
        >
          {busy === 'delete' ? (
            <ActivityIndicator size="small" color={sage.danger} />
          ) : (
            <Trash2 size={17} color={sage.danger} strokeWidth={1.9} />
          )}
          <Text style={styles.dangerLabel}>
            {busy === 'delete' ? 'Deleting…' : 'Delete account'}
          </Text>
        </Pressable>

        <Text style={styles.footnote}>
          Deleting removes your tasks, mentor history and account for good. It does not cancel a
          subscription — only the App Store or Google Play can do that.
        </Text>
      </ScrollView>

      <AuthSheet
        mode={authOpen}
        onClose={() => setAuthOpen(null)}
        onDone={async () => {
          setAuthOpen(null);
          await refresh();
          await load();
        }}
      />
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ *
 * Row
 * ------------------------------------------------------------------ */

function Row({
  label,
  onPress,
  busy,
  first,
  icon,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  first?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[styles.row, first && { borderTopWidth: 0 }]}
      accessibilityRole="button"
    >
      {icon}
      <Text style={styles.rowLabel}>{label}</Text>
      {busy ? (
        <ActivityIndicator size="small" color={sage.fgMuted} />
      ) : (
        <ChevronRight size={17} color={sage.fgFaint} strokeWidth={1.8} />
      )}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * Styles
 * ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: sage.bg },
  scroll: { paddingHorizontal: gutter, paddingBottom: 48 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, paddingBottom: 10 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: sage.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.soft,
    ...curve,
  },
  backArrow: { fontFamily: font.headingBold, fontSize: 22, color: sage.fgSecondary, marginTop: -3 },

  sectionLabel: {
    fontFamily: font.ui,
    fontSize: 10.5,
    letterSpacing: 1.4,
    color: sage.fgMuted,
    marginTop: 26,
    marginBottom: 8,
    marginLeft: 2,
  },

  segment: { flexDirection: 'row', gap: 8, marginTop: 14, backgroundColor: sage.fill, borderRadius: 16, padding: 5 },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', gap: 2, ...curve },
  segmentBtnOn: { backgroundColor: sage.fillGreen },
  segmentLabel: { fontFamily: font.heading, fontSize: 13, color: sage.fgFaint },
  segmentExample: { fontFamily: font.body, fontSize: 11.5, color: sage.fgFaint },

  card: {
    backgroundColor: sage.surface,
    borderRadius: radius.card,
    padding: 18,
    ...shadow.card,
    ...curve,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  primaryBtn: {
    marginTop: 14,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: sage.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...curve,
  },

  warnBox: {
    marginTop: 14,
    backgroundColor: sage.clayFill,
    borderRadius: radius.md,
    padding: 14,
    ...curve,
  },
  warnActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  smallBtn: {
    flex: 1,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: sage.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...curve,
  },
  smallBtnText: { fontFamily: font.ui, fontSize: 12.5, color: sage.primaryInk },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: sage.rule,
  },
  rowLabel: { fontFamily: font.ui, fontSize: 14.5, color: sage.fgBody, flex: 1 },

  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 22,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: sage.surface,
    ...shadow.soft,
    ...curve,
  },
  dangerLabel: { fontFamily: font.ui, fontSize: 14.5, color: sage.danger },

  footnote: {
    fontFamily: font.body,
    fontSize: 11.5,
    lineHeight: 17,
    color: sage.fgMuted,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 12,
  },
});
