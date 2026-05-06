// taskTools.ts - Function calling tools for Gemini to manage tasks

import { addTask, deleteTask, getSharedTasks, updateTask } from './taskStorage';

// Define the tools schema for Gemini
export const TASK_MANAGEMENT_TOOLS = [
  {
    name: 'add_task',
    description: 'Add a new task to the user\'s task list. Use this when the user wants to create a task. Required fields: name, priority, energy, time, type. Optional: dueDate.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The task name or title (e.g., "Write blog post")',
        },
        priority: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Task priority level',
        },
        energy: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Energy level required for the task',
        },
        time: {
          type: 'number',
          description: 'Estimated time in minutes',
        },
        type: {
          type: 'string',
          description: 'Task category (e.g., "Deep focus", "Admin", "Creative", "Meeting")',
        },
        dueDate: {
          type: 'string',
          description: 'Due date in ISO format (optional)',
        },
      },
      required: ['name', 'priority', 'energy', 'time', 'type'],
    },
  },
  {
    name: 'delete_task',
    description: 'Delete a task from the user\'s task list. Use this when the user wants to remove a task.',
    parameters: {
      type: 'object',
      properties: {
        taskName: {
          type: 'string',
          description: 'The name of the task to delete',
        },
      },
      required: ['taskName'],
    },
  },
  {
    name: 'list_tasks',
    description: 'Get all tasks from the user\'s task list. Use this to see what tasks exist before modifying them.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as completed or uncompleted.',
    parameters: {
      type: 'object',
      properties: {
        taskName: {
          type: 'string',
          description: 'The name of the task to mark as complete',
        },
        completed: {
          type: 'boolean',
          description: 'Whether to mark as completed (true) or uncompleted (false)',
        },
      },
      required: ['taskName', 'completed'],
    },
  },
];

// Execute tool calls
export const executeTaskTool = async (toolName: string, args: any): Promise<string> => {
  try {
    switch (toolName) {
      case 'add_task': {
        const { name, priority, energy, time, type, dueDate } = args;
        
        const newTask = await addTask({
          name,
          priority,
          energy,
          time,
          type,
          completed: false,
          dueDate: dueDate || undefined,
        });
        
        return `Task "${name}" added successfully! ID: ${newTask.id}`;
      }

      case 'delete_task': {
        const { taskName } = args;
        const tasks = getSharedTasks();
        const taskToDelete = tasks.find(t => 
          t.name.toLowerCase().includes(taskName.toLowerCase())
        );
        
        if (!taskToDelete) {
          return `Task "${taskName}" not found. Available tasks: ${tasks.map(t => t.name).join(', ')}`;
        }
        
        await deleteTask(taskToDelete.id);
        return `Task "${taskToDelete.name}" deleted successfully!`;
      }

      case 'list_tasks': {
        const tasks = getSharedTasks();
        
        if (tasks.length === 0) {
          return 'No tasks found. You can add tasks anytime!';
        }
        
        const taskList = tasks.map(t => 
          `- ${t.name} (${t.priority} priority, ${t.energy} energy, ${t.time}min) ${t.completed ? '✅' : '⏳'}`
        ).join('\n');
        
        return `Here are your tasks:\n${taskList}`;
      }

      case 'complete_task': {
        const { taskName, completed } = args;
        const tasks = getSharedTasks();
        const taskToUpdate = tasks.find(t => 
          t.name.toLowerCase().includes(taskName.toLowerCase())
        );
        
        if (!taskToUpdate) {
          return `Task "${taskName}" not found.`;
        }
        
        await updateTask(taskToUpdate.id, { completed });
        return `Task "${taskToUpdate.name}" marked as ${completed ? 'completed' : 'incomplete'}!`;
      }

      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (error) {
    console.error('Task tool execution error:', error);
    return `Error executing ${toolName}: ${error}`;
  }
};

// Helper to check if all required fields are present
export const validateTaskData = (data: any): { valid: boolean; missingFields: string[] } => {
  const requiredFields = ['name', 'priority', 'energy', 'time', 'type'];
  const missingFields = requiredFields.filter(field => !data[field]);
  
  return {
    valid: missingFields.length === 0,
    missingFields,
  };
};