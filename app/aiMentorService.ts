/**
 * AI Mentor — client.
 *
 * This file used to hold a Gemini API key, the system prompt, and the task
 * tool implementations. All three now live in the `mentorChat` Cloud Function,
 * because a key shipped in a bundle is a key anyone can extract, and a prompt
 * the client assembles is a prompt the client can rewrite.
 *
 * What is left is deliberately thin: send a string, get a reply and a list of
 * what the mentor did to the user's tasks.
 */
import { collection, limit, onSnapshot, orderBy, query } from '@react-native-firebase/firestore';
import { callable, callableErrorCode, db, ensureAuth } from './firebase';
import { getRemoteProfile } from './userDoc';

export interface TaskEffect {
  tool: 'add_task' | 'list_tasks' | 'complete_task' | 'delete_task' | string;
  ok: boolean;
  summary: string;
  taskId?: string;
  taskName?: string;
}

export interface MentorMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  toolEffects: TaskEffect[];
  createdAt: Date | null;
}

export interface MentorUsage {
  used: number;
  limit: number;
  resetsAt: string;
}

export interface MentorTurn {
  reply: string;
  taskEffects: TaskEffect[];
  tasksChanged: boolean;
  usage: MentorUsage;
  degraded: 'rate_limited' | 'mentor_disabled' | 'model_error' | null;
}

/** Why the mentor is unavailable, in a form the screen can act on. */
export type MentorBlockReason = 'needs_pro' | 'unverified_build' | 'signed_out' | 'offline' | 'unknown';

export class MentorUnavailable extends Error {
  constructor(readonly reason: MentorBlockReason, message: string) {
    super(message);
    this.name = 'MentorUnavailable';
  }
}

/** Maps callable error codes to something the UI can respond to specifically. */
function toMentorError(err: unknown): MentorUnavailable {
  // React Native Firebase reports codes bare (`permission-denied`); the JS
  // SDK namespaced them (`functions/permission-denied`). Normalised centrally
  // so a mis-read code cannot silently unlock or lock a Pro feature.
  const code = callableErrorCode(err);
  switch (code) {
    case 'permission-denied':
      return new MentorUnavailable('needs_pro', 'The mentor is part of Soft Focus Pro.');
    case 'failed-precondition':
      return new MentorUnavailable('unverified_build', 'This app build could not be verified.');
    case 'unauthenticated':
      return new MentorUnavailable('signed_out', 'Sign in again to keep chatting.');
    case 'unavailable':
    case 'deadline-exceeded':
      return new MentorUnavailable('offline', 'The mentor could not be reached. Try again in a moment.');
    default:
      console.warn('[mentor] Unexpected callable failure', err);
      return new MentorUnavailable('unknown', 'Something went wrong. Please try again.');
  }
}

/* ------------------------------------------------------------------ *
 * Conversation
 * ------------------------------------------------------------------ */

/**
 * Live conversation history.
 *
 * A listener rather than a fetch, so a turn persisted by the function appears
 * without the screen having to guess when the write landed.
 */
export function subscribeToConversation(
  onChange: (messages: MentorMessage[]) => void,
  onError?: (err: Error) => void,
  max = 60,
): () => void {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;

  ensureAuth()
    .then((uid) => {
      if (cancelled) return;
      const q = query(
        collection(db, 'users', uid, 'mentorMessages'),
        orderBy('createdAt', 'desc'),
        limit(max),
      );
      unsubscribe = onSnapshot(
        q,
        (snap) => {
          const messages = snap.docs
            .map((d) => {
              const data = d.data();
              return {
                id: d.id,
                role: data.role === 'model' ? ('model' as const) : ('user' as const),
                text: data.text ?? '',
                toolEffects: (data.toolEffects ?? []) as TaskEffect[],
                createdAt: data.createdAt?.toDate?.() ?? null,
              };
            })
            // Newest-first from Firestore (so `limit` keeps the recent ones),
            // oldest-first for the transcript.
            .reverse();
          onChange(messages);
        },
        (err) => {
          console.warn('[mentor] History listener failed', err);
          onError?.(err);
        },
      );
    })
    .catch((err) => onError?.(err));

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

/** Send one turn. Persistence happens server-side, in the same call. */
export async function sendMessageToMentor(message: string): Promise<MentorTurn> {
  try {
    const fn = callable<{ message: string }, MentorTurn>('mentorChat');
    const { data } = await fn({ message });
    return data;
  } catch (err) {
    throw toMentorError(err);
  }
}

export interface MentorStatus {
  mentorEnabled: boolean;
  podsEnabled: boolean;
  reason: string | null;
  usage: MentorUsage;
}

/** Remaining messages today, and whether the mentor is currently paused. */
export async function getMentorStatus(): Promise<MentorStatus> {
  try {
    const fn = callable<void, MentorStatus>('mentorStatus');
    const { data } = await fn();
    return data;
  } catch (err) {
    throw toMentorError(err);
  }
}

/* ------------------------------------------------------------------ *
 * Greeting
 * ------------------------------------------------------------------ */

/**
 * First-run greeting, written locally.
 *
 * There is no reason to spend a model call — and one of the user's fifty daily
 * messages — on "hello".
 */
export async function generateWelcomeMessage(): Promise<string> {
  const profile = await getRemoteProfile();
  const greeting = profile.name ? `Hi ${profile.name}.` : 'Hey.';

  const tags = profile.tags.map((t) => t.toLowerCase());
  let nod = '';
  if (tags.some((t) => t.includes('adhd'))) {
    nod = " If starting is the hard part today, we can shrink whatever you're facing down to one small thing.";
  } else if (tags.some((t) => t.includes('anx') || t.includes('stress'))) {
    nod = ' No agenda here — we can just talk, or we can make the day smaller.';
  }

  return `${greeting} I'm your mentor. 💚${nod} What's on your mind?`;
}
