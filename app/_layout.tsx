import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { handleNotificationResponse, setupNotifications } from './(tabs)/notificationService';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const [fontsLoaded] = useFonts({
    'Nunito-Regular': require('../assets/fonts/nunito/Nunito-Regular.ttf'),
    'Nunito-Medium': require('../assets/fonts/nunito/Nunito-Medium.ttf'),
    'Nunito-SemiBold': require('../assets/fonts/nunito/Nunito-SemiBold.ttf'),
    'Nunito-Bold': require('../assets/fonts/nunito/Nunito-Bold.ttf'),
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
          <StatusBar style="light" />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}