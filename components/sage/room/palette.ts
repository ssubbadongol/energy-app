/**
 * The room's colours.
 *
 * Warmer than the rest of the app on purpose. The reference for this scene is a
 * cosy bedroom — dusty plaster, wood floor, cream furniture — and the mascot is
 * a red panda, which sits badly on the sage green the rest of the app is built
 * from. The sage still shows up, but as the accent rather than the ground: the
 * clock rim, the plant, the odd book spine. That keeps the room recognisably
 * part of Soft Focus without painting a bedroom mint.
 *
 * Everything is flat fill plus one dark outline, which is the whole of the
 * style. `ink` is the only line colour in the room; nothing draws its own.
 */
export const room = {
  /** The single outline colour. Every shape in the room uses it. */
  ink: '#6d5244',
  /** A lighter line for detail that should not read as a silhouette edge. */
  inkSoft: '#9c7d6a',

  wallTop: '#e6d3cd',
  wallBottom: '#ddc6bf',
  skirting: '#cbb0a6',

  floor: '#b08a72',
  floorDark: '#9d7760',

  rugOuter: '#d8b9a4',
  rugMid: '#f3e8da',
  rugInner: '#c49174',

  /** Cream furniture, as in the reference. */
  cream: '#fbf3e4',
  creamShade: '#f0e3cf',
  /** The drawer fronts. */
  tan: '#f0c982',
  tanShade: '#e0b468',

  wood: '#c9a17c',
  woodDark: '#a87f5e',

  terracotta: '#c8815a',
  terracottaDark: '#ab6a47',

  leaf: '#8dbb7a',
  leafDark: '#6f9b5e',
  /** The app's own green, kept as the accent that ties the room to the app. */
  sageAccent: '#7fb096',

  glass: '#e9f0ef',
  drink: '#b9764c',

  paper: '#fdf8ef',
  bookTeal: '#6aa89b',
  bookYellow: '#efc76b',
  bookClay: '#c98a6d',
} as const;

/** Phase tints for the clock rim, so the room answers the timer. */
export const clockTint = {
  focus: '#7fb096',
  break: '#e0a878',
} as const;
