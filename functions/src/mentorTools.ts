/**
 * Task CRUD exposed to the mentor as Gemini function calls.
 *
 * The declarations and the executors live together on purpose: they have to
 * agree exactly, and splitting them is how a tool ends up accepting an
 * argument nothing reads. Every executor runs against Firestore under the
 * caller's own uid — the model never gets to name a user.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from './admin';
import { PROMPT_LIMITS, REMINDER_LIMITS, paths } from './config';

export const TASK_TOOL_DECLARATIONS = [
  {
    name: 'add_task',
    description:
      "Add a task to the user's list. Only call this once you know the name, priority, energy, time and type — ask the user for anything missing first.",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short task title, e.g. "Write lab report".' },
        priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'How urgent it is.' },
        energy: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Energy the task demands.' },
        time: { type: 'number', description: 'Estimated minutes.' },
        type: { type: 'string', description: 'Category, e.g. "Deep focus", "Admin", "Creative", "Meeting".' },
        dueDate: { type: 'string', description: 'Optional ISO-8601 due date.' },
      },
      required: ['name', 'priority', 'energy', 'time', 'type'],
    },
  },
  {
    name: 'list_tasks',
    description:
      "Read the user's current tasks. Call this before deleting or completing anything so you match the right one.",
    parameters: {
      type: 'object',
      properties: {
        includeCompleted: { type: 'boolean', description: 'Include already-finished tasks. Defaults to false.' },
      },
    },
  },
  {
    name: 'set_reminder',
    description:
      "Schedule a phone notification for the user. Only call this once they have agreed to a reminder — offer first, then set it when they say yes. Give either minutes_from_now or at_time, not both.",
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'What the notification should say, in the second person. e.g. "Time to start the lab report."',
        },
        minutes_from_now: {
          type: 'number',
          description: 'Fire this many minutes from now. Use for "in an hour", "in 20 minutes".',
        },
        at_time: {
          type: 'string',
          description:
            'Local clock time in 24-hour HH:MM. Use for "at 11", "at half four". If that time has already passed today it is taken as tomorrow.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task done, or undo that.',
    parameters: {
      type: 'object',
      properties: {
        taskName: { type: 'string', description: 'Name of the task, or a distinctive part of it.' },
        completed: { type: 'boolean', description: 'true to complete, false to reopen.' },
      },
      required: ['taskName', 'completed'],
    },
  },
  {
    name: 'delete_task',
    description: "Remove a task from the user's list. Irreversible, so only when they clearly asked.",
    parameters: {
      type: 'object',
      properties: {
        taskName: { type: 'string', description: 'Name of the task, or a distinctive part of it.' },
      },
      required: ['taskName'],
    },
  },
];

export interface TaskRecord {
  id: string;
  name: string;
  priority: 'high' | 'medium' | 'low';
  energy: 'high' | 'medium' | 'low';
  time: number;
  type: string;
  completed: boolean;
  dueDate?: string | null;
}

/** What the client is told happened, so it can refresh and show a receipt. */
export interface ToolEffect {
  tool: string;
  ok: boolean;
  summary: string;
  taskId?: string;
  taskName?: string;
  /**
   * Present when the mentor set a reminder. The device schedules it as a local
   * notification — the server never holds it, because delivering one from here
   * would mean running a push service for something the phone already does by
   * itself, offline, for free.
   */
  reminder?: { text: string; inMinutes: number };
}

export interface ToolOutcome {
  /** Sent back to the model as the functionResponse payload. */
  response: Record<string, unknown>;
  effect: ToolEffect;
}

const LEVELS = ['high', 'medium', 'low'] as const;
type Level = (typeof LEVELS)[number];

function coerceLevel(value: unknown, fallback: Level): Level {
  const v = String(value ?? '').toLowerCase();
  return (LEVELS as readonly string[]).includes(v) ? (v as Level) : fallback;
}

/** Best-effort name match: exact, then substring either way round. */
function findTask(tasks: TaskRecord[], needle: string): TaskRecord | null {
  const q = needle.trim().toLowerCase();
  if (!q) return null;
  return (
    tasks.find((t) => t.name.toLowerCase() === q) ??
    tasks.find((t) => t.name.toLowerCase().includes(q)) ??
    tasks.find((t) => q.includes(t.name.toLowerCase())) ??
    null
  );
}

/**
 * Reserve a free numeric task id.
 *
 * Two tasks created in the same millisecond would otherwise collide, so we
 * walk forward until we find an unused one. In practice this never loops.
 */
