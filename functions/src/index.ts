/**
 * Soft Focus Cloud Functions.
 *
 * Every paid or trust-sensitive path in the app lives here. The client holds
 * no API keys and no authority: it can render what these functions return and
 * nothing else.
 *
 *   mentorChat            Pro-gated AI mentor turn, with task function calling
 *   mentorStatus          Remaining daily messages + kill-switch state
 *   breakdownTask         Pro-gated: turns a big task into concrete steps
 *   joinPod / leavePod    Pro-gated pod matchmaking
 *   moderatePodMessage    Safety classification on every new pod message
 *   reportPodMessage      Member report -> human queue, auto-hide at 2
 *   alertOnModerationFlag Emails a raised flag so the 24h clock can be met
 *   deleteAccount         Erases the user, as 5.1.1(v) and Play require
 *   revenueCatWebhook     Subscription lifecycle -> custom claim + mirror
 *   refreshEntitlement    Post-purchase reconciliation, no webhook race
 *   budgetKillSwitch      Billing budget -> config/flags
 *   sweepExpiredPods      Closes expired rooms and deletes their contents
 *   trimMentorHistory     Bounds per-user conversation growth
 *   grantDevPro           Time-boxed Pro claim, development projects only
 *   revokeDevPro          Hands it back, to test the locked state
 */
export { mentorChat, mentorStatus } from './mentor';
export { breakdownTask } from './breakdown';
export { joinPod, leavePod } from './pods';
export { moderatePodMessage } from './moderation';
export { reportPodMessage, alertOnModerationFlag } from './reports';
export { deleteAccount } from './account';
export { revenueCatWebhook, refreshEntitlement } from './revenuecat';
export { budgetKillSwitch } from './budget';
export { sweepExpiredPods, trimMentorHistory } from './cleanup';
export { grantDevPro, revokeDevPro } from './devPro';
