/**
 * Shared configuration for every Soft Focus Cloud Function.
 *
 * Anything that is a knob rather than a constant lives here so the cost and
 * safety posture of the backend can be read in one place.
 */

/* ------------------------------------------------------------------ *
 * Model
 * ------------------------------------------------------------------ */

/**
 * The only model this backend talks to, for both chat and safety checks.
 *
 * `gemini-2.5-flash-lite` was retired for new projects — the API returns 404
 * with "no longer available to new users" rather than a deprecation warning,
 * so a project created after the cutoff cannot use it at all regardless of
 * what the code says.
 */
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';

export const GEMINI_ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/**
 * How much invisible reasoning the model may spend.
 *
 * Thinking tokens are billed like output and never shown to the user, so we
 * want as few as the model will accept. On 2.5 that was `thinkingBudget: 0`;
 * Gemini 3.x rejects a zero budget outright with a 400, which fails *every*
 * request rather than degrading, so the setting is now a named constant
 * instead of a literal buried in the request body.
 *
 * Measured on gemini-3.5-flash-lite: `minimal` returned the fewest tokens of
 * the accepted options and reported no thought tokens at all.
 */
export const THINKING_CONFIG = { thinkingLevel: 'minimal' } as const;

/**
 * Output-token ceilings. These are the primary per-call cost lever, so they
 * are deliberately tight.
 *
 * - Mentor replies get a real budget (a few short paragraphs).
 * - The pod safety check needs no reply at all: we only read `safetyRatings`
 *   and `promptFeedback`, so we ask for the minimum the API accepts.
 */
export const MAX_OUTPUT_TOKENS = {
  mentorReply: 700,
  /** Follow-up turn after a tool call — just a confirmation sentence. */
  mentorToolSummary: 300,
  /** Safety classification: ratings only, never a usable completion. */
  podSafetyCheck: 1,
  /**
   * Breaking a task into steps. A JSON array of short imperatives and nothing
   * else, so this is tight on purpose — eight steps of a dozen words each does
   * not need more, and a larger budget would only buy padding.
   */
  taskBreakdown: 250,
} as const;

/* ------------------------------------------------------------------ *
 * Cost controls
 * ------------------------------------------------------------------ */

/**
 * Steps a breakdown may produce.
 *
 * A ceiling on cost, but mostly a product decision: a twenty-step checklist is
 * its own kind of overwhelm, which is the thing this feature exists to reduce.
 */
export const TASK_BREAKDOWN_MAX_STEPS = 8;

/** Mentor messages a single user may send per UTC day. */
export const MENTOR_DAILY_LIMIT = 50;

/**
 * Short-window burst ceiling, enforced alongside the daily cap.
 *
 * The daily limit alone bounds the monthly bill but says nothing about *rate*,
 * and all fifty could be spent in about ten seconds by a script — or by a
 * retry loop in a client that is being told "try again". Three things go wrong
 * when that happens, in order:
 *
 *   - Gemini's own per-minute quota trips, and the failures land on everyone
 *     using the app at that moment, not just the person bursting.
 *   - A month of one user's spend arrives inside a minute, so the budget
 *     kill switch — which reacts to a threshold, not a slope — cannot get in
 *     front of it.
 *   - Concurrent function instances multiply, each holding a Gemini request
 *     open.
 *
 * Six a minute is far above deliberate human use (a thoughtful reply takes
 * longer than ten seconds to read) and far below what a loop produces, so it
 * is invisible to real users and immediate for scripted ones.
 */
export const MENTOR_BURST_LIMIT = { messages: 6, windowMs: 60_000 } as const;

/** Conversation turns replayed to the model each request. */
export const MENTOR_HISTORY_TURNS = 20;

/** Longest user message the mentor will accept (characters). */
export const MENTOR_MAX_INPUT_CHARS = 2000;

/** Longest pod message accepted (characters). Mirrored in Firestore rules. */
export const POD_MAX_MESSAGE_CHARS = 500;

/**
 * Ceilings on anything user-controlled that ends up inside a prompt.
 *
 * These are a cost control, not a formatting preference. A Firestore document
 * can hold ~1MiB, and both the profile and the task list are written by the
 * client and then replayed to Gemini — the profile on *every* mentor turn, as
 * part of the system instruction. Without a bound, one oversized display name
 * turns a $0.0003 message into a $0.02 one for as long as it sits there, and a
 * few hundred oversized tasks would exhaust the function's memory before the
 * request even reached the model.
 *
 * Firestore rules enforce the same limits at write time; these are the second
 * line, covering documents written before the rules existed and any path that
 * bypasses them.
 */
