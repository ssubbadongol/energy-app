/**
 * Planning how the mascot gets from one place to another.
 *
 * Pure geometry, deliberately kept out of the component: the bug this exists to
 * fix was arithmetic, not animation. Travel used to be timed from distance
 * alone, so a short move was a single 300ms hop — the walk cycle barely got two
 * frames out before the mascot arrived and switched to standing still, which is
 * what "the walking animation works for a bit and instantly changes" looks
 * like from the outside.
 *
 * Now distance sets the pace and `MIN_WALK_MS` sets the floor. A trip too short
 * to fill that floor is not taken faster; it is taken the long way round, by
 * ambling off in the other direction first. So a walk always lasts long enough
 * to read as walking.
 *
 * Only the sideways part of a move is walked. Going up or down is a jump —
 * there is nothing to walk along in that direction — which `planJump` sizes.
 */

export interface Point {
  x: number;
  y: number;
}

export interface WalkPlan {
  /** One landing point per hop, in order. */
  steps: Point[];
  /** Total time on its feet, in ms. */
  durationMs: number;
  /** True when a detour was added to make the walk worth watching. */
  detoured: boolean;
}

/** Walking pace, in dp per second. */
export const WALK_SPEED = 105;
/** The least time a walk may take, however short the trip. */
export const MIN_WALK_MS = 1500;
/** One hop of the walk cycle. */
export const HOP_MS = 300;
/**
 * Long walks are capped rather than crossing the screen at a crawl. Set so the
 * cap only bites past roughly a screen's diagonal — everything shorter, which
 * is every trip between two cards, is walked at true pace.
 */
export const MAX_HOPS = 18;

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** Total length of a polyline. */
function routeLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

/** Resample a polyline into `hops` evenly spaced points, ending at the last. */
function resample(points: Point[], hops: number): Point[] {
  const total = routeLength(points);
  const out: Point[] = [];

  for (let h = 1; h <= hops; h++) {
    let want = (total * h) / hops;
    let i = 1;
    while (i < points.length - 1) {
      const leg = dist(points[i - 1], points[i]);
      if (want <= leg) break;
      want -= leg;
      i++;
    }
    const leg = dist(points[i - 1], points[i]) || 1;
    const t = Math.min(1, want / leg);
    out.push({
      x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
      y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
    });
  }

  // Floating point can leave the last step a hair short of the target.
  out[out.length - 1] = points[points.length - 1];
  return out;
}

/**
 * Plan a walk from one point to another, staying inside [minX, maxX].
 */
export function planWalk(from: Point, to: Point, minX: number, maxX: number): WalkPlan {
  let route: Point[] = [from, to];
  let detoured = false;

  const directMs = (dist(from, to) / WALK_SPEED) * 1000;
  if (directMs < MIN_WALK_MS) {
    // Set off the other way first, then come back for it. Half the shortfall,
    // because the detour is walked twice — out and back.
    const away = to.x >= from.x ? -1 : 1;
    const reach = ((MIN_WALK_MS - directMs) / 1000) * WALK_SPEED * 0.5;
    const detourX = Math.max(minX, Math.min(maxX, from.x + away * reach));
    // A detour clamped to nothing is no detour; don't claim one.
    if (Math.abs(detourX - from.x) > 8) {
      route = [from, { x: detourX, y: from.y }, to];
      detoured = true;
    }
  }

  const total = routeLength(route);
  const hops = Math.max(1, Math.min(MAX_HOPS, Math.round(total / (WALK_SPEED * (HOP_MS / 1000)))));

  return { steps: resample(route, hops), durationMs: hops * HOP_MS, detoured };
}


export interface JumpPlan {
  /** Where each hop lands, in order. */
  steps: number[];
  /** How high above the lower of its two ends each hop arcs. */
  lift: number;
  /** One hop, in ms. */
  hopMs: number;
  durationMs: number;
}

/** Above this far in one go, the climb is broken into more than one hop. */
export const JUMP_SPAN = 190;
export const MAX_JUMPS = 3;

/**
 * Size a jump between two heights.
 *
 * Short drops are one hop; a long one is split, because a single arc over half
 * the screen reads as being thrown rather than jumping. Both the arc and the
 * time grow with the climb, but with a ceiling — a hop to the next card and a
 * hop across the screen should still look like the same animal.
 */
export function planJump(fromY: number, toY: number): JumpPlan {
  const climb = Math.abs(toY - fromY);
  const hops = Math.max(1, Math.min(MAX_JUMPS, Math.round(climb / JUMP_SPAN)));

  const steps: number[] = [];
  for (let i = 1; i <= hops; i++) steps.push(fromY + ((toY - fromY) * i) / hops);

  const hopMs = 300 + Math.min(220, climb * 0.5);
  return { steps, lift: 26 + Math.min(26, climb * 0.16), hopMs, durationMs: hops * hopMs };
}
