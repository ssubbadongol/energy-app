/**
 * Break a task into steps.
 *
 * "Finish the assignment" is not a thing anyone can start. "Open the brief and
 * write the three section headings" is. That gap is where this audience
 * stalls, and closing it is the single most useful thing the model does here —
 * more than conversation, because it turns an unstartable item into a first
 * physical action.
 *
 * Same gate order as `mentorChat`, deliberately, so the cheapest rejection
 * runs first and a scripted client burns nothing:
 *
 *   App Check -> auth -> Pro -> kill switch -> rate limit -> Gemini.
 *
 * It shares the *mentor's* daily and burst counters rather than having its own.
 * That is the important detail: a separate quota would be a second unmetered
 * path to the same paid API, and someone could alternate between chat and
 * breakdowns to spend twice what the cap allows.
 */
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import {
  MAX_OUTPUT_TOKENS,
  PROMPT_LIMITS,
  TASK_BREAKDOWN_MAX_STEPS,
} from './config';
import { requireProCaller } from './entitlements';
import { getFlags } from './flags';
import { consumeMentorCall, refundMentorCall } from './rateLimit';
import { generateContent, GeminiError, MENTOR_SAFETY_SETTINGS } from './gemini';
import { GEMINI_API_KEY } from './secrets';

interface BreakdownRequest {
  name?: string;
  type?: string;
  /** Estimated minutes for the whole task, if the user set one. */
  time?: number;
  /**
   * What the user typed when asked what the task involves.
   *
   * The single biggest quality lever here. Without it the model is guessing
   * from a four-word title and produces plausible, generic, wrong steps.
   */
  context?: string;
}

interface BreakdownResult {
  steps: string[];
  /** Set when we answered without calling the model. */
  degraded: 'rate_limited' | 'mentor_disabled' | 'model_error' | null;
}

/**
 * Deliberately not the mentor's system instruction.
 *
 * This is a transformation, not a conversation. Sending two thousand tokens of
 * persona, tool declarations and conversational rules to produce five bullet
 * points would roughly quadruple the cost of the feature and would not make the
 * steps any better.
 */
function buildPrompt(name: string, type: string, time: number | null, context: string): string {
  return [
    'Break this task into the smallest concrete steps someone could actually start.',
    '',
    `Task: ${name}`,
    type ? `Type: ${type}` : '',
    time ? `They expect it to take about ${time} minutes in total.` : '',
    context ? `
What they said it involves:
${context}
` : '',
    '',
    'Rules:',
    context
      ? '- Build the steps out of what they told you above. It is theirs, not yours to improve on. Do not add steps for things they did not mention, and do not include anything they said is already done.'
      : '',
    `- Between 3 and ${TASK_BREAKDOWN_MAX_STEPS} steps. Fewer is better than padding.`,
    '- Each step is a physical action they could do right now, not a goal or a phase.',
    '- The first step must be small enough to feel almost trivial. Starting is the hard part.',
    '- Imperative, under ten words, no numbering, no trailing punctuation.',
    '- Do not restate the task as a step, and do not add "review" or "celebrate" filler.',
    '',
    'Reply with a JSON array of strings and nothing else. Example:',
    '["Open the brief", "Write the three section headings", "Draft the intro badly"]',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Pull the array out of whatever the model returned.
 *
 * Asking for JSON is not the same as getting it — replies come back wrapped in
 * markdown fences, or with a sentence in front. Finding the bracketed span is
 * more reliable than trusting the whole string to parse, and falling back to
 * lines means a plain list still works instead of erroring in the user's face.
 */
function parseSteps(raw: string): string[] {
  const clean = (value: unknown): string =>
    String(value ?? '')
      .trim()
      .replace(/^[-*\d.)\s]+/, '')
      .slice(0, PROMPT_LIMITS.subtaskName);

  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      if (Array.isArray(parsed)) {
        return parsed.map(clean).filter((s) => s.length > 0).slice(0, TASK_BREAKDOWN_MAX_STEPS);
      }
    } catch {
      // Fall through to the line reader below.
    }
  }

  return raw
    .split('\n')
    .map(clean)
    .filter((s) => s.length > 0 && !s.startsWith('{') && !s.startsWith('}'))
    .slice(0, TASK_BREAKDOWN_MAX_STEPS);
}

export const breakdownTask = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: true,
    secrets: [GEMINI_API_KEY],
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 10,
  },
  async (request: CallableRequest<BreakdownRequest>): Promise<BreakdownResult> => {
    const { uid } = await requireProCaller(request);

    const name = String(request.data?.name ?? '').trim().slice(0, PROMPT_LIMITS.taskName);
    if (!name) throw new HttpsError('invalid-argument', 'Which task should I break down?');

    const type = String(request.data?.type ?? '').trim().slice(0, PROMPT_LIMITS.taskType);
    const context = String(request.data?.context ?? '')
      .trim()
      .slice(0, PROMPT_LIMITS.breakdownContext);
    const rawTime = Number(request.data?.time);
    const time = Number.isFinite(rawTime) && rawTime > 0 ? Math.min(1440, Math.round(rawTime)) : null;

    const flags = await getFlags();
    if (!flags.mentorEnabled) {
      return { steps: [], degraded: 'mentor_disabled' };
    }

    const quota = await consumeMentorCall(uid);
    if (!quota.allowed) {
      return { steps: [], degraded: 'rate_limited' };
    }

    try {
      const result = await generateContent({
        apiKey: GEMINI_API_KEY.value(),
        contents: [{ role: 'user', parts: [{ text: buildPrompt(name, type, time, context) }] }],
        maxOutputTokens: MAX_OUTPUT_TOKENS.taskBreakdown,
        safetySettings: MENTOR_SAFETY_SETTINGS,
      });

      const steps = parseSteps(result.text ?? '');
      if (steps.length === 0) {
        // The call happened but produced nothing usable. Hand the allowance
        // back rather than charging them for an empty answer.
        await refundMentorCall(uid).catch(() => undefined);
        return { steps: [], degraded: 'model_error' };
      }

      logger.info('Task broken down', { uid, steps: steps.length, withContext: context.length > 0 });
      return { steps, degraded: null };
    } catch (err) {
      await refundMentorCall(uid).catch(() => undefined);
      const message = err instanceof GeminiError ? err.message : String(err);
      logger.error('Task breakdown failed', { uid, message });
      return { steps: [], degraded: 'model_error' };
    }
  },
);
