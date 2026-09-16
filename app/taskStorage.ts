import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, writeBatch } from '@react-native-firebase/firestore';
import { db, ensureAuth } from './firebase';

type EnergyLevel = 'high' | 'medium' | 'low';
type Priority = 'high' | 'medium' | 'low';

/**
 * One step inside a task.
 *
 * Deliberately flat and dumb: an id, a label, a tick. No nesting, no due
 * dates, no reminders. The whole point is to turn "finish the assignment" into
 * something a person can start, and a subtask that needs its own planning has
 * defeated that.
 */
export interface Subtask {
  id: string;
  name: string;
  done: boolean;
}

/** Hard ceiling, mirrored in `firestore.rules` and enforced server-side. */
export const MAX_SUBTASKS = 12;

export interface Task {
  id: number;
  name: string;
  priority: Priority;
  energy: EnergyLevel;
  time: number;
  type: string;
  completed: boolean;
  dueDate?: string;
  /** "HH:MM", 24h. The clock time the task is meant to happen at. */
  dueTime?: string;
  /** The checklist, when the task has been broken down. Absent means none. */
  subtasks?: Subtask[];
}

const TASKS_STORAGE_KEY = '@energy_tasks';

let sharedTasks: Task[] = [];
let isInitialized = false;

/* ------------------------------------------------------------------ *
 * Firestore mirror
 * ------------------------------------------------------------------ *
 *
 * AsyncStorage stays the read path — it is instant and works offline, and
 * every screen reads `getSharedTasks()` synchronously.
 *
 * Firestore is the *shared* copy: it is the only version the AI Mentor can
 * see. When the mentor adds or completes a task it writes there, server-side,
 * under the user's own uid — so the mirror is what makes "add a task to finish
 * my lab report" actually show up on the Today tab.
 *
 * Document ids are the numeric task id as a string, on both sides, so a task
 * created on the device and one created by the mentor are the same kind of
 * thing with no translation layer.
 */

/** Fired after a background sync changes anything, so screens can refresh. */
type Listener = () => void;
const listeners = new Set<Listener>();

export const onTasksChanged = (fn: Listener): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const notify = () => listeners.forEach((fn) => fn());

function toRemote(task: Task) {
  return {
    name: task.name,
    priority: task.priority,
    energy: task.energy,
    time: task.time,
    type: task.type,
    completed: task.completed,
    dueDate: task.dueDate ?? null,
    dueTime: task.dueTime ?? null,
    subtasks: task.subtasks ?? [],
    updatedAt: serverTimestamp(),
  };
}

function fromRemote(id: string, data: any): Task | null {
  const numericId = Number(id);
  // Ignore anything that is not one of our numeric ids rather than minting a
  // NaN-keyed task that no screen could ever match.
  if (!Number.isFinite(numericId)) return null;
  const task: Task = {
    id: numericId,
    name: data.name ?? '',
    priority: (data.priority ?? 'medium') as Priority,
    energy: (data.energy ?? 'medium') as EnergyLevel,
    time: typeof data.time === 'number' ? data.time : 30,
    type: data.type ?? 'General',
    completed: data.completed === true,
    dueDate: data.dueDate ?? undefined,
  };

  // Fields added after the first documents were written are only set when the
  // document actually carries the key. A document that has never heard of
  // `dueTime` must not be able to erase one — it has no opinion, and defaulting
  // it to `undefined` here would turn "not stored yet" into "cleared" on the
  // next sync. An explicit null *is* a clear, and does come through.
  if ('dueTime' in data) task.dueTime = data.dueTime ?? undefined;

  // Same reasoning as `dueTime`, plus a shape check: this array is written by
  // the client and by a Cloud Function, and a malformed row must not be able
  // to crash every screen that renders a task.
  if (Array.isArray(data.subtasks)) {
    task.subtasks = data.subtasks
      .filter((s: unknown): s is Record<string, unknown> => !!s && typeof s === 'object')
      .slice(0, MAX_SUBTASKS)
      .map((s: Record<string, unknown>, i: number) => ({
        id: String(s.id ?? `${numericId}-${i}`),
        name: String(s.name ?? ''),
        done: s.done === true,
      }))
      .filter((s: Subtask) => s.name.length > 0);
  }

  return task;
}

