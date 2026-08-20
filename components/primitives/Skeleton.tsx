import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { hairline, space } from '@/theme/tokens';
import { useSurface } from '@/theme/surface';
import { useMotion } from '@/theme/useMotion';
import { Text } from './Text';

/**
 * Loading placeholder.
 *
 * A pulsing grey block would be a *fill*, and this system has none — it would
 * be the only solid shape on the screen and would read as a rendering bug. So
 * the placeholder is built from the same hairline rules that structure the
 * rest of the app, at varying widths, breathing very slightly.
 *
 * The pulse is slow (1400ms) and shallow (0.3 → 0.7 opacity). Anything faster
 * or higher-contrast reads as an alarm rather than a wait, which is precisely
 * wrong for this audience.
 */
export const SkeletonRule = memo(function SkeletonRule({ width = '100%' }: { width?: number | `${number}%` }) {
  const { c } = useSurface();
  const motion = useMotion();
  const pulse = useSharedValue(0.3);

  useEffect(() => {
    if (motion.reduce) {
      pulse.value = 0.5;
      return;
    }
    pulse.value = withRepeat(withTiming(0.7, { duration: 1400, easing: motion.ease.inOut }), -1, true);
  }, [motion.reduce, motion.ease.inOut, pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height: hairline, backgroundColor: c.fg }, animatedStyle]}
    />
  );
});

/**
 * The default list placeholder: ruled rows at irregular widths, so it reads as
 * text-shaped rather than as a loading widget. Carries a caps-mono LOADING
 * label because with no spinner and no fill, the state needs to be named.
 */
export const SkeletonList = memo(function SkeletonList({ rows = 4 }: { rows?: number }) {
  const widths: `${number}%`[] = ['72%', '54%', '81%', '46%', '65%', '58%'];

  return (
    <View accessibilityLabel="Loading" accessibilityRole="progressbar">
      <Text variant="label" tone="faint" style={styles.label}>
        Loading
      </Text>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.row}>
          <SkeletonRule width={widths[i % widths.length]} />
          <View style={styles.gap} />
          <SkeletonRule width={widths[(i + 3) % widths.length]} />
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  label: { marginBottom: space[6] },
  row: { paddingVertical: space[5] },
  gap: { height: space[3] },
});

export const Skeleton = SkeletonRule;
export default SkeletonRule;
