import { memo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { hairline, minTouch, pill as pillRadius, radius, space } from '@/theme/tokens';
import { useInverse, useSurface } from '@/theme/surface';
import { Text } from './Text';
import { usePressScale } from './usePressScale';

type Variant = 'solid' | 'outline' | 'bare';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  /** `solid` inverts against the surface. `outline` is a hairline box. */
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Pill instead of square. Reserve for tags and filters, not primary actions. */
  pill?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
  testID?: string;
}

const HEIGHT: Record<Size, number> = { sm: 36, md: 48, lg: 60 };
const PAD_X: Record<Size, number> = { sm: space[4], md: space[6], lg: space[8] };

/**
 * The only button in the app.
 *
 * `solid` is drawn in the *opposite* palette to whatever surface it sits on —
 * on the dark screen it is a light block with dark text, and on the inverted
 * screen it is the reverse. That is the only emphasis mechanism available
 * without an accent colour, and it is stronger than an accent would be.
 *
 * Square by default. The pill is opt-in and belongs on tags and filters, where
 * the shape is doing categorisation work, not on primary actions.
 *
 * Behaviour carried over unchanged from the previous system because it was
 * never about the visuals: the label stays mounted under the spinner so the
 * button cannot resize mid-press, and presses are blocked while loading, which
 * is what stops the double-submit behind duplicate tasks and pod messages.
 */
export const Button = memo(function Button({
  label,
  onPress,
  variant = 'solid',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  pill = false,
  accessibilityLabel,
  style,
  testID,
}: ButtonProps) {
  const { c } = useSurface();
  const inverse = useInverse();
  const inert = disabled || loading;

  const { animatedStyle, onPressIn, onPressOut } = usePressScale({ to: 0.98 });

  const slop = Math.max(0, (minTouch - HEIGHT[size]) / 2);

  const surface: ViewStyle =
    variant === 'solid'
      ? { backgroundColor: disabled ? c.fgFaint : c.fg }
      : variant === 'outline'
        ? { borderWidth: hairline, borderColor: disabled ? c.ruleFaint : c.rule }
        : {};

  // Solid inverts, so its text is drawn from the opposite palette.
  const labelColor = variant === 'solid' ? inverse.fg : disabled ? c.fgFaint : c.fg;

  return (
    <Pressable
      testID={testID}
      onPress={inert ? undefined : onPress}
      onPressIn={inert ? undefined : onPressIn}
      onPressOut={inert ? undefined : onPressOut}
      disabled={inert}
      hitSlop={{ top: slop, bottom: slop, left: 0, right: 0 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inert, busy: loading }}
      style={fullWidth ? styles.fullWidth : undefined}
    >
      <Animated.View
        style={[
          styles.base,
          surface,
          {
            height: HEIGHT[size],
            paddingHorizontal: PAD_X[size],
            // A true pill is half the height, not a large fixed radius.
            borderRadius: pill ? pillRadius(HEIGHT[size]) : radius.none,
          },
          animatedStyle,
          style,
        ]}
      >
        <View style={[styles.row, loading && styles.hidden]}>
          {icon ? <View>{icon}</View> : null}
          <Text variant="control" numberOfLines={1} style={{ color: labelColor }}>
            {label}
          </Text>
        </View>

        {loading ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={styles.center}>
              <ActivityIndicator size="small" color={labelColor} />
            </View>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  fullWidth: { alignSelf: 'stretch' },
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  // Opacity, not unmount — the label holds the width open.
  hidden: { opacity: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

export default Button;
