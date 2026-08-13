# Novella — session handoff (rewritten 2026-08-12)

Paste-in context for a fresh Claude session. Everything decided, shipped, and
pending, compressed. The repo itself is the deep record: ROADMAP.md (backlog +
dated log of every run), RESEARCH.md (27 competitor-research rounds),
AUTOPILOT.md (how the cloud routine behaves), docs/DESIGN-INTRO.md (the intro
and motion spec), PLAN-sync.md (sync design awaiting owner decisions),
SECURITY.md (audit).

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
- **v0.2.0 is released** — tag → CI (release.yml) → installers on GitHub
  Releases (Win .exe/.msi + macOS .dmg, unsigned; SmartScreen instructions in
  the release notes). In-app update checker reads these.
- Web build: `npm run build:web`, GitHub Pages workflow ready
  (.github/workflows/pages.yml, `base:"./"`, mode-gated CSP).
  **NEEDS OWNER (free): Settings → Pages → Source = GitHub Actions.**

## The gate (every change)

`npx tsc --noEmit` clean · `npx tsx test-units.ts` green (258 checks) ·
`npm run verify` green · UI verified LIVE in the browser where one exists —
and never claim live verification without it. Pure logic gets unit tests.
Exit codes read bare, never through a pipe. Browser console lies (stale HMR
errors); verify via live DOM with fresh timestamps. The Claude browser pane
shares the owner's profile — probes leak into their app state; stash and
restore, and clean up probe data. Known probe traps: `confirm()` is
suppressed (never use it in app code — use undo toasts / armed buttons);
element.focus()/blur() don't fire real focus events when the pane is
unfocused; React onMouseEnter needs real mouseover, not dispatched
mouseenter; background tabs throttle timers (bogus timing measurements).

## Shipped and verified (highlights)

Editor: CodeMirror, [[wiki-links]] + aliases, autocomplete, slash menu
("Plan step" not "beat"), Alt+↑/↓ paragraph moves, rename-in-place (blur
reads the field, not state), inline critique chips with live counts
(Sticky/Adverbs/Passive/Echoes) + Critique tab cross-ref, scene plan panel
(never "beats" in UI; `beats` stays as the storage key), tasks as `- [ ]`,
revision history with word-level diffs, autosave + crash recovery.
Codex: typed groups, letter headers past 20 entries, persistent folds,
manuscript group in book order, right-click menu everywhere (open/rename/
template/export/boards/delete-with-undo + `.novella/trash/`).
Boards: Cards/Grid/Table (Web+Stats components exist but are unreachable —
cut on owner feedback), dropdown board picker, ghost tiles (+ New chapter /
+ Add cards / + New board), card images (drag-drop, `.novella/images/`),
delete board = instant + Undo toast. Assistant: writing styles = exactly
default + Extensive novel + Paragraph mode + Email writer + user-created
(+ New style / Upload style), always-on `{{guidance}}` direction line.
Ctrl+K palette; Table view; export DOCX/EPUB/MD/print-PDF/backup-zip with
per-project presets; import docx/md/txt + codex auto-extraction; projects
(fun preset names: The Big Book / A World to Keep / Small but Mighty /
Blank Page); personalization (accent w/ auto-contrast, font, size, spacing,
width, corners) applied via CSS vars in 0.3ms; 5 themes; goals/streaks/
sprints/planner/calendar-display; music dock (draggable, minimizable);
agents (run-all, reorder, undo delete); deterministic Continuity tab;
OS-keychain API keys (Rust `keyring`, round-trip tested); Settings→Shortcuts
reference; quiet first run.

**Just built (2026-08-12): the Welcome intro + motion system**
(docs/DESIGN-INTRO.md is the spec — read it before touching):
`src/ui/introScript.ts` (pure: script, word-timing, impatience ladder —
tap completes line, tap again completes screen; 17 unit checks),
`src/ui/WelcomeIntro.tsx` (full-screen scripted narrator, NO chat cosplay,
word-streaming serif lines, live accent recolor mid-conversation, theme
chips hover-preview/click-commit, HONEST Ollama check, real-work
interstitial, returning-writer path skips project creation, closing fade
handoff, "Set up later" always visible), motion tokens in theme.css
(--motion-quick/standard/slow/intro + easings), workspace entrance
animations (modals/palette/toasts/menus/pane-glide), theme crossfade via
one-shot `.theme-transitioning` class in useTheme, sacred no-animate rule
on `.cm-editor` (typing latency never animates), prefers-reduced-motion
zeroes everything. Replay: Settings → About → "Replay the intro"
(replayIntro/registerIntroOpener bridge). FirstRunWizard.tsx deleted.
Intro shows ONCE to everyone incl. the owner (their choice) via
`novella.introSeen`; the flag was deliberately left UNSET in the owner's
browser profile so they experience it on next launch.
Verified live end-to-end twice (new-user path + returning path + replay +
Set-up-later). NOT verifiable in this environment: hover-preview feel
(pane can't synthesize real hover/focus) — needs one human hover.
Owner's penName in the shared profile is now "Drew" (set during testing;
they can change in Settings → Profile).

