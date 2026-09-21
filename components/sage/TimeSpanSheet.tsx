/**
 * Picking a life task's time, in a sheet.
 *
 * This is a modal rather than part of the editor for a reason that is not
 * taste: the wheels are vertical scroll views, and inline they sat inside the
 * setup panel's own vertical scroll view. Nested that way the outer list wins
 * the gesture, so the wheels looked right and could not be turned at all.
 * A modal lifts them out of that hierarchy, and nothing here scrolls except
 * the wheels themselves.
 *
 * The shape is iOS's alarm editor: the chosen time stated once, large, at the
 * top, and the wheels underneath. Reading the answer should not mean decoding
 * two columns — the columns are for changing it, the heading is for knowing
 * what it currently says.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { HourWheel } from './HourWheel';
import { AM, type ClockFormat, from12, meridiemOf, PM, to12 } from '@/app/clockFormat';
import { hourLabel, isFixedTime, spanLabel } from '@/app/lifeSchedule';
import { curve, font, gutter, radius, sage, text } from '@/theme/sage';

const HOURS_24 = Array.from({ length: 24 }, (_, h) => h);
/** 12 first, because that is where a clock face starts. */
const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

interface Props {
  visible: boolean;
  startHour: number;
  endHour: number;
  clock: ClockFormat;
  onChangeStart: (hour: number) => void;
  onChangeEnd: (hour: number) => void;
  onClose: () => void;
}

export function TimeSpanSheet({
  visible,
  startHour,
  endHour,
  clock,
  onChangeStart,
  onChangeEnd,
  onClose,
}: Props) {
  const fixed = isFixedTime({ startHour, endHour });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.grab} />

        <Text style={[text.title, { fontSize: 19 }]}>When does it happen?</Text>
        {/*
          The answer, said plainly. Everything below is for changing it.
        */}
        <Text style={styles.chosen}>{spanLabel(startHour, endHour, clock)}</Text>

        <Row
          label="Starts"
          hour={startHour}
          onChange={onChangeStart}
          clock={clock}
          testID="start"
        />
        <Row label="Ends" hour={endHour} onChange={onChangeEnd} clock={clock} testID="end" />

        {fixed && (
          <Text style={styles.hint}>
            Start and end match, so this one has to happen at{' '}
            {hourLabel(startHour, clock)} rather than some time around it. One nudge, on the hour.
          </Text>
        )}

        <Pressable onPress={onClose} style={styles.done} accessibilityRole="button">
          <Text style={text.button}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/**
 * One end of the span: an hour wheel, and on a 12-hour clock an AM/PM wheel
 * beside it.
 *
 * The second column is the whole reason this is a component rather than two
 * calls — a wheel that only sometimes exists is exactly the kind of thing
 * that gets written twice and fixed once.
 */
function Row({ label, hour, onChange, clock, testID }: {
  label: string;
  hour: number;
  onChange: (hour: number) => void;
  clock: ClockFormat;
  testID: string;
}) {
  const twelve = clock === '12h';

  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.wheels}>
        <View style={styles.wheelBox}>
          <HourWheel
            values={twelve ? HOURS_12 : HOURS_24}
            value={twelve ? to12(hour) : hour}
            // On a 12-hour clock the wheel reports a clock face number, which
            // only becomes an hour once the meridiem beside it is applied.
            onChange={(v) => onChange(twelve ? from12(v, meridiemOf(hour)) : v)}
            label={(h) => (twelve ? String(h) : hourLabel(h, '24h'))}
            accessibilityLabel={`${label} hour`}
            testID={`${testID}-hour`}
          />
        </View>
        {twelve && (
          <View style={styles.wheelBox}>
            <HourWheel
              values={[AM, PM]}
              value={meridiemOf(hour)}
              onChange={(m) => onChange(from12(to12(hour), m))}
              label={(m) => (m === AM ? 'AM' : 'PM')}
              accessibilityLabel={`${label}, morning or afternoon`}
              testID={`${testID}-meridiem`}
            />
          </View>
        )}
      </View>
    </View>
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
    ...curve,
  },
  grab: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: sage.ruleStrong,
    alignSelf: 'center',
    marginBottom: 14,
  },
  chosen: { fontFamily: font.headingBold, fontSize: 28, color: sage.primaryDeep, marginTop: 6 },

  row: { marginTop: 16 },
  rowLabel: {
    fontFamily: font.bodySemi,
    fontSize: 10.5,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: sage.fgFaint,
    marginBottom: 4,
  },
  // Fixed-width columns, centred, rather than flexing to fill: two wheels
  // stretched across a phone put the numbers absurdly far apart, and the
  // pairing is what makes "9" and "PM" read as one time.
  wheels: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  wheelBox: {
    width: 104,
    backgroundColor: sage.surface,
    borderRadius: radius.md,
    ...curve,
  },

  hint: { fontFamily: font.body, fontSize: 12.5, lineHeight: 18, color: sage.primaryInk, marginTop: 14 },
  done: {
    marginTop: 18,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: sage.primary,
    ...curve,
  },
});
