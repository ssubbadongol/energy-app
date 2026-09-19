/**
 * Crash reporting and analytics.
 *
 * Until now there was neither, which meant a crash on a device nobody here
 * owns was simply invisible — the first sign would have been a one-star
 * review. Both of these are free and unlimited on the Firebase project that
 * already exists.
 *
 * The hard rule, and the reason the event list below is a closed union rather
 * than a `string`: **no content, ever**. Not a task name, not a word of a
 * mentor conversation, not a pod message, not an email address. People use
 * this app to write down that they cannot get out of bed. That belongs in
 * Firestore under their own uid and nowhere else — certainly not in an
 * analytics pipeline, and not in a crash report.
 *
 * What does get attached to a crash is the uid, because a crash you cannot tie
 * to an account is a crash you usually cannot reproduce. That is disclosed in
 * the privacy policy.
 */
import { Platform } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import {
  getCrashlytics,
  log,
  recordError,
  setCrashlyticsCollectionEnabled,
  setUserId as setCrashlyticsUserId,
} from '@react-native-firebase/crashlytics';
import {
  getAnalytics,
  logEvent,
  setAnalyticsCollectionEnabled,
  setUserId as setAnalyticsUserId,
} from '@react-native-firebase/analytics';
import { devLog } from './devLog';

/**
 * Events we are willing to record. Adding one is a deliberate act.
 *
 * Each is a fact about *whether* something happened, never about what was in
 * it. "A mentor message was sent" is useful and harmless; the message is
 * neither of ours to collect.
 */
export type AnalyticsEvent =
  | 'onboarding_complete'
  | 'pomodoro_started'
  | 'pomodoro_round_complete'
  | 'mentor_message_sent'
  | 'task_broken_down'
  | 'task_rescheduled'
  | 'pod_joined'
  | 'pod_message_reported'
  | 'paywall_viewed'
  | 'purchase_completed'
  | 'account_linked'
  | 'account_deleted';

/** Params must be primitives, and must never carry user-authored text. */
type EventParams = Record<string, string | number | boolean>;

let ready = false;

/**
 * Start both SDKs.
 *
 * Collection is disabled in development on purpose. Your own crashes while
 * building a feature are not production signal, and a dashboard full of them
 * is a dashboard you stop reading — which is the only real failure mode for a
 * tool like this.
 */
export function initMonitoring(): void {
  if (ready) return;
  try {
    const app = getApp();
    const enabled = !__DEV__;

    void setCrashlyticsCollectionEnabled(getCrashlytics(), enabled);
    void setAnalyticsCollectionEnabled(getAnalytics(app), enabled);

    ready = true;
    devLog(`[monitoring] Crashlytics and Analytics ready (collection ${enabled ? 'on' : 'off'})`);
  } catch (err) {
    // Monitoring must never be the thing that takes the app down.
    console.warn('[monitoring] Could not start', err);
  }
}

/**
 * Tie subsequent reports to an account.
 *
 * Called on launch and again whenever the uid changes, so a crash report can
 * be matched to the data that produced it. The uid is an opaque identifier —
 * it is not a name, an email, or anything a person could be recognised from
 * outside this project.
 */
export function identify(uid: string): void {
  if (!ready) return;
  try {
    void setCrashlyticsUserId(getCrashlytics(), uid);
    void setAnalyticsUserId(getAnalytics(getApp()), uid);
  } catch (err) {
    console.warn('[monitoring] Could not set the user id', err);
  }
}

export function track(event: AnalyticsEvent, params?: EventParams): void {
  if (!ready) return;
  try {
    void logEvent(getAnalytics(getApp()), event, params);
    devLog('[monitoring] event', event, params ?? '');
  } catch (err) {
    console.warn('[monitoring] Could not log an event', err);
  }
}

/**
 * A breadcrumb, attached to whatever crash comes next.
 *
 * Same rule as events: describe the step, never the content. "sending a mentor
 * message" is a breadcrumb; the message is not.
 */
export function breadcrumb(message: string): void {
  if (!ready) return;
  try {
    void log(getCrashlytics(), message);
  } catch {
    // A breadcrumb that cannot be written is not worth a warning.
  }
}

/**
 * Report an error that was caught and handled.
 *
 * Use for failures the app recovered from but which still mean something is
 * wrong — a callable that keeps failing, a listener that will not attach.
 * Uncaught crashes are captured by Crashlytics on their own and do not need
 * this.
 */
export function reportError(error: unknown, context?: string): void {
  const err = error instanceof Error ? error : new Error(String(error));
  if (context) breadcrumb(context);
  if (!ready) {
    console.warn('[monitoring] (not started)', context ?? '', err);
    return;
  }
  try {
    void recordError(getCrashlytics(), err, context);
  } catch (inner) {
    console.warn('[monitoring] Could not record an error', inner);
  }
}

/** Handy in a crash report, and cheap. */
export const platformTag = `${Platform.OS} ${Platform.Version}`;
