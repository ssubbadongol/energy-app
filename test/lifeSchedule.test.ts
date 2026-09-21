/**
 * Life task timing — windows and fixed times.
 *
 * The case this file exists for: setting a task's start and end to the same
 * hour used to schedule **nothing at all**, because the old `reminderTimesFor`
 * bailed out on a zero-length span. A task with no notification looks exactly
 * like a task whose notification has not fired yet, so nobody would find that
 * by using the app — you would just quietly never be reminded to take your
 * nine o'clock tablet.
 *
 *   npm run test:unit
 */
import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
  hourLabel,
  isFixedTime,
  reminderBody,
  reminderTimesFor,
  spanLabel,
} from '../app/lifeSchedule';

/** Minutes past midnight → "HH:MM", so failures are readable. */
const at = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

describe('fixed times', () => {
  test('a task set to one hour is reminded exactly then', () => {
    const times = reminderTimesFor({ startHour: 21, endHour: 21 });
    assert.deepEqual(times.map(at), ['21:00']);
  });

  test('one nudge, however many times a day the task claims to repeat', () => {
    // A repeat count describes how often you do the thing. You cannot do it
    // four times at nine o'clock, and four notifications at 21:00 would be
    // four copies of the same notification.
    for (const repeats of [1, 2, 3, 4]) {
      const times = reminderTimesFor({ startHour: 21, endHour: 21, repeats });
      assert.deepEqual(times.map(at), ['21:00'], `repeats: ${repeats}`);
    }
  });

  test('midnight is a legal fixed time, not a falsy hour', () => {
    // `startHour: 0` is the value most likely to be dropped by a truthiness
    // check somewhere in the chain.
    assert.equal(isFixedTime({ startHour: 0, endHour: 0 }), true);
    assert.deepEqual(reminderTimesFor({ startHour: 0, endHour: 0 }).map(at), ['00:00']);
  });

  test('it reads as a single time, not a window of zero length', () => {
    assert.equal(spanLabel(21, 21), '9 PM');
    assert.equal(spanLabel(0, 0), '12 AM');
    assert.equal(spanLabel(12, 12), '12 PM');
  });

  test('the notification does not promise a window that does not exist', () => {
    const body = reminderBody('Take meds', { startHour: 21, endHour: 21 });
    assert.match(body, /9 PM on the dot/);
    assert.doesNotMatch(body, /window/, 'there is no window to still be open');
    assert.doesNotMatch(body, /late|missed|should have/i, 'and nobody is late at 9 PM sharp');
  });
});

describe('windows still behave', () => {
  test('nudges sit inside the span, never on its edges', () => {
    // 6–10 with two reminders: 7:20 and 8:40. One at 6:00 is just an alarm and
    // one at 10:00 arrives after the window has shut.
    const times = reminderTimesFor({ startHour: 6, endHour: 10 });
    assert.deepEqual(times.map(at), ['07:20', '08:40']);
    assert.ok(times.every((t) => t > 6 * 60 && t < 10 * 60));
  });

  test('a task done three times a day gets three', () => {
    const times = reminderTimesFor({ startHour: 12, endHour: 18, repeats: 3 });
    assert.equal(times.length, 3);
    assert.ok(times.every((t) => t > 12 * 60 && t < 18 * 60));
  });

  test('never past the end of the day', () => {
    const times = reminderTimesFor({ startHour: 20, endHour: 24, repeats: 4 });
    assert.ok(times.every((t) => t < 24 * 60), `got ${times.map(at).join(', ')}`);
  });

  test('a window keeps its shared meridiem collapsed', () => {
    assert.equal(spanLabel(6, 10), '6–10 AM');
    assert.equal(spanLabel(12, 14), '12–2 PM');
    assert.equal(spanLabel(6, 12), '6 AM–12 PM');
  });

  test('the window body still says the window is open', () => {
    const body = reminderBody('Shower', { startHour: 6, endHour: 10 });
    assert.match(body, /window is open until 10 AM/);
  });

  test('a backwards window schedules nothing rather than guessing', () => {
    // Corrupt data, not a fixed time. Putting a notification at an arbitrary
    // hour would be worse than putting none.
    assert.deepEqual(reminderTimesFor({ startHour: 18, endHour: 9 }), []);
  });
});

describe('the clock setting reaches every label', () => {
  test('hours and spans', () => {
    assert.equal(hourLabel(21, '24h'), '21:00');
    assert.equal(hourLabel(21, '12h'), '9 PM');
    assert.equal(spanLabel(18, 20, '24h'), '18:00–20:00');
    assert.equal(spanLabel(21, 21, '24h'), '21:00', 'a fixed time stays a single time');
  });

  test('and the notification body', () => {
    assert.match(reminderBody('Take meds', { startHour: 21, endHour: 21 }, '24h'), /21:00 on the dot/);
    assert.match(reminderBody('Shower', { startHour: 6, endHour: 10 }, '24h'), /open until 10:00/);
  });
});

describe('hour labels', () => {
  test('noon and midnight are 12, not 0', () => {
    assert.equal(hourLabel(0), '12 AM');
    assert.equal(hourLabel(12), '12 PM');
    assert.equal(hourLabel(23), '11 PM');
    // 24 is a window's closing midnight and is named rather than numbered, so
    // that a 20:00-24:00 window cannot read as ending before it began.
    assert.equal(hourLabel(24), 'Midnight');
  });
});
