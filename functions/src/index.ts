/**
 * Soft Focus Cloud Functions.
 *
 * Every paid or trust-sensitive path in the app lives here. The client holds
 * no API keys and no authority: it can render what these functions return and
 * nothing else.
 *
 *   mentorChat            Pro-gated AI mentor turn, with task function calling
 *   mentorStatus          Remaining daily messages + kill-switch state
 *   joinPod / leavePod    Pro-gated pod matchmaking
 *   moderatePodMessage    Safety classification on every new pod message
 *   revenueCatWebhook     Subscription lifecycle -> custom claim + mirror
 *   refreshEntitlement    Post-purchase reconciliation, no webhook race
 *   budgetKillSwitch      Billing budget -> config/flags
 *   sweepExpiredPods      Closes expired rooms and deletes their contents
 *   trimMentorHistory     Bounds per-user conversation growth
 */
export { mentorChat, mentorStatus } from './mentor';
export { joinPod, leavePod } from './pods';
export { moderatePodMessage } from './moderation';
export { revenueCatWebhook, refreshEntitlement } from './revenuecat';
export { budgetKillSwitch } from './budget';
export { sweepExpiredPods, trimMentorHistory } from './cleanup';
