# Launch runbook

Do these in order. Each phase depends on the one before it — going out of
order mostly means rebuilding twice.

Conceptual detail lives in `SETUP.md`. This is the sequence and the links.

**Everything below is console work.** Almost no code.

---

## Phase 0 · Unblock the mentor · 10 min

The mentor currently returns **402 — prepayment credits depleted**. It is not
broken; the API key moved into a project that has billing attached, which ends
the free tier without funding anything.

- [ ] `firebase functions:secrets:set GEMINI_API_KEY --project soft-focus-app`
- [ ] Paste the **`_IWg`** key (Default Gemini Project — the one with *no*
      billing, which is why it is free)
- [ ] Say **Y** to the redeploy
- [ ] Send the mentor a "hello" and confirm it answers

Switch to a paid key on `soft-focus-app` **the day the app is accepted**, and
before any marketing. See "After acceptance".

---

## Phase 1 · Subscription products · half a day

Nothing can be submitted until these exist. A paywall with no products reads
as broken, and a reviewer who cannot reach Pro rejects the app.

### Google Play
https://play.google.com/console

- [ ] Create the app — package **`com.tsuyo7.energyapp`**
- [ ] **Monetise → Subscriptions → Create subscription**
      - Product ID `softfocus_pro` — permanent, can never be changed or reused
- [ ] Add a **base plan**: ID `monthly`, auto-renewing, 1 month, set price
- [ ] **Activate the base plan.** It does nothing until activated.

### App Store Connect
https://appstoreconnect.apple.com

- [ ] Create the app — bundle ID **`com.tsuyo7.energyapp`**
- [ ] **Subscriptions → create a Subscription Group** ("Soft Focus Pro")
- [ ] Create the subscription: product ID `softfocus_pro_monthly`, 1 month,
      price
- [ ] Add a **localisation** — display name and description. Required.
- [ ] Upload a **review screenshot**. Required, and a common rejection.
- [ ] **Users and Access → Integrations → App Store Connect API** → generate a
      key with **App Manager** access
      - ⚠️ The `.p8` downloads **once**. Save it. Note the Key ID and Issuer ID.
- [ ] **App Information → App-Specific Shared Secret** — generate and copy

---

## Phase 2 · RevenueCat · 1–2 hours

https://app.revenuecat.com

Names must match the code **exactly** or it fails silently.

- [ ] Create the project
- [ ] Add the **Apple** app: bundle `com.tsuyo7.energyapp`, upload the `.p8`
      with Key ID + Issuer ID, paste the shared secret
- [ ] Add the **Google** app: package `com.tsuyo7.energyapp`, upload a Google
      Cloud service account JSON with Play access
      - Fiddliest step. Play permissions can take hours to propagate; if
        RevenueCat reports a credentials error, wait rather than redo it.
