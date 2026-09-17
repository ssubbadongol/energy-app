/**
 * The mascot's stage: a small study, and the red panda who works in it.
 *
 * The stage owns the *space* — a fixed aspect ratio, a ground line, the
 * palette — so nothing here can reflow the screen around it. It takes one
 * prop, `phase`, and `pomodoro.tsx` still knows nothing about sprite sheets,
 * clips or furniture.
 *
 * Three layers, back to front:
 *
 *   StudyRoom   drawn scenery — desk, chair, lamps, shelf, rug, plant
 *   RoomLight   the lamps' warm pool, which rises when a focus block starts
 *   the mascot  sprite frames from assets/mascot, positioned by its feet
 *
 * The character is eye candy and nothing else: it cannot be tapped, it carries
 * no state the timer depends on, and it is `accessible={false}` inside a stage
 * that already describes itself in one line.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
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
import { curve, radius, sage } from '@/theme/sage';
import { useMotion } from '@/theme/useMotion';
import { BOX_H, BOX_W, CLIPS, CLIP_NAMES, type ClipName } from '../mascot/frames';
import { RoomLight } from './RoomLight';
import { ROAM, RUG, StudyRoom } from './StudyRoom';

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
}

/**
 * What the mascot is doing in each phase.
 *
 * Nothing is started, so it is asleep on the rug. A focus block is the one it
 * works through, headphones on. A break is the one where it gets up and
 * pothers about the room — the reason `resting` is handled separately below.
 */
const CLIP_FOR: Record<Exclude<MascotPhase, 'resting'>, ClipName> = {
  idle: 'sleeping',
  focusing: 'working',
  complete: 'happy',
};

/** How bright the lamps burn per phase. Working late is the bright one. */
const LAMPS: Record<MascotPhase, number> = {
  idle: 0.22,
  focusing: 1,
  resting: 0.45,
  complete: 0.9,
};

/** The mascot's height as a fraction of the stage, measured on `walking`. */
const MASCOT_SCALE = 0.3;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/* ------------------------------------------------------------------ *
 * Sprite rendering
 *
 * Every frame of every clip stays mounted and only its opacity changes.
 * Swapping an <Image source> on each tick would re-decode per frame and flash
 * the first time a clip is used; sixteen small, always-resident images cost
 * less than that, and let the flipbook run on the UI thread off one clock.
 * ------------------------------------------------------------------ */

