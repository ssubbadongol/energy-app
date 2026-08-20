import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { duration, ease, reducedMotion, spring } from './tokens';

/**
 * Tracks the OS "Reduce Motion" setting, live — it can be toggled while the
 * app is backgrounded, so a one-shot read at mount is not enough.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let alive = true;

    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (alive) setReduce(enabled);
    });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);

    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduce;
}

/**
 * Motion config resolved against the user's accessibility preference.
 *
 * This system is already almost still, so Reduce Motion has less to strip than
 * it did in a conventional design. What it does change:
 *
 *   - `travel` collapses to 0, so the sheet cross-fades instead of sliding
 *   - the inversion becomes a short cross-fade rather than a wipe
 *   - the graph appears complete instead of drawing itself
 *
 * The inversion still *happens* — it carries the meaning "you are now in a
 * session", so removing it would remove information, not just decoration.
 */
export function useMotion() {
  const reduce = useReduceMotion();

  return useMemo(() => {
    if (!reduce) {
      return {
        reduce: false,
        ease,
        duration,
        spring,
        /** Pass a distance through this before using it in a transform. */
        travel: (px: number): number => px,
      };
    }

    const flat = reducedMotion.duration;

    return {
      reduce: true,
      ease: {
        ...ease,
        out: reducedMotion.easing,
        inOut: reducedMotion.easing,
        drawer: reducedMotion.easing,
      },
      duration: {
        cut: 0,
        press: flat,
        invert: flat,
        draw: 0,
        sheet: flat,
        sheetOut: flat,
      },
      spring: {
        press: { duration: flat, dampingRatio: 1 },
        snappy: { duration: flat, dampingRatio: 1 },
        gentle: { duration: flat, dampingRatio: 1 },
      },
      travel: (_px: number): number => reducedMotion.travel,
    };
  }, [reduce]);
}

export type Motion = ReturnType<typeof useMotion>;
