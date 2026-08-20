import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { space } from '@/theme/tokens';
import { Button } from './Button';
import { Rule } from './Rule';
import { Text } from './Text';

export interface StateViewProps {
  kind?: 'empty' | 'error';
  /** Structural label above the statement — NOTHING DUE, CONNECTION LOST. */
  label?: string;
  /** The statement, set in the display serif. Warm and plain, never curt. */
  title: string;
  body?: string;
  /**
   * The public-domain collage image. Empty states are where imagery earns the
   * most — they are the screens with the most room and the least to say.
   */
  image?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

/**
 * The screen when there is nothing to show, or when something broke.
 *
 * Without colour, an error cannot be signalled by turning something red — so
 * it is signalled by wording and by structure. That is a constraint worth
 * having, because "Color is not the only indicator" is an accessibility rule
 * this system satisfies by construction rather than by remembering to.
 *
 * The copy register is the one thing deliberately *not* taken from the
 * reference. Co-Star's voice is blunt and a bit cold, which works for
 * astrology and would be actively harmful here — this is an app for anxious
 * students, and a curt declarative sentence about their empty task list reads
 * as judgement. Caps are for the structural label only; the sentence addressed
 * to the user stays warm and plain.
 */
export const StateView = memo(function StateView({
  kind = 'empty',
  label,
  title,
  body,
  image,
  actionLabel,
  onAction,
  testID,
}: StateViewProps) {
  const isError = kind === 'error';

  return (
    <View style={styles.root} testID={testID} accessibilityLiveRegion={isError ? 'polite' : 'none'}>
      {image ? <View style={styles.image}>{image}</View> : null}

      {label ? (
        <>
          <Text variant="label" tone="faint">
            {label}
          </Text>
          <Rule weight="faint" style={styles.rule} />
        </>
      ) : null}

      <Text variant="title" style={styles.title}>
        {title}
      </Text>

      {body ? (
        <Text variant="body" tone="secondary" style={styles.body}>
          {body}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          variant={isError ? 'outline' : 'solid'}
          style={styles.action}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  // Left-aligned, hanging low rather than centred — editorial, not a dialog.
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: space[24],
  },
  image: { marginBottom: space[10] },
  rule: { marginTop: space[2], marginBottom: space[6] },
  title: { maxWidth: 320 },
  body: { marginTop: space[5], maxWidth: 300 },
  action: { marginTop: space[10], alignSelf: 'flex-start' },
});

export default StateView;