export const PROMPT_LIMITS = {
  profileName: 60,
  profileTag: 40,
  profileGoal: 120,
  taskName: 200,
  taskType: 60,
  /**
   * One subtask label, as replayed into the mentor's prompt.
   *
   * This is the clamp that actually bounds the cost, because `firestore.rules`
   * cannot iterate a list and so can only limit how many subtasks there are,
   * not how long each one is. See the comment on `validTask()`.
   */
  subtaskName: 80,
  /**
   * What the user types when asked what a task involves.
   *
   * Sent once per breakdown rather than replayed every turn, so this can be
   * generous compared with the profile limits — but it is still user-controlled
   * text heading for a prompt, so it is still bounded.
   */
  breakdownContext: 300,
  /** Tasks handed to the model in one `list_tasks` response. */
  taskListSize: 60,
} as const;

/**
 * Pod messages one member may post in a rolling window before the room starts
 * dropping them. Flooding a five-person support room is a moderation problem
 * long before it is a billing one, so this is set for the room's sake.
 */
export const POD_FLOOD_LIMIT = { messages: 12, windowMs: 60_000 } as const;

/* ------------------------------------------------------------------ *
 * Reminders
 * ------------------------------------------------------------------ */

/**
 * Bounds on a mentor-set reminder.
 *
 * The mentor cannot schedule anything itself — it returns an effect and the
 * device schedules a local notification — so these are about what is sensible
 * to promise, not about cost. A reminder further out than a week is almost
 * certainly the model misreading a date, and a notification body long enough
 * to be truncated by the OS is worse than a short one.
 */
export const REMINDER_LIMITS = {
  maxTextChars: 120,
  minMinutes: 1,
  maxMinutes: 7 * 24 * 60,
} as const;

/** How long a resolved kill-switch flag is cached in an instance (ms). */
export const FLAGS_CACHE_TTL_MS = 60_000;

/* ------------------------------------------------------------------ *
 * Development
 * ------------------------------------------------------------------ */

/**
 * Projects where `grantDevPro` may hand out a Pro claim without a purchase.
 *
 * Soft Focus runs a *single* project, so this list contains the production
 * project and therefore isolates nothing. It is kept because it costs nothing
 * and becomes a real guard the day a separate staging project appears — but
 * until then, read it as documentation, not protection.
 *
 * The guard that actually carries weight in a single-project setup is
 * `config/devAccess`: see DEV_ACCESS_DOC below.
 */
export const DEV_PROJECT_IDS: readonly string[] = ['soft-focus-app'];

/**
 * The uids permitted to grant themselves Pro, held in a server-only document.
 *
 * This is the barrier that matters. With one project, `devProEnabled` left on
 * by accident would otherwise mean anyone running the app can take the
 * subscription for free; with an explicit uid list, the blast radius of that
 * mistake is the handful of people already building the thing.
 *
 * No Firestore rule grants access to this path, so the catch-all deny at the
 * bottom of `firestore.rules` makes it unreadable to every client. Populate it
 * by hand in the console:
 *
 *   config/devAccess -> { uids: ["<your anonymous uid>"] }
 */
export const DEV_ACCESS_DOC = 'config/devAccess';

/**
 * Firebase app IDs belonging to the **development** build variant.
 *
 * This is the guard that `DEV_PROJECT_IDS` was supposed to be and is not:
 * with one project serving dev and production, the project check passes in
 * production and contributes nothing.
 *
 * App IDs are different. `request.app.appId` on a callable comes from the
 * verified App Check token, which attests *which registered app* made the
 * call — it is signed by Play Integrity or App Attest and a production build
 * cannot present a dev app's attestation. So this is a real boundary rather
 * than a self-reported one, and it means a shipped build is refused even if
 * `devProEnabled` is left on and a production user's uid ends up on the
 * allowlist by mistake.
 *
 * See `app.config.ts` for the variant → bundle id → app id mapping.
 */
export const DEV_APP_IDS: readonly string[] = [
  '1:162840832537:android:29f7b42863c08263395888', // Soft Focus Dev (Android)
  '1:162840832537:ios:60badb758bc497de395888', // Soft Focus Dev (iOS)
];

