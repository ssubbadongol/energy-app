import { useFocusEffect } from 'expo-router';
import { Check, Pencil, Plus, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { SageBackground } from '@/components/sage/Background';
import {
  addTask,
  deleteTask,
  getSharedTasks,
  initializeTasks,
  type Task,
  toggleTaskCompletion,
  updateTask,
} from '../taskStorage';
import { loadUserProfile } from '../userProfileStorage';
import { curve, energy, energyInsight, type EnergyKey, font, gutter, radius, sage, shadow, text } from '@/theme/sage';

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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FILTERS: ('All' | 'High' | 'Mid' | 'Low')[] = ['All', 'High', 'Mid', 'Low'];
const FILL_PCT: Record<EnergyKey, `${number}%`> = { low: '34%', mid: '67%', high: '100%' };

export default function TodayScreen() {
  const today = iso(new Date());
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

  const toggle = async (id: number) => { await toggleTaskCompletion(id); refresh(); };
  const remove = async (id: number) => {
    await deleteTask(id);
    if (pinnedId === id) setPinnedId(null);
    refresh();
  };
  const startAdd = () => { setComposing(true); setEditingId(null); setDraft(''); setDraftEnergy(selectedEnergy); };
  const startEdit = (t: Task) => { setComposing(true); setEditingId(t.id); setDraft(t.name); setDraftEnergy(toTier(t.energy)); };
  const saveTask = async () => {
    const name = draft.trim();
    if (!name) return;
    if (editingId) {
      await updateTask(editingId, { name, energy: fromTier(draftEnergy), priority: fromTier(draftEnergy) });
    } else {
      const date = calendarOpen ? selected : today;
      await addTask({ name, energy: fromTier(draftEnergy), priority: fromTier(draftEnergy), time: 0, type: 'Task', completed: false, dueDate: `${date}T12:00:00` });
    }
    setComposing(false); setEditingId(null); setDraft(''); refresh();
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
            composer={composing ? <Composer {...{ editingId, draft, setDraft, draftEnergy, setDraftEnergy, saveTask, onCancel: () => setComposing(false) }} /> : null}
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
              </View>
            </View>

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

            <View style={[styles.card, styles.progressCard]}>
              <ProgressRing pct={pct} />
              <View style={{ flex: 1 }}>
                <Text style={text.cardTitle}>{done} of {todays.length} done today</Text>
                <Text style={[text.meta, { marginTop: 2 }]}>No streaks, no pressure.</Text>
              </View>
              <Text style={styles.pctText}>{pct}%</Text>
            </View>

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

            {composing && <Composer {...{ editingId, draft, setDraft, draftEnergy, setDraftEnergy, saveTask, onCancel: () => setComposing(false) }} />}

            {matched.length > 0 && (
              <>
                <SectionRule label="Matched to your energy" />
                <View style={{ gap: 10 }}>
                  {matched.map((t) => <TaskCard key={t.id} task={t} pinned={t.id === pinnedId} onToggle={toggle} onEdit={startEdit} onRemove={remove} onPin={setPinnedId} />)}
                </View>
              </>
            )}

            {rest.length > 0 && (
              <>
                <SectionRule label={matched.length ? 'Everything else' : 'All tasks'} />
                <View style={{ gap: 10 }}>
                  {rest.map((t) => <TaskCard key={t.id} task={t} pinned={t.id === pinnedId} onToggle={toggle} onEdit={startEdit} onRemove={remove} onPin={setPinnedId} />)}
                </View>
              </>
            )}

            {todays.length === 0 && (
              <View style={styles.empty}><Text style={styles.emptyText}>Nothing today. A clear day is allowed.</Text></View>
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

function TaskCard({ task, pinned, onToggle, onEdit, onRemove, onPin }: {
  task: Task; pinned: boolean;
  onToggle: (id: number) => void; onEdit: (t: Task) => void; onRemove: (id: number) => void; onPin: (id: number | null) => void;
}) {
  const e = energy[toTier(task.energy)];
  return (
    <View style={styles.taskCard}>
      <Pressable onPress={() => onToggle(task.id)} style={[styles.checkbox, { borderColor: task.completed ? sage.primary : sage.ruleStrong, backgroundColor: task.completed ? sage.primary : sage.surface }]} hitSlop={6}>
        {task.completed && <Check size={13} color={sage.onPrimary} strokeWidth={3} />}
      </Pressable>
      <Pressable style={{ flex: 1, minWidth: 0 }} onLongPress={() => onPin(pinned ? null : task.id)}>
        <Text style={[text.itemTitle, task.completed && styles.taskDone]}>{task.name}</Text>
        <View style={styles.taskMetaRow}>
          <Text style={[styles.tag, { color: e.fg, backgroundColor: e.bg }]}>{e.label}</Text>
          <Text style={text.meta}>{metaFor(task)}</Text>
          {pinned && <Text style={[styles.tag, { color: sage.primaryDeep, backgroundColor: sage.fillGreen }]}>Pinned</Text>}
        </View>
      </Pressable>
      <View style={{ gap: 6 }}>
        <Pressable onPress={() => onEdit(task)} style={styles.miniBtn} hitSlop={4}><Pencil size={13} color={sage.fgFaint} strokeWidth={2} /></Pressable>
        <Pressable onPress={() => onRemove(task.id)} style={styles.miniBtn} hitSlop={4}><X size={14} color={sage.fgFaint} strokeWidth={2} /></Pressable>
      </View>
    </View>
  );
}

function Composer({ editingId, draft, setDraft, draftEnergy, setDraftEnergy, saveTask, onCancel }: {
  editingId: number | null; draft: string; setDraft: (s: string) => void;
  draftEnergy: EnergyKey; setDraftEnergy: (k: EnergyKey) => void; saveTask: () => void; onCancel: () => void;
}) {
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
      <View style={styles.composerActions}>
        <Pressable onPress={onCancel} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></Pressable>
        <Pressable onPress={saveTask} style={styles.saveBtn}><Text style={text.button}>{editingId ? 'Save' : 'Add'}</Text></Pressable>
      </View>
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

  taskCard: { backgroundColor: sage.surface, borderRadius: radius.card, padding: 14, paddingLeft: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 14, ...shadow.soft, ...curve },
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
