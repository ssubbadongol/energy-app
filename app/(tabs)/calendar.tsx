/**
 * Calendar.
 *
 * The reasoning for the shape of this screen lives in `app/taskSchedule.ts`,
 * next to the arithmetic that implements it. The short version is that a month
 * grid is the wrong default for an ADHD audience, so this is a week strip with
 * a month grid behind a toggle, and the three things a month grid cannot do
 * are done here instead:
 *
 *   1. Overdue work is pulled to the top, not left in the past. A task whose
 *      day has gone does not exist any more as far as the user is concerned,
 *      and no one scrolls backwards to find it.
 *
 *   2. Each day shows how full it is, as a bar. A dot answers "is there
 *      anything", which is the question nobody needed answered. "Is Thursday
 *      already too full to put this on" is the one that matters.
 *
 *   3. Moving a task to another day is one tap. Rescheduling is the normal
 *      operation of a week here, not an error path.
 *
 * It is a pushed route rather than a sixth tab: the tab bar is full at five,
 * and the calendar is somewhere you go on purpose, from the button that was
 * already on the Today header.
 */
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useFocusEffect } from 'expo-router';
import {
  CalendarDays, Check, ChevronDown, ChevronRight, Clock, Pencil, Plus, X,
} from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import {
  type GestureResponderEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Reanimated, { LinearTransition, ReduceMotion, StretchInY, StretchOutY } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { haptic } from '@/components/primitives/usePressScale';
import { SageBackground } from '@/components/sage/Background';
import { useCelebrate } from '@/components/sage/Celebration';
import { MoveSheet } from '@/components/tasks/MoveSheet';
import { curve, energy, type EnergyKey, font, gutter, radius, sage, shadow, text } from '@/theme/sage';
import { duration, ease } from '@/theme/tokens';
import { formatClock } from '../clockFormat';
import { getUserProfileSync } from '../userProfileStorage';
import { track } from '../monitoring';
import {
  addDays,
  dayLoad,
  type DayKey,
  loadSummary,
  MONTHS,
  monthGrid,
  overdue,
  parseDay,
  relativeDay,
  shortDate,
  taskDay,
  tasksOn,
  todayKey,
  waitedFor,
  WEEKDAYS,
  weekLabel,
  weekOf,
} from '../taskSchedule';
import {
  addTask,
  deleteTask,
  getSharedTasks,
  initializeTasks,
  onTasksChanged,
  subtaskProgress,
  type Task,
  toggleSubtask,
  toggleTaskCompletion,
  updateTask,
} from '../taskStorage';

const OPEN = StretchInY.duration(duration.list).easing(ease.out).reduceMotion(ReduceMotion.System);
const CLOSE = StretchOutY.duration(duration.listOut).easing(ease.out).reduceMotion(ReduceMotion.System);
const REFLOW = LinearTransition.duration(duration.list).easing(ease.out).reduceMotion(ReduceMotion.System);

/** taskStorage says `medium`; the sage tokens say `mid`. Convert at the edge. */
const toTier = (e: Task['energy']): EnergyKey => (e === 'medium' ? 'mid' : e);
const fromTier = (k: EnergyKey): Task['energy'] => (k === 'mid' ? 'medium' : k);

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * "14:30" -> "2:30 PM", or "14:30". Stored 24h so it sorts and compares, and
 * converted only here, against whichever clock the user reads.
 */
const formatDueTime = (hhmm: string) => formatClock(hhmm, getUserProfileSync().clock);

/** Midday, matching every other `dueDate` the app writes. */
const dueDateFor = (key: DayKey) => `${key}T12:00:00`;

export default function CalendarScreen() {
  const today = todayKey();
  const celebrate = useCelebrate();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<DayKey>(today);
  const [monthOpen, setMonthOpen] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  const [moving, setMoving] = useState<Task | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  // composer
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [draftEnergy, setDraftEnergy] = useState<EnergyKey>('mid');
  const [draftTime, setDraftTime] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const refresh = useCallback(() => setTasks([...getSharedTasks()]), []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      initializeTasks().then((loaded) => { if (alive) setTasks([...loaded]); });
      // The mentor writes tasks server-side, so the list can change while this
      // screen is open and nothing on it did anything.
      const off = onTasksChanged(() => { if (alive) refresh(); });
      return () => { alive = false; off(); };
    }, [refresh]),
  );

  const late = useMemo(() => overdue(tasks, today), [tasks, today]);
  const week = useMemo(() => weekOf(selected), [selected]);
  const dayTasks = useMemo(() => tasksOn(tasks, selected, today), [tasks, selected, today]);
  const load = useMemo(() => dayLoad(tasks, selected, today), [tasks, selected, today]);

  const timed = dayTasks
    .filter((t) => !t.completed && t.dueTime)
    .sort((a, b) => (a.dueTime ?? '').localeCompare(b.dueTime ?? ''));
  const anytime = dayTasks.filter((t) => !t.completed && !t.dueTime);
  const done = dayTasks.filter((t) => t.completed);

  /* ---------------------------------------------------------------- *
   * Actions
   * ---------------------------------------------------------------- */

  const toggle = async (id: number, e?: GestureResponderEvent) => {
    const wasOpen = !tasks.find((t) => t.id === id)?.completed;
    await toggleTaskCompletion(id);
    if (wasOpen) {
      haptic('success');
      if (e) celebrate(e.nativeEvent.pageX, e.nativeEvent.pageY);
    }
    refresh();
  };

  const tickSubtask = async (taskId: number, subtaskId: string) => {
    haptic('light');
    await toggleSubtask(taskId, subtaskId);
    refresh();
  };

  const move = async (key: DayKey) => {
    if (!moving) return;
    const from = taskDay(moving, today);
    await updateTask(moving.id, { dueDate: dueDateFor(key) });
    setMoving(null);
    // Land the user on the day the thing went to, so the move is something
    // they watched happen rather than something they have to go and verify.
    setSelected(key);
    track('task_rescheduled', { forward: key > from });
    haptic('success');
    refresh();
  };

  /** The one-tap buttons on an overdue row. Same write, no sheet. */
  const reschedule = async (task: Task, key: DayKey) => {
    const from = taskDay(task, today);
    await updateTask(task.id, { dueDate: dueDateFor(key) });
    track('task_rescheduled', { forward: key > from });
    haptic('success');
    refresh();
  };

  const remove = async (id: number) => {
    await deleteTask(id);
    refresh();
  };

  const startAdd = () => {
    setComposing(true);
    setEditingId(null);
    setDraft('');
    setDraftEnergy('mid');
    setDraftTime(null);
  };

  const startEdit = (t: Task) => {
    setComposing(true);
    setEditingId(t.id);
    setDraft(t.name);
    setDraftEnergy(toTier(t.energy));
    setDraftTime(t.dueTime ?? null);
  };

  const cancelCompose = () => {
    setComposing(false);
    setEditingId(null);
    setPicking(false);
  };

  const save = async () => {
    const name = draft.trim();
    if (!name) return;

    if (editingId) {
      await updateTask(editingId, {
        name,
        energy: fromTier(draftEnergy),
        priority: fromTier(draftEnergy),
        // `undefined` rather than omitted, so clearing the time really clears it.
        dueTime: draftTime ?? undefined,
      });
    } else {
      await addTask({
        name,
        energy: fromTier(draftEnergy),
        priority: fromTier(draftEnergy),
        time: 0,
        type: 'Task',
        completed: false,
        dueDate: dueDateFor(selected),
        dueTime: draftTime ?? undefined,
      });
    }
    cancelCompose();
    setDraft('');
    setDraftTime(null);
    refresh();
  };

  /* ---------------------------------------------------------------- *
   * Month panel
   * ---------------------------------------------------------------- */

  const selDate = parseDay(selected);
  const monthShown = new Date(selDate.getFullYear(), selDate.getMonth() + monthOffset, 1, 12);
  const cells = monthGrid(monthShown.getFullYear(), monthShown.getMonth());

  const pickMonthDay = (key: DayKey) => {
    haptic('selection');
    setSelected(key);
    setMonthOffset(0);
    // Collapse on pick. The month grid is a way of getting somewhere, not a
    // place to stay — leaving it open buries the day you just chose.
    setMonthOpen(false);
  };

  const onToday = selected === today;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <SageBackground />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.iconBtn, styles.iconBtnPlain]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Text style={styles.backArrow}>‹</Text>
          </Pressable>
          <Text style={[text.title, { flex: 1 }]}>Calendar</Text>
          {!onToday && (
            <Pressable onPress={() => { setSelected(today); setMonthOffset(0); }} style={styles.todayPill}>
              <Text style={styles.todayPillText}>Today</Text>
            </Pressable>
          )}
          <Pressable
            onPress={startAdd}
            style={[styles.iconBtn, styles.iconBtnPrimary]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Add a task to this day"
          >
            <Plus size={18} color={sage.onPrimary} strokeWidth={2.5} />
          </Pressable>
        </View>

        {late.length > 0 && (
          <Reanimated.View style={styles.lateCard} entering={OPEN} exiting={CLOSE} layout={REFLOW}>
            <Text style={text.cardTitle}>Still waiting</Text>
            <Text style={[text.body, { marginTop: 3 }]}>
              {late.length === 1 ? 'This one' : 'These'} never got done. Not a problem — give{' '}
              {late.length === 1 ? 'it' : 'them'} a new day.
            </Text>

            {/*
              Name on one line, answers on the next. Cramming four controls
              alongside the title leaves about a hundred points for the title,
              which is where a task called "email the placement coordinator"
              becomes "email the placement…" — unreadable exactly when the
              point is to recognise it.
            */}
            {late.slice(0, 6).map((t) => (
              <View key={t.id} style={styles.lateRow}>
                <Text style={text.itemTitle} numberOfLines={2}>{t.name}</Text>
                <Text style={[text.meta, { marginTop: 2 }]}>{waitedFor(taskDay(t, today), today)}</Text>
                <View style={styles.lateActions}>
                  <Pressable onPress={() => reschedule(t, today)} style={styles.lateBtn} accessibilityRole="button" accessibilityLabel={`Move ${t.name} to today`}>
                    <Text style={styles.lateBtnText}>Today</Text>
                  </Pressable>
                  <Pressable onPress={() => reschedule(t, addDays(today, 1))} style={styles.lateBtn} accessibilityRole="button" accessibilityLabel={`Move ${t.name} to tomorrow`}>
                    <Text style={styles.lateBtnText}>Tomorrow</Text>
                  </Pressable>
                  <Pressable onPress={() => setMoving(t)} style={styles.lateBtn} accessibilityRole="button" accessibilityLabel={`Pick another day for ${t.name}`}>
                    <Text style={styles.lateBtnText}>Another day</Text>
                  </Pressable>
                  <Pressable onPress={(e) => toggle(t.id, e)} style={styles.lateCheck} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Mark ${t.name} done`}>
                    <Check size={13} color={sage.primaryDeep} strokeWidth={2.5} />
                  </Pressable>
                </View>
              </View>
            ))}

            {late.length > 6 && (
              <Text style={[text.meta, { marginTop: 10 }]}>
                and {late.length - 6} more — they&apos;ll appear here as you clear these.
              </Text>
            )}
          </Reanimated.View>
        )}

        {/* ── Week strip ─────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.weekNav}>
            <Pressable onPress={() => setSelected(addDays(selected, -7))} style={styles.monthNav} hitSlop={8} accessibilityLabel="Previous week">
              <Text style={styles.monthArrow}>‹</Text>
            </Pressable>
            <Text style={text.h2}>{weekLabel(week)}</Text>
            <Pressable onPress={() => setSelected(addDays(selected, 7))} style={styles.monthNav} hitSlop={8} accessibilityLabel="Next week">
              <Text style={styles.monthArrow}>›</Text>
            </Pressable>
          </View>

          <View style={styles.strip}>
            {week.map((key, i) => {
              const l = dayLoad(tasks, key, today);
              const isSel = key === selected;
              const isToday = key === today;
              const past = key < today;
              return (
                <Pressable
                  key={key}
                  onPress={() => { haptic('selection'); setSelected(key); }}
                  style={styles.stripCol}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  accessibilityLabel={`${relativeDay(key, today)}, ${l.open} open, ${l.done} done`}
                >
                  <Text style={[styles.stripDow, isSel && { color: sage.primaryDeep }]}>{WEEKDAYS[i][0]}</Text>
                  <View style={[
                    styles.stripDay,
                    isToday && !isSel && styles.stripDayToday,
                    isSel && styles.stripDaySel,
                  ]}>
                    <Text style={[
                      styles.stripNum,
                      past && !isSel && { color: sage.fgFaint },
                      isToday && !isSel && { color: sage.primaryDeep },
                      isSel && { color: sage.onPrimary },
                    ]}>
                      {parseDay(key).getDate()}
                    </Text>
                  </View>
                  {/*
                    The load bar. Empty days get an empty track rather than a
                    zero-width bar on a grey one, so a clear day looks clear
                    instead of looking like a day whose bar failed to draw.
                  */}
                  <View style={styles.loadTrack}>
                    {l.open > 0 && (
                      <View style={[
                        styles.loadFill,
                        { width: `${Math.max(0.25, l.fill) * 100}%` },
                        l.heavy && { backgroundColor: sage.clay },
                        isSel && !l.heavy && { backgroundColor: sage.primaryDeep },
                      ]} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => { setMonthOpen((v) => !v); setMonthOffset(0); }}
            style={styles.monthToggle}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={monthOpen ? 'Hide the month' : 'Show the whole month'}
          >
            {monthOpen
              ? <ChevronDown size={14} color={sage.fgMuted} strokeWidth={2} />
              : <ChevronRight size={14} color={sage.fgMuted} strokeWidth={2} />}
            <Text style={text.meta}>{monthOpen ? 'Hide the month' : 'Pick another date'}</Text>
          </Pressable>

          {monthOpen && (
            <Reanimated.View entering={OPEN} exiting={CLOSE} layout={REFLOW} style={{ marginTop: 12 }}>
              <View style={styles.weekNav}>
                <Pressable onPress={() => setMonthOffset((n) => n - 1)} style={styles.monthNav} hitSlop={8} accessibilityLabel="Previous month">
                  <Text style={styles.monthArrow}>‹</Text>
                </Pressable>
                <Text style={text.h2}>{MONTHS[monthShown.getMonth()]} {monthShown.getFullYear()}</Text>
                <Pressable onPress={() => setMonthOffset((n) => n + 1)} style={styles.monthNav} hitSlop={8} accessibilityLabel="Next month">
                  <Text style={styles.monthArrow}>›</Text>
                </Pressable>
              </View>

              <View style={styles.gridHead}>
                {WEEKDAYS.map((d) => <Text key={d} style={styles.gridHeadText}>{d[0]}</Text>)}
              </View>

              <View style={styles.grid}>
                {cells.map((key, i) => {
                  if (!key) return <View key={`e${i}`} style={styles.cell} />;
                  const l = dayLoad(tasks, key, today);
                  const isSel = key === selected;
                  const isToday = key === today;
                  return (
                    <Pressable key={key} onPress={() => pickMonthDay(key)} style={styles.cell}>
                      <View style={[
                        styles.cellInner,
                        isToday && !isSel && styles.stripDayToday,
                        isSel && styles.stripDaySel,
                      ]}>
                        <Text style={[
                          styles.cellNum,
                          key < today && !isSel && { color: sage.fgFaint },
                          isToday && !isSel && { color: sage.primaryDeep },
                          isSel && { color: sage.onPrimary },
                        ]}>
                          {parseDay(key).getDate()}
                        </Text>
                        <View style={styles.cellTrack}>
                          {l.open > 0 && (
                            <View style={[
                              styles.loadFill,
                              { width: `${Math.max(0.25, l.fill) * 100}%` },
                              l.heavy && { backgroundColor: sage.clay },
                              isSel && !l.heavy && { backgroundColor: sage.onPrimary },
                            ]} />
                          )}
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </Reanimated.View>
          )}
        </View>

        {/* ── The selected day ───────────────────────────────────── */}
        <View style={styles.dayHead}>
          <Text style={text.title}>{relativeDay(selected, today)}</Text>
          <Text style={[text.meta, { marginTop: 2 }]}>{shortDate(selected)}</Text>
          <Text style={[text.body, { marginTop: 8 }]}>{loadSummary(load)}</Text>
          {/*
            Said once, in the app's own voice, and never in red. The point is
            to be noticed before another thing is added, not to be a telling-off
            about a day that has already happened.
          */}
          {load.heavy && (
            <Text style={styles.heavyNote}>
              That&apos;s a full day already. Anything else could wait until tomorrow.
            </Text>
          )}
        </View>

        {composing && (
          <Reanimated.View entering={OPEN} exiting={CLOSE} layout={REFLOW}>
            <View style={[styles.card, { marginTop: 12 }]}>
              <Text style={[text.labelFaint, { marginBottom: 10 }]}>
                {editingId ? 'Edit task' : `New task · ${relativeDay(selected, today)}`}
              </Text>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="What's one small thing?"
                placeholderTextColor={sage.fgFaint}
                style={styles.composerInput}
                autoFocus
                onSubmitEditing={save}
              />

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
                  value={seedTime(draftTime)}
                  mode="time"
                  is24Hour={false}
                  minuteInterval={5}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, date) => {
                    // Android's dialog closes itself; iOS keeps the spinner up
                    // until Done.
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

              <View style={styles.composerActions}>
                <Pressable onPress={cancelCompose} style={styles.cancelBtn}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={save} style={styles.saveBtn}>
                  <Text style={text.button}>{editingId ? 'Save' : 'Add'}</Text>
                </Pressable>
              </View>
            </View>
          </Reanimated.View>
        )}

        <Reanimated.View style={{ marginTop: 14, gap: 10 }} layout={REFLOW}>
          {timed.length > 0 && anytime.length > 0 && <SectionRule label="At a time" />}
          {timed.map((t) => (
            <Row key={t.id} task={t} expanded={expanded === t.id} onExpand={setExpanded}
              onToggle={toggle} onEdit={startEdit} onMove={setMoving} onRemove={remove} onTickSubtask={tickSubtask} />
          ))}

          {timed.length > 0 && anytime.length > 0 && <SectionRule label="Anytime" />}
          {anytime.map((t) => (
            <Row key={t.id} task={t} expanded={expanded === t.id} onExpand={setExpanded}
              onToggle={toggle} onEdit={startEdit} onMove={setMoving} onRemove={remove} onTickSubtask={tickSubtask} />
          ))}

          {done.length > 0 && <SectionRule label={`Done (${done.length})`} faint />}
          {done.map((t) => (
            <Row key={t.id} task={t} expanded={expanded === t.id} onExpand={setExpanded}
              onToggle={toggle} onEdit={startEdit} onMove={setMoving} onRemove={remove} onTickSubtask={tickSubtask} />
          ))}

          {dayTasks.length === 0 && !composing && (
            <Pressable onPress={startAdd} style={styles.empty} accessibilityRole="button" accessibilityLabel="Add a task to this day">
              <Text style={styles.emptyText}>
                {selected < today ? 'Nothing was planned for this day.' : 'Nothing here. A clear day is allowed.'}
              </Text>
              <Text style={[styles.emptyText, { marginTop: 4, color: sage.primaryInk }]}>Tap to add something</Text>
            </Pressable>
          )}
        </Reanimated.View>
      </ScrollView>

      <MoveSheet task={moving} today={today} tasks={tasks} onMove={move} onClose={() => setMoving(null)} />
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

/** Seed the wheel from the current value, else the next whole hour. */
function seedTime(draftTime: string | null): Date {
  const d = new Date();
  if (draftTime) {
    const [h, m] = draftTime.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  } else {
    d.setHours(d.getHours() + 1, 0, 0, 0);
  }
  return d;
}

function SectionRule({ label, faint }: { label: string; faint?: boolean }) {
  return (
    <View style={styles.sectionRule}>
      <Text style={faint ? text.labelFaint : text.label}>{label}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

function Row({ task, expanded, onExpand, onToggle, onEdit, onMove, onRemove, onTickSubtask }: {
  task: Task;
  expanded: boolean;
  onExpand: (id: number | null) => void;
  onToggle: (id: number, e?: GestureResponderEvent) => void;
  onEdit: (t: Task) => void;
  onMove: (t: Task) => void;
  onRemove: (id: number) => void;
  onTickSubtask: (taskId: number, subtaskId: string) => void;
}) {
  const e = energy[toTier(task.energy)];
  const progress = subtaskProgress(task);

  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <Pressable
          onPress={(ev) => onToggle(task.id, ev)}
          style={[styles.checkbox, { borderColor: task.completed ? sage.primary : sage.ruleStrong, backgroundColor: task.completed ? sage.primary : sage.surface }]}
          hitSlop={6}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: task.completed }}
        >
          {task.completed && <Check size={13} color={sage.onPrimary} strokeWidth={3} />}
        </Pressable>

        <Pressable
          style={{ flex: 1, minWidth: 0 }}
          onPress={progress ? () => onExpand(expanded ? null : task.id) : undefined}
        >
          <Text style={[text.itemTitle, task.completed && styles.taskDone]}>{task.name}</Text>
          <View style={styles.rowMeta}>
            {task.dueTime && <Text style={[styles.dueAt, task.completed && { color: sage.fgFaint }]}>{formatDueTime(task.dueTime)}</Text>}
            <Text style={[styles.tag, { color: e.fg, backgroundColor: e.bg }]}>{e.label}</Text>
            {progress && (
              <Text style={[styles.tag, { color: sage.primaryDeep, backgroundColor: sage.fillGreen }]}>
                {progress.done}/{progress.total}
              </Text>
            )}
          </View>
        </Pressable>

        <View style={{ gap: 6 }}>
          {/*
            Move sits above edit, because on this screen it is the action
            people came for. A calendar you can only read is a calendar you
            stop opening once the plan has drifted.
          */}
          <Pressable onPress={() => onMove(task)} style={styles.miniBtn} hitSlop={4} accessibilityRole="button" accessibilityLabel="Move to another day">
            <CalendarDays size={13} color={sage.primaryInk} strokeWidth={2} />
          </Pressable>
          <Pressable onPress={() => onEdit(task)} style={styles.miniBtn} hitSlop={4} accessibilityRole="button" accessibilityLabel="Edit">
            <Pencil size={13} color={sage.fgFaint} strokeWidth={2} />
          </Pressable>
          <Pressable onPress={() => onRemove(task.id)} style={styles.miniBtn} hitSlop={4} accessibilityRole="button" accessibilityLabel="Delete">
            <X size={14} color={sage.fgFaint} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      {progress ? (
        <Pressable onPress={() => onExpand(expanded ? null : task.id)} style={styles.stepsToggle} hitSlop={6}>
          {expanded
            ? <ChevronDown size={14} color={sage.fgMuted} strokeWidth={2} />
            : <ChevronRight size={14} color={sage.fgMuted} strokeWidth={2} />}
          <Text style={text.meta}>{expanded ? 'Hide steps' : `${progress.total} steps`}</Text>
        </Pressable>
      ) : null}

      {expanded && task.subtasks ? (
        <View style={styles.subtaskList}>
          {task.subtasks.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => onTickSubtask(task.id, s.id)}
              style={styles.subtaskRow}
              hitSlop={4}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: s.done }}
            >
              <View style={[styles.subCheckbox, s.done && { backgroundColor: sage.primary, borderColor: sage.primary }]}>
                {s.done && <Check size={11} color={sage.onPrimary} strokeWidth={3} />}
              </View>
              <Text style={[styles.subtaskName, s.done && styles.taskDone]}>{s.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Styles
 * ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: sage.bg },
  scroll: { paddingHorizontal: gutter, paddingTop: 4, paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingBottom: 16 },
  backArrow: { fontFamily: font.headingBold, fontSize: 24, color: sage.fgSecondary, marginTop: -4 },
  iconBtn: { width: 40, height: 40, borderRadius: 15, alignItems: 'center', justifyContent: 'center', ...curve },
  iconBtnPrimary: { backgroundColor: sage.primary, ...shadow.soft },
  iconBtnPlain: { backgroundColor: sage.surface, ...shadow.soft },
  todayPill: { borderRadius: 13, paddingVertical: 9, paddingHorizontal: 15, backgroundColor: sage.fillGreen, ...curve },
  todayPillText: { fontFamily: font.heading, fontSize: 12.5, color: sage.primaryDeep },

  card: { backgroundColor: sage.surface, borderRadius: radius.cardLg, padding: 18, ...shadow.card, ...curve },

  /* Overdue */
  lateCard: {
    backgroundColor: sage.surface,
    borderRadius: radius.cardLg,
    padding: 18,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: sage.clay,
    ...shadow.card,
    ...curve,
  },
  lateRow: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: sage.rule },
  lateActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  lateBtn: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: sage.fillGreen, ...curve },
  lateBtnText: { fontFamily: font.heading, fontSize: 12, color: sage.primaryDeep },
  lateCheck: { width: 32, height: 32, borderRadius: 11, backgroundColor: sage.fill, alignItems: 'center', justifyContent: 'center', ...curve },

  /* Week strip */
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  monthNav: { width: 34, height: 34, borderRadius: 12, backgroundColor: sage.fill, alignItems: 'center', justifyContent: 'center', ...curve },
  monthArrow: { fontFamily: font.headingBold, fontSize: 18, color: sage.fgSecondary, marginTop: -2 },
  strip: { flexDirection: 'row' },
  stripCol: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 2 },
  stripDow: { fontFamily: font.bodySemi, fontSize: 10.5, color: sage.fgFaint },
  stripDay: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', ...curve },
  stripDayToday: { backgroundColor: sage.fillGreen },
  stripDaySel: { backgroundColor: sage.primary, ...shadow.soft },
  stripNum: { fontFamily: font.heading, fontSize: 14, color: sage.fgBody },
  loadTrack: { width: 22, height: 4, borderRadius: 2, overflow: 'hidden', flexDirection: 'row' },
  loadFill: { height: 4, borderRadius: 2, backgroundColor: sage.leaf },

  monthToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'center', marginTop: 14 },

  /* Month grid */
  gridHead: { flexDirection: 'row', marginBottom: 4 },
  gridHeadText: { flex: 1, textAlign: 'center', fontFamily: font.bodySemi, fontSize: 10.5, color: sage.fgFaint },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, paddingVertical: 2, paddingHorizontal: 2 },
  cellInner: { borderRadius: 12, paddingVertical: 6, alignItems: 'center', gap: 4, ...curve },
  cellNum: { fontFamily: font.heading, fontSize: 13, color: sage.fgBody },
  cellTrack: { width: 18, height: 3, borderRadius: 2, overflow: 'hidden', flexDirection: 'row' },

  /* Selected day */
  dayHead: { marginTop: 22, marginHorizontal: 2 },
  heavyNote: { fontFamily: font.body, fontSize: 13, lineHeight: 19, color: sage.clay, marginTop: 6 },

  /* Composer */
  composerInput: { fontFamily: font.heading, fontSize: 15, color: sage.fgBody, padding: 2 },
  energyPicker: { flexDirection: 'row', gap: 7, marginTop: 14 },
  pickerBtn: { flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center', ...curve },
  pickerText: { fontFamily: font.bodySemi, fontSize: 11.5, letterSpacing: 0.6, textTransform: 'uppercase' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  timeBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: sage.fillAlt, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, ...curve },
  timeBtnText: { fontFamily: font.heading, fontSize: 12.5, color: sage.fgFaint },
  timeClear: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: sage.fillAlt, ...curve },
  pickerDone: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 14 },
  pickerDoneText: { fontFamily: font.heading, fontSize: 13, color: sage.primaryDeep },
  composerActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  cancelBtn: { borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: sage.fillAlt, ...curve },
  cancelText: { fontFamily: font.heading, fontSize: 12.5, color: sage.fgFaint },
  saveBtn: { marginLeft: 'auto', borderRadius: 13, paddingVertical: 10, paddingHorizontal: 22, backgroundColor: sage.primary, ...curve },

  /* Rows */
  sectionRule: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 2, marginHorizontal: 2 },
  sectionLine: { flex: 1, height: 1, backgroundColor: sage.ruleStrong },
  row: { backgroundColor: sage.surface, borderRadius: radius.card, padding: 14, paddingLeft: 16, ...shadow.soft, ...curve },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  checkbox: { width: 26, height: 26, marginTop: 2, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  taskDone: { color: sage.fgFaint, textDecorationLine: 'line-through' },
  dueAt: { fontFamily: font.heading, fontSize: 11.5, color: sage.primaryDeep },
  tag: { fontFamily: font.bodySemi, fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  miniBtn: { width: 28, height: 28, borderRadius: 10, backgroundColor: sage.fill, alignItems: 'center', justifyContent: 'center', ...curve },
  stepsToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, marginLeft: 40 },
  subtaskList: { marginTop: 8, marginLeft: 40, gap: 2 },
  subtaskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  subCheckbox: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: sage.ruleStrong, backgroundColor: sage.surface, alignItems: 'center', justifyContent: 'center' },
  subtaskName: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: sage.fgBody, flex: 1 },

  empty: { backgroundColor: sage.surface, borderRadius: 20, padding: 22, alignItems: 'center', ...shadow.soft, ...curve },
  emptyText: { fontFamily: font.body, fontSize: 13, color: sage.fgFaint, textAlign: 'center' },
});
