import { DefaultTheme, ThemeProvider, type Theme } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import {
  IBMPlexMono_300Light,
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono';
import {
  InstrumentSerif_400Regular,
  InstrumentSerif_400Regular_Italic,
} from '@expo-google-fonts/instrument-serif';
import {
  Quicksand_400Regular,
  Quicksand_500Medium,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
} from '@expo-google-fonts/quicksand';
import {
  NunitoSans_300Light,
  NunitoSans_400Regular,
  NunitoSans_600SemiBold,
  NunitoSans_700Bold,
} from '@expo-google-fonts/nunito-sans';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { handleNotificationResponse, setupNotifications } from './(tabs)/notificationService';
import { syncLifeReminders } from './lifeReminderService';
import { initializeLifeTasks } from './lifeTaskStorage';
import { initMonitoring } from './monitoring';
import { EntitlementProvider } from '@/components/pro/EntitlementProvider';
import { BuildBadge } from '@/components/BuildBadge';
import { CelebrationProvider } from '@/components/sage/Celebration';
import { sage } from '@/theme/sage';

export const unstable_settings = {
  anchor: '(tabs)',
};

/**
 * Expo Router looks for this export by name and wraps the whole app in it.
 *
 * Without one, an uncaught render error in a shipped build is a white screen
 * with no way out and nothing reported to anyone.
 */
export { ErrorScreen as ErrorBoundary } from '@/components/ErrorScreen';

const paper = { bg: sage.bg, fg: sage.fg, rule: sage.ruleStrong, accent: sage.primary };

/**
 * React Navigation paints its own background behind every screen and behind
 * the gaps during a transition. Left on the default it flashes white — or,
 * previously, black — between screens regardless of what the screens
 * themselves are painted in.
 */
const navTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: paper.bg,
    card: paper.bg,
    text: paper.fg,
    border: paper.rule,
    primary: paper.accent,
    notification: paper.accent,
  },
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    // Display: Instrument Serif, one weight, never below 28pt.
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    // Everything else: IBM Plex Mono.
    IBMPlexMono_300Light,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
    // Sage redesign: Quicksand (headings/UI) + Nunito Sans (body).
    Quicksand_400Regular,
    Quicksand_500Medium,
    Quicksand_600SemiBold,
    Quicksand_700Bold,
    NunitoSans_300Light,
    NunitoSans_400Regular,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
    // Retained only for the off-tab legacy task screens.
    'Nunito-Regular':   require('../assets/fonts/nunito/Nunito-Regular.ttf'),
    'Nunito-Medium':    require('../assets/fonts/nunito/Nunito-Medium.ttf'),
    'Nunito-SemiBold':  require('../assets/fonts/nunito/Nunito-SemiBold.ttf'),
    'Nunito-Bold':      require('../assets/fonts/nunito/Nunito-Bold.ttf'),
  });

  useEffect(() => {
    // Before anything else that could fail, so a crash during startup is still
    // reported. Cheap and synchronous — it only flips collection flags.
    initMonitoring();

    // Life reminders are rebuilt here rather than on the Life tab, because the
    // schedule has to survive a cold start the user never navigates into — and
    // it has to come after the permission prompt and after the tasks are read
    // off disk, neither of which has happened yet at this point.
    void setupNotifications()
      .then(() => initializeLifeTasks())
      .then((tasks) => syncLifeReminders(tasks))
      .catch((err) => console.warn('[life] Reminder sync on boot failed', err));

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationResponse(response);
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: paper.bg }}>
      <SafeAreaProvider>
        <ThemeProvider value={navTheme}>
          {/*
            App Check and RevenueCat are both initialised inside this provider,
            before any screen can call a Pro-gated function. Wrapping the whole
            stack means the Mentor and Pods tabs never disagree about whether
            the user is subscribed.
          */}
          {/*
            Outside the Stack so a burst can outlive the row it came from and
            draw over the tab bar — confetti clipped to a list item is just a
            coloured rectangle.
          */}
          <CelebrationProvider>
            <EntitlementProvider>
              <Stack screenOptions={{ contentStyle: { backgroundColor: paper.bg } }}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
                <Stack.Screen name="paywall" options={{ headerShown: false, presentation: 'modal' }} />
              </Stack>
            </EntitlementProvider>
          </CelebrationProvider>
          {/* Dark glyphs: the app is warm paper, not a dark theme. */}
          <StatusBar style="dark" />
          {/* Outside the Stack so it survives navigation. No-op in production. */}
          <BuildBadge />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
