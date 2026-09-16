/**
 * Firestore security rules — executable proof.
 *
 * A rules review is an argument; this is the evidence. Every assertion here is
 * something someone claimed in a comment or a code review, run against the
 * real rules engine in the emulator.
 *
 * The cases are chosen to be the ones that would actually cost something if
 * they regressed — a user granting themselves Pro, reading someone else's
 * mentor history, posting to a pod they are not in, resetting their own rate
 * limit counter, or learning what the project spends.
 *
 * Run:  npm --prefix functions run test:rules
 *
 * Note on App Check: these tests run with it off, which is deliberate. They
 * prove what the *rules* guarantee on their own, so the result stands even if
 * Firestore's App Check enforcement is ever switched off. Nothing here should
 * pass because of a layer above it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import test, { after, before, describe } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(join(here, '..', '..', 'firestore.rules'), 'utf8');

const ALICE = 'uid_alice';
const BOB = 'uid_bob';
const POD = 'pod_1';

let env;

/** Alice, signed in and holding Pro via the server-written mirror. */
const alice = () => env.authenticatedContext(ALICE).firestore();
/** Bob, signed in with no subscription. */
const bob = () => env.authenticatedContext(BOB).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'soft-focus-rules-test',
    firestore: { rules: RULES, host: '127.0.0.1', port: 8080 },
  });

  // Seed the state the server would have written. `withSecurityRulesDisabled`
  // is the Admin SDK's view — exactly the paths a client must not be able to
  // reach itself.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', ALICE), { name: 'Alice', pro: true });
    await setDoc(doc(db, 'users', BOB), { name: 'Bob', pro: false });

    await setDoc(doc(db, 'users', ALICE, 'mentorMessages', 'm1'), { role: 'user', text: 'private' });
    await setDoc(doc(db, 'users', ALICE, 'counters', 'mentorDaily'), { date: '2026-09-15', count: 49 });

    await setDoc(doc(db, 'pods', POD), {
      topic: 'Overwhelm',
      isActive: true,
      memberCount: 1,
      aliasesUsed: ['Willow'],
    });
    await setDoc(doc(db, 'pods', POD, 'members', ALICE), { uid: ALICE, alias: 'Willow', active: true });
    await setDoc(doc(db, 'pods', POD, 'messages', 'msg1'), {
      uid: ALICE,
      alias: 'Willow',
      type: 'user',
      text: 'hello',
      hidden: false,
      moderation: { status: 'ok' },
    });

    await setDoc(doc(db, 'config', 'flags'), { mentorEnabled: true, reason: null });
    await setDoc(doc(db, 'config', 'devAccess'), { devProEnabled: true, uids: [ALICE] });
    await setDoc(doc(db, 'config', 'budgetState'), { lastBudgetCost: 42.5, lastBudgetAmount: 100 });
    await setDoc(doc(db, 'moderationFlags', 'f1'), { text: 'flagged', reviewed: false });
  });
});

after(async () => {
  await env?.cleanup();
});

/* ------------------------------------------------------------------ *
 * The one that would cost money
 * ------------------------------------------------------------------ */

describe('a user cannot grant themselves Pro', () => {
  test('cannot set pro on create', async () => {
    await assertFails(setDoc(doc(bob(), 'users', 'uid_fresh'), { name: 'x', pro: true }));
  });

  test('cannot set pro on update', async () => {
    await assertFails(updateDoc(doc(bob(), 'users', BOB), { pro: true }));
  });

  test('cannot set pro alongside a legitimate field', async () => {
    await assertFails(updateDoc(doc(bob(), 'users', BOB), { name: 'Bob2', pro: true }));
  });

  test('cannot set the other subscription fields either', async () => {
    await assertFails(updateDoc(doc(bob(), 'users', BOB), { proExpiresAt: new Date(2099, 0) }));
    await assertFails(updateDoc(doc(bob(), 'users', BOB), { proStore: 'dev_override' }));
  });

  test('cannot delete the pro field to escape an expiry', async () => {
    const { deleteField } = await import('firebase/firestore');
    await assertFails(updateDoc(doc(alice(), 'users', ALICE), { pro: deleteField() }));
  });

  test('can still edit their own profile', async () => {
    await assertSucceeds(updateDoc(doc(bob(), 'users', BOB), { name: 'Bob the Second' }));
  });
});

/* ------------------------------------------------------------------ *
 * Reading other people's data
 * ------------------------------------------------------------------ */

describe('a user cannot read data that is not theirs', () => {
  test("cannot read another user's profile", async () => {
    await assertFails(getDoc(doc(bob(), 'users', ALICE)));
  });

  test("cannot read another user's mentor conversation", async () => {
    await assertFails(getDoc(doc(bob(), 'users', ALICE, 'mentorMessages', 'm1')));
  });

  test("cannot list another user's tasks", async () => {
    await assertFails(getDocs(collection(bob(), 'users', ALICE, 'tasks')));
  });

  test("cannot read another user's block list", async () => {
    await assertFails(getDocs(collection(bob(), 'users', ALICE, 'blocks')));
  });

  test('an unauthenticated client gets nothing at all', async () => {
    await assertFails(getDoc(doc(anon(), 'users', ALICE)));
    await assertFails(getDoc(doc(anon(), 'config', 'flags')));
  });
});

