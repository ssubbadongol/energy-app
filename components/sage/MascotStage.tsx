/**
 * The mascot's stage.
 *
 * This is a seam, not a feature. The mascot itself is being built on another
 * branch and its format is not settled — most likely hand-built Reanimated,
 * the way `Celebration.tsx` works, but possibly Lottie or Rive. So everything
 * here is deliberately format-agnostic:
 *
 *   - the stage owns the *space* (a fixed aspect ratio, a ground line, the
 *     palette), so swapping the occupant cannot reflow the screen around it
 *   - it takes one prop, `phase`, and nothing else. Whatever renders the
 *     mascot receives that single value and decides for itself what to do
 *     with it — discrete clips, a state machine, or a set of springs
 *
 * To land the real mascot: replace the contents of `<Occupant>` below. Nothing
 * outside this file should need to change, and `pomodoro.tsx` should not learn
 * the mascot's format.
 */
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { curve, radius, sage } from '@/theme/sage';
import { useMotion } from '@/theme/useMotion';

/**
 * What the timer is doing, in the only terms the mascot needs.
 *
 * Deliberately not the raw timer state: 'paused mid-focus' and 'not started'
 * are the same thing to a cat on a couch, and collapsing them here keeps the
 * mascot from having to know about the phase machine.
 */
export type MascotPhase = 'idle' | 'focusing' | 'resting' | 'complete';

interface Props {
  phase: MascotPhase;
}

/** Breathing rate per phase, in ms for one full in-out cycle. */
const BREATH_MS: Record<MascotPhase, number> = {
  idle: 5200,
  focusing: 4200,
  resting: 6400,
  complete: 3200,
};

/**
 * Placeholder occupant: a breathing form, so the stage reads as inhabited
 * rather than broken while the real mascot is in progress.
 *
 * It is drawn from the same tokens as everything else, and it never animates
 * under Reduce Motion — a looping animation is exactly what that setting
 * exists to stop.
 */
const Occupant = memo(function Occupant({ phase }: Props) {
  const motion = useMotion();
  const breath = useSharedValue(0);

  useEffect(() => {
    if (motion.reduce) {
      cancelAnimation(breath);
      breath.value = 0;
      return;
    }

    const half = BREATH_MS[phase] / 2;
    breath.value = withRepeat(
      withSequence(
        withTiming(1, { duration: half, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: half, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );

    // Without this the previous phase's loop keeps running alongside the new
    // one and the two beat against each other.
    return () => cancelAnimation(breath);
  }, [phase, motion.reduce, breath]);

  const body = useAnimatedStyle(() => ({
    transform: [{ scaleY: 1 + breath.value * 0.035 }, { translateY: breath.value * -2 }],
  }));

  const tint =
    phase === 'resting' ? sage.fillGreen : phase === 'complete' ? sage.clayFill : sage.fill;

  return (
    <View style={styles.occupantWrap} pointerEvents="none">
      <Animated.View style={[styles.body, { backgroundColor: tint }, body]} />
      <View style={styles.ground} />
    </View>
  );
});

/**
 * The stage.
 *
 * `aspectRatio` rather than a fixed height, so the mascot keeps its proportions
 * from a small phone to a tablet without a breakpoint.
 */
export function MascotStage({ phase }: Props) {
  return (
    <View style={styles.stage} accessible accessibilityRole="image" accessibilityLabel={LABELS[phase]}>
      <Occupant phase={phase} />
    </View>
  );
}

/** Spoken by VoiceOver in place of the animation. */
const LABELS: Record<MascotPhase, string> = {
  idle: 'Your focus companion, waiting',
  focusing: 'Your focus companion, settled in while you work',
  resting: 'Your focus companion, taking a break with you',
  complete: 'Your focus companion, pleased with you',
};

const styles = StyleSheet.create({
  stage: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: radius.cardLg,
    backgroundColor: sage.fillGreenAlt,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
    ...curve,
  },
  occupantWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 26,
  },
  body: {
    width: 92,
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: sage.ruleStrong,
    ...curve,
  },
  ground: {
    position: 'absolute',
    bottom: 22,
    left: '18%',
    right: '18%',
    height: 1,
    backgroundColor: sage.ruleStrong,
  },
});
