/**
 * An hour picker you scroll, the way an alarm clock works.
 *
 * It replaces a pair of plus/minus steppers. Those were fine for nudging an
 * hour either way and hopeless for anything else: 9 AM to 9 PM was twelve
 * separate taps, and the meridiem never appeared as a thing you could change
 * — you had to walk the clock all the way round to it.
 *
 * It is one column of numbers and nothing more, so the caller decides what a
 * column means. On a 24-hour clock that is a single wheel of all twenty-four
 * hours; on a 12-hour one it is a wheel of twelve beside a second wheel
 * holding AM and PM. Either way crossing noon is a scroll rather than a
 * journey.
 *
 * The wheel snaps, so the value is only ever one of the listed numbers and
 * whatever sits under the band is exactly what is selected.
 */
import React, { useEffect, useRef } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { haptic } from '@/components/primitives/usePressScale';
import { curve, font, radius, sage } from '@/theme/sage';

/** Row height. Everything else is derived from it, so the maths stays honest. */
const ITEM_H = 40;
/**
 * Odd, so there is a middle row for the band to sit on. Three rather than
 * five: with a start wheel and an end wheel stacked, five rows each makes the
 * editor taller than the screen, and three is still unmistakably a wheel.
 */
const VISIBLE = 3;
const PAD = (ITEM_H * (VISIBLE - 1)) / 2;

interface Props {
  /** The hours this wheel may show, in order. */
  values: number[];
  value: number;
  onChange: (hour: number) => void;
  /** How each hour reads — "9 PM", or "Midnight" for a window's far end. */
  label: (hour: number) => string;
  accessibilityLabel: string;
  testID?: string;
}

export function HourWheel({ values, value, onChange, label, accessibilityLabel, testID }: Props) {
  const ref = useRef<Animated.ScrollView>(null);
  // A stored hour outside this wheel's domain — a legacy row, or a value the
  // other wheel has just invalidated — lands on the nearest one it does have,
  // rather than silently snapping to the top of the list.
  const exact = values.indexOf(value);
  const index = exact >= 0
    ? exact
    : values.reduce(
        (best, v, i) => (Math.abs(v - value) < Math.abs(values[best] - value) ? i : best),
        0,
      );

  const offset = useSharedValue(index * ITEM_H);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      offset.value = e.contentOffset.y;
    },
  });

  /*
    Follow the value when it is changed from outside — which happens whenever
    the start hour is pushed past the end and drags it along. Without this the
    wheel keeps showing the old hour while the label above it shows the new
    one, and the two disagree until you touch it.

    Unanimated on purpose: this is a correction, not a movement the user made,
    and animating it would read as the wheel spinning on its own.
  */
  useEffect(() => {
    ref.current?.scrollTo({ y: index * ITEM_H, animated: false });
    offset.value = index * ITEM_H;
  }, [index, offset]);

  const commit = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const raw = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    const next = values[Math.min(values.length - 1, Math.max(0, raw))];
    if (next !== undefined && next !== value) {
      haptic('selection');
      onChange(next);
    }
  };

  return (
    <View style={styles.root} accessibilityLabel={accessibilityLabel} testID={testID}>
      {/* Behind the rows, so the selected hour reads as sitting in it. */}
      <View pointerEvents="none" style={styles.band} />

      <Animated.ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={onScroll}
        // Both, and not just the first: a slow drag released without a flick
        // produces no momentum at all, and on its own `onMomentumScrollEnd`
        // would silently drop that gesture.
        onMomentumScrollEnd={commit}
        onScrollEndDrag={commit}
        contentContainerStyle={{ paddingVertical: PAD }}
      >
        {values.map((hour, i) => (
          <Row key={hour} i={i} text={label(hour)} offset={offset} />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

/**
 * One hour in the column, fading and shrinking with distance from the middle.
 *
 * Opacity is safe here, unlike almost everywhere else in this app: these rows
 * carry no `elevation`, so there is no shadow to be left behind at full
 * strength when the view fades.
 */
function Row({ i, text, offset }: { i: number; text: string; offset: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const distance = Math.abs(offset.value / ITEM_H - i);
    return {
      opacity: interpolate(distance, [0, 1, 2], [1, 0.4, 0.16], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(distance, [0, 1], [1, 0.86], Extrapolation.CLAMP) }],
    };
  });

  return (
    <Animated.View style={[styles.row, style]}>
      <Text style={styles.hour} numberOfLines={1}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { height: ITEM_H * VISIBLE, alignSelf: 'stretch', justifyContent: 'center' },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: PAD,
    height: ITEM_H,
    borderRadius: radius.sm,
    backgroundColor: sage.fillGreen,
    ...curve,
  },
  row: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  hour: { fontFamily: font.heading, fontSize: 16, color: sage.fgBody },
});