function Frame({
  source,
  index,
  count,
  clock,
  width,
  height,
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
  name,
  visible,
  clock,
  scale,
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
        <Frame
          key={i}
          source={source}
          index={i}
          count={clip.sources.length}
          clock={clock}
          width={width}
          height={height}
        />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * The occupant
 * ------------------------------------------------------------------ */

const Occupant = memo(function Occupant({
  phase,
  width,
  height,
}: Props & { width: number; height: number }) {
  const motion = useMotion();
  const [clip, setClip] = useState<ClipName>('sleeping');

  /** Offset from the rug's centre, in px. Only a break moves it. */
  const x = useSharedValue(0);
  /** -1 faces left. Animated through zero, which reads as turning round. */
  const facing = useSharedValue(1);
  /** A walker's bob, so a pace across the rug is not a slide. */
  const bob = useSharedValue(0);
  /** Sprite flipbook clock, counted in frames. */
  const clock = useSharedValue(0);

  const scale = (height * MASCOT_SCALE) / CLIPS.walking.height;
  const roamL = width * ROAM.left;
  const roamR = width * ROAM.right;

  /* --- flipbook ---------------------------------------------------- */

  useEffect(() => {
    const { sources, fps, still } = CLIPS[clip];
    cancelAnimation(clock);

    // Reduce Motion gets one held frame per clip. A looping flipbook is
    // exactly what that setting exists to stop, but the character itself is
    // information — which clip is showing still says what the timer is doing.
    if (motion.reduce) {
      clock.value = still;
      return;
    }

    clock.value = 0;
    clock.value = withRepeat(
      withTiming(sources.length, {
        duration: (sources.length / fps) * 1000,
        easing: Easing.linear,
      }),
      -1,
      false,
    );

    return () => cancelAnimation(clock);
  }, [clip, motion.reduce, clock]);

  /* --- bob, while walking ------------------------------------------ */

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

  /* --- what it is doing -------------------------------------------- */

  useEffect(() => {
    // Under Reduce Motion it stays on the rug and simply is what it is.
    if (motion.reduce) {
      cancelAnimation(x);
      x.value = 0;
      facing.value = 1;
      setClip(phase === 'resting' ? 'sleeping' : CLIP_FOR[phase]);
      return;
    }

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (phase !== 'resting') {
      // Back to the rug, and back to work.
      setClip(CLIP_FOR[phase]);
      x.value = withTiming(0, { duration: 620, easing: Easing.out(Easing.quad) });
      facing.value = withTiming(1, { duration: 200 });
      return () => {
        alive = false;
        clearTimeout(timer);
      };
    }

    // A break: potter about the room, pausing to look pleased with itself.
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
        // A flop on the floor between laps. `happy` is reserved for finishing
        // something, and a break is a break, not an achievement.
        setClip('sleeping');
        timer = setTimeout(pace, rand(1400, 3000));
      }, ms);
    };

    // Let it stand up before it wanders off.
    timer = setTimeout(pace, 500);
    setClip('sleeping');

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [phase, motion.reduce, roamL, roamR, x, facing]);

  /* --- placement ---------------------------------------------------- */

  const boxW = BOX_W * scale;
  const boxH = BOX_H * scale;
  const left = width * RUG.x - boxW / 2;
  const top = height * RUG.y - boxH;

  const body = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: bob.value * (boxH * 0.045) },
      { scaleX: facing.value },
    ],
  }));

  // Grounds the character. Sized to the clip that is actually showing, so the
  // sleeping panda does not float above a shadow drawn for a standing one.
  const shadowW = CLIPS[clip].width * scale * 0.66;
  const shadow = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.shadow,
          {
            width: shadowW,
            height: Math.max(4, boxH * 0.07),
            left: width * RUG.x - shadowW / 2,
            top: height * RUG.y - Math.max(4, boxH * 0.07) / 2,
            borderRadius: boxH,
          },
          shadow,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', left, top, width: boxW, height: boxH }, body]}
      >
        {CLIP_NAMES.map((name) => (
          <ClipLayer key={name} name={name} visible={name === clip} clock={clock} scale={scale} />
        ))}
      </Animated.View>
    </>
  );
});

/* ------------------------------------------------------------------ *
 * The stage
 * ------------------------------------------------------------------ */

/**
 * `aspectRatio` rather than a fixed height, so the room keeps its proportions
 * from a small phone to a tablet without a breakpoint. The mascot and the
 * lamps are then sized from the measured box, so everything scales together.
 */
export function MascotStage({ phase }: Props) {
  const motion = useMotion();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const lamps = useSharedValue(LAMPS.idle);
  const settled = useRef(false);

  useEffect(() => {
    // The first phase is painted at its level rather than faded up to it, so
    // opening the tab does not look like someone flicking the lights on.
    if (!settled.current) {
      settled.current = true;
      lamps.value = LAMPS[phase];
      return;
    }
    lamps.value = withTiming(LAMPS[phase], {
      duration: motion.reduce ? 0 : 900,
      easing: Easing.inOut(Easing.quad),
    });
  }, [phase, motion.reduce, lamps]);

  const light = useAnimatedStyle(() => ({ opacity: lamps.value }));

  return (
    <View
      style={styles.stage}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
      }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={LABELS[phase]}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false}>
        <StudyRoom />
      </View>

      <Animated.View style={[StyleSheet.absoluteFill, light]} pointerEvents="none" accessible={false}>
        <RoomLight />
      </Animated.View>

      {size.height > 0 && (
        <Occupant phase={phase} width={size.width} height={size.height} />
      )}
    </View>
  );
}

/** Spoken by VoiceOver in place of the scene. */
const LABELS: Record<MascotPhase, string> = {
  idle: 'Your focus companion, asleep at the desk until you start',
  focusing: 'Your focus companion, working at the desk alongside you',
  resting: 'Your focus companion, stretching its legs during the break',
  complete: 'Your focus companion, pleased with you',
};

const styles = StyleSheet.create({
  stage: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: radius.cardLg,
    backgroundColor: sage.fillGreenAlt,
    overflow: 'hidden',
    ...curve,
  },
  shadow: {
    position: 'absolute',
    backgroundColor: 'rgba(87,120,105,0.11)',
  },
});