/**
 * Push one task up. Never throws: losing the mirror is a degraded experience
 * (the mentor is out of date) but losing the local write would be a bug.
 */
async function mirrorUpsert(task: Task): Promise<void> {
  try {
    const uid = await ensureAuth();
    await setDoc(doc(db, 'users', uid, 'tasks', String(task.id)), {
      ...toRemote(task),
      createdAt: serverTimestamp(),
      source: 'app',
    }, { merge: true });
  } catch (err) {
    console.warn('[tasks] Could not mirror task to Firestore', err);
  }
}

async function mirrorDelete(id: number): Promise<void> {
  try {
    const uid = await ensureAuth();
    await deleteDoc(doc(db, 'users', uid, 'tasks', String(id)));
  } catch (err) {
    console.warn('[tasks] Could not delete task from Firestore', err);
  }
}

/**
 * Reconcile with Firestore.
 *
 * Remote wins for anything that exists in both — the mentor's writes are the
 * ones the device has not seen. Local-only tasks are pushed up rather than
 * dropped, which doubles as the one-time migration for anyone who already had
 * tasks before this feature shipped.
 *
 * A task that exists remotely and not locally is adopted (the mentor added
 * it); a task that exists locally and not remotely is uploaded. That does mean
 * a task deleted by the mentor while the app was closed comes back on the next
 * sync — the alternative is silently deleting offline work, which is worse.
 */
export const syncTasksFromFirestore = async (): Promise<Task[]> => {
  try {
    const uid = await ensureAuth();
    const snap = await getDocs(collection(db, 'users', uid, 'tasks'));

    const remote = new Map<number, Task>();
    snap.forEach((d) => {
      const task = fromRemote(d.id, d.data());
      if (task) remote.set(task.id, task);
    });

    const localOnly = sharedTasks.filter((t) => !remote.has(t.id));

    // Upload whatever the server has never seen, in one round trip.
    if (localOnly.length > 0) {
      const batch = writeBatch(db);
      localOnly.forEach((task) => {
        batch.set(
          doc(db, 'users', uid, 'tasks', String(task.id)),
          { ...toRemote(task), createdAt: serverTimestamp(), source: 'app' },
          { merge: true },
        );
      });
      await batch.commit();
    }

    // Remote wins field by field, not document by document. Replacing the whole
    // local task would drop anything the server's copy predates — which is how a
    // due time set on an older task disappeared on the next cold start.
    const localById = new Map(sharedTasks.map((task) => [task.id, task]));
    const merged = [
      ...[...remote.values()].map((r) => {
        const local = localById.get(r.id);
        return local ? { ...local, ...r } : r;
      }),
      ...localOnly,
    ].sort((a, b) => a.id - b.id);
    const changed = JSON.stringify(merged) !== JSON.stringify(sharedTasks);

    sharedTasks = merged;
    await saveTasks(sharedTasks);
    if (changed) notify();

    return sharedTasks;
  } catch (err) {
    console.warn('[tasks] Firestore sync failed, staying on the local copy', err);
    return sharedTasks;
  }
};

/* ------------------------------------------------------------------ *
 * Local store
 * ------------------------------------------------------------------ */

