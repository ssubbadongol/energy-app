/**
 * Deciding what the device and the server each owe each other.
 *
 * Pure, and separate from `taskStorage.ts` for one reason: that module imports
 * AsyncStorage and Firebase at the top, so nothing in it can be tested without
 * a device. This is the part that had the bug, so this is the part that needed
 * to be reachable from a test.
 *
 * ── The bug this exists to prevent ───────────────────────────────────────
 *
 * A task that is on the device but not on the server is ambiguous. It might
 * have been created offline and never pushed. It might have been deleted on
 * the server by the mentor. Those need opposite responses — upload it, or drop
 * it — and the old code always guessed "upload".
 *
 * So every deletion the mentor performed was undone. It deleted the document,
 * the mentor screen synced a second later, the task looked local-only, and it
 * was written straight back to Firestore. The mentor said "deleted" and the
 * task sat there, which is a particularly bad failure in an app whose whole
 * promise is that the list can be trusted.
 *
 * `synced` resolves the ambiguity: it is the set of ids this device has
 * actually seen on the server. Seen before and now absent means deleted. Never
 * seen means never pushed. Offline work is still safe, which is what the old
 * behaviour was protecting — it was just protecting it with a guess that was
 * wrong half the time.
 */
import type { Task } from './taskStorage';

export interface Reconciliation {
  /** The list the device should now hold. */
  merged: Task[];
  /** Local tasks the server has never seen, to push. */
  toUpload: Task[];
  /** Ids the server no longer has and that we should stop keeping. */
  deleted: number[];
  /** The replacement `synced` set. */
  syncedIds: Set<number>;
}

export function reconcile(
  local: Task[],
  remote: Task[],
  synced: ReadonlySet<number>,
): Reconciliation {
  const remoteById = new Map(remote.map((t) => [t.id, t]));
  const localById = new Map(local.map((t) => [t.id, t]));

  const missingRemotely = local.filter((t) => !remoteById.has(t.id));
  const deleted = missingRemotely.filter((t) => synced.has(t.id)).map((t) => t.id);
  const toUpload = missingRemotely.filter((t) => !synced.has(t.id));

  /*
    Remote wins field by field rather than document by document. Replacing the
    whole local task would drop anything the server's copy predates — which is
    how a due time set on an older task disappeared on the next cold start.
  */
  const merged = [
    ...remote.map((r) => {
      const l = localById.get(r.id);
      return l ? { ...l, ...r } : r;
    }),
    ...toUpload,
  ].sort((a, b) => a.id - b.id);

  /*
    Everything now in the list has demonstrably been synced, including the rows
    about to be pushed. Deleted ids are dropped rather than merely left out, so
    that an id which somehow came round again would not be mistaken for a
    deletion on the following pass.
  */
  const syncedIds = new Set(merged.map((t) => t.id));
  for (const id of deleted) syncedIds.delete(id);

  return { merged, toUpload, deleted, syncedIds };
}