/* ------------------------------------------------------------------ *
 * The rate limit counter
 * ------------------------------------------------------------------ */

describe('rate limiting is server-held, not client-held', () => {
  test('the owner can read their own usage', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'users', ALICE, 'counters', 'mentorDaily')));
  });

  test('the owner cannot reset their own counter', async () => {
    await assertFails(updateDoc(doc(alice(), 'users', ALICE, 'counters', 'mentorDaily'), { count: 0 }));
  });

  test('the owner cannot delete the counter to start again', async () => {
    await assertFails(deleteDoc(doc(alice(), 'users', ALICE, 'counters', 'mentorDaily')));
  });

  test('the owner cannot write a counter for a fresh day key', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users', ALICE, 'counters', 'mentorDaily'), { date: '2099-01-01', count: 0 }),
    );
  });
});

/* ------------------------------------------------------------------ *
 * Pods
 * ------------------------------------------------------------------ */

describe('pods are closed to non-members', () => {
  test('a non-member cannot read the room', async () => {
    await assertFails(getDocs(collection(bob(), 'pods', POD, 'messages')));
  });

  test('a non-member cannot post to the room', async () => {
    await assertFails(
      addDoc(collection(bob(), 'pods', POD, 'messages'), {
        uid: BOB,
        alias: 'Willow',
        type: 'user',
        text: 'intruder',
        createdAt: serverTimestamp(),
        moderation: { status: 'pending' },
        hidden: false,
      }),
    );
  });

  test('a member cannot post under a different alias', async () => {
    await assertFails(
      addDoc(collection(alice(), 'pods', POD, 'messages'), {
        uid: ALICE,
        alias: 'SomeoneElse',
        type: 'user',
        text: 'spoofed',
        createdAt: serverTimestamp(),
        moderation: { status: 'pending' },
        hidden: false,
      }),
    );
  });

  test('a member cannot post as another uid', async () => {
    await assertFails(
      addDoc(collection(alice(), 'pods', POD, 'messages'), {
        uid: BOB,
        alias: 'Willow',
        type: 'user',
        text: 'as bob',
        createdAt: serverTimestamp(),
        moderation: { status: 'pending' },
        hidden: false,
      }),
    );
  });

  test('a member cannot pre-mark their own message as checked', async () => {
    await assertFails(
      addDoc(collection(alice(), 'pods', POD, 'messages'), {
        uid: ALICE,
        alias: 'Willow',
        type: 'user',
        text: 'skip moderation',
        createdAt: serverTimestamp(),
        moderation: { status: 'ok' },
        hidden: false,
      }),
    );
  });

  test('nobody can edit or delete a posted message, not even its author', async () => {
    await assertFails(updateDoc(doc(alice(), 'pods', POD, 'messages', 'msg1'), { text: 'rewritten' }));
    await assertFails(deleteDoc(doc(alice(), 'pods', POD, 'messages', 'msg1')));
  });

  test('membership cannot be self-issued', async () => {
    await assertFails(
      setDoc(doc(bob(), 'pods', POD, 'members', BOB), { uid: BOB, alias: 'Fox', active: true }),
    );
  });

  test("a member cannot read another member's membership", async () => {
    await assertFails(getDoc(doc(bob(), 'pods', POD, 'members', ALICE)));
  });

  test('a member CAN post correctly', async () => {
    await assertSucceeds(
      addDoc(collection(alice(), 'pods', POD, 'messages'), {
        uid: ALICE,
        alias: 'Willow',
        type: 'user',
        text: 'a real message',
        createdAt: serverTimestamp(),
        moderation: { status: 'pending' },
        hidden: false,
      }),
    );
  });
});

/* ------------------------------------------------------------------ *
 * Blocking
 * ------------------------------------------------------------------ */

describe('blocking is private and shape-pinned', () => {
  test('a user can block someone', async () => {
    await assertSucceeds(
      setDoc(doc(alice(), 'users', ALICE, 'blocks', BOB), { createdAt: serverTimestamp() }),
    );
  });

  test('the blocked user cannot discover it', async () => {
    await assertFails(getDoc(doc(bob(), 'users', ALICE, 'blocks', BOB)));
  });

  test('a block cannot carry arbitrary data', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users', ALICE, 'blocks', 'uid_other'), {
        createdAt: serverTimestamp(),
        smuggled: 'x'.repeat(500),
      }),
    );
  });

  test('a user cannot block themselves', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users', ALICE, 'blocks', ALICE), { createdAt: serverTimestamp() }),
    );
  });
});

