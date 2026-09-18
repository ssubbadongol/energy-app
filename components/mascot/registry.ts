import { createContext, useCallback, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

/**
 * What the mascot does while it is at a container.
 *
 * Named for the behaviour rather than the sprite. Most containers are `idle`:
 * the mascot sits there and looks about, which is what a companion does nearly
 * all of the time. The laptop is not a general-purpose "busy" pose — it means
 * the user is composing something, and spending it anywhere else would make it
 * stop meaning that.
 *
 *   idle  sits and looks around, occasionally chasing its tail. The default.
 *   work  the laptop. Composers and editors only, while something is open.
 *   rest  naps. Things that are already finished, and an empty day.
 *
 * `walking` is not a mood — it is how the mascot gets between containers.
 * `happy` is not one either: it is reserved for finishing a task.
 */
export type MascotMood = 'idle' | 'work' | 'rest';

/** Where on a container the mascot stands. */
export type PerchSpot =
  /** On the container's top edge, feet sinking slightly into it. The default. */
  | 'top'
  /** On the container's bottom inner edge — for tall boxes like the camera feed. */
  | 'inside';

export interface PerchRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Perch {
  id: string;
  spot: PerchSpot;
  mood: MascotMood;
  /**
   * Asks the mascot to come here and stay for as long as the flag is set —
   * used by composers and editors, which want it alongside the work.
   */
  call: boolean;
  /**
   * Measured fresh on every call, in window coordinates. Containers live in
   * scroll views, so a position cached at registration time is wrong the
   * moment the user scrolls.
   */
  measure: () => Promise<PerchRect | null>;
}

/**
 * The focused screen's scroll position, readable on the UI thread.
 *
 * `y` is the live offset and `changedAt` is when it last moved. The mascot
 * needs both: the first to stay glued to a card every frame, the second to
 * know when the list is still enough to be worth re-measuring.
 */
export interface ScrollLink {
  y: SharedValue<number>;
  changedAt: SharedValue<number>;
}

/**
 * The set of containers the mascot may hop between.
 *
 * Deliberately *not* React state: a screen mounting a dozen perches would
 * otherwise re-render the whole tab tree a dozen times, and nothing in the UI
 * depends on the registry's contents except the mascot itself. Listeners are
 * notified once per microtask instead, and only the mascot subscribes.
 */
export class PerchRegistry {
  private perches = new Map<string, Perch>();
  private listeners = new Set<() => void>();
  private cheers = new Set<() => void>();
  private scroll: ScrollLink | null = null;
  private flushing = false;

  add(perch: Perch): void {
    this.perches.set(perch.id, perch);
    this.schedule();
  }

  remove(id: string): void {
    if (this.perches.delete(id)) this.schedule();
  }

  list(): Perch[] {
    return Array.from(this.perches.values());
  }

  get(id: string): Perch | undefined {
    return this.perches.get(id);
  }

  /**
   * One pair of shared values, owned by the provider and written by whichever
   * screen is focused. One pair rather than one per screen so the mascot can
   * capture them once: a shared value that holds another shared value is not
   * something to build a hot path on.
   */
  attachScroll(link: ScrollLink): void {
    this.scroll = link;
  }

  get scrollLink(): ScrollLink | null {
    return this.scroll;
  }

  /** The container currently asking for the mascot, if any. */
  caller(): Perch | undefined {
    return this.list().find((p) => p.call);
  }

  /**
   * Something got finished. This is the only thing that spends the `happy`
   * clip, which is what keeps it meaning "well done" rather than "hello".
   */
  celebrate(): void {
    this.cheers.forEach((fn) => fn());
  }

  onCelebrate(fn: () => void): () => void {
    this.cheers.add(fn);
    return () => {
      this.cheers.delete(fn);
    };
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Coalesce a burst of registrations into a single notification. */
  private schedule(): void {
    if (this.flushing) return;
    this.flushing = true;
    queueMicrotask(() => {
      this.flushing = false;
      this.listeners.forEach((fn) => fn());
    });
  }
}

export const MascotRegistryContext = createContext<PerchRegistry | null>(null);

export function useMascotRegistry(): PerchRegistry | null {
  return useContext(MascotRegistryContext);
}

/**
 * Returns a function to call the moment the user finishes something.
 *
 * Call it alongside the confetti, from the same branch that already decided
 * the thing is genuinely done — un-ticking a task is not an achievement, and
 * neither is the third of four daily repeats.
 */
export function useMascotCheer(): () => void {
  const registry = useContext(MascotRegistryContext);
  return useCallback(() => registry?.celebrate(), [registry]);
}
