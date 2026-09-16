import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { haptic } from '@/components/primitives/usePressScale';
import { sage } from '@/theme/sage';
import { useMotion } from '@/theme/useMotion';

/* ------------------------------------------------------------------ *
 * The sound
 * ------------------------------------------------------------------ */

let cue: AudioPlayer | null = null;

/**
 * Load once, replay thereafter.
 *
 * Decoding the file on every tap shows as latency, and a confirmation sound
 * that arrives after the animation has started reads as a glitch rather than
 * as feedback. `createAudioPlayer` is synchronous — it returns a player
 * immediately and loads behind it — so unlike the old `expo-av` path there is
 * no in-flight promise for two fast taps to race over.
 *
 * Seek before play: a player already at the end of a short cue would otherwise
 * report as playing and produce silence on the second tap.
 *
 * Deliberately not setting an audio mode. The iOS default keeps this silent
 * when the ringer is off, which is the right behaviour for an interface sound —
 * overriding it would play a chime over someone's podcast on a phone they had
 * explicitly silenced.
 */
function playCompletionCue(): void {
  try {
    cue ??= createAudioPlayer(require('../../assets/sounds/complete.wav'));
    cue.volume = 0.7;
    cue.seekTo(0);
    cue.play();
  } catch (err) {
    console.warn('[celebration] Could not play the completion cue', err);
  }
}

/* ------------------------------------------------------------------ *
 * The confetti
 * ------------------------------------------------------------------ */

const PIECES = 14;
const DURATION = 1000;
/** How far a piece travels sideways, before drag, in px. */
const SPREAD = 130;
/**
 * Launch and fall, in px over the full flight. Vertical motion is a real
 * projectile — peak height is `LIFT² / 4·GRAVITY`, so these two are the knobs
 * for the shape of the arc: roughly 80px of rise at a third of the way in,
 * finishing about 120px below the tap. Sharing the horizontal drag curve here
 * instead flattens the launch to almost nothing, which reads as a sprinkle.
 */
const LIFT = 420;
const GRAVITY = 540;

/** Sage, not carnival — the same greens as the UI, with the two energy accents. */
const COLORS = [sage.leaf, sage.primary, sage.leafSoft, sage.primaryDeep, '#d8bf9c', '#a9c0d2'];

interface Piece {
  vx: number;
  vy: number;
  size: number;
  round: boolean;
  spin: number;
  color: string;
}

/** A fan pointing up and out, so nothing launches straight into the ground. */
function makePieces(): Piece[] {
  return Array.from({ length: PIECES }, () => {
    const angle = (-160 + Math.random() * 140) * (Math.PI / 180);
    const force = 0.55 + Math.random() * 0.45;
    return {
      vx: Math.cos(angle) * SPREAD * force,
      vy: Math.sin(angle) * LIFT * force,
      size: 5 + Math.random() * 4,
      round: Math.random() < 0.4,
      spin: (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 360),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  });
}

function Fleck({ piece, progress, x, y }: {
  piece: Piece;
  progress: SharedValue<number>;
  x: number;
  y: number;
}) {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    // Sideways travel eases out, as air drag would. Vertical is left ballistic —
    // a linear launch against a quadratic fall — because easing the rise too
    // makes everything decelerate together and the burst hangs on a string.
    const drag = 1 - (1 - p) * (1 - p);
    const pop = p < 0.1 ? p / 0.1 : 1;

    return {
      opacity: p < 0.65 ? 1 : Math.max(0, 1 - (p - 0.65) / 0.35),
      transform: [
        { translateX: piece.vx * drag },
        { translateY: piece.vy * p + GRAVITY * p * p },
        { rotate: `${piece.spin * p}deg` },
        { scale: pop * (1 - 0.25 * p) },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: x - piece.size / 2,
          top: y - piece.size / 2,
          width: piece.size,
          height: piece.round ? piece.size : piece.size * 1.6,
          borderRadius: piece.round ? piece.size / 2 : 2,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  );
}

function Burst({ x, y }: { x: number; y: number }) {
  const progress = useSharedValue(0);
  const pieces = useMemo(makePieces, []);

  useEffect(() => {
    // Linear, because the shape of the flight lives in the transform above.
    progress.value = withTiming(1, { duration: DURATION, easing: Easing.linear });
  }, [progress]);

  return (
    <>
      {pieces.map((piece, i) => (
        <Fleck key={i} piece={piece} progress={progress} x={x} y={y} />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * The provider
 * ------------------------------------------------------------------ */

type Celebrate = (x: number, y: number) => void;

const CelebrationContext = createContext<Celebrate>(() => {});

/** Call with the screen point the burst should come from — usually the tap. */
export const useCelebrate = () => useContext(CelebrationContext);

/**
 * Marks finishing something: a success haptic, a short chime, and a burst of
 * confetti from wherever the finger landed.
 *
 * It lives at the root rather than inside a card so the confetti can cross the
 * card's bounds — a burst clipped to the row it came from is a rectangle of
 * colour, not a celebration.
 *
 * Under Reduce Motion the flecks are dropped but the haptic and the chime still
 * fire. The point is to mark the completion, and two thirds of the acknowledgement
 * survive without anything flying across the screen.
 */
export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([]);
  const motion = useMotion();
  const nextId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const celebrate = useCallback<Celebrate>((x, y) => {
    haptic('success');
    playCompletionCue();
    if (motion.reduce) return;

    const id = nextId.current++;
    setBursts((current) => [...current, { id, x, y }]);

    const timer = setTimeout(() => {
      setBursts((current) => current.filter((burst) => burst.id !== id));
      timers.current = timers.current.filter((t) => t !== timer);
    }, DURATION + 50);
    timers.current.push(timer);
  }, [motion.reduce]);

  return (
    <CelebrationContext.Provider value={celebrate}>
      <View style={styles.root}>
        {children}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {bursts.map((burst) => <Burst key={burst.id} x={burst.x} y={burst.y} />)}
        </View>
      </View>
    </CelebrationContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
