# NOVELLA FIRST-RUN & MOTION SPEC
*Synthesized from four research lenses: Lingrow design language [LG], Lingrow onboarding evidence [LO], Apple presentation rules [AP], premium onboarding patterns [PO]. One recommendation per point.*

A note on the brief's origin story: the "Lingrow's favorite-color question recolors the app live" moment is **unverified — no public source mentions it** [LO]. That doesn't matter: Novella already has the mechanism (`applyPersonalization()`, 0.3ms, auto-contrast), and the pattern is independently validated by Arc's paint-the-window theme picker, Headspace's live-reacting intent screen, and Linear asking theme as its literal second question [PO]. We keep the moment and anchor it to that evidence instead. The verified Lingrow lesson is the *negative* one: a scripted intro that ignores the user's signals and can't be skipped is the #1 documented failure — Lingrow shipped no skip, got roasted, and patched onboarding in 4 of 21 releases [LO]. Skip is therefore load-bearing, not decorative.

---

## 1. INTRO EXPERIENCE

**Form:** A separate full-screen route (`/welcome`) that mounts before the workspace shell ever renders. Ember theme by default (dark), a single dim radial glow behind the text (one gradient, not five — Lingrow's mesh is candy-consumer; Novella is a serious tool, so we take Lingrow's *restraint* recipe, not its rainbow [LG]). All copy is scripted and offline. It is not a chat UI and never pretends to be AI (see §3).

**Persistent chrome on every screen:** a thin 4-segment progress bar top-center, segment 1 already filled on arrival (endowed progress [PO]), colored `--accent`; a quiet text link top-right: **"Set up later"** (deferral framing beats bare "Skip" [PO]) — clicking it lands on Ember defaults + a blank project, and every skipped question is re-asked just-in-time in-product (§6).

**Timing budget: ~75 seconds total, hard ceiling 90** (Linear does 7 steps in 60s; 3–5 questions is the tested sweet spot [PO]).

### Screen 0 — Cold open (~8s, no question)
Black. One line streams in, set large in `--font-display` serif:

> "Every book starts the same way. An empty page, and someone stubborn enough to fill it."

Beat, then: *"Let's set up yours."* One button: **Begin**. Verb-first, period-terminated fragments, no exclamation marks, no "we're excited" [AP]. This is the Linear philosophy-first beat [PO].

### Screen 1 — Pen name (~15s)
> "First — what name goes on the title page?"

Single text field, hint text `e.g. J. M. Ashford` (HIG: hints are concrete examples [AP]). Enter submits. The very next line uses it: *"Good to meet you, Ashford."* — the first proof that answers land somewhere [PO]. Optional; Enter on empty continues as "Author."

### Screen 2 — Favorite color (~12s) — the signature moment
> "Pick a color you'd want on the spine."

