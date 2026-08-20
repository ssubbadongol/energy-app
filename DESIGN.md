# Soft Focus — design decisions

Why the interface is the way it is. Written to be defended out loud.

> Status: **Stage 1 of 6** — tokens, primitives, and the focus session as a
> static direction sample. Screens land one at a time from here.

---

## The thesis

Near-monochrome and editorial. Type and negative space do the work that colour,
cards and elevation do in a conventional app. There is no accent colour, no
shadow, no radius except pills, and no elevation model. Separation is a hairline
rule or nothing. Emphasis is inversion.

The discipline this imposes is the point: when there is no accent to reach for,
hierarchy has to come from size, weight and space, which are the things that
actually make a layout read as considered.

---

## Typefaces

Two, and the reasoning matters more than the names.

### IBM Plex Mono — data, labels, body, controls

Chosen over Space Mono and Courier Prime on three grounds:

**Weight range.** Plex Mono ships seven weights. Space Mono ships two. This
system leans on mono for the 128pt metric, 15pt body, 13pt controls and 10–11pt
caps labels — that hierarchy needs Light, Regular and Medium as separate voices,
and two weights cannot carry it.

**Small-size legibility.** Roughly 90% of the mono in this app is set between
10pt and 15pt. Plex was drawn for interface and data use at exactly that size.
Space Mono's quirks — the curved leg on the R, the distinctive g — are charming
in a 48pt headline and become noise in a 10pt metadata row repeated forty times
down a task list.

**It counteracts the coldness risk.** Plex is a humanist mono; it has a slight
warmth that a geometric mono does not. Given the explicit instruction that this
app must not read as judgemental, using the *warmer* of the candidate monos is
a functional choice, not an aesthetic one.

Courier Prime was never really in contention — it is a typewriter face, too
light and too loosely fitted to hold a 128pt number.

### Instrument Serif — display only, never below 28pt

Chosen over Bodoni Moda, primarily for one technical reason:

**Didone hairlines do not survive light-on-dark.** Bodoni is a true Didone with
extreme thick/thin contrast. Set light-on-dark, thin strokes visually erode
(irradiation — the bright background bleeds into the dark stroke). At 36–56pt on
`#0A0A0A` a Bodoni hairline shimmers and, on lower-density screens, drops out
entirely. Instrument Serif carries high contrast with materially sturdier
hairlines and was drawn for large display use on screen.

Secondary: Bodoni Moda's optical-size axis is a variable-font feature, and
`@expo-google-fonts` ships static instances, so we would lose the main thing
that makes Bodoni good at display sizes anyway.

Instrument Serif ships one weight plus italic. That is not a limitation — a
display face used at a single weight is a discipline, and having no bold
available removes a decision that would otherwise get made inconsistently.

### The one thing I'd flag

**Body copy is mono**, at 15/26 with a 52-character measure. That is faithful to
the reference and it is comfortable for a paragraph or two. It is *not*
comfortable for a long AI mentor exchange, and that screen is where this
decision will be tested. If it fails there, the escape hatch is IBM Plex Sans
for body only — metrically related, same superfamily, so the app would still
read as two voices rather than three. Flagging now rather than discovering it in
stage 3.

---

## Colour

Two brightnesses. That is the entire palette.

| | Dark surface | Inverted surface |
| --- | --- | --- |
| Background | `#0A0A0A` | `#EDEDED` |
| Foreground | `#EDEDED` (16.9:1) | `#0A0A0A` (16.9:1) |
| Secondary | `#9A9A9A` (7.0:1) | `#4A4A4A` (7.6:1) |
| Muted | `#7C7C7C` (4.7:1) | `#666666` (4.9:1) |
| Faint | `#4A4A4A` (2.2:1) | `#A8A8A8` |
| Rule | `rgba(255,255,255,.15)` | `rgba(10,10,10,.15)` |

### Neither end is pure

