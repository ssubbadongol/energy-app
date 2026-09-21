/**
 * Reconciling the device against Firestore.
 *
 * The first test here is a regression for a bug found on 2026-09-19: asking
 * the mentor to delete a task, being told it had been deleted, and watching
 * the task stay on the list. `delete_task` was doing its job; the sync was
 * putting the document straight back, because a task that is local and not
 * remote was always assumed to be one that had never been uploaded.
 *
 * The second test is the reason it was written that way, and it must keep
 * passing: a task created with no connection must survive, not be mistaken
 * for a deletion and silently thrown away. Getting one of these right at the
 * cost of the other is not a fix.
 *
 *   npm run test:unit
 */
import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { reconcile } from '../app/taskSync';
import type { Task } from '../app/taskStorage';

const mk = (id: number, over: Partial<Task> = {}): Task => ({
  id,
  name: `task ${id}`,
  priority: 'medium',
  energy: 'medium',
  time: 0,
  type: 'Task',
  completed: false,
  ...over,
});

describe('reconcile', () => {
  test('a task the server deleted goes away and is not pushed back', () => {
    // The exact shape of the bug: the mentor deleted task 2, the device still
    // has it, and the device knows it was on the server a moment ago.
    const local = [mk(1), mk(2), mk(3)];
    const remote = [mk(1), mk(3)];
    const synced = new Set([1, 2, 3]);

    const plan = reconcile(local, remote, synced);

    assert.deepEqual(plan.merged.map((t) => t.id), [1, 3], 'the deleted task must be gone');
    assert.deepEqual(plan.deleted, [2]);
    assert.deepEqual(plan.toUpload, [], 'it must not be re-uploaded — that was the bug');
    assert.equal(plan.syncedIds.has(2), false, 'and it must stop being tracked');
  });

  test('a task created offline survives and is queued for upload', () => {
    // Same shape as above from the server's point of view — local, not remote
    // — and the opposite correct answer. This is what the old behaviour was
    // protecting, and it must not be traded away to fix deletion.
    const local = [mk(1), mk(99)];
    const remote = [mk(1)];
    const synced = new Set([1]); // 99 has never been pushed

    const plan = reconcile(local, remote, synced);

    assert.deepEqual(plan.merged.map((t) => t.id), [1, 99], 'offline work is kept');
    assert.deepEqual(plan.toUpload.map((t) => t.id), [99]);
    assert.deepEqual(plan.deleted, []);
    assert.equal(plan.syncedIds.has(99), true, 'once pushed it counts as synced');
  });

  test('a failed push stays pushable rather than becoming a deletion', () => {
    // `mirrorUpsert` only records an id when the write succeeds. So a task
    // whose push failed looks exactly like an offline one, deliberately: it
    // gets retried, not discarded.
    const local = [mk(7)];
    const plan = reconcile(local, [], new Set());

    assert.deepEqual(plan.toUpload.map((t) => t.id), [7]);
    assert.deepEqual(plan.deleted, []);
  });

  test('a task the mentor added is adopted', () => {
    const plan = reconcile([mk(1)], [mk(1), mk(2, { name: 'from the mentor' })], new Set([1]));

    assert.deepEqual(plan.merged.map((t) => t.id), [1, 2]);
    assert.equal(plan.merged[1].name, 'from the mentor');
    assert.deepEqual(plan.toUpload, []);
  });

  test('remote wins field by field, not document by document', () => {
    // A server copy written before `dueTime` existed has no opinion about it,
    // and must not erase one the device holds. This is how a due time set on
    // an older task disappeared on the next cold start.
    const local = [mk(1, { name: 'old name', dueTime: '09:00', subtasks: [{ id: 'a', name: 'step', done: false }] })];
    const remote = [mk(1, { name: 'renamed by the mentor', completed: true })];

    const plan = reconcile(local, remote, new Set([1]));

    assert.equal(plan.merged[0].name, 'renamed by the mentor', 'the server is newer');
    assert.equal(plan.merged[0].completed, true);
    assert.equal(plan.merged[0].dueTime, '09:00', 'and silent about everything else');
    assert.equal(plan.merged[0].subtasks?.length, 1);
  });

  test('the result is ordered by id, so a re-render is not a reshuffle', () => {
    const plan = reconcile([mk(30)], [mk(20), mk(10)], new Set());
    assert.deepEqual(plan.merged.map((t) => t.id), [10, 20, 30]);
  });

  test('the synced set is exactly what the device now holds', () => {
    const plan = reconcile([mk(1), mk(2), mk(5)], [mk(1), mk(3)], new Set([1, 2]));

    // 2 was deleted on the server; 5 has never been pushed; 3 is new to us.
    assert.deepEqual(plan.merged.map((t) => t.id), [1, 3, 5]);
    assert.deepEqual([...plan.syncedIds].sort((a, b) => a - b), [1, 3, 5]);
  });

  test('an empty server with nothing ever synced is a first run, not a wipe', () => {
    // Someone who had tasks before the mirror existed. Everything uploads and
    // nothing is lost — the migration path the original code was built for.
    const local = [mk(1), mk(2), mk(3)];
    const plan = reconcile(local, [], new Set());

    assert.deepEqual(plan.merged.map((t) => t.id), [1, 2, 3]);
    assert.deepEqual(plan.toUpload.map((t) => t.id), [1, 2, 3]);
    assert.deepEqual(plan.deleted, []);
  });
});