async function claimTaskId(uid: string) {
  let candidate = Date.now();
  for (let attempt = 0; attempt < 10; attempt++) {
    const ref = db.doc(paths.userTask(uid, String(candidate)));
    if (!(await ref.get()).exists) return ref;
    candidate += 1;
  }
  return db.doc(paths.userTask(uid, String(Date.now() + Math.floor(Math.random() * 1000))));
}

/**
 * Read the caller's tasks.
 *
 * Names and types are clamped on the way out. These documents are written
 * directly by the client, and `list_tasks` feeds them straight back into the
 * model as a functionResponse — so without a clamp, a task name is an
 * arbitrary-length string the user can inject into their own prompt. Firestore
 * rules bound the write; this bounds the read, which is the side that costs
 * money.
 */
export async function readTasks(uid: string): Promise<TaskRecord[]> {
  const snap = await db
    .collection(paths.userTasks(uid))
    .orderBy('createdAt', 'asc')
    .limit(PROMPT_LIMITS.taskListSize)
    .get();

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: String(data.name ?? '').slice(0, PROMPT_LIMITS.taskName),
      priority: data.priority ?? 'medium',
      energy: data.energy ?? 'medium',
      time: typeof data.time === 'number' ? data.time : 30,
      type: String(data.type ?? 'General').slice(0, PROMPT_LIMITS.taskType),
      completed: data.completed === true,
      dueDate: data.dueDate ? String(data.dueDate).slice(0, 40) : null,
    };
  });
}

