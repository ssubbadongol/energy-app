/**
 * Runtime kill switches, read from `config/flags`.
 *
 * The budget alert handler flips these; every paid code path checks them and
 * degrades instead of erroring. Cached per instance so a busy pod does not
 * turn one Firestore read into hundreds.
 *
 * `config/flags` is **readable by every signed-in user** — which is everyone
 * who installs the app, since auth is anonymous and automatic. Only put things
 * here that the client legitimately needs in order to explain itself. Budget
 * figures live on `config/budgetState` and the dev-grant switch lives on
 * `config/devAccess`, both server-only, and both were moved off this document
 * for exactly that reason.
 */
import { logger } from 'firebase-functions/v2';
import { db } from './admin';
import { FLAGS_CACHE_TTL_MS, paths } from './config';

export interface Flags {
  /** When false the mentor answers with a notice instead of calling Gemini. */
  mentorEnabled: boolean;
  /** When false pod messages are delivered without a Gemini safety check. */
  podModerationEnabled: boolean;
  /** When false nobody can join or create a pod. */
  podsEnabled: boolean;
  /** Human-readable note shown in the client when something is off. */
  reason: string | null;
}

export const DEFAULT_FLAGS: Flags = {
  mentorEnabled: true,
  podModerationEnabled: true,
  podsEnabled: true,
  reason: null,
};

let cached: { at: number; value: Flags } | null = null;

export async function getFlags(): Promise<Flags> {
  if (cached && Date.now() - cached.at < FLAGS_CACHE_TTL_MS) {
    return cached.value;
  }
  try {
    const snap = await db.doc(paths.configFlags).get();
    const data = snap.exists ? (snap.data() as Partial<Flags>) : {};
    const value: Flags = {
      mentorEnabled: data.mentorEnabled !== false,
      podModerationEnabled: data.podModerationEnabled !== false,
      podsEnabled: data.podsEnabled !== false,
      reason: data.reason ?? null,
    };
    cached = { at: Date.now(), value };
    return value;
  } catch (err) {
    // Failing open on a read error is the right call: a Firestore blip should
    // not take the whole product down. The budget switch writes a durable doc,
    // so a real kill survives the next successful read.
    logger.warn('Could not read config/flags, defaulting to enabled', { err });
    return DEFAULT_FLAGS;
  }
}

/** Drops the instance cache — used right after the budget handler writes. */
export function invalidateFlagsCache(): void {
  cached = null;
}
