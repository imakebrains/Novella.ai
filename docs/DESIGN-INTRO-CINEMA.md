# DESIGN-INTRO-CINEMA — the cinematic pass on the welcome

Companion to `docs/DESIGN-INTRO.md`. Scope: `src/ui/WelcomeIntro.tsx`,
`src/ui/introScript.ts`, `src/ui/app.css` §9.2x only. Nothing here touches the
workspace.

**The brief.** Overly cinematic, the way a AAA character creator is cinematic —
Wukong realism, not web-app pep. The register is a title screen: near-dark
ground, one warm accent, slow atmosphere that never stops, screens that
dissolve rather than swap, and one deliberate held breath before anything asks
for input. Novella keeps its own accent — the hand-drawn cat and the
stop-motion `pop-set` snap on touchable pieces are the house signature, the
human hand inside the cinema. The split is the whole design: **words and
scenes move like a camera; things you can touch are set down like props.**

**What already exists and stays.** The ghost-clone exit/enter dolly, the
whole-line type arrival, the sheen, `pop-set`, the glow/motes/vignette layers,
the boot, the impatience ladder, `FINALE_MS`/`BOOT_MS`. This pass tunes
parameters, fixes one perf bug (motes animate `background-position` — repaints
every frame), and adds the missing halves: real fade-OUTs, a held beat between
scenes, a floor of light under the cat, and Ken Burns on the backdrop.

---

## 1. THE GRAMMAR — five devices, exact parameters

The cross-game constants we adopt wholesale: **arrivals decelerate, exits
accelerate and run ~40% shorter, nothing bounces except `pop-set` (which is
frames, not springs), ceremony is slow on purpose, and only one thing animates
for attention at a time.**

Shared easing tokens (add to §9.30 as CSS vars so every rule reads the same):

```css
--ease-cinema-in:  cubic-bezier(0.16, 1, 0.3, 1);   /* arrivals: fast start, long settle */
--ease-cinema-out: cubic-bezier(0.55, 0, 0.85, 0.4); /* exits: gathers speed, gone */
--ease-drift:      cubic-bezier(0.37, 0, 0.63, 1);   /* ambient loops: sine-ish */
```

### Device 1 — Scene dissolve-dolly (exit + held beat + enter)

Every screen change is three phases, not two. The held beat is the cinema —
a breath of near-empty stage between thoughts. It lives inside the enter
delay, so it costs no state and taps still land instantly.

- **Exit (the ghost):** 380ms `var(--ease-cinema-out)` `both` →
  `opacity: 0; transform: translateX(∓56px) scale(0.985); filter: blur(6px)`.
  (Current 460ms/72px, trimmed: exits must feel *taken*, not traveled.)
- **The beat:** the incoming stage waits 160ms before its animation starts
  (`animation-delay: 160ms` + `both` fill so frame 0 shows nothing). For
  ~200ms mid-handoff only atmosphere is on stage. Never longer — the
  impatience ladder is watching.
- **Enter:** 640ms `var(--ease-cinema-in)` `both`, delay 160ms →
  from `opacity: 0; transform: translateX(±64px) scale(1.01); filter: blur(8px)`
  to identity. The added `scale(1.01)` start is the rack-focus feel: the scene
  arrives from slightly too close, like a camera settling.
- Direction stays semantic: forward enters from the right, Back from the left
  (`enterFrom` ref already does this).
- The ghost keeps its `animationend` + 800ms fallback removal. Add
  `.stage-exit-left *, .stage-exit-right * { animation-play-state: paused; }`
  so line/answer animations freeze inside the dying clone instead of replaying.

### Device 2 — Atmosphere stack (persistent, composite-only)

Four layers under everything, alive for the entire intro, all
transform/opacity loops. z-order bottom-up: backdrop → glow → shaft → motes →
vignette.

1. **Vignette** (static, painted once): deepen from 0.28 to
   `rgb(0 0 0 / 0.38)` at 100%, same ellipse
   (`120% 90% at 50% 42%, transparent 55%`). Add a second stop —
   `rgb(0 0 0 / 0.12) 78%` — so the falloff reads as a lens, not a border.
2. **Glow breathing** (exists): keep 9s alternate, widen the range slightly —
   `scale(1)→scale(1.14)`, `opacity 0.8→1`, easing `var(--ease-drift)`.
3. **Light shaft** (new, one div): `width: 12vw; height: 150%;
   top: -20%; left: 30%; transform: skewX(-16deg);` background
   `linear-gradient(to bottom, transparent 0%, color-mix(in srgb, var(--accent) 9%, transparent) 14%, transparent 76%)`.
   Loop: `opacity 0.35 ↔ 0.8`, 13s `var(--ease-drift)` infinite alternate.
   Transform set once, never animated. Softness baked into the gradient —
   **no blur filter on it**.
