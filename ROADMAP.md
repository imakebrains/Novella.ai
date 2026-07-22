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

## Next up

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
- [ ] **Search everywhere (Ctrl+K)** — one palette over titles, aliases,
      tags, prose, tasks and boards; jump on Enter. The Notion muscle memory.
- [ ] **Export presets per format** — remember last-used export options per
      project in `.novella/`.
- [ ] **Silent auto-update** — generate a Tauri updater keypair, add the
      pubkey + endpoint to `tauri.conf.json`, wire `tauri-plugin-updater`,
      and have CI attach `latest.json`. Needs a decision from the owner
      about key custody — ASK, do not generate silently.
- [ ] **PLAN: sync/accounts backend** — E2E-encrypted vault sync; unlocks
      Google sign-in and same-book-on-two-machines. Write the plan document
      first; needs owner decisions on hosting and billing.

## Research cadence

Roughly every third run (or when "Next up" runs thin), spend the run on
research instead of code: fresh reviews and feature news for NovelCrafter,
Sudowrite, Dabble, Scrivener, Campfire, Notion-for-writers. Add findings as
new checklist items with a one-line source note — do not build on the same
run. RESEARCH.md holds the long-form findings.

## Shipped (autopilot log)

- 2026-07-22 — Relationship web + Stats board layouts (session build).
