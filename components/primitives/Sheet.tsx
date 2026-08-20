import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hairline, radius, space } from '@/theme/tokens';
import { Surface, useSurface } from '@/theme/surface';
import { useMotion } from '@/theme/useMotion';
import { Text } from './Text';

export interface SheetProps {
  visible: boolean;
  onDismiss: () => void;
  /** Structural label, caps mono. Not a sentence. */
  label?: string;
  children: ReactNode;
  dismissOnBackdropPress?: boolean;
  testID?: string;
}

/** Past this downward speed (px/s) we dismiss regardless of distance. */
const FLICK_VELOCITY = 450;
const TRAVEL_FRACTION = 0.3;
const RUBBER_BAND = 4;

/**
 * Bottom sheet.
 *
 * Square corners, a single hairline along the top edge, no shadow and no
 * radius. What separates it from the page behind it is the scrim and the rule,
 * nothing else.
 *
 * The gesture details are the same ones that make a sheet feel native
 * anywhere: velocity beats distance, so a fast flick dismisses even if it only
 * travelled 20pt; dragging up past the top is divided by four rather than
 * blocked, because nothing in the physical world stops dead; and the exit is
 * faster than the entrance, because by then the user has already decided.
 */
export function Sheet({
  visible,
  onDismiss,
  label,
  children,
  dismissOnBackdropPress = true,
  testID,
}: SheetProps) {
  const insets = useSafeAreaInsets();
  const motion = useMotion();
  const { c } = useSurface();

  const [mounted, setMounted] = useState(visible);
  const [height, setHeight] = useState(0);

  const translateY = useSharedValue(0);
  const progress = useSharedValue(0);

  const close = useCallback(() => {
    setMounted(false);
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    if (!mounted) return;

    progress.value = withTiming(0, { duration: motion.duration.sheetOut, easing: motion.ease.drawer });
    translateY.value = withTiming(
      motion.travel(height || 400),
      { duration: motion.duration.sheetOut, easing: motion.ease.drawer },
      (done) => {
        if (done) runOnJS(setMounted)(false);
      },
    );
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSheetLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      if (h === height || h === 0) return;

      setHeight(h);
      translateY.value = motion.travel(h);
      progress.value = withTiming(1, { duration: motion.duration.sheet, easing: motion.ease.drawer });
      translateY.value = withTiming(0, { duration: motion.duration.sheet, easing: motion.ease.drawer });
    },
    [height, motion, progress, translateY],
  );

  const pan = Gesture.Pan()
    .activeOffsetY([-12, 12])
    .onUpdate((e) => {
      translateY.value = e.translationY >= 0 ? e.translationY : e.translationY / RUBBER_BAND;
    })
    .onEnd((e) => {
      const far = height > 0 && e.translationY > height * TRAVEL_FRACTION;
      const fast = e.velocityY > FLICK_VELOCITY;

      if (far || fast) {
        progress.value = withTiming(0, { duration: motion.duration.sheetOut, easing: motion.ease.drawer });
        translateY.value = withTiming(
          height || 400,
          { duration: motion.duration.sheetOut, easing: motion.ease.drawer },
          (done) => {
            if (done) runOnJS(close)();
          },
        );
      } else {
        translateY.value = withTiming(0, { duration: motion.duration.sheet, easing: motion.ease.out });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: motion.reduce ? progress.value : 1,
  }));

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  if (!mounted) return null;

  return (
    <Modal transparent visible statusBarTranslucent animationType="none" onRequestClose={close}>
      <Surface>
        <View style={styles.root} testID={testID}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={dismissOnBackdropPress ? close : undefined}
              accessibilityRole="button"
              accessibilityLabel="Close"
            />
          </Animated.View>

          <GestureDetector gesture={pan}>
            <Animated.View
              onLayout={onSheetLayout}
              style={[
                styles.sheet,
                { backgroundColor: c.bg, borderTopColor: c.ruleStrong },
                { paddingBottom: insets.bottom + space[8] },
                sheetStyle,
              ]}
              accessibilityViewIsModal
            >
              <View style={[styles.grabber, { backgroundColor: c.rule }]} />

              {label ? (
                <Text variant="label" tone="muted" style={styles.label}>
                  {label}
                </Text>
              ) : null}

              {children}
            </Animated.View>
          </GestureDetector>
        </View>
      </Surface>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(0, 0, 0, 0.78)' },
  sheet: {
    borderRadius: radius.none,
    borderTopWidth: hairline,
    paddingHorizontal: space[6],
    paddingTop: space[4],
  },
  grabber: {
    width: 32,
    height: hairline,
    alignSelf: 'center',
    marginBottom: space[6],
  },
  label: { marginBottom: space[6] },
});

export default Sheet;
