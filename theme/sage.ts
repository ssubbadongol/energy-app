/**
 * Soft Focus — sage design system
 *
 * Translated from the Claude Design handoff ("Soft Focus wellness redesign").
 * Soft sage-green wellness aesthetic: white cards on a pale paper shell, deep
 * green ink, generous rounding, and low-opacity green-tinted shadows.
 *
 * Fonts: Quicksand for headings/UI, Nunito Sans for body copy.
 *
 * This is the live system for the five tabs. The legacy near-monochrome tokens
 * in ./tokens.ts remain only for the off-tab task screens and can be removed
 * once those are retired.
 */
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/* ------------------------------------------------------------------ *
 * Colour
 * ------------------------------------------------------------------ */

export const sage = {
  /** Pale paper shell behind every screen. */
  bg: '#f7faf7',
  /** Soft sage tints for the top gradient band / backdrop. */
  bgTintTop: '#d7e6dc',
  bgTintMid: '#cfe0d6',

  /** White cards and sheets. */
  surface: '#ffffff',
  /** Quiet fills — inputs, inactive pills, icon buttons. */
  fill: '#f3f7f4',
  fillAlt: '#f5f8f6',
  /** Green-tinted fills — selected, "today", soft chips. */
  fillGreen: '#e8f2ec',
  fillGreenAlt: '#eef5f0',

  /** Primary action green. */
  primary: '#7fb096',
  /** Primary when pressed / deeper. */
  primaryDeep: '#5d8a75',
  /** Text-on-fill green, links. */
  primaryInk: '#6d9382',
  /** Bright leaf accent — rings, bars, dots. */
  leaf: '#8fbfa4',
  leafSoft: '#a8cbb6',

  /** Ink — headings. */
  fg: '#37514a',
  /** Ink — body / card titles. */
  fgBody: '#3f5b50',
  /** Secondary text. */
  fgSecondary: '#8aa79b',
  /** Tertiary / meta. */
  fgMuted: '#93aea2',
  /** Faint — placeholders, disabled, decorative. */
  fgFaint: '#a9c0b4',

  /** Hairline rules and dividers. */
  rule: '#f1f6f3',
  ruleStrong: '#dfeae3',
  track: '#e4eee8',
  trackAlt: '#e7efe9',

  /** Disabled control fill. */
  disabled: '#d1d5db',

  /** Warm expiry / caution accent (pods). */
  clay: '#a58a72',
  clayFill: '#f4ece1',

  /** Destructive. */
  danger: '#b58179',
  dangerFill: '#f4eae8',
  dangerIcon: '#ef4444',

  /** On-primary text. */
  onPrimary: '#ffffff',
} as const;

/** The energy tiers — used across Today (tasks) and composers. */
export const energy = {
  high: { key: 'high', label: 'High', bg: '#e6f0ea', fg: '#5d8a75', bar: '#8fbfa4', barW: 26 },
  mid: { key: 'mid', label: 'Mid', bg: '#f3ece2', fg: '#a58a72', bar: '#d8bf9c', barW: 18 },
  low: { key: 'low', label: 'Low', bg: '#e6edf3', fg: '#6d879b', bar: '#a9c0d2', barW: 10 },
} as const;

export type EnergyKey = keyof typeof energy;

export const energyInsight: Record<EnergyKey, string> = {
  high: "You're at peak energy — good time for challenging tasks.",
  mid: 'Decent energy — tackle medium tasks or easier high-priority ones.',
  low: 'Low energy — stick to something simple or take a break.',
};

/* ------------------------------------------------------------------ *
 * Type
 * ------------------------------------------------------------------ */

export const font = {
  /** Quicksand — headings, titles, UI labels, buttons. */
  heading: 'Quicksand_600SemiBold',
  headingBold: 'Quicksand_700Bold',
  ui: 'Quicksand_500Medium',
  uiRegular: 'Quicksand_400Regular',
  /** Nunito Sans — body copy, meta, chat. */
  body: 'NunitoSans_400Regular',
  bodySemi: 'NunitoSans_600SemiBold',
  bodyBold: 'NunitoSans_700Bold',
  bodyLight: 'NunitoSans_300Light',
} as const;

export const text = {
  /** Big screen title — "Today", "Life", "Pods". */
  title: { fontFamily: font.heading, fontSize: 26, color: sage.fg },
  /** Section / card heading. */
  h2: { fontFamily: font.heading, fontSize: 17, color: sage.fgBody },
  cardTitle: { fontFamily: font.heading, fontSize: 15.5, color: sage.fgBody },
  /** Task / item title. */
  itemTitle: { fontFamily: font.heading, fontSize: 15, lineHeight: 20, color: sage.fgBody },
  /** Uppercase mono-ish label (set in Nunito Sans, tracked). */
  label: {
    fontFamily: font.bodySemi,
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: sage.primaryInk,
  },
  labelFaint: {
    fontFamily: font.bodySemi,
    fontSize: 10.5,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: sage.fgFaint,
  },
  /** Body copy. */
  body: { fontFamily: font.body, fontSize: 13.5, lineHeight: 20, color: sage.fgSecondary },
  meta: { fontFamily: font.body, fontSize: 12, color: sage.fgMuted },
  /** Chat/message body. */
  message: { fontFamily: font.body, fontSize: 14.5, lineHeight: 22 },
  /** Button label. */
  button: { fontFamily: font.heading, fontSize: 15, color: sage.onPrimary },
} satisfies Record<string, TextStyle>;

/* ------------------------------------------------------------------ *
 * Shape · space · shadow
 * ------------------------------------------------------------------ */

export const radius = {
  sm: 12,
  md: 16,
  pill: 14,
  card: 22,
  cardLg: 26,
  full: 9999,
} as const;

export const space = {
  1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32,
} as const;

/** Screen horizontal padding, matching the mockup's 22px gutter. */
export const gutter = 22;

export const curve: ViewStyle = Platform.select({
  ios: { borderCurve: 'continuous' },
  default: {},
}) as ViewStyle;

/** Low-opacity, green-tinted shadows. Light through leaves, never black. */
export const shadow = {
  soft: {
    shadowColor: '#587869',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 10,
    elevation: 1,
  },
  card: {
    shadowColor: '#587869',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 2,
  },
  lifted: {
    shadowColor: '#587869',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 4,
  },
} as const satisfies Record<string, ViewStyle>;

export default { sage, energy, energyInsight, font, text, radius, space, gutter, curve, shadow };
