# Soft Focus — complete feature inventory (v1) → build spec for v2

Everything the current app actually does, derived from the source, not the README.
Where the README claims something the code doesn't do, it's marked **[README ONLY]**.

Stack today: Expo SDK 54 / React Native 0.81 / expo-router v6 / TypeScript, Firebase
(anonymous auth + Firestore), Google Gemini via REST, ElevenLabs TTS, AsyncStorage,
Reanimated 4 + gesture-handler, lucide icons, react-native-svg.

---

## 0. App shell

- **Router**: expo-router, file-based. Root `Stack` with one `(tabs)` group plus a
  vestigial `modal` route (placeholder screen, "This is a modal" — dead).
- **Six bottom tabs**, in order: Today · Life · Tasks · Add · Focus · Talks.
  Three files in `(tabs)/` are hidden from the tab bar via `href: null`
  (`LifeTaskModal`, `TaskEditModal`, `PinnedTaskBanner`) — they're components that
  happen to live in the routes folder.
- Tab bar is laid out **in flow** (not absolute) and its height is `56 + bottom
  safe-area inset` with matching `paddingBottom`, so content is never clipped and
  the Android gesture bar doesn't overlap. Labels are 9pt uppercase mono,
  letter-spacing 1.08.
- **Fonts loaded at root** and app renders `null` until ready: IBM Plex Mono
  (300/400/500/600), Instrument Serif (regular + italic), plus legacy Nunito
  (Regular/Medium/SemiBold/Bold) still required by unmigrated screens.
- **React Navigation theme is overridden** so the transition gaps paint warm paper
  (`#F5F0E6`) instead of flashing white/black. StatusBar is forced `dark`.
- On mount the root registers `setupNotifications()` and a global
  `addNotificationResponseReceivedListener` → `handleNotificationResponse`.
- `app.json`: portrait only, `userInterfaceStyle: "light"`, new architecture on,
  React Compiler + typed routes experiments on, scheme `energyapp`, Android package
  `com.tsuyo7.energyapp`, `softwareKeyboardLayoutMode: "pan"`, edge-to-edge on,
  splash `#F5F0E6` / dark `#1D1916`, notification accent `#AD8234`.

---

## 1. Data models

### `Task` — two incompatible definitions exist (see §9 Known defects)

```ts
interface Task {
  id: number;                 // Date.now()
  name: string;
  description?: string;       // only in the (tabs)/ version
  priority: 'high' | 'medium' | 'low';
  energy:   'high' | 'medium' | 'low';
  time: number;               // estimated minutes
  type: string;               // free text: "Deep focus" | "Admin" | "Creative" | "Physical" | …
  completed: boolean;
  dueDate?: string;           // ISO string
  dueTime?: string;           // "HH:MM" 24h — only in the (tabs)/ version
  notificationIds?: string[]; // only in the (tabs)/ version
}
```

Three seeded demo tasks ship on first run: *Write client proposal* (high/high/60m/
Deep focus), *Reply to emails* (medium/low/20m/Admin), *Review design mockups*
(high/medium/30m/Creative), all due today.

### `LifeTask`

```ts
interface LifeTask {
  id: string;                 // stable slug for defaults, `custom-${Date.now()}` for user-made
  emoji: string;
  name: string;
  timeWindow: string;         // free-text label, e.g. "6–10 AM"
  timeOfDay: 'morning' | 'midday' | 'evening';
  enabled: boolean;           // opt-in; all defaults ship disabled
  completed: boolean;
  isDefault: boolean;
  repeats?: number;           // 1–5 times per day
  completedCount: number;     // progress toward `repeats`
}
```

**12 default life tasks**, all `enabled: false` initially:
- Morning — 🚿 Shower (6–10 AM), 🍳 Breakfast (7–10 AM), 💊 Take meds (7–11 AM),
  💧 Drink water (6–12 PM, ×2)
- Midday — 🍽 Eat lunch (12–2 PM), 🚶 Take a walk (12–5 PM), 💧 Drink water
  (12–6 PM, ×3), 🏃 Exercise (3–7 PM)
