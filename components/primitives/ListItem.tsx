import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { hairline, minTouch, space } from '@/theme/tokens';
import { useSurface } from '@/theme/surface';
import { Text } from './Text';
import { haptic } from './usePressScale';

export interface ListItemProps {
  title: string;
  /** Mono metadata under the title — due time, duration, author. */
  meta?: string;
  /** Small mono index or marker in the left column, e.g. "04" or "—". */
  index?: string;
  /** Right-aligned mono value — a time, a count, a state word. */
  trailing?: string;
  /** Custom right slot when `trailing` text is not enough. */
  trailingSlot?: ReactNode;
  /** Dims the row and strikes the title. The completion state *is* the type. */
  done?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  separator?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: ViewStyle;
  testID?: string;
}

/**
 * A row.
 *
 * **No checkbox.** Completion is expressed as a change in the type itself —
 * the title is struck through and drops to muted. A box with a tick in it is a
 * control borrowed from a settings screen; striking the line is what you do to
 * a list on paper, and it costs no extra element on a screen whose whole
 * argument is that there are few elements.
 *
 * **No entrance animation.** Rows are the most-seen thing in the app — every
 * task, every message, every pod. Motion on something encountered dozens of
 * times a day stops reading as polish and starts reading as latency. This
 * matters more here than in the previous system, because a staggered fade
 * would be the only movement on an otherwise completely still screen and would
 * draw the eye to the least important thing on it.
 *
 * The press state is a hard tone change with no transition — a cut. In this
 * aesthetic a fade reads as generic; the instant swap reads as confident.
 */
export const ListItem = memo(function ListItem({
  title,
  meta,
  index,
  trailing,
  trailingSlot,
  done = false,
  onPress,
  onLongPress,
  separator = true,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ListItemProps) {
  const { c } = useSurface();
  const interactive = Boolean(onPress || onLongPress) && !disabled;

  const content = (pressed: boolean) => (
    <View style={[styles.row, pressed && { backgroundColor: c.ruleFaint }, style]}>
      {index ? (
        <View style={styles.index}>
          <Text variant="labelSm" tone="faint">
            {index}
          </Text>
        </View>
      ) : null}

      <View style={styles.text}>
        <Text
          variant="bodyStrong"
          tone={done || disabled ? 'muted' : 'primary'}
          strike={done}
          numberOfLines={2}
        >
          {title}
        </Text>
        {meta ? (
          <Text variant="meta" tone="faint" numberOfLines={1} style={styles.meta}>
            {meta}
          </Text>
        ) : null}
      </View>

      {trailingSlot ??
        (trailing ? (
          <Text variant="meta" tone="muted" style={styles.trailing}>
            {trailing}
          </Text>
        ) : null)}
    </View>
  );

  const body = interactive ? (
    <Pressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => haptic('selection')}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, checked: done }}
    >
      {({ pressed }) => content(pressed)}
    </Pressable>
  ) : (
    <View testID={testID} accessibilityLabel={accessibilityLabel}>
      {content(false)}
    </View>
  );

  return (
    <View>
      {body}
      {separator ? <View style={{ height: hairline, backgroundColor: c.rule }} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: minTouch + space[4],
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: space[5],
    gap: space[4],
  },
  // Fixed width so titles align down the column regardless of index length.
  index: { width: 24 },
  text: { flex: 1 },
  meta: { marginTop: space[2] },
  trailing: { marginLeft: space[3] },
});

export default ListItem;
