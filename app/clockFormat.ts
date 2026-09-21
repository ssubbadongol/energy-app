/**
 * Whether times read as "9 PM" or "21:00".
 *
 * A preference rather than a house style, because neither answer is right for
 * everyone: half the world reads one and half the other, and a clock you have
 * to translate is a small tax you pay every single time you glance at it —
 * which is the wrong kind of friction for an app whose job is to make the day
 * legible at a glance.
 *
 * Pure, and deliberately free of AsyncStorage, so the formatting can be tested
 * and so `userProfileStorage` can own the persistence without this module
 * depending on it.
 */

export type ClockFormat = '12h' | '24h';

export const CLOCK_FORMATS: ClockFormat[] = ['12h', '24h'];

/** How the setting describes itself. */
export const clockFormatLabel: Record<ClockFormat, string> = {
  '12h': '12-hour',
  '24h': '24-hour',
};

/** A worked example, so the setting shows what it does rather than naming it. */
export const clockFormatExample: Record<ClockFormat, string> = {
  '12h': '9 PM',
  '24h': '21:00',
};

/** AM or PM, as the number of hours to add to a 12-hour reading. */
export const AM = 0;
export const PM = 12;

/** `21` → `9` (and `0` → `12`). The number on a 12-hour clock face. */
export const to12 = (hour: number): number => (hour % 12 === 0 ? 12 : hour % 12);

/** `21` → `PM`. */
export const meridiemOf = (hour: number): typeof AM | typeof PM =>
  ((hour % 24) + 24) % 24 >= 12 ? PM : AM;

/** `9` + `PM` → `21`. The inverse of the two above. */
export const from12 = (hour12: number, meridiem: number): number => (hour12 % 12) + meridiem;

/**
 * A whole hour, written out.
 *
 * `24:00` is kept distinct from `00:00` on purpose: an end-of-window midnight
 * is the close of today, not the start of it, and collapsing them would make
 * a 20:00–24:00 window read as ending before it began.
 */
export function formatHour(hour: number, format: ClockFormat): string {
  if (format === '24h') return `${String(hour).padStart(2, '0')}:00`;
  if (hour === 24) return 'Midnight';
  const h = ((hour % 24) + 24) % 24;
  return `${to12(h)} ${h >= 12 ? 'PM' : 'AM'}`;
}

/**
 * A stored `HH:MM` clock time, written out.
 *
 * Times are stored 24-hour everywhere — they sort and compare that way — and
 * only ever converted at the point of display.
 */
export function formatClock(hhmm: string, format: ClockFormat): string {
  const [rawH, rawM] = hhmm.split(':');
  // `Number('')` is 0, not NaN, so an empty or non-numeric string would
  // otherwise come back confidently as midnight.
  if (!/^\d{1,2}$/.test(rawH ?? '')) return hhmm;
  const h = Number(rawH);
  const m = rawM ?? '00';
  if (format === '24h') return `${String(h).padStart(2, '0')}:${m}`;
  return `${to12(h)}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
}
