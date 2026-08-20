import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { Button, Rule, Screen, Surface, Text, haptic } from '@/components/primitives';
import { curve, gutter, palette, radius, space } from '@/theme/tokens';

/**
 * Focus session — direction sample.
 *
 * STATIC. No camera, no timer, no tracking; the numbers are fixed and the
 * button only swaps between the two states.
 *
 * ── Layout note ──────────────────────────────────────────────────────────
 *
 * Every vertical dimension here is either content-sized or a flexible spacer.
 * There are no fixed margins between the blocks, because a fixed rhythm that
 * fits a 812pt viewport overflows a 667pt one, and this screen must not
 * scroll — a focus session that you can accidentally swipe is not a focus
 * session. The metric steps down on short screens instead.
 */

/** Fixed sample. Replaced by the Presage stream when session logic lands. */
const SAMPLE = [
  52, 58, 61, 57, 64, 71, 76, 74, 79, 83, 81, 86, 88, 84, 79, 72, 63, 55, 48,
  44, 41, 47, 56, 64, 70, 75, 78, 82, 85, 87, 86, 89, 91, 88, 85, 87,
];

/**
 * The metric is the one place a token gets a responsive override. 128pt is
 * the design size; below it the number would either clip or force the graph
 * off the bottom, and a clipped number is worse than a smaller one.
 */
function metricSize(viewportHeight: number) {
  if (viewportHeight >= 780) return { fontSize: 128, lineHeight: 128 };
  if (viewportHeight >= 700) return { fontSize: 108, lineHeight: 108 };
  return { fontSize: 88, lineHeight: 88 };
}

export default function FocusScreen() {
  const [active, setActive] = useState(true);

  return active ? (
    <ActiveSession onEnd={() => setActive(false)} />
  ) : (
    <Threshold onBegin={() => setActive(true)} />
  );
}

/* ------------------------------------------------------------------ *
 * Live session
 * ------------------------------------------------------------------ */

function ActiveSession({ onEnd }: { onEnd: () => void }) {
  const { height } = useWindowDimensions();
  const metric = metricSize(height);

  return (
    <Screen label="Session 04" labelTrailing="24:18" testID="focus-active">
      <View style={styles.activeBody}>
        {/*
          The emphasis surface: a deep ink block inset from the screen edges so
          its 24pt rounding is actually visible. Everything inside it flips
          palette through context — no component is told about it.
        */}
        <Surface name="emphasis">
          <View style={[styles.block, curve]}>
            <View style={styles.blockHead}>
              <Text variant="label" tone="secondary">
                Focus
              </Text>
              <Text variant="label" tone="secondary">
                Steady
              </Text>
            </View>
            <Rule />

            {/* Baseline-aligned so % sits on the digits' baseline, not at cap height. */}
            <View style={styles.metricRow}>
              <Text variant="metric" style={metric} accessibilityLabel="Focus 87 percent">
                87
              </Text>
              <Text variant="metricSm" tone="secondary" style={styles.percent}>
                %
              </Text>
            </View>

            <View style={styles.spacer} />

            <FocusGraph data={SAMPLE} />

            <View style={styles.graphMeta}>
              <Text variant="labelSm" tone="secondary">
                Last 3 min
              </Text>
              <Text variant="labelSm" tone="secondary">
                Avg 72%
              </Text>
            </View>
          </View>
        </Surface>

        <Button
          label="End session"
          variant="outline"
          size="md"
          pill
          fullWidth
          style={styles.endButton}
          onPress={() => {
            haptic('heavy');
            onEnd();
          }}
        />
      </View>
    </Screen>
  );
}

/**
 * The graph.
 *
 * A hairline polyline — no fill, no gradient, no dots, no axes, no grid, and
 * bounded by straight rules rather than a rounded plot box. Rounding it would
 * make it an object floating inside the block; left square and full-bleed to
 * the block's padding it stays part of the page structure, which is the
 * distinction the whole shape system rests on.
 *
 * Deliberately unsmoothed. A bezier would imply the attention signal is
 * continuous and gentle; it is neither.
 */
function FocusGraph({ data }: { data: number[] }) {
  const { width } = useWindowDimensions();
  const plotWidth = width - gutter * 2 - space[4] * 2 - space[5] * 2;
  const plotHeight = 104;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * plotWidth;
      const y = plotHeight - (v / 100) * plotHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <View accessibilityLabel="Focus over the last 3 minutes, averaging 72 percent">
      <Rule weight="faint" />
      <Svg width={plotWidth} height={plotHeight}>
        <Polyline
          points={points}
          fill="none"
          stroke={palette.emphasis.fg}
          strokeWidth={1}
          strokeLinejoin="miter"
        />
      </Svg>
      <Rule weight="faint" />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Threshold
 * ------------------------------------------------------------------ */

function Threshold({ onBegin }: { onBegin: () => void }) {
  return (
    <Screen label="Focus" testID="focus-threshold">
      <View style={styles.thresholdBody}>
        {/* Collage image slot — see DESIGN.md. Not yet sourced. */}

        <Text variant="display">Ready when you are.</Text>

        <Text variant="body" tone="secondary" style={styles.thresholdCopy}>
          Your camera tracks how steady your attention is. Nothing is recorded
          and nothing leaves your phone.
        </Text>

        <View style={styles.thresholdMeta}>
          <Rule />
          <View style={styles.thresholdMetaRow}>
            <Text variant="labelSm" tone="secondary">
              Last session
            </Text>
            <Text variant="labelSm" tone="secondary">
              38 min · Avg 74%
            </Text>
          </View>
        </View>

        <Button
          label="Begin session"
          variant="solid"
          size="lg"
          pill
          fullWidth
          style={styles.beginButton}
          onPress={() => {
            haptic('heavy');
            onBegin();
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  /* Live session */
  activeBody: { flex: 1, paddingBottom: space[5] },
  block: {
    flex: 1,
    backgroundColor: palette.emphasis.bg,
    borderRadius: radius.lg,
    paddingHorizontal: space[5],
    paddingVertical: space[5],
  },
  blockHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: space[2],
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: space[5],
  },
  percent: { marginLeft: space[2] },
  // Absorbs whatever height is left over, so nothing else has to be fixed.
  spacer: { flex: 1, minHeight: space[5] },
  graphMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space[3],
  },
  endButton: { marginTop: space[5] },

  /* Threshold */
  thresholdBody: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: space[10],
  },
  thresholdCopy: { marginTop: space[5], maxWidth: 300 },
  thresholdMeta: { marginTop: space[10] },
  thresholdMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space[3],
  },
  beginButton: { marginTop: space[8] },
});
