/**
 * Soft Focus primitives.
 *
 * Screens compose from here. If a screen needs a visual that does not exist in
 * this layer, add it here — do not reach for `StyleSheet.create` and a hex
 * code in the screen file.
 *
 * Note the two renames from the previous system, both deliberate:
 *   Card    → Block  (there are no cards; a block is bounded by rules or air)
 *   Divider → Rule   (a hairline rule is the whole separation model)
 */

export { Block, type BlockProps } from './Block';
export { Button, type ButtonProps } from './Button';
export { Input, type InputProps } from './Input';
export { ListItem, type ListItemProps } from './ListItem';
export { LabelledRule, Rule, type RuleProps } from './Rule';
export { Screen, type ScreenProps } from './Screen';
export { Sheet, type SheetProps } from './Sheet';
export { Skeleton, SkeletonList, SkeletonRule } from './Skeleton';
export { StateView, type StateViewProps } from './StateView';
export { Text, type TextProps } from './Text';
export { haptic, usePressScale } from './usePressScale';

export { Surface, useInverse, useSurface, type SurfaceName } from '@/theme/surface';
