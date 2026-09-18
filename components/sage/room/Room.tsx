/**
 * The room: the shell, plus whatever the layout says is in it.
 *
 * Three layers, because they move at different rates and for different reasons:
 *
 *   shell + items   drawn once per timer tick; the clock is in here
 *   breeze          the parts that drift — leaves, mostly — rocked very
 *                   slightly and endlessly
 *   steam           wisps off anything that declares a steam point
 *
 * The breeze and the steam are what stop this reading as a poster with a panda
 * on it. Both stop dead under Reduce Motion, which is the setting's whole
 * purpose; the clock keeps working, because it is information rather than
 * decoration.
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
import { HORIZON, SLOTS, VB_H, VB_W } from './slots';

interface Props {
  state: RoomState;
  layout?: RoomLayout;
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
      </Defs>

      <Rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#roomWall)" />
      <Rect x="0" y={HORIZON} width={VB_W} height={VB_H - HORIZON} fill={room.floor} />
      {/* skirting board, the one line that sells the corner of a room */}
      <Rect x="0" y={HORIZON - 9} width={VB_W} height={11} fill={room.skirting} />
      <Path
        d={`M0,${HORIZON - 9} H${VB_W} M0,${HORIZON + 2} H${VB_W}`}
        stroke={room.ink}
        strokeWidth={2.4}
      />
      {/* a couple of floorboards, short of the rug so they read as depth */}
      <Path
        d={`M0,${HORIZON + 30} H${VB_W} M0,${HORIZON + 66} H${VB_W}`}
        stroke={room.floorDark}
        strokeWidth={2}
      />
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
    opacity: t.value < 0.15 ? t.value / 0.15 * 0.5 : (1 - t.value) * 0.5,
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
 * The room
 * ------------------------------------------------------------------ */

export function Room({ state, layout = DEFAULT_LAYOUT, width, height }: Props & { width: number; height: number }) {
  const motion = useMotion();
  const sway = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(sway);
    if (motion.reduce) {
      sway.value = 0;
      return;
    }
    // Slow and small. A draught, not a gale — at this scale the leaves move
    // about a pixel and a half, which is enough to notice and not enough to
    // look like the room is on a boat.
    sway.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: 3400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    return () => cancelAnimation(sway);
  }, [motion.reduce, sway]);

  const breezeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sway.value * (width / VB_W) * 1.6 }],
  }));

  const placed = resolveLayout(layout);
  const drifting = placed.filter((p) => p.item.breeze);
  const steaming = placed
    .map((p) => (p.item.steam ? p.item.steam(SLOTS[p.slot]) : null))
    .filter((v): v is { x: number; y: number } => v !== null);

  const sx = width / VB_W;
  const sy = height / VB_H;

  return (
    <>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`}>
          <Shell />
          {placed.map(({ slot, item }) => (
            <G key={`${slot}:${item.id}`}>{item.draw(SLOTS[slot], state)}</G>
          ))}
        </Svg>
      </View>

      <Animated.View style={[StyleSheet.absoluteFill, breezeStyle]} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`}>
          {drifting.map(({ slot, item }) => (
            <G key={`${slot}:${item.id}`}>{item.breeze!(SLOTS[slot], state)}</G>
          ))}
        </Svg>
      </Animated.View>

      {steaming.map((p, i) => (
        <View key={i} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Wisp left={p.x * sx - 3} top={p.y * sy - 6} delay={0} size={6} />
          <Wisp left={p.x * sx + 3} top={p.y * sy - 2} delay={1100} size={5} />
          <Wisp left={p.x * sx - 1} top={p.y * sy} delay={2200} size={4} />
        </View>
      ))}
    </>
  );
}

/** One speck, drifting up through the light. */
function Mote({
  phase,
  x,
  drift,
  size,
  width,
  height,
  clock,
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
      opacity: Math.sin(p * Math.PI) * 0.35,
      transform: [
        { translateX: x * width + Math.sin(p * Math.PI * 2) * drift },
        { translateY: height * (0.85 - p * 0.55) },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: '#fff8ee',
        },
        style,
      ]}
    />
  );
}

/** A few specks of dust, purely to keep the air from looking dead. */
export const Motes = memo(function Motes({ width, height }: { width: number; height: number }) {
  const motion = useMotion();
  const clock = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(clock);
    if (motion.reduce) {
      clock.value = 0;
      return;
    }
    clock.value = withRepeat(withTiming(1, { duration: 14000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(clock);
  }, [motion.reduce, clock]);

  if (motion.reduce) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Mote phase={0} x={0.2} drift={14} size={4} width={width} height={height} clock={clock} />
      <Mote phase={0.38} x={0.62} drift={10} size={3} width={width} height={height} clock={clock} />
      <Mote phase={0.71} x={0.85} drift={16} size={3.5} width={width} height={height} clock={clock} />
    </View>
  );
});

export default Room;
