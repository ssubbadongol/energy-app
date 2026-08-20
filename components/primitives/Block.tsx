import { memo, type ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { hairline, space } from '@/theme/tokens';
import { useSurface } from '@/theme/surface';
import { usePressScale } from './usePressScale';

export interface BlockProps {
  children: ReactNode;
  /** Rules above and/or below. This is the only way a block is delimited. */
  rule?: 'none' | 'top' | 'bottom' | 'both';
  ruleWeight?: 'faint' | 'rule' | 'strong';
  paddingY?: keyof typeof space;
  paddingX?: keyof typeof space;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: ViewStyle;
  testID?: string;
}

/**
 * A delimited region of a screen.
 *
 * This replaces `Card` from the previous system, and the rename is the point:
 * there are no cards here. No fill, no radius, no border on four sides, no
 * shadow, no elevation. A block is bounded by a hairline rule above it, below
 * it, or by nothing at all — most often by nothing, with whitespace doing the
 * separating.
 *
 * Keeping a component called `Card` that renders no card would be the kind of
 * quiet lie that makes a codebase hard to reason about a year later.
 */
export const Block = memo(function Block({
  children,
  rule = 'none',
  ruleWeight = 'rule',
  paddingY = 6,
  paddingX = 0,
  onPress,
  accessibilityLabel,
  style,
  testID,
}: BlockProps) {
  const { c } = useSurface();
  const { animatedStyle, onPressIn, onPressOut } = usePressScale({ to: 1, feedback: 'selection' });

  const stroke =
    ruleWeight === 'strong' ? c.ruleStrong : ruleWeight === 'faint' ? c.ruleFaint : c.rule;

  const box: ViewStyle = {
    paddingVertical: space[paddingY],
    paddingHorizontal: space[paddingX],
    borderTopWidth: rule === 'top' || rule === 'both' ? hairline : 0,
    borderBottomWidth: rule === 'bottom' || rule === 'both' ? hairline : 0,
    borderColor: stroke,
  };

  if (!onPress) {
    return (
      <View testID={testID} style={[box, style]}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[box, animatedStyle, style]}>{children}</Animated.View>
    </Pressable>
  );
});

export default Block;
