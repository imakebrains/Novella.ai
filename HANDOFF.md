# Novella — session handoff (rewritten 2026-08-19)

Paste-in context for a fresh Claude session. Everything decided, shipped and
pending, compressed. Deeper record lives in the repo: ROADMAP.md (backlog +
dated log), RESEARCH.md (34 competitor rounds), AUTOPILOT.md (cloud routine),
docs/DESIGN-SYSTEM.md (the design source of truth), docs/DESIGN-INTRO.md and
docs/DESIGN-INTRO-CINEMA.md (intro + motion specs), PLAN-sync.md, SECURITY.md.

## What this is

**Novella** — a local-first writing app meant to beat NovelCrafter, Notion,
Dabble, Scrivener and Sudowrite at the whole job: writing + worldbuilding +
tasks + tracking, offline, no API key, no per-word cost. Tauri v2 + React 19 +
TS + Vite 6 + CodeMirror 6. A book is a folder of Markdown with YAML
frontmatter; `src/core/vault.ts` is the protected Phase-1 engine (**never
rewrite it**). Storage adapters (Tauri / IndexedDB / memory) sit behind one
interface in `src/storage/`.

- Repo: https://github.com/imakebrains/Novella.ai — public, **Apache-2.0**
  (code free to fork; the *name* Novella is reserved). Owner: imakebrains /
  drewpmedia@gmail.com ("Drew").
- Local clone: `C:\Users\drewp\Novella.ai` (NOT the OneDrive cwd).
- **v0.2.0 is the last tag**; main is far ahead (~30 commits). Owner said
  version numbers are not a priority — do not tag without being asked.
- A Windows zip built from main lives at
  `C:\Users\drewp\Downloads\Novella-win64-2026-08-18.zip` (portable exe +
  NSIS installer + MSI + README).

## THE TWO FACTS THAT COST FIVE ROUNDS — read before touching motion or UI

1. **The owner's Windows has OS animation effects OFF**
   (SPI_GETCLIENTAREAANIMATION = false). Their webview therefore reports
   `prefers-reduced-motion: reduce`. For five rounds the app's kill switch
   silently stripped every animation shipped, and the owner reviewed a
   motionless app while being told it was cinematic. **Motion now defaults to
   "full"** (`DEFAULTS.motion` in personalize.ts); Settings → Appearance →
   Motion offers Follow system / Full / Minimal, every
   `@media (prefers-reduced-motion)` block is guarded
   `:root:not(.motion-full)`, and a dismissible banner discloses the override
   when the OS asked for stillness.
2. **The Claude browser pane and the Tauri WebView2 app keep SEPARATE
   localStorage even on the same origin (localhost:5173).** Setting a
   preference in a pane probe proves NOTHING about the real app. To read the
   app's true state, parse its leveldb log under LOCALAPPDATA:
   `ai.novella.app` / `EBWebView` / `Default` / `Local Storage` / `leveldb` /
   `000003.log` (decode latin-1, regex the key).

## The gate

`npm run verify` now runs **all ten suites** plus tsc and a production build —
it had drifted to only two suites while ~870 assertions went unwatched by CI.
Current: **1,299 assertions green**.

test.ts (engine tour) · test-units.ts 324 · test-themes.ts 151 · test-tabs.ts 78 ·
test-stack.ts 139 · test-trash.ts 106 · test-timers.ts 136 · test-calendar.ts 171 ·
test-projectpreview.ts 86 · test-tour.ts 108

Rules: exit codes read bare, never through a pipe. Pure logic gets unit tests.
UI verified live where a browser exists; never claim live verification without
it. **Never fake AI, accounts or progress**; anything needing owner money/keys/
settings is flagged NEEDS OWNER, never simulated.

## Probe traps (all learned the hard way)

- Hidden pane = no compositing: screenshots time out, `elementFromPoint` dies at
  0×0, and **transitions freeze at their start value** — suppress transitions
  before reading computed styles.
- Stacking bugs are invisible to computed-style checks. Verify z-order by
  elimination (hide layers, re-measure) or real pixels.
- Importing `/node_modules/.vite/deps/X.js` in a probe creates a SECOND module
  instance; state-keyed APIs silently fail. Drive real DOM events instead.
- Long `await` chains in `javascript_tool` get collected — assign results to
  `window.__x` and read them in a second call.
- Data URLs cannot go in `srcset` (commas). Pick sources in JS.
- Bash heredocs eat one backslash level — use Write/Edit for files with escapes.
- Port 5173 is hard-wired (tauri devUrl + strictPort + CSP). A `novella-qa`
  launch entry exists but the pane tool has been seen starting the wrong one —
  check which port actually bound. Closing the Tauri window kills its vite;
  relaunch detached with `Start-Process cmd -ArgumentList "/c","npm run tauri dev"`.
- WebView2 caches dev-URL fetch failures forever. Intro/backdrop art is
  imported `?inline` (data URLs in the bundle) so it cannot blank again.
- **Never `git add -A` while subagents are writing** — it commits their
  half-finished files.

## Shipped this session (2026-08-18 → 19)

