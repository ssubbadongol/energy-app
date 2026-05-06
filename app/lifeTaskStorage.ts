import AsyncStorage from '@react-native-async-storage/async-storage';

export type TimeOfDay = 'morning' | 'midday' | 'evening';

export interface LifeTask {
  id: string;
  emoji: string;
  name: string;
  timeWindow: string;
  timeOfDay: TimeOfDay;
  enabled: boolean;
  completed: boolean;
  isDefault: boolean;
  repeats?: number;
  completedCount: number;
}

const LIFE_TASKS_STORAGE_KEY = '@energy_life_tasks';
const LAST_RESET_DATE_KEY = '@energy_last_reset_date';

const defaultLifeTasks: LifeTask[] = [
  // Morning tasks
  { id: 'shower', emoji: '🚿', name: 'Shower', timeWindow: '6–10 AM', timeOfDay: 'morning', enabled: false, completed: false, isDefault: true, completedCount: 0 },
  { id: 'breakfast', emoji: '🍳', name: 'Breakfast', timeWindow: '7–10 AM', timeOfDay: 'morning', enabled: false, completed: false, isDefault: true, completedCount: 0 },
  { id: 'meds-morning', emoji: '💊', name: 'Take meds', timeWindow: '7–11 AM', timeOfDay: 'morning', enabled: false, completed: false, isDefault: true, completedCount: 0 },
  { id: 'water-morning', emoji: '💧', name: 'Drink water', timeWindow: '6–12 PM', timeOfDay: 'morning', enabled: false, completed: false, isDefault: true, repeats: 2, completedCount: 0 },
  
  // Midday tasks
  { id: 'lunch', emoji: '🍽', name: 'Eat lunch', timeWindow: '12–2 PM', timeOfDay: 'midday', enabled: false, completed: false, isDefault: true, completedCount: 0 },
  { id: 'walk', emoji: '🚶', name: 'Take a walk', timeWindow: '12–5 PM', timeOfDay: 'midday', enabled: false, completed: false, isDefault: true, completedCount: 0 },
  { id: 'water-midday', emoji: '💧', name: 'Drink water', timeWindow: '12–6 PM', timeOfDay: 'midday', enabled: false, completed: false, isDefault: true, repeats: 3, completedCount: 0 },
  { id: 'exercise', emoji: '🏃', name: 'Exercise', timeWindow: '3–7 PM', timeOfDay: 'midday', enabled: false, completed: false, isDefault: true, completedCount: 0 },
  
  // Evening tasks
  { id: 'dinner', emoji: '🍽', name: 'Eat dinner', timeWindow: '6–8 PM', timeOfDay: 'evening', enabled: false, completed: false, isDefault: true, completedCount: 0 },
  { id: 'plants', emoji: '💧', name: 'Water plants', timeWindow: '5–9 PM', timeOfDay: 'evening', enabled: false, completed: false, isDefault: true, completedCount: 0 },
  { id: 'meds-evening', emoji: '💊', name: 'Take meds', timeWindow: '7–10 PM', timeOfDay: 'evening', enabled: false, completed: false, isDefault: true, completedCount: 0 },
  { id: 'wind-down', emoji: '😴', name: 'Wind down', timeWindow: '8–11 PM', timeOfDay: 'evening', enabled: false, completed: false, isDefault: true, completedCount: 0 },
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
      lifeTasksData = JSON.parse(storedTasks);
      console.log('💙 Loaded life tasks from storage:', lifeTasksData.length);
    } else {
      // First time - set default tasks
      lifeTasksData = defaultLifeTasks;
      await saveLifeTasks(lifeTasksData);
      console.log('💙 Initialized with default life tasks');
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

// Save life tasks to AsyncStorage
const saveLifeTasks = async (tasks: LifeTask[]) => {
  try {
    await AsyncStorage.setItem(LIFE_TASKS_STORAGE_KEY, JSON.stringify(tasks));
    console.log('💾 Saved life tasks to storage:', tasks.length);
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
  console.log('💙 Life tasks reset for new day');
};

// Check if we need to reset tasks (new day)
const checkAndResetDaily = () => {
  const today = new Date().toDateString();
  if (lastResetDate !== today) {
    resetDailyLifeTasks();
  }
};