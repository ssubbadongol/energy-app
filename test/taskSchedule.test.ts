/**
 * Date arithmetic, checked.
 *
 * The calendar is the one screen where a bug is silent. A task that lands on
 * the wrong day does not throw, does not warn, and does not look broken — it
 * looks like the user misremembered, which for this audience is the most
 * corrosive possible failure. So the parts that are easy to get quietly wrong
 * get checked here rather than on a device.
 *
 *   npm run test:schedule
 *
 * Node strips the types itself; there is no build step and no test framework.
 *
 * The two daylight-saving cases only have teeth in a timezone that observes
 * it, so they skip themselves elsewhere rather than passing vacuously and
 * looking like coverage. Run them for real with `TZ=Europe/London`, which is
 * where this app's users are.
 */
import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
  addDays,
  DAY_CAPACITY,
  DAY_HEAVY,
  dayKey,
  dayLoad,
  daysBetween,
  formatMinutes,
  loadSummary,
  monthGrid,
  overdue,
  parseDay,
  relativeDay,
  shortDate,
  startOfWeek,
  taskDay,
  waitedFor,
  weekLabel,
  weekOf,
} from '../app/taskSchedule.ts';
import type { Task } from '../app/taskStorage.ts';

/** A task is mostly irrelevant here; only the three scheduling fields matter. */
const mk = (over: Partial<Task> & { id: number }): Task => ({
  name: `task ${over.id}`,
  priority: 'medium',
  energy: 'medium',
  time: 0,
  type: 'Task',
  completed: false,
  ...over,
});

const on = (id: number, day: string, extra: Partial<Task> = {}) =>
  mk({ id, dueDate: `${day}T12:00:00`, ...extra });

/** Does the machine running this actually change its clocks? */
const OBSERVES_DST =
  new Date(2026, 0, 15).getTimezoneOffset() !== new Date(2026, 6, 15).getTimezoneOffset();
const dst = { skip: OBSERVES_DST ? false : 'timezone does not observe DST' };

describe('day arithmetic', () => {
  test('a day key is the local date, not a UTC one', () => {
    // 23:30 local on the 5th is the 6th in UTC. Formatting through toISOString
    // is the classic way to put a task on tomorrow for anyone west of UTC in
    // summer, and it is why dayKey builds the string by hand.
    assert.equal(dayKey(new Date(2026, 8, 5, 23, 30)), '2026-09-05');
    assert.equal(dayKey(new Date(2026, 0, 1, 0, 1)), '2026-01-01');
  });

  test('adding days survives the spring DST jump', dst, () => {
    // 29 March 2026: UK clocks go forward. A midnight-anchored date plus 24h
    // lands at 01:00 on the same day, and the day never advances.
    assert.equal(addDays('2026-03-28', 1), '2026-03-29');
    assert.equal(addDays('2026-03-29', 1), '2026-03-30');
    assert.equal(addDays('2026-03-28', 7), '2026-04-04');
  });

  test('adding days survives the autumn DST jump', dst, () => {
    // 25 October 2026: clocks go back, the day is 25 hours long.
    assert.equal(addDays('2026-10-24', 1), '2026-10-25');
    assert.equal(addDays('2026-10-25', 1), '2026-10-26');
    assert.equal(addDays('2026-10-20', -7), '2026-10-13');
  });

  test('days between is signed and whole across a DST boundary', () => {
    assert.equal(daysBetween('2026-09-19', '2026-09-22'), 3);
    assert.equal(daysBetween('2026-09-22', '2026-09-19'), -3);
    assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);
    assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2);
  });

  test('crossing a year', () => {
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2027-01-01', -1), '2026-12-31');
  });
});

describe('weeks start on Monday', () => {
  test('a Sunday belongs to the week that began six days earlier', () => {
    // 2026-09-20 is a Sunday. The Sunday-first bug puts it on its own week.
    assert.equal(parseDay('2026-09-20').getDay(), 0);
    assert.equal(startOfWeek('2026-09-20'), '2026-09-14');
  });

  test('a Monday is its own start', () => {
    assert.equal(parseDay('2026-09-14').getDay(), 1);
    assert.equal(startOfWeek('2026-09-14'), '2026-09-14');
  });

  test('a week is seven consecutive days, Monday to Sunday', () => {
    const week = weekOf('2026-09-17');
    assert.equal(week.length, 7);
    assert.equal(week[0], '2026-09-14');
    assert.equal(week[6], '2026-09-20');
    assert.equal(parseDay(week[5]).getDay(), 6, 'the sixth column is Saturday');
    assert.equal(parseDay(week[6]).getDay(), 0, 'the weekend is not split');
  });
});

describe('month grid', () => {
  test('is rectangular and Monday-aligned', () => {
    // September 2026 starts on a Tuesday, so there is exactly one blank.
    const cells = monthGrid(2026, 8);
    assert.equal(cells.length % 7, 0);
    assert.equal(cells[0], null);
    assert.equal(cells[1], '2026-09-01');
    assert.equal(cells.filter((c) => c !== null).length, 30);
  });

  test('a month starting on a Sunday gets six leading blanks, not none', () => {
    // November 2026 starts on a Sunday — the case a Sunday-first grid gets
    // right by accident and a Monday-first one gets wrong if lead is mis-derived.
    const cells = monthGrid(2026, 10);
    assert.deepEqual(cells.slice(0, 6), [null, null, null, null, null, null]);
    assert.equal(cells[6], '2026-11-01');
  });

  test('February in a leap year', () => {
    assert.equal(monthGrid(2028, 1).filter((c) => c !== null).length, 29);
    assert.equal(monthGrid(2026, 1).filter((c) => c !== null).length, 28);
  });
});

