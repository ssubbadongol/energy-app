import { createContext, useContext } from 'react';

/**
 * What the mascot does while it is standing on a container.
 *
 * The clip is a property of the container, not a random draw: a task is
 * something being worked on, a finished one is something to rest beside, and
 * everything else is just a good place to sit. `walking` is not a mood — it is
 * only ever travel between containers, or a wander around one.
 */
export type MascotMood = 'happy' | 'working' | 'sleeping';

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
