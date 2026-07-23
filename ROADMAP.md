# Novella roadmap

The working backlog. The autonomous build routine reads this file, takes the
**topmost unchecked item**, builds it to the gate below, checks it off with a
dated log line, and pushes. Humans edit it freely — reorder, add, strike.

## The gate (every change, no exceptions)

- `npx tsc --noEmit` clean, `npx tsx test-units.ts` green, `npm run verify` green.
- Pure logic gets unit tests in `test-units.ts`.
- UI changes verified in the running app (dev server + `window.__novella`),
  not assumed.
- Never rewrite `src/core/vault.ts` (Phase 1 engine — small guarded fixes only).
- Match the codebase's comment voice: explain constraints, not mechanics.
- Commit to `main` with the Co-Authored-By line; push.
- Release tags are cut ~weekly, only when user-visible features shipped and
  the suite is green: bump `version` in `package.json` + `src-tauri/tauri.conf.json`,
  then `git tag vX.Y.Z && git push origin vX.Y.Z` (CI builds installers).

## The thesis (what "#1" means here)

Research keeps returning the same finding: **writers run 3–4 apps because no
one app does the whole job** — a focus/sprint timer, a notes-and-worldbuilding
tool, a task manager, and a word-count tracker, each solving one piece.
Novella's bet is to be the one app that does all four *and* writes with you,
locally, with no API key and no per-word cost. Every roadmap item should
either collapse one of those four apps into Novella or defend the local-first
advantage. Items that do neither belong at the bottom.

The Notion comparison (round 6) adds three standing guardrails, because they
are exactly why people quit Notion: stay FAST as projects grow (measure it),
keep structure FLAT (nothing buried five layers deep), and keep leaving easy
(plain Markdown, one-click export — lock-in is a churn engine, not a moat).

## Next up

- [x] **Slash commands in the editor** — shipped 2026-07-22.
- [x] **Writing sprints (the fourth app)** — shipped 2026-07-23.
- [x] **Ctrl+K everywhere** — shipped 2026-07-23.
- [x] **Table view for the manuscript** — shipped 2026-07-23.
- [x] **Alt+↑/↓ moves the current paragraph** — shipped 2026-07-23.
- [x] **Note templates** — shipped 2026-07-23: right-click → Save as template (Templates/, `(template)` suffix so links never mis-resolve); + New stamps from it with {{name}}/{{date}}.
- [x] **Drag images onto board cards** — shipped 2026-07-23: drop → downscaled JPEG at `.novella/images/<note-id>.jpg` (travels with the folder), lazy-hydrated on board render, ✕ to remove.
- [x] **Personalization: accent color + prose font/size** — shipped 2026-07-23: Settings → Appearance, on top of any theme, per device; reset button.
- [x] **Quiet first run** — shipped 2026-07-23: first launch opens the editor alone on the seed chapter; Codex/Tools one labeled click away; pane choices remembered.
- [x] **Rename notes in place** — shipped 2026-07-23.
- [x] **Word-level diff inside History's changed paragraphs** — shipped 2026-07-23.
- [x] **Continuity checks, deterministic tier** — shipped 2026-07-23: Continuity inspector tab; provable checks only (early mention via `introduced:`, near-duplicate codex names, dangling links with counts, unordered chapters, unknown POV); click opens the note; 9 unit checks.
- [x] **OS keychain for API keys (desktop)** — shipped 2026-07-23: secret_set/get/delete Tauri commands over the `keyring` crate (Credential Manager / macOS Keychain / Linux keyutils); JS write-through + hydrate-at-register; web stays memory-only; Rust round-trip test passes against the real store; SECURITY.md updated.
- [x] **Export presets per format** — shipped 2026-07-23 (.novella/export.json, restored on open).
- [ ] **Silent auto-update** — generate a Tauri updater keypair, add the
      pubkey + endpoint to `tauri.conf.json`, wire `tauri-plugin-updater`,
      and have CI attach `latest.json`. Needs a decision from the owner
      about key custody — ASK, do not generate silently.
- [x] **PLAN: sync/accounts backend** — plan written 2026-07-23 as PLAN-sync.md (zero-knowledge design, three hosting options, phased; blocked on the three NEEDS OWNER decisions listed there — nothing scheduled until answered).
- [x] **Board card virtualization** — shipped 2026-07-23 (the memoization half): per-note words/tasks/synopsis cached by body identity (cardDerived) across corkboard, stats, table. True windowing deferred until real projects pass ~300 chapters.
- [x] **Stats view needs a scroll affordance** — shipped 2026-07-23: edge fades driven by a reusable useScrollEdges hook.
- [x] **The codex pane doesn't group at scale** — shipped 2026-07-23: codex types sort alphabetically with letter headers past 20 entries; manuscript keeps book order (also fixed: it previously showed file-load order); folds persist.
- [x] **No way to delete a note from the UI** — shipped 2026-07-23: right-click → Delete note anywhere; undo toast; trash copy in `.novella/trash/`; board membership cleaned and restored.
- [x] **Agents can't be reordered or run as a group** — shipped 2026-07-23: Run all now (sequential) + hover ↑↓ reorder, order persisted.

