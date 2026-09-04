import { useFocusEffect } from 'expo-router';
import { Check, Minus, Pencil, Plus } from 'lucide-react-native';
import React, { useCallback, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SageBackground } from '@/components/sage/Background';
import {
  addLifeTask,
  deleteLifeTask,
  getLifeTasks,
  initializeLifeTasks,
  type LifeTask,
  type TimeOfDay,
  toggleLifeTaskCompleted,
  toggleLifeTaskEnabled,
  updateLifeTask,
} from '../lifeTaskStorage';
import { curve, font, gutter, radius, sage, shadow, text } from '@/theme/sage';

const SECTIONS: { key: TimeOfDay; title: string; hours: string }[] = [
  { key: 'morning', title: 'Morning Basics', hours: '6–10 AM' },
  { key: 'midday', title: 'Midday Check-in', hours: '12–3 PM' },
  { key: 'evening', title: 'Evening Wind-down', hours: '5–11 PM' },
];

const EMOJIS = ['💧', '🍽', '🚶', '🏃', '😴', '🚿', '💊', '🌱', '🧹', '📚'];

const hourLabel = (h: number) => {
  const hh = ((h % 24) + 24) % 24;
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const base = hh % 12 === 0 ? 12 : hh % 12;
  return `${base} ${ampm}`;
};
const windowLabel = (a: number, b: number) => {
  const sa = hourLabel(a);
  const sb = hourLabel(b);
  if (sa.slice(-2) === sb.slice(-2)) return `${sa.replace(' ' + sa.slice(-2), '')}–${sb}`;
  return `${sa}–${sb}`;
};

const EMPTY_DRAFT = { name: '', emoji: '💧', sec: 'morning' as TimeOfDay, start: 9, end: 11, reps: 1 };

