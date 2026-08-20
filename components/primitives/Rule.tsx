import { memo } from 'react';
import { View, type ViewStyle } from 'react-native';
import { hairline, space } from '@/theme/tokens';
import { useSurface } from '@/theme/surface';
import { Text } from './Text';

export interface RuleProps {
  /** `faint` for inactive edges, `strong` for a section boundary. */
  weight?: 'faint' | 'rule' | 'strong';
  /** Left inset, to clear an icon or index column. */
  inset?: number;
  style?: ViewStyle;
}

/**
 * A hairline rule.
 *
 * This is the entire separation model. There are no cards, no fills and no
 * shadows in this system, so a rule is doing the job that a card border, a
 * background tone and a drop shadow would do together in a conventional
 * design. That is why it is worth a component: consistency of this one element
 * is most of what makes the layout read as deliberate rather than sparse.
 */
export const Rule = memo(function Rule({ weight = 'rule', inset = 0, style }: RuleProps) {
  const { c } = useSurface();
  const stroke = weight === 'strong' ? c.ruleStrong : weight === 'faint' ? c.ruleFaint : c.rule;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ height: hairline, backgroundColor: stroke, marginLeft: inset }, style]}
    />
  );
});

/**
 * A rule with a label sitting on it — the catalogue-card device that gives
 * this system its structure. The label is always a structural noun
 * (SESSION 04, TODAY, POD · 3 MEMBERS), never a sentence.
 */
export const LabelledRule = memo(function LabelledRule({
  label,
  trailing,
  style,
}: {
  label: string;
  /** Right-aligned counterpart — a count, a timestamp, a duration. */
  trailing?: string;
  style?: ViewStyle;
}) {
  return (
    <View style={style}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <Text variant="label" tone="muted">
          {label}
        </Text>
        {trailing ? (
          <Text variant="label" tone="faint">
            {trailing}
          </Text>
        ) : null}
      </View>
      <Rule style={{ marginTop: space[2] }} />
    </View>
  );
});

export default Rule;
