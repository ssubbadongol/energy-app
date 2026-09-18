/**
 * Budget kill switch — executable proof.
 *
 * This is the only thing that actually stops money going out. Google Cloud
 * budgets *alert*; they do not cap. So if this function does not work, nothing
 * does, and the first you would know is the bill.
 *
 * It had never run. The deployed function is wired to a real topic and is
 * ACTIVE, but the logs contained nothing except deployment audits and startup
 * probes, and `config/budgetState` did not exist — so every claim about what it
 * does at 90% and at 100% was a claim about code nobody had executed.
 *
 * This drives the real handler through the emulator: a genuine Pub/Sub message
 * on the topic it subscribes to, then a read of what it wrote to Firestore.
 *
 * Run:  npm run test:killswitch
 *
 * WHAT THIS DOES NOT PROVE: that a billing budget exists in GCP and is
 * configured to publish to `softfocus-billing-alerts`. That wiring lives in the
 * Cloud console, not in this repo, and nothing here can see it. Verify it at
 * console.cloud.google.com/billing → Budgets & alerts → the budget's
 * "Manage notifications" → Pub/Sub topic.
 */
import assert from 'node:assert/strict';
import test, { after, before, describe } from 'node:test';

const PROJECT = 'soft-focus-app';
const TOPIC = 'softfocus-billing-alerts';
const PUBSUB = process.env.PUBSUB_EMULATOR_HOST ?? 'localhost:8085';
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST ?? 'localhost:8080';

/**
 * The emulator enforces `firestore.rules` on REST calls, and both documents
 * this test touches are deliberately closed to clients — `config/flags` is
 * write-denied and `config/budgetState` is denied outright. `Bearer owner` is
 * the emulator's admin bypass, which is the same privilege the function itself
 * has through the Admin SDK.
 */
const ADMIN = { Authorization: 'Bearer owner' };

const FLAGS = `http://${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/config/flags`;
const BUDGET_STATE = `http://${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/config/budgetState`;

/** The shape Google actually sends on a budget threshold notification. */
function notification(ratio, cost) {
  return {
    budgetDisplayName: 'Soft Focus monthly',
    costAmount: cost,
    budgetAmount: 50,
    alertThresholdExceeded: ratio,
    currencyCode: 'GBP',
  };
}

async function publish(payload) {
  const res = await fetch(`http://${PUBSUB}/v1/projects/${PROJECT}/topics/${TOPIC}:publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ data: Buffer.from(JSON.stringify(payload)).toString('base64') }],
    }),
  });
  assert.ok(res.ok, `publish failed: ${res.status} ${await res.text()}`);
}

/** Firestore's REST shape is verbose; pull out the plain values. */
function plain(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] =
      'booleanValue' in v ? v.booleanValue
      : 'stringValue' in v ? v.stringValue
      : 'doubleValue' in v ? v.doubleValue
      : 'integerValue' in v ? Number(v.integerValue)
      : 'nullValue' in v ? null
      : v;
  }
  return out;
}

async function readDoc(url) {
  const res = await fetch(url, { headers: ADMIN });
  if (!res.ok) return null;
  return plain((await res.json()).fields);
}

/**
 * The function is asynchronous behind a Pub/Sub delivery, so there is no
 * completion signal to await. Poll rather than sleep a fixed time — a fixed
 * wait is either flaky or slow, and usually both.
 */
async function waitFor(predicate, what, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await readDoc(FLAGS);
    if (last && predicate(last)) return last;
    await new Promise((r) => setTimeout(r, 400));
  }
  assert.fail(`timed out waiting for ${what}. Last flags: ${JSON.stringify(last)}`);
}

before(async () => {
  // Create the topic in the emulator. The functions emulator subscribes on
  // start; creating it here makes the test runnable from a cold emulator.
  await fetch(`http://${PUBSUB}/v1/projects/${PROJECT}/topics/${TOPIC}`, { method: 'PUT' });

  // Start from the healthy state, so a pass means the switch moved rather than
  // that it happened to already be where we wanted it.
  await fetch(`${FLAGS}?updateMask.fieldPaths=mentorEnabled&updateMask.fieldPaths=podModerationEnabled&updateMask.fieldPaths=podsEnabled&updateMask.fieldPaths=reason`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...ADMIN },
    body: JSON.stringify({
      fields: {
        mentorEnabled: { booleanValue: true },
        podModerationEnabled: { booleanValue: true },
        podsEnabled: { booleanValue: true },
        reason: { nullValue: null },
      },
    }),
  });
});

after(async () => {
  await fetch(`${FLAGS}?updateMask.fieldPaths=mentorEnabled&updateMask.fieldPaths=podModerationEnabled&updateMask.fieldPaths=podsEnabled&updateMask.fieldPaths=reason`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...ADMIN },
    body: JSON.stringify({
      fields: {
        mentorEnabled: { booleanValue: true },
        podModerationEnabled: { booleanValue: true },
        podsEnabled: { booleanValue: true },
        reason: { nullValue: null },
      },
    }),
  });
});

describe('budget kill switch', () => {
  test('50% changes nothing — an early ping is not an emergency', async () => {
    await publish(notification(0.5, 25));
    await new Promise((r) => setTimeout(r, 4000));
    const flags = await readDoc(FLAGS);
    assert.equal(flags.mentorEnabled, true, 'mentor should still be on at 50%');
    assert.equal(flags.podModerationEnabled, true, 'moderation should still be on at 50%');
  });

  test('90% pauses the mentor but keeps pods moderated', async () => {
    await publish(notification(0.9, 45));
    const flags = await waitFor((f) => f.mentorEnabled === false, 'the mentor to be paused');

    assert.equal(flags.mentorEnabled, false, 'mentor must be off at 90%');
    assert.equal(
      flags.podModerationEnabled,
      true,
      'moderation must survive 90% — a room going unmoderated is a safety failure, not a cost one',
    );
    assert.equal(flags.podsEnabled, true, 'pods themselves are never closed by a budget event');
    assert.ok(flags.reason, 'the client needs a human-readable reason to show');
  });

  test('100% also degrades pod moderation, but never closes pods', async () => {
    await publish(notification(1.0, 50));
    const flags = await waitFor(
      (f) => f.podModerationEnabled === false,
      'moderation to be disabled',
    );

    assert.equal(flags.mentorEnabled, false);
    assert.equal(flags.podModerationEnabled, false);
    assert.equal(flags.podsEnabled, true, 'a free peer-support room must not close over a model bill');
  });

  test('spend figures are written somewhere no client can read', async () => {
    const state = await readDoc(BUDGET_STATE);
    assert.ok(state, 'config/budgetState should exist after a budget event');
    assert.equal(state.lastBudgetRatio, 1, 'the ratio should be recorded');
    assert.equal(state.lastBudgetCost, 50, 'the spend should be recorded');

    // The whole point of the split: none of this may appear on config/flags,
    // which every signed-in user can read.
    const flags = await readDoc(FLAGS);
    for (const leak of ['lastBudgetCost', 'lastBudgetAmount', 'lastBudgetRatio']) {
      assert.equal(flags[leak], undefined, `${leak} must not be on the public flags document`);
    }
  });
});