## Research cadence

Roughly every third run (or when "Next up" runs thin), spend the run on
research instead of code: fresh reviews and feature news for NovelCrafter,
Sudowrite, Dabble, Scrivener, Campfire, Notion-for-writers. Add findings as
new checklist items with a one-line source note — do not build on the same
run. RESEARCH.md holds the long-form findings.

## Adding to this list

Don't wait for a research run. **Any time a run notices something — a bug, a
rough edge, a feature a competitor just shipped, or simply a good idea —
append it to "Next up" in the same run**, with one line on why it matters.
Ideas are cheap to record and expensive to lose. Two rules keep the list
honest: put it in priority order against the thesis above rather than at the
end by default, and if a run *builds* something it thought of itself, say so
plainly in the log line.

Every third run or so, also spend five minutes using the app like a writer
would — a real stress project, the odd edge case — and file what's rough.
The 2026-07-23 pass below found a shipped feature that broke at realistic
scale; nothing but use would have caught it.

## Shipped (autopilot log)

- 2026-07-23 — Owner feedback round 3 (session). FIXED THE REPORTED BUG:
  "Delete board does nothing" — confirm() dialogs are suppressed in some
  webviews, so every confirm() in the app is gone (boards and agents
  delete instantly with an Undo toast; clear-history and delete-thread
  are two-click armed buttons). BUILT: writing styles in the Assistant
  (Extensive novel / Paragraph mode / Email writer seeds, + New style,
  Upload style, and an always-on "what should this be about" line wired
  through a new {{guidance}} variable); board picker is a dropdown and
  Web/Stats left the layout switch; the Tools pane is one dropdown with
  per-tool descriptions; the music dock is draggable by its header,
  minimizable to a mini bar, with an accent header; Appearance grew
  line spacing, page width and corner style; a 4-step "Let's get
  started" wizard for new users (name → theme → honest local-AI check →
  first project); presets renamed The Big Book / A World to Keep /
  Small but Mighty / Blank Page. All verified live; 241 checks green.

- 2026-07-23 — Playtest pass (session; owner asked for a game-tester
  sweep: "make sure everything visible has a purpose"). The critique
  chips (Sticky/Adverbs/Passive/Echoes) now carry live counts, plain-
  language tooltips explaining each habit, and the Critique tab
  cross-references them; highlight round-trip verified on planted prose
  ("slowly"/"softly" marked, cleared on toggle). A DOM audit walked all
  15 surfaces + 7 settings tabs + modals for unlabeled controls — six
  found (plugin setting fields, export checkbox), all labeled. FOUND
  STALE: the "session only" chip on secret fields predated the OS
  keychain — now says "in OS keychain" on desktop, with honest hovers
  for both builds. Custom-board empty state now points at the dashed
  tile that exists instead of the old header button. Titlebar save
  status, "in memory" badge and the editor's file path all explain
  themselves on hover. 241 checks green.

- 2026-07-23 — Owner feedback round 2 (session). "Beats" is gone from the
  UI: the panel is **Scene plan**, lines are steps ("Write this step",
  "Suggest next steps", card chip "3-step plan"); files and APIs keep the
  `beats` key so nothing breaks. The corkboard grid now ends in two
  dashed ghost tiles — **+ New chapter** (or **+ Add cards** on a custom
  board) and **+ New board**, which names itself inline, switches to the
  fresh board and opens the add-cards picker so it's never a dead end.
  Settings grew a **Shortcuts** tab: every binding with a plain-language
  description (Everywhere / While writing / On the board) — a reference,
  honestly labeled as not-yet-remappable. All verified live; 241 checks.

- 2026-07-23 — Roadmap burn-down, phase 3 (session): the list is now
  clear except Silent auto-update, which stays open on purpose — it
  needs the owner's key-custody decision (see its ASK note). BUILT:
  card art (drop an image on a corkboard card; .novella/images/,
  lazy-hydrated, removable), the Continuity inspector tab (deterministic
  tier — early mentions via `introduced:`, near-duplicate names,
  dangling links with counts, unordered chapters, unknown POV; 9 unit
  checks), codex letter grouping at scale + persistent folds (and fixed
  the manuscript group showing file-load order instead of book order),
  PLAN-sync.md (zero-knowledge sync design, three NEEDS OWNER decisions),
  and the OS keychain: three Rust commands over `keyring`, JS
  write-through + hydrate-at-register, web unchanged; the Rust
  round-trip test passes against the real Windows Credential Manager.
  SECURITY.md updated to match (secrets: memory + OS credential store,
  never localStorage). 241 unit checks green.