export default function LifeScreen() {
  const [items, setItems] = useState<LifeTask[]>([]);
  const [setup, setSetup] = useState(false);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [windowTouched, setWindowTouched] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  const refresh = useCallback(() => setItems([...getLifeTasks()]), []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      initializeLifeTasks().then((loaded) => {
        if (!alive) return;
        setItems([...loaded]);
        // First run (nothing enabled yet) opens straight into setup.
        if (!ready) {
          setSetup(loaded.every((i) => !i.enabled));
          setReady(true);
        }
      });
      return () => { alive = false; };
    }, [ready]),
  );

  const enabled = items.filter((i) => i.enabled);
  const lifeDone = enabled.filter((i) => i.completed).length;
  const lifePct = enabled.length ? Math.round((lifeDone / enabled.length) * 100) : 0;

  const toggleOn = async (id: string) => { await toggleLifeTaskEnabled(id); refresh(); };
  const tap = async (id: string) => { await toggleLifeTaskCompleted(id); refresh(); };

  const editItem = (i: LifeTask) => {
    setEditingId(i.id);
    setWindowTouched(false);
    setDraft({ name: i.name, emoji: i.emoji, sec: i.timeOfDay, start: 9, end: 11, reps: i.repeats && i.repeats > 1 ? i.repeats : 1 });
  };
  const cancelEdit = () => { setEditingId(null); setWindowTouched(false); setDraft({ ...EMPTY_DRAFT }); };
  const removeItem = async () => {
    if (!editingId) return;
    await deleteLifeTask(editingId);
    cancelEdit();
    refresh();
  };
  const saveItem = async () => {
    if (!draft.name.trim()) return;
    if (editingId) {
      const existing = items.find((i) => i.id === editingId);
      await updateLifeTask(editingId, {
        name: draft.name.trim(),
        emoji: draft.emoji,
        timeOfDay: draft.sec,
        timeWindow: windowTouched || !existing ? windowLabel(draft.start, draft.end) : existing.timeWindow,
        repeats: draft.reps > 1 ? draft.reps : undefined,
      });
      cancelEdit();
    } else {
      await addLifeTask({
        emoji: draft.emoji,
        name: draft.name.trim(),
        timeWindow: windowLabel(draft.start, draft.end),
        timeOfDay: draft.sec,
        enabled: true,
        isDefault: false,
        repeats: draft.reps > 1 ? draft.reps : undefined,
      });
      setDraft({ ...EMPTY_DRAFT, sec: draft.sec });
    }
    refresh();
  };

  const setStart = (v: number) => { setWindowTouched(true); setDraft((d) => ({ ...d, start: Math.max(0, Math.min(23, v)), end: Math.max(v + 1, d.end) })); };
  const setEnd = (v: number) => { setWindowTouched(true); setDraft((d) => ({ ...d, end: Math.max(1, Math.min(24, v)), start: Math.min(v - 1, d.start) })); };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <SageBackground scrollY={scrollY} />
      <Animated.ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
      >
        {setup ? (
          <>
            <View style={{ paddingVertical: 8, paddingBottom: 16 }}>
              <Text style={text.title}>Set up Life</Text>
              <Text style={[text.body, { marginTop: 6, maxWidth: 260 }]}>Pick which apply to you. Everything else stays off — you can change this any time.</Text>
            </View>

            <View style={[styles.card, { paddingVertical: 8, paddingHorizontal: 16 }]}>
              {items.map((i, idx) => (
                <View key={i.id} style={[styles.setupRow, idx === items.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={styles.emoji}>{i.emoji}</Text>
                  <View style={{ flex: 1, minWidth: 0, opacity: i.enabled ? 1 : 0.5 }}>
                    <Text style={styles.setupName}>{i.name}</Text>
                    <Text style={styles.setupWindow}>{i.repeats && i.repeats > 1 ? `${i.timeWindow} · ${i.repeats}× a day` : i.timeWindow}</Text>
                  </View>
                  <Pressable onPress={() => editItem(i)} style={[styles.editBtn, editingId === i.id && { backgroundColor: sage.fillGreen }]} hitSlop={4}>
                    <Pencil size={13} color={editingId === i.id ? sage.primaryDeep : sage.fgFaint} strokeWidth={2} />
                  </Pressable>
                  <Pressable onPress={() => toggleOn(i.id)} style={[styles.track, { backgroundColor: i.enabled ? sage.leaf : sage.track, alignItems: i.enabled ? 'flex-end' : 'flex-start' }]}>
                    <View style={styles.knob} />
                  </Pressable>
                </View>
              ))}
            </View>

            <View style={[styles.card, { marginTop: 14 }]}>
              <Text style={[text.labelFaint, { marginBottom: 12 }]}>{editingId ? 'Edit routine item' : 'Add your own'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={styles.emojiLg}>{draft.emoji}</Text>
                <TextInput value={draft.name} onChangeText={(name) => setDraft((d) => ({ ...d, name }))} placeholder="e.g. Stretch by the window" placeholderTextColor={sage.fgFaint} style={styles.input} />
              </View>

              <View style={styles.emojiWrap}>
                {EMOJIS.map((c) => (
                  <Pressable key={c} onPress={() => setDraft((d) => ({ ...d, emoji: c }))} style={[styles.emojiBtn, draft.emoji === c && { backgroundColor: sage.fillGreen }]}>
                    <Text style={{ fontSize: 17 }}>{c}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.pickerRow}>
                {SECTIONS.map((s) => {
                  const on = draft.sec === s.key;
                  return (
                    <Pressable key={s.key} onPress={() => setDraft((d) => ({ ...d, sec: s.key }))} style={[styles.pickerBtn, { backgroundColor: on ? sage.fillGreen : sage.fillAlt }]}>
                      <Text style={[styles.pickerText, { color: on ? sage.primaryDeep : sage.fgFaint }]}>{s.title.split(' ')[0]}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ marginTop: 18 }}>
                <View style={styles.stepperRow}>
                  <Text style={styles.stepperLabel}>Time window</Text>
                  <Text style={styles.stepperValue}>{editingId && !windowTouched ? (items.find((i) => i.id === editingId)?.timeWindow ?? windowLabel(draft.start, draft.end)) : windowLabel(draft.start, draft.end)}</Text>
                </View>
                <View style={styles.stepper}>
                  <Text style={styles.stepperCap}>starts</Text>
                  <Stepper onDec={() => setStart(draft.start - 1)} onInc={() => setStart(draft.start + 1)} value={hourLabel(draft.start)} />
                  <Text style={styles.stepperCap}>ends</Text>
                  <Stepper onDec={() => setEnd(draft.end - 1)} onInc={() => setEnd(draft.end + 1)} value={hourLabel(draft.end)} />
                </View>
              </View>

              <View style={styles.repsRow}>
                <Text style={styles.stepperLabel}>Times a day</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginLeft: 'auto' }}>
                  {[1, 2, 3, 4].map((n) => {
                    const on = draft.reps === n;
                    return (
                      <Pressable key={n} onPress={() => setDraft((d) => ({ ...d, reps: n }))} style={[styles.repBtn, { backgroundColor: on ? sage.primary : sage.fillAlt }]}>
                        <Text style={{ fontFamily: font.heading, fontSize: 13, color: on ? sage.onPrimary : sage.fgFaint }}>{n}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Pressable onPress={saveItem} style={styles.addBtn}>
                <Text style={{ fontFamily: font.heading, fontSize: 13.5, color: sage.primaryInk }}>{editingId ? 'Save changes' : 'Add to routine'}</Text>
              </Pressable>
              {editingId && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <Pressable onPress={cancelEdit} style={[styles.formAction, { backgroundColor: sage.fillAlt }]}><Text style={{ fontFamily: font.heading, fontSize: 13, color: sage.fgFaint }}>Cancel</Text></Pressable>
                  <Pressable onPress={removeItem} style={[styles.formAction, { backgroundColor: sage.dangerFill }]}><Text style={{ fontFamily: font.heading, fontSize: 13, color: sage.danger }}>Remove from routine</Text></Pressable>
                </View>
              )}
            </View>

            <Pressable onPress={() => setSetup(false)} style={styles.primaryBtn}>
              <Text style={text.button}>Save my routine</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.header}>
              <View>
                <Text style={text.title}>Life</Text>
                <Text style={[text.body, { marginTop: 4 }]}>{lifeDone} of {enabled.length} today · basics only</Text>
              </View>
              <Pressable onPress={() => setSetup(true)} style={styles.editPill}><Text style={styles.editPillText}>Edit</Text></Pressable>
            </View>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${lifePct}%` }]} />
            </View>

            {enabled.length === 0 && (
              <View style={styles.empty}><Text style={styles.emptyText}>No routine yet. Tap Edit to pick what applies to you.</Text></View>
            )}

            {SECTIONS.map((s) => {
              const secItems = items.filter((i) => i.timeOfDay === s.key && i.enabled);
              if (secItems.length === 0) return null;
              return (
                <View key={s.key} style={{ marginBottom: 18 }}>
                  <View style={styles.sectionRule}>
                    <Text style={text.label}>{s.title}</Text>
                    <View style={styles.sectionLine} />
                    <Text style={text.meta}>{s.hours}</Text>
                  </View>
                  <View style={[styles.card, { paddingVertical: 6, paddingHorizontal: 16, marginBottom: 0 }]}>
                    {secItems.map((i, idx) => {
                      const reps = i.repeats && i.repeats > 1 ? i.repeats : 1;
                      const full = i.completed;
                      return (
                        <Pressable key={i.id} onPress={() => tap(i.id)} style={[styles.dailyRow, idx === secItems.length - 1 && { borderBottomWidth: 0 }]}>
                          <View style={[styles.checkCircle, { borderColor: full ? sage.primary : sage.ruleStrong, backgroundColor: full ? sage.primary : sage.surface }]}>
                            {full && <Check size={12} color={sage.onPrimary} strokeWidth={3} />}
                          </View>
                          <Text style={styles.emoji}>{i.emoji}</Text>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.dailyName, full && { color: sage.fgFaint, textDecorationLine: 'line-through' }]}>{i.name}</Text>
                            <Text style={styles.setupWindow}>{i.timeWindow}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
                            {Array.from({ length: reps }).map((_, n) => (
                              <View key={n} style={[styles.repDot, { backgroundColor: n < i.completedCount ? sage.primary : sage.track }]} />
                            ))}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </>
        )}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

function Stepper({ value, onInc, onDec }: { value: string; onInc: () => void; onDec: () => void }) {
  return (
    <View style={styles.stepperCtrl}>
      <Pressable onPress={onDec} style={styles.stepperBtn} hitSlop={4}><Minus size={14} color={sage.primaryInk} strokeWidth={2.5} /></Pressable>
      <Text style={styles.stepperNum}>{value}</Text>
      <Pressable onPress={onInc} style={styles.stepperBtn} hitSlop={4}><Plus size={14} color={sage.primaryInk} strokeWidth={2.5} /></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: sage.bg },
  scroll: { paddingHorizontal: gutter, paddingTop: 4, paddingBottom: 32 },

  card: { backgroundColor: sage.surface, borderRadius: radius.cardLg, padding: 18, ...shadow.card, ...curve, marginBottom: 14 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8, paddingBottom: 16, gap: 10 },
  editPill: { borderRadius: 13, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: sage.surface, ...shadow.soft, ...curve },
  editPillText: { fontFamily: font.heading, fontSize: 12.5, color: sage.fgSecondary },

  progressTrack: { height: 8, borderRadius: 4, backgroundColor: sage.track, overflow: 'hidden', marginBottom: 18 },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: sage.leaf },

  sectionRule: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 2, marginBottom: 10 },
  sectionLine: { flex: 1, height: 1, backgroundColor: sage.ruleStrong },

  setupRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: sage.rule },
  emoji: { fontSize: 18 },
  emojiLg: { fontSize: 20 },
  setupName: { fontFamily: font.heading, fontSize: 14.5, color: sage.fgBody },
  setupWindow: { fontFamily: font.body, fontSize: 11.5, color: sage.fgFaint, marginTop: 2 },
  editBtn: { width: 30, height: 30, borderRadius: 11, backgroundColor: sage.fill, alignItems: 'center', justifyContent: 'center', ...curve },
  track: { width: 44, height: 26, borderRadius: 13, padding: 3, justifyContent: 'center' },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: sage.surface, ...shadow.soft },

  input: { flex: 1, fontFamily: font.heading, fontSize: 15, color: sage.fgBody, padding: 2 },
  emojiWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  emojiBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: sage.fillAlt, alignItems: 'center', justifyContent: 'center', ...curve },
  pickerRow: { flexDirection: 'row', gap: 7, marginTop: 14 },
  pickerBtn: { flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center', ...curve },
  pickerText: { fontFamily: font.bodySemi, fontSize: 11.5, letterSpacing: 0.5, textTransform: 'uppercase' },

  stepperRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  stepperLabel: { fontFamily: font.heading, fontSize: 12.5, color: sage.primaryInk },
  stepperValue: { fontFamily: font.heading, fontSize: 13, color: sage.primaryDeep },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  stepperCap: { fontFamily: font.body, fontSize: 11, color: sage.fgFaint },
  stepperCtrl: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: sage.fillAlt, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 4, ...curve },
  stepperBtn: { width: 26, height: 26, borderRadius: 9, backgroundColor: sage.surface, alignItems: 'center', justifyContent: 'center', ...curve },
  stepperNum: { fontFamily: font.heading, fontSize: 13, color: sage.fgBody, minWidth: 46, textAlign: 'center' },
  repsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  repBtn: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', ...curve },

  addBtn: { marginTop: 16, borderWidth: 1.5, borderColor: sage.ruleStrong, borderStyle: 'dashed', borderRadius: 16, paddingVertical: 13, alignItems: 'center', backgroundColor: sage.fillAlt },
  formAction: { flex: 1, borderRadius: 16, paddingVertical: 13, alignItems: 'center', ...curve },
  primaryBtn: { marginTop: 16, borderRadius: 22, paddingVertical: 17, alignItems: 'center', backgroundColor: sage.primary, ...shadow.card, ...curve },

  dailyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: sage.rule },
  checkCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dailyName: { fontFamily: font.heading, fontSize: 14.5, color: sage.fgBody },
  repDot: { width: 9, height: 9, borderRadius: 4.5 },

  empty: { backgroundColor: sage.surface, borderRadius: 20, padding: 22, alignItems: 'center', ...shadow.soft, ...curve, marginBottom: 14 },
  emptyText: { fontFamily: font.body, fontSize: 13, color: sage.fgFaint, textAlign: 'center' },
});
