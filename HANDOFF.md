# Novella — session handoff (rewritten 2026-08-19, end of session)

Paste-in context for a fresh Claude session. Deeper record in the repo:
ROADMAP.md (dated log), RESEARCH.md (34 competitor rounds), AUTOPILOT.md (cloud
routine), docs/DESIGN-SYSTEM.md (design source of truth), docs/DESIGN-INTRO.md
and docs/DESIGN-INTRO-CINEMA.md (intro + motion specs), PLAN-sync.md, SECURITY.md.

## What this is

**Novella** — a local-first writing app meant to beat NovelCrafter, Notion,
Dabble, Scrivener and Sudowrite at the whole job: writing + worldbuilding +
tasks + tracking, offline, no API key, no per-word cost. Tauri v2 + React 19 +
TS + Vite 6 + CodeMirror 6. A book is a folder of Markdown with YAML
frontmatter; `src/core/vault.ts` is the protected Phase-1 engine (**never
rewrite it**). Storage adapters (Tauri / IndexedDB / memory) behind one
interface in `src/storage/`.

- Repo: https://github.com/imakebrains/Novella.ai — public, **Apache-2.0**.
  Owner: imakebrains / drewpmedia@gmail.com ("Drew").
- Local clone: `C:\Users\drewp\Novella.ai` (NOT the OneDrive cwd).
- **v0.2.0 is the last tag**; main is ~40 commits ahead. Owner said version
  numbers are not a priority — do not tag without being asked.
- Windows zip built from main: `C:\Users\drewp\Downloads\Novella-win64-2026-08-18.zip`
  — predates everything below, so rebuild before handing it to anyone.

## THE TWO FACTS THAT COST FIVE ROUNDS — read before touching motion or UI

1. **The owner's Windows has OS animation effects OFF**
   (SPI_GETCLIENTAREAANIMATION = false), so their webview reports
   `prefers-reduced-motion: reduce`. For five rounds the kill switch silently
   stripped every animation shipped while the owner was told it was cinematic.
   **Motion now defaults to "full"** (`DEFAULTS.motion` in personalize.ts);
   Settings → Appearance → Motion offers Follow system / Full / Minimal, every
   `@media (prefers-reduced-motion)` block is guarded `:root:not(.motion-full)`,
   and a dismissible banner discloses the override.
2. **The Claude browser pane and the Tauri WebView2 app keep SEPARATE
   localStorage even on the same origin (localhost:5173).** A preference set in
   a pane probe proves NOTHING about the real app. To read the app's true
   state, parse its leveldb log under LOCALAPPDATA: `ai.novella.app` /
   `EBWebView` / `Default` / `Local Storage` / `leveldb` / `000003.log`
   (latin-1 decode, regex the key).

## The gate

`npm run verify` = tsc + **twelve suites** + production build. It had drifted to
two suites while ~870 assertions went unwatched by CI; keep new suites added to
it. Current: roughly **2,100 assertions green**.

test.ts · test-units 337 · test-themes 151 · test-tabs 78 · test-stack 238 ·
test-trash 106 · test-timers 136 · test-calendar 302 · test-projectpreview 86 ·
test-tour 275 · test-roles 219 · test-tasks 88 · test-paste 75 · test-format 146

Rules: exit codes read bare, never through a pipe. Pure logic gets unit tests.
UI verified live where a browser exists; never claim live verification without
it. **Never fake AI, accounts or progress**; anything needing owner
money/keys/settings is flagged NEEDS OWNER, never simulated.

## Working with subagents (this session ran about fifteen)

The pattern that worked: each agent owns DISTINCT files, edits **no .css at
all**, and reports the CSS it needs; the main session writes every style. That
separation is what kept a dozen parallel agents from colliding.

- **Never `git add -A` while agents are writing** — it commits half-finished work.
- **Never `git stash` while agents are writing.** A stash-then-pull chain of
  mine stashed several agents' in-flight files and the pull failed, so the pop
  never ran; two agents lost work and redid it. `stash@{0}` still holds that
  snapshot — stale and superseded, safe to drop when convenient.
- Agents cannot see each other, so a whole-project `tsc` shows THEIR errors
  mid-flight. Gate per-file, then gate the whole tree once they finish.

## Probe traps (learned the hard way)

- Hidden pane = no compositing: screenshots time out, `elementFromPoint` dies
  at 0x0, and **transitions freeze at their start value** — suppress
  transitions before reading computed styles.
