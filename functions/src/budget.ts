/**
 * Budget-triggered kill switch.
 *
 * GCP billing budgets publish to a Pub/Sub topic. This handler reads the
 * spend-to-budget ratio off those notifications and writes `config/flags`,
 * which the mentor and the pod moderator both check before spending anything.
 *
 * The thresholds are staged rather than binary, because the two paid features
 * are not equally sheddable:
 *
 *   >= 90%  moderation stays on, the mentor stops calling Gemini.
 *           The mentor is the expensive one and it degrades to a polite notice.
 *   >= 100% moderation stops too. Pods keep working unmoderated, flagged in
 *           logs, rather than the room going dark.
 *
 * Nothing here ever disables pods themselves — a peer-support room that costs
 * nothing to run should not close because a model bill got large.
 */
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { logger } from 'firebase-functions/v2';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './admin';
import { paths } from './config';
import { invalidateFlagsCache } from './flags';

/** Topic the billing budget publishes to. Created in the GCP console. */
export const BILLING_TOPIC = 'softfocus-billing-alerts';

interface BudgetNotification {
  budgetDisplayName?: string;
  costAmount?: number;
  budgetAmount?: number;
  /** Present on threshold-rule notifications: 0.5, 0.9, 1.0, ... */
  alertThresholdExceeded?: number;
  currencyCode?: string;
}

export const budgetKillSwitch = onMessagePublished(
  {
    topic: BILLING_TOPIC,
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
    maxInstances: 3,
  },
  async (event) => {
    let payload: BudgetNotification;
    try {
      payload = (event.data.message.json ?? {}) as BudgetNotification;
    } catch {
      logger.error('Budget notification was not JSON');
      return;
    }

    const { costAmount, budgetAmount, alertThresholdExceeded, budgetDisplayName, currencyCode } = payload;

    // Prefer the threshold the budget itself reports; fall back to the ratio.
    const ratio =
      alertThresholdExceeded ??
      (typeof costAmount === 'number' && typeof budgetAmount === 'number' && budgetAmount > 0
        ? costAmount / budgetAmount
        : null);

    if (ratio === null) {
      logger.info('Budget notification with no usable threshold', { payload });
      return;
    }

    const mentorEnabled = ratio < 0.9;
    const podModerationEnabled = ratio < 1.0;

    const reason =
      ratio >= 1.0
        ? 'Monthly AI budget reached — mentor paused and pod moderation degraded.'
        : ratio >= 0.9
          ? 'Monthly AI budget at 90% — mentor paused to stay within budget.'
          : null;

    const current = await db.doc(paths.configFlags).get();
    const before = current.data() ?? {};

    // Only write on an actual change, so a 50% ping every few hours does not
    // churn the doc (and the instance caches that read it).
    if (
      before.mentorEnabled === mentorEnabled &&
      before.podModerationEnabled === podModerationEnabled
    ) {
      logger.info('Budget alert did not change flags', { ratio, mentorEnabled, podModerationEnabled });
      return;
    }

    /**
     * Two documents, and the split is a security boundary rather than tidiness.
     *
     * `config/flags` is readable by any signed-in user — which is everyone who
     * installs the app, because auth is anonymous and automatic. So it carries
     * only what the client legitimately needs to render an honest notice.
     *
     * The spend figures go somewhere no client can reach. They are
     * commercially confidential, and publishing the ratio also hands anyone a
     * live progress bar towards the kill switch: drive spend to 90% and the
     * mentor goes off for every paying subscriber. Making that unmeasurable
     * does not make it impossible, but it removes the feedback loop that turns
     * a theoretical nuisance into something somebody finishes.
     */
    await db.doc(paths.configFlags).set(
      {
        mentorEnabled,
        podModerationEnabled,
        // Pods themselves are never closed by a budget event.
        podsEnabled: before.podsEnabled !== false,
        reason,
        source: 'budget_alert',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await db.doc(paths.configBudgetState).set(
      {
        lastBudgetRatio: ratio,
        lastBudgetName: budgetDisplayName ?? null,
        lastBudgetCost: costAmount ?? null,
        lastBudgetAmount: budgetAmount ?? null,
        lastBudgetCurrency: currencyCode ?? null,
        mentorEnabled,
        podModerationEnabled,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    invalidateFlagsCache();

    logger.warn('Budget kill switch applied', {
      ratio,
      mentorEnabled,
      podModerationEnabled,
      budgetDisplayName,
    });
  },
);
