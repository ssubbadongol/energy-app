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
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { handleNotificationResponse, setupNotifications } from './(tabs)/notificationService';
import { palette } from '@/theme/tokens';

export const unstable_settings = {
  anchor: '(tabs)',
};

const paper = palette.light;

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
    // Retained only for the screens not yet migrated off the old system.
    'Nunito-Regular':   require('../assets/fonts/nunito/Nunito-Regular.ttf'),
    'Nunito-Medium':    require('../assets/fonts/nunito/Nunito-Medium.ttf'),
    'Nunito-SemiBold':  require('../assets/fonts/nunito/Nunito-SemiBold.ttf'),
    'Nunito-Bold':      require('../assets/fonts/nunito/Nunito-Bold.ttf'),
  });

  useEffect(() => {
    setupNotifications();
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
          <Stack screenOptions={{ contentStyle: { backgroundColor: paper.bg } }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
          {/* Dark glyphs: the app is warm paper, not a dark theme. */}
          <StatusBar style="dark" />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