`#FFF` on `#000` is the maximum contrast a screen can produce, and at that ratio
the light areas visibly bleed into the dark (halation). It reads as vibrating
text and it is fatiguing within minutes. For an audience with ADHD and anxiety,
using an app meant to help them sit still, that is a functional defect rather
than a matter of taste. `#0A0A0A` / `#EDEDED` still measures **16.9:1** — well
above AAA — with the shimmer removed.

The inverted surface is the same two values swapped, so the system only ever
contains two brightnesses in either direction.

`faint` fails AA at 2.2:1 **by design** — it is for disabled states and inactive
rules, never for text carrying meaning. The token file says so next to the value.

### No colour is an accessibility feature

"Colour is not the only indicator" is a rule this system satisfies by
construction rather than by remembering to. An error cannot be signalled by
turning something red because there is no red — it has to be signalled by
wording, weight and structure, which is what a screen reader gets anyway.

### Inversion is a budget

Exactly one inverted surface type exists and its force comes from rarity.
Currently spent on: the focus threshold, and the paywall. Spending it anywhere
else devalues both.

---

## Shape

Radius is `0` everywhere. `pill` exists for tags and filters and is the only
curve in the system — opt-in, and not for primary actions.

No shadows, no blur, no gradient, no glass, no elevation model. `depth` is gone
from the token file entirely rather than left at zero, so there is nothing to
accidentally re-enable.

---

## Type scale

The scale jumps deliberately. 128 → 48 → 56 → 36 → then nothing until 15.

The gap is the design. Mid-sized type is what makes a screen read as a form
rather than a page, and the contrast between a 128pt metric and an 11pt caps
label is the entire effect. Filling in 20pt and 24pt would make every screen
safer and duller.

`letterSpacing` in React Native is absolute points, not ems, so each token
carries its own computed value. The caps labels are set at 0.12em of their own
size — 1.32px at 11pt, 1.2px at 10pt.

Tabular figures on `metric` and `metricSm`. Without them the digits are
proportional, so `87%` is narrower than `100%` and the number visibly jitters
once a second, directly in the user's eyeline, for the length of a session.

**Verified in the browser**, not assumed — computed styles read back exactly:
`IBMPlexMono_300Light` at 128px/128px with `-6px` tracking and
`font-variant-numeric: tabular-nums`; labels at 11px with `1.32px` tracking and
`text-transform: uppercase`; `InstrumentSerif_400Regular` at 56px/-1.6px.

---

## Copy voice — the one thing not taken from the reference

The reference app's voice is blunt, declarative and a bit cold. That works for
astrology and would be actively harmful here. This is an app for anxious
students, and a curt sentence about their empty task list reads as judgement.

**ALL CAPS is for structural labels only** — `SESSION 04`, `TODAY`,
`POD · 3 MEMBERS`. Never for a sentence addressed to the user. Sentences stay
warm and plain: "Ready when you are." not "BEGIN."

This is encoded in the type scale itself — `label` and `labelSm` carry
`textTransform: 'uppercase'`, and `body` and `display` do not, so the register
is enforced by which token you pick.

---

## Motion

This aesthetic runs on stillness, so the token file makes stillness explicit.

`duration.cut` is `0` and is a **real token, not a placeholder**. Naming it
makes "no transition" a decision recorded in the code, rather than an omission
that somebody later "fixes" by adding a 200ms fade.

Motion is permitted in exactly three places, all of which earn it:

1. The live focus percentage counting
2. The graph drawing itself in as data arrives
3. **The black↔white inversion** — the one moment given real craft

Everything else is a cut. Press feedback is 120ms and 2% of scale; a springy
0.95 bounce belongs to a rounded, friendly system and against flat rectangles it
looks like the button is made of rubber.

### Haptics carry the weight

With almost no animation, confirmation that the interface heard you is physical.
The vocabulary is fixed in one place so a sensation always means the same thing:
`selection` for moving through options, `light` for an ordinary button, `medium`
for committing, `heavy` for entering or leaving a session, `success` for
completion. It fires on `onPressIn` — feedback that arrives after the finger
lifts reads as lag even when nothing is slow.

### Reduced motion softens, it does not strip

