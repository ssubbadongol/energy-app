/**
 * Wraps a Pro-only screen.
 *
 * Shows the feature to subscribers, an honest upsell to everyone else, and a
 * specific explanation for the two states that are neither — a build with no
 * attestation, and a build with no purchases SDK. Those look identical to a
 * user ("it just doesn't work") and completely different to whoever has to fix
 * them, so they say which is which.
 */
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { SageBackground } from '@/components/sage/Background';
import { curve, font, gutter, radius, sage, shadow, text } from '@/theme/sage';
import { useEntitlement } from './EntitlementProvider';

interface Props {
  /** "Mentor" / "Pods" — used in the upsell copy. */
  feature: string;
  headline: string;
  blurb: string;
  bullets: string[];
  children: React.ReactNode;
}

export function ProGate({ feature, headline, blurb, bullets, children }: Props) {
  const { isPro, loading, appCheckReady, purchasesAvailable, error } = useEntitlement();

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <SageBackground />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={sage.primary} />
          <Text style={[text.body, { marginTop: 12 }]}>Checking your plan…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isPro) {
    // Attestation is enforced server-side, so an unattested build would fail
    // every call with an opaque error. Say so plainly instead.
    if (!appCheckReady) {
      return (
        <Notice
          title="This build isn't verified"
          body={`${feature} needs Firebase App Check, which isn't active in this build. Install a development or production build that includes the native App Check module — your subscription is fine.`}
        />
      );
    }
    return <>{children}</>;
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <SageBackground />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Soft Focus Pro</Text>
        </View>

        <Text style={[text.title, { marginTop: 14 }]}>{headline}</Text>
        <Text style={[text.body, { marginTop: 8, marginBottom: 22 }]}>{blurb}</Text>

        <View style={styles.card}>
          {bullets.map((b) => (
            <View key={b} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={[text.body, { flex: 1, color: sage.fgBody }]}>{b}</Text>
            </View>
          ))}
        </View>

        {!purchasesAvailable ? (
          <Text style={styles.warning}>
            The purchases SDK isn&apos;t in this build, so nothing can be bought here yet. Run a custom
            development build to test the paywall.
          </Text>
        ) : null}
        {error ? <Text style={styles.warning}>{error}</Text> : null}

        <Pressable style={styles.cta} onPress={() => router.push('/paywall')}>
          <Text style={text.button}>See plans</Text>
        </Pressable>

        <Text style={styles.footnote}>
          Everything else in Soft Focus — your tasks, routines and focus sessions — stays free.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <SageBackground />
      <View style={[styles.center, { paddingHorizontal: gutter }]}>
        <Text style={[text.h2, { textAlign: 'center' }]}>{title}</Text>
        <Text style={[text.body, { textAlign: 'center', marginTop: 10 }]}>{body}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: sage.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: gutter, paddingTop: 18, paddingBottom: 40 },

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
    gap: 13,
    ...shadow.card,
    ...curve,
  },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  bulletDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: sage.leaf, marginTop: 7 },

  warning: {
    fontFamily: font.body,
    fontSize: 12.5,
    lineHeight: 19,
    color: sage.clay,
    backgroundColor: sage.clayFill,
    borderRadius: radius.md,
    padding: 13,
    marginTop: 16,
  },

  cta: {
    backgroundColor: sage.primary,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 22,
    ...shadow.soft,
    ...curve,
  },
  footnote: {
    fontFamily: font.body,
    fontSize: 12,
    lineHeight: 18,
    color: sage.fgMuted,
    textAlign: 'center',
    marginTop: 16,
  },
});
