/**
 * Soft Focus — design tokens
 *
 * Editorial, near-monochrome, driven by type and negative space. Structure is
 * unchanged from the previous build: hairline separators, no cards, no
 * elevation model, ALL CAPS mono labels, extreme whitespace.
 *
 * What changed: colour, light, texture and corner radius.
 *
 * ── The governing rule ───────────────────────────────────────────────────
 *
 * Warm light, cool shadow. This is what light does after rain: warm direct
 * sun, cool ambient bounce off a still-grey sky. Applied literally —
 * backgrounds, lit surfaces and highlights carry a yellow cast; text,
 * separators, shadows and disabled states carry a blue-green cast.
 *
 * **There is no neutral grey anywhere in this file.** Every grey is tinted one
 * way or the other. Untinted grey is the single thing that would make this
 * read as cheap.
 *
 * Saturation ceiling is 55%. Every value below is at or under it — the
 * nostalgia comes from desaturation, not from a sepia wash.
 *
 * All contrast ratios in comments are measured (WCAG 2.1 relative luminance),
 * not estimated. See the table in DESIGN.md.
 */

import { Easing } from 'react-native-reanimated';
import { Platform, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

/* ------------------------------------------------------------------ *
 * Colour — light (paper)
 * ------------------------------------------------------------------ */

/**
 * Late afternoon, wet ground, warm light on cold surfaces.
 *
 * The base is warm paper at 93% lightness with a 40° hue — faintly yellowed,
 * never white. Text is a cool near-black with a green-grey cast, so the page
 * reads as ink on paper rather than as a UI with a beige background.
 */
const light = {
  /** Warm paper. H40 S43% L93%. */
  bg: '#F5F0E6',
  /** +2% lightness. Sheets and secondary surfaces. */
  bgRaised: '#F8F4ED',

  /** 11.34:1 — primary text. Cool green-black. Never #000. */
  fg: '#2E332F',
  /** 5.24:1 — secondary text, and all mono metadata. Cooler and lighter. */
  fgSecondary: '#5C6661',
  /** 2.4:1 — fails AA by design. Disabled states and decorative marks only. */
  fgFaint: '#949D99',

  /** 3.07:1 — the accent as a graphic or interactive mark. Low sun on stone. */
  accent: '#AD8234',
  /** 4.54:1 — the accent when it carries text. */
  accentText: '#896829',

  /** Cool hairlines: the ink colour at low alpha, never a solid grey line. */
  rule: 'rgba(46, 51, 47, 0.12)',
  ruleStrong: 'rgba(46, 51, 47, 0.22)',
  ruleFaint: 'rgba(46, 51, 47, 0.07)',
} as const;

/* ------------------------------------------------------------------ *
 * Colour — dark (dusk)
 * ------------------------------------------------------------------ */

/**
 * The same product later in the day. Warm charcoal-brown rather than the old
 * near-black, with the warm-light/cool-shadow rule applied inverted: the lit
 * surfaces stay warm, and the receding text goes cool.
 */
const dark = {
  /** Warm charcoal-brown. H28 S14% L10%. */
  bg: '#1D1916',
  /** +3% lightness, still warm. */
  bgRaised: '#26211D',

  /** 13.86:1 — warm off-white. */
  fg: '#EDE4D6',
  /** 6.73:1 — cool green-grey. */
  fgSecondary: '#9AA39D',
  /** 2.99:1 — decorative and disabled only. */
  fgFaint: '#5E6763',

  /** 7.13:1 — the same honey, lifted because it sits on a dark ground. */
  accent: '#CA9F4E',
  /** Identical here: at 7.13:1 it is already text-safe. */
  accentText: '#CA9F4E',

  rule: 'rgba(237, 228, 214, 0.14)',
  ruleStrong: 'rgba(237, 228, 214, 0.26)',
  ruleFaint: 'rgba(237, 228, 214, 0.08)',
} as const;

/**
 * The emphasis surface.
 *
 * Previously black-on-white; now a deep ink block on paper, inset from the
 * screen edges at `radius.lg` so the rounding is actually visible. Same
 * rarity as before — focus session and paywall only.
 *
 * A note on the brief: the requested value `#2E332F` was described as a "deep
 * warm surface", but that hex is H132 at 5% saturation — a *cool* green-black,
 * which is also exactly the specified primary text colour. I kept the value
 * and treated it as intentional, because it makes the surface literally an ink
 * block and the warm/cool rule says shadow-side elements should be cool. If
 * you want it genuinely warm instead, `#2E2A24` is the equivalent at H30 and
 * the contrast figures barely move. Flagged rather than silently resolved.
 */
const emphasis = {
  /** Deep ink. Identical to `light.fg`. */
  bg: '#2E332F',
  bgRaised: '#3A403B',

  /** 11.34:1 — paper, reversed out. */
  fg: '#F5F0E6',
  /** 5.9:1 */
  fgSecondary: '#A9AFA9',
  /** Decorative only. */
  fgFaint: '#6B726C',

  /**
   * 5.50:1 — the bright honey works here because the ground is dark.
   * Lifted two steps above the dark-theme honey so it still clears 4.5:1 on
   * `bgRaised` (#3A403B), which is the tightest pair in the whole system.
   */
  accent: '#CDA356',
  accentText: '#CDA356',

  rule: 'rgba(245, 240, 230, 0.16)',
  ruleStrong: 'rgba(245, 240, 230, 0.28)',
  ruleFaint: 'rgba(245, 240, 230, 0.09)',
} as const;

export type Palette = Record<keyof typeof light, string>;

export const palette: { light: Palette; dark: Palette; emphasis: Palette } = {
  light,
  dark,
  emphasis,
};

/** Default. Components should read the live palette from `useSurface()`. */
export const color = light;

/* ------------------------------------------------------------------ *
 * Supporting tones
 * ------------------------------------------------------------------ */

/**
 * Washed rain-sky, damp moss, faded terracotta.
 *
 * Each ships in two strengths because the values in the brief are decorative
 * weights — `#A8C0C8` measures 1.67:1 on paper, which cannot legally carry
 * text or act as an interactive indicator. Rather than darken them and lose
 * the palette, each has a `wash` (fill and graphic use, no contrast duty) and
 * an `ink` companion (text-safe at ≥4.5:1) in the same hue.
 *
 * One supporting tone per screen, maximum, and never alongside the accent.
 */
export const tone = {
  rain: {
    /** Decorative fills only. 1.67:1 — never text. */
    wash: '#A8C0C8',
    /** 3.06:1 — graphics and interactive marks. */
    mark: '#66909E',
    /** 4.63:1 — text-safe. */
    ink: '#4F717D',
  },
  moss: {
    wash: '#A9B49B',
    mark: '#808E71',
    /** 4.69:1 */
    ink: '#636F58',
  },
  terracotta: {
    wash: '#DCAE94',
    mark: '#C07854',
    /** 4.66:1 */
    ink: '#9C5B3A',
  },
} as const;

export const hairline = StyleSheet.hairlineWidth;

/* ------------------------------------------------------------------ *
 * Space — 4pt grid
 * ------------------------------------------------------------------ */

export const space = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32,
  10: 40, 12: 48, 16: 64, 20: 80, 24: 96, 32: 128,
} as const;

