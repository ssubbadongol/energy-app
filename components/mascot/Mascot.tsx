import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  StyleSheet,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useReduceMotion } from '@/theme/useMotion';
import { BOX_H, BOX_W, CLIPS, CLIP_NAMES, type ClipName } from './frames';
import { HOP_MS, planWalk } from './walk';
import {
  MascotRegistryContext,
  type MascotMood,
  type Perch,
  type PerchRect,
  type PerchSpot,
} from './registry';

/* ------------------------------------------------------------------ *
 * Tuning
 * ------------------------------------------------------------------ */

/** Height of the tab bar the layout draws, above its safe-area inset. */
const TAB_BAR_H = 62;
/** How far the feet sink into the edge they stand on, so it reads as contact. */
const SINK = 9;
/** Position resync while parked, so the mascot rides its card as you scroll. */
const FOLLOW_MS = 40;
/** How long the mascot beams after the user finishes something. */
const CHEER_MS = 2800;

/**
 * How long the mascot stays at a container, and how likely it is to wander off
 * around it rather than hold still, per mood.
 *
 * `potter` is the default and is deliberately restless: a couple of seconds
 * standing, then almost always back on its feet. Most of what you see the
 * mascot do should be walking.
 */
const STAY: Record<MascotMood, { hold: [number, number]; wander: number }> = {
  potter: { hold: [1800, 3600], wander: 0.92 },
  work: { hold: [7000, 11000], wander: 0.4 },
  rest: { hold: [8000, 13000], wander: 0.25 },
};

