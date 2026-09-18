/**
 * The catalogue: every piece of furniture the room knows how to draw.
 *
 * An item is a name, the slot it fits, and a function that draws it. It gets
 * its slot's rectangle and the room's live state, and must draw inside that
 * rectangle with its bottom edge on the slot's bottom edge — see slots.ts for
 * why. Nothing here reaches outside its own slot, which is what makes items
 * interchangeable.
 *
 * To add a shop item: write the drawing, add it to CATALOGUE with the slot it
 * belongs in, and it can be placed by id. Nothing in Room.tsx or the Pomodoro
 * screen has to change.
 */
import { Fragment, type ReactNode } from 'react';
import { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';
import { clockTint, room } from './palette';
import type { Rect as SlotRect, SlotId } from './slots';

/** What the room can tell an item about the moment it is being drawn in. */
export interface RoomState {
  /** 1 at the start of a phase, 0 when it runs out. */
  progress: number;
  /** Breaks tint the clock differently from focus blocks. */
  onBreak: boolean;
  /** Ticks once a second while the timer runs; drives the clock's hand. */
  tick: number;
  running: boolean;
}

export interface RoomItem {
  id: string;
  /** Shown in a shop listing. */
  name: string;
  slot: SlotId;
  /** The still parts. Drawn once, into the room's own canvas. */
  draw: (r: SlotRect, s: RoomState) => ReactNode;
  /**
   * Parts that should drift in the draught. Drawn into a layer the room rocks
   * very slightly, which is most of what stops the scene looking like a poster.
   * Leaves belong here; the pot they are in does not.
   */
  breeze?: (r: SlotRect, s: RoomState) => ReactNode;
  /** A point, in viewBox units, that gives off steam. */
  steam?: (r: SlotRect) => { x: number; y: number };
}

const LINE = 2.4;

/** A rounded rect with the room's one outline. */
function Box({
  x, y, w, h, r = 4, fill,
}: { x: number; y: number; w: number; h: number; r?: number; fill: string }) {
  return (
    <Rect x={x} y={y} width={w} height={h} rx={r} fill={fill} stroke={room.ink} strokeWidth={LINE} />
  );
}

/** An arc along a circle, used for the clock's rim. */
function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(from);
  const [x1, y1] = p(to);
  const large = to - from > Math.PI ? 1 : 0;
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

/* ------------------------------------------------------------------ *
 * Wall
 * ------------------------------------------------------------------ */

const shelf: RoomItem = {
  id: 'shelf.books',
  name: 'Shelf of books',
  slot: 'shelf',
  draw: (r) => {
    const plankY = r.y + r.h - 12;
    const book = (x: number, h: number, w: number, fill: string) => (
      <Box key={x} x={x} y={plankY - h} w={w} h={h} r={1.5} fill={fill} />
    );
    return (
      <G>
        {/* brackets, then the plank on top of them */}
        <Path
          d={`M${r.x + 20},${plankY + 6} l10,16 M${r.x + r.w - 34},${plankY + 6} l-10,16`}
          stroke={room.ink}
          strokeWidth={LINE}
          strokeLinecap="round"
          fill="none"
        />
        <Box x={r.x} y={plankY} w={r.w} h={8} r={3} fill={room.cream} />
        {book(r.x + 10, 40, 8, room.bookTeal)}
        {book(r.x + 20, 46, 7, room.paper)}
        {book(r.x + 28, 36, 9, room.bookYellow)}
        {book(r.x + 39, 44, 7, room.bookClay)}
        {/* a stacked pair and a trinket */}
        <Box x={r.x + 56} y={plankY - 12} w={34} h={12} r={3} fill={room.bookYellow} />
        <Ellipse
          cx={r.x + 73}
          cy={plankY - 20}
          rx={9}
          ry={10}
          fill={room.cream}
          stroke={room.ink}
          strokeWidth={LINE}
        />
        {/* a cutting in a jar, leaning */}
        <Box x={r.x + 100} y={plankY - 26} w={18} h={26} r={4} fill={room.paper} />
        <Path
          d={`M${r.x + 109},${plankY - 26} C${r.x + 106},${plankY - 46} ${r.x + 116},${plankY - 52} ${r.x + 112},${plankY - 66}`}
          stroke={room.leafDark}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
        <Ellipse cx={r.x + 104} cy={plankY - 52} rx={7} ry={4.5} fill={room.leaf} stroke={room.ink} strokeWidth={1.8} transform={`rotate(-28 ${r.x + 104} ${plankY - 52})`} />
        <Ellipse cx={r.x + 119} cy={plankY - 60} rx={7} ry={4.5} fill={room.leaf} stroke={room.ink} strokeWidth={1.8} transform={`rotate(24 ${r.x + 119} ${plankY - 60})`} />
      </G>
    );
  },
};

/**
 * The clock, which is also the timer.
 *
 * The rim drains as the phase runs down, so the room itself shows how long is
 * left; the exact figures are drawn over the face by the stage, in the app's
 * own type rather than as SVG text.
 */
const clock: RoomItem = {
  id: 'clock.wall',
  name: 'Wall clock',
  slot: 'clock',
  draw: (r, s) => {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const rim = r.w / 2 - 3;
    const tint = s.onBreak ? clockTint.break : clockTint.focus;
    const start = -Math.PI / 2;
    const sweep = Math.max(0.0001, Math.min(1, s.progress)) * Math.PI * 2;
    // The second hand, a small dot travelling the rim once a minute.
    const hand = start + (s.tick % 60) * (Math.PI / 30);

    return (
      <G>
        <Circle cx={cx} cy={cy} r={rim} fill={room.paper} stroke={room.ink} strokeWidth={LINE} />
        {/* the rim as the remaining time */}
        <Circle cx={cx} cy={cy} r={rim - 5} fill="none" stroke={room.creamShade} strokeWidth={6} />
        <Path
          d={arcPath(cx, cy, rim - 5, start, start + sweep)}
          fill="none"
          stroke={tint}
          strokeWidth={6}
          strokeLinecap="round"
        />
        {/* hour ticks */}
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * Math.PI) / 6;
          const inner = rim - 13;
          const outer = rim - 9.5;
          return (
            <Line
              key={i}
              x1={cx + inner * Math.cos(a)}
              y1={cy + inner * Math.sin(a)}
              x2={cx + outer * Math.cos(a)}
              y2={cy + outer * Math.sin(a)}
              stroke={room.inkSoft}
              strokeWidth={i % 3 === 0 ? 2.4 : 1.4}
              strokeLinecap="round"
            />
          );
        })}
        {s.running && (
          <Circle
            cx={cx + (rim - 11) * Math.cos(hand)}
            cy={cy + (rim - 11) * Math.sin(hand)}
            r={2.6}
            fill={tint}
          />
        )}
      </G>
    );
  },
};