/* ------------------------------------------------------------------ *
 * Server-only collections — Finding 1 and 3
 * ------------------------------------------------------------------ */

describe('server-only state is unreachable', () => {
  test('the kill-switch flags stay readable — the client needs them', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'config', 'flags')));
  });

  test('budget telemetry is NOT readable (Finding 1)', async () => {
    await assertFails(getDoc(doc(alice(), 'config', 'budgetState')));
  });

  test('the dev-grant allowlist is NOT readable (Finding 3)', async () => {
    await assertFails(getDoc(doc(alice(), 'config', 'devAccess')));
  });

  test('nobody can write a kill switch', async () => {
    await assertFails(updateDoc(doc(alice(), 'config', 'flags'), { mentorEnabled: false }));
  });

  test('the moderation queue is unreachable in both directions', async () => {
    await assertFails(getDoc(doc(alice(), 'moderationFlags', 'f1')));
    await assertFails(setDoc(doc(alice(), 'moderationFlags', 'f2'), { text: 'x' }));
  });

  test('mentor history is read-only to its owner', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'users', ALICE, 'mentorMessages', 'm1')));
    await assertFails(
      setDoc(doc(alice(), 'users', ALICE, 'mentorMessages', 'forged'), { role: 'model', text: 'x' }),
    );
  });

  test('an unnamed collection is denied by the catch-all', async () => {
    await assertFails(getDoc(doc(alice(), 'somethingNew', 'x')));
    await assertFails(setDoc(doc(alice(), 'somethingNew', 'x'), { a: 1 }));
  });
});

/* ------------------------------------------------------------------ *
 * Task shape
 * ------------------------------------------------------------------ */

describe('task writes are bounded', () => {
  const validTask = {
    name: 'Write the thing',
    priority: 'high',
    energy: 'high',
    time: 30,
    type: 'Task',
    completed: false,
  };

  test('a well-formed task is accepted', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users', ALICE, 'tasks', 't1'), validTask));
  });

  test('an oversized name is rejected', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users', ALICE, 'tasks', 't2'), { ...validTask, name: 'x'.repeat(201) }),
    );
  });

  test('an unknown field is rejected', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users', ALICE, 'tasks', 't3'), { ...validTask, injected: true }),
    );
  });

  test('an out-of-range duration is rejected', async () => {
    await assertFails(setDoc(doc(alice(), 'users', ALICE, 'tasks', 't4'), { ...validTask, time: 99999 }));
  });

  test("a user cannot write into another user's tasks", async () => {
    await assertFails(setDoc(doc(bob(), 'users', ALICE, 'tasks', 't5'), validTask));
  });

  /**
   * Regression: `dueTime` was added to the Task model and to `toRemote` but
   * never to the rules' `hasOnly` list. Because `toRemote` always emits the
   * key, EVERY task the app wrote was rejected — silently, since
   * `mirrorUpsert` catches and only warns. The visible symptom was that the
   * mentor could not see any task created on the device.
   */
  test('a task carrying dueTime is accepted', async () => {
    await assertSucceeds(
      setDoc(doc(alice(), 'users', ALICE, 'tasks', 'dt1'), { ...validTask, dueTime: '14:30' }),
    );
  });

  test('a task carrying an explicitly null dueTime is accepted', async () => {
    await assertSucceeds(
      setDoc(doc(alice(), 'users', ALICE, 'tasks', 'dt2'), { ...validTask, dueTime: null }),
    );
  });
});

describe('subtasks', () => {
  const validTask = {
    name: 'Finish the assignment',
    priority: 'high',
    energy: 'high',
    time: 90,
    type: 'Deep focus',
    completed: false,
  };

  const steps = (n) =>
    Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `Step ${i + 1}`, done: false }));

  test('a task with a well-formed checklist is accepted', async () => {
    await assertSucceeds(
      setDoc(doc(alice(), 'users', ALICE, 'tasks', 'st1'), { ...validTask, subtasks: steps(5) }),
    );
  });

  test('an empty checklist is accepted', async () => {
    await assertSucceeds(
      setDoc(doc(alice(), 'users', ALICE, 'tasks', 'st2'), { ...validTask, subtasks: [] }),
    );
  });

  test('a task with no subtasks field still writes', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users', ALICE, 'tasks', 'st3'), validTask));
  });

  test('more than 12 steps is rejected', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users', ALICE, 'tasks', 'st4'), { ...validTask, subtasks: steps(13) }),
    );
  });

  test('subtasks must be a list, not a string', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users', ALICE, 'tasks', 'st5'), { ...validTask, subtasks: 'nope' }),
    );
  });

  test("a user cannot write subtasks onto another user's task", async () => {
    await assertFails(
      setDoc(doc(bob(), 'users', ALICE, 'tasks', 'st6'), { ...validTask, subtasks: steps(3) }),
    );
  });
});

assert.ok(RULES.includes('rules_version'), 'rules file loaded');
