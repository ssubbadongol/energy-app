import { Check, Minus, Pencil, Plus } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { curve, font, gutter, radius, sage, shadow, text } from '@/theme/sage';

/* ------------------------------------------------------------------ *
 * Local placeholder state (UI-first — wire to lifeTaskStorage later)
 * ------------------------------------------------------------------ */

type Section = 'morning' | 'midday' | 'evening';

interface LifeItem {
  id: string;
  sec: Section;
  emoji: string;
  name: string;
  start: number;
  end: number;
  on: boolean;
  reps: number;
  count: number;
}

const SECTIONS: { key: Section; title: string; hours: string }[] = [
  { key: 'morning', title: 'Morning Basics', hours: '6–10 AM' },
  { key: 'midday', title: 'Midday Check-in', hours: '12–3 PM' },
  { key: 'evening', title: 'Evening Wind-down', hours: '5–11 PM' },
];

const EMOJIS = ['💧', '🍽', '🚶', '🏃', '😴', '🚿', '💊', '🌱', '🧹', '📚'];

const SEED: LifeItem[] = [
  { id: 'l1', sec: 'morning', emoji: '🚿', name: 'Shower', start: 6, end: 10, on: true, reps: 1, count: 0 },
  { id: 'l2', sec: 'morning', emoji: '🍳', name: 'Breakfast', start: 7, end: 10, on: true, reps: 1, count: 0 },
  { id: 'l3', sec: 'morning', emoji: '💊', name: 'Take meds', start: 8, end: 9, on: true, reps: 2, count: 0 },
  { id: 'l4', sec: 'morning', emoji: '💧', name: 'Drink water', start: 6, end: 12, on: true, reps: 3, count: 1 },
  { id: 'l5', sec: 'midday', emoji: '🍽', name: 'Eat lunch', start: 12, end: 14, on: true, reps: 1, count: 0 },
  { id: 'l6', sec: 'midday', emoji: '💧', name: 'Drink water', start: 12, end: 17, on: true, reps: 3, count: 0 },
  { id: 'l7', sec: 'midday', emoji: '🚶', name: 'Take a walk', start: 13, end: 15, on: false, reps: 1, count: 0 },
  { id: 'l8', sec: 'evening', emoji: '🏃', name: 'Exercise', start: 17, end: 19, on: false, reps: 1, count: 0 },
  { id: 'l9', sec: 'evening', emoji: '💧', name: 'Water plants', start: 18, end: 19, on: true, reps: 1, count: 0 },
  { id: 'l10', sec: 'evening', emoji: '😴', name: 'Wind down', start: 21, end: 23, on: true, reps: 1, count: 0 },
];

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

const EMPTY_DRAFT = { name: '', emoji: '💧', sec: 'morning' as Section, start: 9, end: 11, reps: 1 };

