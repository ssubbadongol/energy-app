# Soft Focus Pro — setup

Everything the AI Mentor and Community Pods need that can't be done from the
repo. Work top to bottom; each section says what breaks if you skip it.

Firebase project: **soft-focus-app** · Functions region: **us-central1**

One project serves both development and production. That keeps the setup small,
but it means dev builds write into the same Firestore real users read — so the
dev Pro grant in §9.6 is guarded by an explicit uid allowlist rather than by
project isolation.

---

## 0. What you need to supply

| # | Thing | Where it comes from | Where it goes |
|---|---|---|---|
| 1 | Gemini API key | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Secret Manager `GEMINI_API_KEY` |
| 2 | RevenueCat public SDK key (iOS) | RevenueCat → Project → API keys | `.env` `EXPO_PUBLIC_REVENUECAT_IOS_KEY` |
| 3 | RevenueCat public SDK key (Android) | RevenueCat → Project → API keys | `.env` `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` |
| 4 | RevenueCat **secret** API key | RevenueCat → Project → API keys → Secret | Secret Manager `REVENUECAT_API_KEY` |
| 5 | RevenueCat webhook secret | You invent it (any long random string) | Secret Manager + RevenueCat webhook header |
| 6 | `google-services.json` | Firebase Console → Android app | repo root |
| 7 | `GoogleService-Info.plist` | Firebase Console → iOS app | repo root |
| 7b | `google-services.dev.json` *(optional)* | Firebase Console → dev project | repo root, for the dev variant |
| 8 | App Store / Play subscription products | App Store Connect + Play Console | RevenueCat dashboard |

Nothing here belongs in git. `.env`, `google-services.json` and
`GoogleService-Info.plist` should all be gitignored (see §9).

---

## 0.5 Enable billing (do this first)

Cloud Functions v2 — which is every function in this repo — **cannot deploy on
the Spark plan**, because they make outbound calls (Gemini, RevenueCat) and
Google requires billing for that regardless of volume.

Create the project first, then upgrade it:

```bash
firebase login
firebase projects:create soft-focus-app --display-name "Soft Focus"
```

If the id is taken, pick another and update `.firebaserc` and `DEV_PROJECT_IDS`
in `functions/src/config.ts` to match.

Then register the apps and copy the config into `.env` (see §7):

```bash
firebase apps:create web "Soft Focus Web" --project soft-focus-app
firebase apps:create android com.tsuyo7.energyapp --project soft-focus-app
firebase apps:create ios com.tsuyo7.energyapp --project soft-focus-app
```

Enable **Anonymous** sign-in under Authentication → Sign-in method, and create
the Firestore database (production mode, `us-central1` to match the functions).

Finally, Firebase Console → ⚙ → **Usage and billing** → **Details & settings** →
**Modify plan** → **Blaze**. Attach a billing account and set a budget alert in
the same sitting (§6 wires that budget to the kill switch).

Blaze is pay-as-you-go with the free tiers intact — the Firestore and Functions
free quotas still apply, so a pre-launch app typically bills £0 for everything
except Gemini. Do not skip §6; the budget alert is what stops an unexpected
bill turning into a surprising one.

---

## 1. Cloud Functions secrets

```bash
cd functions && npm install && cd ..
firebase functions:secrets:set GEMINI_API_KEY
firebase functions:secrets:set REVENUECAT_API_KEY
firebase functions:secrets:set REVENUECAT_WEBHOOK_SECRET
```

The webhook secret is a shared string you make up — generate one with
`openssl rand -hex 32`. Keep a copy; §5 needs it.

**Restrict the Gemini key** at
[console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials):
API restrictions → *Generative Language API* only. The key never leaves the
server, so no referrer/IP restriction is needed, but scoping the API limits the
blast radius if it leaks.

---

## 2. Deploy

```bash
firebase deploy --only firestore:rules,firestore:indexes,functions
```

Composite indexes take a few minutes to build. Pod matchmaking returns empty
until they finish — that is expected, not a bug.

---

## 3. Firestore TTL policies

