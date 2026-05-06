// Storage for the single pinned task that shows in notification

export type PinnedTaskType = 'task' | 'life';

export interface PinnedTask {
  id: string | number;
  name: string;
  type: PinnedTaskType;
  emoji?: string;
  time?: number;
  timeWindow?: string;
  repeats?: number;
  completedCount?: number;
  pinnedAt: string;
}

let pinnedTask: PinnedTask | null = null;

export const getPinnedTask = (): PinnedTask | null => {
  return pinnedTask;
};

export const setPinnedTask = (task: PinnedTask | null) => {
  pinnedTask = task;
};

export const clearPinnedTask = () => {
  pinnedTask = null;
};

export const hasPinnedTask = (): boolean => {
  return pinnedTask !== null;
};