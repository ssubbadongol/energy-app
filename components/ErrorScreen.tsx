/**
 * What the user sees when a render throws.
 *
 * Expo Router picks this up automatically: any route file — including a layout
 * — may export `ErrorBoundary`, and the router wraps that subtree in it. Ours
 * is exported from `app/_layout.tsx`, so it covers the whole app.
 *
 * Without it, an uncaught render error in production is a white screen with no
 * way out and nothing reported. With it, the crash reaches Crashlytics and the
 * user gets a sentence and a button.
 *
 * The tone is deliberate. This app is for people who are already having a hard
 * day; "Something went wrong on our end" is true, takes the blame, and does
 * not ask them to do anything clever.
 */
import { useEffect } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SUPPORT_EMAIL } from '@/app/legal';
import { reportError } from '@/app/monitoring';
import { curve, font, radius, sage } from '@/theme/sage';

interface Props {
  error: Error;
  /** Provided by expo-router: re-renders the subtree that threw. */
  retry: () => Promise<void>;
}

export function ErrorScreen({ error, retry }: Props) {
  useEffect(() => {
    reportError(error, 'render error boundary');
  }, [error]);

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Something went wrong on our end</Text>
        <Text style={styles.body}>
          Not your fault, and nothing you&apos;ve saved is lost. Try again — and if it keeps
          happening, tell us and we&apos;ll fix it.
        </Text>

        <Pressable onPress={() => void retry()} style={styles.cta} accessibilityRole="button">
          <Text style={styles.ctaText}>Try again</Text>
        </Pressable>

        <Pressable
          onPress={() =>
            void Linking.openURL(
              `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Soft Focus crashed')}`,
            )
          }
          style={{ paddingVertical: 12 }}
          accessibilityRole="button"
        >
          <Text style={styles.link}>Tell us what happened</Text>
        </Pressable>

        {/*
          The message, only in development. In a shipped build it would be a
          stack-trace fragment shown to someone who cannot act on it — and
          Crashlytics already has the real thing.
        */}
        {__DEV__ ? <Text style={styles.detail}>{error.message}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: sage.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: sage.surface,
    borderRadius: radius.card,
    padding: 24,
    ...curve,
  },
  title: { fontFamily: font.heading, fontSize: 20, color: sage.fg, marginBottom: 8 },
  body: { fontFamily: font.body, fontSize: 14, lineHeight: 21, color: sage.fgSecondary },
  cta: {
    marginTop: 20,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: sage.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...curve,
  },
  ctaText: { fontFamily: font.heading, fontSize: 15, color: sage.onPrimary },
  link: { fontFamily: font.ui, fontSize: 13, color: sage.primaryInk, textAlign: 'center' },
  detail: {
    fontFamily: font.body,
    fontSize: 11,
    lineHeight: 16,
    color: sage.fgMuted,
    marginTop: 16,
  },
});
