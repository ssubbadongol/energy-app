import AsyncStorage from '@react-native-async-storage/async-storage';

type EnergyLevel = 'high' | 'medium' | 'low';
type Priority = 'high' | 'medium' | 'low';

export interface Task {
  id: number;
  name: string;
  priority: Priority;
  energy: EnergyLevel;
  time: number;
  type: string;
  completed: boolean;
  dueDate?: string;
}

const TASKS_STORAGE_KEY = '@energy_tasks';

let sharedTasks: Task[] = [];
let isInitialized = false;

// Initialize tasks from AsyncStorage
export const initializeTasks = async (): Promise<Task[]> => {
  if (isInitialized) {
    return sharedTasks;
  }

  try {
    const storedTasks = await AsyncStorage.getItem(TASKS_STORAGE_KEY);
    if (storedTasks !== null) {
      sharedTasks = JSON.parse(storedTasks);
      console.log('📦 Loaded tasks from storage:', sharedTasks.length);
    } else {
      // First time - set default tasks
      sharedTasks = [
        { id: 1, name: 'Write client proposal', priority: 'high', energy: 'high', time: 60, type: 'Deep focus', completed: false, dueDate: new Date().toISOString() },
        { id: 2, name: 'Reply to emails', priority: 'medium', energy: 'low', time: 20, type: 'Admin', completed: false, dueDate: new Date().toISOString() },
        { id: 3, name: 'Review design mockups', priority: 'high', energy: 'medium', time: 30, type: 'Creative', completed: false, dueDate: new Date().toISOString() },
      ];
      await saveTasks(sharedTasks);
      console.log('📦 Initialized with default tasks');
    }
    isInitialized = true;
    return sharedTasks;
  } catch (error) {
    console.error('Error loading tasks:', error);
    return sharedTasks;
  }
};

// Save tasks to AsyncStorage
const saveTasks = async (tasks: Task[]) => {
  try {
    await AsyncStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
    console.log('💾 Saved tasks to storage:', tasks.length);
  } catch (error) {
    console.error('Error saving tasks:', error);
  }
};

export const getSharedTasks = (): Task[] => {
  return sharedTasks;
};

export const updateSharedTasks = async (tasks: Task[]) => {
  sharedTasks = tasks;
  await saveTasks(tasks);
};

export const addTask = async (task: Omit<Task, 'id'>) => {
  const newTask = { ...task, id: Date.now() };
  sharedTasks = [...sharedTasks, newTask];
  await saveTasks(sharedTasks);
  console.log('✅ Task added:', newTask);
  console.log('📊 Total tasks:', sharedTasks.length);
  return newTask;
};

export const updateTask = async (id: number, updates: Partial<Task>) => {
  sharedTasks = sharedTasks.map(task =>
    task.id === id ? { ...task, ...updates } : task
  );
  await saveTasks(sharedTasks);
  console.log('✏️ Task updated:', id);
  return sharedTasks.find(t => t.id === id);
};

export const deleteTask = async (id: number) => {
  sharedTasks = sharedTasks.filter(task => task.id !== id);
  await saveTasks(sharedTasks);
  console.log('🗑️ Task deleted:', id);
  console.log('📊 Remaining tasks:', sharedTasks.length);
};

export const toggleTaskCompletion = async (id: number) => {
  const task = sharedTasks.find(t => t.id === id);
  if (task) {
    await updateTask(id, { completed: !task.completed });
  }
};