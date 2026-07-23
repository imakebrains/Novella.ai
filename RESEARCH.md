# What writers actually say about the competition

Research pass on NovelCrafter, type.ai, and Sudowrite — reviews, comparisons,
and writer commentary, mostly from 2025–2026. Sources are linked at the bottom.

The short version: **Novella is already positioned against the single loudest
complaint in this category**, and the biggest remaining gaps are three features
we don't have yet.

---

## 1. The loudest complaint is setup friction — and it's our home turf

Every serious NovelCrafter review lands on the same wall: you have to go get an
API key from OpenAI or Anthropic before the app does anything. One reviewer's
framing is the whole thesis in a sentence — that's developer work, not writer
work. Reviewers budget roughly an hour for first-time setup, and one counted
20+ tutorial screens before writing a word.

Cost compounds it. The advertised price is not the real price: NovelCrafter's
$14/month tier lands at $24–44/month once API usage is added, and reviewers
repeatedly flag that the headline number is half the story.

**Where Novella stands:** the one-install rule already answers this. Ollama is
installed from inside the app, the model is pulled with a progress bar, and
there is no key, no billing account, and no per-token cost. This is our single
strongest differentiator and the marketing should lead with it, not bury it.

**What to do:** nothing to build. Say it louder. The first-run screen should
make "no API key, no per-word cost" the first thing a writer reads.

---

## 2. NovelCrafter has no offline mode and no mobile app

Stated plainly in the April 2026 review. It's a web app; if the connection
drops, the work stops.

**Where Novella stands:** we are local-first by construction. Markdown files on
your disk, a local model, and nothing required from the network. A writer on a
plane is a writer who can still work.

**What to do:** also nothing to build — but this is the second headline. Pair it
with the fact that the vault is plain Markdown you can open in any other editor,
which is an exit-hatch promise none of the competitors make.

---

## 3. Three real gaps we should close

These are the places where the competition is genuinely ahead, ranked by how
strong the evidence is.

### 3a. Revision history — HIGHEST PRIORITY

Reviewers call this quietly one of NovelCrafter's most important features,
specifically because writers experiment with AI-generated prose and need to roll
back. It's also named as an edge NovelCrafter holds over **both** Sudowrite and
type.ai.

We have autosave and crash recovery, which is a different thing: it protects
against losing work, not against *regretting* work. A writer who lets the model
rewrite a scene and hates the result currently has no road back.

This is the clearest build item in the whole research pass.

### 3b. Codex auto-extraction — the chicken-and-egg problem

The sharpest specific criticism found: a writer importing an existing 40,000-word
manuscript is asked to hand-enter characters and world details **that are already
written in the document they just imported**. Separately, reviewers of other
tools complain that implicit details established in prose never make it into the
story notes, so continuity checking silently misses them.

Nobody has solved this well. We are unusually well set up to: the vault already
parses Markdown, tracks wiki-links, and computes dangling links. A dangling
`[[Wren Calloway]]` is *already* the app noticing a character with no codex entry.

Proposed: on import, and continuously while writing, detect named entities and
offer to create codex entries — never silently, always as a reviewable list.
This pairs with the manuscript import work already on the backlog.

### 3c. Pacing and structure visualization

NovelCrafter surfaces chapter-level data that reveals pacing problems; reviewers
list it as a genuine strength. We compute per-chapter word counts and prose
metrics already, so the data exists — it just isn't drawn.

---

## 4. What the category has not solved at all

Worth knowing because these are where a small app can leapfrog rather than catch up.

- **Continuity across 30+ chapters.** Named as one of the three hard problems in
  fiction AI. Nothing on the market does it well. Our vault graph — links,
  backlinks, per-note frontmatter — is a better substrate for this than a chat
  window, because the relationships are already structured data rather than
  something the model has to re-infer every call.
- **Voice consistency.** Chapter 28 should sound like whoever wrote chapter 2.
  Sudowrite's prose is criticized as too polished and writerly — elegant
  sentences that don't say much. Our prose analysis (echo detection, glue index,
  readability) is aimed at exactly this and could be turned into a
  drift-over-time view.