export const initializeTasks = async (): Promise<Task[]> => {
  if (isInitialized) return sharedTasks;

  try {
    const storedTasks = await AsyncStorage.getItem(TASKS_STORAGE_KEY);
    if (storedTasks !== null) {
      sharedTasks = JSON.parse(storedTasks);
    } else {
      sharedTasks = [
        { id: 1, name: 'Write client proposal', priority: 'high', energy: 'high', time: 60, type: 'Deep focus', completed: false, dueDate: new Date().toISOString() },
        { id: 2, name: 'Reply to emails', priority: 'medium', energy: 'low', time: 20, type: 'Admin', completed: false, dueDate: new Date().toISOString() },
        { id: 3, name: 'Review design mockups', priority: 'high', energy: 'medium', time: 30, type: 'Creative', completed: false, dueDate: new Date().toISOString() },
      ];
      await saveTasks(sharedTasks);
    }
    isInitialized = true;

    // Don't block first paint on the network; screens re-render via onTasksChanged.
    void syncTasksFromFirestore();

    return sharedTasks;
  } catch (error) {
    console.error('Error loading tasks:', error);
    return sharedTasks;
  }
};

const saveTasks = async (tasks: Task[]) => {
  try {
    await AsyncStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
  } catch (error) {
    console.error('Error saving tasks:', error);
  }
};

export const getSharedTasks = (): Task[] => sharedTasks;

export const updateSharedTasks = async (tasks: Task[]) => {
  sharedTasks = tasks;
  await saveTasks(tasks);
};

export const addTask = async (task: Omit<Task, 'id'>) => {
  const newTask = { ...task, id: Date.now() };
  sharedTasks = [...sharedTasks, newTask];
  await saveTasks(sharedTasks);
  void mirrorUpsert(newTask);
  return newTask;
};

export const updateTask = async (id: number, updates: Partial<Task>) => {
  sharedTasks = sharedTasks.map((task) => (task.id === id ? { ...task, ...updates } : task));
  await saveTasks(sharedTasks);
  const updated = sharedTasks.find((t) => t.id === id);
  if (updated) void mirrorUpsert(updated);
  return updated;
};

export const deleteTask = async (id: number) => {
  sharedTasks = sharedTasks.filter((task) => task.id !== id);
  await saveTasks(sharedTasks);
  void mirrorDelete(id);
};

/**
 * Ticking a task with steps ticks all of them, and un-ticking clears them.
 *
 * Forgiving on purpose. The alternative — making someone tick five boxes
 * before the task itself will close — punishes exactly the person this feature
 * is for. You can always just say "done" and move on.
 */
export const toggleTaskCompletion = async (id: number) => {
  const task = sharedTasks.find((t) => t.id === id);
  if (!task) return;

  const completed = !task.completed;
  const updates: Partial<Task> = { completed };
  if (task.subtasks?.length) {
    updates.subtasks = task.subtasks.map((s) => ({ ...s, done: completed }));
  }
  await updateTask(id, updates);
};

/* ------------------------------------------------------------------ *
 * Subtasks
 * ------------------------------------------------------------------ */

/** Ids only need to be unique within their task, so this is enough. */
export const makeSubtasks = (names: string[]): Subtask[] =>
  names
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .slice(0, MAX_SUBTASKS)
    .map((name, i) => ({ id: `${Date.now()}-${i}`, name, done: false }));

export const setSubtasks = async (taskId: number, subtasks: Subtask[]) => {
  await updateTask(taskId, { subtasks: subtasks.slice(0, MAX_SUBTASKS) });
};

/**
 * Tick one step, and let the parent follow.
 *
 * Finishing the last step completes the task — otherwise you tick the final
 * box and the thing still sits there looking unfinished, which is a small
 * betrayal. Un-ticking one re-opens it for the same reason: the task plainly
 * is not done any more.
 */
export const toggleSubtask = async (taskId: number, subtaskId: string) => {
  const task = sharedTasks.find((t) => t.id === taskId);
  if (!task?.subtasks?.length) return;

  const subtasks = task.subtasks.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s));
  await updateTask(taskId, { subtasks, completed: subtasks.every((s) => s.done) });
};

/** `2/5`, for the card. */
export const subtaskProgress = (task: Task): { done: number; total: number } | null => {
  const total = task.subtasks?.length ?? 0;
  if (total === 0) return null;
  return { done: task.subtasks!.filter((s) => s.done).length, total };
};
