/**
 * Minimal Gemini REST client.
 *
 * Deliberately hand-rolled rather than pulled from an SDK: the two calls this
 * backend makes are narrow, and doing them by hand keeps the token caps and
 * safety settings visible at the call site instead of buried in a wrapper.
 */
import { logger } from 'firebase-functions/v2';
import { GEMINI_ENDPOINT, GEMINI_MODEL, MAX_OUTPUT_TOKENS, THINKING_CONFIG } from './config';

export type HarmCategory =
  | 'HARM_CATEGORY_HARASSMENT'
  | 'HARM_CATEGORY_HATE_SPEECH'
  | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
  | 'HARM_CATEGORY_DANGEROUS_CONTENT'
  | 'HARM_CATEGORY_CIVIC_INTEGRITY';

export type HarmProbability = 'NEGLIGIBLE' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface SafetyRating {
  category: HarmCategory;
  probability: HarmProbability;
  blocked?: boolean;
}

export interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  /**
   * Opaque reasoning handle Gemini 3.x attaches to a function call.
   *
   * It must be echoed back verbatim when the call is replayed in the next
   * turn's history, or the API rejects the whole request with 400
   * INVALID_ARGUMENT. We never read it — it only has to survive the round
   * trip. See https://ai.google.dev/gemini-api/docs/thought-signatures
   */
  thoughtSignature?: string;
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GenerateOptions {
  apiKey: string;
  contents: GeminiContent[];
  systemInstruction?: string;
  tools?: { function_declarations: unknown[] }[];
  maxOutputTokens: number;
  temperature?: number;
  safetySettings?: { category: HarmCategory; threshold: string }[];
  /** Aborts the request so a hung upstream can never pin a function open. */
  timeoutMs?: number;
}

export interface GenerateResult {
  text: string | null;
  functionCall: { name: string; args: Record<string, unknown> } | null;
  finishReason: string | null;
  /**
   * The model's function-call part exactly as received.
   *
   * Replay this rather than reconstructing `{ name, args }`, so the
   * thoughtSignature travels with it.
   */
  functionCallPart: GeminiPart | null;
  /** Ratings for the *model output*. */
  safetyRatings: SafetyRating[];
  /** Ratings for the *prompt* — what the pod safety check actually reads. */
  promptSafetyRatings: SafetyRating[];
  promptBlockReason: string | null;
  usage: { promptTokens: number; outputTokens: number; totalTokens: number };
}

/** The conservative posture used for pod content classification. */
export const POD_SAFETY_SETTINGS: { category: HarmCategory; threshold: string }[] = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
];

/**
 * The mentor's own posture is looser than the pods'.
 *
 * A student with anxiety saying "I feel worthless and I can't cope" is exactly
 * the person the mentor exists for. Blocking that at LOW would refuse to talk
 * to the user at the moment they most need a reply, so the mentor runs at
 * BLOCK_ONLY_HIGH and handles distress in the system prompt instead.
 */
export const MENTOR_SAFETY_SETTINGS: { category: HarmCategory; threshold: string }[] = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

export class GeminiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'GeminiError';
  }
}

export async function generateContent(opts: GenerateOptions): Promise<GenerateResult> {
  const {
    apiKey,
    contents,
    systemInstruction,
    tools,
    maxOutputTokens,
    temperature = 0.9,
    safetySettings = MENTOR_SAFETY_SETTINGS,
    timeoutMs = 30_000,
  } = opts;

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature,
      topP: 0.95,
      maxOutputTokens,
      // Flash-Lite can still spend tokens on reasoning. We want as little of
      // that as the model allows: it is invisible to the user and billed like
      // output. See THINKING_CONFIG for why this is not a zero budget.
      thinkingConfig: THINKING_CONFIG,
    },
    safetySettings,
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  if (tools?.length) {
    body.tools = tools;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(GEMINI_ENDPOINT(GEMINI_MODEL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Header rather than ?key= so the secret never lands in a URL that
        // could be logged by an intermediary.
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new GeminiError('Gemini request timed out');
    }
    throw new GeminiError(`Gemini request failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    logger.error('Gemini API error', { status: response.status, detail: detail.slice(0, 500) });
    throw new GeminiError(`Gemini API returned ${response.status}`, response.status);
  }

  const data = (await response.json()) as any;
  const candidate = data?.candidates?.[0];
  const parts: GeminiPart[] = candidate?.content?.parts ?? [];

  const fcPart = parts.find((p) => p.functionCall) ?? null;
  const fc = fcPart?.functionCall ?? null;
  const text = parts
    .filter((p) => typeof p.text === 'string' && p.text.length > 0)
    .map((p) => p.text as string)
    .join('')
    .trim();

  return {
    text: text.length > 0 ? text : null,
    functionCall: fc ? { name: fc.name, args: (fc.args ?? {}) as Record<string, unknown> } : null,
    functionCallPart: fcPart,
    finishReason: candidate?.finishReason ?? null,
    safetyRatings: (candidate?.safetyRatings ?? []) as SafetyRating[],
    promptSafetyRatings: (data?.promptFeedback?.safetyRatings ?? []) as SafetyRating[],
    promptBlockReason: data?.promptFeedback?.blockReason ?? null,
    usage: {
      promptTokens: data?.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data?.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: data?.usageMetadata?.totalTokenCount ?? 0,
    },
  };
}

/**
 * Classify a single piece of pod text.
 *
 * We ask for one output token because we do not want a reply — only the
 * ratings the API attaches to the prompt. When the prompt trips a
 * BLOCK_LOW_AND_ABOVE threshold the API returns no candidate at all and puts
 * the reason in `promptFeedback`, which is exactly the signal we want.
 */
export async function classifyText(apiKey: string, text: string): Promise<GenerateResult> {
  return generateContent({
    apiKey,
    contents: [{ role: 'user', parts: [{ text }] }],
    maxOutputTokens: MAX_OUTPUT_TOKENS.podSafetyCheck,
    temperature: 0,
    safetySettings: POD_SAFETY_SETTINGS,
    timeoutMs: 15_000,
  });
}