export const gutter = space[6]; // 24
export const minTouch = 44;

/* ------------------------------------------------------------------ *
 * Shape
 * ------------------------------------------------------------------ */

/**
 * Rounding is scoped, not global. The distinction that keeps this from
 * becoming a generic card app:
 *
 *   ROUND — contained objects. Buttons, tags, inputs, images, sheets, the
 *           focus container, avatars. Things that are *objects on* the page.
 *
 *   FLAT  — structural elements. Hairline separators, task rows, chat
 *           messages, list items, screen containers, full-bleed sections.
 *           Things that *are* the page.
 *
 * Rows and messages get no background and no radius. They are separated by
 * full-bleed hairlines that run edge to edge with no inset. Converting them
 * into rounded cards is the single fastest way to destroy this design.
 */
export const radius = {
  none: 0,
  /** Inputs and search fields. */
  sm: 14,
  /** Images and collage assets. */
  image: 16,
  /** Focus session container, graph plot area. */
  md: 20,
  /** Sheets, modals, the emphasis surface. */
  lg: 24,
  /** Buttons, tags, avatars. Resolve with `pill(height)` where height is known. */
  full: 9999,
} as const;

/** A true pill: radius is exactly half the height, never a large fixed value. */
export const pill = (height: number) => height / 2;

