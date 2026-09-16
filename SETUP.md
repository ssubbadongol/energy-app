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
| 9 | Gmail app password for the support mailbox | [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) | Secret Manager `MODERATION_ALERT_PASSWORD` |

Nothing here belongs in git. `.env`, `google-services.json` and
`GoogleService-Info.plist` should all be gitignored (see §9).

---

## 0.1 Identity, and the one thing still gating publication

Settled, and consistent across the repo:

| | |
|---|---|
| Data controller | **Shashank Subba Dongol** (UK GDPR requires a named one) |
| Support / reporting address | **support.softfocus@gmail.com** |
| Minimum age | **16** |

That address appears in seven places and they must not drift, or the app
publishes one contact and mails reports to another: the five files under
`public/`, `SUPPORT_EMAIL` in `app/legal.ts`, and `ALERT_ADDRESS` in
`functions/src/reports.ts`. The Gmail app password in Secret Manager belongs to
the same account — it authenticates as itself to mail itself.

**Gemini tier — currently FREE, and the privacy policy says so.**

As of 15 September 2026 the API key is on the free tier, which means Google may
use prompts and responses to improve its models and human reviewers may read
them. `public/privacy.html` discloses that prominently, and `public/terms.html`
§6 points at it.

When you move to the paid tier — where prompts and responses are excluded from
training and human review — **rewrite both of those sections and bump the "Last
updated" date**. Continuing to warn users about something that no longer applies
is its own kind of inaccuracy, and the warning is strong enough to cost you
mentor usage.

Check which tier the key is actually on at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey). Blaze billing
on the Firebase project is **not** the same thing: paid tier depends on the
Cloud project behind the *API key* having billing linked, and since March 2026
new AI Studio users also need a prepaid balance.

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
firebase functions:secrets:set MODERATION_ALERT_PASSWORD
```

`MODERATION_ALERT_PASSWORD` is a **Gmail app password** for
support.softfocus@gmail.com — not the account password. It is what lets
`alertOnModerationFlag` email you the moment a pod message is reported, which is
how the 24-hour obligation in App Store Review Guideline 1.2 gets met while you
are asleep. Without it, reports still land in `moderationFlags`, but nothing
tells you.

**Getting one is a two-step dance, and the first step is not optional.** Google
hides app passwords until 2-Step Verification is on, and the page says only
*"the setting you are looking for is not available for your account"* rather
than explaining why:

1. [myaccount.google.com/signinoptions/twosv](https://myaccount.google.com/signinoptions/twosv)
   — turn on 2SV with a **phone number or authenticator app**. Set up with
   *only* a passkey or a security key and app passwords stay hidden.
2. [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   — generate one, then paste it into the `secrets:set` above.

Google withholds app passwords from some accounts even with 2SV on. If yours
is one of them, switch the alert to a Discord/Slack webhook instead — it is
about twenty lines in `functions/src/reports.ts`, needs no domain and no sender
verification, and pings a phone faster than an inbox.

⚠️ **This secret gates the whole functions deploy, not just alerts.**
`reports.ts` declares it with `defineSecret`, and the CLI refuses to deploy any
function in the codebase while a declared secret is missing from Secret
Manager. If you are not ready, set a placeholder so you are not blocked:

```bash
echo "placeholder-replace-me" | firebase functions:secrets:set MODERATION_ALERT_PASSWORD --data-file=-
```

Deploys then succeed and the alert logs a failure per flag until you replace it.

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
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
```

Hosting serves `public/` — the privacy policy, terms, account-deletion page and
support page — at `https://soft-focus-app.web.app`. Both stores require those
URLs at submission, and `app/legal.ts` points the in-app links at them, so
deploy hosting **before** you build a binary for review or every legal link in
the app 404s.

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

### User reports

Members can report a message by pressing and holding it. Reports go through the
`reportPodMessage` callable, not a direct write, and land in the same
`moderationFlags` collection with `source: 'user_report'`.

| Field | Meaning |
|---|---|
| `source` | `user_report` when a member raised it, absent when the classifier did |
| `reportCount` | Distinct members who have reported this message |
| `reasons` | Every reason given, de-duplicated |
| `action` | `auto_hidden` once two people reported it, else `awaiting_review` |

**Two distinct reporters auto-hides the message.** One cannot, because in an
anonymous room a single malicious member would otherwise be able to silence
anyone. The threshold is `AUTO_HIDE_AT_REPORTS` in `functions/src/reports.ts`.