`firestore.indexes.json` declares TTL on `expiresAt` for `pods`, `messages` and
`members`, and `firebase deploy --only firestore:indexes` applies it. Confirm at
**Firestore → TTL** that three policies show *Serving*.

TTL is the safety net, not the mechanism. It deletes within 24h of expiry and
does **not** cascade into subcollections, so the `sweepExpiredPods` scheduled
function is what actually closes rooms on time and removes their messages.
Both exist on purpose.

---

## 4. App Check

Without this, **every** Mentor and Pods request is rejected — the rules require
`request.app != null` and the callables set `enforceAppCheck: true`.

1. Firebase Console → **App Check** → register both apps:
   - Android → **Play Integrity**
   - iOS → **App Attest**
2. Copy `google-services.json` and `GoogleService-Info.plist` into the repo root.
3. Build a dev client — App Check needs native modules and will not work in Expo Go:
   ```bash
   npx expo prebuild --clean
   eas build --profile development --platform android
   ```
4. Set enforcement to **Enforced** for *Cloud Firestore* and *Cloud Functions*
   only after you have confirmed a real build passes. Start in **Monitor** mode
   and watch the App Check metrics for a day.

### Simulators and CI

App Attest and Play Integrity can't attest an emulator. For those:

1. Run the app, find the debug token printed in the native logs.
2. Firebase Console → App Check → your app → **Manage debug tokens** → add it.
3. Put it in `.env` as `EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN`.

Never ship a build with that variable set.

---

## 5. RevenueCat

### Products

1. **App Store Connect** → create the auto-renewable subscriptions.
2. **Play Console** → create the matching subscriptions.
3. **RevenueCat** → Products → import both.

### Entitlement

Create one entitlement with the identifier **`pro`** — lowercase, exactly that.
It is hard-coded in three places (`revenuecat.ts`, `entitlements.ts`,
`PRO_ENTITLEMENT_ID`) and in the Firestore rules' `pro` claim. Attach every
subscription product to it.

### Offering

Create an offering, mark it **current**, and add a package per product. The
paywall renders whatever is in the current offering, so pricing changes are a
dashboard edit, not a release.

### Webhook

RevenueCat → Project settings → **Integrations → Webhooks**:

- **URL**: `https://us-central1-soft-focus-app.cloudfunctions.net/revenueCatWebhook`
- **Authorization header**: the exact string you set as `REVENUECAT_WEBHOOK_SECRET`

Send a test event and confirm a 200 in `firebase functions:log`.

### App user IDs

The app calls `Purchases.configure({ appUserID: <firebase uid> })`, so
RevenueCat's `app_user_id` **is** the Firebase uid. Don't call `logIn` with
anything else — the webhook uses it to find whose custom claim to set.

---

## 6. Budget alerts and the kill switch

Console-side, and the one part of the cost controls that can't be code.

### Create the Pub/Sub topic

```bash
gcloud pubsub topics create softfocus-billing-alerts --project soft-focus-app
```

The topic name must match `BILLING_TOPIC` in `functions/src/budget.ts`.

### Create the budget