/** Nothing on the wall. The default for a slot a shop can fill. */
const bare: RoomItem = { id: 'wall.bare', name: 'Bare wall', slot: 'wallArt', draw: () => null };

/* ------------------------------------------------------------------ *
 * Floor
 * ------------------------------------------------------------------ */

const dresser: RoomItem = {
  id: 'dresser.cream',
  name: 'Cream dresser',
  slot: 'dresser',
  draw: (r) => {
    const bodyH = r.h - 20;
    const drawerH = (bodyH - 26) / 3;
    return (
      <G>
        {/* legs, splayed slightly, behind the body */}
        <Path
          d={`M${r.x + 16},${r.y + bodyH - 4} l-7,22 M${r.x + r.w - 16},${r.y + bodyH - 4} l7,22`}
          stroke={room.ink}
          strokeWidth={6}
          strokeLinecap="round"
        />
        <Box x={r.x} y={r.y} w={r.w} h={bodyH} r={8} fill={room.cream} />
        {/* the top surface, a touch darker so it reads as a plane */}
        <Path
          d={`M${r.x + 3},${r.y + 13} h${r.w - 6}`}
          stroke={room.ink}
          strokeWidth={LINE}
          strokeLinecap="round"
        />
        {[0, 1, 2].map((i) => {
          const y = r.y + 20 + i * (drawerH + 4);
          return (
            <Fragment key={i}>
              <Box x={r.x + 10} y={y} w={r.w - 20} h={drawerH} r={5} fill={room.tan} />
              <Path
                d={`M${r.x + r.w / 2 - 14},${y + drawerH / 2} q14,7 28,0`}
                stroke={room.ink}
                strokeWidth={3}
                fill="none"
                strokeLinecap="round"
              />
            </Fragment>
          );
        })}
      </G>
    );
  },
};

const mirror: RoomItem = {
  id: 'dresserTop.mirror',
  name: 'Vanity mirror',
  slot: 'dresserTop',
  draw: (r) => {
    const cx = r.x + r.w - 26;
    const base = r.y + r.h;
    return (
      <G>
        <Path d={`M${cx},${base - 12} v-10`} stroke={room.ink} strokeWidth={4} strokeLinecap="round" />
        <Path
          d={`M${cx - 13},${base} q13,-9 26,0`}
          fill={room.cream}
          stroke={room.ink}
          strokeWidth={LINE}
        />
        <Ellipse
          cx={cx}
          cy={base - 32}
          rx={15}
          ry={19}
          fill={room.paper}
          stroke={room.ink}
          strokeWidth={LINE}
        />
        <Path
          d={`M${cx - 5},${base - 38} l4,10 M${cx + 2},${base - 34} l3,7`}
          stroke={room.creamShade}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      </G>
    );
  },
};

