import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, sage } from '@/theme/sage';

/** Emoji tab icon with the active green pill, per the Claude Design mockup. */
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={[styles.pill, focused && styles.pillActive]}>
      <Text style={[styles.emoji, { opacity: focused ? 1 : 0.5, transform: [{ scale: focused ? 1.1 : 1 }] }]}>{emoji}</Text>
    </View>
  );
}

/**
 * Tab bar — sage redesign.
 *
 * A soft white bar with rounded top corners floating over the paper shell,
 * Quicksand labels, and emoji icons that sit in a green pill when active.
 * Height includes the safe-area inset (via paddingBottom) so the Android
 * gesture bar never overlaps the controls.
 */
export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: sage.primaryDeep,
        tabBarInactiveTintColor: sage.fgFaint,
        tabBarStyle: {
          backgroundColor: sage.surface,
          borderTopWidth: 0,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          elevation: 12,
          shadowColor: '#587869',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.09,
          shadowRadius: 20,
          height: 62 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontFamily: font.heading,
          fontSize: 10,
          marginTop: 4,
        },
        sceneStyle: { backgroundColor: sage.bg },
      }}
    >
      {/* The five tabs: Today · Life · Mentor · Pods · Focus */}
      <Tabs.Screen
        name="index"
        options={{ title: 'Today', tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} /> }}
      />
      <Tabs.Screen
        name="life"
        options={{ title: 'Life', tabBarIcon: ({ focused }) => <TabIcon emoji="🌱" focused={focused} /> }}
      />
      <Tabs.Screen
        name="mentor"
        options={{ title: 'Mentor', tabBarIcon: ({ focused }) => <TabIcon emoji="🦊" focused={focused} /> }}
      />
      <Tabs.Screen
        name="pods"
        options={{ title: 'Pods', tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} /> }}
      />
      <Tabs.Screen
        name="focus"
        options={{ title: 'Focus', tabBarIcon: ({ focused }) => <TabIcon emoji="🎯" focused={focused} /> }}
      />

      {/* Routes kept reachable (via router.push) but off the tab bar */}
      <Tabs.Screen name="all-tasks" options={{ href: null }} />
      <Tabs.Screen name="add-task" options={{ href: null }} />

      {/* Hide files that have default exports but aren't real tabs */}
      <Tabs.Screen name="LifeTaskModal" options={{ href: null }} />
      <Tabs.Screen name="TaskEditModal" options={{ href: null }} />
      <Tabs.Screen name="PinnedTaskBanner" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  pill: { width: 44, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pillActive: { backgroundColor: sage.fillGreen },
  emoji: { fontSize: 18, lineHeight: 22 },
});
