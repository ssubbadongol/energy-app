/**
 * Nudges inside a life task's window.
 *
 * A life task is not a deadline — "shower" is not due at 6am, it is something
 * that should happen somewhere between 6 and 10. So these are not one alarm at
 * a due time; they are a couple of taps on the shoulder spread through the
 * window, and the body says the window is still open rather than that the user
 * is late.
 *
 * They are daily repeating local notifications, so they survive the app being
 * closed and need no server. The trade is the same one `reminderService` makes:
 * they live on the phone that scheduled them and go if the app is reinstalled.
 * `syncLifeReminders` is cheap and idempotent, so it runs on boot and after any
 * edit rather than trying to keep an incremental record of what is scheduled.
 */
import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import type { LifeTask } from './lifeTaskStorage';
import { devLog } from './devLog';

/** The channel `setupNotifications` actually creates. */
const CHANNEL_ID = 'task-focus';

/** Every identifier this module owns starts with this, so it can clean up. */
const PREFIX = 'life-remind-';

/**
 * When to nudge, as minutes past midnight.
 *
 * Two by default — the count the routine was asked for — but a task the user
 * does three times a day gets three, because two reminders for three glasses of
 * water is a reminder that is wrong twice.
 *
 * They sit at even fractions *inside* the window, never on its edges: a nudge
 * at 6:00 for a 6–10 window is just an alarm, and one at 10:00 arrives when the
 * window has already closed. For 6–10 with two reminders that lands on 7:20 and
 * 8:40. Rounded to five minutes because a notification at 8:41 looks like the
 * output of a formula, which is what it is.
 */
export function reminderTimesFor(task: Pick<LifeTask, 'startHour' | 'endHour' | 'repeats'>): number[] {
  const count = Math.max(2, task.repeats ?? 1);
  const start = task.startHour * 60;
  const span = (task.endHour - task.startHour) * 60;
  if (span <= 0) return [];

  const times: number[] = [];
  for (let i = 1; i <= count; i++) {
    const at = Math.round((start + (span * i) / (count + 1)) / 5) * 5;
    // A window ending at midnight would otherwise round past the end of the day.
    times.push(Math.min(at, 24 * 60 - 1));
  }
  return times;
}

function bodyFor(task: LifeTask): string {
  const closes = hourLabel(task.endHour);
  return `It's ${task.name.toLowerCase()} time — your window is open until ${closes}.`;
}

function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const meridiem = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12} ${meridiem}`;
}

/** Drop every reminder this module has scheduled, whatever the task list says now. */
async function cancelAll(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((request) => request.identifier.startsWith(PREFIX))
      .map((request) =>
        Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => {}),
      ),
  );
}

/**
 * Rebuild the whole schedule from the current task list.
 *
 * Tearing it down and laying it out again is what keeps deleted tasks, turned
 * off tasks and shortened windows from leaving orphaned alarms behind — the
 * identifiers are derived from the task, so anything the new pass does not
 * write is something that should no longer fire.
 *
 * Never throws. A routine that failed to schedule its nudges is worse than one
 * that did, but not worse than a screen that crashed on the way to drawing it.
 */
export async function syncLifeReminders(tasks: LifeTask[]): Promise<number> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      console.warn('[life] Notification permission not granted — not scheduling reminders');
      return 0;
    }

    await cancelAll();

    let scheduled = 0;
    for (const task of tasks) {
      if (!task.enabled || !task.remind) continue;

      const times = reminderTimesFor(task);
      for (let i = 0; i < times.length; i++) {
        await Notifications.scheduleNotificationAsync({
          identifier: `${PREFIX}${task.id}-${i}`,
          content: {
            title: `${task.emoji} ${task.name}`,
            body: bodyFor(task),
            data: { taskId: task.id, taskType: 'life' },
          },
          trigger: {
            type: SchedulableTriggerInputTypes.DAILY,
            hour: Math.floor(times[i] / 60),
            minute: times[i] % 60,
            channelId: CHANNEL_ID,
          },
        });
        scheduled++;
      }
    }

    devLog(`💙 Scheduled ${scheduled} life reminders`);
    return scheduled;
  } catch (err) {
    console.warn('[life] Could not sync reminders', err);
    return 0;
  }
}