## The cloud autopilot

Daily cloud routine (local task deleted); reads ROADMAP.md (what) +
AUTOPILOT.md (how). It went 20 research-only rounds because the gate's
"UI verified live" read as an absolute bar with no browser — fixed by
letting browserless runs build+unit-test+disclose, and capping research at
1-in-3, never consecutive. It also stocks `.claude/skills/` +
`writing-skills/` (craft skills + public-domain reference library).
Multi-writer repo now: expect non-fast-forward pushes; rebase (their
commits usually touch only ROADMAP/RESEARCH).

## Owner voice & standing rules

Blunt, wants premium Apple-grade feel ("simple by default, advanced on
demand"), hates crowded menus and unexplained symbols (labels + tooltips
everywhere; words over glyphs), wants everything customizable. Honesty is
absolute: never fake AI/accounts/progress; NEEDS-OWNER items get flagged,
never simulated. No confirm() dialogs. Undo over confirmation. One tap =
visible consequence. Verify in the running app, then say exactly what was
and wasn't verified.

## Open / pending

1. **Owner round 5** (top of ROADMAP, partly superseded by the intro work):
   interactive calendar (local first; Google sync NEEDS OWNER OAuth),
   Board split from Write into characters/storyboard/memories space
   (WITH-OWNER), fixed-size settings modal (CLOUD-OK), open-book logo
   (WITH-OWNER; regenerates src-tauri/icons + PWA icons), document-bound
   Chat panel replacing one-shot Assistant (core CLOUD-OK), highlight→
   reword-in-style→inline accept/reject (core CLOUD-OK; reuse diff.ts +
   styles), type.ai lessons (RESEARCH round 27).
2. **Approved plan phases remaining** (plan file: distributed-popping-
   trinket.md): B finish = flip the Pages repo setting + verify URL;
   C = responsive/mobile (at 375px the editor is 0px — grid must become
   one pane + drawers <900px; titlebar ~660px overflow; touch-action fixes;
   then PWA via vite-plugin-pwa mode-gated); D = Obsidian-style storage
   safety (atomic writes, mtime don't-clobber guard in saveAll, conflict-
   copy detection in ingest(), .novella/lock, discoverability copy);
   E = open-source hygiene (ci.yml on push/PR, README rewrite + screenshot,
   CONTRIBUTING, issue templates, tsconfig include test-units.ts, Linux
   runner ubuntu-22.04).
3. **NEEDS OWNER:** Pages setting (free); signing keys for silent
   auto-update (money; ASK first); PLAN-sync.md three decisions (hosting/
   custody/money; recommendation = C: user's own cloud folder); code-signing
   certs (money, optional); private vulnerability reporting (free).
4. **Known open bug:** phantom dirty flag on Tauri startup (task #13) —
   instrumented in vaultStore.ts (~line 248), cause never established.
5. Board virtualization true-windowing deferred (~300+ chapters);
   model-driven continuity tier unbuilt; grammar/spellcheck scoping task;
   Echoes detector too strict (triple repetition didn't trip it).

## Verification quick-recipe

Dev server: preview_start "novella-dev" (port 5173 fixed — autoPort:false;
tauri devUrl + strictPort + CSP all pin it; kill orphaned vite if held).
Dev handle: `window.__novella` (store, boards, agents, deleteNoteWithUndo,
history, importing, …). Desktop-only checks: `npm run tauri dev` with
VITE_DEV_VAULT=<fixture> runs the disk self-test incl. the fs-capability
probe (readBytes/listFiles/remove) — capabilities/default.json must grant
every fs call tauriStorage makes; a missing grant only fails in packaged
builds (v0.1.0 shipped broken that way — fixed in v0.2.0).
