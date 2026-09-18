/* ------------------------------------------------------------------ *
 * Pomodoro.
 *
 * This screen replaced a camera preview with simulated attention telemetry —
 * a `Math.random()` walk presented to the user as a measured "% focus" while
 * the front camera ran behind it. That was dishonest to the user and it asked
 * for a camera permission the app did not use for its stated purpose.
 *
 * What replaced it measures nothing and claims nothing. A timer is honest by
 * construction: the number on screen is the number of seconds left, and it is
 * right because it is derived from the clock rather than counted.
 *
 * The mascot's room *is* this screen: the scene fills the tab and everything
 * else is drawn over it. See components/sage/room.
 * ------------------------------------------------------------------ */
import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import { Check, Pause, Play, RotateCcw, SkipForward, SlidersHorizontal } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RoomScene, type MascotPhase } from '@/components/sage/room/RoomScene';
import { useCelebrate } from '@/components/sage/Celebration';
import { haptic } from '@/components/primitives/usePressScale';
import { curve, font, gutter, radius, sage, text } from '@/theme/sage';
import { room } from '@/components/sage/room/palette';
import {
  DEFAULT_SETTINGS,
  SETTING_BOUNDS,
  loadPomodoroSettings,
  savePomodoroSettings,
  type PomodoroSettings,
} from '../pomodoroStorage';
import { track } from '../monitoring';

/** How long the mascot stays pleased after a focus round lands. */
const CHEER_MS = 3200;

const NOTIF_ID = 'soft-focus-pomodoro-end';
const CHANNEL_ID = 'task-focus';

type Phase = 'focus' | 'short' | 'long';

const PHASE_COPY: Record<Phase, { label: string; done: string; body: string }> = {
  focus: {
    label: 'Focus',
    done: 'Round done',
    body: 'Nice. Time to stop for a moment.',
  },
  short: {
    label: 'Short break',
    done: 'Break over',
    body: 'Ready when you are.',
  },
  long: {
    label: 'Long break',
    done: 'Break over',
    body: 'That was a proper rest. Back to it when you like.',
  },
};

/* ------------------------------------------------------------------ *
 * Screen
 * ------------------------------------------------------------------ */

