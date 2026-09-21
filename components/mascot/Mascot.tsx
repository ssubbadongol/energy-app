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
import { BOX_H, BOX_W, CLIPS, type ClipName } from './frames';
import { HOP_MS, planJump, planWalk } from './walk';
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
/**
 * How often to check the container while parked.
 *
 * Far slower than it used to be, because this no longer does the following —
 * the transform does, every frame. This only re-checks whether the container
 * has moved for some other reason, and whether it is still on screen.
 */
const FOLLOW_MS = 250;
/** The list must have been still this long before a measurement is worth using. */
const SETTLED_MS = 120;
/** How long the mascot beams after the user finishes something. */
const CHEER_MS = 2800;

/**
 * How long the mascot stays at a container, and how likely it is to wander
 * about it rather than settle, per mood.
 *
 * Long stays on purpose. A companion that relocates every few seconds is not
 * keeping you company, it is pacing — so the mascot spends most of a minute in
 * one place, looking around, and only occasionally gets up.
 */
const STAY: Record<MascotMood, { hold: [number, number]; wander: number }> = {
  idle: { hold: [16000, 30000], wander: 0.18 },
  work: { hold: [14000, 24000], wander: 0.1 },
  rest: { hold: [20000, 34000], wander: 0.08 },
};

/**
 * How long the mascot stays exactly where a finger put it.
 *
 * Picking it up and putting it down is the most deliberate thing anyone does
 * with this character, and it used to be the one instruction it ignored: the
 * drop cut its stint short, it got up, and it walked straight back to whatever
 * card it fancied. Being moved read as being nudged rather than being placed.
 *
 * So a drop now buys twenty seconds of standing still, idling and occasionally
 * chasing its tail, before the usual roaming resumes.
 */
const DROP_DWELL_MS = 20000;

/** The sprite each mood holds while it is settled. */
const MOOD_CLIP: Record<MascotMood, ClipName> = {
  idle: 'idle',
  work: 'working',
  rest: 'sleeping',
};

/** Chance that a spell of idling is broken up by a tail chase. */
const SPIN_CHANCE = 0.3;
/** Two or three turns of it, then back to looking around. */
const SPIN_MIN = 1600;
const SPIN_MAX = 2600;

/**
 * Every clip this mascot can show.
 *
 * Listed rather than taken from the sheet set, because not every clip belongs
 * out here: the break activities — reading, scrolling, lifting — are things the
 * mascot does in its room on the Pomodoro tab, and mounting them anywhere else
 * would both load frames nobody sees and make it possible to show one by
 * mistake.
 */
