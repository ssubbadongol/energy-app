/**
 * Dates, and what a day is carrying.
 *
 * Pure functions, no React and no react-native, so the calendar screen is
 * about layout and this is about arithmetic. Everything speaks in day keys —
 * `YYYY-MM-DD` — because that is what `Task.dueDate` is sliced down to
 * everywhere else in the app, and comparing two of those as strings is both
 * correct and timezone-proof.
 *
 * ── Why the calendar is shaped the way it is ──────────────────────────────
 *
 * A month grid is the default in almost every app, and it is close to the
 * worst layout for the people this one is for. Forty-two equally-weighted
 * boxes, most of them empty, with a dot that means "something" and tells you
 * nothing about how much. Three things follow from how ADHD actually works:
 *
 *   Time blindness — time is felt as "now" and "not now", so an absolute date
 *   is a poor handle. Hence `relativeDay`: Today, Tomorrow, Friday, and only
 *   then a date. Words before numbers, always.
 *
 *   Out of sight, out of existence — a task whose day has passed is not late
 *   in the user's head, it has *stopped existing*. Nobody scrolls backwards to
 *   find it. Hence `overdue`, which drags those forward into the one screen
 *   the person is already looking at.
 *
 *   Load blindness — the planning fallacy is amplified, so a day that already
 *   holds four things reads as empty if the boxes all look the same. Hence
 *   `dayLoad`, and a bar rather than a dot.
 */
import type { Task } from './taskStorage';

/** `YYYY-MM-DD`, local. */
export type DayKey = string;

/**
 * Monday-first, and not only because the user is in the UK.
 *
 * With Sunday first the weekend is split across both ends of the strip, so
 * "I'll do it at the weekend" has no single place to land. Monday-first puts
 * Saturday and Sunday together as a visible block.
 */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Long weekday names, indexed by `Date.getDay()` — Sunday first, as JS has it. */
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* ------------------------------------------------------------------ *
 * Day keys
 * ------------------------------------------------------------------ */

export const dayKey = (d: Date): DayKey =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const todayKey = (): DayKey => dayKey(new Date());

/**
 * Anchored at midday, deliberately.
 *
 * Every date here is a whole day, never an instant, and midday is the only
 * hour that survives a DST shift in either direction without the date moving
 * underneath you. Anchoring at midnight makes `addDays` wrong twice a year.
 */
export const parseDay = (key: DayKey): Date => new Date(`${key}T12:00:00`);

export const addDays = (key: DayKey, n: number): DayKey => {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};

/** Whole days from `a` to `b`. Negative when `b` is in the past. */
export const daysBetween = (a: DayKey, b: DayKey): number =>
  Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000);

/** The Monday of the week `key` falls in. */
export const startOfWeek = (key: DayKey): DayKey => {
  const dow = (parseDay(key).getDay() + 6) % 7; // Mon = 0
  return addDays(key, -dow);
};

export const weekOf = (key: DayKey): DayKey[] => {
  const monday = startOfWeek(key);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
};

/**
 * A month as calendar cells, Monday-first, `null` for the leading and
 * trailing blanks so the grid stays rectangular.
 */
