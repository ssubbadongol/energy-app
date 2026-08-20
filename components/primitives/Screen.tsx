import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { gutter, space } from '@/theme/tokens';
import { Surface, useSurface, type SurfaceName } from '@/theme/surface';
import { Text } from './Text';

export interface ScreenProps {
  children: ReactNode;
  /** Tiny structural label in place of a header — TODAY, SESSION 04, POD. */
  label?: string;
  /** Right-hand counterpart — a count, a countdown, a date. */
  labelTrailing?: string;
  /** Which palette this screen paints in. Defaults to warm paper. */
  surface?: SurfaceName;
  /** Removes the page gutter, for full-bleed screens. */
  bleed?: boolean;
  edges?: ('top' | 'bottom')[];
  testID?: string;
}

/**
 * Page scaffold.
 *
 * No header. No back chevron, no centred title, no trailing action cluster —
 * roughly 88pt of chrome that exists to tell you where you are, in a six-tab
 * app where you already know. What replaces it is a single 11pt caps-mono
 * label in the top-left and a great deal of nothing.
 *
 * The tab bar is laid out in flow rather than absolutely positioned, so this
 * component does not need to reserve clearance for it — the content box ends
 * where the tab bar begins. `edges` deliberately defaults to `top` only for
 * the same reason: adding a bottom inset here would double-count the one the
 * tab bar already applies.
 */
function ScreenBody({
  children,
  label,
  labelTrailing,
  bleed = false,
  edges = ['top'],
  testID,
}: Omit<ScreenProps, 'surface'>) {
  const { c } = useSurface();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={edges} testID={testID}>
      {label ? (
        <View style={[styles.label, !bleed && { paddingHorizontal: gutter }]}>
          <Text variant="label" tone="secondary" accessibilityRole="header">
            {label}
          </Text>
          {labelTrailing ? (
            <Text variant="label" tone="secondary">
              {labelTrailing}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.content, !bleed && { paddingHorizontal: gutter }]}>{children}</View>
    </SafeAreaView>
  );
}

export function Screen({ surface = 'light', ...rest }: ScreenProps) {
  return (
    <Surface name={surface}>
      <ScreenBody {...rest} />
    </Surface>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  label: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: space[3],
    paddingBottom: space[6],
  },
  // minHeight: 0 lets this shrink inside the flex parent instead of forcing
  // the column taller than the viewport and pushing content off the bottom.
  content: { flex: 1, minHeight: 0 },
});

export default Screen;
