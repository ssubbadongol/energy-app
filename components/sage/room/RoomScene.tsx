/**
 * The mascot's room, as the whole Pomodoro tab.
 *
 * This fills the screen and everything else on that tab is drawn over it —
 * there is no card, and the app's usual paper-and-leaves backdrop is not used
 * here at all. A room you are looking into is not a widget on a page.
 *
 * The timer is the clock on the wall, which is why the scene takes the numbers
 * rather than only a `phase`. Everything else about the timer — the phase
 * machine, the rounds, the controls — stays on the Pomodoro screen.
 *
 * What is in the room comes from a `RoomLayout`, which is plain data. Passing a
 * different one furnishes it differently; that is the seam a shop hangs off.
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
import { font } from '@/theme/sage';
import { useMotion } from '@/theme/useMotion';
import { BOX_H, BOX_W, BREAK_CLIPS, CLIPS, type ClipName } from '../../mascot/frames';
import { Room } from './Room';
import type { RoomLayout } from './layout';
import { room } from './palette';
import { DEFAULT_LAYOUT } from './layout';
import { project, ROAM, SLOTS, STAND } from './slots';

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
  /** What the wall clock reads. */
  timeText: string;
  /** 1 at the start of a phase, 0 when it runs out. Drains the clock's rim. */
  progress: number;
  /** Counts seconds while the timer runs; moves the clock's second hand. */
  tick: number;
  /** Spoken for the clock, the one part of the room that is content. */
  timeLabel: string;
  layout?: RoomLayout;
}

const CLIP_FOR: Record<Exclude<MascotPhase, 'resting'>, ClipName> = {
  idle: 'idle',
  focusing: 'working',
  complete: 'happy',
};

/**
 * The clips the room shows. Not the ones that belong to being picked up, which
 * only the roaming mascot can be; and the break activities are here and only
 * here, because a break is the only time there is to do one.
 */
const SCENE_CLIPS: ClipName[] = [
  'idle',
  'walking',
  'working',
  'sleeping',
  'happy',
  'spin',
  ...BREAK_CLIPS,
];

/** The mascot's height, in viewBox units, measured on `walking`. */
const MASCOT_VB_H = 62;

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
  phase, stand, scale: unit,
}: { phase: MascotPhase; stand: { x: number; y: number }; scale: number }) {
  const motion = useMotion();
  const [clip, setClip] = useState<ClipName>('idle');

  const x = useSharedValue(0);
  const facing = useSharedValue(1);
  const bob = useSharedValue(0);
  const clock = useSharedValue(0);

  const scale = (MASCOT_VB_H * unit) / CLIPS.walking.height;
  const roamL = ROAM.left * unit;
  const roamR = ROAM.right * unit;

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
      setClip(
        phase === 'resting'
          ? BREAK_CLIPS[Math.floor(Math.random() * BREAK_CLIPS.length)]
          : CLIP_FOR[phase],
      );
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

    /*
     * A break. The mascot picks one thing to do — read, scroll, or curl a pair
     * of dumbbells — and does that for the whole break. One per break, chosen
     * when the break starts: cycling through all three would turn five minutes
     * off into a showreel.
     *
     * It gets up and moves along the rug now and then, then goes back to the
     * same thing, which is what makes it look like someone spending a break
     * rather than a looping sprite.
     */
    const doing = BREAK_CLIPS[Math.floor(Math.random() * BREAK_CLIPS.length)];
    let at = 0;

    const resume = () => {
      if (!alive) return;
      setClip(doing);
      timer = setTimeout(shift, rand(9000, 16000));
    };

    const shift = () => {
      if (!alive) return;
      const to = rand(-roamL, roamR);
      const ms = 700 + Math.abs(to - at) * 13;
      facing.value = withTiming(to >= at ? 1 : -1, { duration: 170 });
      setClip('walking');
      x.value = withTiming(to, { duration: ms, easing: Easing.inOut(Easing.quad) });
      at = to;
      timer = setTimeout(resume, ms + 200);
    };

    // Stands up, wanders over, and settles into it.
    setClip('idle');
    timer = setTimeout(shift, 700);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [phase, motion.reduce, roamL, roamR, x, facing]);

  const boxW = BOX_W * scale;
  const boxH = BOX_H * scale;
  const left = stand.x - boxW / 2;
  const top = stand.y - boxH;

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
            left: stand.x - shadowW / 2,
            top: stand.y - shadowH / 2,
            borderRadius: boxH,
          },
          shadow,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', left, top, width: boxW, height: boxH }, body]}
      >
        {SCENE_CLIPS.map((name) => (
          <ClipLayer key={name} name={name} visible={name === clip} clock={clock} scale={scale} />
        ))}
      </Animated.View>
    </>
  );
});

/* ------------------------------------------------------------------ *
 * The scene
 * ------------------------------------------------------------------ */

export function RoomScene({ phase, timeText, progress, tick, timeLabel, layout = DEFAULT_LAYOUT }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const running = phase === 'focusing' || phase === 'resting';
  const onBreak = phase === 'resting';

  const ready = size.width > 0 && size.height > 0;
  // Everything drawn over the room — the readout, the mascot — goes through the
  // same cover transform the SVG uses, so it lands where the drawing is.
  const p = project(size.width, size.height);
  const face = {
    ...p.at(SLOTS.clock.x, SLOTS.clock.y),
    w: SLOTS.clock.w * p.scale,
    h: SLOTS.clock.h * p.scale,
  };
  const stand = p.at(STAND.x, STAND.y);

  return (
    <View
      style={styles.scene}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
      }}
    >
      {ready && (
        <>
          <Room
            state={{ progress, onBreak, tick, running }}
            layout={layout}
            width={size.width}
            height={size.height}
          />
          <Occupant phase={phase} stand={stand} scale={p.scale} />

          {/*
            The readout, over the drawn face. Drawing it as SVG text would mean
            a second font pipeline for four digits.
          */}
          <View
            pointerEvents="none"
            accessible
            accessibilityRole="timer"
            accessibilityLabel={timeLabel}
            accessibilityLiveRegion="polite"
            style={{
              position: 'absolute',
              left: face.x,
              top: face.y,
              width: face.w,
              height: face.h,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.clock, { fontSize: face.w * 0.29 }]}>
              {timeText}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { ...StyleSheet.absoluteFillObject, backgroundColor: room.wallTop },
  shadow: { position: 'absolute', backgroundColor: 'rgba(90,64,50,0.13)' },
  clock: { fontFamily: font.headingBold, color: room.ink, letterSpacing: -0.5 },
});

export default RoomScene;
