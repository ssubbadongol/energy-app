import { Tabs } from 'expo-router';
import { Eye, Heart, Home, MessageCircle, Users } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontFamily, hairline, palette } from '@/theme/tokens';

const c = palette.light;

/**
 * Tab bar.
 *
 * Three deliberate departures from what was here before, each fixing a real
 * bug rather than a style preference:
 *
 * 1. **Not `position: 'absolute'`.** An absolute tab bar floats over the
 *    content without reserving any layout space, so every screen's last
 *    element sat underneath it. Laid out in flow, the content box simply ends
 *    where the tab bar begins and nothing can be clipped.
 *
 * 2. **Height includes the safe-area inset.** React Navigation adds the bottom
 *    inset to the tab bar automatically — but only if you do not hard-code
 *    `height`. The previous `height: 68` overrode that, which is why the
 *    Android gesture bar was drawn on top of the tabs. Setting
 *    `56 + insets.bottom` with matching `paddingBottom` puts the controls
 *    above the system bar and lets the bar sit in the padding.
 *
 * 3. **Mono labels in the paper palette.** The bar was still `#09090BF0` in
 *    Nunito — a black strip under a warm-paper app.
 */
export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.fg,
        tabBarInactiveTintColor: c.fgSecondary,
        // A hairline, matching every other separator in the app.
        tabBarStyle: {
          backgroundColor: c.bg,
          borderTopColor: c.rule,
          borderTopWidth: hairline,
          elevation: 0,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontFamily: fontFamily.monoMedium,
          fontSize: 9,
          letterSpacing: 1.08, // 0.12em
          textTransform: 'uppercase',
          marginTop: 2,
        },
        sceneStyle: { backgroundColor: c.bg },
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