/** The sprite each mood holds while it is standing still. */
const MOOD_CLIP: Record<MascotMood, ClipName> = {
  potter: 'working',
  work: 'working',
  rest: 'sleeping',
};

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

  const [clip, setClip] = useState<ClipName>('working');

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
    const { sources, fps, loop } = CLIPS[clip];
    // A one-shot stops a hair short of the frame count so its last frame is
    // the one left showing; running it all the way to `length` would wrap the
    // modulo back to frame zero and undo the ending.
    const end = loop === false ? sources.length - 0.001 : sources.length;
    const run = withTiming(end, {
      duration: (sources.length / fps) * 1000,
      easing: Easing.linear,
    });
    clock.value = 0;
    clock.value = loop === false ? run : withRepeat(run, -1, false);
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
  /** Set by the cheer signal; spent by the loop on the next beat. */
  const cheered = useRef(false);
  /** True while a finger is on the mascot. */
  const held = useRef(false);
  /** True from release until the loop has acknowledged the new position. */
  const dropped = useRef(false);
  /** True while the put-down animation is still playing itself out. */
  const recovering = useRef(false);
  /** The showing clip, readable from the loop without re-running it. */
  const clipRef = useRef<ClipName>('working');
  clipRef.current = clip;
  const wake = useRef<(() => void) | null>(null);

  const onTap = useCallback(() => {
    tapped.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    wake.current?.();
  }, []);

  /* --- drag ----------------------------------------------------------- */

  // Where a dragged mascot is allowed to end up. Kept on the UI thread so the
  // clamp happens in the gesture itself rather than a frame later.
  const limits = useSharedValue({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
  /** 1 only between the pan actually activating and its release. */
  const dragging = useSharedValue(0);
  useEffect(() => {
    limits.value = {
      minX: BOX_W / 2 + 6,
      maxX: screenW - BOX_W / 2 - 6,
      minY: insets.top + 4 + BOX_H,
      maxY: screenH - insets.bottom - TAB_BAR_H - 2,
    };
  }, [screenW, screenH, insets.top, insets.bottom, limits]);

  const beginDrag = useCallback(() => {
    held.current = true;
    dropped.current = false;
    setClip('held');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const endDrag = useCallback(() => {
    held.current = false;
    // The loop may be parked on a container and would otherwise snap the
    // mascot back the moment the finger lifts. `dropped` holds the tracker off
    // until the loop has seen the new position and set off from it.
    dropped.current = true;
    // It lands flat, lies there a beat and picks itself up. `recovering` keeps
    // the loop from walking it off mid-sprawl.
    recovering.current = true;
    setClip('recover');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    wake.current?.();
  }, []);

  const gesture = useMemo(() => {
    const drag = Gesture.Pan()
      .minDistance(3)
      .onStart(() => {
        'worklet';
        dragging.value = 1;
        // Whatever walk was under way loses the argument to the finger.
        cancelAnimation(footX);
        cancelAnimation(footY);
        cancelAnimation(squash);
        squash.value = withTiming(1, { duration: 120 });
        runOnJS(beginDrag)();
      })
      .onChange((e) => {
        'worklet';
        const l = limits.value;
        footX.value = Math.min(l.maxX, Math.max(l.minX, footX.value + e.changeX));
        footY.value = Math.min(l.maxY, Math.max(l.minY, footY.value + e.changeY));
        facing.value = e.changeX > 1 ? 1 : e.changeX < -1 ? -1 : facing.value;
      })
      .onFinalize(() => {
        'worklet';
        // onFinalize runs even when the pan never activated — without this, a
        // plain tap would take the whole "put the mascot down" path.
        if (!dragging.value) return;
        dragging.value = 0;
        runOnJS(endDrag)();
      });

    const poke = Gesture.Tap()
      .maxDistance(8)
      .onEnd((_e, success) => {
        'worklet';
        if (success) runOnJS(onTap)();
      });

    return Gesture.Exclusive(drag, poke);
  }, [beginDrag, endDrag, onTap, facing, footX, footY, squash, limits, dragging]);

  useEffect(() => {
    if (!registry || reduceMotion) return;

    let cancelled = false;
    let parked: ReturnType<typeof setInterval> | null = null;
    /** True once the container we are standing on has scrolled out of sight. */
    let lost = false;
    /** Held while a deliberate animation owns the position, e.g. a tap hop. */
    let parkPaused = false;

    /**
     * An interruptible wait, for time the mascot is only passing. A registry
     * change or a cheer cuts it short so the loop reacts at once.
     */
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

    /**
     * An uninterruptible wait, for time an animation owns.
     *
     * Waiting out a walk with `sleep` was a bug: anything that rang the bell
     * mid-stride returned the loop early, which then parked the mascot while
     * its position animation was still running — so it snapped to the card
     * from wherever it had got to.
     */
    const rest = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    /** The y a given spot on a container puts the mascot's feet at. */
    const footYFor = (rect: PerchRect, spot: PerchSpot) =>
      spot === 'inside' ? rect.y + rect.height - SINK * 2 : rect.y + SINK;

    /**
     * Where the mascot should land on a container, or null if it cannot.
     *
     * Standing on a container's top edge needs a whole mascot's worth of clear
     * space above it, which the topmost card on a screen never has — so that
     * card was silently unreachable, and on a screen with only one container
     * (a conversation, where the composer is the only thing safe to stand on)
     * that meant no mascot at all. If the preferred spot has no headroom, the
     * other one is tried before giving up: standing inside a tall card near its
     * bottom needs no room above it.
     *
     * The spot that won is returned, because the tracker that follows the
     * container while the user scrolls has to keep using the same one.
     */
    const footFor = (rect: PerchRect, perch: Perch) => {
      const { top, bottom, width } = bounds.current;
      const order: PerchSpot[] =
        perch.spot === 'inside' ? ['inside', 'top'] : ['top', 'inside'];

      for (const spot of order) {
        const y = footYFor(rect, spot);
        if (y - BOX_H < top || y > bottom) continue;

        // Land somewhere different along the container each time, without
        // letting any part of the sprite leave the screen.
        const slack = Math.max(0, rect.width / 2 - BOX_W / 2 - 8);
        const x = rect.x + rect.width / 2 + rand(-slack, slack);
        const half = BOX_W / 2 + 6;
        return { x: Math.max(half, Math.min(width - half, x)), y, spot };
      }
      return null;
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

    /**
     * Walk to a point. The route, pace and hop count come from `planWalk`;
     * everything here is just driving the shared values along it.
     */
    const travelTo = async (to: { x: number; y: number }) => {
      const { width } = bounds.current;
      const half = BOX_W / 2 + 6;
      const from = { x: footX.value, y: footY.value };
      const { steps, durationMs } = planWalk(from, to, half, width - half);

      const firstDx = steps[0].x - from.x;
      if (Math.abs(firstDx) > 8) facing.value = withTiming(firstDx > 0 ? 1 : -1, { duration: 150 });

      const lift = 22 + Math.min(16, (durationMs / steps.length) * 0.05);

      footX.value = withSequence(
        ...steps.map((p) => withTiming(p.x, { duration: HOP_MS, easing: Easing.linear })),
      );
      footY.value = withSequence(
        ...steps.flatMap((p, i) => {
          const start = i === 0 ? from.y : steps[i - 1].y;
          return [
            withTiming(Math.min(start, p.y) - lift, {
              duration: HOP_MS / 2,
              easing: Easing.out(Easing.quad),
            }),
            withTiming(p.y, { duration: HOP_MS / 2, easing: Easing.in(Easing.quad) }),
          ];
        }),
      );
      // Each hop opens with the squash from the previous landing and rolls on
      // into the next take-off's stretch, so a run reads as one motion.
      squash.value = withSequence(
        ...steps.flatMap(() => [
          withTiming(0.9, { duration: HOP_MS * 0.12 }),
          withTiming(1.06, { duration: HOP_MS * 0.23 }),
          withTiming(1, { duration: HOP_MS * 0.65 }),
        ]),
        withTiming(0.88, { duration: 70 }),
        withTiming(1.04, { duration: 90 }),
        withTiming(1, { duration: 110 }),
      );

      setClip('walking');

      // Turn at each waypoint as it is reached, so the return leg of a detour
      // is not moonwalked.
      const turns: ReturnType<typeof setTimeout>[] = [];
      for (let i = 1; i < steps.length; i++) {
        const dx = steps[i].x - steps[i - 1].x;
        if (Math.abs(dx) < 8) continue;
        const dir = dx > 0 ? 1 : -1;
        turns.push(
          setTimeout(() => {
            if (!cancelled && !held.current) facing.value = withTiming(dir, { duration: 130 });
          }, i * HOP_MS),
        );
      }

      await rest(durationMs + 150);
      turns.forEach(clearTimeout);
    };

    /** Drop in from off screen, for the first appearance and after a tab change. */
    const arriveAt = async (foot: { x: number; y: number }) => {
      if (cancelled) return;
      opacity.value = withTiming(0, { duration: 160 });
      await rest(170);
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
      await rest(500);
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
    const park = (perch: Perch, foot: { x: number; y: number; spot: PerchSpot }) => {
      lost = false;
      let offset: number | null = null;
      // Null until the first tick, so parking always asserts visibility rather
      // than assuming whatever the last animation happened to leave behind.
      let shown: boolean | null = null;

      parked = setInterval(async () => {
        const rect = await perch.measure();
        // A finger beats the tracker, and so does a mascot that was just put
        // down somewhere — snapping it back would undo the drag.
        if (cancelled || parkPaused || held.current || dropped.current || !rect) return;
        if (offset === null) offset = foot.x - (rect.x + rect.width / 2);
        const y = footYFor(rect, foot.spot);
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

    /** A hop on the spot, with the position tracker held off for the arc. */
    const hopInPlace = async (lift: number, ms: number) => {
      parkPaused = true;
      const base = footY.value;
      footY.value = withSequence(
        withTiming(base - lift, { duration: ms * 0.45, easing: Easing.out(Easing.quad) }),
        withTiming(base, { duration: ms * 0.55, easing: Easing.in(Easing.quad) }),
      );
      squash.value = withSequence(
        withTiming(1.12, { duration: ms * 0.45 }),
        withTiming(0.88, { duration: 100 }),
        withTiming(1.04, { duration: 110 }),
        withTiming(1, { duration: 120 }),
      );
      await rest(ms + 340);
      parkPaused = false;
    };

    /**
     * Answer a tap. A boop, not a celebration — the clip is left alone, because
     * `happy` now means "you finished something" and a poke is not that.
     */
    const boop = async () => {
      tapped.current = false;
      await hopInPlace(24, 340);
    };

    /**
     * The user finished something. This is the only place `happy` is spent.
     */
    const cheer = async () => {
      cheered.current = false;
      const was = clipRef.current;
      setClip('happy');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await hopInPlace(30, 380);
      if (cancelled) return;
      await rest(CHEER_MS - 380);
      if (!cancelled) setClip(was);
    };

    /**
     * Let the put-down animation play out before anything walks the mascot
     * away from where it was dropped. Costs nothing when it is not running.
     */
    const finishRecovering = async () => {
      if (!recovering.current) return;
      const { sources, fps } = CLIPS.recover;
      await rest((sources.length / fps) * 1000 + 120);
      recovering.current = false;
    };

    /**
     * Hold a container's mood for a stretch, breaking out early for a tap, for
     * the container scrolling away, or for another container calling.
     */
    const settle = async (mood: MascotMood, ms: number) => {
      // Not while it is in the air or still getting up: a stint beginning
      // underneath a drag would stamp the mood clip over the carry animation.
      const wear = () => {
        if (!held.current && !recovering.current) setClip(MOOD_CLIP[mood]);
      };
      wear();
      let remaining = ms;
      while (remaining > 0 && !cancelled && !lost) {
        if (held.current) {
          await sleep(250);
          continue;
        }
        // Put down somewhere new: take the position as given and walk on from
        // it rather than finishing a stint that is no longer where it started.
        // The flag is cleared by the caller, after it has stopped the tracker.
        if (dropped.current) return;
        if (cheered.current) {
          await cheer();
          if (cancelled) return;
          remaining = Math.max(remaining - CHEER_MS, 900);
          wear();
          continue;
        }
        if (tapped.current) {
          await boop();
          if (cancelled) return;
          remaining -= 700;
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
    const wanderAround = async (perch: Perch, mood: MascotMood) => {
      const steps = mood === 'potter' ? 3 + Math.floor(Math.random() * 3) : 2 + Math.floor(Math.random() * 2);
      let landed: { x: number; y: number; spot: PerchSpot } | null = null;
      for (let i = 0; i < steps && !cancelled && !lost; i++) {
        const rect = await perch.measure();
        if (cancelled || !rect) return landed;
        const foot = footFor(rect, perch);
        if (!foot) return landed;
        await travelTo(foot);
        landed = foot;
        if (cheered.current) {
          await cheer();
          if (cancelled) return landed;
        }
        // A beat between legs, still on its feet. Short, so the walk stays the
        // thing you notice rather than the pauses between bits of it.
        if (Math.random() < 0.4) {
          setClip(MOOD_CLIP[mood]);
          await sleep(rand(600, 1300));
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
        let foot: { x: number; y: number; spot: PerchSpot } | null = null;

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
        const stay = STAY[current.mood];

        park(current, foot);
        await settle(current.mood, rand(stay.hold[0], stay.hold[1]));
        unpark();
        dropped.current = false;
        if (cancelled) return;
        await finishRecovering();
        if (cancelled) return;

        // Being called means staying put, so skip the stroll and loop straight
        // back into the mood the caller asked for.
        if (registry.caller()?.id === current.id) continue;

        if (!lost && Math.random() < stay.wander && registry.get(current.id)) {
          const landed = await wanderAround(current, current.mood);
          if (cancelled) return;
          if (landed && !lost) {
            park(current, landed);
            await settle(current.mood, rand(stay.hold[0] * 0.6, stay.hold[1] * 0.7));
            unpark();
            dropped.current = false;
            await finishRecovering();
          }
        }
      }
    };

    // A screen registering or dropping its containers cuts the current wait
    // short, so switching tabs moves the mascot immediately.
    const unsubscribe = registry.subscribe(() => wake.current?.());
    const unsubscribeCheer = registry.onCelebrate(() => {
      cheered.current = true;
      wake.current?.();
    });
    void run();

    return () => {
      cancelled = true;
      unpark();
      unsubscribe();
      unsubscribeCheer();
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
      // Reduce Motion turns off the roaming, not the touch handling. Don't
      // fight a finger; once it lifts, placement goes back to being ours.
      if (held.current) return;
      dropped.current = false;

      const perch = registry.caller() ?? registry.list()[0];
      if (!perch) {
        opacity.value = 0;
        return;
      }
      const rect = await perch.measure();
      if (cancelled || !rect) return;
      footX.value = rect.x + rect.width / 2;
      footY.value =
        perch.spot === 'inside' ? rect.y + rect.height - SINK * 2 : rect.y + SINK;
      opacity.value = 1;
      setClip(MOOD_CLIP[perch.mood]);
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
          swallows touches meant for the card it is standing on. */}
      <GestureDetector gesture={gesture}>
        <Animated.View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Mascot. Drag to move it."
          style={{
            position: 'absolute',
            bottom: 0,
            left: (BOX_W - hit.width) / 2,
            width: hit.width,
            height: hit.height,
          }}
        />
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', left: 0, top: 0, width: BOX_W, height: BOX_H },
});

export default Mascot;
