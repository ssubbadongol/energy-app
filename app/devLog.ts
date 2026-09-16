/**
 * Development-only logging.
 *
 * Every `console.log` in this app is a diagnostic, not a product feature, and
 * several of them print things that should never reach a shipped build: the
 * Firebase project id, the app id, and the user's uid all go to the device log
 * on launch, where any other process with log access can read them.
 *
 * `__DEV__` is substituted at build time, so these calls are stripped from a
 * production bundle by the minifier rather than merely skipped at runtime.
 *
 * Warnings and errors deliberately do NOT go through here — those stay as
 * `console.warn` / `console.error` so Crashlytics can pick them up in
 * production, which is the whole point of having it.
 */
export function devLog(...args: unknown[]): void {
  if (__DEV__) console.log(...args);
}
