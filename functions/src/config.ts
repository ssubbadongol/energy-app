/**
 * Shared configuration for every Soft Focus Cloud Function.
 *
 * Anything that is a knob rather than a constant lives here so the cost and
 * safety posture of the backend can be read in one place.
 */

/* ------------------------------------------------------------------ *
 * Model
 * ------------------------------------------------------------------ */

/** The only model this backend talks to, for both chat and safety checks. */
export const GEMINI_MODEL = 'gemini-2.5-flash-lite';

export const GEMINI_ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

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

/** How long a resolved kill-switch flag is cached in an instance (ms). */
export const FLAGS_CACHE_TTL_MS = 60_000;

/* ------------------------------------------------------------------ *
 * Development
 * ------------------------------------------------------------------ */

/**
 * Projects where `grantDevPro` is permitted to hand out a Pro claim without a
 * purchase. An allowlist, not a denylist: forgetting to add a project here
 * breaks dev grants, whereas forgetting to remove one from a denylist would
 * give away the subscription.
 *
 * When you create a separate production project, it simply never goes in this
 * list — that omission is the entire safety mechanism, so do not "fix" it.
 */
export const DEV_PROJECT_IDS: readonly string[] = ['leedshack26'];

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
