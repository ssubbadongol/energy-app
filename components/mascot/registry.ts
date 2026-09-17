import { createContext, useCallback, useContext } from 'react';

/**
 * What the mascot does while it is at a container.
 *
 * Named for the behaviour rather than the sprite, because the two are not one
 * to one: `potter` and `work` both show the laptop clip and differ only in how
 * long the mascot stays put before wandering off again.
 *
 *   potter  restless — a short pause, then off walking again. The default,
 *           and what "waiting for you to do something" looks like.
 *   work    settles in for a while. Tasks, composers, anything being worked on.
 *   rest    naps. Finished tasks, an empty day, a paused session.
 *
 * `walking` is not a mood: it is travel between containers and pottering
 * around one. `happy` is not a mood either — it is reserved for finishing a
 * task, and nothing else in the app may spend it.
 */
export type MascotMood = 'potter' | 'work' | 'rest';

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
