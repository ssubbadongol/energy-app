/**
 * The mascot's room, and the clock it lives under.
 *
 * Tall rather than wide: it is somewhere the mascot lives, and a room reads as
 * a room when you can see the wall meet the floor. The scene owns that space at
 * a fixed aspect ratio, so nothing in here can reflow the screen around it.
 *
 * The timer is the clock on the wall. That is a deliberate change from the
 * stage taking only a `phase`: the clock is the room's own way of telling you
 * how long is left, and it cannot do that without the numbers. Everything else
 * about the timer — the phase machine, the rounds, the controls — still stays
 * on the Pomodoro screen.
 *
 * What is in the room comes from a `RoomLayout`, which is plain data. Passing a
 * different one furnishes it differently, which is the seam a shop hangs off;
 * see room/layout.ts.
 */
import { memo, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { curve, font, radius, sage } from '@/theme/sage';
import { useMotion } from '@/theme/useMotion';
import { BOX_H, BOX_W, CLIPS, type ClipName } from '../mascot/frames';
import { Motes, Room } from './room/Room';
import type { RoomLayout } from './room/layout';
import { CLOCK_FACE, ROAM, STAND, VB_H, VB_W } from './room/slots';

/**
 * What the timer is doing, in the only terms the mascot needs.
 *
 * Deliberately not the raw timer state: 'paused mid-focus' and 'not started'
 * are the same thing to a panda on a rug, and collapsing them here keeps the
 * mascot from having to know about the phase machine.
 */
export type MascotPhase = 'idle' | 'focusing' | 'resting' | 'complete';

interface Props {
  phase: MascotPhase;
  /** What the wall clock shows. */
  timeText: string;
  /** 1 at the start of a phase, 0 when it runs out. Drains the clock's rim. */
  progress: number;
  /** Counts seconds while the timer runs; moves the clock's second hand. */
  tick: number;
  /** Spoken for the clock, which is the one part of the room that is content. */
  timeLabel: string;
  layout?: RoomLayout;
}

/** What the mascot is doing in each phase. */
const CLIP_FOR: Record<Exclude<MascotPhase, 'resting'>, ClipName> = {
  idle: 'idle',
  focusing: 'working',
  complete: 'happy',
};

/** The clips the room ever shows — not the ones that belong to being carried. */
const STAGE_CLIPS: ClipName[] = ['idle', 'walking', 'working', 'sleeping', 'happy', 'spin'];

/** The mascot's height as a fraction of the room, measured on `walking`. */
const MASCOT_SCALE = 0.17;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/* ------------------------------------------------------------------ *
 * Sprite rendering
 * ------------------------------------------------------------------ */

function Frame({
  source, index, count, clock, width, height,
}: {
  source: ImageSourcePropType;
  index: number;
  count: number;
  clock: SharedValue<number>;
  width: number;
  height: number;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: Math.floor(clock.value) % count === index ? 1 : 0,
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Image source={source} style={{ width, height }} resizeMode="contain" fadeDuration={0} />
    </Animated.View>
  );
}

function ClipLayer({
  name, visible, clock, scale,
}: {
  name: ClipName;
  visible: boolean;
  clock: SharedValue<number>;
  scale: number;
}) {
  const clip = CLIPS[name];
  const width = clip.width * scale;
  const height = clip.height * scale;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        bottom: 0,
        left: (BOX_W * scale - width) / 2,
        width,
        height,
        opacity: visible ? 1 : 0,
      }}
    >
      {clip.sources.map((source, i) => (
        <Frame key={i} source={source} index={i} count={clip.sources.length} clock={clock} width={width} height={height} />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * The occupant
 * ------------------------------------------------------------------ */

const Occupant = memo(function Occupant({
  phase, width, height,
}: { phase: MascotPhase; width: number; height: number }) {
  const motion = useMotion();
  const [clip, setClip] = useState<ClipName>('idle');

  const x = useSharedValue(0);
  const facing = useSharedValue(1);
  const bob = useSharedValue(0);
  const clock = useSharedValue(0);

  const scale = (height * MASCOT_SCALE) / CLIPS.walking.height;
  const roamL = width * ROAM.left;
  const roamR = width * ROAM.right;

  useEffect(() => {
    const { sources, fps, still, loop } = CLIPS[clip];
    cancelAnimation(clock);
    if (motion.reduce) {
      clock.value = still;
      return;
    }
    const end = loop === false ? sources.length - 0.001 : sources.length;
    const run = withTiming(end, { duration: (sources.length / fps) * 1000, easing: Easing.linear });
    clock.value = 0;
    clock.value = loop === false ? run : withRepeat(run, -1, false);
    return () => cancelAnimation(clock);
  }, [clip, motion.reduce, clock]);

  useEffect(() => {
    cancelAnimation(bob);
    if (motion.reduce || clip !== 'walking') {
      bob.value = withTiming(0, { duration: 160 });
      return;
    }
    bob.value = withRepeat(
      withSequence(
        withTiming(-1, { duration: 230, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 230, easing: Easing.in(Easing.quad) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(bob);
  }, [clip, motion.reduce, bob]);

  useEffect(() => {
    if (motion.reduce) {
      cancelAnimation(x);
      x.value = 0;
      facing.value = 1;
      setClip(phase === 'resting' ? 'idle' : CLIP_FOR[phase]);
      return;
    }

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (phase !== 'resting') {
      setClip(CLIP_FOR[phase]);
      x.value = withTiming(0, { duration: 620, easing: Easing.out(Easing.quad) });
      facing.value = withTiming(1, { duration: 200 });
      return () => {
        alive = false;
        clearTimeout(timer);
      };
    }

    // A break: up on its feet and pottering about the rug, with the odd sit.
    let at = 0;
    const pace = () => {
      if (!alive) return;
      const to = rand(-roamL, roamR);
      const ms = 700 + Math.abs(to - at) * 13;
      facing.value = withTiming(to >= at ? 1 : -1, { duration: 170 });
      setClip('walking');
      x.value = withTiming(to, { duration: ms, easing: Easing.inOut(Easing.quad) });
      at = to;
      timer = setTimeout(() => {
        if (!alive) return;
        setClip(Math.random() < 0.3 ? 'spin' : 'idle');
        timer = setTimeout(pace, rand(1800, 3600));
      }, ms);
    };

    timer = setTimeout(pace, 500);
    setClip('idle');

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [phase, motion.reduce, roamL, roamR, x, facing]);

  const boxW = BOX_W * scale;
  const boxH = BOX_H * scale;
  const left = width * STAND.x - boxW / 2;
  const top = height * STAND.y - boxH;

  const body = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: bob.value * (boxH * 0.045) },
      { scaleX: facing.value },
    ],
  }));

  const shadowW = CLIPS[clip].width * scale * 0.66;
  const shadowH = Math.max(4, boxH * 0.07);
  const shadow = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.shadow,
          {
            width: shadowW,
            height: shadowH,
            left: width * STAND.x - shadowW / 2,
            top: height * STAND.y - shadowH / 2,
            borderRadius: boxH,
          },
          shadow,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', left, top, width: boxW, height: boxH }, body]}
      >
        {STAGE_CLIPS.map((name) => (
          <ClipLayer key={name} name={name} visible={name === clip} clock={clock} scale={scale} />
        ))}
      </Animated.View>
    </>
  );
});

/* ------------------------------------------------------------------ *
 * The stage
 * ------------------------------------------------------------------ */

export function MascotStage({ phase, timeText, progress, tick, timeLabel, layout }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const running = phase === 'focusing' || phase === 'resting';
  const onBreak = phase === 'resting';

  // The readout sits over the drawn clock face, in the app's own type. Drawing
  // it as SVG text would mean a second font pipeline for four digits.
  const faceSize = size.width * CLOCK_FACE.r * 2;

  return (
    <View
      style={styles.stage}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
      }}
    >
      {size.height > 0 && (
        <>
          <Room
            state={{ progress, onBreak, tick, running }}
            layout={layout}
            width={size.width}
            height={size.height}
          />
          <Motes width={size.width} height={size.height} />
          <Occupant phase={phase} width={size.width} height={size.height} />

          <View
            pointerEvents="none"
            accessible
            accessibilityRole="timer"
            accessibilityLabel={timeLabel}
            accessibilityLiveRegion="polite"
            style={{
              position: 'absolute',
              left: size.width * CLOCK_FACE.cx - faceSize / 2,
              top: size.height * CLOCK_FACE.cy - faceSize / 2,
              width: faceSize,
              height: faceSize,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.clock, { fontSize: faceSize * 0.3 }]}
            >
              {timeText}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    width: '100%',
    aspectRatio: VB_W / VB_H,
    borderRadius: radius.cardLg,
    backgroundColor: '#e6d3cd',
    overflow: 'hidden',
    ...curve,
  },
  shadow: {
    position: 'absolute',
    backgroundColor: 'rgba(90,64,50,0.13)',
  },
  clock: {
    fontFamily: font.headingBold,
    color: sage.fg,
    letterSpacing: -0.5,
  },
});

export default MascotStage;