- Stacking bugs are invisible to computed-style checks. Both the
  backdrop-covering-the-app bug and the trapped popup were `backdrop-filter`
  quietly creating a stacking context. Verify z-order by elimination or pixels.
- Importing `/node_modules/.vite/deps/X.js` in a probe creates a SECOND module
  instance; state-keyed APIs silently fail. Drive real DOM events instead.
- Long await chains in `javascript_tool` get collected — assign to
  `window.__x`, read in a second call.
- Data URLs cannot go in `srcset` (commas). Pick sources in JS.
- Bash heredocs eat one backslash level, and long ones with apostrophes fail
  outright — use the Write tool for prose files.
- Port 5173 is hard-wired (tauri devUrl + strictPort + CSP). Closing the Tauri
  window kills its vite; relaunch detached with
  `Start-Process cmd -ArgumentList "/c","npm run tauri dev"`.
- WebView2 caches dev-URL fetch failures forever; intro/logo/backdrop art is
  imported `?inline` (data URLs in the bundle) so it cannot blank again.
- **Side effects inside a React state updater run twice** (StrictMode). That
  was the intro's text-overlay bug: two ghost clones per scene change.

## Shipped this session

Intro/cinema: boot cat with rotating gerunds, real exit-and-enter scene
transitions with a held beat, vignette, drifting motes, Ken Burns, title-card
tracking, spotlight hover, glow bloom, stop-motion set pieces, Back, Skip,
backdrop carousel (preview then Continue), centered cat, and **three
demonstration windows in the tour's language** (the room, chapter-to-codex
link, a local model).

Features: reword-in-place · five bundled backdrops plus upload with glass
surfaces · randomized starter worlds (8.3M casts, seeded) · project preview
slideshow (reads at most four files) · custom themes and saved accent swatches ·
tool tabs that drag, stack AND **side-dock into columns** (one pane, internally
split) · calendar rebuilt (month/year picker, colorized days, expandable day,
many entries, **custom labels**, **ICS subscription**) · timer and alarm ·
**trash with 7/30-day retention** · board cover-art toggle and Codex/Tools on
the board · **task headers with subtasks** plus inline editing · **the hints
library** (16 looping clips, grouped sidebar, searchable) · **connections with
per-role AI routing** (Drafting/Ideas/Research/Critique/Quick) · **paste keeps
formatting** (HTML to Markdown, Google Docs and Word traps handled) · **a
format bar** where every toggle is its own inverse · **the Novella logo**
(theme-aware cream/charcoal, gates-opening animation, app icons rebuilt).

## Owner voice

Drew iterates by screenshot and pushes until it FEELS right; he forgives
everything except pretending. Premium (Apple/Lingrow), playful where it earns
it (the cat), fully customizable. Say plainly when something needs him.

## NOT YET SEEN BY A HUMAN — the honest list

Almost everything above shipped without the owner clicking it, because the repo
was mid-refactor by parallel agents all session and a dev server would have
shown someone else's broken state. Gates are green; eyes are owed on: the hints
library, side-docking, connections and roles, calendar labels, task headers,
paste formatting, the format bar, and the logo animation. Cursor keyframes in
the newer tour clips were computed from geometry rather than eyeballed, so
expect pixel nudges.

## Pending / next

- **Google account linking: NEEDS OWNER** (OAuth credentials and a Google Cloud
  project). ICS subscription and rich paste are the honest credential-free
  substitutes already shipped. Google's ICS endpoint sends no CORS header, so
  URL subscribe may need `@tauri-apps/plugin-http`; a paste-the-ics fallback
  exists.
- Task archive appends to `Archive/Tasks.md`; the seam (`stashArchivedTask` in
  TasksPanel.tsx) is the one place to repoint at `state/trash.ts`, which is
  note-granular and would need a line-shaped entry.
- `icon.icns` was written by PIL, not a mac toolchain — check it on macOS
  before a mac release.
- Owner round 5 leftovers: Board/Write split, document-bound chat panel,
  "Style me".
- Plan phases C (responsive/mobile plus PWA), D (Obsidian-storage safety:
  atomic writes, mtime don't-clobber, conflict-copy detection), E (open-source
  hygiene: ci.yml, README rewrite, CONTRIBUTING).
- DESIGN-SYSTEM.md section 3.10 consolidation sweeps still open.
- NEEDS OWNER (free): Pages source = GitHub Actions; private vulnerability
  reporting. NEEDS OWNER (money, optional): code-signing certs.
- Known open: phantom dirty flag on Tauri startup; Echoes detector too strict.
