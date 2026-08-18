# Novella — session handoff (rewritten 2026-08-18)

Paste-in context for a fresh Claude session. Everything decided, shipped, and
pending, compressed. The repo itself is the deep record: ROADMAP.md (backlog +
dated log of every run), RESEARCH.md (competitor-research rounds),
AUTOPILOT.md (how the cloud routine behaves), docs/DESIGN-INTRO.md (intro +
motion spec), docs/DESIGN-SYSTEM.md (the design-system source of truth from
the 8-agent research workflow), PLAN-sync.md (sync design awaiting owner
decisions), SECURITY.md (audit).

## What this is

**Novella** — a local-first writing app meant to beat NovelCrafter, Notion,
Dabble, Scrivener and Sudowrite at the whole job: writing + worldbuilding +
tasks + tracking in one place, offline, no API key, no per-word cost.
Tauri v2 + React 19 + TS + Vite 6 + CodeMirror 6. The book is a folder of
Markdown with YAML frontmatter; `src/core/vault.ts` is the protected Phase-1
engine (**never rewrite it**). Storage adapters: Tauri (real folders),
IndexedDB (web), memory (fallback) behind one interface in `src/storage/`.

- Repo: https://github.com/imakebrains/Novella.ai — public, **Apache-2.0**
  (LICENSE + NOTICE: code free for anything incl. plugins/forks; the *name*
  Novella is reserved). Owner: imakebrains / drewpmedia@gmail.com ("Drew").
- Local clone: `C:\Users\drewp\Novella.ai` (NOT the OneDrive cwd).
- **v0.2.0 released** (tag → release.yml → Win .exe/.msi + macOS .dmg,
  unsigned, SmartScreen notes in release notes). In-app updater reads these.
  Main is ~15 commits past the tag — v0.3.0 is ripe when the owner says go.
- Web build: `npm run build:web`, pages.yml ready.
  **NEEDS OWNER (free): Settings → Pages → Source = GitHub Actions.**

## THE machine fact (read this before touching motion)

**The owner's Windows has OS animation effects OFF**
(SPI_GETCLIENTAREAANIMATION = false, confirmed 2026-08-18). Their webview
reports `prefers-reduced-motion: reduce`, and the app's kill switch stripped
every animation — the owner reviewed three rounds of motion work without
seeing any of it ("janky and cheap" = the motionless fallback). Now there is
**Settings → Appearance → Motion: Follow system / Full / Minimal**
(`motion` in `novella.personalize`, root classes `motion-full` /
`motion-minimal`; every `@media (prefers-reduced-motion)` block is guarded
`:root:not(.motion-full)`). The owner should run **Full**. When verifying
motion in the Claude pane (which also forces reduce), set
`motion: "full"` first — it defeats both.

## The gate (every change)

`npx tsc --noEmit` clean · `npx tsx test-units.ts` green (285 checks) ·
`npm run verify` green · UI verified LIVE in the browser where one exists —
and never claim live verification without it. Pure logic gets unit tests.
Exit codes read bare, never through a pipe. Probe traps, hard-won:

- The pane shares the owner's profile. Stash/restore
  `novella.personalize` (NOT "personalization"), `novella.introSeen`,
  `novella.theme`, `novella.welcomed`. Clean up probe artifacts.
- Hidden pane = no compositing: screenshots time out, `elementFromPoint`
  dies at 0×0, and **transitions freeze at their start value** — suppress
  transitions (`el.style.transition = "none"`) before reading computed
  styles, or they report stale mid-flight values.
- Stacking bugs are invisible to computed-style checks — verify z-order
  by elimination (hide layers, re-measure scrollWidth) or real pixels.
- Vite dep imports from probes (`/node_modules/.vite/deps/X.js`) create a
  SECOND module instance — state-keyed APIs (CM `undo`) silently fail.
  Drive real DOM events instead.
- Data URLs cannot go in `srcset` (commas). Pick sources in JS.
- Bash-tool heredocs eat one backslash level — use Write/Edit for
  files containing escape sequences.