4. **Motes — rebuilt (perf fix).** The current `motes-rise` animates
   `background-position`: per-frame paint on a full-screen layer. Replace with
   the tile-translate pattern: two stacked layers, each oversized
   (`inset: -900px -80px -80px -80px`), `background-size: 900px 900px` (near)
   and `560px 560px` (far, `opacity: 0.5`), same radial-gradient dots as now.
   Animate only `transform: translate3d(-60px, -900px, 0)` (near, 70s linear
   infinite) / `translate3d(40px, -560px, 0)` (far, 110s) — exactly one tile,
   so the loop is seamless. `will-change: transform; contain: strict;` on the
   wrapper. Drop the `filter: blur(0.5px)` (bake softness into dot alpha).
5. **Ken Burns on the chosen backdrop** (new): on `.intro-bg-img`, which is
   already `scale(1.06)` and pre-blurred —
   `animation: intro-kenburns 36s var(--ease-drift) infinite alternate;`
   `from { transform: scale(1.06) } to { transform: scale(1.13) translate3d(-1.5%, 1%, 0) }`.
   Range stays under 1.15 to dodge Chromium's re-raster pop. The blur(18px)
   stays a static filter — it rasterizes once because only transform animates.

### Device 3 — Type arrival (and departure)

- **Standard line** (exists, keep): rise 14px + deblur 7px, 560ms
  `cubic-bezier(0.22, 0.9, 0.3, 1)`, whole-line, mounts once, never re-animates.
  This is already the "masked rise" workhorse and it's right.
- **Headline tracking settle** — the cold open ONLY. The first words of the
  app get the Elden Ring title treatment:
  `from { letter-spacing: 0.22em; opacity: 0; filter: blur(9px); transform: translateY(10px) }`
  `to { letter-spacing: -0.01em; opacity: 1; filter: blur(0); transform: none }`
  1200ms `var(--ease-cinema-in)`. Letter-spacing relayouts per frame — legal
  because it is one line, one-shot, once per app-lifetime. Scoped as
  `.intro-stage[data-screen="cold-open"] .intro-line:first-child`; pass
  `data-screen={screen.id}` on the stage (one-line TSX change, also lets the
  scene map below target screens without new classes).
- **Sheen** (exists, keep): first done line only, 2.4s, once. It is the
  "light passes over set type" beat and pairs with the tracking settle.
- **Departure**: lines never fade individually — the stage exits whole
  (Device 1). One camera, one subject.

### Device 4 — Choice presentation (props + spotlight)

- **Arrival** stays `pop-set` steps(4) with the existing staggers — this is
  the house voice and the cat's aesthetic. One tune: cap total stagger at
  ~600ms after answers mount (current swatch ladder ends at 570ms — fine).
