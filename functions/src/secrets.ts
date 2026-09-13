/**
 * Secret handles.
 *
 * Declared once so every function that needs one can list it in its
 * `secrets: [...]` option. Values live in Secret Manager, never in source:
 *
 *   firebase functions:secrets:set GEMINI_API_KEY
 *   firebase functions:secrets:set REVENUECAT_WEBHOOK_SECRET
 *   firebase functions:secrets:set REVENUECAT_API_KEY
 */
import { defineSecret } from 'firebase-functions/params';

/** Google AI Studio key used for both mentor chat and pod safety checks. */
export const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

/** Shared secret sent by RevenueCat in the webhook's Authorization header. */
export const REVENUECAT_WEBHOOK_SECRET = defineSecret('REVENUECAT_WEBHOOK_SECRET');

/** RevenueCat *secret* (server) API key — never shipped to the client. */
export const REVENUECAT_API_KEY = defineSecret('REVENUECAT_API_KEY');