/** Human-readable delay, for the mentor's confirmation sentence. */
function describeDelay(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} from now`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `about ${hours} hour${hours === 1 ? '' : 's'} from now`;
  const days = Math.round(hours / 24);
  return `about ${days} day${days === 1 ? '' : 's'} from now`;
}

/**
 * Work out how many minutes from now the reminder should fire.
 *
 * `at_time` is a wall-clock time on the *user's* phone, and the server has no
 * idea what that is — a server in us-central1 resolving "11:00" against its own
 * clock would fire six hours out. So the client sends its own local time with
 * each turn and all of this is computed against that, then handed back as a
 * relative delay the device can schedule without any timezone maths of its own.
 *
 * Returns null when there is nothing usable, so the mentor asks rather than
 * guessing a time and confidently promising the wrong one.
 */
function resolveReminderMinutes(
  args: Record<string, unknown>,
  ctx: ToolContext,
): number | null {
  const raw = Number(args.minutes_from_now);
  if (Number.isFinite(raw) && raw > 0) {
    return clampMinutes(Math.round(raw));
  }

  const at = String(args.at_time ?? '').trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(at);
  if (!match) return null;

  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;

  // Without the client's clock we cannot place a wall-clock time at all.
  const now = localWallClock(ctx.clientNow, ctx.tzOffsetMinutes);
  if (!now) return null;

  const target = new Date(now);
  target.setUTCHours(hours, mins, 0, 0);
  // A time that has already gone today means tomorrow.
  if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 1);

  return clampMinutes(Math.round((target.getTime() - now.getTime()) / 60_000));
}

function clampMinutes(minutes: number): number | null {
  if (minutes < REMINDER_LIMITS.minMinutes) return null;
  return Math.min(minutes, REMINDER_LIMITS.maxMinutes);
}

/**
 * Run one tool call for `uid`.
 *
 * Never throws: a tool failure is fed back to the model as a normal response
 * so it can apologise or ask again, which is a far better experience than the
 * whole turn failing.
 */
export interface ToolContext {
  /** The user's own clock, sent with each turn. See resolveReminderMinutes. */
  clientNow?: string;
  /** Minutes east of UTC on the user's device. */
  tzOffsetMinutes?: number;
}

/**
 * A Date whose *UTC* fields read as the user's local wall clock.
 *
 * Shifting once here means every later comparison can use getUTCHours and
 * setUTCHours and never think about zones again — and crucially the shift
 * cancels out when subtracting two shifted times, so the resulting delay is
 * correct regardless of where the server runs.
 */
export function localWallClock(clientNow?: string, tzOffsetMinutes?: number): Date | null {
  if (!clientNow) return null;
  const utc = Date.parse(clientNow);
  if (Number.isNaN(utc)) return null;
  return new Date(utc + (tzOffsetMinutes ?? 0) * 60_000);
}

export async function executeTaskTool(
  uid: string,
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext = {},
): Promise<ToolOutcome> {
  try {
    switch (name) {
      case 'add_task': {
        const taskName = String(args.name ?? '').trim().slice(0, PROMPT_LIMITS.taskName);
        if (!taskName) {
          return {
            response: { ok: false, error: 'A task needs a name.' },
            effect: { tool: name, ok: false, summary: 'Task not added — no name given.' },
          };
        }
        const minutes = Number(args.time);
        const doc = {
          name: taskName,
          priority: coerceLevel(args.priority, 'medium'),
          energy: coerceLevel(args.energy, 'medium'),
          time: Number.isFinite(minutes) && minutes > 0 ? Math.min(Math.round(minutes), 24 * 60) : 30,
          type: String(args.type ?? 'General').slice(0, PROMPT_LIMITS.taskType),
          dueDate: args.dueDate ? String(args.dueDate).slice(0, 40) : null,
          completed: false,
          source: 'mentor',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        // Document ids are millisecond timestamps as strings, matching the
        // numeric ids the app's local task store already generates. That is
        // what lets a mentor-created task and a device-created task live in
        // one list without a translation layer on either side.
        const ref = await claimTaskId(uid);
        await ref.set(doc);
        return {
          response: {
            ok: true,
            taskId: ref.id,
            task: {
              name: doc.name,
              priority: doc.priority,
              energy: doc.energy,
              time: doc.time,
              type: doc.type,
              dueDate: doc.dueDate,
            },
          },
          effect: { tool: name, ok: true, summary: `Added "${taskName}"`, taskId: ref.id, taskName },
        };
      }

      case 'list_tasks': {
        const includeCompleted = args.includeCompleted === true;
        const all = await readTasks(uid);
        const tasks = includeCompleted ? all : all.filter((t) => !t.completed);
        const plural = tasks.length === 1 ? '' : 's';
        return {
          response: {
            ok: true,
            count: tasks.length,
            tasks: tasks.map((t) => ({
              name: t.name,
              priority: t.priority,
              energy: t.energy,
              time: t.time,
              type: t.type,
              completed: t.completed,
              dueDate: t.dueDate,
            })),
          },
          effect: { tool: name, ok: true, summary: `Read ${tasks.length} task${plural}` },
        };
      }

      case 'complete_task': {
        const tasks = await readTasks(uid);
        const target = findTask(tasks, String(args.taskName ?? ''));
        if (!target) {
          return {
            response: { ok: false, error: 'No matching task.', available: tasks.map((t) => t.name) },
            effect: { tool: name, ok: false, summary: `No task matching "${args.taskName}"` },
          };
        }
        const completed = args.completed !== false;
        await db.doc(paths.userTask(uid, target.id)).update({
          completed,
          completedAt: completed ? FieldValue.serverTimestamp() : null,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return {
          response: { ok: true, task: target.name, completed },
          effect: {
            tool: name,
            ok: true,
            summary: `${completed ? 'Completed' : 'Reopened'} "${target.name}"`,
            taskId: target.id,
            taskName: target.name,
          },
        };
      }

      case 'delete_task': {
        const tasks = await readTasks(uid);
        const target = findTask(tasks, String(args.taskName ?? ''));
        if (!target) {
          return {
            response: { ok: false, error: 'No matching task.', available: tasks.map((t) => t.name) },
            effect: { tool: name, ok: false, summary: `No task matching "${args.taskName}"` },
          };
        }
        await db.doc(paths.userTask(uid, target.id)).delete();
        return {
          response: { ok: true, deleted: target.name },
          effect: {
            tool: name,
            ok: true,
            summary: `Deleted "${target.name}"`,
            taskId: target.id,
            taskName: target.name,
          },
        };
      }

      case 'set_reminder': {
        const text = String(args.text ?? '').trim().slice(0, REMINDER_LIMITS.maxTextChars);
        if (!text) {
          return {
            response: { ok: false, error: 'A reminder needs something to say.' },
            effect: { tool: name, ok: false, summary: 'Reminder not set — nothing to say.' },
          };
        }

        const minutes = resolveReminderMinutes(args, ctx);
        if (minutes === null) {
          return {
            response: {
              ok: false,
              error: 'Could not work out when. Ask them for a time, then call this again.',
            },
            effect: { tool: name, ok: false, summary: 'Reminder not set — unclear when.' },
          };
        }

        const when = describeDelay(minutes);
        return {
          response: { ok: true, text, minutesFromNow: minutes, when },
          effect: {
            tool: name,
            ok: true,
            summary: `Reminder set for ${when}`,
            // The device schedules it. Nothing is stored server-side: a local
            // notification lives on the phone that will show it, and sending
            // it through a push service would mean running one.
            reminder: { text, inMinutes: minutes },
          },
        };
      }

      default:
        return {
          response: { ok: false, error: `Unknown tool ${name}.` },
          effect: { tool: name, ok: false, summary: `Unknown tool ${name}` },
        };
    }
  } catch (err) {
    logger.error('Task tool failed', { uid, tool: name, err });
    return {
      response: { ok: false, error: 'That did not save. Ask the user to try again.' },
      effect: { tool: name, ok: false, summary: `Could not run ${name}` },
    };
  }
}