- **"The AI couldn't see my document."** A recurring first-hour failure in
  NovelCrafter: context must be attached manually and it isn't obvious. Our
  assistant should never require the writer to attach the manuscript. If a
  chapter is open, it's context. Full stop.

---

## 5. What type.ai gets right that we should copy

type.ai is the tool a reviewer picked *over* NovelCrafter, and the reason was
not features — it was friction. Their words: minutes to first useful output.

The praise is consistent and it's all about restraint:

- It reads the document automatically; no configuration step.
- It feels like a writing tool first and an AI assistant second.
- The interface is clean; there is no wall of panels on first open.

The lesson for us is a caution. We are building NovelCrafter's feature depth
*plus* ProWritingAid's analysis *plus* draggable panels. That is precisely the
combination that produced the complaint about buttons everywhere and terminology
nobody explained. **Depth is fine if the first ten minutes are quiet.** Defaults
should hide power, not display it.

Concretely: first run should open one manuscript pane with a cursor in it. The
codex, inspector, board, analysis, and plugin surfaces should all be one
deliberate click away — present, discoverable, not pre-opened.

---

## 6. Pricing read

NovelCrafter runs $4 (no AI) / $8 / $14 / $20 per month, plus token costs. The
recurring complaint is not the price, it's the *surprise*.

Against that, the $10/month plan you picked is well placed — but the real
weapon is that Novella's free tier is genuinely usable at $0 total, because a
local model has no marginal cost. That's not a trial. That's the product.
The paid tier should sell sync, backup, and hosted models — convenience — not
unlock basic writing.

---

## Recommended build order

1. ~~**Revision history**~~ — **built.** Snapshots before the assistant writes
   and on every save, stored in `.novella/history/` so they travel with the
   project. Paragraph-level diff, and restoring is itself undoable.
2. **Manuscript import + codex auto-extraction** — kills the chicken-and-egg
   problem and is a feature nobody else has.
3. **Quiet first-run defaults** — cheap to do, addresses the #1 usability
   complaint about the exact kind of app we're building.
4. **Pacing visualization** — data already exists, only needs drawing.
5. **Continuity checking** — the category's unsolved problem; our graph is the
   right foundation.

---

---

# Round 2 — how the broader field is structured

A second, wider pass: Scrivener, Dabble, Atticus, Ulysses, Campfire, World
Anvil, Novlr. Less about AI, more about how writing software is *shaped* — the
"face" of the thing. Sources appended below.

## What the structural tools teach

**Scrivener** is the respected elephant: an unmatched binder + corkboard +
outliner, and the universal complaint is the learning curve — "more Photoshop
than Canva." Reviewers love the depth and resent the time tax. This is the same
warning type.ai gave us: power is fine, a steep first hour is not.

**Dabble** wins novelists on one feature above all: the **Plot Grid** — columns
are plot lines and subplots, cards are plot points, and the leftmost column
*is* the manuscript's scene order. Scenes drag-and-drop to reorder, and moving a
scene offers to bring its plot points along. It's Scrivener's corkboard made
approachable, and it's the single most-praised structural idea in the category.
Our corkboard is a single lane; a multi-column grid where one column is the
chapter order and the others are subplots/threads is the natural evolution.

