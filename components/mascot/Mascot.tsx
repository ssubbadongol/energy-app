import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useReduceMotion } from '@/theme/useMotion';
import { BOX_H, BOX_W, CLIPS, CLIP_NAMES, type ClipName } from './frames';
import {
  MascotRegistryContext,
  type MascotMood,
  type Perch,
  type PerchRect,
} from './registry';

/* ------------------------------------------------------------------ *
 * Tuning
 * ------------------------------------------------------------------ */

/** Height of the tab bar the layout draws, above its safe-area inset. */
const TAB_BAR_H = 62;
/** How far the feet sink into the edge they stand on, so it reads as contact. */
const SINK = 9;
/** Roughly one hop per this many dp of travel. */
const HOP_SPAN = 110;
const MAX_HOPS = 6;
const HOP_MS = 320;
/** Position resync while parked, so the mascot rides its card as you scroll. */
const FOLLOW_MS = 40;
const REACTION_MS = 2600;

/**
 * How long the mascot settles into a container's mood before doing anything
 * else. Long enough to read as an activity rather than a flicker.
 */
const SETTLE_MIN = 10000;
const SETTLE_MAX = 14000;
/** A second, shorter stint after a wander, before it moves on. */
const RESETTLE_MIN = 7000;
const RESETTLE_MAX = 10000;
/** Chance that a stint is followed by a wander around the same container. */
const WANDER_CHANCE = 0.45;

