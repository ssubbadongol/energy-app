/**
 * Nudges inside a life task's window.
 *
 * A life task is usually not a deadline — "shower" is not due at 6am, it is
 * something that should happen somewhere between 6 and 10. So these are not
 * one alarm at a due time; they are a couple of taps on the shoulder spread
 * through the window, and the body says the window is still open rather than
 * that the user is late.
 *
 * A task whose start and end are the same hour *is* a deadline, and gets a
 * single nudge on the hour. See `lifeSchedule.ts`, which holds the arithmetic
 * and the wording for both shapes.
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
import { reminderBody, reminderTimesFor } from './lifeSchedule';
import { getUserProfileSync } from './userProfileStorage';
import { devLog } from './devLog';

export { reminderTimesFor };

/** The channel `setupNotifications` actually creates. */
const CHANNEL_ID = 'task-focus';

/** Every identifier this module owns starts with this, so it can clean up. */
const PREFIX = 'life-remind-';

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

    // Read once for the whole rebuild rather than per task: the schedule is
    // torn down and recreated on every edit, so the format cannot drift
    // between notifications within one pass.
    const clock = getUserProfileSync().clock;

    let scheduled = 0;
    for (const task of tasks) {
      if (!task.enabled || !task.remind) continue;

      const times = reminderTimesFor(task);
      for (let i = 0; i < times.length; i++) {
        await Notifications.scheduleNotificationAsync({
          identifier: `${PREFIX}${task.id}-${i}`,
          content: {
            title: `${task.emoji} ${task.name}`,
            body: reminderBody(task.name, task, clock),
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