export default function PomodoroScreen() {
  const [settings, setSettings] = useState<PomodoroSettings>(DEFAULT_SETTINGS);
  const [phase, setPhase] = useState<Phase>('focus');
  /** Held just after a focus round lands, so the mascot can celebrate it. */
  const [cheering, setCheering] = useState(false);
  const cheerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (cheerTimer.current) clearTimeout(cheerTimer.current);
  }, []);
  /** Focus rounds finished in the current cycle. Resets after a long break. */
  const [round, setRound] = useState(0);

  /**
   * The running session, as an absolute instant.
   *
   * This is the whole trick. A `setInterval` that decrements a counter drifts
   * by a few ms a tick, and stops entirely when iOS suspends the app — so a
   * 25-minute round backgrounded for 10 minutes would come back showing 25
   * minutes left. Storing the moment the round *ends* and subtracting the
   * clock means backgrounding, suspension and timer throttling are all simply
   * invisible: whenever we next render, the answer is right.
   */
  const [endsAt, setEndsAt] = useState<number | null>(null);
  /** Remaining ms while paused. Only meaningful when `endsAt` is null. */
  const [pausedMs, setPausedMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const celebrate = useCelebrate();
  /** Guards against the completion handler firing twice on one expiry. */
  const completing = useRef(false);

  /**
   * Screen position of the ring's centre, for the confetti burst.
   *
   * `celebrate` takes absolute page coordinates because every other caller
   * passes a tap. This one has no tap to pass — the round ends on its own — so
   * we measure the ring once it has laid out and fire from there.
   */
  const ringRef = useRef<View>(null);
  const ringCentre = useRef<{ x: number; y: number } | null>(null);
  const measureRing = useCallback(() => {
    ringRef.current?.measureInWindow((x, y, w, h) => {
      ringCentre.current = { x: x + w / 2, y: y + h / 2 };
    });
  }, []);

  useEffect(() => {
    void loadPomodoroSettings().then(setSettings);
  }, []);

  /* ---------------- durations ---------------- */

  const durationMs = useMemo(() => {
    const mins =
      phase === 'focus'
        ? settings.focusMinutes
        : phase === 'short'
          ? settings.shortBreakMinutes
          : settings.longBreakMinutes;
    return mins * 60_000;
  }, [phase, settings]);

  const running = endsAt !== null;
  const remainingMs = running ? Math.max(0, endsAt - now) : (pausedMs ?? durationMs);

  /* ---------------- ticking ---------------- */

  useEffect(() => {
    if (!running) return;
    // 250ms rather than 1000ms so the displayed second changes within a frame
    // or two of the real one, instead of lagging by up to a full second.
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  /**
   * Re-read the clock the instant we come back to the foreground.
   *
   * The interval above is throttled or stopped while backgrounded, so without
   * this the first frame after resuming would paint a stale `now` — briefly
   * showing time that has already passed.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => sub.remove();
  }, []);

  /* ---------------- notification ---------------- */

  const cancelEndNotification = useCallback(async () => {
    try {
      await Notifications.cancelScheduledNotificationAsync(NOTIF_ID);
    } catch {
      // Nothing scheduled. Cancelling an absent notification is not an error
      // worth surfacing — it happens on every pause of an already-ended round.
    }
  }, []);

  const scheduleEndNotification = useCallback(
    async (at: number, forPhase: Phase) => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') return;
        await cancelEndNotification();
        await Notifications.scheduleNotificationAsync({
          identifier: NOTIF_ID,
          content: {
            title: PHASE_COPY[forPhase].done,
            body: PHASE_COPY[forPhase].body,
            data: { source: 'pomodoro' },
          },
          trigger: {
            type: SchedulableTriggerInputTypes.DATE,
            date: new Date(at),
            channelId: CHANNEL_ID,
          },
        });
      } catch (err) {
        // A timer that cannot notify still works while you are looking at it.
        console.warn('[pomodoro] Could not schedule the end notification', err);
      }
    },
    [cancelEndNotification],
  );

  /* ---------------- transitions ---------------- */

  const startPhase = useCallback(
    (next: Phase, autoStart: boolean) => {
      setPhase(next);
      completing.current = false;

      const mins =
        next === 'focus'
          ? settings.focusMinutes
          : next === 'short'
            ? settings.shortBreakMinutes
            : settings.longBreakMinutes;
      const ms = mins * 60_000;

      if (autoStart) {
        const at = Date.now() + ms;
        setEndsAt(at);
        setPausedMs(null);
        setNow(Date.now());
        void scheduleEndNotification(at, next);
      } else {
        setEndsAt(null);
        setPausedMs(ms);
        void cancelEndNotification();
      }
    },
    [settings, scheduleEndNotification, cancelEndNotification],
  );

  /** Where the machine goes when the current phase runs out. */
  const nextPhase = useCallback(
    (from: Phase, completedRounds: number): { phase: Phase; round: number } => {
      if (from !== 'focus') {
        // A long break closes the cycle and the count starts again.
        return { phase: 'focus', round: from === 'long' ? 0 : completedRounds };
      }
      const done = completedRounds + 1;
      return done >= settings.roundsBeforeLongBreak
        ? { phase: 'long', round: done }
        : { phase: 'short', round: done };
    },
    [settings.roundsBeforeLongBreak],
  );

  /* ---------------- completion ---------------- */

  useEffect(() => {
    if (!running || remainingMs > 0 || completing.current) return;
    completing.current = true;

    const finished = phase;
    const { phase: next, round: nextRound } = nextPhase(finished, round);

    if (finished === 'focus') {
      haptic('success');
      track('pomodoro_round_complete', { minutes: settings.focusMinutes });
      // From the middle of the ring, where the user is already looking.
      const centre = ringCentre.current;
      if (centre) celebrate(centre.x, centre.y);
      // And the mascot gets to be pleased about it, briefly, before the next
      // phase takes the stage back.
      setCheering(true);
      if (cheerTimer.current) clearTimeout(cheerTimer.current);
      cheerTimer.current = setTimeout(() => setCheering(false), CHEER_MS);
    } else {
      haptic('light');
    }

    setRound(nextRound);
    startPhase(next, settings.autoAdvance);
  }, [
    running,
    remainingMs,
    phase,
    round,
    nextPhase,
    startPhase,
    settings.autoAdvance,
    settings.focusMinutes,
    celebrate,
  ]);

  /* ---------------- controls ---------------- */

  const toggle = useCallback(() => {
    haptic('light');
    if (running) {
      setPausedMs(Math.max(0, endsAt - Date.now()));
      setEndsAt(null);
      void cancelEndNotification();
    } else {
      const ms = pausedMs ?? durationMs;
      const at = Date.now() + ms;
      setEndsAt(at);
      setPausedMs(null);
      setNow(Date.now());
      completing.current = false;
      void scheduleEndNotification(at, phase);
    }
  }, [running, endsAt, pausedMs, durationMs, phase, scheduleEndNotification, cancelEndNotification]);

  const skip = useCallback(() => {
    haptic('light');
    const { phase: next, round: nextRound } = nextPhase(phase, round);
    setRound(nextRound);
    startPhase(next, false);
  }, [phase, round, nextPhase, startPhase]);

  const resetCycle = useCallback(() => {
    haptic('light');
    setRound(0);
    startPhase('focus', false);
  }, [startPhase]);

  /**
   * Re-arm the current phase when its duration changes underneath it.
   *
   * Without this, raising the focus length while a round is paused leaves the
   * old remainder on screen — the setting appears not to have taken.
   */
  const applySettings = useCallback(
    (next: PomodoroSettings) => {
      setSettings(next);
      void savePomodoroSettings(next);
      if (!running) {
        setPausedMs(null);
        completing.current = false;
      }
    },
    [running],
  );

  /* ---------------- render ---------------- */

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  const progress = durationMs > 0 ? Math.min(1, Math.max(0, remainingMs / durationMs)) : 0;

  const mascotPhase: MascotPhase = cheering
    ? 'complete'
    : running
      ? phase === 'focus'
        ? 'focusing'
        : 'resting'
      : 'idle';

  return (
    <View style={styles.screen}>
      {/*
        The room is the tab, not a panel on it — full bleed, under the status
        bar, with no card around it and none of the app's usual paper backdrop.
        Everything below is drawn over the scene.
      */}
      <RoomScene
        phase={mascotPhase}
        timeText={`${mm}:${ss}`}
        progress={progress}
        tick={totalSeconds}
        timeLabel={`${PHASE_COPY[phase].label}. ${Math.floor(totalSeconds / 60)} minutes ${totalSeconds % 60} seconds remaining`}
      />

      <SafeAreaView style={styles.overlay} edges={['top']} pointerEvents="box-none">
        <View style={styles.header} pointerEvents="box-none">
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Pomodoro</Text>
            <Text style={styles.subtitle}>
              {PHASE_COPY[phase].label}
              {phase === 'focus' ? ` · round ${Math.min(round + 1, settings.roundsBeforeLongBreak)} of ${settings.roundsBeforeLongBreak}` : ''}
            </Text>
          </View>
          <Pressable
            onPress={() => setSettingsOpen(true)}
            style={styles.iconBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Timer settings"
          >
            <SlidersHorizontal size={19} color={room.ink} strokeWidth={1.9} />
          </Pressable>
        </View>

        {/* The room shows through here — this is the part you look at. */}
        <View ref={ringRef} onLayout={measureRing} style={styles.roomGap} pointerEvents="none" />

        <View style={styles.foot} pointerEvents="box-none">
          <View style={styles.dots}>
            {Array.from({ length: settings.roundsBeforeLongBreak }).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i < round && { backgroundColor: room.sageAccent, borderColor: room.ink }]}
              />
            ))}
          </View>

          <View style={styles.controls}>
            <Pressable
              onPress={resetCycle}
              style={styles.secondaryBtn}
              accessibilityRole="button"
              accessibilityLabel="Reset the cycle"
            >
              <RotateCcw size={18} color={room.ink} strokeWidth={2} />
            </Pressable>

            <Pressable
              onPress={toggle}
              style={styles.primaryBtn}
              accessibilityRole="button"
              accessibilityLabel={running ? 'Pause' : 'Start'}
            >
              {running ? (
                <Pause size={24} color={sage.onPrimary} strokeWidth={2.2} fill={sage.onPrimary} />
              ) : (
                <Play size={24} color={sage.onPrimary} strokeWidth={2.2} fill={sage.onPrimary} />
              )}
            </Pressable>

            <Pressable
              onPress={skip}
              style={styles.secondaryBtn}
              accessibilityRole="button"
              accessibilityLabel="Skip to the next phase"
            >
              <SkipForward size={18} color={room.ink} strokeWidth={2} />
            </Pressable>
          </View>

          <Text style={styles.hint}>
            The timer keeps running when you close the app.
          </Text>
        </View>
      </SafeAreaView>

      <SettingsSheet
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onChange={applySettings}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