- Evening — 🍽 Eat dinner (6–8 PM), 💧 Water plants (5–9 PM), 💊 Take meds
  (7–10 PM), 😴 Wind down (8–11 PM)

### `PinnedTask`
`{ id, name, type: 'task'|'life', emoji?, time?, timeWindow?, repeats?,
completedCount?, pinnedAt }` — exactly one at a time, in-memory only.

### Firestore collections
- `pods/{podId}` — `{ struggle, supportStyle, duration, memberCount, isActive,
  createdAt, expiresAt }`
- `pods/{podId}/members/{autoId}` — `{ userId, joinedAt }`
- `pods/{podId}/messages/{autoId}` — `{ type: 'user'|'system', text, userId?, createdAt }`
- `aiMentorChats/{autoId}` — `{ userId, role: 'user'|'model', text, timestamp, audioUrl }`
- `users/{userId}` — `{ tags[], name, goals[] }` (written by a dead onboarding screen)

### Persistence
- `@energy_tasks` (AsyncStorage) — regular tasks, via `app/taskStorage.ts`
- `@energy_life_tasks` — life tasks
- `@energy_last_reset_date` — last daily-reset date string
- **`app/(tabs)/taskStorage.ts` is pure in-memory** and is the one the screens
  actually use. Nothing persists across restarts for regular tasks in practice.

---

## 2. Today screen (`(tabs)/index.tsx`)

The energy-matching home view.

