# Novella — session handoff (rewritten 2026-08-20)

Paste-in context for a fresh Claude session. Deeper record in the repo:
ROADMAP.md (dated log), RESEARCH.md (35 competitor rounds), AUTOPILOT.md (cloud
routine), docs/DESIGN-SYSTEM.md (design source of truth), docs/DESIGN-INTRO.md
and docs/DESIGN-INTRO-CINEMA.md (intro + motion specs), PLAN-sync.md, SECURITY.md,
CONTRIBUTING.md.

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
- **v0.2.0 is the last tag**; main is well ahead. Owner said version numbers
  are not a priority — do not tag without being asked.
- Windows zip `C:\Users\drewp\Downloads\Novella-win64-2026-08-18.zip` predates
  everything below — rebuild before handing it to anyone.

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

`npm run verify` = tsc + **sixteen suites** + production build, roughly
**2,600 assertions**. Keep new suites added to it — a suite outside `verify` is
a suite nobody runs.

test.ts · test-units 337 · test-themes 151 · test-tabs 78 · test-stack 240 ·
test-trash 106 · test-timers 136 · test-calendar 302 · test-projectpreview 86 ·
test-tour 282 · test-roles 219 · test-tasks 88 · test-paste 75 · test-format 146 ·
test-prose 46 · test-styleme 158 · test-chat 106 · test-storage 159

**`.github/workflows/ci.yml` now runs the gate on every push and PR** (first
green run 2026-08-20). Before it, verify ran only on tags. `tsconfig.json`
finally includes the root test files — the files named in the gate had been the
ones the typecheck skipped, and including them surfaced two real defects.

Rules: exit codes read bare, never through a pipe. Pure logic gets unit tests.
UI verified live where a browser exists; never claim live verification without
it. **Never fake AI, accounts or progress**; anything needing owner
money/keys/settings is flagged NEEDS OWNER, never simulated.

## Working with subagents

The pattern that works: each agent owns DISTINCT files, edits **no .css at
all**, and reports the CSS it needs; the main session writes every style. That
separation is what keeps parallel agents from colliding.

- **Never `git add -A` while agents are writing** — it commits half-finished work.
- **Never `git stash` while agents are writing.** A stash-then-pull chain of
  mine stashed several agents' in-flight files and the pull failed, so the pop
  never ran; two agents lost work. `stash@{0}` still holds that snapshot —
  stale, superseded, safe to drop.
- Agents cannot see each other, so a whole-project `tsc` shows THEIR errors
  mid-flight. Gate per-file, then gate the whole tree once they finish.
- Agents also cannot see mount points typing knows about. Adding a tab needed a
  third edit in `SettingsModal.tsx` (`Record<TabId, string>`) that only `tsc`
  found. Trust the typechecker over the agent's mount-line list.

## Probe traps (learned the hard way)

- Hidden pane = no compositing: screenshots time out, `elementFromPoint` dies
  at 0x0, and **transitions freeze at their start value**. Verify with
  `read_page` / `javascript_tool`, not pictures.
- Reading a computed style in the same synchronous turn as the click that
  changes it reads the OLD value — React hasn't re-rendered. Split the probe
  across two `javascript_tool` calls.
- Comparing two same-size PNG data URLs by their first N chars proves nothing:
  the header is identical. Compare `.length` or the tail.
- A tab in the strip has a `.tab-close` child. A probe that clicks "the tab"
  can close it instead. Click well inside the left edge.
- Stacking bugs are invisible to computed-style checks. Both the
  backdrop-covering-the-app bug and the trapped popup were `backdrop-filter`
  quietly creating a stacking context. Verify z-order by elimination or pixels.
- Importing `/node_modules/.vite/deps/X.js` in a probe creates a SECOND module
  instance; state-keyed APIs silently fail. Drive real DOM events, or use
  `window.__novella` (devtools.ts), which is the app's own instance.
- React tab/drag handlers want the whole pointer sequence: pointerdown,
  mousedown, **pointerup**, mouseup, click. Omitting pointerup silently no-ops.
- Long await chains in `javascript_tool` get collected — assign to
  `window.__x`, read in a second call. `const` at top level persists between
  calls, so re-declaring the same name throws.
- Data URLs cannot go in `srcset` (commas). Pick sources in JS.
- **Bash heredocs eat one backslash level, and worse: a `\b` in a Python
  heredoc reached the file as a literal 0x08 backspace byte**, which silently
  broke a regex (`/^\s+by\b/` became `/^\s+by<BS>/` and never matched). Tests
  caught it. Prefer the Write tool for anything with escapes, and
  `grep -P '[\x08\x0b\x0c\x1b]'` the tree if a regex mysteriously never fires.
- **The owner's display is 4K at 250% scaling (240 DPI).** Windows asks for
  icons at logical size x scaling, so it wants 40 / 60 / 80px where a
  default ladder stops at 64 — it then ENLARGES a smaller frame, and no
  amount of care spent on the 32px art is ever seen. `icon.ico` now carries
  19 frames covering 100-300%. Worth remembering for any asset picked by
  size rather than scaled by CSS.
- Port 5173 is hard-wired (tauri devUrl + strictPort + CSP). Closing the Tauri
  window kills its vite; relaunch detached with
  `Start-Process cmd -ArgumentList "/c","npm run tauri dev"`.
- WebView2 caches dev-URL fetch failures forever; intro/logo/backdrop art is
  imported `?inline` (data URLs in the bundle) so it cannot blank again.
- **Side effects inside a React state updater run twice** (StrictMode).

## Shipped