`travel` collapses to 0 so the sheet cross-fades instead of sliding, durations
flatten to 100ms, and the graph appears complete instead of drawing. The
inversion still *happens*, because it carries the meaning "you are now in a
session" — removing it would remove information, not decoration.

---

## The focus session, and why it is not fully inverted

The brief suggested running this screen as the inverted white surface. I split
it instead: **the threshold states are inverted, the live session is dark.**

**Eye strain.** A full-white screen held at reading brightness for a 25–50
minute session is a real photophobia load, and this audience carries it. The
feature this screen replaces had colour overlays for precisely that reason.
Inverting the one screen the user stares at longest would be the least
accessible choice available.

**Rarity.** If the session screen is permanently white, then white is just "the
focus tab" and it signals nothing. Used at the boundary it *means* something:
white is the threshold, black is being in it. Which also gives the inversion
transition something to be about — it marks crossing into and out of focus,
rather than decorating a tab change.

### The graph

A hairline polyline. No fill, no gradient, no dots, no axes, no grid.

Deliberately **not smoothed**. A bezier curve would imply the attention signal
is continuous and gentle; it is neither, and the sharp corners are honest about
that. It also suits a rectilinear system.

`react-native-chart-kit` is dropped. It rebuilds its whole SVG tree on every
sample — once a second, for a whole session — and ships a lavender background
baked into its config. The replacement is `react-native-svg`, already in the dev
build, and will be driven by `useAnimatedProps` on the UI thread when the live
session logic lands.

---

## Primitives

Two renames from the previous system, both deliberate:

- `Card` → **`Block`**. There are no cards. A block is bounded by a rule above
  it, below it, or by nothing. Keeping a component called `Card` that renders no
  card is the kind of quiet lie that makes a codebase hard to reason about later.
- `Divider` → **`Rule`**. A hairline rule is the entire separation model, doing
  the job a card border, a background tone and a drop shadow would do together.

| Primitive | The decision it encodes |
| --- | --- |
| `Text` | No `fontSize`, `fontFamily` or `fontWeight` prop. Colour comes from the surface, not a prop. |
| `Button` | `solid` draws in the *opposite* palette to its surface — the only emphasis mechanism available without an accent. |
| `Block` | No fill, no radius, no shadow. Rules or air. |
| `Rule` | The separation model. |
| `Sheet` | Square corners, one hairline, scrim. Velocity beats distance; rubber-band at the top; exit faster than entrance. |
| `Input` | A ruled line, not a box. Focus brightens the rule 0.15 → 0.30. Reserved space for errors. |
| `ListItem` | **No checkbox** — completion is strikethrough plus muted. No entrance animation. Press is a cut. |
| `Screen` | No header. An 11pt caps-mono label and a lot of nothing. `inverted` flips the whole subtree. |
| `Skeleton` | Built from hairline rules, because a pulsing grey block would be the only solid fill on screen and would read as a bug. |
| `StateView` | Left-aligned and hanging low — editorial, not a dialog. Carries the image slot. |

`Surface` propagates the palette by context, so `<Surface inverted>` flips every
primitive below it with no prop threading. Verified: on the inverted screen the
background, display serif, body, labels, rules and solid button all flipped
correctly without any component being told about it.

---

## Not yet done

1. **Imagery.** Mandatory per the brief and not yet sourced. Needs a fetch from
   Rijksmuseum / NASA / Internet Archive plus a consistent treatment pass
   (desaturate → crush contrast → optional halftone). The slot exists on
   `StateView`; the focus session correctly has none, since that screen is
   specified as having nothing but the metric and the graph.
2. **The tab bar.** Still the old dark `#09090BF0` bar in Nunito. On the
   inverted threshold screen it is now a visible clash. It probably should not
   be present during a focus session at all — hiding chrome is what a focus mode
   is for.
3. **Live session logic.** No camera, no timer, no tracking. Numbers are fixed.
4. **Presage.** Not installed; the previous focus data was `Math.random()`.
5. **AI mentor streaming.** Still a single awaited response.
6. **Onboarding and paywall.** Neither exists. Onboarding is a dead component in
   `app/firebase.js` wired to a navigator this app does not use.
