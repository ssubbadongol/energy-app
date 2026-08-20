import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useMotion } from '@/theme/useMotion';

type Feedback = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'none';

/**
 * Press feedback.
 *
 * In this system haptics carry the weight that animation carries elsewhere.
 * There is almost no motion, so the confirmation that the interface heard you
 * is physical rather than visual — and it fires on `onPressIn`, not `onPress`,
 * because feedback that arrives after the finger lifts reads as lag even when
 * nothing is slow.
 *
 * The visual half is deliberately tiny: a 2% scale and a small opacity dip
 * over 120ms. A springy 0.95 bounce belongs to a rounded, friendly system;
 * against flat rectangles it looks like the button is made of rubber.
 */
export function usePressScale(options: { to?: number; feedback?: Feedback } = {}) {
  const { to = 0.98, feedback = 'light' } = options;
  const motion = useMotion();

  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    const t = pressed.value;
    return {
      transform: [{ scale: motion.reduce ? 1 : 1 - (1 - to) * t }],
      opacity: 1 - 0.2 * t,
    };
  });

  const onPressIn = useCallback(() => {
    pressed.value = withTiming(1, { duration: motion.duration.press, easing: motion.ease.out });
    fire(feedback);
  }, [feedback, motion.duration.press, motion.ease.out, pressed]);

  const onPressOut = useCallback(() => {
    pressed.value = withTiming(0, { duration: motion.duration.press, easing: motion.ease.out });
  }, [motion.duration.press, motion.ease.out, pressed]);

  return { animatedStyle, onPressIn, onPressOut };
}

/**
 * Haptic vocabulary for the app. Kept in one place so the same physical
 * sensation always means the same thing:
 *
 *   selection — moving through options, tapping a row
 *   light     — an ordinary button
 *   medium    — committing to something (join a pod, save a task)
 *   heavy     — entering or leaving a focus session
 *   success   — completing a task or finishing a session
 */
export function fire(feedback: Feedback) {
  if (feedback === 'none') return;

  switch (feedback) {
    case 'selection':
      Haptics.selectionAsync().catch(() => {});
      break;
    case 'success':
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      break;
    case 'light':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      break;
    case 'medium':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      break;
    case 'heavy':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      break;
  }
}

export const haptic = fire;