const STEPS: { key: keyof PomodoroSettings; label: string; unit: string; step: number }[] = [
  { key: 'focusMinutes', label: 'Focus', unit: 'min', step: 5 },
  { key: 'shortBreakMinutes', label: 'Short break', unit: 'min', step: 1 },
  { key: 'longBreakMinutes', label: 'Long break', unit: 'min', step: 5 },
  { key: 'roundsBeforeLongBreak', label: 'Rounds before long break', unit: '', step: 1 },
];

function SettingsSheet({
  open,
  settings,
  onClose,
  onChange,
}: {
  open: boolean;
  settings: PomodoroSettings;
  onClose: () => void;
  onChange: (next: PomodoroSettings) => void;
}) {
  const bump = (key: keyof PomodoroSettings, delta: number) => {
    const bounds = SETTING_BOUNDS[key as keyof typeof SETTING_BOUNDS];
    if (!bounds) return;
    const current = settings[key] as number;
    const next = Math.min(bounds[1], Math.max(bounds[0], current + delta));
    if (next === current) return;
    haptic('light');
    onChange({ ...settings, [key]: next });
  };

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close settings" />
      <View style={styles.sheet}>
        <View style={styles.sheetGrab} />
        <Text style={[text.title, { fontSize: 20, marginBottom: 4 }]}>Timer</Text>
        <Text style={[text.body, { marginBottom: 18 }]}>
          Shorter rounds are not cheating. A round you actually start beats a long one you don&apos;t.
        </Text>

        {STEPS.map((s) => (
          <View key={s.key} style={styles.settingRow}>
            <Text style={styles.settingLabel}>{s.label}</Text>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => bump(s.key, -s.step)}
                style={styles.stepBtn}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Decrease ${s.label}`}
              >
                <Text style={styles.stepGlyph}>−</Text>
              </Pressable>
              <Text style={styles.stepValue}>
                {settings[s.key] as number}
                {s.unit ? ` ${s.unit}` : ''}
              </Text>
              <Pressable
                onPress={() => bump(s.key, s.step)}
                style={styles.stepBtn}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Increase ${s.label}`}
              >
                <Text style={styles.stepGlyph}>+</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <Pressable
          onPress={() => {
            haptic('light');
            onChange({ ...settings, autoAdvance: !settings.autoAdvance });
          }}
          style={styles.settingRow}
          accessibilityRole="switch"
          accessibilityState={{ checked: settings.autoAdvance }}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.settingLabel}>Roll straight on</Text>
            <Text style={text.meta}>Start the next round without waiting for a tap.</Text>
          </View>
          <View style={[styles.checkbox, settings.autoAdvance && styles.checkboxOn]}>
            {settings.autoAdvance && <Check size={13} color={sage.onPrimary} strokeWidth={3} />}
          </View>
        </Pressable>

        <Pressable onPress={onClose} style={styles.doneBtn} accessibilityRole="button">
          <Text style={text.button}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Styles
 * ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  // The room paints the whole tab; this is only what shows before it measures.
  screen: { flex: 1, backgroundColor: room.wallTop },

  /**
   * Everything drawn over the scene. `box-none` throughout, so the parts of the
   * room between the header and the controls are not covered by an invisible
   * sheet — and so a future tap on the mascot itself can reach it.
   */
  overlay: { ...StyleSheet.absoluteFillObject, paddingHorizontal: gutter },
  /** The middle of the screen, left empty for the room to be looked at. */
  roomGap: { flex: 1 },
  foot: { paddingBottom: 18 },

  header: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 8, paddingBottom: 12, gap: 12 },
  // Room ink rather than the app's green, since this sits on plaster.
  title: { fontFamily: font.heading, fontSize: 26, color: room.ink },
  subtitle: { fontFamily: font.body, fontSize: 13.5, lineHeight: 20, color: room.inkSoft, marginTop: 2 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: room.cream,
    borderWidth: 2,
    borderColor: room.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...curve,
  },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.6,
    borderColor: room.inkSoft,
    backgroundColor: 'transparent',
  },

  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22 },
  /**
   * Outlined rather than shadowed. The room is drawn with one flat ink line
   * around everything in it, and a soft drop shadow over the top of that reads
   * as a control that wandered in from a different app.
   */
  primaryBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: room.sageAccent,
    borderWidth: 2.5,
    borderColor: room.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: room.cream,
    borderWidth: 2.5,
    borderColor: room.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...curve,
  },

  hint: {
    fontFamily: font.body,
    fontSize: 12,
    lineHeight: 18,
    color: room.inkSoft,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 20,
  },

  backdrop: { flex: 1, backgroundColor: 'rgba(55,81,74,0.28)' },
  sheet: {
    backgroundColor: sage.bg,
    borderTopLeftRadius: radius.cardLg,
    borderTopRightRadius: radius.cardLg,
    paddingHorizontal: gutter,
    paddingTop: 10,
    paddingBottom: 34,
    ...curve,
  },
  sheetGrab: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: sage.ruleStrong,
    alignSelf: 'center',
    marginBottom: 14,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: sage.rule,
    gap: 12,
  },
  settingLabel: { fontFamily: font.ui, fontSize: 14.5, color: sage.fgBody, flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: sage.fill,
    alignItems: 'center',
    justifyContent: 'center',
    ...curve,
  },
  stepGlyph: { fontFamily: font.heading, fontSize: 17, color: sage.fgSecondary, marginTop: -1 },
  stepValue: {
    fontFamily: font.ui,
    fontSize: 13.5,
    color: sage.fgBody,
    minWidth: 58,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: sage.ruleStrong,
    alignItems: 'center',
    justifyContent: 'center',
    ...curve,
  },
  checkboxOn: { backgroundColor: sage.primary, borderColor: sage.primary },
  doneBtn: {
    marginTop: 22,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: sage.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...curve,
  },
});
