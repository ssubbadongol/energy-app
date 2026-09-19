/**
 * Give a task a different day.
 *
 * This is the single most-used control on the calendar, and that is the whole
 * design brief. Rescheduling is not an edge case for this audience — it is the
 * normal operation of a week. If moving something costs four taps and a date
 * picker, it does not get moved; it stays where it is, quietly rotting, until
 * the list is untrustworthy enough to abandon. So the two answers that cover
 * most of real life are one tap each, and the grid behind them exists for the
 * rest.
 *
 * The grid shows each day's load, because the most common way rescheduling
 * fails is dumping four things onto a Thursday that already had four.
 */
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { haptic } from '@/components/primitives/usePressScale';
import { curve, font, gutter, radius, sage, text } from '@/theme/sage';
import type { Task } from '@/app/taskStorage';
import {
  addDays,
  dayLoad,
  type DayKey,
  MONTHS,
  monthGrid,
  parseDay,
  relativeDay,
  WEEKDAYS,
} from '@/app/taskSchedule';

interface Props {
  /** The task being moved, or `null` when the sheet is closed. */
  task: Task | null;
  today: DayKey;
  /** Every task, so the grid can show what each day is already carrying. */
  tasks: Task[];
  onMove: (key: DayKey) => void;
  onClose: () => void;
}

export function MoveSheet({ task, today, tasks, onMove, onClose }: Props) {
  const [monthOffset, setMonthOffset] = useState(0);

  if (!task) return null;

  const base = parseDay(today);
  const shown = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1, 12);
  const cells = monthGrid(shown.getFullYear(), shown.getMonth());

  const pick = (key: DayKey) => {
    haptic('light');
    onMove(key);
    setMonthOffset(0);
  };

  const close = () => {
    setMonthOffset(0);
    onClose();
  };

  /**
   * "Saturday" rather than a third date button. Weekend work is its own kind
   * of plan, and it is the answer people reach for when a weekday has failed
   * twice. Skipped when today already is the weekend, where it would mean
   * "now" and add nothing.
   */
  const dow = base.getDay();
  const weekendKey = dow === 0 || dow === 6 ? null : addDays(today, 6 - dow);

  const quick: { label: string; key: DayKey }[] = [
    { label: 'Today', key: today },
    { label: 'Tomorrow', key: addDays(today, 1) },
    ...(weekendKey ? [{ label: 'Saturday', key: weekendKey }] : []),
    { label: 'Next week', key: addDays(today, 7) },
  ];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.grab} />

        <Text style={[text.title, { fontSize: 19 }]}>Move this to…</Text>
        <Text style={[text.body, { marginTop: 4 }]} numberOfLines={2}>{task.name}</Text>

        <View style={styles.quickRow}>
          {quick.map((q) => (
            <Pressable
              key={q.label}
              onPress={() => pick(q.key)}
              style={styles.quickBtn}
              accessibilityRole="button"
              accessibilityLabel={`Move to ${q.label}`}
            >
              <Text style={styles.quickText}>{q.label}</Text>
            </Pressable>
          ))}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 6 }}>
          <View style={styles.monthRow}>
            <Pressable onPress={() => setMonthOffset((n) => n - 1)} style={styles.monthNav} hitSlop={8}>
              <Text style={styles.monthArrow}>‹</Text>
            </Pressable>
            <Text style={text.h2}>{MONTHS[shown.getMonth()]} {shown.getFullYear()}</Text>
            <Pressable onPress={() => setMonthOffset((n) => n + 1)} style={styles.monthNav} hitSlop={8}>
              <Text style={styles.monthArrow}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((d) => <Text key={d} style={styles.weekday}>{d[0]}</Text>)}
          </View>

          <View style={styles.grid}>
            {cells.map((key, i) => {
              if (!key) return <View key={`e${i}`} style={styles.cell} />;
              const load = dayLoad(tasks, key, today);
              const isToday = key === today;
              const past = key < today;
              return (
                <Pressable
                  key={key}
                  onPress={() => pick(key)}
                  style={styles.cell}
                  accessibilityRole="button"
                  accessibilityLabel={`${relativeDay(key, today)}, ${load.open} open`}
                >
                  <View style={[styles.cellInner, isToday && styles.cellToday]}>
                    <Text style={[styles.cellNum, past && { color: sage.fgFaint }]}>
                      {parseDay(key).getDate()}
                    </Text>
                    <View style={styles.loadTrack}>
                      {load.open > 0 && (
                        <View
                          style={[
                            styles.loadFill,
                            { width: `${Math.max(0.2, load.fill) * 100}%` },
                            load.heavy && { backgroundColor: sage.clay },
                          ]}
                        />
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <Pressable onPress={close} style={styles.cancel} accessibilityRole="button">
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(55,81,74,0.28)' },
  sheet: {
    backgroundColor: sage.bg,
    borderTopLeftRadius: radius.cardLg,
    borderTopRightRadius: radius.cardLg,
    paddingHorizontal: gutter,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '86%',
    ...curve,
  },
  grab: { width: 38, height: 4, borderRadius: 2, backgroundColor: sage.ruleStrong, alignSelf: 'center', marginBottom: 14 },

  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  quickBtn: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: radius.sm,
    backgroundColor: sage.fillGreen,
    ...curve,
  },
  quickText: { fontFamily: font.heading, fontSize: 13, color: sage.primaryDeep },

  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 10 },
  monthNav: { width: 34, height: 34, borderRadius: 12, backgroundColor: sage.fill, alignItems: 'center', justifyContent: 'center', ...curve },
  monthArrow: { fontFamily: font.headingBold, fontSize: 18, color: sage.fgSecondary, marginTop: -2 },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: { flex: 1, textAlign: 'center', fontFamily: font.bodySemi, fontSize: 10.5, color: sage.fgFaint },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, paddingVertical: 3, paddingHorizontal: 2 },
  cellInner: { borderRadius: 12, paddingVertical: 7, alignItems: 'center', gap: 5, ...curve },
  cellToday: { backgroundColor: sage.fillGreen },
  cellNum: { fontFamily: font.heading, fontSize: 13, color: sage.fgBody },
  loadTrack: { width: 18, height: 3, borderRadius: 2, backgroundColor: 'transparent', overflow: 'hidden' },
  loadFill: { height: 3, borderRadius: 2, backgroundColor: sage.leaf },

  cancel: { alignSelf: 'center', marginTop: 14, paddingVertical: 10, paddingHorizontal: 20 },
  cancelText: { fontFamily: font.heading, fontSize: 13, color: sage.fgFaint },
});