Every non-distress flag also emails the support address. Distress flags
deliberately do **not** email: those are a record that someone was offered
crisis resources, not a queue item, and nobody should be paged to go and read
what a person in difficulty wrote about themselves.

Apple expects reported content to be actioned within 24 hours. In practice:
open the flag, read `text`, then either unhide the message (clear `hidden`) or
leave it hidden and disable the author's account in Firebase Auth. Set
`reviewed: true` either way.

---

## 8.5 Backups

Firestore holds every task, mentor conversation and entitlement mirror. There
is no undo for a bad script or a fat-fingered console delete.

**Easiest route — no install.** Scheduled backups are **not** in the Firebase
console; they live in the Google Cloud console:

> [console.cloud.google.com/firestore/databases?project=soft-focus-app](https://console.cloud.google.com/firestore/databases?project=soft-focus-app)
> → the `(default)` row → **Scheduled backups** column → *Edit settings*

That opens the Disaster recovery page: create a daily schedule with 7-day
retention, and see the resulting backups there later.

If you would rather use the CLI, `gcloud` is the Google Cloud SDK and is a
separate install from the Firebase CLI — it does **not** come with
`firebase-tools`. Either install it from
[cloud.google.com/sdk/docs/install](https://cloud.google.com/sdk/docs/install),
or open [shell.cloud.google.com](https://shell.cloud.google.com), which has it
preinstalled and already authenticated:

```bash
gcloud config set project soft-focus-app
gcloud firestore backups schedules create   --database="(default)"   --recurrence=daily   --retention=7d
```

Check it, and find a backup to restore from:

```bash
gcloud firestore backups schedules list --database="(default)"
gcloud firestore backups list --format="table(name,database,state,snapshotTime)"
```

Restoring goes into a **new** database, never over the live one:

```bash
gcloud firestore databases restore   --source-backup=projects/soft-focus-app/locations/LOCATION/backups/BACKUP_ID   --destination-database=restore-check
```

Scheduled backups rather than point-in-time recovery: PITR bills recovery logs
with no free tier, and at this data size it buys nothing that a daily backup
does not. Backup storage is charged per GB-month, so at a few hundred MB this
costs pennies.

Do a restore once, now, while nothing is wrong. A backup you have never
restored is a guess.

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

## 9.55 Migration — dev Pro moved documents (2026-09-15)

`devProEnabled` used to live on `config/flags`, which is readable by **every
signed-in user** — so the app was advertising that a free-Pro path existed. It
now lives on `config/devAccess` alongside the uid allowlist: same decision, same
document, unreadable by any client, and one Firestore read instead of two.

**Dev Pro will refuse until you move it.** In the console, on
`config/devAccess`, add:

```
devProEnabled: true   (boolean)
```

and delete `devProEnabled` from `config/flags`.

There is also a new third guard: the App Check–attested **app id** must be a
development build (`DEV_APP_IDS` in `functions/src/config.ts`). That comes from
the signed App Check token rather than anything the client claims, so a shipped
build is refused even if the flag is left on and a production uid ends up on the
allowlist. It is the guard `DEV_PROJECT_IDS` was meant to be and cannot be while
one project serves both variants.

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

## 9.7 Security rules — automated tests

`functions/test/rules.test.mjs` runs 40 assertions against the real rules engine
in the Firestore emulator. It is the difference between believing the rules are
right and knowing it — it covers self-granted Pro, cross-user reads, rate-limit
counter tampering, pod spoofing, blocking privacy, and both server-only config
documents.

```bash
npm run test:rules
```

**It needs JDK 21 or newer.** `firebase-tools` dropped support for earlier
versions, and the error it gives (*"no longer supports Java version before 21"*)
appears only after the emulator fails to start. `java -version` to check.

If you would rather not install a JDK system-wide, a portable one works and
leaves nothing behind:

```bash
curl -L -o jdk21.zip "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse"
unzip -q jdk21.zip
export JAVA_HOME="$PWD/jdk-21.0.12.1+1"
export PATH="$JAVA_HOME/bin:$PATH"
npm run test:rules
```

The tests run with App Check **off**, deliberately. They prove what the rules
guarantee on their own, so the result still holds if Firestore's App Check
enforcement is ever switched off. Nothing should pass because of a layer above
it.

The `PERMISSION_DENIED` lines in the output are not failures — they are the
denials being logged as they happen, which is what most of these tests assert.
Read the summary line at the end.

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