/**
 * Nested radius: inner = outer − padding.
 *
 * A 20pt container with 6pt of padding holds a 14pt child. Nesting equal radii
 * makes the inner shape look pinched at the corners and is the fastest tell of
 * unconsidered design. Clamped at 0 so it degrades to square rather than
 * inverting.
 */
export const nest = (outer: number, padding: number) => Math.max(0, outer - padding);

/**
 * iOS draws continuous (squircle) curvature; Android does not support it and
 * ignores the property. Spread this onto every rounded surface — it is most of
 * why rounded corners look expensive on iOS and cheap everywhere else.
 */
export const curve: ViewStyle = Platform.select({
  ios: { borderCurve: 'continuous' },
  default: {},
}) as ViewStyle;

/* ------------------------------------------------------------------ *
 * Type — unchanged
 * ------------------------------------------------------------------ */

const family = {
  display: 'InstrumentSerif_400Regular',
  displayItalic: 'InstrumentSerif_400Regular_Italic',
  mono: 'IBMPlexMono_400Regular',
  monoLight: 'IBMPlexMono_300Light',
  monoMedium: 'IBMPlexMono_500Medium',
  monoSemi: 'IBMPlexMono_600SemiBold',
} as const;

export const fontFamily = family;

/**
 * The hierarchy is carried over intact — 128 → 48 → 56 → 36 → 15, with the
 * mid-range deliberately empty.
 *
 * One usage change for the light theme: **mono metadata is set in
 * `fgSecondary`, not `fg`.** Full-strength ink on cream reads cold and makes
 * every timestamp compete with the content. At `fgSecondary` the metadata
 * recedes into the paper, which is what it is for. This is enforced by
 * convention rather than by the token, since the same scale serves both
 * themes.
 */