Eight large swatch chips. On **click**, `applyPersonalization()` fires and the *intro itself* recolors in the same frame: progress bar, the Begin-style buttons, focus rings, the text-field caret, selection highlights. Copy acknowledges it: *"There it is. That's yours now — the whole app follows it."* This is the Arc paint-the-real-window pattern; the answer mutates the UI within 0 screens, not 1–2 [PO]. Cheapest question, 100%-visible payoff (Linear's theme-as-question-two logic [PO]).

### Screen 3 — What do you write (~15s)
> "What kind of story is pulling at you?"

Five chips, one per genre theme (Ember default highlighted). **Hover previews the full theme live; click commits** — the UI reacts before confirmation, Headspace's intent-screen pattern [PO]. The whole screen repaints: background, `--font-display` pairing, radii, the works. Accent from Screen 2 survives the theme swap (auto-contrast handles collisions). Copy: *"Ember it is. Dark, warm, made for late nights."*

### Screen 4 — The honest AI check (~10s)
> "One more thing. Novella can work with a local AI — if you have one."

A single **Check for local AI** button. Pressing it runs the *real* Ollama probe (real work, sub-second — the honest version of the labor-illusion interstitial [PO]). Two scripted outcomes, both truthful:
- Found: *"Found Ollama with 2 models. It'll be there when you want it."*
- Not found: *"Nothing running right now. That's fine — Novella works completely offline. You can add one later in Settings."*
No spinner theater, no retry nagging, one Continue. Never fake AI, never fake progress (house rule + [PO] anti-pattern #3).

### Screen 5 — First project (~15s)
> "Last question. What are we opening tonight?"

The existing 4 preset cards. Selecting one starts real project creation *behind* a brief interstitial that names their actual choices while doing the actual work:

> Binding "The Hollow Crown" · Ember theme · your color on the spine · offline mode

Each line checks off as the corresponding file/write completes — the Noom "loader that does real work" done honestly: it references real inputs and the steps are real operations [PO]. If creation finishes in <800ms (it will), hold the completed list ~600ms so it reads, then hand off. Never pad with fake steps.

### The handoff (no cliff)
The intro does not end on a "You're all set!" screen — that's the documented dead-end [PO]. Instead: the interstitial's background **is already the workspace's editor background**; the intro text fades out (200ms), the editor page fades/rises in (300ms, ease-out), and side panes do **not** appear — quiet first run holds: the editor opens alone, chapter one titled from the preset, **cursor already blinking in the first line**, caret in their accent color. The Linear pattern: onboarding's final frame IS the first real action, pre-staged [PO]. One line of placeholder-style ghost text in the empty editor: *"Chapter One begins wherever you do."* — vanishes on first keystroke.

**The single celebration** is reserved for the user's first written words, not for finishing setup [PO]: on the first keystroke ever, the word counter fades in and ticks to 1 with a 150ms accent pulse. Once, ever, quietly. Confetti is banned (§5).

---

## 2. MOTION SYSTEM

CSS tokens, added to the existing token file (all numbers from Apple's shipped values [AP]):

```css
:root {
  /* durations */
  --motion-quick:    120ms;  /* hover, focus, chip select, toast exit */
  --motion-standard: 240ms;  /* modals, drawers, pane toggles, toast enter */
  --motion-slow:     400ms;  /* theme crossfade, large surface changes */
  --motion-intro:    600ms;  /* /welcome route ONLY — never in workspace */
  --motion-stagger:  40ms;   /* control groups; 150ms for intro line reveals */

  /* easings */
  --ease-enter:  cubic-bezier(0.25, 0.1, 0.3, 1);  /* ease-out: all entrances & movement */
  --ease-color:  cubic-bezier(0.4, 0, 0.6, 1);     /* symmetric: color/opacity crossfades */
  --ease-hero:   cubic-bezier(0.66, 0, 0.1, 1);    /* fast-start long-settle: intro + handoff only */
}
```

**Rules** [AP]: entrances ease-out; crossfades symmetric; ease-in never alone; **exits equal or faster than entries** (modal in 240ms / out 160ms); nothing in the workspace exceeds 400ms; no bounce/overshoot anywhere in chrome (Apple ships overshoot 3 times in 1.1MB of CSS, only on decorative swatches — Novella's one permitted overshoot is the intro color-swatch pop on Screen 2).

**Surfaces that get transitions:**
- **Modals:** fade + scale 0.98→1, `--motion-standard` / exit `--motion-quick`, scrim fades with them.
- **Drawers/side panes:** translateX + width, `--motion-standard`, `--ease-enter`.
- **Command palette:** fade + 4px rise, `--motion-quick` — it must feel instant; result-list filtering is NOT animated.
- **Toasts:** rise 8px + fade in `--motion-standard`, exit `--motion-quick`.
- **Pane toggles:** width transition `--motion-standard`; editor content reflows with it (acceptable — it's a deliberate user action, not a typing path).
- **Theme/accent changes:** background/color transition `--motion-slow` with `--ease-color`, applied via a `.theme-transitioning` class added for one transition and removed after — so token swaps outside that window (including initial paint) are instant.

**Never animates — the sacred list:** anything between keydown and glyph paint; the CodeMirror caret, selection, and scroll; IME composition; autocomplete/palette result filtering; word-count updates during typing (it updates instantly; only the first-words moment pulses). Enforce with `.cm-editor, .cm-editor * { transition: none !important; }` scoped exception. Latency is the product; motion never touches it.

**`prefers-reduced-motion: reduce`:** every duration token drops to 0ms via one media-query block; intro text appears instantly per screen (content is never withheld — Apple's fallback is *instantly visible*, not skipped [AP]); the handoff becomes a cut; the intro remains fully usable as a sequence of static screens.

---

## 3. TYPED-CONVERSATION MECHANICS

**Voice, not chatbot.** Scripted lines render as large display-serif typography (`--font-display`) directly on the background — **no chat bubbles, no avatar, no "typing…" indicator**. Bubbles would imply an AI interlocutor, which the app doesn't have at first launch; simulating one violates the honesty rule and reads cheap the moment it can't respond (exactly how Lingrow's scripted intro fell apart when a user talked back and "it didn't care" [LO]). The app is the narrator; typography is the character.

**Streaming:** word-level reveal at a constant pace — ~35ms per word (smooth constant-rate streaming, never bursty chunks [PO]) — each word fading in over 80ms. Space for each message is **reserved before it streams** (invisible text sets layout) so nothing reflows or jumps [PO]. 350ms pause between lines; 500ms pause before a question appears with its input.

**Input presentation by type:** chips/cards for every choice (color swatches, genre chips, preset cards, single Continue buttons) — one tap, no free text [PO]; a text field **only** for pen name. Inputs appear only after their question finishes streaming (or is skipped ahead — below). Chips are keyboard-navigable (arrows + Enter) from the start; this is a desktop app.

**Impatience handling — the escape hatch, three levels:**
1. Click/tap/any-key **once** → current line completes instantly.
2. Click **again** → all remaining lines on this screen complete and the input appears.
3. "Set up later" top-right → exits the whole flow to sane defaults.

Manual advance only — never auto-advance past a committed answer (Headspace deliberately lets users review their choice [PO]). A returning power user can finish the entire intro in ~15 seconds of clicking; nothing is gated on an animation completing [AP].

**Copy style:** short declarative fragments, contractions, second person, zero jargon [LG]; verb-first buttons ("Begin", "Continue", "Check for local AI"), no "we," no "oops," no exclamation marks [AP]. Periods on statements. Warmth comes from specificity ("made for late nights"), never from enthusiasm punctuation.

---

## 4. PREMIUM DETAILS (the 11 touches)

1. The text-field caret adopts the chosen accent in the same frame as the swatch click — and the CodeMirror caret in the editor inherits it forever after.
2. The pen name is echoed in the very next scripted line and pre-filled as the project's author metadata.
3. Hovering a genre chip live-previews the entire theme before commit; moving off reverts (react-before-confirm [PO]).
4. The progress bar arrives with segment 1 already filled (endowed progress [PO]) and recolors with the accent pick.
5. Every exit animation is measurably faster than its entrance (240/160ms) — the app gets out of your way quicker than it arrives [AP].
6. A non-breaking space glues the last two words of every scripted line so no headline ever orphans [AP].
7. The setup interstitial names the user's real choices ("Ember theme · your color on the spine") and each line checks off only when its real operation completes [PO].
8. Focus rings, selection highlights, and the progress bar all recolor atomically via `applyPersonalization()` — zero stragglers, because one stale-colored control breaks the whole illusion (Lingrow's two-generations-of-code weakness [LG]).
9. The Tauri window itself participates: titlebar/window-chrome tint follows the chosen theme so the OS frame never betrays the fiction.
10. Ghost text in the empty first editor ("Chapter One begins wherever you do.") vanishes on first keystroke — an instructional empty state, never an actually-empty one [PO].
11. The one-time first-words moment: word counter fades in and ticks to 1 with a single 150ms accent pulse — celebration anchored to the *user's* achievement, rare by construction [PO].

(Deliberately excluded: sound. Arc's audio takeover works for a consumer browser; for a writing tool that promises quiet, silence *is* the premium register — Linear's near-invisible onboarding is the right counterpoint for a creator tool [PO].)

---

## 5. CHEAP-FEELING TRAPS (explicit bans)

- **Fake labor:** spinners doing no work, progress bars that jump, rotating "analyzing…" strings that yield identical output for everyone [PO]. Every interstitial line maps to a real operation or doesn't exist.
- **Questions that change nothing** — retroactively poisons the whole flow [PO]. Every intro question visibly mutates the UI or the project; anything else is deferred to just-in-time.
- **No skip / forced linear flow** — Lingrow's most-complained, most-patched mistake, including the hidden-button-at-large-text-sizes stuck state [LO]. Ship "Set up later" from Screen 1, and QA the intro at 125–200% display scaling.
- **Confetti or celebration on setup completion** — "you finished our wizard" is not a win; overuse trains blindness [PO].
- **Bounce/overshoot on functional surfaces** (modals, nav, panes) [AP].
- **Chat-bubble cosplay of an AI** that can't actually respond — the Lingrow "it didn't care" failure [LO] plus a violation of the honesty rule.
- **"We're excited!!" / "Oops!" copy**, ALL-CAPS headlines, exclamation marks [AP].
- **More than one accent color per screen**, colored headline text [AP].
- **Any UI animation over ~500ms** in the workspace; typewriter effects with random per-character jitter (mechanical, jarring — constant pace only [PO]).
- **A dead-end "You're all set!" screen** dumping into an empty app [PO].
- **Token/hardcode mixing** — Lingrow's own audit-visible weakness [LG]: every intro style goes through the existing custom-property system, no ad-hoc hexes.
- **Asking demographic/marketing questions** (where'd you hear about us) inside the premium moment [PO].

---

## 6. ADVANCED-ON-DEMAND

Apple's law, mapped to Novella: **the default surface shows one claim + one visual; density is exiled behind explicit affordances, never inline** [AP].

- **Always visible (the content plane):** the editor, a thin top bar (project name + word count + one pane-toggle cluster), and nothing else. Quiet first run is already this principle — keep it as the permanent default, not just the first session.
- **One level down (toggles):** the two side panes. They open via toolbar toggles and Cmd+\-style shortcuts, animate per §2, and **remember their state per project** — a user who opens them has opted into density; a new project starts quiet again.
- **The command palette is where "advanced" lives.** Every capability is reachable from Cmd+K before it earns a visible button. Teach it once, just-in-time: the first time the user pauses ≥30s in their first session, a single quiet toast — "Everything's in the palette. Cmd+K." — Linear's one interactive teaching moment [PO]. Never repeat it.
- **Settings = the Tech Specs page** [AP]: a modal with progressive sections (Appearance, Editor, AI, Data). Toggle labels describe only the ON state [AP]. The full theme/accent editor lives here — the intro asked the 2 questions that change the immediate experience; everything else is progressive profiling [PO].
- **AI is invisible until real.** No AI buttons, panels, or grayed-out teasers in the default chrome when no model is configured. The first time the user invokes an AI action from the palette without a model, *that* is the just-in-time moment to re-run the honest Ollama check and offer setup — permission-priming at the moment of need, the Duolingo notification pattern [PO].
- **Skipped intro questions resurface contextually:** skipped theme pick → a one-time hint the first time they open Appearance settings; skipped project preset → the new-project dialog defaults to the 4 preset cards. Skipping always lands on working defaults, never a degraded app [PO].
- **Export, statistics, and manuscript tools** stay out of the chrome entirely — palette + a single "…" overflow in the top bar, Apple's "+"-modal pattern for density [AP].

The through-line: the intro spends its 75 seconds proving that Novella listens (every answer paints the screen), and the workspace spends forever after proving that Novella stays out of the way. Both halves are the same promise.