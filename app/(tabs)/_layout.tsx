import { Redirect, Tabs, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MascotProvider } from '@/components/mascot';
import { SageBackground } from '@/components/sage/Background';
import { font, sage } from '@/theme/sage';
import { useMotion } from '@/theme/useMotion';
import { isOnboarded } from '../userProfileStorage';

/** Matches `tabBarStyle.height` below, minus the safe-area inset. */
const TAB_BAR = 62;

/**
 * Emoji tab icon with the active green pill, per the Claude Design mockup.
 *
 * The pill is a separate layer behind the emoji rather than a background on
 * the wrapper, because a backgroundColor can't be faded without dragging the
 * emoji's opacity down with it. Nothing here carries `elevation`, so unlike the
 * screens it is safe to animate opacity on directly.
 */
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  const motion = useMotion();
  const on = useSharedValue(focused ? 1 : 0);

  // Half the tab duration: `focused` flips at the handover, so a half-length
  // fade finishes exactly as the curtain clears rather than trailing after it.
  const half = Math.round(motion.duration.tab / 2);

  useEffect(() => {
    on.value = withTiming(focused ? 1 : 0, { duration: half, easing: motion.ease.out });
  }, [focused, half, motion.ease.out, on]);

  const fillStyle = useAnimatedStyle(() => ({ opacity: on.value }));

  const emojiStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + 0.5 * on.value,
    transform: [{ scale: motion.reduce ? 1 : 1 + 0.1 * on.value }],
  }));

  return (
    <View style={styles.pill}>
      <Reanimated.View style={[StyleSheet.absoluteFill, styles.pillFill, fillStyle]} />
      <Reanimated.Text style={[styles.emoji, emojiStyle]}>{emoji}</Reanimated.Text>
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
  const motion = useMotion();
  const [gate, setGate] = useState<'loading' | 'onboard' | 'ready'>('loading');

  // Re-check on focus so returning from onboarding lands in the app.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      isOnboarded().then((done) => { if (alive) setGate(done ? 'ready' : 'onboard'); });
      return () => { alive = false; };
    }, []),
  );

  const curtain = useRef(new Animated.Value(0)).current;
  const busy = useRef(false);
  const half = Math.round(motion.duration.tab / 2);

  /**
   * Fade out, swap, fade in — by moving a curtain, not the screens.
   *
   * The obvious implementation is the navigator's own `animation: 'fade'`,
   * which animates opacity on each scene. On Android that does not work here.
   * Card shadows in this app are `elevation`, and an elevation shadow is drawn
   * by the parent from the child's outline rather than by the child itself, so
   * it does not reliably take the ancestor's alpha. The outgoing screen goes
   * fully transparent and leaves its shadows behind at full strength, sitting
   * over the incoming screen — two sets of shadows and one set of cards.
   *
   * So nothing holding an `elevation` is ever faded. The screens swap
   * instantly, underneath a curtain that fades in and back out. The curtain
   * paints `SageBackground` — the same backdrop every tab already sits on — so
   * the dip reads as the cards dissolving away to the scene behind them and
   * the next set dissolving in, rather than as a blank.
   */
  const throughCurtain = useCallback((swap: () => void) => {
    busy.current = true;
    Animated.timing(curtain, {
      toValue: 1,
      duration: half,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) { busy.current = false; return; }
      swap();
      // One frame for the incoming screen to lay out before it is uncovered,
      // or a tab mounting for the first time is revealed half-drawn.
      requestAnimationFrame(() => {
        Animated.timing(curtain, {
          toValue: 0,
          duration: half,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }).start(() => { busy.current = false; });
      });
    });
  }, [curtain, half]);

  if (gate === 'loading') return null;
  if (gate === 'onboard') return <Redirect href="/onboarding" />;

  return (
    <View style={styles.root}>
      <MascotProvider>
        <Tabs
          screenListeners={({ navigation, route }) => ({
            tabPress: (e) => {
              // Re-pressing the current tab keeps its default (scroll to top), and
              // a press landing mid-transition falls through to an instant switch
              // rather than queueing a second curtain behind the first.
              if (navigation.isFocused() || busy.current) return;
              e.preventDefault();
              throughCurtain(() => navigation.navigate(route.name as never));
            },
          })}
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
              height: TAB_BAR + insets.bottom,
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
          {/* The five tabs: Today · Life · Mentor · Pods · Focus (Pomodoro) */}
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
            name="pomodoro"
            options={{ title: 'Focus', tabBarIcon: ({ focused }) => <TabIcon emoji="🎯" focused={focused} /> }}
          />

          {/* ── Routes reachable via router.push, but off the tab bar ── */}
          {/*
            The calendar. Off the tab bar because five tabs is already the
            limit of a bar people can read at a glance, and it is somewhere you
            go on purpose — from the button on the Today header.
          */}
          <Tabs.Screen name="calendar" options={{ href: null }} />
          {/*
            Settings is off the tab bar but must stay easy to find: it holds
            account deletion (5.1.1(v)) and the Privacy/Terms links (3.1.2), and
            a reviewer has to be able to reach both. The Today header opens it.
          */}
          <Tabs.Screen name="settings" options={{ href: null }} />

          {/*
            Not routes at all — files with default exports that expo-router
            would otherwise turn into tabs. Both are currently unreferenced;
            see the note in the session that removed the task screens.
          */}
          <Tabs.Screen name="LifeTaskModal" options={{ href: null }} />
          <Tabs.Screen name="PinnedTaskBanner" options={{ href: null }} />
        </Tabs>
      </MascotProvider>

      {/*
        Sized to the scene area, not the window: it stops at the top of the tab
        bar so the bar stays live through the transition, and `SageBackground`
        anchors its photo to the bottom of whatever box it is given, so matching
        the scene's box is what keeps the backdrop from shifting under the fade.

        `needsOffscreenAlphaCompositing` because the curtain is a photo with a
        translucent wash over it — two overlapping layers, which Android would
        otherwise fade separately and land on the wrong blend on the way through.
      */}
      <Animated.View
        pointerEvents="none"
        needsOffscreenAlphaCompositing
        style={[styles.curtain, { bottom: TAB_BAR + insets.bottom, opacity: curtain }]}
      >
        <SageBackground />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: sage.bg },
  curtain: { position: 'absolute', left: 0, right: 0, top: 0 },
  pill: { width: 44, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pillFill: { borderRadius: 12, backgroundColor: sage.fillGreen },
  emoji: { fontSize: 18, lineHeight: 22 },
});
