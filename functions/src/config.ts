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
} as const;

/* ------------------------------------------------------------------ *
 * Cost controls
 * ------------------------------------------------------------------ */

/** Mentor messages a single user may send per UTC day. */
export const MENTOR_DAILY_LIMIT = 50;

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
  /** Tasks handed to the model in one `list_tasks` response. */
  taskListSize: 60,
} as const;

/**
 * Pod messages one member may post in a rolling window before the room starts
 * dropping them. Flooding a five-person support room is a moderation problem
 * long before it is a billing one, so this is set for the room's sake.
 */
export const POD_FLOOD_LIMIT = { messages: 12, windowMs: 60_000 } as const;

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
  pods: 'pods',
  pod: (podId: string) => `pods/${podId}`,
  podMembers: (podId: string) => `pods/${podId}/members`,
  podMember: (podId: string, uid: string) => `pods/${podId}/members/${uid}`,
  podMessages: (podId: string) => `pods/${podId}/messages`,
  moderationFlags: 'moderationFlags',
  configFlags: 'config/flags',
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
