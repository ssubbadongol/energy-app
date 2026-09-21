/**
 * 12-hour and 24-hour clocks.
 *
 * Small functions, but the ones most likely to be wrong in a way nobody
 * notices until it matters: midnight and noon are where every hand-rolled
 * clock formatter breaks, and an hour that reads as 12 hours off is the kind
 * of bug that gets discovered by missing something.
 *
 *   npm run test:unit
 */
import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
  AM,
  formatClock,
  formatHour,
  from12,
  meridiemOf,
  PM,
  to12,
} from '../app/clockFormat';

describe('12-hour', () => {
  test('midnight and noon are both 12, and not each other', () => {
    assert.equal(formatHour(0, '12h'), '12 AM');
    assert.equal(formatHour(12, '12h'), '12 PM');
  });

  test('afternoon hours come back down to the clock face', () => {
    assert.equal(formatHour(13, '12h'), '1 PM');
    assert.equal(formatHour(21, '12h'), '9 PM');
    assert.equal(formatHour(23, '12h'), '11 PM');
  });

  test('the end of the day is named, not numbered', () => {
    // 24 is a window's closing midnight. Rendering it as "12 AM" would make a
    // 20:00–24:00 window read as ending before it began.
    assert.equal(formatHour(24, '12h'), 'Midnight');
    assert.notEqual(formatHour(24, '12h'), formatHour(0, '12h'));
  });
});

describe('24-hour', () => {
  test('always two digits, so times line up in a column', () => {
    assert.equal(formatHour(0, '24h'), '00:00');
    assert.equal(formatHour(9, '24h'), '09:00');
    assert.equal(formatHour(21, '24h'), '21:00');
  });

  test('the closing midnight stays distinct here too', () => {
    assert.equal(formatHour(24, '24h'), '24:00');
    assert.notEqual(formatHour(24, '24h'), formatHour(0, '24h'));
  });
});

describe('splitting and rejoining an hour', () => {
  test('every hour of the day survives a round trip', () => {
    // This is what the two wheels do between them: one reports a clock face
    // number, the other a meridiem, and the hour has to come back intact.
    for (let hour = 0; hour < 24; hour++) {
      assert.equal(from12(to12(hour), meridiemOf(hour)), hour, `hour ${hour}`);
    }
  });

  test('the two hours everyone gets wrong', () => {
    assert.equal(to12(0), 12);
    assert.equal(meridiemOf(0), AM);
    assert.equal(to12(12), 12);
    assert.equal(meridiemOf(12), PM);
    assert.equal(from12(12, AM), 0, 'noon AM is midnight');
    assert.equal(from12(12, PM), 12, 'noon PM is noon');
  });

  test('changing only the meridiem moves the hour by twelve', () => {
    // What tapping the AM/PM wheel does, and the thing the old stepper made
    // you walk twelve hours to achieve.
    const morning = from12(to12(9), AM);
    const evening = from12(to12(9), PM);
    assert.equal(morning, 9);
    assert.equal(evening, 21);
  });
});

describe('stored clock times', () => {
  test('a stored 24-hour time reads either way', () => {
    assert.equal(formatClock('14:30', '12h'), '2:30 PM');
    assert.equal(formatClock('14:30', '24h'), '14:30');
    assert.equal(formatClock('09:05', '12h'), '9:05 AM');
    assert.equal(formatClock('09:05', '24h'), '09:05');
  });

  test('midnight and noon again, with minutes', () => {
    assert.equal(formatClock('00:00', '12h'), '12:00 AM');
    assert.equal(formatClock('12:00', '12h'), '12:00 PM');
  });

  test('nonsense comes back untouched rather than as NaN', () => {
    assert.equal(formatClock('', '12h'), '');
    assert.equal(formatClock('not a time', '24h'), 'not a time');
  });
});
