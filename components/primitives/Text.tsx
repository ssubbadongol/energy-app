import { memo } from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { type as typeScale, type TypeToken } from '@/theme/tokens';
import { useSurface } from '@/theme/surface';

type Tone = 'primary' | 'secondary' | 'muted' | 'faint';

export interface TextProps extends RNTextProps {
  /** Type-scale token. Carries family, size, leading and tracking together. */
  variant?: TypeToken;
  tone?: Tone;
  center?: boolean;
  /** Completed tasks. Strikethrough is the state change, not a checkbox. */
  strike?: boolean;
  style?: TextStyle | TextStyle[];
}

/**
 * The only text component in the app.
 *
 * In this system type *is* the interface — there is no colour, no card and no
 * shadow to carry hierarchy, so a wrong size or a wrong family is not a small
 * inconsistency, it is the whole design failing. Hence: no `fontSize` prop, no
 * `fontFamily` prop, no `fontWeight` prop. You choose a role and the role
 * decides how it is set.
 *
 * Colour comes from the surface rather than a prop, so a subtree wrapped in
 * `<Surface inverted>` flips without any text being told about it.
 */
export const Text = memo(function Text({
  variant = 'body',
  tone = 'primary',
  center,
  strike,
  style,
  ...rest
}: TextProps) {
  const { c } = useSurface();

  const TONE: Record<Tone, string> = {
    primary: c.fg,
    secondary: c.fgSecondary,
    // The palette now has three text weights, not four. `muted` maps onto
    // secondary — the AA-passing receding tone — and the alias is removed
    // when the primitives are re-skinned.
    muted: c.fgSecondary,
    faint: c.fgFaint,
  };

  return (
    <RNText
      maxFontSizeMultiplier={1.5}
      {...rest}
      style={[
        typeScale[variant] as TextStyle,
        { color: TONE[tone] },
        center && { textAlign: 'center' },
        strike && { textDecorationLine: 'line-through' },
        style,
      ]}
    />
  );
});

export default Text;
