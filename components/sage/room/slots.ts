/**
 * Where things go in the room.
 *
 * The room is drawn in one fixed space and scaled to whatever box it is given,
 * so every position in here is in viewBox units and nothing needs to know the
 * screen size. It is 3:4 — tall, like the reference — which is as much height
 * as the Pomodoro screen can spare with a header above it and the controls
 * below.
 *
 * A slot is a rectangle a piece of furniture occupies, and the contract is that
 * an item draws itself inside its slot with its *bottom edge on the slot's
 * bottom edge*. That is what lets one item be swapped for another of a
 * different size without anything floating: a taller plant grows upward, it
 * does not hover.
 *
 * This is the seam a shop hangs off. Adding a buyable item means adding a
 * drawing to the catalogue that fits one of these, not touching the room.
 */

export const VB_W = 300;
export const VB_H = 400;

/** Where the wall meets the floor. */
export const HORIZON = 296;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SlotId =
  | 'shelf'
  | 'clock'
  | 'wallArt'
  | 'dresser'
  | 'dresserTop'
  | 'floorLeft'
  | 'rug';

export const SLOTS: Record<SlotId, Rect> = {
  /** High on the left wall. Books, trinkets, a small plant. */
  shelf: { x: 14, y: 54, w: 142, h: 62 },
  /** The timer lives here, so it is placed where the eye goes first. */
  clock: { x: 186, y: 34, w: 92, h: 92 },
  /** Empty by default — wall space a shop can fill. */
  wallArt: { x: 26, y: 150, w: 112, h: 92 },
  /** The big piece of furniture, standing on the floor. */
  dresser: { x: 170, y: 186, w: 122, h: 152 },
  /** Whatever stands on top of the dresser. Bottom edge = the dresser's top. */
  dresserTop: { x: 176, y: 138, w: 112, h: 48 },
  /** Floor space to the left of the mascot. */
  floorLeft: { x: 4, y: 214, w: 94, h: 122 },
  /** The rug, and the ground the mascot stands on. */
  rug: { x: 6, y: 318, w: 288, h: 78 },
};

/**
 * Where the mascot's feet belong, in viewBox fractions.
 *
 * On the rug, a little forward of its centre so the character reads as being in
 * the room rather than pasted against the back wall.
 */
export const STAND = { x: 140 / VB_W, y: 352 / VB_H };

/** How far along the rug it may wander, as a fraction of the room's width. */
export const ROAM = { left: 52 / VB_W, right: 34 / VB_W };

/** The clock's face, for positioning the readout that sits over it. */
export const CLOCK_FACE = {
  cx: (SLOTS.clock.x + SLOTS.clock.w / 2) / VB_W,
  cy: (SLOTS.clock.y + SLOTS.clock.h / 2) / VB_H,
  r: SLOTS.clock.w / 2 / VB_W,
};