- **Spotlight, not boxes** (new): while any sibling is hovered/focused, the
  others recede —
  ```css
  .intro-answers:has(:hover, :focus-visible) > :not(:hover, :focus-visible) {
    opacity: 0.55;
    transition: opacity 250ms var(--ease-color);
  }
  ```
  The hovered piece keeps its existing straighten/lift. Darkening the rest IS
  the light. (`:has` is fine in WebView2's Chromium.)
- **Glow bloom on commit** (new, the recolor ceremony): when a swatch or theme
  is chosen, the room answers — add class `blooming` to `.intro-glow` for one
  animation: `opacity 1 → 1 at scale(1.3) → settle`, 900ms
  `var(--ease-cinema-in)`, one-shot, removed on `animationend`. The same-frame
  accent recolor already happens; this makes the light acknowledge it.
- **Press** stays the 40ms stamp (`scale(0.94)`).

### Device 5 — The loading beat (cat ceremony)

Boot and finale share one grammar so the cat's two big scenes rhyme:

- **The floor of light** (new): under the cat, a pedestal pool —
  `radial-gradient(ellipse 46% 18% at 50% 78%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%)`
  on the boot/steps container's `::before`. Static paint; it breathes by
  inheriting the glow layer's rhythm, not its own loop.
- **Gerund crossfade — fade in AND out** (fix): the gerund currently remounts
  per tick with only an entrance. Give it a full life inside one 800ms cycle:
  ```css
  @keyframes gerund-cycle {
    0%   { opacity: 0; transform: translateY(8px); }
    14%  { opacity: 1; transform: translateY(0); }
    82%  { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-6px); }
  }
  .intro-gerund { animation: gerund-cycle 800ms var(--ease-drift) both; }
  ```
  Keyed remount per tick (already done) restarts it. Rises in, holds, lifts
  away — a projector caption, not a ticker.
- **Cat arrival**: `pop-set` 480ms steps(4) (exists). The cat never moves
  smoothly; the world around it does. That contrast is the whole joke.
- **Steps** (finale): each `.intro-step` mounts all at once (exists) but the
  ✓ tick gets a 240ms steps(3) scale-in matching `seg-tick`.

---

## 2. THE BOOT — the cat opens the show

Timeline (unchanged constants: `BOOT_MS = 2400`, leave = 520ms):

| t (ms) | beat |
|---|---|
| 0 | `.intro-boot` fades in over `var(--bg-app)` 400ms (exists). Vignette + motes are ALREADY running beneath — the room precedes the actor. |
| 0–480 | Cat pops in, steps(4), onto the floor-of-light pool (Device 5). |
| 300 | First gerund rises (`gerund-cycle`), 800ms per word: ~3 words total ("Promulgating…", "Onionizing…", "Percolating…"). |
| 2400 | `boot: "leaving"` — 500ms zoom-and-blur out (`scale(1.04)`, blur 6px, exists). |
| 2560 | Cold open's stage enter begins (Device 1 enter, delay covers the overlap), headline tracking-settle plays (Device 3). Net effect: cat dissolves, words condense out of the same darkness — a match cut. |

Mechanics already correct and load-bearing: tap during boot jumps straight to
`"leaving"`; stage is mounted but `visibility: hidden` during boot so layout is
paid early; reduced motion swaps the gif for `catStill`. One addition:
while `boot !== "off"`, suppress the cold open's own entrance delay is NOT
needed — the stage stays hidden until boot is off, and its `enter-right`
animation runs on mount regardless; instead key the stage's first reveal by
toggling visibility only (current behavior), and accept that on a fast tap the
headline may already be mid-settle. That is the impatience ladder working.

The boot is the only screen with no input, no skip button ambiguity, and a
hard 2.4s ceiling. It is a curtain, not a loading screen — nothing real loads.

---

## 3. SCENE MAP

Persistent across every scene (never exits, never re-enters): glow, shaft,
motes, vignette, backdrop (once chosen), progress segments, Skip, the corner
cat (from screen 2 on). Only the stage travels.

| Scene | Enters | Exits with it | Special beats |
|---|---|---|---|
| **boot** | cat (pop), gerunds (cycle) | whole overlay zoom-blurs out at 2400ms | floor-of-light; motes already alive underneath |
| **cold-open** | headline via tracking settle (only use in app); line 2 standard rise; Begin pops at +250ms after lines land | stage ghost dollies left | sheen crosses headline once |
| **pen-name** | one line + field row; field autofocuses on `ready` (exists) | ghost left | field focus ring is the only accent on screen — no bloom here |
| **color** | greeting line uses `{{name}}` — the first personalization payoff; 8 swatches pop in 80–570ms ladder | ghost left | on pick: same-frame recolor (exists) + glow `blooming` pulse (Device 4); swatch overshoot stays the app's one spring |
| **theme** | ack line + 4 theme chips, tilted, pop ladder | ghost left | hover previews live-repaint the whole room (exists) — this screen IS the demo; no extra motion on top |
| **backdrop** | carousel cards pop with pinned-photo tilt | ghost left | picked scene fades in behind via `.intro-bg` 400ms + Ken Burns starts (Device 2.5); "Keep it bare" fades it out through the same 400ms |
| **ai** | single line + Check button | ghost left | result line mounts as a standard `.intro-line done` — no drama, honesty is the register |
| **project** | "The stage is set, {{name}}." + preset cards pop | stage does NOT dolly out — it dissolves in place (opacity 380ms) as the steps view replaces it | picking a preset starts the finale |
| **creation finale** | cat center (96px, pop), gerunds cycle, three real steps tick ✓ | entire `.intro` closes: 800ms zoom(1.05)-and-blur(8px) reveal of the already-painted workspace (exists, 820ms JS timeout matches) | `FINALE_MS = 5500` floor; the balance after real work is curtain time |
| **returning** | ack + "Open my library" | same close as finale, no steps | returning writers get cinema without ceremony — through in two taps |

Back navigation mirrors everything: enter-from-left, exit-right, same timings.

---

## 4. CONSTRAINTS (non-negotiable)

1. **Composite-only loops.** Anything `infinite` may animate ONLY `transform`
   and `opacity`: glow, shaft, motes, Ken Burns, cat-bob. The motes rebuild in
   Device 2.4 is required, not optional — `background-position` loops repaint
   a fullscreen layer every frame. Verify with DevTools → Rendering → Paint
   Flashing: nothing may flash while the intro idles.
2. **One-shots may spend more.** Blur ≤ 8px and the single letter-spacing
   settle are allowed because they run once, ≤ 1.2s, on small areas. No blur
   above 18px anywhere (backdrop's static 18px is painted once).
3. **`will-change: transform`** only on the looping layers (motes, glow,
   backdrop img). Never on lines or answers — the promotion churn costs more
   than it saves on one-shots.
4. **The impatience ladder survives untouched.** Tap 1 completes the line,
   tap 2 completes the screen, Skip exits from anywhere, tap kills the boot.
   Every new animation is `both`/`forwards` decoration over state that has
   already changed — nothing (including the 160ms held beat, the bloom, the
   gerund cycle) ever gates input or delays a state transition. The held beat
   rides inside `animation-delay`, so a tap mid-beat simply advances state and
   the next stage's animation starts from wherever the clock is.
5. **Text is instantly readable.** Blur touches text only during its own
   ≤ 1.2s entrance. No loops on text, no grain overlay, no opacity below 1 on
   settled lines. The sheen never drops contrast below the gradient's darkest
   stop (`--fg-primary` mixed 60% accent).
6. **Reduced motion.** Extend the existing block — every new animation joins
   the `@media (prefers-reduced-motion: reduce)` + `:root:not(.motion-full)`
   guard: shaft, Ken Burns, gerund-cycle (swap to plain visibility), bloom,
   held-beat delay → 0ms, tracking settle → none. `:root.motion-minimal` gets
   the same kill list unconditionally (motes already handled). The cat swaps
   to `catStill` (exists). Reduced motion must still be *composed*: static
   vignette, static glow, instant scenes — a title page, not a broken film.
7. **No canvas, no rAF, no JS-per-frame, no new dependencies.** The ghost
   clone + CSS keyframes remain the entire transition engine. The only JS
   additions are class toggles (`blooming`, `data-screen`).
8. **Budget.** ≤ 6 composited fullscreen layers during idle (backdrop, glow,
   shaft, motes ×2, vignette-static doesn't count — no animation). The ghost
   doubles layers for ≤ 800ms; freezing its children (Device 1) keeps the
   overlap from compositing two mote systems.

---

## 5. CUT LIST — researched, rejected

| Idea (source) | Why cut |
|---|---|
| Ink-wash `feTurbulence`/`feDisplacementMap` dissolves (Wukong) | Per-frame SVG filter on fullscreen = paint storm in WebView2; the wet-blur dissolve we keep (blur-through on exit/enter) buys 80% of it free |
| Film grain overlay | Noise over serif body text is a readability tax; grain sells realism on photos, not on type-first screens |
| Sound design (ticks, chimes, swells) | No audio system in the app; new asset pipeline + mixing pass = its own round, not this session |
| Per-character spring/rotate text (Arc) | Fights the whole-line "keynote, not terminal" doctrine settled in round 13; also jitter-prone on serif italics |
| Letter-tracking settle on EVERY headline | Layout cost per frame ×8 screens and, worse, it would demote the cold open — ceremony spent everywhere is ceremony spent nowhere |
| Fade-through-black with 400ms+ holds on every transition (Elden Ring) | An 8-screen flow with 700ms+ dead air per step reads as lag, not gravitas; we keep a 160ms beat instead |
| Announcement band ("LOST GRACE DISCOVERED") for the finale | Parody line crossed for a writing app; the cat holding the stage IS our announcement |
| Glitch cut / RGB split (Cyberpunk) | Wrong genre entirely |
| Camera dolly-zoom into the cat / anatomy reframing (BG3) | Scaling a gif up loses the hand-drawn line quality; the cat's fixed scale is part of its charm |
| 3+ parallax fog layers | Two mote layers + shaft + glow already fill the depth budget (§4.8) |
| Membership card / signed contract artifact (Arc, Fabulous) | Great idea, not motion — belongs in a future identity-beat round, and the pen-name-on-the-cover promise already seeds it |
| Constellation/progress tree | No progression system to hang it on |
| `backdrop-filter` live blur panels (GoW) | Continuous backdrop-filter over an animating backdrop re-filters every frame; our pre-blurred `.intro-bg-img` is the cheap twin |
| Stepped-jitter grain at 8–12fps | See grain; also competes with `pop-set` for the "handmade" channel |

---

## Build order (one session)

1. Easing tokens + vignette deepen + shaft (CSS only) — 20 min
2. Motes rebuild to tile-translate (CSS only, delete `motes-rise`) — 20 min
3. Scene dissolve-dolly retune + ghost child-freeze + held beat — 20 min
4. Ken Burns + backdrop fade parity — 10 min
5. `data-screen` attr + cold-open tracking settle — 15 min
6. Gerund cycle + floor-of-light (boot & finale) — 20 min
7. Spotlight `:has` rule + glow bloom on commit — 20 min
8. Reduced-motion / motion-minimal sweep + paint-flashing verify — 20 min