Intro/cinema: boot cat + gerunds, exit+enter scene transitions with a held
beat, vignette + drifting motes + Ken Burns, title-card tracking, spotlight
hover, glow bloom, stop-motion set pieces, Back button, Skip, backdrop
carousel (preview then Continue), centered cat. **The text-overlay bug was a
side effect inside a React state updater** — StrictMode double-invokes those,
so every scene spawned two ghosts.

Features: reword-in-place (five voices, streams, Ctrl+Z undoes) · five bundled
backdrops + upload, glass surfaces · randomized starter worlds (8.3M casts,
seeded/deterministic) · project preview slideshow (reads ≤4 files) · custom
themes (named, described, 28 derived tokens, contrast floor) + saved accent
swatches · arrangeable tool tabs (drag, +, keyboard) · **stacked tool panels**
(up to 3, draggable divider) · calendar rebuilt (month/year picker, colorized
days, expandable day, many entries, **ICS subscription — real, credential-free**)
· timer + alarm tab · **trash with 7/30-day retention**, restore, armed empty ·
board cover-art toggle + Codex/Tools on the board · task edit-in-place, bottom
+, submit arrow, right-click archive/delete · **the guided tour** (six looping
CSS diagram clips, rest state = finished state).

## Owner voice

Drew iterates by screenshot and pushes until it FEELS right; he forgives
everything except pretending. He wants premium (Apple/Lingrow), playful where
it earns it (the cat), and full customizability. Say plainly when something
needs him.

## IN FLIGHT at handoff time (2026-08-19, late) — five agents

Launched in parallel, each owning distinct files, all reporting CSS to the
main session rather than editing app.css (that separation is what keeps them
from colliding — keep it):

1. **Side-docking** (InspectorPane.tsx, inspectorTabs.ts) — the drop band that
   splits a tool into a panel below gains LEFT/RIGHT bands too, so the Tools
   pane can split into columns as well as rows. Must stay ONE pane internally
   split, so the titlebar Tools toggle still hides/shows everything together.
   Requires a richer layout model than `stack[]` + `sizes[]`, with migration
   for existing saved layouts.
2. **Hints library** (TourOverlay.tsx, tourSteps.ts) — a scrollable, grouped
   left sidebar for jumping to any hint, plus 12-16 total clips covering
   features that have none yet. Shortcuts must be read from palette.ts /
   EditorPane keymap, never invented.
3. **Connections + per-role routing** (roles.ts new, generate.ts,
   SettingsModal.tsx) — easy per-provider connect flows, multiple simultaneous
   connections, and roles (Drafting / Ideas / Research / Critique) each
   assigned to a provider with a fallback chain. **Honesty constraint given:
   Anthropic and OpenAI have no Google/OAuth sign-in for API access — the
   mechanism is an API key. No fake OAuth button was permitted.**
4. **Intro rebuilt in the tour's language** (WelcomeIntro.tsx, introScript.ts)
   — the owner loves the tour and asked for the intro to match it "to a t":
   little looping example windows beside the copy. Everything load-bearing
   must survive (live recolour, theme preview, backdrop carousel, boot cat,
   Skip/Back, ghost-clone transitions created OUTSIDE the state updater).
5. **Custom calendar labels** (calendarEntries.ts, CalendarTab.tsx) — create,
   rename, recolour, archive/delete, with the rule that an entry can never end
   up pointing at a broken label, plus migration for existing built-in ids.

If a report is lost, each agent's brief is recoverable from this list; re-brief
with the same file-ownership and no-CSS constraints.

## Pending / next

- **Owner has SEEN and liked:** the tour (called it beautiful — it is now the
  style template for the intro), stacked panels/dragging, the tidied calendar,
  the codex fold-all.
- **Not yet seen:** everything from the five in-flight agents above. Cursor keyframes in the
  tour clips were computed, not eyeballed — expect pixel nudges.
- Google account linking: **NEEDS OWNER** (OAuth credentials, a Google Cloud
  project). ICS subscription ships as the honest credential-free path. Google's
  ICS endpoint sends no CORS header, so URL subscribe may fail in the webview —
  a paste-the-.ics fallback exists; making URL subscribe reliable needs
  `@tauri-apps/plugin-http` (Cargo + capabilities).
- Task archive currently appends to `Archive/Tasks.md`; the seam
  (`stashArchivedTask` in TasksPanel.tsx) is the single place to repoint at
  `state/trash.ts`, which is note-granular and would need a line-shaped entry.
- Owner round 5 leftovers: interactive calendar Google sync, Board/Write split,
  open-book logo, document-bound chat panel, "Style me".
- Plan phases C (responsive/mobile + PWA), D (Obsidian-storage safety: atomic
  writes, mtime don't-clobber, conflict-copy detection), E (open-source
  hygiene: ci.yml, README rewrite, CONTRIBUTING).
- DESIGN-SYSTEM.md §3.10 consolidation sweeps still open.
- NEEDS OWNER (free): Pages source = GitHub Actions; private vulnerability
  reporting. NEEDS OWNER (money, optional): code-signing certs.
- Known open: phantom dirty flag on Tauri startup; Echoes detector too strict.