export const type = {
  metric: {
    fontFamily: family.monoLight,
    fontSize: 128, lineHeight: 128, letterSpacing: -6,
    fontVariant: ['tabular-nums'],
  },
  metricSm: {
    fontFamily: family.monoLight,
    fontSize: 48, lineHeight: 50, letterSpacing: -2,
    fontVariant: ['tabular-nums'],
  },
  display: {
    fontFamily: family.display,
    fontSize: 56, lineHeight: 56, letterSpacing: -1.6,
  },
  title: {
    fontFamily: family.display,
    fontSize: 36, lineHeight: 38, letterSpacing: -0.8,
  },
  titleItalic: {
    fontFamily: family.displayItalic,
    fontSize: 36, lineHeight: 38, letterSpacing: -0.8,
  },
  /** Structural labels only. Never a sentence addressed to the user. */
  label: {
    fontFamily: family.monoMedium,
    fontSize: 11, lineHeight: 14, letterSpacing: 1.32, // 0.12em
    textTransform: 'uppercase',
  },
  labelSm: {
    fontFamily: family.monoMedium,
    fontSize: 10, lineHeight: 13, letterSpacing: 1.2, // 0.12em
    textTransform: 'uppercase',
  },
  body: {
    fontFamily: family.monoLight,
    fontSize: 15, lineHeight: 26, letterSpacing: 0,
  },
  bodyStrong: {
    fontFamily: family.mono,
    fontSize: 15, lineHeight: 26, letterSpacing: 0,
  },
  meta: {
    fontFamily: family.mono,
    fontSize: 12, lineHeight: 18, letterSpacing: 0,
    fontVariant: ['tabular-nums'],
  },
  control: {
    fontFamily: family.monoMedium,
    fontSize: 13, lineHeight: 16, letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
} satisfies Record<string, TextStyle>;

export type TypeToken = keyof typeof type;

/* ------------------------------------------------------------------ *
 * Light and texture
 * ------------------------------------------------------------------ */

/**
 * Shadows exist now, but barely: large radius, very low opacity, and
 * **cool-tinted, never black**. Light through cloud, not a drop shadow.
 *
 * A black shadow on warm paper turns the surrounding pixels grey and kills the
 * warmth locally — which is exactly the flat, clinical look a light theme
 * falls into. The shadow colour is the cool ink tone instead, so the darkening
 * stays in the same hue family as the rest of the shadow side.
 */
export const shadow = {
  /** Resting objects — tags, small controls. */
  soft: {
    shadowColor: '#2E332F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 1,
  },
  /** Sheets, the emphasis surface, anything genuinely lifted. */
  lifted: {
    shadowColor: '#2E332F',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 32,
    elevation: 4,
  },
} as const satisfies Record<string, ViewStyle>;

/**
 * Grain.
 *
 * Applied **once at the root** as a tiled overlay, never per-component — a
 * per-component grain would tile out of alignment at every boundary and read
 * as banding. Without it a light theme looks flat and clinical; this is the
 * whole nostalgia lever.
 */
export const texture = {
  grainOpacity: 0.035,
  grainTile: 128,
} as const;

/* ------------------------------------------------------------------ *
 * Motion — unchanged, except the inversion
 * ------------------------------------------------------------------ */

export const duration = {
  cut: 0,
  press: 120,
  /**
   * Going dark should feel like settling, not like a flash — so the two
   * directions are no longer symmetrical. Entering the dark surface is slower
   * and decelerates into place; returning to paper is quicker, the way waking
   * up is quicker than falling asleep.
   */
  invertIn: 520,
  invertOut: 360,
  draw: 700,
  sheet: 300,
  sheetOut: 220,
} as const;

export const ease = {
  out: Easing.bezier(0.23, 1, 0.32, 1),
  inOut: Easing.bezier(0.77, 0, 0.175, 1),
  drawer: Easing.bezier(0.32, 0.72, 0, 1),
  /** Long tail. For the settle into the dark surface. */
  settle: Easing.bezier(0.16, 1, 0.3, 1),
  linear: Easing.linear,
} as const;

export const spring = {
  press: { duration: 200, dampingRatio: 1 },
  snappy: { duration: 320, dampingRatio: 1 },
  gentle: { duration: 460, dampingRatio: 0.88 },
} as const;

export const reducedMotion = {
  travel: 0,
  duration: 100,
  easing: ease.out,
} as const;

/**
 * Never animate `borderRadius` — it is a layout property, so every frame
 * re-rasterises the shape off the UI thread. If a shape must change size,
 * animate `transform: scale` and let the radius scale with it, or cross-fade
 * between two shapes.
 */
export const NEVER_ANIMATE = ['borderRadius', 'width', 'height', 'top', 'left'] as const;

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

export const layout = {
  tabBarHeight: 56,
  tabBarClearance: 56 + space[8],
  /** Mono needs a narrower measure than a proportional face at the same size. */
  measure: 52,
  /** Inset for the emphasis surface, so its 24pt rounding is visible. */
  emphasisInset: space[4],
} as const;

export const tokens = {
  palette, color, tone, space, gutter, minTouch,
  radius, pill, nest, curve, type, fontFamily,
  shadow, texture, duration, ease, spring, reducedMotion,
  layout, hairline,
} as const;

export default tokens;