export default function LifeScreen() {
  const [items, setItems] = useState<LifeItem[]>(SEED);
  const [setup, setSetup] = useState(true);
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
  const [editingId, setEditingId] = useState<string | null>(null);

  const enabled = items.filter((i) => i.on);
  const lifeDone = enabled.filter((i) => i.count >= i.reps).length;
  const lifePct = enabled.length ? Math.round((lifeDone / enabled.length) * 100) : 0;

  const toggleOn = (id: string) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, on: !x.on } : x)));
  const tap = (id: string) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, count: x.count >= x.reps ? 0 : x.count + 1 } : x)));

  const editItem = (i: LifeItem) => {
    setEditingId(i.id);
    setDraft({ name: i.name, emoji: i.emoji, sec: i.sec, start: i.start, end: i.end, reps: i.reps });
  };
  const cancelEdit = () => { setEditingId(null); setDraft({ ...EMPTY_DRAFT }); };
  const removeItem = () => {
    if (!editingId) return;
    setItems((xs) => xs.filter((x) => x.id !== editingId));
    cancelEdit();
  };
  const saveItem = () => {
    if (!draft.name.trim()) return;
    if (editingId) {
      setItems((xs) => xs.map((x) => (x.id === editingId ? { ...x, name: draft.name.trim(), emoji: draft.emoji, sec: draft.sec, start: draft.start, end: draft.end, reps: draft.reps, count: Math.min(x.count, draft.reps) } : x)));
      cancelEdit();
    } else {
      setItems((xs) => [...xs, { id: 'c' + Date.now(), sec: draft.sec, emoji: draft.emoji, name: draft.name.trim(), start: draft.start, end: draft.end, on: true, reps: draft.reps, count: 0 }]);
      setDraft({ ...EMPTY_DRAFT, sec: draft.sec });
    }
  };

  const setStart = (v: number) => setDraft((d) => ({ ...d, start: Math.max(0, Math.min(23, v)), end: Math.max(v + 1, d.end) }));
  const setEnd = (v: number) => setDraft((d) => ({ ...d, end: Math.max(1, Math.min(24, v)), start: Math.min(v - 1, d.start) }));

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.tintBand} pointerEvents="none" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {setup ? (
          <>
            <View style={{ paddingVertical: 8, paddingBottom: 16 }}>
              <Text style={text.title}>Set up Life</Text>
              <Text style={[text.body, { marginTop: 6, maxWidth: 260 }]}>Pick which apply to you. Everything else stays off — you can change this any time.</Text>
            </View>

            {/* toggle list */}
            <View style={[styles.card, { paddingVertical: 8, paddingHorizontal: 16 }]}>
              {items.map((i, idx) => (
                <View key={i.id} style={[styles.setupRow, idx === items.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={styles.emoji}>{i.emoji}</Text>
                  <View style={{ flex: 1, minWidth: 0, opacity: i.on ? 1 : 0.5 }}>
                    <Text style={styles.setupName}>{i.name}</Text>
                    <Text style={styles.setupWindow}>{i.reps > 1 ? `${windowLabel(i.start, i.end)} · ${i.reps}× a day` : windowLabel(i.start, i.end)}</Text>
                  </View>
                  <Pressable onPress={() => editItem(i)} style={[styles.editBtn, editingId === i.id && { backgroundColor: sage.fillGreen }]} hitSlop={4}>
                    <Pencil size={13} color={editingId === i.id ? sage.primaryDeep : sage.fgFaint} strokeWidth={2} />
                  </Pressable>
                  <Pressable onPress={() => toggleOn(i.id)} style={[styles.track, { backgroundColor: i.on ? sage.leaf : sage.track, alignItems: i.on ? 'flex-end' : 'flex-start' }]}>
                    <View style={styles.knob} />
                  </Pressable>
                </View>
              ))}
            </View>

            {/* add / edit form */}
            <View style={[styles.card, { marginTop: 14 }]}>
              <Text style={[text.labelFaint, { marginBottom: 12 }]}>{editingId ? 'Edit routine item' : 'Add your own'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={styles.emojiLg}>{draft.emoji}</Text>
                <TextInput
                  value={draft.name}
                  onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
                  placeholder="e.g. Stretch by the window"
                  placeholderTextColor={sage.fgFaint}
                  style={styles.input}
                />
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

              {/* time window */}
              <View style={{ marginTop: 18 }}>
                <View style={styles.stepperRow}>
                  <Text style={styles.stepperLabel}>Time window</Text>
                  <Text style={styles.stepperValue}>{windowLabel(draft.start, draft.end)}</Text>
                </View>
                <View style={styles.stepper}>
                  <Text style={styles.stepperCap}>starts</Text>
                  <Stepper onDec={() => setStart(draft.start - 1)} onInc={() => setStart(draft.start + 1)} value={hourLabel(draft.start)} />
                  <Text style={styles.stepperCap}>ends</Text>
                  <Stepper onDec={() => setEnd(draft.end - 1)} onInc={() => setEnd(draft.end + 1)} value={hourLabel(draft.end)} />
                </View>
              </View>

              {/* reps */}
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

            {SECTIONS.map((s) => {
              const secItems = items.filter((i) => i.sec === s.key && i.on);
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
                      const full = i.count >= i.reps;
                      return (
                        <Pressable key={i.id} onPress={() => tap(i.id)} style={[styles.dailyRow, idx === secItems.length - 1 && { borderBottomWidth: 0 }]}>
                          <View style={[styles.checkCircle, { borderColor: full ? sage.primary : sage.ruleStrong, backgroundColor: full ? sage.primary : sage.surface }]}>
                            {full && <Check size={12} color={sage.onPrimary} strokeWidth={3} />}
                          </View>
                          <Text style={styles.emoji}>{i.emoji}</Text>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.dailyName, full && { color: sage.fgFaint, textDecorationLine: 'line-through' }]}>{i.name}</Text>
                            <Text style={styles.setupWindow}>{windowLabel(i.start, i.end)}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
                            {Array.from({ length: i.reps }).map((_, n) => (
                              <View key={n} style={[styles.repDot, { backgroundColor: n < i.count ? sage.primary : sage.track }]} />
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
      </ScrollView>
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
  tintBand: { position: 'absolute', top: 0, left: 0, right: 0, height: 200, backgroundColor: sage.bgTintTop, opacity: 0.45 },
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
});
