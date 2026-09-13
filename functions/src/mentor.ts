/**
 * AI Mentor — the callable the chat screen talks to.
 *
 * Everything expensive or trust-sensitive happens here rather than on the
 * device: the Gemini key, the entitlement check, the daily cap, the kill
 * switch, and the task writes. The client sends a string and renders what
 * comes back.
 *
 * Order of the gates is deliberate — the cheapest rejection runs first, so a
 * scripted client burns nothing:
 *   App Check -> auth -> Pro -> kill switch -> rate limit -> Gemini.
 */
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './admin';
import {
  MAX_OUTPUT_TOKENS,
  MENTOR_DAILY_LIMIT,
  MENTOR_HISTORY_TURNS,
  MENTOR_MAX_INPUT_CHARS,
  paths,
} from './config';
import { requireProCaller } from './entitlements';
import { getFlags } from './flags';
import { consumeMentorCall, readMentorUsage, refundMentorCall } from './rateLimit';
import { generateContent, GeminiError, MENTOR_SAFETY_SETTINGS, type GeminiContent } from './gemini';
import { GEMINI_API_KEY } from './secrets';
import { executeTaskTool, TASK_TOOL_DECLARATIONS, type ToolEffect } from './mentorTools';

/** Most a single turn may bounce between the model and Firestore. */
const MAX_TOOL_ROUNDS = 3;

interface MentorProfile {
  name: string | null;
  tags: string[];
  goals: string[];
  tone: 'Gentle' | 'Direct';
}

export interface MentorReply {
  reply: string;
  /** Task writes performed this turn, so the UI can confirm them. */
  taskEffects: ToolEffect[];
  /** True when any task tool actually mutated data — client re-syncs. */
  tasksChanged: boolean;
  usage: { used: number; limit: number; resetsAt: string };
  /** Set when we answered without calling the model. */
  degraded: 'rate_limited' | 'mentor_disabled' | 'model_error' | null;
}

async function loadProfile(uid: string): Promise<MentorProfile> {
  const snap = await db.doc(paths.user(uid)).get();
  const data = snap.data() ?? {};
  const tone = data.mentorTone === 'Direct' ? 'Direct' : 'Gentle';
  return {
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : null,
    tags: Array.isArray(data.tags) ? data.tags.slice(0, 12).map(String) : [],
    goals: Array.isArray(data.goals) ? data.goals.slice(0, 12).map(String) : [],
    tone,
  };
}

/**
 * Replay the recent conversation.
 *
 * Only the text of each turn is replayed. Tool calls are already summarised in
 * the assistant text ("Added ..."), so re-sending the raw functionCall parts
 * would cost tokens to tell the model something it can already read.
 */
async function loadHistory(uid: string): Promise<GeminiContent[]> {
  const snap = await db
    .collection(paths.mentorMessages(uid))
    .orderBy('createdAt', 'desc')
    .limit(MENTOR_HISTORY_TURNS)
    .get();

  return snap.docs
    .reverse()
    .map((d) => d.data())
    .filter((m) => typeof m.text === 'string' && m.text.trim().length > 0)
    .map((m) => ({
      role: m.role === 'model' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.text as string }],
    }));
}

