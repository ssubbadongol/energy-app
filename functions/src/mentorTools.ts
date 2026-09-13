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
import { PROMPT_LIMITS, paths } from './config';

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

/**
 * Run one tool call for `uid`.
 *
 * Never throws: a tool failure is fed back to the model as a normal response
 * so it can apologise or ask again, which is a far better experience than the
 * whole turn failing.
 */
export async function executeTaskTool(
  uid: string,
  name: string,
  args: Record<string, unknown>,
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
