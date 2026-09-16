import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useFocusEffect } from 'expo-router';
import { Check, ChevronDown, ChevronRight, Clock, Pencil, Plus, Settings, Sparkles, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, type GestureResponderEvent, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, { LinearTransition, ReduceMotion, StretchInY, StretchOutY } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { MascotPerch } from '@/components/mascot';
import { SageBackground } from '@/components/sage/Background';
import { useCelebrate } from '@/components/sage/Celebration';
import { haptic } from '@/components/primitives/usePressScale';
import { BreakdownUnavailable, requestBreakdown } from '../taskBreakdown';
import { BreakdownSheet } from '@/components/tasks/BreakdownSheet';
import {
  addTask,
  deleteTask,
  getSharedTasks,
  initializeTasks,
  type Task,
  MAX_SUBTASKS,
  type Subtask,
  subtaskProgress,
  toggleSubtask,
  toggleTaskCompletion,
  updateTask,
} from '../taskStorage';
import { loadUserProfile } from '../userProfileStorage';
import { curve, energy, energyInsight, type EnergyKey, font, gutter, radius, sage, shadow, text } from '@/theme/sage';
import { duration, ease } from '@/theme/tokens';

/* ------------------------------------------------------------------ *
 * Filtering the list
 * ------------------------------------------------------------------ *
 *
 * Changing a filter used to swap the list in a single frame, which reads as a
 * glitch rather than as a response — nothing connects the list you were looking
 * at to the one you get.
 *
 * Three parts, and the third is the one that matters: rows that no longer match
 * fold away, rows that now match unfold, and — the part a re-render cannot do on
 * its own — every row that survives the change *slides* to its new position
 * instead of teleporting there. That sliding is what makes it legible as the
 * same list being filtered.
 *
 * Not a crossfade, and that is not a style choice. Task cards carry their shadow
 * as Android `elevation`, which the platform draws from the view's outline in
 * the *parent* rather than in the view itself — so it does not take an
 * ancestor's alpha. Fading a card leaves its shadow behind at full strength,
 * stacked over whatever slid into its place. Every animation here is therefore a
 * pure transform: `scaleY` to open and close a row, `translate` to move one. A
 * transform carries the shadow with it, because the shadow is part of what is
 * being transformed.
 *
 * `ReduceMotion.System` hands the decision to the OS setting, so these are
 * skipped outright when the user has asked for less movement.
 */

const OPEN = StretchInY.duration(duration.list).easing(ease.out).reduceMotion(ReduceMotion.System);
const CLOSE = StretchOutY.duration(duration.listOut).easing(ease.out).reduceMotion(ReduceMotion.System);
const REFLOW = LinearTransition.duration(duration.list).easing(ease.out).reduceMotion(ReduceMotion.System);

/* ------------------------------------------------------------------ *
 * taskStorage uses energy 'high' | 'medium' | 'low'; the sage tokens
 * use 'high' | 'mid' | 'low'. Convert at the boundary.
 * ------------------------------------------------------------------ */

const toTier = (e: Task['energy']): EnergyKey => (e === 'medium' ? 'mid' : e);
const fromTier = (k: EnergyKey): Task['energy'] => (k === 'mid' ? 'medium' : k);

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOf = (t: Task, today: string) => (t.dueDate ? t.dueDate.slice(0, 10) : today);
const metaFor = (t: Task) => (t.time > 0 ? `~${t.time} min` : t.type && t.type !== 'Task' ? t.type : 'anytime');

/** "14:30" -> "2:30 PM". Stored 24h so it sorts and compares; shown 12h. */
const formatDueTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** A half-typed step is how an abandoned one looks. Drop it rather than store it. */
const cleanSteps = (steps: Subtask[]): Subtask[] =>
  steps.map((s) => ({ ...s, name: s.name.trim() })).filter((s) => s.name.length > 0);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FILTERS: ('All' | 'High' | 'Mid' | 'Low')[] = ['All', 'High', 'Mid', 'Low'];
const FILL_PCT: Record<EnergyKey, `${number}%`> = { low: '34%', mid: '67%', high: '100%' };

export default function TodayScreen() {
  const today = iso(new Date());
  const celebrate = useCelebrate();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [greetName, setGreetName] = useState('');
  const [selectedEnergy, setSelectedEnergy] = useState<EnergyKey>('mid');

  // Personalisation from onboarding: name for the greeting, default energy.
  useEffect(() => {
    loadUserProfile().then((p) => {
      setGreetName(p.name);
      setSelectedEnergy(p.defaultEnergy);
    });
  }, []);
  const [filter, setFilter] = useState<'All' | 'High' | 'Mid' | 'Low'>('All');
  const [pinnedId, setPinnedId] = useState<number | null>(null);

  // composer
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [draftEnergy, setDraftEnergy] = useState<EnergyKey>('mid');
  const [draftTime, setDraftTime] = useState<string | null>(null);
  const [draftSteps, setDraftSteps] = useState<Subtask[]>([]);

  // calendar
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selected, setSelected] = useState(today);

  const refresh = useCallback(() => setTasks([...getSharedTasks()]), []);

  // Load persisted tasks whenever the tab gains focus.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      initializeTasks().then((loaded) => {
        if (alive) setTasks([...loaded]);
      });
      return () => { alive = false; };
    }, []),
  );

  const todays = tasks.filter((t) => dayOf(t, today) === today);
  const inFilter = todays.filter((t) => filter === 'All' || energy[toTier(t.energy)].label === filter);
  const matched = inFilter.filter((t) => toTier(t.energy) === selectedEnergy);
  const rest = inFilter.filter((t) => toTier(t.energy) !== selectedEnergy);
  const done = todays.filter((t) => t.completed).length;
  const pct = todays.length ? Math.round((done / todays.length) * 100) : 0;

  const toggle = async (id: number, e?: GestureResponderEvent) => {
    const task = tasks.find((t) => t.id === id);
    // Fired before the write, not after it: the burst should land with the
    // finger, not once AsyncStorage and the Firestore mirror have caught up.
    // Only on the way to done — un-ticking something is not an achievement.
    if (task && !task.completed && e) celebrate(e.nativeEvent.pageX, e.nativeEvent.pageY);
    await toggleTaskCompletion(id);
    refresh();
  };
  /**
   * Ticking a step can complete the parent (see `toggleSubtask`), so the
   * celebration fires on that transition too — finishing the last step of
   * something is the moment worth marking, more than the tick that follows it.
   */
  const tickSubtask = async (taskId: number, subtaskId: string) => {
    const before = tasks.find((t) => t.id === taskId)?.completed ?? false;
    await toggleSubtask(taskId, subtaskId);
    const after = getSharedTasks().find((t) => t.id === taskId)?.completed ?? false;
    if (!before && after) haptic('success');
    refresh();
  };

  const remove = async (id: number) => {
    await deleteTask(id);
    if (pinnedId === id) setPinnedId(null);
    refresh();
  };
  const startAdd = () => { setComposing(true); setEditingId(null); setDraft(''); setDraftEnergy(selectedEnergy); setDraftTime(null); setDraftSteps([]); };
  const startEdit = (t: Task) => { setComposing(true); setEditingId(t.id); setDraft(t.name); setDraftEnergy(toTier(t.energy)); setDraftTime(t.dueTime ?? null); setDraftSteps(t.subtasks ?? []); };
  const saveTask = async () => {
    const name = draft.trim();
    if (!name) return;
    if (editingId) {
      // `undefined` rather than omitted, so clearing the time actually clears it.
      await updateTask(editingId, { name, energy: fromTier(draftEnergy), priority: fromTier(draftEnergy), dueTime: draftTime ?? undefined, subtasks: cleanSteps(draftSteps) });
    } else {
      const date = calendarOpen ? selected : today;
      await addTask({ name, energy: fromTier(draftEnergy), priority: fromTier(draftEnergy), time: 0, type: 'Task', completed: false, dueDate: `${date}T12:00:00`, dueTime: draftTime ?? undefined, subtasks: cleanSteps(draftSteps) });
    }
    setComposing(false); setEditingId(null); setDraft(''); setDraftTime(null); setDraftSteps([]); refresh();
  };

  const pinned = tasks.find((t) => t.id === pinnedId && !t.completed);
  const todayLabel = `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()]}, ${new Date().getDate()} ${MONTHS[new Date().getMonth()]}`;
  const hour = new Date().getHours();
  const greetWord = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const greeting = greetName ? `${greetWord}, ${greetName}` : greetWord;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <SageBackground scrollY={scrollY} />

      {pinned && !calendarOpen && (
        <View style={styles.pinned}>
          <View style={styles.pinnedDot} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.pinnedLabel}>Pinned</Text>
            <Text style={styles.pinnedTitle} numberOfLines={1}>{pinned.name}</Text>
          </View>
          <Pressable onPress={() => toggle(pinned.id)} style={styles.pinnedBtn} hitSlop={6}>
            <Check size={15} color={sage.primaryDeep} strokeWidth={2.5} />
          </Pressable>
          <Pressable onPress={() => setPinnedId(null)} style={[styles.pinnedBtn, { backgroundColor: sage.fillAlt }]} hitSlop={6}>
            <X size={15} color={sage.fgFaint} strokeWidth={2} />
          </Pressable>
        </View>
      )}

      <Animated.ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
      >
        {calendarOpen ? (
          <CalendarView
            tasks={tasks}
            today={today}
            selected={selected}
            setSelected={setSelected}
            monthOffset={monthOffset}
            setMonthOffset={setMonthOffset}
            onClose={() => setCalendarOpen(false)}
            onAdd={startAdd}
            composer={composing ? <Composer {...{ editingId, draft, setDraft, draftEnergy, setDraftEnergy, draftTime, setDraftTime, draftSteps, setDraftSteps, saveTask, onCancel: () => setComposing(false) }} /> : null}
          />
        ) : (
          <>
            <View style={styles.header}>
              <View>
                <Text style={styles.dateLabel}>{todayLabel}</Text>
                <Text style={styles.greeting}>{greeting}</Text>
              </View>
              <View style={styles.headerBtns}>
                <Pressable onPress={startAdd} style={[styles.iconBtn, styles.iconBtnPrimary]} hitSlop={6}>
                  <Plus size={20} color={sage.onPrimary} strokeWidth={2.5} />
                </Pressable>
                <Pressable onPress={() => setCalendarOpen(true)} style={[styles.iconBtn, styles.iconBtnPlain]} hitSlop={6}>
                  <View style={styles.calIconTop} />
                  <View style={styles.calIconBody} />
                </Pressable>
                {/*
                  The only route into Settings, which holds account deletion and
                  the Privacy/Terms links. A store reviewer has to find this, so
                  it sits on the first screen rather than behind a menu.
                */}
                <Pressable
                  onPress={() => router.push('/(tabs)/settings')}
                  style={[styles.iconBtn, styles.iconBtnPlain]}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Settings"
                >
                  <Settings size={19} color={sage.fgSecondary} strokeWidth={1.9} />
                </Pressable>
              </View>
            </View>

            <MascotPerch id="energy" mood="happy">
            <View style={styles.card}>
              <Text style={text.cardTitle}>How&apos;s your energy right now?</Text>
              <View style={styles.energyRow}>
                {(['low', 'mid', 'high'] as EnergyKey[]).map((k) => {
                  const on = selectedEnergy === k;
                  return (
                    <Pressable key={k} onPress={() => setSelectedEnergy(k)} style={[styles.energySeg, on && { backgroundColor: energy[k].bg }]}>
                      <View style={[styles.energyBar, { width: energy[k].barW, backgroundColor: on ? energy[k].bar : sage.ruleStrong }]} />
                      <Text style={[styles.energySegLabel, { color: on ? energy[k].fg : sage.fgFaint }]}>{energy[k].label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.energyFillTrack}>
                <View style={[styles.energyFillBar, { width: FILL_PCT[selectedEnergy], backgroundColor: energy[selectedEnergy].bar }]} />
              </View>
              <Text style={styles.insight}>{energyInsight[selectedEnergy]}</Text>
            </View>
            </MascotPerch>

            <MascotPerch id="progress" mood="happy">
            <View style={[styles.card, styles.progressCard]}>
              <ProgressRing pct={pct} />
              <View style={{ flex: 1 }}>
                <Text style={text.cardTitle}>{done} of {todays.length} done today</Text>
                <Text style={[text.meta, { marginTop: 2 }]}>No streaks, no pressure.</Text>
              </View>
              <Text style={styles.pctText}>{pct}%</Text>
            </View>
            </MascotPerch>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters} contentContainerStyle={{ gap: 8 }}>
              {FILTERS.map((f) => {
                const on = filter === f;
                return (
                  <Pressable key={f} onPress={() => setFilter(f)} style={[styles.chip, on ? styles.chipOn : styles.chipOff]}>
                    <Text style={[styles.chipText, { color: on ? sage.onPrimary : sage.primaryInk }]}>{f}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {composing && (
              <MascotPerch id="composer" mood="working" call>
                <Composer {...{ editingId, draft, setDraft, draftEnergy, setDraftEnergy, draftTime, setDraftTime, draftSteps, setDraftSteps, saveTask, onCancel: () => setComposing(false) }} />
              </MascotPerch>
            )}

            {/*
              The section wrapper is animated as well as the cards inside it. An
              exiting card whose parent unmounts in the same commit never gets to
              play its exit — the view is gone — so when a whole section empties
              out it is the section that folds away, taking its cards with it.
            */}
            {matched.length > 0 && (
              <Reanimated.View entering={OPEN} exiting={CLOSE} layout={REFLOW}>
                <SectionRule label="Matched to your energy" />
                <View style={{ gap: 10 }}>
                  {matched.map((t) => (
                    <Reanimated.View key={t.id} entering={OPEN} exiting={CLOSE} layout={REFLOW}>
                      <MascotPerch id={`task-${t.id}`} mood={t.completed ? 'sleeping' : 'working'}>
                        <TaskCard task={t} pinned={t.id === pinnedId} onToggle={toggle} onEdit={startEdit} onRemove={remove} onPin={setPinnedId} onToggleSubtask={tickSubtask} />
                      </MascotPerch>
                    </Reanimated.View>
                  ))}
                </View>
              </Reanimated.View>
            )}

            {rest.length > 0 && (
              <Reanimated.View entering={OPEN} exiting={CLOSE} layout={REFLOW}>
                <SectionRule label={matched.length ? 'Everything else' : 'All tasks'} />
                <View style={{ gap: 10 }}>
                  {rest.map((t) => (
                    <Reanimated.View key={t.id} entering={OPEN} exiting={CLOSE} layout={REFLOW}>
                      <MascotPerch id={`task-${t.id}`} mood={t.completed ? 'sleeping' : 'working'}>
                        <TaskCard task={t} pinned={t.id === pinnedId} onToggle={toggle} onEdit={startEdit} onRemove={remove} onPin={setPinnedId} onToggleSubtask={tickSubtask} />
                      </MascotPerch>
                    </Reanimated.View>
                  ))}
                </View>
              </Reanimated.View>
            )}

            {todays.length === 0 && (
              <Reanimated.View style={styles.empty} entering={OPEN} exiting={CLOSE} layout={REFLOW}>
                <Text style={styles.emptyText}>Nothing today. A clear day is allowed.</Text>
              </Reanimated.View>
            )}

            {/*
              There are tasks today, just none in this filter. Without something
              here the list fades out and nothing fades back in, which reads as
              the animation having broken rather than as an answer.
            */}
            {todays.length > 0 && matched.length === 0 && rest.length === 0 && (
              <Reanimated.View style={styles.empty} entering={OPEN} exiting={CLOSE} layout={REFLOW}>
                <Text style={styles.emptyText}>Nothing at this energy right now.</Text>
              </Reanimated.View>
            )}
          </>
        )}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

function ProgressRing({ pct, size = 44 }: { pct: number; size?: number }) {
  const r = 35;
  const circ = 2 * Math.PI * r;
  const dash = (circ * pct) / 100;
  return (
    <Svg width={size} height={size} viewBox="0 0 84 84">
      <Circle cx="42" cy="42" r={r} fill="none" stroke={sage.trackAlt} strokeWidth="11" />
      <Circle cx="42" cy="42" r={r} fill="none" stroke={sage.leaf} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${dash} ${circ}`} transform="rotate(-90 42 42)" />
    </Svg>
  );
}

function SectionRule({ label }: { label: string }) {
  return (
    <View style={styles.sectionRule}>
      <Text style={text.label}>{label}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

function TaskCard({ task, pinned, onToggle, onEdit, onRemove, onPin, onToggleSubtask }: {
  task: Task; pinned: boolean;
  onToggle: (id: number, e: GestureResponderEvent) => void; onEdit: (t: Task) => void; onRemove: (id: number) => void; onPin: (id: number | null) => void;
  onToggleSubtask: (taskId: number, subtaskId: string) => void;
}) {
  const e = energy[toTier(task.energy)];
  const progress = subtaskProgress(task);
  /**
   * Collapsed by default, and deliberately so. A list where every task is
   * already unfolded is the wall of text this app exists to avoid — the point
   * of breaking a task down is that you look at the steps when you start it,
   * not while you are deciding what to start.
   */
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.taskCard}>
      <View style={styles.taskRow}>
        <Pressable onPress={(e) => onToggle(task.id, e)} style={[styles.checkbox, { borderColor: task.completed ? sage.primary : sage.ruleStrong, backgroundColor: task.completed ? sage.primary : sage.surface }]} hitSlop={6}>
          {task.completed && <Check size={13} color={sage.onPrimary} strokeWidth={3} />}
        </Pressable>
        <Pressable
          style={{ flex: 1, minWidth: 0 }}
          onLongPress={() => onPin(pinned ? null : task.id)}
          onPress={progress ? () => setOpen((v) => !v) : undefined}
        >
          <Text style={[text.itemTitle, task.completed && styles.taskDone]}>{task.name}</Text>
          <View style={styles.taskMetaRow}>
            <Text style={[styles.tag, { color: e.fg, backgroundColor: e.bg }]}>{e.label}</Text>
            {progress && (
              <Text style={[styles.tag, { color: sage.primaryDeep, backgroundColor: sage.fillGreen }]}>
                {progress.done}/{progress.total}
              </Text>
            )}
            {task.dueTime && <Text style={[styles.dueAt, task.completed && { color: sage.fgFaint }]}>{formatDueTime(task.dueTime)}</Text>}
            <Text style={text.meta}>{metaFor(task)}</Text>
            {pinned && <Text style={[styles.tag, { color: sage.primaryDeep, backgroundColor: sage.fillGreen }]}>Pinned</Text>}
          </View>
        </Pressable>
        <View style={{ gap: 6 }}>
          <Pressable onPress={() => onEdit(task)} style={styles.miniBtn} hitSlop={4}><Pencil size={13} color={sage.fgFaint} strokeWidth={2} /></Pressable>
          <Pressable onPress={() => onRemove(task.id)} style={styles.miniBtn} hitSlop={4}><X size={14} color={sage.fgFaint} strokeWidth={2} /></Pressable>
        </View>
      </View>

      {progress ? (
        <Pressable
          onPress={() => setOpen((v) => !v)}
          style={styles.stepsToggle}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={open ? 'Hide steps' : `Show ${progress.total} steps`}
        >
          {open ? <ChevronDown size={14} color={sage.fgMuted} strokeWidth={2} /> : <ChevronRight size={14} color={sage.fgMuted} strokeWidth={2} />}
          <Text style={text.meta}>{open ? 'Hide steps' : `${progress.total} steps`}</Text>
        </Pressable>
      ) : null}

      {open && task.subtasks ? (
        <View style={styles.subtaskList}>
          {task.subtasks.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => onToggleSubtask(task.id, s.id)}
              style={styles.subtaskRow}
              hitSlop={4}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: s.done }}
            >
              <View style={[styles.subCheckbox, s.done && { backgroundColor: sage.primary, borderColor: sage.primary }]}>
                {s.done && <Check size={10} color={sage.onPrimary} strokeWidth={3} />}
              </View>
              <Text style={[styles.subtaskName, s.done && styles.taskDone]}>{s.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Composer({ editingId, draft, setDraft, draftEnergy, setDraftEnergy, draftTime, setDraftTime, draftSteps, setDraftSteps, saveTask, onCancel }: {
  editingId: number | null; draft: string; setDraft: (s: string) => void;
  draftEnergy: EnergyKey; setDraftEnergy: (k: EnergyKey) => void;
  draftTime: string | null; setDraftTime: (t: string | null) => void;
  draftSteps: Subtask[]; setDraftSteps: (s: Subtask[]) => void;
  saveTask: () => void; onCancel: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [breakingDown, setBreakingDown] = useState(false);
  const [asking, setAsking] = useState(false);

  const editStep = (id: string, name: string) =>
    setDraftSteps(draftSteps.map((st) => (st.id === id ? { ...st, name } : st)));

  const removeStep = (id: string) => setDraftSteps(draftSteps.filter((st) => st.id !== id));

  const addStep = () => {
    if (draftSteps.length >= MAX_SUBTASKS) return;
    setDraftSteps([...draftSteps, { id: `${Date.now()}-${draftSteps.length}`, name: '', done: false }]);
  };

  /** Opens the sheet, which is where the context and the suggestions live. */
  const openBreakdown = () => {
    if (!draft.trim()) {
      Alert.alert('Name it first', 'Type what the task is and I can break it into steps.');
      return;
    }
    setAsking(true);
  };

  /** Tapped suggestions are appended — they are additions, not a replacement. */
  const addSuggested = (names: string[]) => {
    const now = Date.now();
    setDraftSteps([
      ...draftSteps,
      ...names.map((name, i) => ({ id: `${now}-s${i}`, name, done: false })),
    ].slice(0, MAX_SUBTASKS));
    haptic('light');
  };

  /**
   * Works before the task exists.
   *
   * `requestBreakdown` only fetches — the steps land in draft state and are
   * saved with everything else. Requiring the task to be saved first would mean
   * add, then reopen, then break down, which is exactly the friction this
   * feature is meant to remove.
   */
  const breakDown = async (context: string) => {
    const name = draft.trim();
    if (!name) return;
    setBreakingDown(true);
    try {
      setDraftSteps(await requestBreakdown({ name, context }));
      setAsking(false);
      haptic('success');
    } catch (err) {
      if (err instanceof BreakdownUnavailable && err.reason === 'needs_pro') {
        setAsking(false);
        router.push('/paywall');
        return;
      }
      Alert.alert(
        'Not broken down',
        err instanceof Error ? err.message : 'Something went wrong. You can still add steps yourself.',
      );
    } finally {
      setBreakingDown(false);
    }
  };

  // Seed the wheel from the current value, else the next whole hour — nobody
  // sets a task for 3:47.
  const pickerValue = () => {
    const d = new Date();
    if (draftTime) {
      const [h, m] = draftTime.split(':').map(Number);
      d.setHours(h, m, 0, 0);
    } else {
      d.setHours(d.getHours() + 1, 0, 0, 0);
    }
    return d;
  };

  return (
    <View style={[styles.card, styles.composer]}>
      <Text style={[text.labelFaint, { marginBottom: 10 }]}>{editingId ? 'Edit task' : 'New task'}</Text>
      <TextInput value={draft} onChangeText={setDraft} placeholder="What's one small thing?" placeholderTextColor={sage.fgFaint} style={styles.composerInput} autoFocus onSubmitEditing={saveTask} />
      <View style={styles.energyPicker}>
        {(['high', 'mid', 'low'] as EnergyKey[]).map((k) => {
          const on = draftEnergy === k;
          return (
            <Pressable key={k} onPress={() => setDraftEnergy(k)} style={[styles.pickerBtn, { backgroundColor: on ? energy[k].bg : sage.fillAlt }]}>
              <Text style={[styles.pickerText, { color: on ? energy[k].fg : sage.fgFaint }]}>{energy[k].label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.timeRow}>
        <Pressable onPress={() => setPicking(true)} style={[styles.timeBtn, draftTime && { backgroundColor: sage.fillGreen }]}>
          <Clock size={13} color={draftTime ? sage.primaryDeep : sage.fgFaint} strokeWidth={2} />
          <Text style={[styles.timeBtnText, draftTime && { color: sage.primaryDeep }]}>
            {draftTime ? formatDueTime(draftTime) : 'Any time'}
          </Text>
        </Pressable>
        {draftTime && (
          <Pressable onPress={() => setDraftTime(null)} style={styles.timeClear} hitSlop={8} accessibilityLabel="Clear the time">
            <X size={13} color={sage.fgFaint} strokeWidth={2} />
          </Pressable>
        )}
      </View>

      {picking && (
        <DateTimePicker
          value={pickerValue()}
          mode="time"
          is24Hour={false}
          minuteInterval={5}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => {
            // Android's dialog closes itself and reports the dismissal; iOS keeps
            // the spinner up until the sheet is dismissed by the Done button.
            if (Platform.OS === 'android') setPicking(false);
            if (event.type === 'dismissed' || !date) return;
            setDraftTime(`${pad(date.getHours())}:${pad(date.getMinutes())}`);
          }}
        />
      )}
      {Platform.OS === 'ios' && picking && (
        <Pressable onPress={() => setPicking(false)} style={styles.pickerDone}>
          <Text style={styles.pickerDoneText}>Done</Text>
        </Pressable>
      )}

      {draftSteps.map((st, i) => (
        <View key={st.id} style={styles.stepEditRow}>
          <Text style={styles.stepIndex}>{i + 1}</Text>
          <TextInput
            value={st.name}
            onChangeText={(v) => editStep(st.id, v)}
            placeholder="What's the next small thing?"
            placeholderTextColor={sage.fgFaint}
            style={styles.stepEditInput}
            maxLength={80}
          />
          <Pressable onPress={() => removeStep(st.id)} hitSlop={8} accessibilityLabel="Remove this step">
            <X size={14} color={sage.fgFaint} strokeWidth={2} />
          </Pressable>
        </View>
      ))}

      <View style={styles.stepActions}>
        <Pressable
          onPress={addStep}
          disabled={draftSteps.length >= MAX_SUBTASKS}
          style={[styles.stepBtn, draftSteps.length >= MAX_SUBTASKS && { opacity: 0.4 }]}
        >
          <Plus size={14} color={sage.primaryInk} strokeWidth={2.2} />
          <Text style={styles.stepBtnText}>Add a step</Text>
        </Pressable>
        <Pressable
          onPress={openBreakdown}
          disabled={breakingDown}
          style={[styles.stepBtn, styles.stepBtnPrimary, breakingDown && { opacity: 0.6 }]}
        >
          {breakingDown ? (
            <ActivityIndicator size="small" color={sage.onPrimary} />
          ) : (
            <>
              <Sparkles size={14} color={sage.onPrimary} strokeWidth={2.2} />
              <Text style={[styles.stepBtnText, { color: sage.onPrimary }]}>Break it down</Text>
            </>
          )}
        </Pressable>
      </View>

      <View style={styles.composerActions}>
        <Pressable onPress={onCancel} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></Pressable>
        <Pressable onPress={saveTask} style={styles.saveBtn}><Text style={text.button}>{editingId ? 'Save' : 'Add'}</Text></Pressable>
      </View>

      <BreakdownSheet
        visible={asking}
        taskName={draft}
        existingCount={draftSteps.length}
        busy={breakingDown}
        onClose={() => setAsking(false)}
        onAddSteps={addSuggested}
        onGenerate={breakDown}
      />
    </View>
  );
}

function CalendarView({ tasks, today, selected, setSelected, monthOffset, setMonthOffset, onClose, onAdd, composer }: {
  tasks: Task[]; today: string; selected: string; setSelected: (s: string) => void;
  monthOffset: number; setMonthOffset: (fn: (n: number) => number) => void; onClose: () => void; onAdd: () => void; composer: React.ReactNode;
}) {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const firstDay = base.getDay();
  const daysIn = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const selDate = new Date(selected + 'T12:00:00');
  const dayTasks = tasks.filter((t) => dayOf(t, today) === selected);
  const dayActive = dayTasks.filter((t) => !t.completed);
  const dayDone = dayTasks.filter((t) => t.completed);

  return (
    <>
      <View style={styles.calHeader}>
        <Pressable onPress={onClose} style={[styles.iconBtn, styles.iconBtnPlain]} hitSlop={6}>
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
        <Text style={[text.title, { flex: 1 }]}>Calendar</Text>
        <Pressable onPress={() => { setMonthOffset(() => 0); setSelected(today); }} style={styles.todayPill}><Text style={styles.todayPillText}>Today</Text></Pressable>
        <Pressable onPress={onAdd} style={[styles.iconBtn, styles.iconBtnPrimary]} hitSlop={6}><Plus size={18} color={sage.onPrimary} strokeWidth={2.5} /></Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.monthRow}>
          <Pressable onPress={() => setMonthOffset((n) => n - 1)} style={styles.monthNav}><Text style={styles.monthArrow}>‹</Text></Pressable>
          <Text style={text.h2}>{MONTHS[base.getMonth()]} {base.getFullYear()}</Text>
          <Pressable onPress={() => setMonthOffset((n) => n + 1)} style={styles.monthNav}><Text style={styles.monthArrow}>›</Text></Pressable>
        </View>
        <View style={styles.weekRow}>
          {DAYS.map((d) => <Text key={d} style={styles.weekday}>{d[0]}{d[1]}</Text>)}
        </View>
        <View style={styles.grid}>
          {cells.map((d, i) => {
            if (d === null) return <View key={`e${i}`} style={styles.dayCell} />;
            const key = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const has = tasks.some((t) => dayOf(t, today) === key);
            const isSel = key === selected;
            const isToday = key === today;
            return (
              <Pressable key={key} onPress={() => setSelected(key)} style={[styles.dayCell, { backgroundColor: isSel ? sage.primary : isToday ? sage.fillGreen : 'transparent' }]}>
                <Text style={[styles.dayNum, { color: isSel ? sage.onPrimary : isToday ? sage.primaryDeep : sage.fgBody }]}>{d}</Text>
                <View style={[styles.dayDot, { backgroundColor: has ? (isSel ? 'rgba(255,255,255,.8)' : sage.leafSoft) : 'transparent' }]} />
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={[text.cardTitle, { marginTop: 18 }]}>
        {(selected === today ? 'Today · ' : '') + `${DAYS[selDate.getDay()]} ${selDate.getDate()} ${MONTHS[selDate.getMonth()]}`}
      </Text>

      {composer}

      <View style={{ marginTop: 12, gap: 9 }}>
        {dayActive.length > 0 && <Text style={[text.label, { marginHorizontal: 2 }]}>Active</Text>}
        {dayActive.map((t) => (
          <View key={t.id} style={styles.calRow}>
            <View style={[styles.calDot, { backgroundColor: energy[toTier(t.energy)].fg }]} />
            <Text style={[text.itemTitle, { flex: 1 }]}>{t.name}</Text>
            <Text style={[styles.tag, { color: energy[toTier(t.energy)].fg, backgroundColor: energy[toTier(t.energy)].bg }]}>{energy[toTier(t.energy)].label}</Text>
          </View>
        ))}
        {dayDone.length > 0 && <Text style={[text.labelFaint, { marginHorizontal: 2, marginTop: 8 }]}>Completed</Text>}
        {dayDone.map((t) => (
          <View key={t.id} style={[styles.calRow, { backgroundColor: sage.fill }]}>
            <View style={styles.calCheck}><Check size={11} color={sage.onPrimary} strokeWidth={3} /></View>
            <Text style={[text.itemTitle, styles.taskDone, { flex: 1 }]}>{t.name}</Text>
          </View>
        ))}
        {dayTasks.length === 0 && (
          <View style={styles.empty}><Text style={styles.emptyText}>Nothing scheduled. A clear day is allowed.</Text></View>
        )}
      </View>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Styles
 * ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: sage.bg },
  scroll: { paddingHorizontal: gutter, paddingTop: 4, paddingBottom: 32 },

  pinned: { marginHorizontal: 16, marginBottom: 6, backgroundColor: sage.surface, borderRadius: 18, padding: 12, paddingLeft: 14, flexDirection: 'row', alignItems: 'center', gap: 10, ...shadow.soft, ...curve },
  pinnedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: sage.leaf },
  pinnedLabel: { ...text.labelFaint, color: sage.fgFaint },
  pinnedTitle: { fontFamily: font.heading, fontSize: 13.5, color: sage.fgBody },
  pinnedBtn: { width: 28, height: 28, borderRadius: 10, backgroundColor: sage.fillGreen, alignItems: 'center', justifyContent: 'center', ...curve },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8, paddingBottom: 18, gap: 10 },
  dateLabel: { fontFamily: font.body, fontSize: 13, color: sage.fgSecondary },
  greeting: { fontFamily: font.heading, fontSize: 26, lineHeight: 32, color: sage.fg, marginTop: 4 },
  headerBtns: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: 15, alignItems: 'center', justifyContent: 'center', ...curve },
  iconBtnPrimary: { backgroundColor: sage.primary, ...shadow.soft },
  iconBtnPlain: { backgroundColor: sage.surface, ...shadow.soft },
  calIconTop: { width: 18, height: 3, borderRadius: 2, backgroundColor: sage.leaf },
  calIconBody: { width: 18, height: 11, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, borderWidth: 2, borderTopWidth: 0, borderColor: sage.leafSoft, marginTop: 2 },

  card: { backgroundColor: sage.surface, borderRadius: radius.cardLg, padding: 18, ...shadow.card, ...curve, marginBottom: 14 },

  energyRow: { flexDirection: 'row', gap: 6, marginTop: 16, backgroundColor: sage.fill, borderRadius: 20, padding: 5 },
  energySeg: { flex: 1, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 6, ...curve },
  energyBar: { height: 5, borderRadius: 3 },
  energySegLabel: { fontFamily: font.heading, fontSize: 13 },
  energyFillTrack: { height: 5, borderRadius: 3, backgroundColor: sage.trackAlt, overflow: 'hidden', marginTop: 12 },
  energyFillBar: { height: '100%', borderRadius: 3 },
  insight: { fontFamily: font.body, fontSize: 13, lineHeight: 19.5, color: sage.fgSecondary, marginTop: 14 },

  progressCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  pctText: { fontFamily: font.heading, fontSize: 15, color: sage.leaf },

  filters: { marginTop: 6, marginBottom: 6, marginHorizontal: -gutter, paddingHorizontal: gutter },
  chip: { paddingVertical: 9, paddingHorizontal: 18, borderRadius: radius.pill, ...curve },
  chipOn: { backgroundColor: sage.primary, ...shadow.soft },
  chipOff: { backgroundColor: sage.surface, ...shadow.soft },
  chipText: { fontFamily: font.heading, fontSize: 13 },

  composer: { marginTop: 12 },
  composerInput: { fontFamily: font.heading, fontSize: 15, color: sage.fgBody, padding: 2 },
  energyPicker: { flexDirection: 'row', gap: 7, marginTop: 14 },
  pickerBtn: { flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center', ...curve },
  pickerText: { fontFamily: font.bodySemi, fontSize: 11.5, letterSpacing: 0.6, textTransform: 'uppercase' },
  composerActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  cancelBtn: { borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: sage.fillAlt, ...curve },
  cancelText: { fontFamily: font.heading, fontSize: 12.5, color: sage.fgFaint },
  saveBtn: { marginLeft: 'auto', borderRadius: 13, paddingVertical: 10, paddingHorizontal: 22, backgroundColor: sage.primary, ...curve },

  sectionRule: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 10, marginHorizontal: 2 },
  sectionLine: { flex: 1, height: 1, backgroundColor: sage.ruleStrong },

  dueAt: { fontFamily: font.heading, fontSize: 11.5, color: sage.primaryDeep },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  timeBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: sage.fillAlt, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, ...curve },
  timeBtnText: { fontFamily: font.heading, fontSize: 12.5, color: sage.fgFaint },
  timeClear: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: sage.fillAlt, ...curve },
  pickerDone: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 14 },
  pickerDoneText: { fontFamily: font.heading, fontSize: 13, color: sage.primaryDeep },
  taskCard: { backgroundColor: sage.surface, borderRadius: radius.card, padding: 14, paddingLeft: 16, ...shadow.soft, ...curve },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  stepEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  stepIndex: { fontFamily: font.body, fontSize: 12, color: sage.fgFaint, width: 12, textAlign: 'center' },
  stepEditInput: {
    flex: 1,
    backgroundColor: sage.fillAlt,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontFamily: font.body,
    fontSize: 13.5,
    color: sage.fgBody,
  },
  stepActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  stepBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: sage.fill,
    ...curve,
  },
  stepBtnPrimary: { backgroundColor: sage.primary },
  stepBtnText: { fontFamily: font.ui, fontSize: 12.5, color: sage.primaryInk },
  stepsToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, marginLeft: 40 },
  subtaskList: { marginTop: 8, marginLeft: 40, gap: 2 },
  subtaskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  subCheckbox: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: sage.ruleStrong, backgroundColor: sage.surface, alignItems: 'center', justifyContent: 'center' },
  subtaskName: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: sage.fgBody, flex: 1 },
  checkbox: { width: 26, height: 26, marginTop: 2, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  taskDone: { color: sage.fgFaint, textDecorationLine: 'line-through' },
  taskMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  tag: { fontFamily: font.bodySemi, fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  miniBtn: { width: 28, height: 28, borderRadius: 10, backgroundColor: sage.fill, alignItems: 'center', justifyContent: 'center', ...curve },

  empty: { backgroundColor: sage.surface, borderRadius: 20, padding: 22, alignItems: 'center', ...shadow.soft, ...curve },
  emptyText: { fontFamily: font.body, fontSize: 13, color: sage.fgFaint, textAlign: 'center' },

  calHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingBottom: 18 },
  backArrow: { fontFamily: font.headingBold, fontSize: 24, color: sage.fgSecondary, marginTop: -4 },
  todayPill: { borderRadius: 13, paddingVertical: 9, paddingHorizontal: 15, backgroundColor: sage.fillGreen, ...curve },
  todayPillText: { fontFamily: font.heading, fontSize: 12.5, color: sage.primaryDeep },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  monthNav: { width: 34, height: 34, borderRadius: 12, backgroundColor: sage.fill, alignItems: 'center', justifyContent: 'center', ...curve },
  monthArrow: { fontFamily: font.headingBold, fontSize: 18, color: sage.fgSecondary, marginTop: -2 },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekday: { flex: 1, textAlign: 'center', fontFamily: font.bodySemi, fontSize: 10.5, color: sage.fgFaint },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dayNum: { fontFamily: font.heading, fontSize: 13 },
  dayDot: { width: 4, height: 4, borderRadius: 2 },
  calRow: { backgroundColor: sage.surface, borderRadius: 20, padding: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow.soft, ...curve },
  calDot: { width: 8, height: 8, borderRadius: 4 },
  calCheck: { width: 16, height: 16, borderRadius: 8, backgroundColor: sage.leafSoft, alignItems: 'center', justifyContent: 'center' },
});