- **Header**: "Today's Focus" + live clock line `Sunday, Aug 18 · 3:04 PM`, refreshed
  every 60s. Info button opens a tips alert ("Swipe right to complete · Long press
  to pin").
- **Energy selector** — three buttons High (⚡ Zap) / Medium (☕ Coffee) / Low
  (🌙 Moon). Purely local state, defaults to `medium`, not persisted.
- **Energy matching rule** (the core idea of the app):
  - High energy → every task matches
  - Medium → matches everything except `high`-energy tasks
  - Low → matches only `low`-energy tasks
- **Insight banner** — one sentence keyed to the selected level:
  - high → "Peak energy. Tackle your hardest tasks first."
  - medium → "Decent energy. Medium tasks or lighter versions of big ones."
  - low → "Low energy. Simple tasks or a well-deserved break."
- **Three sections**, only rendered when non-empty:
  1. *Matched to your energy* + count badge — each card carries a "Now" pill
  2. *Save for later · N not matched* — same cards at 40% opacity
  3. *Done today · N* — strikethrough, tap to un-complete
- **Task card gestures** (Reanimated + gesture-handler `Gesture.Race`):
  - **Pan right** — card translates with the finger, a green check background
    fades in proportionally (`translationX / 80`). Past 80px it flies out to
    x=420 over 180ms, then marks complete. Under threshold it springs back
    (damping 20, stiffness 200). Vertical movement >10px cancels the pan.
  - **Long press 400ms** — 40ms vibration, pins the task to the notification tray,
    confirmation alert.
- Cards show name, "Due 3:30 PM" if `dueTime`, duration `60m`, energy icon+word,
  and a type badge. Left border is colour-coded by energy level.
- Filters to **today only** (`dueDate` same calendar day; tasks with no date count
  as today).
- Completing a task cancels its scheduled notifications.
- Empty state: ✦ / "All clear" / "No tasks scheduled for today".
- **Polls `getSharedTasks()` every 500ms** to pick up changes from other screens.

---

## 3. Life screen (`(tabs)/life.tsx`)

Self-care habits, deliberately gentler in tone than the task screens.

Three modes in one file:

**A. Empty state** (nothing enabled) — heart icon, "Life Tasks", copy: "Gentle
nudges for self-care — meals, hydration, rest. No pressure, just support.", and a
*Choose Your Reminders* button.

**B. Setup / Reminders screen** — the 12 defaults grouped Morning ☀️ / Midday ☕ /
Evening 🌙, each row = emoji + name + time window + edit pencil + a `Switch` to
enable. A ➕ per section opens the create modal pre-set to that time of day.

**C. Main screen** — only enabled tasks, grouped by time of day, each group headed
with an icon, a label and a `done/total` progress pill.
- Tap a row to complete (or increment, for repeats)
- Long press 500ms pins it to the notification tray
- Repeating tasks render a row of dots (filled = logged) and a label:
  `2/3` while partial, `All done 🎉` when finished, `3×` when untouched
- Footer encouragement line, switching on completion:
  all done → "You've taken care of yourself today ✦",
  otherwise → "These are gentle reminders, not obligations 💙"
- Settings gear returns to the setup screen

**Daily auto-reset**: on every read of `getLifeTasks()` it compares
`new Date().toDateString()` against the stored `@energy_last_reset_date` and, on a
new day, clears `completed` and `completedCount` for every task.

**Life task editor modal** (`LifeTaskModal.tsx`): emoji field (max 2 chars),
name, time window (free text, hint "Use format: 7–9 AM"), time-of-day segmented
buttons, repeat count 1–5 rendered as `Once / 2x / 3x / 4x / 5x` with a hint
"💡 Perfect for hydration, meds, or frequent check-ins" when >1. Delete button on
edit (confirm dialog), save validates name + time window are non-empty.

Polling: 500ms, **paused while the edit modal is open** (via a ref) so typing
isn't clobbered.

---

## 4. Tasks screen (`(tabs)/all-tasks.tsx`)

The calendar/list view. The largest screen in the app.

- **Header** — "All Tasks" + `N active · M done` for the selected day, plus a ➕
  and a calendar button.
- **Week strip** — Mon-first, 7 day cells with weekday label, date, and up to 3
  dots representing task count (a `+` if more). Selected cell is filled accent,
  today gets an accent outline. `‹ Aug 12–18 ›` navigation label above it, spanning
  months correctly (`Jul 29 – Aug 4`).
- **Sort control** — `Date` (by due date, undated last) or `Priority`
  (high → medium → low).
- **Task cards** — name, date label (`Today` / `Tomorrow` / `Aug 22` / `No date`),
  duration, energy icon + word, a priority badge, a type badge, and an edit pencil.
  Completed tasks render dimmed + strikethrough under a `Completed · N` heading.
- **FAB** bottom-right, opens the add sheet.
- **Full calendar modal** — full-screen month grid (Mon-first, correct leading
  blanks, aspect-ratio 0.9 cells), `‹ August 2025 ›` navigation, a *Today* shortcut
  that jumps both the selection and the visible month, up to 3 task dots per day.
  Below the grid: the selected day's tasks (active, then `Done (N)`), an *Add*
  button, a *Close* button, and a dashed "No tasks this day / Tap to add one"
  empty state. Selecting a date in here also re-aligns the week strip
  (`weekOffsetForDate`).
- **Add and Edit bottom sheets** — dark scrim, rounded top sheet with a grab
  handle, max height 94%, both wrapping the shared `TaskForm`.
- Cross-modal handoffs use a 300ms `setTimeout` so one modal finishes dismissing
  before the next opens.
- Same 500ms polling.

---

## 5. Add screen + shared `TaskForm`

`(tabs)/add-task.tsx` is a thin wrapper: header "New Task / Plan it once, do it
right", then `TaskForm`. On save it adds the task, schedules notifications if a due
time was set, then alerts with **Add Another** / **Done** — both of which reset the
form by bumping a `key`.

**`TaskForm.tsx`** — one component, used by the Add tab, the add sheet and the edit
sheet. Fields, in order:

| Field | Control | Default |
|---|---|---|
| Task Name | text input (required) | `''` |
| Description *(optional)* | multiline, 3 rows | `''` |
| Due Date | button → `DateTimePicker` (spinner on iOS, default on Android) | today / passed-in date |
| Due Time *(optional)* | button → time picker, 5-min interval, 12h; shows `3:30 PM` with an ✕ to clear. Hint: "Set a time to get a deadline reminder" | `null` |
| Priority | 3 chips High/Medium/Low | medium |
| Energy Required | 3 chips High/Medium/Low | medium |
| Estimated Time | large button → time picker used as a duration picker (h:mm → minutes, 5-min interval, min 1) | 30m |
| Task Type *(optional)* | free text + 4 quick chips: Admin, Deep focus, Creative, Physical | `''` |

- Save is disabled until the name is non-empty. Two button layouts: full-width
  (with a "Name is required" note) or Cancel + Save row when used in a sheet.
- iOS pickers get an explicit *Done* button; Android pickers self-dismiss.
- Duration is formatted `45m` / `2h` / `1h 30m`.

---

## 6. Notifications

Two separate services.

### `notificationService.ts` — the pinned "focus mode" notification
- Android channel `task-focus`, HIGH importance, **vibration disabled**
  (`vibrationPattern: [0]`), public on the lockscreen, light colour `#8b5cf6`.
- Foreground handler shows banners, **no sound, no badge**.
- Two notification categories with action buttons:
  - `TASK_FOCUS` → `✅ Done`
  - `TASK_FOCUS_REPEAT` → `➕ Log one` and `✅ All done`
  - Both `opensAppToForeground: false` — they act in the background.
- **Exactly one pinned task at a time** (fixed identifier `energy-pinned-task`,
  `sticky: true`). Pinning dismisses any previous one first.
- Body text logic: repeats → `1/3 done today · tap action to log`; else
  `timeWindow`; else `20 min`; else `In focus`.
- Action handling: `DONE`/`ALL_DONE` marks the task (or life task) complete and
  dismisses; `LOG_ONE` increments the repeat counter and **re-posts the
  notification with updated progress**, or dismisses it if that completed the task.
- Requests permission at startup (Android 13+ runtime permission).

### `taskNotificationService.ts` — deadline reminders
- **Keyword-based duration estimation** from title + description, first match wins:
  - project|presentation|proposal → 120 min
  - assignment|essay|thesis|dissertation|draft → 90
  - design|build|develop|code|implement|create → 90
  - study|research|read|review|prepare|plan|analyze → 45
  - meeting|call|interview|session|discussion → 30
  - write|report → 45
  - email|reply|message|respond|text → 10
  - quick|brief|short|small|minor|simple → 15
  - fallback → 30
- For any task with both a due date and due time, schedules **two** notifications:
  1. `task-{id}-start` at *deadline − estimated duration*: "Time to start "X" — it
     may take around 45 min."
  2. `task-{id}-deadline` at the deadline: ""X" is due now. You've got this!"
- Skips anything already in the past, cancels previously scheduled IDs on
  reschedule, and returns the IDs so they can be stored on the task and cancelled
  on completion.

### `PinnedTaskBanner.tsx`
An in-app mirror of the pinned notification — purple card, "ENERGY – FOCUS MODE"
label, emoji, name, `20m task` or time window, a **Done** button and an unpin ✕
(with confirm). Polls the pinned task every 500ms. **Currently rendered by
nothing** — it's built but not mounted on any screen.

---

## 7. Talks screen (`(tabs)/talks.tsx`)

Two browser-style tabs under one purple header.

### 7a. AI Chat (Gemini mentor)
- On open: loads the Firestore user profile (`tags`, `name`, `goals`) and the last
  50 messages, oldest first. If there's no history it renders a generated welcome:
  `Hi {name}! I'm your AI mentor. 💙` plus a tag-specific line — ADHD → "I know
  navigating ADHD can be challenging, but you're not alone in this."; Anxiety →
  "I'm here to support you through the ups and downs."
- Chat bubbles: user right/purple, model left/grey, timestamps, "Thinking…"
  spinner while awaiting a reply, 500-char input limit, `KeyboardAvoidingView`.
- **Voice Responses toggle** in a header strip. When on, every AI reply is sent to
  ElevenLabs and played back; failures are swallowed silently.
- Both sides of every exchange are written to `aiMentorChats` in Firestore.

**The model call** (`aiMentorService.ts`):
- `gemini-2.5-flash-lite` via REST `generateContent`, temp 0.9, topK 40, topP 0.95,
  max 1000 output tokens, all four safety categories set to
  `BLOCK_MEDIUM_AND_ABOVE`.
- Context = system prompt turn + a canned model acknowledgement + last 20 messages
  + the new message.
- **System prompt** defines a warm, casual, non-clinical mentor with explicit
  sub-sections for ADHD support (chunking, executive function, validate-then-
  empower), anxiety (grounding, normalise), and motivation (break down, celebrate
  small wins). Occasional emoji allowed. Explicitly "not a therapist".
- **Function calling with 4 tools** (`taskTools.ts`):
  - `add_task` — requires name, priority, energy, time, type; optional dueDate
  - `delete_task` — fuzzy substring match on task name
  - `list_tasks` — renders a bulleted list with ✅/⏳
  - `complete_task` — fuzzy match + boolean
  The prompt instructs the model to collect missing required fields
  **conversationally, one question at a time**, rather than dumping a form.
- Tool flow: first call returns a `functionCall` → execute locally → second call
  with the `functionResponse` appended → return the natural-language reply. If the
  follow-up call fails, the raw tool result string is returned instead.

### 7b. Community Pods
- **Anonymous Firebase auth** (`signInAnonymously`) — no account, no email.
- **Join flow, 3 questions**:
  1. What brings you here today? — Focus & Motivation / Overwhelm / Anxiety / Loneliness
  2. What kind of support helps you most? — Just listening / Advice & tips / Shared experiences
  3. How long should this pod last? — 24 hours / 7 days
  Join is blocked until all three are answered. Footer: "💙 Anonymous • Safe space • No judgment".
- **Matching**: finds an active pod with the same `struggle` and `memberCount < 5`,
  ordered by fewest members; joins it, or creates a new one. Joining an existing
  pod posts "Someone new joined the pod 👋"; a new pod opens with "Welcome to your
  pod! 💙 Be kind and supportive."
- **One pod per user** — joining while already in a pod leaves the old one first.
- **Chat**: real-time `onSnapshot` subscription ordered by `createdAt`. Own
  messages right-aligned purple with white text; other members get a **stable
  pastel colour derived from a hash of their user ID** (10 soft ADHD-friendly
  tints: mint, sky, warm yellow, lavender, peach, lime, pink, teal, amber, purple).
  System messages centre-aligned. Timestamps `3:04 PM`.
- **Header** shows `N people • Overwhelm` and a leave button.
- **Leaving**: confirm dialog ("Your chat history will be cleared"), clears the UI
  immediately then updates Firestore — deletes the member doc, decrements
  `memberCount` (floored at 0), sets `isActive: false` when it hits 0, and posts
  "Someone left the pod 👋" if anyone remains.
- **Expiry**: `expiresAt` is checked on load and on render. An expired pod shows
  "This pod has ended 💙" with a *Join a new pod* button in place of the composer,
  and expired pods are auto-left when detected.

### 7c. TTS (`ttsService.ts` / `elevenLabsService.js` — duplicates)
Three voice presets — Sarah `EXAVITQu4vr4xnSDxMaL` (warm/empathetic, default),
Adam `pNInz6obpgDQGcFmaJgB` (calm/supportive), Charlie `IKne3meq5aSn9XLyUdCD`
(friendly/energetic). Model `eleven_monolingual_v1`, settings stability 0.5,
similarity_boost 0.75, style 0.4, speaker boost on. Response blob → base64 data
URI → `expo-av` `Audio.Sound`, auto-unloaded on finish.

---

## 8. Focus screen (`(tabs)/focus.tsx`) — **static mock**

This is the one screen rebuilt in the new design system, and it has **no logic**.

Two states toggled by a button, no camera, no timer, no tracking:

- **Threshold** (paper): "Ready when you are." + "Your camera tracks how steady
  your attention is. Nothing is recorded and nothing leaves your phone." + a
  `Last session · 38 min · Avg 74%` row + *Begin session*.
- **Active session** (deep-ink emphasis block, rounded 24, inset): `SESSION 04` /
  `24:18` header, `FOCUS` / `STEADY` labels, a **128pt tabular-figure metric
  showing a hard-coded `87%`**, a hairline SVG polyline of a 36-point fixed sample
  array, `Last 3 min` / `Avg 72%`, and *End session*.
- The metric font size steps down responsively: 128 → 108 → 88 by viewport height,
  so the screen never scrolls.
- The graph is a deliberately **unsmoothed** `Polyline` — no fill, gradient, dots,
  axes or grid.
- Haptics: `heavy` on both entering and leaving a session.

**[README ONLY]** — none of this exists in the code: Presage SDK attention
tracking, camera permission flow, the 6 calming colour overlays (Calm Blue, Forest
Green, Warm Beige, Soft Purple, Deep Gray, Ocean Teal), session history, live
metrics. Previous focus data was `Math.random()`.

---

## 9. Design system (`theme/` + `components/primitives/`)

Fully built, but **only the Focus screen uses it**. The other five screens run on a
compatibility shim.

- **Palette — "warm light, cool shadow"**, saturation ceiling 55%, no untinted grey
  anywhere. Three surfaces:
  - `light` (paper): bg `#F5F0E6`, raised `#F8F4ED`, fg `#2E332F` (11.34:1),
    secondary `#5C6661` (5.24:1), faint `#949D99` (2.4:1, decorative only),
    accent `#AD8234` / accentText `#896829`, rules = ink at 7/12/22% alpha
  - `dark` (dusk): bg `#1D1916`, fg `#EDE4D6`, accent `#CA9F4E`
  - `emphasis` (deep ink block): bg `#2E332F`, fg `#F5F0E6`, accent `#CDA356` —
    reserved for the focus session and a paywall, "inversion is a budget"
  - Supporting tones, one per screen max, never with the accent: rain / moss /
    terracotta, each in `wash` (decorative) / `mark` (graphic) / `ink` (text-safe)
- **Type**: Instrument Serif display (56/36, never below 28pt), IBM Plex Mono for
  everything else. Scale jumps deliberately: 128 → 48 → 56 → 36 → 15 with the
  mid-range empty. Tabular figures on metrics so digits don't jitter. Uppercase +
  0.12em tracking baked into `label`/`labelSm` so the ALL-CAPS-for-structure-only
  rule is enforced by token choice.
- **Shape**: rounding is *scoped* — round for objects (buttons, inputs, images,
  sheets, the emphasis block), flat for structure (rows, messages, separators,
  screens). `pill(height)`, `nest(outer, padding)`, and iOS `borderCurve:
  'continuous'`.
- **Motion**: `duration.cut = 0` is a real token. Press feedback 120ms / 2% scale.
  Asymmetric inversion (in 520ms settle, out 360ms). Reduced motion collapses
  travel to 0 and durations to 100ms but keeps the inversion, because it carries
  meaning. `NEVER_ANIMATE` lists borderRadius/width/height/top/left.
- **Haptics vocabulary**, fired on `onPressIn`: `selection` moving through options,
  `light` ordinary button, `medium` committing, `heavy` entering/leaving a session,
  `success` completion.
- **Primitives**: `Text` (no font props — colour comes from the surface),
  `Button` (solid draws in the opposite palette), `Block` (renamed from Card — no
  fill/radius/shadow), `Rule` (renamed from Divider), `Sheet` (velocity-based
  dismissal, rubber-band, faster exit), `Input` (a ruled line, focus brightens the
  rule .12→.30), `ListItem` (no checkbox — completion is strikethrough + muted),
  `Screen`, `Skeleton` (built from hairlines), `StateView`, `usePressScale`.
- `Surface` context propagates the palette so a whole subtree flips with no prop
  threading.
- **Legacy shim** in `theme/index.ts` maps the old `colors`/`radius`/`shadows`/
  `typography` names onto the new tokens, deliberately collapsing status colours to
  monochrome and shadows to near-nothing, so unmigrated screens drift toward the
  new look rather than fighting it.

`DESIGN.md` holds the full rationale and is worth reading before v2 — it argues
each decision (why not #FFF on #000, why mono body copy is a flagged risk, why the
session screen isn't fully inverted, why the graph isn't smoothed).

---

## 10. Known defects and dead code — fix these in v2

1. **Two `taskStorage` modules.** `app/taskStorage.ts` (AsyncStorage-backed,
   async, has `deleteTask`/`toggleTaskCompletion`) vs `app/(tabs)/taskStorage.ts`
   (in-memory, sync, has `description`/`dueTime`/`notificationIds`). All screens
   import the **in-memory** one; the AI tools and `TaskEditModal` import the
   persisted one. Result: **regular tasks do not survive an app restart, and
   AI-created tasks never appear in the UI.** This is the single biggest bug.
2. **`initializeTasks()` is never called** anywhere, so even the persisted store
   never loads.
3. **500ms `setInterval` polling on four screens** as the cross-screen sync
   mechanism. Replace with a store (Zustand/Jotai/Context + reducer) or
   `useSyncExternalStore`.
4. **Firebase config is hard-coded in `app/firebase.js`** and committed, and
   `aiMentorService.ts` logs the Gemini key's length and first/last 10 characters
   to the console on import.
5. **`app/firebase.js` is a junk drawer** — it exports Firebase services *and*
   contains a full `OnboardingScreen` React component wired to a `navigation` prop
   for a navigator this app doesn't use, plus `updateDoc` used without being
   imported (throws if a profile already exists). **Onboarding is therefore
   unreachable**, which means `users/{id}.tags` is always empty and the AI mentor's
   personalisation never activates.
6. `PinnedTaskBanner` is never mounted.
7. `pinnedTaskStorage` is in-memory only — the pin is lost on restart while the
   sticky notification survives.
8. `getUserPod()` does a **full collection scan of every pod, then a subcollection
   query per pod**. Store `podId` on the user document instead.
9. `clearConversationHistory()` logs a message and deletes nothing.
10. `elevenLabsService.js` and `ttsService.ts` are near-duplicates; only the TS one
    is used.
11. `react-native-chart-kit` is still a dependency but deliberately abandoned
    (it rebuilds its whole SVG tree per sample and ships a lavender background).
12. Talks, LifeTaskModal, TaskEditModal and PinnedTaskBanner are still on the old
    purple `#8b5cf6` palette and Nunito; `LifeTaskModal` uses white placeholder
    text on a light background (invisible).
13. Energy level and sort preference aren't persisted.
14. Life-task "time windows" are free text, so nothing can actually schedule
    against them.
15. `TaskEditModal.tsx` is superseded by `TaskForm` in a sheet but still present.
16. Notification permission is requested at cold start with no explanatory screen.
17. `app/modal.tsx` is boilerplate; `test-mentor.js` and the default Expo template
    components (`hello-wave`, `parallax-scroll-view`, `themed-text/view`) are unused.

---

## 11. Suggested v2 scope

Carry over, unchanged in spirit:
- Energy-matched task triage (the differentiator)
- Life tasks with opt-in defaults, repeats, and daily reset
- Swipe-to-complete + long-press-to-pin
- The sticky pinned notification with background action buttons
- Deadline-aware notifications with keyword duration estimation
- Gemini mentor with task function-calling and conversational field collection
- Anonymous ephemeral community pods with hash-stable member colours
- The Soft Focus design system, applied to every screen this time

Fix or build:
- One task store, persisted, with a real reactive layer
- Onboarding that actually runs, so tags/name/goals feed the mentor
- Real focus tracking, or cut the feature honestly rather than shipping a mock
- Secrets out of the repo; a server proxy for the Gemini and ElevenLabs keys
- Firestore security rules (currently unaudited; anonymous clients write freely)
- Persist energy level, sort order and the pinned task
