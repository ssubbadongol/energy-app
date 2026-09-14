/**
 * Reminders the mentor sets.
 *
 * The mentor cannot deliver a notification. It returns a `reminder` effect
 * saying what to show and how far out, and this schedules it locally on the
 * device.
 *
 * That split is deliberate. A local notification needs no push service, no
 * device tokens, no server holding a queue of pending messages, and it fires
 * whether or not the phone has a connection or the app is running. The
 * alternative — a scheduled function and FCM — would be infrastructure to
 * maintain, a per-message cost, and one more thing to be down at 7am.
 *
 * The trade is that a reminder lives on the phone that scheduled it: it does
 * not follow the user to another device, and it goes if the app is
 * reinstalled. For "nudge me at 11 to start the lab report", that is the right
 * trade.
 */
import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';

/** Matches the channel the other notification paths use. */
const CHANNEL_ID = 'energy-tasks';

export interface MentorReminder {
  text: string;
  inMinutes: number;
}

export interface ScheduledReminder {
  id: string;
  /** When it will fire, for the receipt the chat shows under the reply. */
  at: Date;
}

/**
 * Schedule one reminder. Returns null rather than throwing: a notification
 * that could not be scheduled should not take down the mentor's reply, and
 * the caller shows a different receipt when it comes back empty.
 */
export async function scheduleMentorReminder(
  reminder: MentorReminder,
): Promise<ScheduledReminder | null> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync();
      if (asked.status !== 'granted') {
        console.warn('[reminder] Notification permission denied — not scheduling');
        return null;
      }
    }

    const at = new Date(Date.now() + reminder.inMinutes * 60_000);
    const id = `mentor-reminder-${at.getTime()}`;

    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: 'Soft Focus',
        body: reminder.text,
        data: { source: 'mentor' },
      },
      trigger: {
        type: SchedulableTriggerInputTypes.DATE,
        date: at,
        channelId: CHANNEL_ID,
      },
    });

    return { id, at };
  } catch (err) {
    console.warn('[reminder] Could not schedule', err);
    return null;
  }
}

/** Local time like "11:00", for the confirmation shown in the transcript. */
export function formatReminderTime(at: Date): string {
  return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
