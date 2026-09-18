/**
 * The room: the shell, plus whatever the layout says is in it.
 *
 * It is the whole Pomodoro tab, so it covers the screen rather than fitting
 * inside it — scaled up until it fills, anchored to the bottom. See slots.ts
 * for why that beats stretching or re-anchoring.
 *
 * Four layers, because they move at different rates and for different reasons:
 *
 *   shell + items   redrawn once a second, since the clock is in here
 *   breeze          the parts that drift — leaves, mostly — rocked very
 *                   slightly and endlessly
 *   steam           wisps off anything that declares a steam point
 *   dust            a few specks turning over in the light
 *
 * The last three are what stop this reading as a poster with a panda on it, and
 * all three stop dead under Reduce Motion, which is that setting's whole
 * purpose. The clock does not, because the clock is information.
 */
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useMotion } from '@/theme/useMotion';
import type { RoomState } from './items';
import { DEFAULT_LAYOUT, resolveLayout, type RoomLayout } from './layout';
import { room } from './palette';
import { HORIZON, project, SLOTS, VB_H, VB_W } from './slots';

interface Props {
  state: RoomState;
  layout?: RoomLayout;
  width: number;
  height: number;
}

/* ------------------------------------------------------------------ *
 * Shell
 * ------------------------------------------------------------------ */

const Shell = memo(function Shell() {
  return (
    <>
      <Defs>
        <LinearGradient id="roomWall" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={room.wallTop} />
          <Stop offset="1" stopColor={room.wallBottom} />
        </LinearGradient>
        <LinearGradient id="roomFloor" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={room.floor} />
          <Stop offset="1" stopColor={room.floorDark} />
        </LinearGradient>
      </Defs>

      <Rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#roomWall)" />
      <Rect x="0" y={HORIZON} width={VB_W} height={VB_H - HORIZON} fill="url(#roomFloor)" />
      {/* skirting board, the one line that sells the corner of a room */}
      <Rect x="0" y={HORIZON - 10} width={VB_W} height={12} fill={room.skirting} />
      <Path
        d={`M0,${HORIZON - 10} H${VB_W} M0,${HORIZON + 2} H${VB_W}`}
        stroke={room.ink}
        strokeWidth={2.4}
      />
      {/* floorboards, fading as they come forward */}
      <Path d={`M0,${HORIZON + 38} H${VB_W}`} stroke={room.floorDark} strokeWidth={2} opacity={0.5} />
      <Path d={`M0,${HORIZON + 88} H${VB_W}`} stroke={room.floorDark} strokeWidth={2} opacity={0.3} />
    </>
  );
});

/* ------------------------------------------------------------------ *
 * Steam
 * ------------------------------------------------------------------ */

function Wisp({ left, top, delay, size }: { left: number; top: number; delay: number; size: number }) {
  const t = useSharedValue(0);
  const motion = useMotion();

  useEffect(() => {
    cancelAnimation(t);
    if (motion.reduce) {
      t.value = 0;
      return;
    }
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.quad) }), -1, false),
    );
    return () => cancelAnimation(t);
  }, [delay, motion.reduce, t]);

  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.15 ? (t.value / 0.15) * 0.45 : (1 - t.value) * 0.45,
    transform: [{ translateY: -t.value * 26 }, { translateX: Math.sin(t.value * 6) * 3 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left,
          top,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: '#ffffff',
        },
        style,
      ]}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Dust
 * ------------------------------------------------------------------ */

function Mote({
  phase, x, drift, size, width, height, clock,
}: {
  phase: number;
  x: number;
  drift: number;
  size: number;
  width: number;
  height: number;
  clock: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const p = (clock.value + phase) % 1;
    return {
      opacity: Math.sin(p * Math.PI) * 0.3,
      transform: [
        { translateX: x * width + Math.sin(p * Math.PI * 2) * drift },
        { translateY: height * (0.9 - p * 0.6) },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', width: size, height: size, borderRadius: size, backgroundColor: '#fff8ee' },
        style,
      ]}
    />
  );
}

/* ------------------------------------------------------------------ *
 * The room
 * ------------------------------------------------------------------ */

export function Room({ state, layout = DEFAULT_LAYOUT, width, height }: Props) {
  const motion = useMotion();
  const sway = useSharedValue(0);
  const dust = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(sway);
    cancelAnimation(dust);
    if (motion.reduce) {
      sway.value = 0;
      dust.value = 0;
      return;
    }
    // Slow and small. A draught, not a gale.
    sway.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: 3400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    dust.value = withRepeat(withTiming(1, { duration: 15000, easing: Easing.linear }), -1, false);
    return () => {
      cancelAnimation(sway);
      cancelAnimation(dust);
    };
  }, [motion.reduce, sway, dust]);

  const breezeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sway.value * (width / VB_W) * 1.6 }],
  }));

  const placed = resolveLayout(layout);
  const drifting = placed.filter((p) => p.item.breeze);
  // Steam points are in viewBox units; the wisps are plain views, so they need
  // the same cover transform the SVG is drawn with.
  const p = project(width, height);
  const steaming = placed
    .map((q) => (q.item.steam ? q.item.steam(SLOTS[q.slot]) : null))
    .filter((v): v is { x: number; y: number } => v !== null)
    .map((v) => p.at(v.x, v.y));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={StyleSheet.absoluteFill}>
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMax slice"
        >
          <Shell />
          {placed.map(({ slot, item }) => (
            <G key={`${slot}:${item.id}`}>{item.draw(SLOTS[slot], state)}</G>
          ))}
        </Svg>
      </View>

      <Animated.View style={[StyleSheet.absoluteFill, breezeStyle]}>
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMax slice"
        >
          {drifting.map(({ slot, item }) => (
            <G key={`${slot}:${item.id}`}>{item.breeze!(SLOTS[slot], state)}</G>
          ))}
        </Svg>
      </Animated.View>

      {steaming.map((q, i) => (
        <View key={i} style={StyleSheet.absoluteFill}>
          <Wisp left={q.x - 3} top={q.y - 6} delay={0} size={6} />
          <Wisp left={q.x + 3} top={q.y - 2} delay={1100} size={5} />
          <Wisp left={q.x - 1} top={q.y} delay={2200} size={4} />
        </View>
      ))}

      {!motion.reduce && (
        <View style={StyleSheet.absoluteFill}>
          <Mote phase={0} x={0.22} drift={14} size={4} width={width} height={height} clock={dust} />
          <Mote phase={0.38} x={0.64} drift={10} size={3} width={width} height={height} clock={dust} />
          <Mote phase={0.71} x={0.86} drift={16} size={3.5} width={width} height={height} clock={dust} />
        </View>
      )}
    </View>
  );
}

export default Room;
