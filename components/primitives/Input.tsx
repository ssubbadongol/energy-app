import { forwardRef, useCallback, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { hairline, minTouch, radius, space, type as typeScale } from '@/theme/tokens';
import { useSurface } from '@/theme/surface';
import { Text } from './Text';

type FocusHandler = NonNullable<TextInputProps['onFocus']>;
type BlurHandler = NonNullable<TextInputProps['onBlur']>;

export interface InputProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  /** Structural label above the field. Rendered in caps mono. */
  label?: string;
  hint?: string;
  error?: string | null;
  multiline?: boolean;
  containerStyle?: ViewStyle;
}

/**
 * A text field that is a ruled line, not a box.
 *
 * No fill, no border on four sides, no radius — just a hairline underneath,
 * the way a field is drawn on a printed form. On focus the rule brightens to
 * `ruleStrong` and the text goes to full foreground. That is the entire focus
 * treatment, and without an accent colour available it has to be legible on
 * its own, so the jump is deliberately large (0.15 → 0.30 alpha).
 *
 * The error slot occupies reserved space at all times, so validating a form
 * never pushes the submit button down under a thumb that is already moving.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, hint, error, multiline, containerStyle, onFocus, onBlur, ...rest },
  ref,
) {
  const { c } = useSurface();
  const [focused, setFocused] = useState(false);
  const invalid = Boolean(error);

  const handleFocus = useCallback<FocusHandler>(
    (e) => {
      setFocused(true);
      onFocus?.(e);
    },
    [onFocus],
  );

  const handleBlur = useCallback<BlurHandler>(
    (e) => {
      setFocused(false);
      onBlur?.(e);
    },
    [onBlur],
  );

  // Without colour, an error has to be signalled by weight and by wording.
  const ruleColor = invalid || focused ? c.ruleStrong : c.rule;

  return (
    <View style={containerStyle}>
      {label ? (
        <Text variant="label" tone="muted" style={styles.label}>
          {label}
        </Text>
      ) : null}

      <View style={[styles.field, multiline && styles.fieldMultiline, { borderBottomColor: ruleColor }]}>
        <TextInput
          ref={ref}
          {...rest}
          multiline={multiline}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholderTextColor={c.fgFaint}
          selectionColor={c.fg}
          cursorColor={c.fg}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          maxFontSizeMultiplier={1.5}
          style={[
            styles.input,
            { color: focused ? c.fg : c.fgSecondary },
            multiline && styles.inputMultiline,
          ]}
        />
      </View>

      <View style={styles.messageSlot}>
        {error ? (
          <Text variant="meta" tone="primary" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : hint ? (
          <Text variant="meta" tone="faint">
            {hint}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  label: { marginBottom: space[3] },
  field: {
    minHeight: minTouch,
    borderBottomWidth: hairline,
    borderRadius: radius.none,
    justifyContent: 'center',
  },
  fieldMultiline: { minHeight: 88 },
  input: {
    ...typeScale.body,
    paddingVertical: space[2],
    paddingHorizontal: 0,
    textAlignVertical: 'center',
  },
  inputMultiline: {
    textAlignVertical: 'top',
    maxHeight: 140,
    paddingTop: space[2],
  },
  messageSlot: {
    minHeight: 18,
    marginTop: space[2],
    justifyContent: 'center',
  },
});

export default Input;