[console.cloud.google.com/billing → Budgets & alerts](https://console.cloud.google.com/billing) → **Create budget**:

1. **Scope** — filter to project `soft-focus-app`. Optionally narrow to the
   *Generative Language API* service to budget the model spend specifically.
2. **Amount** — your monthly cap.
3. **Thresholds** — add **50%**, **90%** and **100%** of *actual* spend.
4. **Manage notifications** → tick **Connect a Pub/Sub topic to this budget** and
   choose `softfocus-billing-alerts`. Also add an email address — the Pub/Sub
   path is for the kill switch, email is for you.

### What each threshold does

| Spend | Mentor | Pod moderation | Pods |
|---|---|---|---|
| < 90% | on | on | on |
| ≥ 90% | **paused** — in-app notice, no Gemini calls | on | on |
| ≥ 100% | paused | **skipped** — messages still deliver, logged as unmoderated | on |

Pods are never closed by a budget event: a peer-support room that costs nothing
to run shouldn't go dark because a model bill got large. The mentor sheds first
because it is the expensive one and it degrades to a polite message rather than
an error.

### Test it without spending money

```bash
gcloud pubsub topics publish softfocus-billing-alerts \
  --project soft-focus-app \
  --message '{"budgetDisplayName":"test","costAmount":95,"budgetAmount":100,"alertThresholdExceeded":0.9}'
```

Then check `config/flags` in Firestore — `mentorEnabled` should be `false`.
Re-enable by editing the document by hand, or publishing a message with a lower
ratio.

---

## 7. Client environment

Create `.env` in the repo root (see `.env.example`):

```
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_xxx
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_xxx
# Local dev on a simulator only — never in a shipped build.
EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN=
```

`EXPO_PUBLIC_GEMINI_API_KEY` is **gone**. It used to be read by
`aiMentorService.ts` and shipped inside the bundle, where anyone could extract
it. If it is still in your `.env` or in EAS secrets, delete it there and
**rotate the key** — assume the old one is public.

---

## 8. Moderation review queue

`moderationFlags` has no client access at all — read it in the Firebase console.

| Field | Meaning |
|---|---|
| `category` | `dangerous_or_self_harm` or `harassment_or_hate` |
| `action` | `support_offered` (message left in place) or `redacted` |
| `text` | The original message. For a redacted one this is the **only** copy. |
| `reviewed` | Flip to `true` once a human has looked. |

The two categories are handled differently on purpose:

- **Distress** — the message stays in the pod exactly as written. Deleting
  someone's "I'm not okay" would punish them for the thing peer support exists
  for. The sender, and only the sender, is offered crisis resources.
- **Abuse** — the text is redacted from the room, leaving a visible marker, and
  the original is preserved here for review.

Gemini has no separate self-harm category — self-harm scores under
`HARM_CATEGORY_DANGEROUS_CONTENT`, which is why that category drives the support
path rather than removal.

---

## 9. Gitignore

Add these before your next commit:

```
google-services.json
GoogleService-Info.plist
```

`.env` is already covered.

---

## 9.5 Build variants

`app.config.ts` layers a per-variant identity over `app.json`, so a dev build
installs **alongside** the real app rather than replacing it:

| Variant | App name | Bundle id / package | App Attest env |
|---|---|---|---|
| `development` | Soft Focus Dev | `com.tsuyo7.energyapp.dev` | development |
| `preview` | Soft Focus Beta | `com.tsuyo7.energyapp.beta` | production |
| `production` | Soft Focus | `com.tsuyo7.energyapp` | production |

Chosen by `APP_VARIANT`, which `eas.json` sets per build profile. Unset — a
plain `npx expo start` — means `development`: the safe default, because the
build you run by accident should be the one that cannot charge anyone.

```bash
eas build --profile development --platform android   # Soft Focus Dev
eas build --profile preview     --platform android   # Soft Focus Beta
eas build --profile production  --platform android   # Soft Focus
```

Each variant also carries a launcher-icon tint and an in-app corner badge
(`components/BuildBadge.tsx`, silent in production), so a screenshot from the
wrong build is obvious.

### All three variants share one Firebase project

`soft-focus-app` is the only backend, so the dev build and the store build read and
write the same Firestore. Two consequences worth holding on to:

- Pods you create while testing are **real pods** other users can be matched
  into. Close them, or test while nobody else is on.
- The dev Pro grant has no project boundary protecting it, which is why §9.6
  gates it on an explicit uid allowlist.

Splitting later needs no code change. Point a variant at another project by
setting `EXPO_PUBLIC_FIREBASE_*` for the JS SDK and dropping
`google-services.dev.json` / `GoogleService-Info.dev.plist` in the repo root
for the native one — `app.config.ts` prefers the variant-suffixed file and
falls back to the unsuffixed one. Then leave the production project **out** of
`DEV_PROJECT_IDS` and that guard starts doing real work.

---

## 9.6 Dev Pro grants

Developing anything behind the paywall means a sandbox purchase per device per
rebuild. `grantDevPro` short-circuits that with a **24-hour** `pro` claim, and
`revokeDevPro` hands it back so the locked state is equally easy to reach.

The control lives at the bottom of the paywall, dev builds only. Four guards
all have to pass:

1. **Your uid must be on the allowlist.** Create a server-only document —
   nothing in `firestore.rules` grants clients this path, so the catch-all deny
   covers it:

   ```
   Firestore -> config/devAccess -> uids: ["<your uid>"]   (array of strings)
   ```

   Find your uid in Authentication → Users, or log it from the app. This is the
   guard that matters: with one project, it is what keeps "the flag got left
   on" from meaning "the subscription is free for anyone who asks".

2. `config/flags.devProEnabled` must be explicitly `true`. It is the one flag
   that defaults to *false*, so a fresh project refuses until you turn it on:

   ```
   Firestore -> config/flags -> devProEnabled: true  (boolean)
   ```

3. The runtime project must be in `DEV_PROJECT_IDS` (`functions/src/config.ts`).
   A no-op while there is one project; a real guard the day there are two.

4. Normal auth + App Check, as with every other callable.

A caller who fails guard 1 or 3 gets `not-found`, not `permission-denied` — to
anyone who is not a developer this function should look like it was never
deployed.

**Turn `devProEnabled` off before you take real money.** It is a switch to flip
on and off, not one to leave on.

Grants are stamped `proStore: 'dev_override'`, so they are distinguishable in
the data and a real RevenueCat event overwrites them cleanly.

---

## 10. Smoke test

1. Fresh install → onboarding → pick tags → land on Today.
2. Open **Mentor** → paywall appears (you are not Pro yet).
3. Buy through a sandbox account → the screen unlocks **without a restart**
   (that is the forced `getIdToken(true)` doing its job). On a dev build you
   can use **Grant Pro** at the bottom of the paywall instead (§9.6) — but do
   the real sandbox purchase at least once before you ship.
4. Say *"add a task to finish my lab report"* → the mentor asks for the missing
   fields, then a receipt appears under its reply and the task shows on **Today**.
5. Open **Pods** → *Find me a pod* → post a message. It appears immediately with
   a brief `checking…` marker while moderation runs.
6. Send 51 mentor messages in a day → the 51st returns the friendly cap message
   and makes no Gemini call. Check `users/{uid}/counters/mentorDaily`.
7. Cancel the sandbox subscription → within an hour the tabs re-lock.

### Rate limit and kill switch

- Daily cap: `MENTOR_DAILY_LIMIT` in `functions/src/config.ts` (default 50).
- Output token caps: `MAX_OUTPUT_TOKENS` in the same file. Pod safety checks are
  capped at **1** token — the call reads `safetyRatings`, it never needs a reply.
- Manual kill switch: edit `config/flags` in Firestore. Instances cache it for
  60 seconds.

### What a mentor message actually costs

At `gemini-2.5-flash-lite` rates ($0.10/M input, $0.40/M output) and this
config — ~350 tokens of system prompt, ~520 of tool declarations, 20 replayed
history turns, and a reply that is typically 120–180 tokens against a 700 cap:

| | tokens | cost |
|---|---|---|
| Input per turn | ~2,000 | $0.00020 |
| Output per turn | ~150 | $0.00006 |
| **Per message** | | **~$0.00026** |
| A user at the 50/day cap, all month | 1,500 msgs | **~$0.39** |
| A realistic heavy user (~15/day) | 450 msgs | ~$0.12 |
| A typical user (~4/day) | 120 msgs | ~$0.03 |

Firestore adds roughly $0.01–0.02 per heavy user per month (the 20-document
history read per turn dominates), against a 50k read/day free tier.

So the daily cap is not really a cost control — even a user who maxes it out
every single day for a month costs under a third of one month's subscription.
It is an **abuse** control, and that is the right way to think about changing
it. The things that would genuinely move the bill are, in order: switching to
a larger model, raising `MENTOR_HISTORY_TURNS`, and raising
`MAX_OUTPUT_TOKENS.mentorReply`.