- [ ] **Entitlement** → identifier **`pro`**, lowercase, exactly
      (`app/entitlements.ts:56`, `functions/src/revenuecat.ts:28`, and the
      Firestore rules' `pro` claim all hard-code it)
- [ ] **Products** → import both store products
- [ ] **Offering** → create one, add a package per product, and mark it
      **Current**
      - The paywall reads `offerings.current`. Without this it renders empty
        even when everything else is right.
- [ ] Attach both products to the `pro` entitlement
- [ ] **Integrations → Webhooks**
      - URL `https://us-central1-soft-focus-app.cloudfunctions.net/revenueCatWebhook`
      - Authorization header = the value already in `REVENUECAT_WEBHOOK_SECRET`
      - Send a test event, confirm a 200 in `firebase functions:log`

---

## Phase 3 · Keys, then rebuild · 30 min

⚠️ **This is the step that is easy to miss.** `SETUP.md` §7 documents these as
a local `.env`, which EAS builds never read — `.env` is gitignored, so the
builder never sees it. Android **version code 3 shipped with no RevenueCat
keys at all** and therefore cannot sell anything.

Copy the **public SDK keys** from RevenueCat → API keys (they begin `appl_`
and `goog_` — not the secret keys).

- [ ] `npx eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_IOS_KEY`
- [ ] `npx eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`
- [ ] `npx eas env:list --environment production` — confirm both are listed
- [ ] `npx eas build -p android --profile production`
- [ ] `npx eas build -p ios --profile production`

The iOS build will ask to create certificates and provisioning profiles. Let
it. It is the first iOS build this project has ever made, so leave time for it
to go wrong.

---

## Phase 4 · Play internal testing, and prove App Check · 2 hours

The only piece of the security work still unproven: **App Check has never
verified a single real request.** Play Integrity only attests apps installed
*from Google Play*, so a sideloaded APK never counts.

Play gates rollout to **every** track, internal included, behind App content.
So the forms come first.

- [ ] **Policy → App content**, complete all sections:
      - Privacy policy `https://soft-focus-app.web.app/privacy.html`
      - Data safety
      - Content ratings — **declare user-generated content** (pods are
        anonymous strangers talking). Understating it is a takedown risk.
      - Target audience — **16+**. Nothing under 13, or Families policy applies.
      - App access — reviewers need to reach Pro; see Phase 5.
- [ ] **Test and release → Testing → Internal testing → Create new release**
- [ ] Upload the AAB from Phase 3
- [ ] Add yourself as a tester, copy the opt-in link
- [ ] **Test and release → Setup → App signing** → copy the **App signing key
      certificate** SHA-256
- [ ] Firebase → https://console.firebase.google.com/project/soft-focus-app/settings/general
      → Your apps → Soft Focus → **Add fingerprint**
      - ⚠️ **Type it, do not paste.** An invisible character fails validation
        and the console only says "An error occurred while trying to update."
- [ ] Install from the opt-in link on a real phone
- [ ] https://console.firebase.google.com/project/soft-focus-app/appcheck
      → **APIs** → Cloud Firestore → confirm **Verified** requests

### While you are on that build, test what has never been tested

- [ ] Delete an account end to end (Apple 5.1.1(v), Play requirement)
- [ ] Report a pod message, block a member
- [ ] Buy Pro in sandbox, confirm the mentor unlocks
- [ ] The calendar, the life-task time wheel, the mascot
- [ ] Pomodoro surviving being backgrounded

---

## Phase 5 · Listings, and letting reviewers in · 2–3 hours

- [ ] Screenshots for both stores (phone; iPad too unless `supportsTablet` is
      turned off in `app.json`)
- [ ] Title, short and full descriptions
- [ ] Apple **App Privacy** questionnaire — the honest answers are in
      `public/privacy.html`, including Gemini free-tier handling
- [ ] Apple **age rating**
- [ ] All four URLs:
      - Privacy `https://soft-focus-app.web.app/privacy.html`
      - Terms `https://soft-focus-app.web.app/terms.html`
      - Support `https://soft-focus-app.web.app/support.html`
      - Delete account `https://soft-focus-app.web.app/delete-account.html`

### Reviewers must be able to reach Pro

They will tap the mentor, hit the paywall, and reject the app if they cannot
get past it. The dev-Pro backdoor refuses production builds by design
(`DEV_APP_IDS`), so it will not help them.

- [ ] Create an account in the app
- [ ] RevenueCat → that customer → **grant a promotional entitlement** for `pro`
- [ ] Put the login in **App Review notes** and Play's App access section

---

## Phase 6 · Submit

- [ ] Flip `config/devAccess.devProEnabled` → **false**
      https://console.firebase.google.com/project/soft-focus-app/firestore
- [ ] Submit iOS for review (the subscription is reviewed alongside it)
- [ ] Submit Android

⚠️ **Check whether Play requires closed testing first.** New *personal*
developer accounts must run a closed test with **12 testers for 14 continuous
days** before production access is granted. If that applies, production is two
weeks out no matter what — start the clock the moment Phase 4 is done.

---

## After acceptance

- [ ] Switch `GEMINI_API_KEY` to a key in `soft-focus-app`, and prepay on that
      project — https://ai.studio/projects
      - Do this **before any marketing**. The free tier's limit is roughly 15
        requests a minute shared across *all* users, and **pod moderation is
        not Pro-gated** — every pod message calls Gemini. When it rate-limits,
        `moderation.ts` fails open and messages land unchecked.
- [ ] Rewrite the mentor section of `public/privacy.html` and §6 of
      `terms.html` — the paid tier is excluded from training and human review,
      so the current warning becomes untrue. Bump both dates, redeploy hosting.
- [ ] Raise the £20 budget — it suits an app with no users and will disable the
      mentor for everyone once ordinary use approaches it.
- [ ] Delete the unused Gemini keys, keeping one.
- [ ] Confirm `config/budgetState` exists in Firestore — proof the kill switch
      has actually run.

---

## Traps already hit once

- **Paste fails silently** in Firebase console fields — Team ID, SHA
  fingerprints. Type them.
- **A green deploy proves nothing.** The Gemini key swap deployed cleanly and
  left the app broken for two days. Always exercise the feature and check the
  logs.
- **`.env` is not EAS.** EAS builds read EAS environment variables, not the
  gitignored local file.
- **Registering App Check is not verifying it.** Only a Play- or
  TestFlight-distributed install attests.
