# Skills & assets library

The companion to RESEARCH.md, but for *capability* instead of competitive
intelligence. This file tracks two things:

1. **The acquired library** — lives in **`writing-skills/`** at the repo
   root (skills + sources index + vendored suites), a self-contained
   folder designed to lift out into its own GitHub repo. Skills meant to
   be active in this repo are also installed under `.claude/skills/`,
   where every future session picks them up automatically.

   *Dedicated-repo status (owner request, 2026-08-12):* the owner wants
   this library in its own GitHub repo. Creation was attempted and
   **denied** — the automation's GitHub credential is scoped to
   imakebrains/Novella.ai only (403 on create). Blocked on the owner:
   create an empty `writing-skills` repo on GitHub and add it to this
   environment's repository access; the folder then moves over unchanged.
2. **Scouting rounds** — dated notes from the recurring skills-and-assets
   scouting pass (see "Research cadence" in ROADMAP.md), which hunts for
   new or improved skills, distillable human-authored craft sources, and
   concrete assets worth acquiring.

Two standing rules, set by the owner (2026-08-12):

- **Human-authored sources first.** The point of scouting is to find what
  real writers, editors, and practitioners have published — craft essays,
  lectures, checklists, templates — not to launder AI content farms into
  the library. Every scouted source gets an authorship note; anything that
  reads as SEO shovelware gets dropped no matter how good the title is.
- **Not just writing.** Writing craft is the core beat, but anything
  genuinely useful to the owner, to the autopilot routine, or to this
  project (research automation, publishing tooling, repo hygiene) is in
  scope.

## The acquired library

### Novel playbook suite — imported 2026-08-12

Seven orchestration skills gathered in a prior session (built 2026-08-11
from a larger novel-writing stack) and committed under `.claude/skills/`:

| Skill | Fires when |
|-------|-----------|
| `novel-playbook` | one entry point for the whole lifecycle; detects the current stage and routes |
| `novel-day-one` | starting a brand-new novel project |
| `novel-session` | opening or closing any writing session |
| `novel-scene` | drafting the next scene (context load → contract → draft → ledger update) |
| `novel-checkpoint` | every ~5 chapters (quick audits) |
| `novel-revision` | act boundaries and full revision passes |
| `novel-finish` | final polish, export, submission package |

These are orchestration skills: they maintain/expect project ledgers
(`scene-functions.md`, `relationship-state.md`, `knowledge-state.md`,
`promise-ledger.md`) and reference a dependency stack that was not in the
original import: `master-novel`, `conversational-authority`, `every-word`,
`manuscript-export`, `story-skills`, `creative-writing-skills`,
`author-toolkit`, `graphify-novel`. Without the stack they still work as
disciplined checklists.

**Stack recovery status (updated 2026-08-12, same day):** three of the
eight exist as real public repos and are vendored (see below):
`story-skills`, `creative-writing-skills`, `author-toolkit`. The other
five (`master-novel`, `conversational-authority`, `every-word`,
`manuscript-export`, `graphify-novel`) had no public versions, and the
owner confirmed the originals are unrecoverable — so they were **rebuilt
from their call sites** (every mention across the seven playbook skills:
ledger names and column schemas, the ten line-pass names, the compile
command, export flags, wake-date queries) as original skills. The rebuilt
five live in `writing-skills/skills/` alongside library copies of the
playbook suite, and are installed in `.claude/skills/`. They are
reconstructions, not restorations — if any behaves differently than the
owner remembers, treat the playbook's expectations as the spec and fix
the rebuilt skill, not the playbook.

### Vendored suites — acquired 2026-08-12 (Round 1)

Complete third-party suites under `vendor/skills/` (see the README there
for provenance, commits, and licenses — all MIT/Apache-2.0/CC0):

- **creative-writing-skills** (haowjy, 397★, Apache-2.0) — 13-skill craft
  suite: reader-sim, character-sim, story-memory, story-review,
  writing-staffing; the strongest public craft suite found.
- **story-skills** (Dan Dewhurst, 160★, MIT) — 7 skills plus a
  deterministic CLI continuity engine (timeline contradictions,
  dead-character checks, promise/payoff tracking) and a markdown
  story-bible schema. Likely the exact repo the playbook suite's
  reference pointed at.
- **author-toolkit** (rhavekost, MIT) — 6 skills incl. avoid-ai-writing,
  prose-mechanics, story-structure (K.M. Weiland beats, Bell's
  signposts), five editorial personas.
