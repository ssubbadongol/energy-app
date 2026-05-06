type EnergyLevel = 'high' | 'medium' | 'low';
type Priority = 'high' | 'medium' | 'low';

export interface Task {
  id: number;
  name: string;
  description?: string;
  priority: Priority;
  energy: EnergyLevel;
  time: number;
  type: string;
  completed: boolean;
  dueDate?: string;
  dueTime?: string;        // "HH:MM" 24h, optional
  notificationIds?: string[];
}

let sharedTasks: Task[] = [
  { id: 1, name: 'Write client proposal', priority: 'high', energy: 'high', time: 60, type: 'Deep focus', completed: false, dueDate: new Date().toISOString() },
  { id: 2, name: 'Reply to emails', priority: 'medium', energy: 'low', time: 20, type: 'Admin', completed: false, dueDate: new Date().toISOString() },
  { id: 3, name: 'Review design mockups', priority: 'high', energy: 'medium', time: 30, type: 'Creative', completed: false, dueDate: new Date().toISOString() },
];

export const getSharedTasks = (): Task[] => {
  return sharedTasks;
};

export const updateSharedTasks = (tasks: Task[]) => {
  sharedTasks = tasks;
};

export const addTask = (task: Omit<Task, 'id'>) => {
  const newTask = { ...task, id: Date.now() };
  sharedTasks = [...sharedTasks, newTask];
  return newTask;
};

export const updateTask = (id: number, updates: Partial<Task>) => {
  sharedTasks = sharedTasks.map(t => t.id === id ? { ...t, ...updates } : t);
};