/**
 * When a life task's nudges land, and how its time reads.
 *
 * Pure, and split out of `lifeReminderService.ts` because that module imports
 * expo-notifications at the top and so cannot be exercised off a device. The
 * failure mode here is silence — a task that schedules no notification looks
 * exactly like a task whose notification has not fired yet — so it is worth
 * being able to assert on.
 *
 * ── Windows and fixed times ──────────────────────────────────────────────
 *
 * Most life tasks are windows: "shower" is not due at 6am, it should happen
 * somewhere between 6 and 10, and the nudges sit inside that span so they read
 * as the window still being open rather than as the user being late.
 *
 * Some things are not like that. Medication at 9pm is at 9pm. Setting the
 * start and the end to the same hour says so, and everything downstream — the
 * label, the reminder, the wording of it — changes to match.
 */
import { type ClockFormat, formatHour } from './clockFormat';

/** A task's time, as stored. `start === end` means a fixed time, not a window. */
export interface TimeSpan {
  startHour: number;
  endHour: number;
  repeats?: number;
}

export const isFixedTime = (span: Pick<TimeSpan, 'startHour' | 'endHour'>): boolean =>
  span.startHour === span.endHour;

/** `21` → `9 PM`, or `21:00`. */
export function hourLabel(hour: number, format: ClockFormat = '12h'): string {
  return formatHour(hour, format);
}

/**
 * How a task's time is written on the card: `6–10 AM`, or just `9 PM`.
 *
 * The shared meridiem is dropped from the start of a window — "6–10 AM" reads
 * better than "6 AM–10 AM" and is what the stored labels already look like.
 */
export function spanLabel(startHour: number, endHour: number, format: ClockFormat = '12h'): string {
  if (startHour === endHour) return hourLabel(startHour, format);

  const a = hourLabel(startHour, format);
  const b = hourLabel(endHour, format);
  // A 24-hour label carries no meridiem to share, so there is nothing to drop.
  if (format === '24h') return `${a}–${b}`;
  if (a.slice(-2) === b.slice(-2)) return `${a.replace(` ${a.slice(-2)}`, '')}–${b}`;
  return `${a}–${b}`;
}

/**
 * When to nudge, as minutes past midnight.
 *
 * For a window: two by default, more if the routine repeats, sitting at even
 * fractions *inside* the span and never on its edges. A nudge at 6:00 for a
 * 6–10 window is just an alarm, and one at 10:00 arrives after the window has
 * shut. For 6–10 with two reminders that is 7:20 and 8:40. Rounded to five
 * minutes, because a notification at 8:41 looks like the output of a formula.
 *
 * For a fixed time: exactly one nudge, exactly on the hour, whatever `repeats`
 * says. Four reminders for a 9pm tablet would all be at 9pm, and a fixed time
 * is a single event by definition — the repeat count describes how many times
 * you do the thing, and you cannot do it twice at nine o'clock.
 *
 * The previous version returned nothing at all when the span was zero, which
 * meant a fixed-time task scheduled no notification whatsoever. That is the
 * case that most needs one.
 */
export function reminderTimesFor(task: TimeSpan): number[] {
  if (isFixedTime(task)) return [task.startHour * 60];

  const span = (task.endHour - task.startHour) * 60;
  // A backwards window is a corrupt row, not a fixed time. Nothing sensible to
  // schedule, and guessing would put a notification at an arbitrary hour.
  if (span < 0) return [];

  const count = Math.max(2, task.repeats ?? 1);
  const start = task.startHour * 60;

  const times: number[] = [];
  for (let i = 1; i <= count; i++) {
    const at = Math.round((start + (span * i) / (count + 1)) / 5) * 5;
    // A window ending at midnight would otherwise round past the end of the day.
    times.push(Math.min(at, 24 * 60 - 1));
  }
  return times;
}

/**
 * What the notification says.
 *
 * A window's body reassures — there is still time. A fixed time's cannot say
 * that without lying, so it says what it is instead. Still no "you're late":
 * the notification arrives *at* the time, so nobody is late yet, and telling
 * someone off is how an app gets its notifications turned off.
 */
export function reminderBody(name: string, span: TimeSpan, format: ClockFormat = '12h'): string {
  const task = name.toLowerCase();
  if (isFixedTime(span)) {
    return `It's ${task} time — ${hourLabel(span.startHour, format)} on the dot.`;
  }
  return `It's ${task} time — your window is open until ${hourLabel(span.endHour, format)}.`;
}