- 2026-07-23 — Roadmap burn-down, phase 2 (session) + owner feedback pass.
  OWNER FEEDBACK ("still don't see the +; symbols aren't obvious"):
  the + is now a labeled "+ New" pill; the codex header speaks words
  ("+ New", "Import", "Export"); titlebar toggles labeled Codex/Tools/
  Focus; Rename… added to every note's right-click menu (opens the note
  with its title selected). BUILT from the list: note templates, export
  presets, agents run-all + reorder, stats edge fades (useScrollEdges),
  per-note derived-value cache (cardDerived), personalization (accent/
  prose font/size on top of any theme, per device, with reset), quiet
  first run (editor alone; pane choices persisted). SWEPT: every board
  layout, inspector tab, settings page, and modal open/close with zero
  fresh console errors. 232 checks green throughout.

- 2026-07-23 — Roadmap burn-down, phase 1 (session; release deferred until
  the list is done, per the owner). BUILT: Alt+↑/↓ paragraph moves
  (src/core/paragraphs.ts), rename-in-place in the editor header (blur
  reads the field, not state — a same-tick blur used to drop the rename),
  word-level diff inside History rewrite rows, the Ctrl+K palette
  (commands + every note, tiered matching in src/ui/palette.ts), the
  Table board layout (sortable words/tasks/tags, empties pinned last),
  and note deletion with an 8s undo toast + `.novella/trash/` copy —
  right-click → Delete note works from codex, boards and table, and
  restores board membership on undo. FOUND & FIXED: the web/memory
  storage adapters ingested dotfolder .md files on load, so trashed
  notes would have resurrected as vault notes on reload (Tauri already
  skipped them); one leftover "Story Bible" tooltip. All checks live in
  the browser on the real module instances; 232 unit checks green.

- 2026-07-23 — Security/editorial pass (session). AUDITED: no injection
  surfaces, no eval, secrets verified memory-only, every fetch target
  enumerated; findings written into SECURITY.md as a data-safety section.
  BUILT: one-click full-project backup (.zip of everything incl. .novella)
  as a fourth export card, with listFiles() on all three storage backends.
  FOUND & FIXED a real data-loss bug: the four .novella config stores
  (boards/plot/agents/music) could persist their empty post-reset cache
  over the disk file if mutated before the async load settled — this had
  already eaten two of the owner's boards. All four stores now load-before-
  persist and merge in-flight edits; regression scenario verified live.

- 2026-07-22 — Relationship web + Stats board layouts (session build).
- 2026-07-23 — Screenshot-feedback pass: fixed the inspector tab overflow
  that made Music unclickable (pane head now grows), tab manager always
  reachable with show/hide states, Write/Board centred to the pixel in a
  three-zone titlebar, left pane header is the project's own name with
  import/export beside it, "Story Bible" retired for plain codex copy,
  right-click menu on every note and card (open / add to board / export
  Markdown / promote to Manuscript), custom boards gained "+ Add cards"
  picker. Notion research round 6 filed.
- 2026-07-23 — Research round 5 + QA pass. Found and fixed: the web collapsed
  at realistic scale (44 entries → 25% of labels overlapping). Replaced the
  single ring with a canvas that grows with the cast, clipped labels, and made
  the test share the renderer's arc budget so the two can't drift apart again.
  Five QA findings and three research-driven features added above.
- 2026-07-22 — Slash commands in the editor: `/` on a blank line opens a
  menu (task, scene break, heading, beat, link to entry, new character).
  Plain-text ones use CodeMirror's autocomplete `apply`; "link" reopens the
  existing `[[` completion so the writer keeps typing; "beat" and "new
  character" reach into the vault store. Found and fixed one bug of my own
  along the way: the first "beat" implementation called `setBeats` with a
  blank entry, which the store silently strips — switched it to a small
  `editorBridge` hand-off (like the existing insert-into-editor bridge) that
  opens the Beats panel and focuses its draft input instead. 193 unit checks
  (6 new, in `slashCommands.ts` — the pure trigger regex and command list),
  `npm run verify` green, all six commands exercised live in the dev server.
- 2026-07-23 — Writing sprints, the fourth app: pick 15/25/45 min in the
  Goals tab, a countdown ticks down against `manuscriptWordCount()` (the
  same sampler the daily goal already uses, so the two numbers never
  disagree), and the net words written during the sprint show live. Stopping
  early logs the sprint as incomplete; running out logs it complete and
  plays a synthesized two-tone chime (Web Audio API — no bundled asset, no
  Tauri config change). A sprint missed while the app was closed settles up
  the moment the Goals tab remounts rather than drifting. New
  `src/state/sprints.ts` (pure `remainingSeconds`/`formatClock` + a
  localStorage-backed store, same `useSyncExternalStore` shape as
  `sessions.ts`) and `src/ui/{SprintTimer,chime}.ts`. 201 unit checks (8 new),
  `npm run verify` green, exercised live: started a sprint, typed into the
  chapter and watched the live count track it, stopped one early (logged
  "stopped early"), and seeded a near-expired sprint through localStorage to
  confirm the auto-finish + chime path fires cleanly on reload.