function buildSystemInstruction(profile: MentorProfile): string {
  const { name, tags, goals, tone } = profile;

  const who = name ? `They go by ${name}. ` : '';
  const identifies = tags.length ? `They identify with: ${tags.join(', ')}. ` : '';
  const working = goals.length ? `They are currently working on: ${goals.join('; ')}. ` : '';

  const voice =
    tone === 'Direct'
      ? 'They chose Direct mode: be concise and concrete. Lead with the suggestion, skip the warm-up, do not pad with reassurance they did not ask for.'
      : 'They chose Gentle mode: warm, unhurried, low-pressure. Validate before you suggest, and make every suggestion opt-out-able.';

  const adhd = tags.some((t) => /adhd|focus/i.test(t))
    ? '\n- Executive function is the bottleneck, not willpower. Name the very next physical action, not the goal. Offer to shrink a task before offering to schedule it.'
    : '';
  const anxiety = tags.some((t) => /anx|stress|overwhelm/i.test(t))
    ? '\n- When they spiral, slow down. Reflect what you heard first. Offer one grounding option, never a list of five.'
    : '';

  return [
    'You are the Soft Focus mentor: a warm, practical companion for a neurodivergent student.',
    '',
    `${who}${identifies}${working}`.trim(),
    voice,
    '',
    'How you talk:',
    '- Short paragraphs. Contractions. Plain words. No clinical register.',
    '- Two or three sentences is usually enough. Never lecture.',
    '- One question per message at most.',
    '- Emoji sparingly, and only when it adds warmth.',
    adhd,
    anxiety,
    '',
    'Managing their tasks:',
    '- You can add, list, complete and delete tasks with the provided tools.',
    '- add_task needs name, priority, energy, time and type. If any are missing, ask for them conversationally — one at a time, not as a form.',
    '- Call list_tasks before completing or deleting so you act on the right one.',
    '- Never invent a task the user did not ask for, and never delete without a clear request.',
    '- After a tool runs, say plainly what you did in one short sentence.',
    '',
    'Limits:',
    '- You are not a therapist or a doctor, and you do not diagnose.',
    '- If they describe self-harm, being unsafe, or a crisis: stay with them, be calm and human, do not lecture, and gently mention that Samaritans (116 123, UK, free, 24/7) is there if they want a person to talk to. Do not refuse to talk to them.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function limitMessage(resetsAt: Date): string {
  const hours = Math.max(1, Math.round((resetsAt.getTime() - Date.now()) / 3_600_000));
  return `We've hit today's mentor limit — that's a cap I keep so this stays sustainable, not anything you did. It resets in about ${hours} hour${hours === 1 ? '' : 's'}. Your tasks and pods are all still here in the meantime. 💙`;
}

const DISABLED_MESSAGE =
  "I'm resting right now — the mentor is temporarily paused while we sort something out on our end. Everything else in Soft Focus still works, and your conversation is saved. Try me again in a little while. 💙";

async function persistTurn(
  uid: string,
  role: 'user' | 'model',
  text: string,
  effects: ToolEffect[] = [],
): Promise<void> {
  await db.collection(paths.mentorMessages(uid)).add({
    role,
    text,
    toolEffects: effects,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export const mentorChat = onCall(
  {
    region: 'us-central1',
    // Blocks anything that is not a genuine, unmodified build of the app.
    enforceAppCheck: true,
    secrets: [GEMINI_API_KEY],
    // Small and short: this handler is I/O bound and we never want a runaway.
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 20,
  },
  async (request: CallableRequest<{ message?: string }>): Promise<MentorReply> => {
    const { uid } = await requireProCaller(request);

    const message = String(request.data?.message ?? '').trim();
    if (!message) {
      throw new HttpsError('invalid-argument', 'Message cannot be empty.');
    }
    if (message.length > MENTOR_MAX_INPUT_CHARS) {
      throw new HttpsError('invalid-argument', `Messages are limited to ${MENTOR_MAX_INPUT_CHARS} characters.`);
    }

    // Kill switch before the rate limiter, so a paused mentor does not eat
    // anyone's daily allowance.
    const flags = await getFlags();
    if (!flags.mentorEnabled) {
      const usage = await readMentorUsage(uid);
      await persistTurn(uid, 'user', message);
      await persistTurn(uid, 'model', DISABLED_MESSAGE);
      return {
        reply: DISABLED_MESSAGE,
        taskEffects: [],
        tasksChanged: false,
        usage: { used: usage.used, limit: usage.limit, resetsAt: usage.resetsAt.toISOString() },
        degraded: 'mentor_disabled',
      };
    }

    const quota = await consumeMentorCall(uid, MENTOR_DAILY_LIMIT);
    const usage = { used: quota.used, limit: quota.limit, resetsAt: quota.resetsAt.toISOString() };

    if (!quota.allowed) {
      const reply = limitMessage(quota.resetsAt);
      await persistTurn(uid, 'user', message);
      await persistTurn(uid, 'model', reply);
      return { reply, taskEffects: [], tasksChanged: false, usage, degraded: 'rate_limited' };
    }

    const [profile, history] = await Promise.all([loadProfile(uid), loadHistory(uid)]);
    const systemInstruction = buildSystemInstruction(profile);

    const contents: GeminiContent[] = [...history, { role: 'user', parts: [{ text: message }] }];
    const effects: ToolEffect[] = [];
    const apiKey = GEMINI_API_KEY.value();

    try {
      let reply: string | null = null;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const result = await generateContent({
          apiKey,
          contents,
          systemInstruction,
          tools: [{ function_declarations: TASK_TOOL_DECLARATIONS }],
          // A follow-up after a tool call only needs a confirmation sentence.
          maxOutputTokens: round === 0 ? MAX_OUTPUT_TOKENS.mentorReply : MAX_OUTPUT_TOKENS.mentorToolSummary,
          safetySettings: MENTOR_SAFETY_SETTINGS,
        });

        logger.debug('Mentor turn', {
          uid,
          round,
          finishReason: result.finishReason,
          tokens: result.usage.totalTokens,
          tool: result.functionCall?.name ?? null,
        });

        if (result.functionCall) {
          const { name, args } = result.functionCall;
          const outcome = await executeTaskTool(uid, name, args);
          effects.push(outcome.effect);

          // Feed the call and its result back so the model can narrate it.
          contents.push({ role: 'model', parts: [{ functionCall: { name, args } }] });
          contents.push({
            role: 'user',
            parts: [{ functionResponse: { name, response: outcome.response } }],
          });

          // Some turns come back with both a tool call and prose. Keep the
          // prose as a fallback in case the follow-up round returns nothing.
          if (result.text) reply = result.text;
          continue;
        }

        if (result.text) {
          reply = result.text;
          break;
        }

        // No text and no tool call — usually a safety block or a truncation.
        logger.warn('Mentor produced no usable output', {
          uid,
          finishReason: result.finishReason,
          blockReason: result.promptBlockReason,
        });
        break;
      }

      if (!reply) {
        reply = effects.length
          ? `Done: ${effects.map((e) => e.summary).join('; ')}.`
          : "I lost my thread there, sorry. Could you say that again?";
      }

      await persistTurn(uid, 'user', message);
      await persistTurn(uid, 'model', reply, effects);

      return {
        reply,
        taskEffects: effects,
        tasksChanged: effects.some((e) => e.ok && e.tool !== 'list_tasks'),
        usage,
        degraded: null,
      };
    } catch (err) {
      // The model never produced anything, so the call should not count.
      await refundMentorCall(uid).catch(() => undefined);

      if (err instanceof GeminiError) {
        logger.error('Gemini call failed', { uid, message: err.message, status: err.status });
        throw new HttpsError('unavailable', 'The mentor could not be reached. Please try again.');
      }
      logger.error('Mentor turn failed', { uid, err });
      throw new HttpsError('internal', 'Something went wrong. Please try again.');
    }
  },
);

/**
 * Lightweight status poll for the chat header: remaining messages and whether
 * the mentor is currently paused. Pro-gated like the chat itself so it cannot
 * be used to probe the backend.
 */
export const mentorStatus = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: true,
    memory: '256MiB',
    timeoutSeconds: 20,
    maxInstances: 10,
  },
  async (request: CallableRequest<void>) => {
    const { uid } = await requireProCaller(request);
    const [flags, usage] = await Promise.all([getFlags(), readMentorUsage(uid)]);
    return {
      mentorEnabled: flags.mentorEnabled,
      podsEnabled: flags.podsEnabled,
      reason: flags.reason,
      usage: { used: usage.used, limit: usage.limit, resetsAt: usage.resetsAt.toISOString() },
    };
  },
);
