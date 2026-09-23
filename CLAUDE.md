# Soft Focus

An Expo / React Native app for neurodivergent students: tasks, energy-matched
lists, daily life routines, a Pomodoro timer, an AI mentor, and anonymous peer
support rooms called pods. Firebase backend. Pre-launch as of 2026-09-21.

Repo `ssubbadongol/energy-app` · Firebase project `soft-focus-app` (162840832537)

---

## Rules that will cost you a day if you break them

**Never reintroduce the `firebase` JS SDK to the client.** Everything is
`@react-native-firebase/*`. A previous arrangement bridged a native App Check
token into the JS SDK through a `CustomProvider`; the token reached callables
but never reached Firestore, which denied every read.

**Never fade anything carrying `elevation`.** Android draws an elevation
shadow from the view's outline *in the parent*, so it does not take an
ancestor's alpha — fade a card and its shadow stays behind at full strength
over whatever replaced it. Animate transforms instead (`scaleY` to open/close,
`translate` to move). This is why the tab transition uses a curtain and why
the Today list never crossfades. `components/sage/HourWheel.tsx` is the
exception and says so: its rows carry no elevation.

**`initAppCheckSync()` must run at module scope**, before anything constructs
Firestore. Firestore captures its App Check provider once and never
re-resolves it; initialising from an effect leaves it permanently tokenless.

**`verifiedApp()` returning `true` is deliberate.** Enforcement happens at the
service, project-wide, not in the callable. Don't "fix" it.

**The `__DEV__ ?` around `EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN` is load-bearing.**
`EXPO_PUBLIC_*` values are inlined as string literals at build time, so merely
*reading* the variable embeds it. Metro folds `__DEV__` to false in production
and the minifier drops the branch — that is what removes the literal. A
registered debug token in a shipped bundle is a permanent App Check bypass.

**Dates are anchored at midday** (`app/taskSchedule.ts`). A day is a whole day,
never an instant, and midday is the only hour that survives a DST shift in
either direction. Midnight anchoring makes `addDays` wrong twice a year.

**Times are stored 24-hour and formatted only at display**, through
`app/clockFormat.ts`, against the user's `clock` preference. Don't hand-roll a
formatter; don't store a formatted string.

---

## Layout

```
app/                  screens (expo-router) + client services
  (tabs)/             Today · Life · Mentor · Pods · Focus, plus
                      calendar & settings (href: null, pushed)
  taskStorage.ts      AsyncStorage is the read path; Firestore is the mirror
                      the mentor sees. taskSync.ts holds the reconcile logic.
  taskSchedule.ts     calendar date maths — pure, tested
  clockFormat.ts      12h/24h — pure, tested
  lifeSchedule.ts     life-task reminder timing — pure, tested
components/
  sage/               the live design system (theme/sage.ts)
  mascot/             the roaming companion. Mascot.tsx is one long state
                      machine; read its comments before touching the loop.
  primitives/         older layer, theme/tokens.ts. Prefer sage for new work.
functions/src/        Cloud Functions v2. Secrets via Secret Manager.
public/               privacy, terms, delete-account, support (Firebase Hosting)
```

**Testing is only possible for modules with no React Native imports.** Anything
importing AsyncStorage, expo-*, or Firebase cannot load in Node. When logic
needs a test, extract it to a pure module — that is why `taskSync`,
`taskSchedule`, `lifeSchedule` and `clockFormat` exist as separate files.
`test/ts-resolve.mjs` makes Node resolve extensionless imports the way Metro
does, so app code never needs `.ts` suffixes.

---

## Commands

```bash
npx tsc --noEmit          # expect clean
npm run lint              # expect exactly 4 pre-existing warnings
npm run test:unit         # 57 tests, no emulator needed
npm run test:rules        # Firestore rules, 48 assertions. Needs JDK 21+
npm run test:killswitch   # budget kill switch. Needs functions+firestore+pubsub emulators
```

Builds are EAS. `development` (`.dev`), `preview` (`.beta`), `production`.
Never use Bash to run a dev server — use `npx expo start --dev-client`.

---

## Launch state — 2026-09-21

