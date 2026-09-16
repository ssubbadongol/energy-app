import AsyncStorage from '@react-native-async-storage/async-storage';
import { devLog } from './devLog';

export type TimeOfDay = 'morning' | 'midday' | 'evening';

export interface LifeTask {
  id: string;
  emoji: string;
  name: string;
  /** Display form of the window, e.g. "6–10 AM". Derived from the hours. */
  timeWindow: string;
  /** Window start, as a whole hour 0–23. */
  startHour: number;
  /** Window end, as a whole hour 1–24. Always later than `startHour`. */
  endHour: number;
  /**
   * Whether to nudge inside the window. On by default — a routine you have
   * turned on but are never reminded about is a list you have to remember to
   * read, which is the thing this tab exists to avoid.
   */
  remind: boolean;
  timeOfDay: TimeOfDay;
  enabled: boolean;
  completed: boolean;
  isDefault: boolean;
  repeats?: number;
  completedCount: number;
}

/**
 * Read "6–10 AM" / "12–2 PM" / "6–12 PM" back into whole hours.
 *
 * Only the end of the label reliably carries a meridiem, so the start borrows
 * it and flips when that lands at or past the end — which is what makes
 * "6–12 PM" come out as 6 AM to noon rather than an empty window. Used to
 * migrate rows written before the hours were stored; new rows carry both.
 */
export function parseTimeWindow(label: string): { startHour: number; endHour: number } {
  const parts = label.split(/[–—-]/);
  if (parts.length < 2) return { startHour: 9, endHour: 11 };

  const read = (part: string) => {
    const m = /(\d{1,2})\s*(AM|PM)?/i.exec(part.trim());
    if (!m) return null;
    return { hour: Number(m[1]), meridiem: m[2] ? (m[2].toUpperCase() as 'AM' | 'PM') : null };
  };

  const start = read(parts[0]);
  const end = read(parts[1]);
  if (!start || !end) return { startHour: 9, endHour: 11 };

  const to24 = (hour: number, meridiem: 'AM' | 'PM') =>
    meridiem === 'AM' ? hour % 12 : (hour % 12) + 12;

  const endMeridiem = end.meridiem ?? 'PM';
  const endHour = to24(end.hour, endMeridiem);

  let startHour = to24(start.hour, start.meridiem ?? endMeridiem);
  if (startHour >= endHour) {
    startHour = to24(start.hour, start.meridiem ?? (endMeridiem === 'PM' ? 'AM' : 'PM'));
  }

  return startHour < endHour ? { startHour, endHour } : { startHour: 9, endHour: 11 };
}

const LIFE_TASKS_STORAGE_KEY = '@energy_life_tasks';
const LAST_RESET_DATE_KEY = '@energy_last_reset_date';

const defaultLifeTasks: LifeTask[] = [
  // Morning tasks
  { id: 'shower', emoji: '🚿', name: 'Shower', timeWindow: '6–10 AM', startHour: 6, endHour: 10, remind: true, timeOfDay: 'morning', enabled: false, completed: false, isDefault: true, completedCount: 0 },
  { id: 'breakfast', emoji: '🍳', name: 'Breakfast', timeWindow: '7–10 AM', startHour: 7, endHour: 10, remind: true, timeOfDay: 'morning', enabled: false, completed: false, isDefault: true, completedCount: 0 },
  { id: 'meds-morning', emoji: '💊', name: 'Take meds', timeWindow: '7–11 AM', startHour: 7, endHour: 11, remind: true, timeOfDay: 'morning', enabled: false, completed: false, isDefault: true, completedCount: 0 },
  { id: 'water-morning', emoji: '💧', name: 'Drink water', timeWindow: '6–12 PM', startHour: 6, endHour: 12, remind: true, timeOfDay: 'morning', enabled: false, completed: false, isDefault: true, repeats: 2, completedCount: 0 },

  // Midday tasks
  { id: 'lunch', emoji: '🍽', name: 'Eat lunch', timeWindow: '12–2 PM', startHour: 12, endHour: 14, remind: true, timeOfDay: 'midday', enabled: false, completed: false, isDefault: true, completedCount: 0 },
  { id: 'walk', emoji: '🚶', name: 'Take a walk', timeWindow: '12–5 PM', startHour: 12, endHour: 17, remind: true, timeOfDay: 'midday', enabled: false, completed: false, isDefault: true, completedCount: 0 },
  { id: 'water-midday', emoji: '💧', name: 'Drink water', timeWindow: '12–6 PM', startHour: 12, endHour: 18, remind: true, timeOfDay: 'midday', enabled: false, completed: false, isDefault: true, repeats: 3, completedCount: 0 },
  { id: 'exercise', emoji: '🏃', name: 'Exercise', timeWindow: '3–7 PM', startHour: 15, endHour: 19, remind: true, timeOfDay: 'midday', enabled: false, completed: false, isDefault: true, completedCount: 0 },

  // Evening tasks
  { id: 'dinner', emoji: '🍽', name: 'Eat dinner', timeWindow: '6–8 PM', startHour: 18, endHour: 20, remind: true, timeOfDay: 'evening', enabled: false, completed: false, isDefault: true, completedCount: 0 },
  { id: 'plants', emoji: '💧', name: 'Water plants', timeWindow: '5–9 PM', startHour: 17, endHour: 21, remind: true, timeOfDay: 'evening', enabled: false, completed: false, isDefault: true, completedCount: 0 },
  { id: 'meds-evening', emoji: '💊', name: 'Take meds', timeWindow: '7–10 PM', startHour: 19, endHour: 22, remind: true, timeOfDay: 'evening', enabled: false, completed: false, isDefault: true, completedCount: 0 },
  { id: 'wind-down', emoji: '😴', name: 'Wind down', timeWindow: '8–11 PM', startHour: 20, endHour: 23, remind: true, timeOfDay: 'evening', enabled: false, completed: false, isDefault: true, completedCount: 0 },
];