- **obsidian-novel-starter-vault** (rrbaker, CC0) — public-domain
  manuscript folder structure + character/setting sketch templates.

**Wiring status: vendored, not yet auto-loaded.** The suites'
skills reference shared folders inside their own repos (a `references/`
library, the CLI engine), so their skill folders can't be cherry-picked
into `.claude/skills/` without breaking links. Open task for a future
run: test the vendored skills in place, pick the keepers, and wire them
into `.claude/skills/` properly (path-fixed copies, not symlinks — the
owner is on Windows).

## Scouting rounds

(Newest first. Each round: what was found, authorship notes, what was
acquired or queued, and what next round should chase.)

# Round 1 (2026-08-12)

First scouting round, run live with the owner. Four parallel scouts:
Claude/Agent skills ecosystem; human-authored craft sources; concrete
writer assets/templates; general-utility skills for this setup. (A first
attempt with strict structured-output schemas failed on all four scouts —
retry cap exceeded; the plain-text re-run below worked. Future rounds:
plain-text reports, no schemas.)

## Skills ecosystem — the missing stack is partly public

The headline: three of the eight "missing stack" names from the
novel-playbook README are real public repos, now vendored (see the
library section above). The other five have no public versions anywhere —
ask the owner for an export from the original chat.

Also found, worth distilling rather than vendoring:

- **howells/fiction** (github.com/howells/fiction, Daniel Howells, MIT)
  — 23 craft reference docs (scene structure, dialogue, pacing,
  anti-patterns), a critique→build pipeline, and "anchored constraints"
  for immutable story decisions. Small stars but verified deep.
  **Distill** its craft references to complement the playbook suite.
- **avoid-ai-writing** (github.com/conorbronsdon/avoid-ai-writing, Conor
  Bronsdon) — 21 AI-pattern categories, 43-entry replacement table,
  detect/rewrite modes. Plausibly what `every-word` intended; note
  author-toolkit also bundles its own avoid-ai-writing skill. **Distill.**
- **Manuscript-export slot**: nikmcfly/kindle-book-skill (Markdown → KDP
  EPUB3 + print PDF via pandoc/XeLaTeX) and smerchek/claude-epub-skill.
  The pandoc profiles are the valuable part. **Distill.**
- **Anchors to re-check each round**: anthropics/skills (official format
  authority + skill-creator), VoltAgent/awesome-agent-skills and
  ComposioHQ/awesome-claude-skills (the two substantive indexes),
  anthropics/claude-plugins-community. obra/superpowers (Jesse Vincent)
  for disciplined-workflow methodology.
- **Skipped as shovelware**: forsonny/Claude-Code-Novel-Writer (hype
  README), watchsound/claude-novel (thin), mcpmarket listicles (no named
  authors), thin awesome-list clones.

## Human-authored craft sources — distillation queue

All verified human practitioners. Top three distillation candidates,
in order:

1. **Matt Bird — Expanded Ultimate Story Checklist**
   (secretsofstory.com, screenwriter/Columbia MFA) — ~120 questions,
   each linked to an essay; literally already a checklist. The single
   most skill-shaped source found.
2. **Dwight Swain scene/sequel + MRUs via September C. Fawkes**
   (septembercfawkes.com, working freelance editor) — goal/conflict/
   disaster, reaction/dilemma/decision, motivation-reaction units.
   Mechanical and testable against any scene → scene-construction skill.
3. **Emma Darwin — This Itch of Writing** (emmadarwin.typepad.com +
   Substack, novelist/teaches on UK MAs) — the canonical free treatments
   of psychic distance and free indirect style, with graded examples →
   POV/interiority skill.

Also queued: Holly Lisle's One-Pass Manuscript Revision (30+-novel
author, complete free procedure) + Susan Dennard's free revision-guide
PDF → revision-pass skill; Mary Robinette Kowal's MICE Quotient lecture
(free 318R guest lecture; the most algorithmic structure tool going);
K.M. Weiland's free structure series + Story Structure Database; Jane
Friedman's query/synopsis guides → publishing-prep checklist. **2025-26
flag:** Brandon Sanderson posted a fresh 2025 re-record of the BYU 318R
lecture series (first since 2020) — video, needs transcript work.

Bookmarks (good, not distillable-first): Palahniuk's Plot Spoiler
Substack (partly paywalled), George Saunders' Story Club (paywalled,
vibes-forward), Lincoln Michel's Counter Craft (the "structure and its
critics" angle), Writing Excuses S21 + community transcripts at
wetranscripts.dreamwidth.org, Le Guin's Steering the Craft (book only —
cite concepts, don't reproduce), SFWA Information Center. Truby/McKee:
books only, skip as direct sources.