/** How long a dev Pro grant lasts before it expires on its own. */
export const DEV_PRO_TTL_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ *
 * Pods
 * ------------------------------------------------------------------ */

export const POD_MAX_MEMBERS = 5;
export const POD_MIN_MEMBERS = 3;

export const POD_DURATIONS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
} as const;

export type PodDuration = keyof typeof POD_DURATIONS;

/** Topics a pod can be opened around. Mirrored by the client picker. */
export const POD_TOPICS = [
  'Getting started',
  'Quiet co-study',
  'Executive dysfunction',
  'Anxiety spiral',
  'Sensory reset',
  'Late-night work',
] as const;

export const POD_SUPPORT_STYLES = ['Listening', 'Practical', 'Body doubling'] as const;

/**
 * Per-pod display aliases. Members never see each other's names or profiles;
 * the join function hands out the first free alias in this list.
 */
export const POD_ALIASES = [
  'Heron', 'Moss', 'Wren', 'Fern', 'Ash',
  'Willow', 'Reed', 'Sorrel', 'Birch', 'Clover',
] as const;

/* ------------------------------------------------------------------ *
 * Firestore paths
 * ------------------------------------------------------------------ */

export const paths = {
  user: (uid: string) => `users/${uid}`,
  userTasks: (uid: string) => `users/${uid}/tasks`,
  userTask: (uid: string, taskId: string) => `users/${uid}/tasks/${taskId}`,
  mentorMessages: (uid: string) => `users/${uid}/mentorMessages`,
  mentorCounter: (uid: string) => `users/${uid}/counters/mentorDaily`,
  supportPrompts: (uid: string) => `users/${uid}/supportPrompts`,
  /** Uids this user has blocked. Document id is the blocked uid. */
  userBlocks: (uid: string) => `users/${uid}/blocks`,
  pods: 'pods',
  pod: (podId: string) => `pods/${podId}`,
  podMembers: (podId: string) => `pods/${podId}/members`,
  podMember: (podId: string, uid: string) => `pods/${podId}/members/${uid}`,
  podMessages: (podId: string) => `pods/${podId}/messages`,
  moderationFlags: 'moderationFlags',
  /**
   * Kill switches. **Client-readable** — the app reads this to show an honest
   * notice instead of a generic error.
   *
   * Nothing commercially sensitive may ever be written here. Anyone who
   * installs the app is signed in, so a field on this document is a field
   * published to the world. Budget figures go to `configBudgetState` below.
   */
  configFlags: 'config/flags',
  /**
   * Budget telemetry: spend, ceiling, ratio, budget name.
   *
   * Server-only. Not matched by any rule, so `firestore.rules` denies it by
   * default — which is the point. This used to live on `config/flags`, where
   * every user of the app could read the project's actual monthly Cloud spend
   * and watch how close it was to tripping the kill switch.
   */
  configBudgetState: 'config/budgetState',
  revenueCatEvent: (eventId: string) => `revenueCatEvents/${eventId}`,
} as const;

/* ------------------------------------------------------------------ *
 * Crisis resources
 * ------------------------------------------------------------------ */

/**
 * Surfaced to a user whose own message tripped the self-harm / dangerous
 * classifier. Deliberately offered, never forced, and never shown to anyone
 * but the person who wrote the message.
 *
 * Soft Focus is UK-first (Leeds); international fallbacks are included because
 * anonymous auth gives us no reliable locale.
 */
export const CRISIS_RESOURCES = [
  {
    region: 'UK',
    name: 'Samaritans',
    detail: 'Free, 24/7, any kind of distress.',
    phone: '116 123',
    url: 'https://www.samaritans.org',
  },
  {
    region: 'UK',
    name: 'Shout',
    detail: 'Text-based support if talking is too much.',
    phone: 'Text SHOUT to 85258',
    url: 'https://giveusashout.org',
  },
  {
    region: 'UK',
    name: 'NHS 111',
    detail: 'Urgent mental health help, option 2.',
    phone: '111',
    url: 'https://111.nhs.uk',
  },
  {
    region: 'International',
    name: 'Find a helpline',
    detail: 'Local crisis lines wherever you are.',
    phone: null,
    url: 'https://findahelpline.com',
  },
] as const;
