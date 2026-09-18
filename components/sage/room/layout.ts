/**
 * What is currently in the room.
 *
 * A layout is just a list of item ids per slot, which is the whole point: it is
 * plain data, so a shop can store one per user, and changing the room means
 * changing this object rather than any drawing code.
 *
 * Slots hold a list rather than a single item because some of them genuinely
 * take more than one thing — a dresser top has a mirror *and* a drink on it.
 */
import { CATALOGUE, type RoomItem } from './items';
import type { SlotId } from './slots';

export type RoomLayout = Partial<Record<SlotId, string[]>>;

/** What every room starts with, before anything is bought. */
export const DEFAULT_LAYOUT: RoomLayout = {
  shelf: ['shelf.books'],
  clock: ['clock.wall'],
  wallArt: ['wall.bare'],
  dresser: ['dresser.cream'],
  dresserTop: ['dresserTop.mirror', 'dresserTop.drink'],
  floorLeft: ['floor.fiddleLeaf'],
  rug: ['rug.round'],
};

/**
 * Resolve a layout to the items it names, in the order they should be drawn.
 *
 * Unknown ids are skipped rather than thrown on: a saved room that mentions an
 * item this build does not have — an older client after a shop update, say —
 * should come up missing one ornament, not fail to render.
 */
export function resolveLayout(layout: RoomLayout): { slot: SlotId; item: RoomItem }[] {
  const out: { slot: SlotId; item: RoomItem }[] = [];
  for (const [slot, ids] of Object.entries(layout) as [SlotId, string[]][]) {
    for (const id of ids ?? []) {
      const item = CATALOGUE[id];
      if (item) out.push({ slot, item });
    }
  }
  return out;
}

/**
 * Put an item in a slot, replacing what was there.
 *
 * Here for the shop to call. It keeps the "an item only fits its own slot" rule
 * in one place rather than trusting every caller to know it.
 */
export function place(layout: RoomLayout, id: string): RoomLayout {
  const item = CATALOGUE[id];
  if (!item) return layout;
  return { ...layout, [item.slot]: [id] };
}