- Port 5173 is hard-wired (tauri devUrl + strictPort + CSP). The pane's
  preview server fights the owner's `tauri dev` for it — a `novella-qa`
  launch config (port 5199) exists but the pane tool has been seen
  starting the wrong entry; check which port actually bound.
- Closing the Tauri window kills its vite too — "the app broke" is
  usually "the server under it is gone." Relaunch detached:
  `Start-Process cmd -ArgumentList "/c","npm run tauri dev"`.
- WebView2 caches dev-URL fetch failures; renaming the file busts it.
  Intro/backdrop art is now `?inline` (data URLs in the bundle) and
  cannot blank again.

## Shipped since the last handoff (rounds 9–14, all on main)

- **The system pass** (docs/DESIGN-SYSTEM.md): layered theme-tinted
  shadows, focus rings everywhere, pill scrollbars, press states,
  designed tooltips (`data-tip`), spinner + stream-caret loading
  language, tabular numerals, empty-state primitive (glyph + line +
  real CTA) across eight panels, Settings Profile/Connections on the
  ap-section pattern, command palette finished, six real bugs fixed.
- **Reword in place** (Type.ai ask): select prose → chip → five voices +
  free-form → streamed rewrite → Replace at exact bounds → Ctrl+Z undoes.
  Verified end-to-end against local llama3.1. `src/ui/rewordCore.ts` pure.
- **Backdrops**: upload OR five bundled presets (stored as `preset:<id>`
  markers, ~13 bytes; `resolveBackdrop()` maps to inlined data URLs).
  z-index −1 under a transparent shell, theme scrim, glassed resizer.
- **The intro, five rounds of owner taste**: whole-line "bubble flow"
  entrances (ENTRANCE_MS 560), top-anchored stage (zero layout jumps —
  measured), warm em-dash-free copy (both unit-tested invariants),
  ‹ Back, "Skip introduction", backdrop carousel (preview on pick,
  Continue confirms), stop-motion set-piece grammar (steps(4) pop-set,
  tilted cards that straighten on hover, film-counter progress dots),
  the hand-drawn cat as corner companion + finale mascot (FINALE_MS
  5500 over real steps + absurd gerunds), zoom-blur exit. Returning
  writers skip the intro on launch entirely.
- **Tasks panel**: + button appends real `- [ ]` lines to the active
  note (or a "Tasks" note). Tools-menu chips, wheel-cycling Tools button.
- **Shell hygiene**: html/body overflow hidden (phantom tooltip boxes
  were dragging a document scrollbar), titlebar fits.

## Current owner state / voice

Drew iterates by screenshot, wants "premium like Apple/Lingrow," pushes
until it FEELS right, and forgives everything except pretending. Honesty
rules stand: never fake AI/accounts/progress; NEEDS OWNER for anything
requiring money/keys/settings; never claim live verification without it.
The last sessions were entirely intro-feel iteration — expect more taste
rounds; motion tuning lives in introScript.ts constants + app.css 9.2x
blocks.

## Pending

- Owner has NOT yet confirmed the motion-full experience looks right
  (they'd literally never seen the animations before this fix).
- OWNER ROUND 5 list (type.ai): interactive calendar (CLOUD-OK core),
  Board/Write split (WITH-OWNER), open-book logo (WITH-OWNER), document
  Chat panel, "Style me". Reword-inline is DONE.
- Plan phases: C responsive/mobile + PWA, D Obsidian-storage safety
  (atomic writes, mtime don't-clobber, conflict-copy detection),
  E open-source hygiene (ci.yml, README rewrite, CONTRIBUTING,
  tsconfig include test-units.ts, ubuntu-22.04 runner).
- DESIGN-SYSTEM.md §3.10 consolidation sweeps (menus → .menu-pop, 11
  inputs → .field-input, segmented controls) still open.
- NEEDS OWNER: Pages source setting (free), signing certs (money,
  optional), PLAN-sync decisions, private vulnerability reporting (free).
- Known open: phantom dirty flag on Tauri startup (task #13), Echoes
  detector too strict.