export const monthGrid = (year: number, month: number): (DayKey | null)[] => {
  const first = new Date(year, month, 1, 12);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();

  const cells: (DayKey | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(dayKey(new Date(year, month, d, 12)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

/* ------------------------------------------------------------------ *
 * Tasks on days
 * ------------------------------------------------------------------ */

/**
 * Which day a task sits on.
 *
 * A task with no `dueDate` is treated as today's — matching the Today tab,
 * which is where it shows up. Undated tasks are the app's default (the
 * composer does not ask for a date), so they must land somewhere visible
 * rather than in a limbo nobody opens.
 */
export const taskDay = (t: Task, today: DayKey): DayKey =>
  t.dueDate ? t.dueDate.slice(0, 10) : today;

export const tasksOn = (tasks: Task[], key: DayKey, today: DayKey): Task[] =>
  tasks.filter((t) => taskDay(t, today) === key);

/**
 * Everything still open whose day has already gone.
 *
 * Oldest first: the thing that has been waiting longest is the one most likely
 * to have fallen out of memory entirely, so it goes at the top where it will
 * actually be read.
 */
export const overdue = (tasks: Task[], today: DayKey): Task[] =>
  tasks
    .filter((t) => !t.completed && taskDay(t, today) < today)
    .sort((a, b) => taskDay(a, today).localeCompare(taskDay(b, today)));

/* ------------------------------------------------------------------ *
 * Load
 * ------------------------------------------------------------------ */

/**
 * What a full day looks like.
 *
 * Four open tasks fills the bar and five reads as heavy. Low on purpose, and
 * not a number pulled from nowhere: every practical system aimed at this
 * audience — 1-3-5, rule of three, one big thing — lands in roughly the same
 * place, because a list long enough to need triage is a list that gets
 * abandoned whole. The bar is meant to be full sometimes. That is it working.
 */
export const DAY_CAPACITY = 4;
export const DAY_HEAVY = 5;

export interface DayLoad {
  open: number;
  done: number;
  total: number;
  /** Estimated minutes, counting only tasks that actually carry an estimate. */
  minutes: number;
  /** 0–1, for the bar. Clamped, so a twelve-task day is full, not overflowing. */
  fill: number;
  heavy: boolean;
}

export function dayLoad(tasks: Task[], key: DayKey, today: DayKey): DayLoad {
  const on = tasksOn(tasks, key, today);
  const open = on.filter((t) => !t.completed);

  return {
    open: open.length,
    done: on.length - open.length,
    total: on.length,
    // Most tasks are created with `time: 0` — the composer does not ask. So
    // this is a bonus signal when it exists, never the primary one, and the
    // count is what the bar is scaled to. Inventing a duration for an untimed
    // task would make the total look authoritative while being made up.
    minutes: open.reduce((sum, t) => sum + (t.time > 0 ? t.time : 0), 0),
    fill: Math.min(1, open.length / DAY_CAPACITY),
    heavy: open.length >= DAY_HEAVY,
  };
}

/** `90` → `1h 30m`. */
export function formatMinutes(mins: number): string {
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * The line under the day heading — the whole point of which is that "4 things"
 * registers and four identical rows do not.
 */
export function loadSummary(load: DayLoad): string {
  if (load.total === 0) return 'Nothing here. A clear day is allowed.';
  if (load.open === 0) return `All ${load.done} done.`;

  const things = `${load.open} ${load.open === 1 ? 'thing' : 'things'}`;
  const time = formatMinutes(load.minutes);
  const done = load.done > 0 ? `, ${load.done} done` : '';
  return time ? `${things}${done} · about ${time} planned` : `${things}${done}`;
}

/* ------------------------------------------------------------------ *
 * Words for dates
 * ------------------------------------------------------------------ */

/**
 * Words first, numbers last.
 *
 * "Thursday" is a place you can picture; "25/09" is a lookup you have to
 * perform. Inside a week either side, this never makes you do the lookup.
 */
export function relativeDay(key: DayKey, today: DayKey): string {
  const delta = daysBetween(today, key);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';

  const d = parseDay(key);
  if (delta > 1 && delta <= 6) return WEEKDAY_LONG[d.getDay()];
  if (delta < -1 && delta >= -6) return `Last ${WEEKDAY_LONG[d.getDay()]}`;
  return shortDate(key);
}

/** `Sat 27 Sep`. */
export function shortDate(key: DayKey): string {
  const d = parseDay(key);
  return `${WEEKDAY_LONG[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/**
 * How long something has been sitting there, said kindly.
 *
 * Never a count of days late and never a number in red. Shame is a large part
 * of why these tasks got avoided in the first place, so the copy is the
 * difference between a list you reschedule and a list you close the app to
 * get away from.
 */
export function waitedFor(key: DayKey, today: DayKey): string {
  const days = daysBetween(key, today);
  if (days <= 0) return '';
  if (days === 1) return 'since yesterday';
  if (days <= 6) return `since ${WEEKDAY_LONG[parseDay(key).getDay()]}`;
  if (days <= 13) return 'for over a week';
  if (days <= 31) return `for about ${Math.round(days / 7)} weeks`;
  return 'for a long while';
}

/** The month label over a week that straddles two of them. */
export function weekLabel(days: DayKey[]): string {
  const first = parseDay(days[0]);
  const last = parseDay(days[days.length - 1]);
  if (first.getMonth() === last.getMonth()) {
    return `${MONTHS[first.getMonth()]} ${first.getFullYear()}`;
  }
  const sameYear = first.getFullYear() === last.getFullYear();
  const left = sameYear
    ? MONTHS_SHORT[first.getMonth()]
    : `${MONTHS_SHORT[first.getMonth()]} ${first.getFullYear()}`;
  return `${left} – ${MONTHS_SHORT[last.getMonth()]} ${last.getFullYear()}`;
}