**Atticus** is the counter-example: a flat chapter list, no binder, no board —
and people still pick it, for formatting and a one-time price. Lesson: not
everyone wants depth. A quiet default matters (see finding #5, now built as
focus mode's sibling).

**Campfire / World Anvil** are the worldbuilding maximalists. Campfire's loved
feature is the **character relationship web** — a visual graph of who knows,
loves, and betrays whom. We already compute a relationship graph in the vault
engine (`graph()`), and we already have links and backlinks; drawing that graph
is low-effort, high-delight, and nobody in the *writing*-first tools does it
well. World Anvil's lesson is inverted — its dozens of RPG article templates
overwhelm novelists, and reviewers steer writers to Campfire for exactly that
reason. Restraint again.

## The motivational loop — built this round

Every writing-first tool (Dabble, Novlr, Scrivener, WriteO) ships the same
beloved trio and reviewers single it out every time:

- a **daily word goal**,
- a **streak** that grows each day you hit it,
- **words-written-today**, live,
- and a **focus / distraction-free mode** that collapses everything to the page.

This was the clearest "face of the software" gap and it is now built:

- Session tracking counts **net** words per day (an editing day still counts —
  a tool that only rewards padding trains the wrong habit).
- A titlebar goal ring fills as you write, with a streak flame.
- A 30-day bar chart and streak/best stats live in Settings.
- Focus mode (Ctrl+Shift+F, Esc to leave) hides every panel and centers the
  text. Remembered across sessions.
- It finally consumes `profile.dailyGoal`, which had been defined but unused.

## Also built this round

- **Manuscript import** (finding #2). Reads `.docx` (via the `fflate` we already
  ship — no new dependency), `.md`, and `.txt`; splits into chapters by heading
  style, centered titles, or "Chapter N" text; appends cleanly after any
  existing chapters.
- **Codex auto-extraction** (finding #2, the flagship). Reads the imported prose
  and proposes characters and locations already named in it — the thing the
  competition makes you re-type by hand. Pure heuristics (no model, works
  offline): sentence-start filtering kills the false positives, dialogue tags
  and titles classify people, place suffixes and prepositions classify
  locations, and short forms fold into full names as aliases ("Mira" →
  "Mira Vance") so the vault's link resolver finds them. Zero false positives
  and zero misses on a deliberately adversarial test passage. Nothing is written
  without the writer ticking it.

## Still ahead (updated build order)

1. ~~**Dabble-style plot grid**~~ — **built.** A "Grid" layout inside the Board
   view (Cards stays the default): rows are chapters in order, columns are plot
   threads, cells hold plot points. Dragging a chapter reorders the book and its
   plot points ride along, because they live in the chapter's own frontmatter.
   Thread definitions travel in `.novella/plot.json`; the columns self-heal from
   chapter frontmatter if that config is ever lost.
2. **Relationship graph view** — the engine already computes it; Campfire proves
   writers love seeing it; draw it.
3. **Quiet first-run defaults** (finding #5) — still the cheapest usability win.
4. **Pacing visualization** (finding #3c).
5. **Continuity checking** (finding #4) — the category's unsolved problem.

---

# Round 4 — the Notion direction

Driven by the user's screenshots and screen recording: the "Ultimate Writer
Planner" Notion-template ads (candlelit library aesthetic, playlist parked
beside the manuscript, worldbuilding wiki whose entries are QUESTIONS, weekly
planner, checklists everywhere). A follow-up search confirmed what writers
actually use Notion for: the tracking layer around the writing — tasks,
revision checklists, dashboards — while the interconnected-database part is
exactly what Novella's codex already is.

Built from this round:

- **Task lists everywhere** — `- [ ]` in any note renders as a clickable
  checkbox in the editor; a Tasks tab aggregates every to-do across the
  project; board cards show progress chips. Plain Markdown, one parser.
- **Music dock** — paste any Spotify / YouTube / SoundCloud / Apple Music
  link (playlist, album, track, stream) and it plays in a floating dock that
  survives switching views. Per-project (`.novella/music.json`), four curated
  stations, no API keys — the platforms' own embeds.
- **Weekly planner** — Mon–Sun intents beside what actually happened (words,
  goal met), the ad's planner without the spreadsheet cosplay.
- **Quick-create (+)** — name it, pick chapter/scene/character/location/note,
  it exists and is open. Notion's fastest habit.
- **Project presets** — Novel / Series bible / Short story / Blank. Character
  sheets ask questions ("What would they never forgive?") instead of offering
  empty fields, stolen directly from what made the ad's wiki look alive.
- **Web persistence** — projects in the browser now live in IndexedDB:
  create, write, reload, everything keeps. Boot resumes the last open project
  on desktop and web both.

The 21-AI-tools graphic was evaluated and mostly declined: it's a marketing
stack (Zapier, Canva, website builders) irrelevant to a local-first writing
app. ProWritingAid-style analysis already exists in the Critique tab; the
text-to-image tools are the one interesting idea (cover art generation) and
belong later as an optional AI-provider plugin, not a dependency.

## Sources

- [Novelcrafter Review: Powerful for Fiction Writers, Frustrating to Set Up (April 2026)](https://ilampadmanabhan.medium.com/novelcrafter-review-powerful-for-fiction-writers-frustrating-to-set-up-april-2026-64d391c629a2)
- [Kindlepreneur — Novelcrafter Review](https://kindlepreneur.com/novelcrafter-review/)
- [Type.ai Review — My Top Pick After Testing Three AI Writing Tools](https://ilampadmanabhan.medium.com/type-ai-review-my-top-pick-after-testing-three-ai-writing-tools-april-2026-719f59c68dbb)
- [Sudowrite vs Novelcrafter](https://ilampadmanabhan.medium.com/sudowrite-vs-novelcrafter-bdc3f33ba95f)
- [G2 — Type.ai pros and cons](https://www.g2.com/products/type-ai/reviews?qs=pros-and-cons)
- [Novelcrafter Revision History docs](https://docs.novelcrafter.com/en/articles/8677729-revision-history)
- [InkfluenceAI — Best AI for Novel Continuity Checking (2026)](https://www.inkfluenceai.com/blog/best-ai-novel-continuity-checking-2026)
- [Best AI for Novelists 2026 guide](https://sudowrite.com/blog/best-ai-for-novelists-the-no-bs-2026-guide/)

### Round 2

- [Writing Software Compared: Scrivener vs Atticus vs Dabble vs Ulysses (2026)](https://www.laterpress.com/comparisons/writing-software-compared/)
- [Dabble vs Scrivener — Reedsy](https://reedsy.com/studio/resources/dabble-vs-scrivener)
- [Exploring Dabble's Plot Grid](https://help.dabblewriter.com/writing-your-novel/plotting/exploring-dabbles-plot-grid)
- [Campfire vs World Anvil — Kindlepreneur](https://kindlepreneur.com/campfire-vs-world-anvil/)
- [Campfire Write Review — Kindlepreneur](https://kindlepreneur.com/campfire-write-review/)
- [The 10 Best Distraction-Free Writing Apps of 2026](https://selfpublishing.com/distraction-free-writing-apps/)
- [Novlr — the creative writing workspace](https://www.novlr.org/)

---

# Round 6 — Notion, properly

How Notion actually works, and why people leave it. Sources: [ClickUp's Notion review](https://clickup.com/learn/topic/productivity/tools/notion/), [eesel's review](https://www.eesel.ai/blog/notion-review), [why-users-abandon pieces](https://medium.com/@ruslansmelniks/why-users-abandon-notion-complexity-limitations-and-the-rise-of-ai-alternatives-cba91a95b535), [XDA on leaving Notion](https://www.xda-developers.com/finally-understand-why-people-leave-notion/).

**What makes Notion Notion** — blocks (everything is a movable block), slash
commands (`/` inserts anything), and one dataset with many views (the same
database as table, kanban, gallery, calendar, timeline). Templates mean no
blank page. These are the interactions worth absorbing, writer-shaped:
slash commands in the editor, Table/Timeline views of the manuscript,
Alt+arrow paragraph moves.

**Why people quit it** — the tax: workspaces slow down as they grow, no true
offline mode, weak mobile, notes buried five layers deep, and export/lock-in
pain. Every one of these is a Novella strength by construction (local files,
measured-fast at 118 notes, flat structure, plain Markdown). These become
standing guardrails in ROADMAP.md, not one-off features.
