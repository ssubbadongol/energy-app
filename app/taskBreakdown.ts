/**
 * "Break this down" — the client half.
 *
 * Manual subtasks are free; this is the Pro feature, because this is the one
 * that costs money to run. The gate lives on the server (`requireProCaller` in
 * `functions/src/breakdown.ts`); everything here is about turning the refusal
 * into something a person can act on rather than an error code.
 *
 * Mirrors `podService.ts`'s `PodUnavailable` pattern so the two Pro-gated
 * surfaces fail in the same shape and the UI can route both to the paywall.
 */
import { callable, callableErrorCode } from './firebase';
import { makeSubtasks, setSubtasks, type Subtask } from './taskStorage';
import { track } from './monitoring';
import { devLog } from './devLog';

export type BreakdownBlockReason =
  | 'needs_pro'
  | 'unverified_build'
  | 'signed_out'
  | 'paused'
  | 'rate_limited'
  | 'no_steps'
  | 'unknown';

export class BreakdownUnavailable extends Error {
  constructor(
    readonly reason: BreakdownBlockReason,
    message: string,
  ) {
    super(message);
    this.name = 'BreakdownUnavailable';
  }
}

const breakdownCallable = callable<
  { name: string; type?: string; time?: number; context?: string },
  { steps: string[]; degraded: 'rate_limited' | 'mentor_disabled' | 'model_error' | null }
>('breakdownTask');

function toBreakdownError(err: unknown): BreakdownUnavailable {
  const code = callableErrorCode(err);
  switch (code) {
    case 'permission-denied':
      return new BreakdownUnavailable('needs_pro', 'Breaking tasks down is part of Soft Focus Pro.');
    case 'failed-precondition':
      return new BreakdownUnavailable('unverified_build', 'This app build could not be verified.');
    case 'unauthenticated':
      return new BreakdownUnavailable('signed_out', 'Sign in again to use this.');
    case 'invalid-argument':
      return new BreakdownUnavailable('unknown', 'Give the task a name first.');
    default:
      console.warn('[breakdown] Unexpected failure', err);
      return new BreakdownUnavailable('unknown', 'Could not break this one down just now.');
  }
}

/**
 * Ask for steps without writing them anywhere.
 *
 * Separate from `breakdownTask` because the task composer needs this for a
 * task that does not exist yet — you can break down "finish the assignment"
 * while you are still typing it, and the steps are saved along with the task
 * when you hit Add. A version that could only write to an existing id would
 * force you to save first, then edit, which is two steps too many.
 */
export async function requestBreakdown(task: {
  name: string;
  type?: string;
  time?: number;
  /** What the user said the task involves. Optional, and the main quality lever. */
  context?: string;
}): Promise<Subtask[]> {
  let steps: string[];
  let degraded: string | null;

  try {
    const { data } = await breakdownCallable({
      name: task.name,
      type: task.type,
      time: task.time,
      context: task.context,
    });
    steps = data?.steps ?? [];
    degraded = data?.degraded ?? null;
  } catch (err) {
    throw toBreakdownError(err);
  }

  // Degraded answers come back as a normal response rather than an error, so
  // that the daily-limit case can say something kind instead of looking broken.
  if (degraded === 'rate_limited') {
    throw new BreakdownUnavailable(
      'rate_limited',
      "That's today's AI allowance used up. You can still add steps by hand.",
    );
  }
  if (degraded === 'mentor_disabled') {
    throw new BreakdownUnavailable(
      'paused',
      'The AI features are paused right now. Adding steps by hand still works.',
    );
  }
  if (steps.length === 0) {
    throw new BreakdownUnavailable(
      'no_steps',
      "I couldn't find a good way to split that one. Try a more specific task name, or add steps yourself.",
    );
  }

  const subtasks = makeSubtasks(steps);
  track('task_broken_down', { steps: subtasks.length });
  devLog('[breakdown] Generated', subtasks.length, 'steps');
  return subtasks;
}

/** Break down a task that already exists, and save the steps onto it. */
export async function breakdownTask(task: {
  id: number;
  name: string;
  type?: string;
  time?: number;
}): Promise<Subtask[]> {
  const subtasks = await requestBreakdown(task);
  await setSubtasks(task.id, subtasks);
  return subtasks;
}