const drink: RoomItem = {
  id: 'dresserTop.drink',
  name: 'Iced coffee',
  slot: 'dresserTop',
  draw: (r) => {
    const x = r.x + 14;
    const base = r.y + r.h;
    return (
      <G>
        {/* coaster */}
        <Ellipse cx={x + 13} cy={base - 1} rx={19} ry={5} fill={room.creamShade} stroke={room.ink} strokeWidth={LINE} />
        <Path
          d={`M${x + 1},${base - 26} l2.5,22 q9.5,5 19,0 l2.5,-22 Z`}
          fill={room.glass}
          stroke={room.ink}
          strokeWidth={LINE}
        />
        <Path d={`M${x + 3},${base - 17} q10.5,5 20,0 l-2,13 q-8,4 -16,0 Z`} fill={room.drink} />
        <Path d={`M${x + 18},${base - 26} l6,-16`} stroke={room.ink} strokeWidth={3} strokeLinecap="round" />
      </G>
    );
  },
  steam: (r) => ({ x: r.x + 24, y: r.y + r.h - 30 }),
};

const plant: RoomItem = {
  id: 'floor.fiddleLeaf',
  name: 'Fiddle-leaf fig',
  slot: 'floorLeft',
  draw: (r) => {
    const cx = r.x + r.w / 2;
    const base = r.y + r.h;
    const potH = 34;
    const potTop = base - potH;
    return (
      <G>
        <Path
          d={`M${cx},${potTop} C${cx - 3},${potTop - 30} ${cx + 4},${potTop - 52} ${cx},${potTop - 78}`}
          stroke={room.woodDark}
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d={`M${cx - 23},${potTop} h46 l-6,${potH} h-34 Z`}
          fill={room.terracotta}
          stroke={room.ink}
          strokeWidth={LINE}
        />
        <Box x={cx - 27} y={potTop - 8} w={54} h={11} r={4} fill={room.terracottaDark} />
      </G>
    );
  },
  breeze: (r) => {
    const cx = r.x + r.w / 2;
    const potTop = r.y + r.h - 34;
    const leaf = (dx: number, dy: number, rot: number, rx: number, ry: number, fill: string) => (
      <Ellipse
        key={`${dx},${dy}`}
        cx={cx + dx}
        cy={potTop - dy}
        rx={rx}
        ry={ry}
        fill={fill}
        stroke={room.ink}
        strokeWidth={LINE}
        transform={`rotate(${rot} ${cx + dx} ${potTop - dy})`}
      />
    );
    return (
      <G>
        {leaf(-22, 30, -32, 18, 12, room.leaf)}
        {leaf(21, 40, 34, 17, 11, room.leafDark)}
        {leaf(-20, 60, -22, 16, 11, room.leafDark)}
        {leaf(20, 70, 26, 15, 10, room.leaf)}
        {leaf(-2, 88, -6, 15, 11, room.leaf)}
      </G>
    );
  },
};

const rug: RoomItem = {
  id: 'rug.round',
  name: 'Round rug',
  slot: 'rug',
  draw: (r) => {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    return (
      <G>
        <Ellipse cx={cx} cy={cy} rx={r.w / 2} ry={r.h / 2} fill={room.rugOuter} stroke={room.ink} strokeWidth={LINE} />
        <Ellipse cx={cx} cy={cy} rx={r.w / 2 - 16} ry={r.h / 2 - 9} fill={room.rugMid} />
        <Ellipse cx={cx} cy={cy} rx={r.w / 2 - 52} ry={r.h / 2 - 22} fill={room.rugInner} />
      </G>
    );
  },
};

/* ------------------------------------------------------------------ *
 * The catalogue
 * ------------------------------------------------------------------ */

export const CATALOGUE: Record<string, RoomItem> = Object.fromEntries(
  [shelf, clock, bare, dresser, mirror, drink, plant, rug].map((i) => [i.id, i]),
);

/** Every item that fits a given slot — what a shop would list for it. */
export function itemsForSlot(slot: SlotId): RoomItem[] {
  return Object.values(CATALOGUE).filter((i) => i.slot === slot);
}
