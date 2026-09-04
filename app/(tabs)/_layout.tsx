import { Tabs } from 'expo-router';
import { Eye, Heart, Home, MessageCircle, Users } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, sage } from '@/theme/sage';

/**
 * Tab bar — sage redesign.
 *
 * A soft white bar with rounded top corners floating over the pale paper
 * shell, Quicksand labels, and the active tab tinted with the primary green.
 * Height still includes the safe-area inset (letting React Navigation manage
 * it via paddingBottom) so the Android gesture bar never overlaps the controls.
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
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontFamily: font.heading,
          fontSize: 10,
          marginTop: 2,
        },
        sceneStyle: { backgroundColor: sage.bg },
      }}
    >
      {/* The five tabs: Today · Life · Mentor · Pods · Focus */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color }) => <Home size={20} color={color} strokeWidth={1.25} />,
        }}
      />
      <Tabs.Screen
        name="life"
        options={{
          title: 'Life',
          tabBarIcon: ({ color }) => <Heart size={20} color={color} strokeWidth={1.25} />,
        }}
      />
      <Tabs.Screen
        name="mentor"
        options={{
          title: 'Mentor',
          tabBarIcon: ({ color }) => <MessageCircle size={20} color={color} strokeWidth={1.25} />,
        }}
      />
      <Tabs.Screen
        name="pods"
        options={{
          title: 'Pods',
          tabBarIcon: ({ color }) => <Users size={20} color={color} strokeWidth={1.25} />,
        }}
      />
      <Tabs.Screen
        name="focus"
        options={{
          title: 'Focus',
          tabBarIcon: ({ color }) => <Eye size={20} color={color} strokeWidth={1.25} />,
        }}
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
