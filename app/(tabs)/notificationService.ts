import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getLifeTasks, toggleLifeTaskCompleted } from '../lifeTaskStorage';
import { clearPinnedTask, setPinnedTask } from '../pinnedTaskStorage';
import { getSharedTasks, updateSharedTasks } from './taskStorage';

const CHANNEL_ID = 'task-focus';
export const NOTIF_ID = 'energy-pinned-task';
const CAT_REGULAR = 'TASK_FOCUS';
const CAT_REPEAT = 'TASK_FOCUS_REPEAT';

export async function setupNotifications(): Promise<boolean> {
  // Set how notifications behave when app is in foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  // Create Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Task Focus',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0],
      lightColor: '#8b5cf6',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  // Regular task: single "Done" action
  await Notifications.setNotificationCategoryAsync(CAT_REGULAR, [
    {
      identifier: 'DONE',
      buttonTitle: '✅ Done',
      options: { opensAppToForeground: false },
    },
  ]);

  // Repeating life task: "Log one" + "All done" actions
  await Notifications.setNotificationCategoryAsync(CAT_REPEAT, [
    {
      identifier: 'LOG_ONE',
      buttonTitle: '➕ Log one',
      options: { opensAppToForeground: false },
    },
    {
      identifier: 'ALL_DONE',
      buttonTitle: '✅ All done',
      options: { opensAppToForeground: false },
    },
  ]);

  // Request permission (Android 13+ requires runtime permission)
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export interface PinnedTaskData {
  id: string | number;
  name: string;
  type: 'task' | 'life';
  emoji?: string;
  timeWindow?: string;
  time?: number;
  repeats?: number;
  completedCount?: number;
}

export async function pinTaskToNotification(task: PinnedTaskData): Promise<void> {
  await dismissPinnedNotification();

  const isRepeat = task.type === 'life' && (task.repeats ?? 1) > 1;
  const title = `${task.emoji ?? '📌'} ${task.name}`;
  let body: string;

  if (isRepeat) {
    const done = task.completedCount ?? 0;
    body = `${done}/${task.repeats} done today · tap action to log`;
  } else if (task.timeWindow) {
    body = task.timeWindow;
  } else if (task.time) {
    body = `${task.time} min`;
  } else {
    body = 'In focus';
  }

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIF_ID,
    content: {
      title,
      body,
      categoryIdentifier: isRepeat ? CAT_REPEAT : CAT_REGULAR,
      data: {
        taskId: String(task.id),
        taskType: task.type,
        taskName: task.name,
        taskEmoji: task.emoji ?? '',
        taskRepeats: task.repeats ?? 1,
        taskTimeWindow: task.timeWindow ?? '',
        taskTime: task.time ?? 0,
      },
      sticky: true,
      color: '#8b5cf6',
    } as any,
    trigger: { channelId: CHANNEL_ID } as any,
  });

  setPinnedTask({
    id: task.id,
    name: task.name,
    type: task.type,
    emoji: task.emoji,
    time: task.time,
    timeWindow: task.timeWindow,
    repeats: task.repeats,
    completedCount: task.completedCount,
    pinnedAt: new Date().toISOString(),
  });
}

export async function dismissPinnedNotification(): Promise<void> {
  await Notifications.dismissNotificationAsync(NOTIF_ID).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(NOTIF_ID).catch(() => {});
  clearPinnedTask();
}

export async function handleNotificationResponse(
  response: Notifications.NotificationResponse
): Promise<void> {
  const data = response.notification.request.content.data as Record<string, any>;
  const taskId = data.taskId as string;
  const taskType = data.taskType as 'task' | 'life';
  const actionId = response.actionIdentifier;

  if (actionId === 'DONE' || actionId === 'ALL_DONE') {
    // Mark fully complete
    if (taskType === 'task') {
      const tasks = getSharedTasks();
      updateSharedTasks(
        tasks.map((t) => (String(t.id) === taskId ? { ...t, completed: true } : t))
      );
    } else {
      const task = getLifeTasks().find((t) => t.id === taskId);
      if (task && !task.completed) {
        toggleLifeTaskCompleted(taskId);
      }
    }
    await dismissPinnedNotification();
  } else if (actionId === 'LOG_ONE') {
    // Increment one repeat and update notification
    toggleLifeTaskCompleted(taskId);
    const updated = getLifeTasks().find((t) => t.id === taskId);
    if (updated && !updated.completed) {
      await pinTaskToNotification({
        id: updated.id,
        name: updated.name,
        type: 'life',
        emoji: updated.emoji,
        timeWindow: updated.timeWindow,
        repeats: updated.repeats,
        completedCount: updated.completedCount,
      });
    } else {
      await dismissPinnedNotification();
    }
  }
  // DEFAULT_ACTION_IDENTIFIER (tap) just opens the app — no extra action needed
}