## Writer assets — license-checked

- **Acquired as-is (CC0):** rrbaker's Obsidian novel starter vault →
  `vendor/skills/obsidian-novel-starter-vault/`.
- **Distill-into-template queue** (facts/schemas are free; wording is
  not): Shunn manuscript format (shunn.net egress-blocked; rules are
  uncopyrightable facts — write our own `manuscript-format.md` citing
  him); Story Grid Foolscap + scene spreadsheet schema (Shawn Coyne —
  the column schema maps directly onto the playbook's
  scene-functions.md ledger); Save the Cat 15-beat sheet (Jessica Brody;
  beat names/percentages widely documented — neutral `beat-sheet.md`);
  Snowflake Method step sequence (Randy Ingermanson); Gotham Writers
  character questionnaires → character-sheet template feeding
  relationship-state.md; copyeditor style sheets (Erin Brenner +
  BCcampus's CC-licensed chapter) → a `style-sheet.md` as the natural
  fifth ledger; Jane Friedman query/synopsis scaffolds.
- **Bookmarks:** Sarah Perlmutter's free series-bible template; Ellen
  Brock's worldbuilding-bible template (site egress-blocked, strongest
  editorial pedigree — retry later); Standard Ebooks / Project Gutenberg
  as public-domain reference corpora; Behind the Name (copyrighted DB,
  reference only).
- **Skip:** NaNo Prep 101 workbook — NaNoWriMo shut down April 2025;
  copyright is orphaned, not freed.

## General-utility finds — for the routine and the product

- **Feed-based monitoring beats blocked fetches (verified in this
  sandbox):** raw curl to arbitrary domains gets CONNECT 403, but
  WebFetch reads GitHub `releases.atom` feeds fine. Pattern: monitor
  competitors via feeds (`github.com/:owner/:repo/releases.atom`;
  openrss.org/<url> as fallback for feed-less pages), never raw fetch.
  **Adopted into the research cadence** (see ROADMAP.md) — this directly
  counters the egress degradation logged since round 22.
- **Git scraping** (Simon Willison) — snapshot competitor changelog/
  pricing pages into the repo on schedule; `git diff` becomes the change
  detector. Two-line addition to a routine that already commits daily.
  **Distill** next research round.
- **Showboat / Agentic Engineering Patterns** (Willison) — agent appends
  a work-log as it runs; RESEARCH.md already does this informally.
  Bookmark.
- **Lightweight ADRs** (adr.github.io) — decision records double as
  anti-context-rot memory for nightly runs (record why approaches were
  ruled out so they stop being re-proposed). Adopt when a real decision
  next comes up: `docs/decisions/`.
- **pandoc-novel** (JP Fosterson) + **pandoc-publish** (Matt Gemmell,
  novelist) — scriptable Markdown → EPUB/KDP-PDF/manuscript-PDF
  pipelines; relevant reference material if Novella's own export
  (src/export/formats.ts) ever needs a print-PDF path. Bookmark.
- **Author-marketing corpus** (human-authored): Jane Friedman's phased
  book-launch plan (for authors without platforms — exactly Novella's
  user), David Gaughran's blog, Tammi Labrecque's Newsletter Ninja
  framework (free interview transcript). Distill later into an
  author-launch playbook skill — useful to Novella's users, not just
  this repo.
- **Validation stat worth keeping:** Visualping's 2026 competitor-
  monitoring study — changelog/release-notes pages changed on 73% of
  monitors in 90 days and are the highest-signal, least-watched source.
  Vendor content, data-driven; skip the product.

## Next round should chase

1. The five still-missing stack skills — owner export first.
2. Wire the vendored suites: test in place, pick keepers, path-fixed
   copies into `.claude/skills/`.
3. First distillations, in order: Matt Bird checklist → skill; Swain/
   Fawkes scene-construction → skill; style-sheet.md fifth ledger
   (CC sources); manuscript-format.md (Shunn rules).
4. Retry egress-blocked sources: shunn.net, ellenbrockediting.com,
   web.archive.org.
5. Add feed URLs for tracked competitors (NovelCrafter, Sudowrite, etc.)
   to the daily research pass per the adopted feed pattern — and check
   VoltAgent/ComposioHQ indexes for new writing skills since this round.
