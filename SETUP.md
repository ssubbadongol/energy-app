# Soft Focus Pro — setup

Everything the AI Mentor and Community Pods need that can't be done from the
repo. Work top to bottom; each section says what breaks if you skip it.

Firebase project: **leedshack26** · Functions region: **us-central1**

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
| 8 | App Store / Play subscription products | App Store Connect + Play Console | RevenueCat dashboard |

Nothing here belongs in git. `.env`, `google-services.json` and
`GoogleService-Info.plist` should all be gitignored (see §9).

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

- **URL**: `https://us-central1-leedshack26.cloudfunctions.net/revenueCatWebhook`
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
gcloud pubsub topics create softfocus-billing-alerts --project leedshack26
```

The topic name must match `BILLING_TOPIC` in `functions/src/budget.ts`.

### Create the budget

[console.cloud.google.com/billing → Budgets & alerts](https://console.cloud.google.com/billing) → **Create budget**:

1. **Scope** — filter to project `leedshack26`. Optionally narrow to the
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
  --project leedshack26 \
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

## 10. Smoke test

1. Fresh install → onboarding → pick tags → land on Today.
2. Open **Mentor** → paywall appears (you are not Pro yet).
3. Buy through a sandbox account → the screen unlocks **without a restart**
   (that is the forced `getIdToken(true)` doing its job).
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