Intro/cinema: boot cat with rotating gerunds, real exit-and-enter scene
transitions, vignette, drifting motes, Ken Burns, title-card tracking,
spotlight hover, glow bloom, stop-motion set pieces, Back, Skip, backdrop
carousel, and three demonstration windows in the tour's language.

Features: reword-in-place · five bundled backdrops plus upload with glass
surfaces · randomized starter worlds (8.3M casts, seeded) · project preview
slideshow · custom themes and saved accent swatches · tool tabs that drag,
stack and side-dock into columns · calendar rebuilt (month/year picker,
colorized days, expandable day, custom labels, ICS subscription) · timer and
alarm · trash with 7/30-day retention · board cover-art toggle · task headers
with subtasks and inline editing · the hints library (17 clips, grouped
sidebar, searchable) · connections with per-role AI routing · paste keeps
formatting · a format bar where every toggle is its own inverse · the Novella
logo (theme-aware cream/charcoal, gates-opening animation).

**2026-08-20:**
- **Chat** (`ChatPanel.tsx` + pure `ai/chatCore.ts`) — a per-project
  conversation bound to the open note, reading the scene and only the codex
  entries it names via `buildSceneContext`, and **showing which ones before you
  send**. Per-thread role. Streams outside the component (leave the tab and
  come back to a finished answer). One answer at a time app-wide, because two
  streams would share the abort controller. Nothing auto-inserts. Threads live
  in localStorage per project, never in the vault.
- **Style me** (`ai/styleMe.ts` + `StyleMeModal.tsx`) — derives a voice from a
  sample and saves it as an ordinary `type: prompt` note under `Prompts/`, so
  it appears in the Writing style list and actually drafts. `parseStyleReply`
  returning null is load-bearing: a refusal saves nothing.
- **Sync safety, plan phase D** (`storage/vaultSafety.ts`) — atomic writes via
  dot-prefixed temp + rename (retry once, then direct write; a failed direct
  write deliberately LEAVES the temp, because litter beats loss); `saveAll`
  won't clobber a newer file (adopt quietly if clean, ask if dirty, diffed with
  `diff.ts`); conflict copies from Dropbox/Drive/iCloud/OneDrive/Syncthing
  flagged rather than ingested, with a series escape for writers whose chapters
  are literally numbered. Web/memory adapters take the fast path on line one.
- **The critique stopped crying wolf** (`analysis/prose.ts`) — echoes exempt
  names (capitalisation away from sentence start, plus a rule for names that
  only ever open a sentence), **the codex** via `linkTargets()`, and dialogue
  tags; range scales 25/40/60 by word length; two underlines per word max.
  Adverbs no longer flag "family"/"butterfly"; passive no longer flags "was
  tired"/"was married" unless a by-phrase follows.
- **Phase E** — ci.yml, README rewritten for a stranger, CONTRIBUTING, tsconfig.

## Owner voice

Drew iterates by screenshot and pushes until it FEELS right; he forgives
everything except pretending. Premium (Apple/Lingrow), playful where it earns
it (the cat), fully customizable. Say plainly when something needs him.

## Verified live 2026-08-20 (dev server, text probes)

Chat tab in the strip and in the `+` menu; panel scrolls its transcript with
the composer pinned; "knows about: Wren Calloway, Halden's Reach, The Drift
~434t" appears as you type; Send with Ollama down gives the real error and no
hanging spinner; thread auto-titles. Critique returns **zero** findings on a
passage repeating "Wren" three times with "family", "whispered" twice and "she
was tired" — and still catches "lantern", "slowly", "carefully", "was carried".
Style me opens at 745px in the prose face and says plainly it needs a model.
The logo swaps asset between dark themes (15118 B cream) and Vellum (18150 B
charcoal). The chat clip renders 451×247 with all five beats on the 5.8s clock,
and its reduced-motion still frame is the finished frame, not a blank stage.

## STILL NOT SEEN BY A HUMAN

Side-docking, connections and roles, calendar labels, task headers, paste
formatting, the format bar, the gates-opening logo animation on the intro cold
open, and **the conflict dialog** (it has never fired — the only way to see it
is to edit a chapter in Notepad while Novella holds it dirty). Cursor keyframes
in the newer tour clips were computed from geometry rather than eyeballed.

## Pending / next

- **Google account linking: NEEDS OWNER** (OAuth credentials, Google Cloud
  project). ICS subscription and rich paste are the credential-free substitutes
  already shipped. Google's ICS endpoint sends no CORS header, so URL subscribe
  may need `@tauri-apps/plugin-http`; a paste-the-ics fallback exists.
- **Plan phase C — mobile/PWA** is the big one left: `App.tsx`'s inline
  `gridTemplateColumns` demands 626px, so at 375px the editor resolves to 0px.
  One pane + drawers, titlebar triage, `@media (hover: none)` touch fixes,
  `vite-plugin-pwa`. 3–5 sessions.
- **SECURITY.md is stale**: "there is no public release" is no longer true, and
  GitHub private vulnerability reporting is still disabled on the repo.
- Task archive appends to `Archive/Tasks.md`; the seam (`stashArchivedTask` in
  TasksPanel.tsx) is the one place to repoint at `state/trash.ts`, which is
  note-granular and would need a line-shaped entry.
- `icon.icns` was written by PIL, not a mac toolchain — check on macOS first.
- Owner round 5 leftovers still open: Board/Write split (taste — ask him).
- DESIGN-SYSTEM.md section 3.10 consolidation sweeps.
- NEEDS OWNER (free): private vulnerability reporting. NEEDS OWNER (money,
  optional): code-signing certs.
- Known open: phantom dirty flag on Tauri startup.
