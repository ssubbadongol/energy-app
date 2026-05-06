import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';

const CHANNEL_ID = 'task-focus';

// ── Feature 2: keyword-based time estimation ───────────────────────────────
export function estimateTaskDuration(title: string, description?: string): number {
  const text = `${title} ${description ?? ''}`.toLowerCase();

  if (/\b(project|presentation|proposal)\b/.test(text)) return 120;
  if (/\b(assignment|essay|thesis|dissertation|draft)\b/.test(text)) return 90;
  if (/\b(design|build|develop|code|implement|create)\b/.test(text)) return 90;
  if (/\b(study|research|read|review|prepare|plan|analyze)\b/.test(text)) return 45;
  if (/\b(meeting|call|interview|session|discussion)\b/.test(text)) return 30;
  if (/\b(write|report)\b/.test(text)) return 45;
  if (/\b(email|reply|message|respond|text)\b/.test(text)) return 10;
  if (/\b(quick|brief|short|small|minor|simple)\b/.test(text)) return 15;

  return 30;
}

interface TaskForScheduling {
  id: number;
  name: string;
  description?: string;
  dueDate?: string;
  dueTime?: string;
  time?: number;
  existingNotificationIds?: string[];
}

// ── Schedule deadline-aware notifications ─────────────────────────────────
export async function scheduleTaskNotifications(
  task: TaskForScheduling
): Promise<string[]> {
  if (!task.dueDate || !task.dueTime) return [];

  // Cancel any previously scheduled notifications for this task first
  if (task.existingNotificationIds?.length) {
    await cancelTaskNotifications(task.existingNotificationIds);
  }

  // Build deadline from stored date + "HH:MM"
  const [h, m] = task.dueTime.split(':').map(Number);
  const deadline = new Date(task.dueDate);
  deadline.setHours(h, m, 0, 0);

  const now = new Date();
  if (deadline <= now) return []; // Deadline already passed — nothing to schedule

  const estimatedMins = task.time ?? estimateTaskDuration(task.name, task.description);
  const ids: string[] = [];

  const scheduleAt = async (id: string, date: Date, body: string) => {
    if (date <= now) {
      console.log(`Skipping past notification [${id}] at:`, date.toISOString());
      return;
    }
    console.log(`Scheduling notification [${id}] at:`, date.toISOString());
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: 'Soft Focus Reminder',
        body,
        data: { taskId: task.id },
      },
      trigger: {
        type: SchedulableTriggerInputTypes.DATE,
        date,
        channelId: CHANNEL_ID,
      },
    });
    ids.push(id);
  };

  // 1 — time to leave: deadline minus estimated task duration
  const leaveTime = new Date(deadline.getTime() - estimatedMins * 60_000);
  await scheduleAt(
    `task-${task.id}-start`,
    leaveTime,
    `Time to start "${task.name}" — it may take around ${estimatedMins} min.`
  );

  // 2 — at deadline
  await scheduleAt(
    `task-${task.id}-deadline`,
    deadline,
    `"${task.name}" is due now. You've got this!`
  );

  return ids;
}

// ── Feature 4: cancel all notifications for a task ────────────────────────
export async function cancelTaskNotifications(
  notificationIds: string[]
): Promise<void> {
  await Promise.all(
    notificationIds.map(async (id) => {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      await Notifications.dismissNotificationAsync(id).catch(() => {});
    })
  );
}
