/**
 * Where things go in the room.
 *
 * The room is the whole Pomodoro tab, so it has to fill phones of very
 * different shapes. Two obvious approaches both fail: stretching one drawing to
 * fit squashes the furniture, and anchoring the wall to the ceiling and the
 * floor to the bottom makes them collide — on a short screen the dresser climbs
 * into the clock, because there is less wall between them.
 *
 * So the composition is fixed, at the size below, and the room *covers* the
 * screen rather than fitting inside it: scaled up until it fills, anchored to
 * the bottom and centred left to right. A tall screen loses a sliver off each
 * side wall; a short one loses some ceiling, which is the part of a room nobody
 * looks at. Nothing ever distorts, and nothing can collide, because the
 * arrangement is the same arrangement every time.
 *
 * The contract for an item is unchanged and is the thing that makes a shop
 * possible: draw inside your slot, with your bottom edge on the slot's bottom
 * edge. A taller plant grows upward; it does not hover.
 */

/** The room is composed at this size and scaled to cover. */
export const VB_W = 300;
export const VB_H = 560;

/** Where the wall meets the floor. */
export const HORIZON = 312;

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

/**
 * The tallest phones crop about 24 units off each side of the composition, so
 * anything that must stay whole lives inside this band. The rug is the
 * exception: it is meant to run off both edges, the way a rug in a photograph
 * does.
 */
export const SAFE_X = { left: 26, right: 274 };

/**
 * The arrangement.
 *
 * Low enough on the wall that the screen's own header clears the clock and the
 * shelf, far enough apart that the clock sits clear above whatever is standing
 * on the dresser, and inside SAFE_X so nothing is half-cropped on a tall phone.
 */
export const SLOTS: Record<SlotId, Rect> = {
  shelf: { x: 28, y: 96, w: 132, h: 62 },
  /** The timer. Opposite the shelf, and the first thing the eye lands on. */
  clock: { x: 166, y: 84, w: 104, h: 104 },
  /** Empty by default — wall space a shop can fill. */
  wallArt: { x: 30, y: 196, w: 108, h: 80 },

  /** Bottom edge is the dresser's top, so things stand on it. */
  dresserTop: { x: 166, y: 200, w: 100, h: 48 },
  dresser: { x: 160, y: 248, w: 112, h: 150 },
  floorLeft: { x: 26, y: 276, w: 90, h: 120 },
  /**
   * Forward of the furniture and off both edges — it is a rug in a room. Its
   * back edge runs just under the dresser and the plant, which stand on it.
   */
  rug: { x: -20, y: 392, w: 340, h: 86 },
};

/**
 * Where the mascot's feet belong: on the rug, left of the clock.
 *
 * Kept high enough on the rug that the controls, which take a fixed number of
 * dp while the room scales, do not sit on top of the character on a short
 * phone. They still cross its paws there, which reads as depth rather than as
 * the mascot being hidden.
 */
export const STAND = { x: 136, y: 432 };

/** How far along the rug it may wander, in viewBox units. */
export const ROAM = { left: 44, right: 48 };

export interface Projection {
  scale: number;
  offsetX: number;
  offsetY: number;
  /** viewBox point -> dp. */
  at: (x: number, y: number) => { x: number; y: number };
}

/**
 * How the room maps onto a screen of this size.
 *
 * The same transform react-native-svg applies for
 * `preserveAspectRatio="xMidYMax slice"`, worked out here too so that the
 * things drawn *over* the SVG — the clock's readout, the mascot — land in the
 * right place.
 */
export function project(width: number, height: number): Projection {
  const scale = Math.max(width / VB_W, height / VB_H);
  const offsetX = (width - VB_W * scale) / 2;
  const offsetY = height - VB_H * scale;
  return {
    scale,
    offsetX,
    offsetY,
    at: (x, y) => ({ x: offsetX + x * scale, y: offsetY + y * scale }),
  };
}