/** The mascot's resting state, and what it falls back to. */
const RESTING: MascotMood = 'happy';

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function shuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Sprite rendering
 *
 * Every frame of every clip is mounted for the life of the component and only
 * its opacity changes. Swapping an <Image source> on each tick would re-decode
 * per frame and flash the first time a clip is used; sixteen small, always
 * resident images cost less than that, and let the flipbook run entirely on
 * the UI thread off a single shared clock.
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
}: {
  name: ClipName;
  visible: boolean;
  clock: SharedValue<number>;
}) {
  const clip = CLIPS[name];
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        bottom: 0,
        left: (BOX_W - clip.width) / 2,
        width: clip.width,
        height: clip.height,
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
          width={clip.width}
          height={clip.height}
        />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * The mascot
 * ------------------------------------------------------------------ */

/**
 * A red panda that lives on top of the active tab.
 *
 * It picks a registered container, hops there in an arc, does something for a
 * few seconds, then moves on. While parked it re-measures its container a few
 * dozen times a second, so scrolling carries it along rather than leaving it
 * floating over the wrong thing.
 *
 * Mounted once, in the tabs layout. It is inert on screens that register no
 * perches — Mentor and Pods are conversations, where there is nothing to stand
 * on and nothing it should be covering.
 */
export function Mascot() {
  const registry = useContext(MascotRegistryContext);
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  const [clip, setClip] = useState<ClipName>(RESTING);

  /** Foot position in window coordinates — the sprite box's bottom centre. */
  const footX = useSharedValue(screenW / 2);
  const footY = useSharedValue(-999);
  const opacity = useSharedValue(0);
  /** -1 faces left. Animated through zero, which reads as turning around. */
  const facing = useSharedValue(1);
  /** Vertical scale; <1 on landing, >1 on take-off. Pivots on the feet. */
  const squash = useSharedValue(1);
  /** Sprite flipbook clock, counted in frames. */
  const clock = useSharedValue(0);

  /* --- flipbook ------------------------------------------------------ */

  useEffect(() => {
    const { sources, fps } = CLIPS[clip];
    clock.value = 0;
    clock.value = withRepeat(
      withTiming(sources.length, {
        duration: (sources.length / fps) * 1000,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [clip, clock]);

  /* --- the roaming loop ---------------------------------------------- */

  // The loop is deliberately long-lived, so it reads geometry through a ref
  // rather than taking it as a dependency and restarting on every rotation.
  const bounds = useRef({ top: 0, bottom: 0, width: screenW });
  bounds.current = {
    top: insets.top + 4,
    bottom: screenH - insets.bottom - TAB_BAR_H - 2,
    width: screenW,
  };

  const tapped = useRef(false);
  const wake = useRef<(() => void) | null>(null);

  const onTap = useCallback(() => {
    tapped.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    wake.current?.();
  }, []);

  useEffect(() => {
    if (!registry || reduceMotion) return;

    let cancelled = false;
    let parked: ReturnType<typeof setInterval> | null = null;
    /** True once the container we are standing on has scrolled out of sight. */
    let lost = false;
    /** Held while a deliberate animation owns the position, e.g. a tap hop. */
    let parkPaused = false;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          wake.current = null;
          resolve();
        }, ms);
        wake.current = () => {
          clearTimeout(timer);
          wake.current = null;
          resolve();
        };
      });

    /** The y a given container puts the mascot's feet at. */
    const footYFor = (rect: PerchRect, perch: Perch) =>
      perch.spot === 'inside' ? rect.y + rect.height - SINK * 2 : rect.y + SINK;

    /** Where the mascot should land on a container, or null if it is off screen. */
    const footFor = (rect: PerchRect, perch: Perch) => {
      const { top, bottom, width } = bounds.current;
      const y = footYFor(rect, perch);
      if (y - BOX_H < top || y > bottom) return null;

      // Land somewhere different along the container each time, without
      // letting any part of the sprite leave the screen.
      const slack = Math.max(0, rect.width / 2 - BOX_W / 2 - 8);
      const x = rect.x + rect.width / 2 + rand(-slack, slack);
      const half = BOX_W / 2 + 6;
      return { x: Math.max(half, Math.min(width - half, x)), y };
    };

    /**
     * Where to go next. A container that is calling wins outright — that is a
     * composer or an editor asking for company, and it should not have to win a
     * coin toss. Otherwise: the first perch, in shuffled order, that is on
     * screen and is not the one we are already standing on.
     */
    const findSpot = async (exclude?: string) => {
      const all = registry.list();
      const caller = registry.caller();
      const candidates = caller
        ? [caller]
        : shuffle(all.length > 1 ? all.filter((p) => p.id !== exclude) : all);
      for (const perch of candidates) {
        const rect = await perch.measure();
        if (cancelled) return null;
        if (!rect) continue;
        const foot = footFor(rect, perch);
        if (foot) return { perch, foot };
      }
      return null;
    };

    /** Hop across in an arc, turning to face the way we are going. */
    const travelTo = async (to: { x: number; y: number }) => {
      const fromX = footX.value;
      const fromY = footY.value;
      const dx = to.x - fromX;
      const dy = to.y - fromY;
      const distance = Math.hypot(dx, dy);

      if (Math.abs(dx) > 12) facing.value = withTiming(dx > 0 ? 1 : -1, { duration: 150 });

      const hops = Math.max(1, Math.min(MAX_HOPS, Math.round(distance / HOP_SPAN)));
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 1; i <= hops; i++) {
        xs.push(fromX + (dx * i) / hops);
        ys.push(fromY + (dy * i) / hops);
      }

      const lift = 26 + Math.min(20, (distance / hops) * 0.14);

      footX.value = withSequence(
        ...xs.map((x) => withTiming(x, { duration: HOP_MS, easing: Easing.linear })),
      );
      footY.value = withSequence(
        ...ys.flatMap((y, i) => {
          const start = i === 0 ? fromY : ys[i - 1];
          return [
            withTiming(Math.min(start, y) - lift, {
              duration: HOP_MS / 2,
              easing: Easing.out(Easing.quad),
            }),
            withTiming(y, { duration: HOP_MS / 2, easing: Easing.in(Easing.quad) }),
          ];
        }),
      );
      // Each hop opens with the squash from the previous landing and rolls on
      // into the next take-off's stretch, so a run reads as one motion.
      squash.value = withSequence(
        ...xs.flatMap(() => [
          withTiming(0.9, { duration: HOP_MS * 0.12 }),
          withTiming(1.06, { duration: HOP_MS * 0.23 }),
          withTiming(1, { duration: HOP_MS * 0.65 }),
        ]),
        withTiming(0.88, { duration: 70 }),
        withTiming(1.04, { duration: 90 }),
        withTiming(1, { duration: 110 }),
      );

      setClip('walking');
      await sleep(hops * HOP_MS + 170);
    };

    /** Drop in from off screen, for the first appearance and after a tab change. */
    const arriveAt = async (foot: { x: number; y: number }) => {
      if (cancelled) return;
      opacity.value = withTiming(0, { duration: 160 });
      await sleep(170);
      if (cancelled) return;
      footX.value = foot.x;
      footY.value = foot.y - 40;
      setClip('walking');
      opacity.value = withTiming(1, { duration: 200 });
      footY.value = withTiming(foot.y, { duration: 260, easing: Easing.in(Easing.quad) });
      squash.value = withSequence(
        withTiming(1, { duration: 260 }),
        withTiming(0.86, { duration: 70 }),
        withTiming(1.05, { duration: 90 }),
        withTiming(1, { duration: 110 }),
      );
      await sleep(500);
    };

    /**
     * Keep the mascot glued to its container while the user scrolls, holding
     * the horizontal offset it chose on landing rather than snapping to centre.
     *
     * Following a container is only right while it is still on screen. Scroll
     * far enough and it leaves — so the mascot fades out, is marked lost, and
     * the loop is woken to place it somewhere visible instead. If the user
     * scrolls back before that lands, it simply fades in again where it was.
     */
    const park = (perch: Perch, foot: { x: number; y: number }) => {
      lost = false;
      let offset: number | null = null;
      // Null until the first tick, so parking always asserts visibility rather
      // than assuming whatever the last animation happened to leave behind.
      let shown: boolean | null = null;

      parked = setInterval(async () => {
        const rect = await perch.measure();
        if (cancelled || parkPaused || !rect) return;
        if (offset === null) offset = foot.x - (rect.x + rect.width / 2);
        const y = footYFor(rect, perch);
        footX.value = rect.x + rect.width / 2 + offset;
        footY.value = y;

        // Visibility is a function of where the container currently is, not a
        // flag some earlier step remembered to clear. Standing somewhere on
        // screen means visible, every tick, which also heals a fade-out left
        // behind by a superseded run of this effect.
        const { top, bottom } = bounds.current;
        const visible = y - BOX_H >= top && y <= bottom;
        if (visible !== shown) {
          shown = visible;
          opacity.value = withTiming(visible ? 1 : 0, { duration: 200 });
        }
        if (!visible && !lost) {
          lost = true;
          wake.current?.();
        } else if (visible) {
          lost = false;
        }
      }, FOLLOW_MS);
    };

    const unpark = () => {
      if (parked) clearInterval(parked);
      parked = null;
    };

    /**
     * Answer a tap: a hop on the spot and a beam. The position tracker is
     * paused for the hop so the two are not writing footY at each other.
     */
    const react = async () => {
      tapped.current = false;
      setClip('happy');
      parkPaused = true;
      const base = footY.value;
      footY.value = withSequence(
        withTiming(base - 26, { duration: 160, easing: Easing.out(Easing.quad) }),
        withTiming(base, { duration: 180, easing: Easing.in(Easing.quad) }),
      );
      squash.value = withSequence(
        withTiming(1.12, { duration: 160 }),
        withTiming(0.88, { duration: 100 }),
        withTiming(1.04, { duration: 110 }),
        withTiming(1, { duration: 120 }),
      );
      await sleep(420);
      parkPaused = false;
      await sleep(REACTION_MS - 420);
    };

    /**
     * Hold a container's mood for a stretch, breaking out early for a tap, for
     * the container scrolling away, or for another container calling.
     */
    const settle = async (mood: MascotMood, ms: number) => {
      setClip(mood);
      let remaining = ms;
      while (remaining > 0 && !cancelled && !lost) {
        if (tapped.current) {
          await react();
          if (cancelled) return;
          remaining -= REACTION_MS;
          setClip(mood);
          continue;
        }
        const startedAt = Date.now();
        await sleep(remaining);
        remaining -= Date.now() - startedAt;
        // Woken early means the registry changed. If that was a composer asking
        // for the mascot, go now rather than sitting out the rest of the stint.
        if (remaining > 400 && registry.caller()) return;
      }
    };

    /**
     * A few unhurried steps around the container it is already on. This is
     * where the walking clip gets to be an idle rather than only a commute.
     */
    const wanderAround = async (perch: Perch) => {
      const steps = 2 + Math.floor(Math.random() * 3);
      let landed: { x: number; y: number } | null = null;
      for (let i = 0; i < steps && !cancelled; i++) {
        const rect = await perch.measure();
        if (cancelled || !rect) return landed;
        const foot = footFor(rect, perch);
        if (!foot) return landed;
        await travelTo(foot);
        landed = foot;
        // Pause mid-stroll and look pleased with itself.
        if (Math.random() < 0.55) {
          setClip(RESTING);
          await sleep(rand(700, 1400));
        }
      }
      return landed;
    };

    const run = async () => {
      let placed = false;
      let current: Perch | undefined;
      /** Container ids that were on screen when the mascot last settled. */
      let known = new Set<string>();

      while (!cancelled) {
        const caller = registry.caller();
        let foot: { x: number; y: number } | null = null;

        if (caller && current && caller.id === current.id && placed && !lost) {
          // Already keeping the composer company. Stay, and pick up its mood in
          // case the container changed what it is asking for.
          current = caller;
        } else {
          const next = await findSpot(current?.id);
          if (cancelled) return;

          if (!next) {
            // Nothing to stand on — this tab is a conversation, or everything
            // has scrolled away. Step off screen and check back shortly.
            opacity.value = withTiming(0, { duration: 220 });
            placed = false;
            current = undefined;
            await sleep(700);
            continue;
          }

          // Hop only between containers on the same screen, and only from
          // somewhere the user can see. A screen is "still the same one" if any
          // container it had when we landed is still registered — testing only
          // the perch underfoot would make the mascot teleport every time a
          // composer closed or a task was deleted out from under it.
          const sameScreen =
            placed && !lost && registry.list().some((p) => known.has(p.id));
          if (sameScreen) await travelTo(next.foot);
          else await arriveAt(next.foot);
          if (cancelled) return;

          placed = true;
          current = next.perch;
          foot = next.foot;
        }

        if (!foot) {
          const rect = await current.measure();
          const here = rect ? footFor(rect, current) : null;
          if (!here) {
            current = undefined;
            continue;
          }
          foot = here;
        }

        known = new Set(registry.list().map((p) => p.id));
        park(current, foot);
        await settle(current.mood, rand(SETTLE_MIN, SETTLE_MAX));
        unpark();
        if (cancelled) return;

        // Being called means staying put, so skip the stroll and loop straight
        // back into the mood the caller asked for.
        if (registry.caller()?.id === current.id) continue;

        if (!lost && Math.random() < WANDER_CHANCE && registry.get(current.id)) {
          const landed = await wanderAround(current);
          if (cancelled) return;
          if (landed && !lost) {
            park(current, landed);
            await settle(current.mood, rand(RESETTLE_MIN, RESETTLE_MAX));
            unpark();
          }
        }
      }
    };

    // A screen registering or dropping its containers cuts the current wait
    // short, so switching tabs moves the mascot immediately.
    const unsubscribe = registry.subscribe(() => wake.current?.());
    void run();

    return () => {
      cancelled = true;
      unpark();
      unsubscribe();
      wake.current?.();
    };
  }, [registry, reduceMotion, facing, footX, footY, opacity, squash]);

  /* --- reduce motion -------------------------------------------------- */

  // With Reduce Motion on the mascot stops travelling: it settles onto the
  // first container of whatever screen is up and only breathes. The character
  // is still there — it is the roaming across the screen that would be the
  // problem, not its presence.
  useEffect(() => {
    if (!reduceMotion || !registry) return;

    let cancelled = false;
    const settle = async () => {
      const perch = registry.caller() ?? registry.list()[0];
      if (!perch) {
        opacity.value = 0;
        return;
      }
      const rect = await perch.measure();
      if (cancelled || !rect) return;
      footX.value = rect.x + rect.width / 2;
      footY.value = rect.y + SINK;
      opacity.value = 1;
      setClip(perch.mood);
    };

    void settle();
    const unsubscribe = registry.subscribe(() => void settle());
    const timer = setInterval(() => void settle(), 400);

    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(timer);
    };
  }, [reduceMotion, registry, footX, footY, opacity]);

  /* --- transform ------------------------------------------------------ */

  const boxStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: footX.value - BOX_W / 2 },
      // Squash pivots on the feet, so compensate for scaling about the centre.
      { translateY: footY.value - BOX_H + (BOX_H * (1 - squash.value)) / 2 },
      { scaleX: facing.value * (2 - squash.value) },
      { scaleY: squash.value },
    ],
  }));

  const hit = CLIPS[clip];

  if (!registry) return null;

  return (
    <Animated.View pointerEvents="box-none" style={[styles.box, boxStyle]}>
      {CLIP_NAMES.map((name) => (
        <ClipLayer key={name} name={name} visible={name === clip} clock={clock} />
      ))}
      {/* Sized to the clip that is actually showing, so the mascot never
          swallows taps meant for the card it is standing on. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Say hello to the mascot"
        onPress={onTap}
        style={{
          position: 'absolute',
          bottom: 0,
          left: (BOX_W - hit.width) / 2,
          width: hit.width,
          height: hit.height,
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', left: 0, top: 0, width: BOX_W, height: BOX_H },
});

export default Mascot;