### Done
Store blockers closed (pods report/block, in-app + web account deletion,
privacy/terms/support pages, paywall legal links, Pomodoro replacing the old
camera telemetry). Crashlytics + Analytics + root error boundary. Firestore
rules proven by 48 assertions; budget kill switch proven by 4. Daily Firestore
backups, 7-day retention. **App Check registered on both production apps** —
Play Integrity and App Attest. Debug token absent from both EAS environments.
Production Android build (version code 3) and upload keystore exist.
**A budget is connected to `softfocus-billing-alerts`** as of 2026-09-21, so
the kill switch finally has an input.

**`LAUNCH.md` is the ordered runbook** — every remaining step with links, in
dependency order. The list below is the summary.

### Open, longest lead time first
1. **Subscription products** in App Store Connect + Play, wired to RevenueCat.
   Apple reviews these separately and slowly.
2. **Upload the AAB to Play internal testing** → copy the *app signing key*
   SHA-256 from Play Console → add to Firebase → install from the track →
   confirm App Check metrics show **Verified**. Registration alone proves
   nothing; Play Integrity only attests Play-distributed installs, so nothing
   has verified yet. Use **version code 3** or later — code 2 still declared
   `RECORD_AUDIO`. Note that Play gates rollout to *any* track, internal
   included, on the App content declarations, so the forms come first.
3. **First iOS build** and TestFlight.
4. **Store listings** — Data safety, App Privacy, content rating (must declare
   user-generated content), screenshots. All four legal URLs are live at
   `https://soft-focus-app.web.app/…`.
5. **Confirm the kill switch has actually fired.** The budget was connected on
   2026-09-21 but the function had not yet run. Proof is `config/budgetState`
   existing in Firestore — only the real handler writes it. Also: the £20/month
   amount suits an app with no users; **raise it before launch** or ordinary
   use will disable the mentor for everybody.
6. `config/devAccess.devProEnabled` → **false** on submission day.
7. **Billing upgrade.** Blaze here is a *free trial expiring 13 December 2026*.
   If it lapses every function stops — mentor, pods, entitlements, the
   RevenueCat webhook, account deletion. Not degraded, gone.

### Known broken / deferred
- **The `preview` build profile cannot build for Android.** `app.config.ts`
  gives it `com.tsuyo7.energyapp.beta`, but `google-services.json` has clients
  only for `com.tsuyo7.energyapp` and `.dev`. Register a `.beta` app or drop
  the variant.
- **Confirm which project the Gemini key belongs to before going paid.** It
  was originally a key from `gen-lang-client-0126333029` — the throwaway
  project AI Studio creates — rather than `soft-focus-app`. The secret was
  swapped on 2026-09-19 (version 4) and `mentorChat`, `breakdownTask` and
  `moderatePodMessage` redeployed, and the mentor was verified working after.
  What was never verified is *which* key went in, because reading a secret is
  blocked in this environment. Check the usage graph on
  aistudio.google.com/apikey: the key with traffic is the live one, and it
  should be the one in `soft-focus-app`.

  It matters because the paid tier follows the **key's project**, not Blaze on
  the Firebase project — so a key in the wrong project means paying for an
  upgrade that never applies.
- **Gemini is on the free tier**, which means Google may train on prompts and
  humans may read them. `public/privacy.html` discloses this honestly. When you
  move to paid, rewrite that section *and* terms.html §6, bump both dates, and
  redeploy hosting — warning about something that no longer applies is its own
  inaccuracy.
- **Orphaned files**: `app/(tabs)/LifeTaskModal.tsx` and
  `app/(tabs)/PinnedTaskBanner.tsx`. Nothing imports either; both screens build
  their editors inline. Safe to delete.
- iPad is **off** (`supportsTablet: false`, 2026-09-23). The layouts are
  phone-shaped, and leaving it on meant Apple reviewing on iPad and demanding
  iPad screenshots for a UI that was never designed for one. Turning it back
  on means designing for it, not just flipping the flag.

### Never verified on a device
The calendar, the life-task time wheel and sheet, the mascot drop-dwell,
report/block, account deletion end to end, Pomodoro backgrounding, and the
crisis-support sheet. Logic is tested; layout, gestures and animation timing
are not.

---

## Voice

The copy is warm, specific and never scolding — this is an app for people who
have been told off by productivity software their whole lives. "Nothing today.
A clear day is allowed." Overdue work is "still waiting", not late. No streaks,
no shame, no red. Match it.

Comments explain *why*, especially where the obvious implementation was tried
and failed. Several of the longest comments in this codebase are load-bearing
warnings; read them before simplifying the code they sit on.