let lifeTasksData: LifeTask[] = [];
let lastResetDate: string | null = null;
let isInitialized = false;

// Initialize life tasks from AsyncStorage
export const initializeLifeTasks = async (): Promise<LifeTask[]> => {
  if (isInitialized) {
    return lifeTasksData;
  }

  try {
    const [storedTasks, storedResetDate] = await Promise.all([
      AsyncStorage.getItem(LIFE_TASKS_STORAGE_KEY),
      AsyncStorage.getItem(LAST_RESET_DATE_KEY),
    ]);

    if (storedTasks !== null) {
      const parsed = JSON.parse(storedTasks) as LifeTask[];
      lifeTasksData = migrate(parsed);
      // Write the filled-in rows back so the migration settles instead of
      // running again on every launch.
      if (JSON.stringify(lifeTasksData) !== JSON.stringify(parsed)) {
        await saveLifeTasks(lifeTasksData);
      }
      devLog('💙 Loaded life tasks from storage:', lifeTasksData.length);
    } else {
      // First time - set default tasks
      lifeTasksData = defaultLifeTasks;
      await saveLifeTasks(lifeTasksData);
      devLog('💙 Initialized with default life tasks');
    }

    if (storedResetDate !== null) {
      lastResetDate = storedResetDate;
    }

    // Check if we need to reset for new day
    checkAndResetDaily();

    isInitialized = true;
    return lifeTasksData;
  } catch (error) {
    console.error('Error loading life tasks:', error);
    lifeTasksData = defaultLifeTasks;
    return lifeTasksData;
  }
};

/**
 * Fill in fields added after a row was first written.
 *
 * Rows stored before the window was structured carry only the `timeWindow`
 * label, so the hours are read back out of it; rows stored before reminders
 * existed get the default (on), matching what a new row would have.
 */
function migrate(stored: LifeTask[]): LifeTask[] {
  return stored.map((task) => {
    const hasHours = typeof task.startHour === 'number' && typeof task.endHour === 'number';
    const hours = hasHours
      ? { startHour: task.startHour, endHour: task.endHour }
      : parseTimeWindow(task.timeWindow);
    return { ...task, ...hours, remind: task.remind ?? true };
  });
}

// Save life tasks to AsyncStorage
const saveLifeTasks = async (tasks: LifeTask[]) => {
  try {
    await AsyncStorage.setItem(LIFE_TASKS_STORAGE_KEY, JSON.stringify(tasks));
    devLog('💾 Saved life tasks to storage:', tasks.length);
  } catch (error) {
    console.error('Error saving life tasks:', error);
  }
};

// Save last reset date
const saveResetDate = async (date: string) => {
  try {
    await AsyncStorage.setItem(LAST_RESET_DATE_KEY, date);
  } catch (error) {
    console.error('Error saving reset date:', error);
  }
};

export const getLifeTasks = (): LifeTask[] => {
  checkAndResetDaily();
  return lifeTasksData;
};

export const updateLifeTasks = async (tasks: LifeTask[]) => {
  lifeTasksData = tasks;
  await saveLifeTasks(tasks);
};

export const toggleLifeTaskRemind = async (id: string) => {
  lifeTasksData = lifeTasksData.map(task =>
    task.id === id ? { ...task, remind: !task.remind } : task
  );
  await saveLifeTasks(lifeTasksData);
};

export const toggleLifeTaskEnabled = async (id: string) => {
  lifeTasksData = lifeTasksData.map(task => 
    task.id === id ? { ...task, enabled: !task.enabled } : task
  );
  await saveLifeTasks(lifeTasksData);
};

export const toggleLifeTaskCompleted = async (id: string) => {
  lifeTasksData = lifeTasksData.map(task => {
    if (task.id === id) {
      // If it's a repeating task
      if (task.repeats && task.repeats > 1) {
        const newCount = task.completedCount + 1;
        const isFullyCompleted = newCount >= task.repeats;
        return {
          ...task,
          completedCount: newCount,
          completed: isFullyCompleted,
        };
      } else {
        // Regular task - just toggle
        return { ...task, completed: !task.completed };
      }
    }
    return task;
  });
  await saveLifeTasks(lifeTasksData);
};

export const addLifeTask = async (task: Omit<LifeTask, 'id' | 'completed' | 'completedCount'>) => {
  const newTask: LifeTask = {
    ...task,
    id: `custom-${Date.now()}`,
    completed: false,
    completedCount: 0,
  };
  lifeTasksData = [...lifeTasksData, newTask];
  await saveLifeTasks(lifeTasksData);
  return newTask;
};

export const updateLifeTask = async (id: string, updates: Partial<LifeTask>) => {
  lifeTasksData = lifeTasksData.map(task =>
    task.id === id ? { ...task, ...updates } : task
  );
  await saveLifeTasks(lifeTasksData);
};

export const deleteLifeTask = async (id: string) => {
  lifeTasksData = lifeTasksData.filter(task => task.id !== id);
  await saveLifeTasks(lifeTasksData);
};

export const resetDailyLifeTasks = async () => {
  lifeTasksData = lifeTasksData.map(task => ({
    ...task,
    completed: false,
    completedCount: 0,
  }));
  const today = new Date().toDateString();
  lastResetDate = today;
  await saveLifeTasks(lifeTasksData);
  await saveResetDate(today);
  devLog('💙 Life tasks reset for new day');
};

// Check if we need to reset tasks (new day)
const checkAndResetDaily = () => {
  const today = new Date().toDateString();
  if (lastResetDate !== today) {
    resetDailyLifeTasks();
  }
};