describe('overdue', () => {
  const today = '2026-09-19';

  test('is only open work whose day has gone', () => {
    const tasks = [
      on(1, '2026-09-17'),
      on(2, '2026-09-18', { completed: true }),
      on(3, '2026-09-19'),
      on(4, '2026-09-20'),
      mk({ id: 5 }), // no dueDate at all
    ];
    assert.deepEqual(overdue(tasks, today).map((t) => t.id), [1]);
  });

  test('an undated task counts as today, so it is never overdue', () => {
    const t = mk({ id: 9 });
    assert.equal(taskDay(t, today), today);
    assert.deepEqual(overdue([t], today), []);
  });

  test('oldest first, because that is the one most likely to be forgotten', () => {
    const tasks = [on(1, '2026-09-18'), on(2, '2026-08-01'), on(3, '2026-09-10')];
    assert.deepEqual(overdue(tasks, today).map((t) => t.id), [2, 3, 1]);
  });
});

describe('day load', () => {
  const today = '2026-09-19';

  test('counts open and done separately', () => {
    const tasks = [
      on(1, today),
      on(2, today),
      on(3, today, { completed: true }),
      on(4, '2026-09-20'),
    ];
    const load = dayLoad(tasks, today, today);
    assert.equal(load.open, 2);
    assert.equal(load.done, 1);
    assert.equal(load.total, 3);
  });

  test('minutes come only from tasks that carry an estimate', () => {
    // Most tasks are created with `time: 0`; a load of "0m" must not be shown
    // as if it were a real estimate of nothing.
    const tasks = [on(1, today, { time: 45 }), on(2, today, { time: 0 }), on(3, today, { time: 30 })];
    assert.equal(dayLoad(tasks, today, today).minutes, 75);
    assert.equal(dayLoad([on(1, today)], today, today).minutes, 0);
  });

  test('completed work does not keep a day looking full', () => {
    const tasks = Array.from({ length: 6 }, (_, i) => on(i, today, { completed: true, time: 60 }));
    const load = dayLoad(tasks, today, today);
    assert.equal(load.fill, 0);
    assert.equal(load.heavy, false);
    assert.equal(load.minutes, 0);
  });

  test('the bar fills at capacity and never overflows', () => {
    const at = (n: number) => dayLoad(Array.from({ length: n }, (_, i) => on(i, today)), today, today);
    assert.equal(at(0).fill, 0);
    assert.equal(at(DAY_CAPACITY).fill, 1);
    assert.equal(at(DAY_CAPACITY * 4).fill, 1);
    assert.equal(at(DAY_HEAVY - 1).heavy, false);
    assert.equal(at(DAY_HEAVY).heavy, true);
  });

  test('the summary says the count, and the time only when there is one', () => {
    assert.match(loadSummary(dayLoad([], today, today)), /clear day/i);
    assert.equal(loadSummary(dayLoad([on(1, today)], today, today)), '1 thing');
    assert.equal(
      loadSummary(dayLoad([on(1, today, { time: 90 }), on(2, today)], today, today)),
      '2 things · about 1h 30m planned',
    );
    assert.equal(
      loadSummary(dayLoad([on(1, today, { completed: true })], today, today)),
      'All 1 done.',
    );
  });
});

describe('words for dates', () => {
  const today = '2026-09-19'; // a Saturday

  test('near days are words, far days are dates', () => {
    assert.equal(relativeDay(today, today), 'Today');
    assert.equal(relativeDay('2026-09-20', today), 'Tomorrow');
    assert.equal(relativeDay('2026-09-18', today), 'Yesterday');
    assert.equal(relativeDay('2026-09-22', today), 'Tuesday');
    assert.equal(relativeDay('2026-09-16', today), 'Last Wednesday');
    assert.equal(relativeDay('2026-10-30', today), 'Fri 30 Oct');
  });

  test('a week out stops being a weekday name, so it cannot mean two things', () => {
    // Seven days from a Saturday is another Saturday. "Saturday" there would
    // be read as today.
    assert.equal(relativeDay('2026-09-26', today), 'Sat 26 Sep');
    assert.equal(shortDate('2026-09-26'), 'Sat 26 Sep');
  });

  test('waiting is described, never counted', () => {
    assert.equal(waitedFor('2026-09-18', today), 'since yesterday');
    assert.equal(waitedFor('2026-09-15', today), 'since Tuesday');
    assert.equal(waitedFor('2026-09-08', today), 'for over a week');
    assert.equal(waitedFor('2026-08-25', today), 'for about 4 weeks');
    assert.equal(waitedFor('2026-01-02', today), 'for a long while');
    assert.equal(waitedFor('2026-09-20', today), '', 'the future has not waited');
  });

  test('minutes read the way people say them', () => {
    assert.equal(formatMinutes(0), '');
    assert.equal(formatMinutes(45), '45m');
    assert.equal(formatMinutes(60), '1h');
    assert.equal(formatMinutes(150), '2h 30m');
  });

  test('a week header names both months when it straddles them', () => {
    assert.equal(weekLabel(weekOf('2026-09-17')), 'September 2026');
    assert.equal(weekLabel(weekOf('2026-09-30')), 'Sep – Oct 2026');
    assert.equal(weekLabel(weekOf('2026-12-31')), 'Dec 2026 – Jan 2027');
  });
});