const ROAM_CLIPS: ClipName[] = [
  'idle',
  'walking',
  'working',
  'sleeping',
  'happy',
  'spin',
  'held',
  'recover',
];

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

  const [clip, setClip] = useState<ClipName>('idle');

  /** Foot position in window coordinates — the sprite box's bottom centre. */
  const footX = useSharedValue(screenW / 2);
  const footY = useSharedValue(-999);
  const opacity = useSharedValue(0);
  /** -1 faces left. Animated through zero, which reads as turning around. */
  const facing = useSharedValue(1);
  /** Vertical scale; <1 on landing, >1 on take-off. Pivots on the feet. */
  const squash = useSharedValue(1);
  /** The rise and fall of the gait. Walking is flat now, so this supplies it. */
  const bob = useSharedValue(0);
  /**
   * How far the list has scrolled since the mascot's container was measured.
   *
   * This is what keeps it on a card. `footY` holds the card's position as of
   * the last measurement and `parkScroll` the scroll offset at that instant;
   * the difference against the live offset is added in the transform, so the
   * character moves in the same frame as the card rather than a poll behind it.
   */
  const parkScroll = useSharedValue(0);
  /** 1 only while parked on a container, i.e. while the follow applies. */
  const parkTracking = useSharedValue(0);
  // Captured once: the provider owns these for the life of the tab tree.
  const scrollLink = registry?.scrollLink ?? null;
  const scrollY = scrollLink?.y;
  const scrollAt = scrollLink?.changedAt;
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
  const clipRef = useRef<ClipName>('idle');
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
        // Take the scroll follow into the anchor before dropping it, or the
        // mascot jumps out from under the finger the instant it is grabbed.
        if (parkTracking.value) {
          footY.value += scrollY ? parkScroll.value - scrollY.value : 0;
          parkTracking.value = 0;
        }
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
  }, [beginDrag, endDrag, onTap, facing, footX, footY, squash, limits, dragging, parkScroll, parkTracking, scrollY]);

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
     * Walk along the floor to an x, feet down the whole way.
     *
     * Every move used to be a string of arcs, so the mascot bounced everywhere
     * it went. Going sideways is walking: the position moves flat, and the
     * only rise and fall is the gait itself, which `bob` supplies.
     */
    const walkToX = async (toX: number) => {
      const { width } = bounds.current;
      // The rise and fall of the gait, for feet that are on the ground. A jump
      // has its own arc and must not have this on top of it.
      bob.value = withRepeat(
        withSequence(
          withTiming(-1, { duration: HOP_MS / 2, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: HOP_MS / 2, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        false,
      );
      const half = BOX_W / 2 + 6;
      const from = { x: footX.value, y: footY.value };
      const { steps, durationMs } = planWalk(from, { x: toX, y: from.y }, half, width - half);

      const firstDx = steps[0].x - from.x;
      if (Math.abs(firstDx) > 8) facing.value = withTiming(firstDx > 0 ? 1 : -1, { duration: 150 });

      setClip('walking');
      footX.value = withSequence(
        ...steps.map((p) => withTiming(p.x, { duration: HOP_MS, easing: Easing.linear })),
      );

      // Turn at each waypoint as it is reached, so a detour's return leg is not
      // walked backwards.
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

      await rest(durationMs + 120);
      turns.forEach(clearTimeout);
      cancelAnimation(bob);
      bob.value = withTiming(0, { duration: 140 });
    };

    /**
     * Jump to a y. Going up or down between two cards is a hop, not a walk —
     * the mascot has nothing to walk along in that direction.
     */
    const jumpToY = async (toY: number) => {
      const fromY = footY.value;
      const { steps: ys, lift, hopMs: ms, durationMs } = planJump(fromY, toY);

      setClip('walking');
      footY.value = withSequence(
        ...ys.flatMap((y, i) => {
          const from = i === 0 ? fromY : ys[i - 1];
          return [
            withTiming(Math.min(from, y) - lift, {
              duration: ms / 2,
              easing: Easing.out(Easing.quad),
            }),
            withTiming(y, { duration: ms / 2, easing: Easing.in(Easing.quad) }),
          ];
        }),
      );
      squash.value = withSequence(
        ...ys.flatMap(() => [
          withTiming(1.07, { duration: ms * 0.25 }),
          withTiming(1, { duration: ms * 0.45 }),
          withTiming(0.9, { duration: ms * 0.16 }),
          withTiming(1, { duration: ms * 0.14 }),
        ]),
      );

      await rest(durationMs + 120);
    };

    /**
     * Get to a point: walk the sideways part, then jump the up-and-down part.
     *
     * Splitting them is the whole point — it is what makes a move across a row
     * of cards read as a stroll and a move between two stacked ones read as a
     * hop, rather than every move being the same bouncing arc.
     */
    const travelTo = async (to: { x: number; y: number }) => {
      const dx = to.x - footX.value;
      const dy = to.y - footY.value;

      if (Math.abs(dx) > 10) {
        await walkToX(to.x);
        if (cancelled || held.current) return;
      }
      if (Math.abs(to.y - footY.value) > 8) {
        await jumpToY(to.y);
        if (cancelled || held.current) return;
      }
      // Neither leg was worth taking on its own, but we are still not there.
      if (Math.abs(dx) <= 10 && Math.abs(dy) <= 8) {
        footX.value = withTiming(to.x, { duration: 200 });
        footY.value = withTiming(to.y, { duration: 200 });
        await rest(220);
      }
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
     * Park on a container: anchor to it once, then let the transform do the
     * following.
     *
     * The old version re-measured every 40ms and wrote the answer straight to
     * the mascot's position. That is a poll well under the frame rate, feeding
     * on an asynchronous measurement — so during a scroll the character trailed
     * the card and then jumped to catch up. Now the card's position is measured
     * once, the scroll offset at that instant is recorded alongside it, and the
     * difference against the live offset is applied in the transform, on the UI
     * thread, every frame.
     *
     * A slow tick remains, but only for the two things a scroll offset cannot
     * tell us: whether the container has moved for some other reason (a task
     * added above it, the keyboard), and whether it has left the screen. It
     * re-measures only while the list is still, because a measurement taken
     * mid-fling is stale before it arrives — applying one is precisely the jump
     * this exists to remove.
     */
    const park = (perch: Perch, foot: { x: number; y: number; spot: PerchSpot }) => {
      lost = false;
      let offset: number | null = null;
      let shown: boolean | null = null;

      /** Re-anchor to wherever the container is now, without moving the mascot. */
      const anchor = (rect: PerchRect) => {
        if (offset === null) offset = foot.x - (rect.x + rect.width / 2);
        footX.value = rect.x + rect.width / 2 + offset;
        footY.value = footYFor(rect, foot.spot);
        parkScroll.value = scrollY ? scrollY.value : 0;
        parkTracking.value = 1;
      };

      void perch.measure().then((rect) => {
        if (!cancelled && rect && !held.current && !dropped.current) anchor(rect);
      });

      parked = setInterval(async () => {
        if (cancelled || parkPaused || held.current || dropped.current) return;

        // Where the mascot actually is this instant, which is the anchor plus
        // however far the list has moved since.
        const followed =
          footY.value + (scrollY ? parkScroll.value - scrollY.value : 0);

        const { top, bottom } = bounds.current;
        const visible = followed - BOX_H >= top && followed <= bottom;
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

        // Only worth re-measuring once the list has settled.
        const still = !scrollAt || Date.now() - scrollAt.value > SETTLED_MS;
        if (!still) return;
        const rect = await perch.measure();
        if (cancelled || parkPaused || held.current || dropped.current || !rect) return;
        anchor(rect);
      }, FOLLOW_MS);
    };

    const unpark = () => {
      if (parked) clearInterval(parked);
      parked = null;
      settlePosition();
    };

    /**
     * Stop following the scroll, without moving.
     *
     * The follow lives in the transform, so simply switching it off would snap
     * the mascot back by however far the list had scrolled since it parked.
     * Folding the offset into the anchor first leaves it exactly where it is,
     * which is what every caller wants: travel, a drag and a hop all move the
     * character themselves from wherever it currently stands.
     */
    const settlePosition = () => {
      if (!parkTracking.value) return;
      footY.value += scrollY ? parkScroll.value - scrollY.value : 0;
      parkTracking.value = 0;
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
     * Hold a mood for a stretch, breaking out early for a tap, for the
     * container scrolling away, or for another container calling.
     *
     * `perchId` is null when the mascot is not standing on anything — after
     * being put down by hand, where it holds a spot in screen space rather
     * than on a card. There is then no container whose disappearance ends the
     * stint, so `until` is how such a stint knows it has outlived its screen.
     */
    const settle = async (
      perchId: string | null,
      mood: MascotMood,
      ms: number,
      until?: () => boolean,
    ) => {
      // Not while it is in the air or still getting up: a stint beginning
      // underneath a drag would stamp the mood clip over the carry animation.
      const wear = () => {
        if (!held.current && !recovering.current) setClip(MOOD_CLIP[mood]);
      };
      wear();
      let remaining = ms;
      while (remaining > 0 && !cancelled && !lost && (!until || until())) {
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
        // Break a long sit up with a tail chase now and then, so idling has
        // something in it besides looking left and right. Sleeping in one
        // stretch rather than polling: the slice is short only when a spin is
        // actually due.
        const spinDue =
          mood === 'idle' &&
          remaining > SPIN_MAX * 2 &&
          Math.random() < SPIN_CHANCE;

        const startedAt = Date.now();
        await sleep(spinDue ? rand(4000, 9000) : remaining);
        const slept = Date.now() - startedAt;
        remaining -= slept;

        // A wait that ended early ended because something rang the bell. Deal
        // with that before anything else: a composer wants the mascot, or the
        // container underfoot has gone, which is what changing tabs looks like
        // from in here — and why it used to sit on the new screen for a few
        // seconds before noticing it did not belong there.
        if (cancelled || lost) return;
        if (until && !until()) return;
        if (registry.caller()) return;
        if (perchId && !registry.get(perchId)) return;

        if (spinDue && !held.current && !recovering.current) {
          setClip('spin');
          const spun = Date.now();
          await rest(rand(SPIN_MIN, SPIN_MAX));
          remaining -= Date.now() - spun;
          wear();
        }
      }
    };

    /**
     * A few unhurried steps around the container it is already on. This is
     * where the walking clip gets to be an idle rather than only a commute.
     */
    const wanderAround = async (perch: Perch, mood: MascotMood) => {
      const steps = 1 + Math.floor(Math.random() * 2);
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
        await settle(current.id, current.mood, rand(stay.hold[0], stay.hold[1]));
        unpark();

        let justDropped = dropped.current;
        dropped.current = false;
        if (cancelled) return;
        await finishRecovering();
        if (cancelled) return;

        /*
          Put down by hand: stand there.

          `settle` returns the moment `dropped` is set, so without this the
          loop fell straight through to picking a new container and the mascot
          walked off the instant it had finished getting up. Now it idles in
          place first, on no container at all — it is standing where the user
          left it, not on anything, so it is deliberately not parked and does
          not follow the scroll.

          The loop repeats because a second drag during the dwell should buy
          another full twenty seconds rather than the remainder of the first.
        */
        while (justDropped && !cancelled) {
          // Nothing can go missing underneath it while it is on no container.
          lost = false;
          /*
            …but the screen can still go. Focus registers no containers at all
            — it has its own mascot in the room — so the roaming one is meant
            to step off the moment that tab opens. Standing on nothing, the
            dwell had no container whose disappearance would tell it that, and
            it sat over the Pomodoro screen for the full twenty seconds.

            Same test the loop uses for "still the same screen": any container
            that was here when we landed still being registered. The registry
            wakes the sleep on every change, so this is noticed at once rather
            than whenever the current slice happens to end.
          */
          await settle(null, 'idle', DROP_DWELL_MS, () =>
            registry.list().some((p) => known.has(p.id)),
          );
          justDropped = dropped.current;
          dropped.current = false;
          if (cancelled) return;
          await finishRecovering();
        }
        if (cancelled) return;

        // Being called means staying put, so skip the stroll and loop straight
        // back into the mood the caller asked for.
        if (registry.caller()?.id === current.id) continue;

        if (!lost && Math.random() < stay.wander && registry.get(current.id)) {
          const landed = await wanderAround(current, current.mood);
          if (cancelled) return;
          if (landed && !lost) {
            park(current, landed);
            await settle(current.id, current.mood, rand(stay.hold[0] * 0.6, stay.hold[1] * 0.7));
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
      cancelAnimation(bob);
      bob.value = 0;
      wake.current?.();
    };
  }, [
    registry,
    reduceMotion,
    bob,
    facing,
    footX,
    footY,
    opacity,
    squash,
    parkScroll,
    parkTracking,
    scrollY,
    scrollAt,
  ]);

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
      // Anchor the same way the roaming loop does. Reduce Motion stops the
      // mascot travelling; it does not mean it should judder down the screen
      // behind the card it is sitting on.
      parkScroll.value = scrollY ? scrollY.value : 0;
      parkTracking.value = 1;
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
  }, [reduceMotion, registry, footX, footY, opacity, parkScroll, parkTracking, scrollY]);

  /* --- transform ------------------------------------------------------ */

  const boxStyle = useAnimatedStyle(() => {
    // The one thing here that has to be exact every frame: how far the list has
    // moved under the mascot since its container was last measured.
    const follow =
      parkTracking.value && scrollY ? parkScroll.value - scrollY.value : 0;

    return {
      opacity: opacity.value,
      transform: [
        { translateX: footX.value - BOX_W / 2 },
        // Squash pivots on the feet, so compensate for scaling about the centre.
        {
          translateY:
            footY.value - BOX_H + (BOX_H * (1 - squash.value)) / 2 + bob.value * 5 + follow,
        },
        { scaleX: facing.value * (2 - squash.value) },
        { scaleY: squash.value },
      ],
    };
  });

  const hit = CLIPS[clip];

  if (!registry) return null;

  return (
    <Animated.View pointerEvents="box-none" style={[styles.box, boxStyle]}>
      {ROAM_CLIPS.map((name) => (
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
