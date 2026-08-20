/**
 * Public theme entry point.
 *
 * New code imports tokens from here (or `@/theme/tokens`), the palette via
 * `useSurface()`, and components from `@/components/primitives`.
 */

export * from './tokens';
export { default as tokens } from './tokens';
export { Surface, useInverse, useSurface } from './surface';
export { useMotion, useReduceMotion, type Motion } from './useMotion';

import {
  palette,
  radius as radiusTokens,
  shadow as shadowTokens,
  type as typeScale,
} from './tokens';

/* ------------------------------------------------------------------ *
 * Legacy compatibility
 *
 * The six screens still carrying hackathon styling import `colors` /
 * `radius` / `shadows` / `typography` from '@/theme'. These shims keep them
 * compiling while the redesign lands screen by screen, and are deleted with
 * the last migrated screen. Nothing new should import from this section.
 *
 * The mappings deliberately pull those screens *toward* the new system —
 * radii collapse to 0 and shadows become no-ops — so the transitional state
 * is flat and monochrome rather than a mix of two visual languages.
 * ------------------------------------------------------------------ */

// Light is now the default surface, so the unmigrated screens follow it.
const d = palette.light;

/** @deprecated Read the palette from `useSurface()`. */
export const colors = {
  bgBase: d.bg,
  bgSurface: d.bg,
  bgElevated: d.bgRaised,
  bgSubtle: d.ruleFaint,
  border: d.rule,
  borderSubtle: d.ruleFaint,
  textPrimary: d.fg,
  textSecondary: d.fgSecondary,
  // The palette has three text weights now; `muted` folds into secondary.
  textMuted: d.fgSecondary,
  accent: d.accent,
  accentDim: d.ruleFaint,
  accentHover: d.accentText,
  // No status colours exist. Legacy call sites collapse to foreground tones
  // so the unmigrated screens stay monochrome rather than reintroducing
  // red/green into a system that has none.
  success: d.fg,
  warning: d.fgSecondary,
  error: d.fg,
  successDim: d.ruleFaint,
  warningDim: d.ruleFaint,
  errorDim: d.ruleFaint,
} as const;

/** @deprecated Use `space` from '@/theme/tokens'. */
export const spacing = {
  1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64, 20: 80,
} as const;

/** @deprecated Use `radius` / `pill()` / `nest()` from '@/theme/tokens'. */
export const radius = {
  ...radiusTokens,
  xl: radiusTokens.lg,
} as const;

/** @deprecated Use `shadow` from '@/theme/tokens'. Cool-tinted, never black. */
export const shadows = {
  sm: shadowTokens.soft,
  md: shadowTokens.soft,
  lg: shadowTokens.lifted,
  accent: shadowTokens.soft,
} as const;

/** @deprecated Use the `type` scale via `<Text variant>`. */
export const typography = {
  displayFont: typeScale.display.fontFamily,
  headingFont: typeScale.title.fontFamily,
  bodyFont: typeScale.body.fontFamily,
  uiFont: typeScale.meta.fontFamily,
} as const;
