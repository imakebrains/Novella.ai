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

- [ ] **Slash commands in the editor** — type `/` on a blank line for a
      menu: task, scene break, beat, heading, link to entry, new character…
      Notion's signature interaction and its fastest habit; CodeMirror's
      autocomplete API makes this a natural fit. (Notion round, 2026-07-23)
- [ ] **Writing sprints (the fourth app)** — a sprint timer wired to the word
      counter: pick 15/25/45 min, it counts the words written *during* that
      sprint and logs them beside the session history, with a gentle finish
      chime. An entire app category exists just for this (Write/Sprint,
      Ohwrite, Write or Die, Pomowatch, Trackbear) and writers run it in
      parallel with their writing app — the single clearest "collapse another
      app" win on the board. Lives in the Goals tab.
- [ ] **Ctrl+K everywhere** — one palette over titles, aliases, tags, prose,
      tasks, boards and commands; Enter jumps. Named as a core Obsidian
      strength (Omnisearch) and the muscle memory every Notion user brings.
      Search is already ~1ms over 118 notes, so this is pure UI.
- [ ] **Table view for the manuscript** — same chapters, sortable columns
      (title, words, POV, tags, tasks, threads); Notion's one-dataset-many-
      views is its deepest strength and Novella already has Cards/Grid/Web/
      Stats — Table and Timeline complete the set. (Notion round)
- [ ] **Alt+↑/↓ moves the current paragraph** — the writer-shaped version
      of Notion's drag-handle block reordering; cheap in CodeMirror.
      (Notion round)
- [ ] **Note templates** — "new character/location/chapter from template",
      stored as ordinary notes under `Templates/`. Obsidian's Templater and
      QuickAdd are perennial must-have plugins; presets proved the shape
      already, this makes it repeatable mid-project.
- [ ] **Drag images onto board cards** — drop an image file on a chapter card
      for card art; downscale like project covers; store at
      `.novella/images/<note-id>.jpg` via `storage()` so it travels (IDB on
      web, disk on desktop); hydrate on board render; removable.
- [ ] **Personalization: accent color + prose font/size** — Settings →
      Appearance: color input overriding `--accent`/`--accent-soft` (compute
      a readable `--accent-fg`), prose font choice and editor text size via
      CSS vars; persisted in localStorage; reset button.
- [ ] **Quiet first run** — first launch opens ONE pane (the editor with the
      seed chapter); Story Bible and Inspector present but closed; a 3-line
      welcome note instead of tutorial screens. Depth on demand, calm by
      default — the #1 usability complaint about the category.
- [ ] **Rename notes in place** — editable title in the editor header
      writing `name:` frontmatter and re-registering the resolve map (old
      title keeps resolving, alias-like).
- [ ] **Word-level diff inside History's changed paragraphs** — highlight
      changed words within `diffParagraphs` rows; pure function + tests.
- [ ] **Continuity checks, deterministic tier** — no model: characters
      appearing before their first-introduced chapter, frontmatter fact
      fields (age, eye colour) contradicted by other frontmatter, dangling
      links older than N days. Panel in the Inspector; pure checks + tests.
- [ ] **OS keychain for API keys (desktop)** — Tauri command pair
      (`keyring` crate) storing provider secrets; fall back to in-memory on
      web. Removes the re-enter-each-session cost.
- [ ] **Export presets per format** — remember last-used export options per
      project in `.novella/`.
- [ ] **Silent auto-update** — generate a Tauri updater keypair, add the
      pubkey + endpoint to `tauri.conf.json`, wire `tauri-plugin-updater`,
      and have CI attach `latest.json`. Needs a decision from the owner
      about key custody — ASK, do not generate silently.
- [ ] **PLAN: sync/accounts backend** — E2E-encrypted vault sync; unlocks
      Google sign-in and same-book-on-two-machines. Write the plan document
      first; needs owner decisions on hosting and billing.

### From the 2026-07-23 QA pass (a 64-chapter, 44-entry stress project)

Everything below is a real observation, not a guess. What held up: bulk load
55ms, DOCX export 68ms, compile 3ms, search 1ms, task aggregation instant,
focus mode clean. What didn't:

- [ ] **Board card virtualization** — 64 cards render fine, but every card
      recomputes word count, tasks and thread dots on each vault change.
      Above ~150 chapters that's wasteful. Memoize per-card derived values,
      keyed on the note's body, before it becomes a real stall.
- [ ] **Stats view needs a scroll affordance** — at 64 chapters the chart
      scrolls horizontally with no visual hint that there's more to the
      right. Add an edge fade or a count so it's obvious.
- [ ] **The Story Bible pane doesn't group at scale** — 44 characters is a
      flat wall of names. Add per-type collapse memory and a letter index
      or sub-grouping once a type passes ~20 entries.
- [ ] **No way to delete a note from the UI** — notes can be created from
      the + button, imported, and generated by agents, but only removed by
      deleting the file on disk. Needs a delete with an undo window
      (and it must clean up backlinks/board membership).
- [ ] **Agents can't be reordered or run as a group** — with five agents
      installed there's no "run all now". Minor, but asked-for shape.

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
