/**
 * Pomodoro settings.
 *
 * Device-local and deliberately so: these are a property of how you work at
 * this desk, on this phone, not of your account. Keeping them out of Firestore
 * means the timer configures itself instantly on a cold start with no network,
 * no auth, and nothing to go wrong — which matters more here than on any other
 * screen, because a timer that hesitates on launch is a timer you stop
 * trusting.
 *
 * The running session is NOT stored here. See `app/(tabs)/pomodoro.tsx` — it
 * holds an absolute end timestamp, which is what makes the timer survive
 * backgrounding.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { devLog } from './devLog';

const SETTINGS_KEY = '@soft_focus_pomodoro_settings';

export interface PomodoroSettings {
  /** Minutes of focus in one round. */
  focusMinutes: number;
  /** Minutes of the short break after each round. */
  shortBreakMinutes: number;
  /** Minutes of the long break, taken after `roundsBeforeLongBreak` rounds. */
  longBreakMinutes: number;
  /** How many focus rounds before the long break. */
  roundsBeforeLongBreak: number;
  /** Roll straight into the next phase instead of waiting for a tap. */
  autoAdvance: boolean;
}

/**
 * The classic technique, which is also the right default for this audience:
 * 25 minutes is short enough to start when starting is the hard part.
 */
export const DEFAULT_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  roundsBeforeLongBreak: 4,
  autoAdvance: false,
};

/**
 * Bounds on every stored duration.
 *
 * Not defensive programming for its own sake — these values are multiplied out
 * to a notification trigger and to a timestamp. A zero would schedule a
 * notification in the past and spin the phase machine; a value read back as
 * `NaN` from a corrupted store would render "NaN:NaN" and never complete.
 */
const LIMITS = {
  focusMinutes: [5, 120],
  shortBreakMinutes: [1, 60],
  longBreakMinutes: [1, 60],
  roundsBeforeLongBreak: [2, 12],
} as const;

function clampInt(value: unknown, [min, max]: readonly [number, number], fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Coerce anything read off disk into a settings object that cannot break the timer. */
export function normaliseSettings(raw: Partial<PomodoroSettings> | null | undefined): PomodoroSettings {
  const r = raw ?? {};
  return {
    focusMinutes: clampInt(r.focusMinutes, LIMITS.focusMinutes, DEFAULT_SETTINGS.focusMinutes),
    shortBreakMinutes: clampInt(r.shortBreakMinutes, LIMITS.shortBreakMinutes, DEFAULT_SETTINGS.shortBreakMinutes),
    longBreakMinutes: clampInt(r.longBreakMinutes, LIMITS.longBreakMinutes, DEFAULT_SETTINGS.longBreakMinutes),
    roundsBeforeLongBreak: clampInt(
      r.roundsBeforeLongBreak,
      LIMITS.roundsBeforeLongBreak,
      DEFAULT_SETTINGS.roundsBeforeLongBreak,
    ),
    autoAdvance: r.autoAdvance === true,
  };
}

export const SETTING_BOUNDS = LIMITS;

export async function loadPomodoroSettings(): Promise<PomodoroSettings> {
  try {
    const stored = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    return normaliseSettings(JSON.parse(stored));
  } catch (err) {
    console.warn('[pomodoro] Could not read settings, using defaults', err);
    return DEFAULT_SETTINGS;
  }
}

export async function savePomodoroSettings(settings: PomodoroSettings): Promise<void> {
  try {
    const safe = normaliseSettings(settings);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(safe));
    devLog('[pomodoro] Saved settings', safe);
  } catch (err) {
    console.warn('[pomodoro] Could not save settings', err);
  }
}
