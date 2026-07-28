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

---

# Round 7 — sweep of NovelCrafter, Sudowrite, Dabble, Scrivener, Campfire,
type.ai, Obsidian-for-writers, Notion novel templates

A no-code research pass, autopilot run 2026-07-24. "Next up" had thinned to
2 buildable items, which is exactly the signal to research instead of build.

## Confirmed strengths — nothing to build, just say it louder

Checked our own export code (`src/export/formats.ts`) against Sudowrite's
stated gap before writing this: **Sudowrite ships no PDF, EPUB, or DOCX
export** — reviewers call it out by name, "requiring writers to stitch
together separate tools for everything else." Novella already exports
Markdown, DOCX, and EPUB (`formats.ts`) plus a print-quality PDF (round 4)
plus one-click full-project backup. This is a real, checkable advantage and
the export modal / first-run copy doesn't currently say so. Cheap win, low
priority.

Scrivener reviews in 2026 still center on the same two complaints as every
prior round: a fragile Dropbox/iCloud cross-device sync ("close it on one
device before opening it on another" — a workflow that "shouldn't require
conscious attention in 2026") and a compile system that broke EPUB export
for months without a fix. Reinforces that PLAN-sync.md is the single highest-
leverage blocked item on the roadmap, not a nice-to-have — nothing new to
add here, it's already flagged NEEDS OWNER.

## New gaps worth building

**1. Inline comments / margin notes on manuscript text — genuinely missing.**
Dabble's Premium tier and Notion's comment threads both lean on this, and
it's the default way a writer incorporates beta-reader or critique-partner
feedback. We searched the codebase (`comment`/`annotation` matches) and
found nothing that attaches a note to a text range — only the unrelated
"comment" fields inside agent prompts and imported-docx comment stripping.
Right now a Novella user round-trips through Google Docs for this. Attach a
note to a selection without touching prose, show it in a margin gutter,
resolve/reply. Directly collapses one more reason to leave the app.

**2. Location map / pinboard — Campfire's headline feature, and reviewers
rate Campfire 4/5 specifically for it.** Interactive maps + custom languages
+ timeline management, all linked back into the manuscript, is what fantasy/
sci-fi authors cite as Campfire's edge over general tools. We already have
Relationship web (people-to-people); a lighter version — pin codex
locations onto an uploaded map image — is the worldbuilding-genre equivalent
and reuses the card-image upload path already shipped for board cards.

**3. Grammar/spelling, flagged not committed.** Dabble Premium
(ProWritingAid) and type.ai both lean on live grammar checking; our Critique
tab covers *style* habits (adverbs, passive voice, echoes) but not spelling/
grammar mechanics. Before building anything: check whether CodeMirror's
`contenteditable` surface already gets the browser's/webview's native
spellcheck for free — if so this may be a documentation gap, not a code
gap. Genuinely offline grammar checking (not style linting) is a much bigger
build (bundled dictionary, MB cost) that cuts against the lightweight-
installer promise, so this needs a scoping pass before it's a committed item.

## Competitive landscape notes (no action)

Obsidian-for-writers is a real alternative some serious writers already use
for free via plugins (Longform for scene ordering + export stitching, Novel
Word Count, StoryLine for full book-planning-in-a-vault). It's not a
product, it's a plugin stack a writer has to assemble and maintain — the
zero-setup, works-on-first-launch positioning still holds against it and is
worth keeping in first-run copy.

Notion novel templates (Scriborg, World Building Bible, Modern Writer) are
converging on the same shape we're already building toward in the
Notion-parity item: interconnected databases (character/location/timeline)
with multiple views of the same data. Nothing new to add beyond what's
already tracked there.

---

# Round 8 — sweep of NovelCrafter, Sudowrite, Dabble, Scrivener, Campfire,
type.ai, Obsidian-for-writers, Notion novel templates

Autopilot run 2026-07-25, one day after round 7. Deliberately searched for
angles round 7 hadn't already covered — new feature detail, subscription
economics, and one significant industry event — rather than re-confirming
the same reviews.

## New build item: NovelCrafter's Matrix view

NovelCrafter's planning surface ships three views — Grid (cards), Matrix,
and Outline. The Matrix is described repeatedly as the most powerful of the
three: a spreadsheet where rows are scenes/chapters and columns are
metadata (POV, subplot, summary, and more), with **single-click POV
reassignment** — select a new POV character from a dropdown on the cell
itself, no need to open the scene.

Checked our own code before writing this up: we already have every piece
of underlying data. `pov` lives in chapter frontmatter (used by the
Continuity inspector's "unknown POV" check), and `plot.json` already
tracks subplot threads as columns in PlotGrid.tsx (the Dabble Plot Grid
work from round 2). But grepping every place `pov` renders
(`Corkboard.tsx:494-599`, `PlotGrid.tsx:295-321`) shows it is *display-only*
in both — a text label next to a character-type dot, never an editable
field. Nothing today lets a writer reassign a scene's POV, or a batch of
scenes' POV, without opening each note and editing frontmatter by hand.

This is a genuine, checkable gap, not a guess, and it's cheap relative to
the payoff: the data model doesn't need to change, only a new
spreadsheet-shaped view (or an edit affordance added to the existing Table
board layout) that makes `pov` and subplot-thread membership inline-editable
across many scenes at once. Filed as an addition to the ongoing
NovelCrafter-parity item rather than a new line, since it's the same kind
of gap-closing work.

## Landscape notes (confirm the thesis, no new build item)

**Subscription stacking is now a named complaint, not just an inference.**
Multiple 2026 "best writing software" roundups now call out the *combination*
of tools directly: "Scrivener + NovelCrafter + ProWritingAid adds up very
fast," and note that "most productive fiction authors use 2-3 tools
together... there is no universal best book writing app." This is the
clearest third-party confirmation yet of Novella's founding thesis (writers
run 3-4 apps because no one app does the whole job) — worth quoting in
future marketing copy rather than building anything new from it.

**NaNoWriMo's nonprofit shut down in 2025** (reported through mid-2026):
after a six-year decline in participation, compounded by board resignations
over the org's pro-AI-writing stance and complaints about forum moderation
safety for teen writers, the organization closed and its website went
offline — writers reported losing data with no warning. This matters for
Novella's audience, not its code: a large population of sprint-and-goal-
driven novelists (NaNoWriMo's whole culture was daily word counts and
community accountability) lost their home in the same period Novella
shipped Writing sprints, streaks, and daily goals. No action item — the
features already exist — but it's a relevant fact for whoever writes
outward-facing copy or picks launch communities (r/NaNoWriMo refugees,
Discord successor communities).

**Campfire prices per module**, not as one subscription: 18 separate
modules (Manuscript, Characters, Maps, Timelines, Languages, etc.), each
billed monthly/annually/lifetime on its own. Reviews frame this as
flexible ("pay only for what you use"), but it's also the nickel-and-dime
pattern Novella's flat local-install pricing stands against — reinforces
the existing pricing thesis in Round 1 rather than adding to it.

**Sudowrite's Muse model** is a genuine step up per 2026 reviews — "the
first one that's actually felt useful for drafting fiction" — but the tool
is still scored 3/5 overall because of what it doesn't do: no PDF/EPUB/DOCX
export (confirms round 7's finding), no book-cover designer, no audiobook
creation, no non-fiction templates. Book-cover generation and audiobook
narration both require bundling image/TTS models we don't ship and are
outside the writing-and-task-managing thesis as scoped today — noted for
awareness, not filed as a build item; would need its own scoping
discussion if ever pursued.

**Scrivener** has no Scrivener 4 yet — as of 2026 the company is still
maintaining Scrivener 3.5 (a macOS 26 Tahoe compatibility update shipped),
with forum mentions of an unrelated "new writing app" in beta that may
eventually backport features. Nothing new to act on.

**Obsidian-for-writers setups** converge on a specific four-plugin
recommendation across multiple guides: Longform (manuscript structure +
compile), Kanban (plotting board), Templater (character-sheet templates),
Word Count (status-bar tracking) — "install these four and ignore
everything else for a month." Reinforces round 7's finding that Obsidian
is a plugin stack a writer has to assemble and maintain, not a product;
still worth keeping "works on first launch, nothing to install" in
first-run copy.

**Notion's performance cliff is now a specific number**: reviews cite
"performance drops noticeably with databases over 5,000 records." Useful
as a concrete target if the standing FAST guardrail (round 6) ever needs a
stress-test number to benchmark against — no action needed now, since true
board virtualization is already deferred in ROADMAP.md until real projects
pass ~300 chapters, well short of where Notion's data suggests trouble
starts.

### Round 8 sources

- [Novelcrafter Review — jenova.ai (April 2026)](https://www.jenova.ai/en/resources/novelcrafter)
- [Novelcrafter Review — DreamGen](https://dreamgen.com/blog/articles/novelcrafter-review)
- [Novelcrafter — Planning with the Matrix](https://www.novelcrafter.com/help/docs/plan/planning-with-the-matrix)
- [Novelcrafter — Plan Views](https://www.novelcrafter.com/help/docs/plan/plan-views)
- [Sudowrite Review 2026 — CyberNews](https://cybernews.com/ai-tools/sudowrite-review/)
- [Sudowrite Review 2026 — Built&Written](https://www.builtwritten.com/blog/sudowrite-ai-2026)
- [Dabble Writer Review — Kindlepreneur](https://kindlepreneur.com/dabble-writer/)
- [Dabble Writer, Inc. — Trustpilot reviews](https://ca.trustpilot.com/review/dabblewriter.com)
- [Scrivener 4 — Everything You Want to Know So Far — WPS](https://www.wps.com/blog/scrivener-4-everything-you-want-to-know-so-far/)
- [Scrivener 4? — Literature & Latte Forums](https://forum.literatureandlatte.com/t/scrivener-4/138792)
- [Campfire Writing Review 2026 — aitoolscoop](https://aitoolscoop.com/tool/campfire-writing/)
- [Campfire's Writing Apps pricing](https://www.campfirewriting.com/apps)
- [Notion review 2026 — eesel AI](https://www.eesel.ai/blog/notion-review)
- [I would never try writing a novel in Obsidian without these 5 plugins — XDA](https://www.xda-developers.com/would-never-try-writing-novel-in-obsidian-without-these-plugins/)
- [Obsidian for Fiction Writers: Setup, Plugins, and Workflow — Loreteller](https://loreteller.com/learn/obsidian-fiction-writers-guide/)
- [Best Writing Apps for Authors (2026) — NowNovel](https://nownovel.com/best-writing-apps/)
- [Best Writing Tools for Fiction Authors (2026) — Laterpress](https://www.laterpress.com/craft-of-writing/best-ai-writing-tools-for-fiction/)
- [NaNoWriMo Nonprofit Shutters — Publishers Weekly](https://www.publishersweekly.com/pw/by-topic/industry-news/publisher-news/article/97466-nanowrimo-nonprofit-shutters.html)
- [NaNoWriMo Is Closing Down After Two Decades — Self-Publishing Advice](https://selfpublishingadvice.org/nanowrimo-is-closing-down/)
- [NaNoWriMo is shutting down — Literary Hub](https://lithub.com/nanowrimo-is-shutting-down/)
- [NaNoWriMo Alternatives 2026: The Best Tools and Communities After the Shutdown — CipherWrite](https://cipherwrite.com/blog/nanowrimo-alternatives-2026)

---

---

# Round 9 — sweep of NovelCrafter, Sudowrite, Dabble, Scrivener, Campfire,
type.ai, Obsidian-for-writers, Notion novel templates

Autopilot run 2026-07-26. Rounds 7 and 8 had exhausted the feature-comparison
angle for now, so this pass deliberately went wider — author sentiment and
industry surveys, not just tool-by-tool feature lists — looking for what
round 8 hadn't already covered.

## New finding: the AI-training-consent anxiety is now measured, and it's a Novella advantage nobody is saying out loud

A 2026 Authorlytica survey, cited across several fresh privacy-focused
writing-tool roundups, puts numbers on something previous rounds only had
anecdotally: **96% of authors believe their consent should be required
before their work is used to train an AI model, and 52% say they will
refuse to use a specific AI tool outright over training-data concerns.**
Separately, cloud tools are drawing a harder look this year — writers are
described as moving off Google Docs specifically over "anxiety about how
cloud data and AI training intersect." A new sub-genre of buying guide has
appeared as a direct result: "Best AI Book Writing Tools for Authors Who
Care About Privacy," which grades tools on whether they train on
manuscripts and how buried the opt-out is (one piece flags Google's own
settings as "five layers deep" to turn off).

Checked what NovelCrafter and Sudowrite actually offer here before writing
this up: NovelCrafter's BYOK model means the *provider's* API terms govern
training (enterprise API tiers typically don't train by default, but that's
a promise from Anthropic/OpenAI, not from NovelCrafter, and a writer has to
know to check it). Sudowrite's own training/privacy stance wasn't clearly
documented in what's public — the review sites could only speak to general
data collection (contact info, usage, diagnostics), not manuscript-specific
training policy.

**Where Novella stands:** this question doesn't have an asterisk for us —
it doesn't apply. A local Ollama model never transmits the manuscript
anywhere, so there is no training pipeline to opt out of, no provider terms
to trust, no policy page to go read. Checked our own first-run copy
(`FirstRunWizard.tsx`) before filing this: it already says "free, private,
nothing leaves the machine" at the AI-setup step and "no accounts and no
server" at the pen-name step — true and in the right direction, but neither
line says the word a worried author is actually searching for: *training*.
Given 52% of authors say they'll walk away from a tool over exactly this,
naming it explicitly (in first-run copy and SECURITY.md) is a cheap,
truthful, high-leverage line to add. Filed in "Next up" above the two
existing copy items (export, performance) since the evidence behind it is a
stated reason authors *refuse* a tool, not just a comparison point.

## Landscape notes (confirm existing findings, no new build item)

**Sudowrite's AI-generated manuscript review is itself unreliable** — 2026
reviews report it "missed major plot points" and gave feedback that
signaled the story wasn't read carefully. This is a useful data point
against a *probabilistic* review feature in general, not just Sudowrite's
implementation, and it retroactively validates the design choice already
made for Novella's Continuity inspector: deterministic checks only (early
mentions, duplicate names, dangling links, unordered chapters, unknown
POV), each one provable and click-through-able, rather than an LLM
summarizing the whole manuscript and occasionally missing a plot point with
total confidence. No action — noting it because it's evidence the existing
design choice was right, not a guess.

**NovelCrafter's BYOK friction is still the single most-repeated complaint**
in every fresh 2026 review pulled this round — this is the fourth research
round in a row to find the same thing restated. No new action; round 1's
finding stands and doesn't need re-confirming again next time unless
NovelCrafter actually changes the model.

**Dabble's aggregate rating has drifted down to 2.5/5** in 2026 roundups,
with the specific knock being that writers "outgrow it" for lack of
advanced export/formatting and end up needing a second tool for production
— the same gap already identified against Sudowrite and already a Novella
strength (`src/export/formats.ts` ships Markdown/DOCX/EPUB/PDF/backup).
Reinforces the existing "say the export advantage louder" item rather than
adding a new one.

**New entrants surfaced this round** (Scribeist, ShyEditor, Novel Factory,
NovelistAI) are worth naming for awareness but none surfaced a concrete
feature gap from the search snippets available — Scribeist's headline pitch
("AI that doesn't need to be briefed from scratch every session") is
exactly round 1 finding #4, which Novella already satisfies structurally
(an open chapter is always context, nothing to attach). No action; worth a
closer look in a future round if any of them gain visible traction.

**Obsidian-for-writers has converged on a specific four-plugin stack**
(Longform, Kanban, Templater, Word Count) repeated across multiple 2026
guides as "install these four and ignore everything else" — reinforces
round 8's finding almost verbatim; still a plugin stack to assemble and
maintain, not a product. No new action.

## Sources

- [Best AI Book Writing Tools for Authors Who Care About Privacy — Storyloft](https://storyloft.app/best-ai-book-writing-tools-for-authors-who-care-about-privacy/)
- [What Makes an AI Writing Tool Safe for Authors? — Storyloft](https://storyloft.app/what-makes-an-ai-writing-tool-safe-for-authors-privacy-training-and-manuscript-control-explained/)
- [Are AI Writing Tools Stealing Your Work? A 2026 Privacy Audit — CipherWrite](https://cipherwrite.com/blog/are-ai-writing-tools-stealing-your-work-2026)
- [Best Local AI Tools for Writers (2026) — LocalAlternative](https://www.localalternative.io/for/writers)
- [How Authors Are Fighting Back Against AI Training — ISBNDB Blog](https://isbndb.com/blog/ai-training-data-poisoning/)
- [Sudowrite vs Novelcrafter — TechDictionary](https://techdictionary.io/sudowrite-vs-novelcrafter/)
- [Sudowrite Review: I Tested It on a 40,000-Word Manuscript (April 2026)](https://ilampadmanabhan.medium.com/sudowrite-review-i-tested-it-on-a-40-000-word-manuscript-heres-my-honest-verdict-april-2026-951b674dccea)
- [Novelcrafter Review — jenova.ai (April 2026)](https://www.jenova.ai/en/resources/novelcrafter)
- [Dabble Review: What Authors Should Know in 2026 — Reedsy](https://reedsy.com/studio/resources/dabble-writing-review/)
- [Dabble Writer Review 2026 — Knowara](https://knowara.com/ai-tools/writing/dabble-writer-review/)
- [19 Best Novel Writing Software Compared (2026) — Noveling Guide](https://noveling.dev/guide/en/blog/novel-writing-software-comparison-2026/)
- [Best AI for Writing Fiction 2026 — mylifenote.ai](https://blog.mylifenote.ai/the-11-best-ai-tools-for-writing-fiction-in-2026/)
- [The Best AI Writing System for 2026 — SidekickWriter](https://www.sidekickwriter.com/blog/ai-writing-system-comparison-2026)
- [I would never try writing a novel in Obsidian without these 5 plugins — XDA](https://www.xda-developers.com/would-never-try-writing-novel-in-obsidian-without-these-plugins/)
- [The 28 Best Notion Templates for Writers in 2026 — Gridfiti](https://gridfiti.com/notion-templates-for-writers/)
- [The 12 Best Notion Alternatives for Writers and Storytellers (2026) — Storyflow](https://storyflow.so/blog/best-notion-alternatives-writers-2026)

---

### Round 7 sources

- [Novelcrafter Review — Frustrating to Set Up (April 2026)](https://ilampadmanabhan.medium.com/novelcrafter-review-powerful-for-fiction-writers-frustrating-to-set-up-april-2026-64d391c629a2)
- [Sudowrite Review — DreamGen](https://dreamgen.com/blog/articles/sudowrite-review)
- [Sudowrite Review — no PDF/EPUB/DOCX export noted](https://aiunpacker.com/blog/sudowrite-review-the-ai-writing-tool-fiction-authors-actually-use)
- [Dabble Writer Review 2026 — tier breakdown](https://knowara.com/ai-tools/writing/dabble-writer-review/)
- [Scrivener 2026 Review — sync and compile complaints](https://elephas.app/blog/scrivener-review)
- [Best Scrivener Alternatives 2026 — Storyflow](https://storyflow.so/blog/best-scrivener-alternatives-2026)
- [Campfire Writing Review — 4-star, maps/languages/timelines](https://aitoolscoop.com/tool/campfire-writing/)
- [Type.ai Review — dedicated writing tool first, AI second](https://ilampadmanabhan.medium.com/type-ai-review-719f59c68dbb)
- [Obsidian plugins tagged #writing](https://www.obsidianstats.com/tags/writing)
- [Longform plugin thread — Obsidian Forum](https://forum.obsidian.md/t/plugin-storyline-obsidian-plugin-for-writers/111494)

---

# Round 10 — sweep of NovelCrafter, Sudowrite, Scrivener, Dabble, Campfire,
type.ai, Obsidian-for-writers, Notion novel templates

Autopilot run 2026-07-27, one day after round 9. Deliberately hunted for
angles the last three rounds hadn't already covered — a new visual feature,
a new complaint category, and a check of our own optional cloud-AI code
against fresh model news — rather than re-running the same searches.

## New finding: Campfire's Timeline + Arcs modules are a real, unbuilt gap

Campfire's Timeline module plots events, scenes, and character appearances
along one or more horizontal timelines, explicitly aimed at books with dual
timelines or multiple POV threads whose story-internal order diverges from
manuscript order — a writer can hold "what happened when" separate from
"what chapter it's in." Its Arcs module links the same events to individual
character-development arcs so a writer can see a character's arc plotted
against the timeline, not just against chapter order. Both are singled out
in 2026 reviews as reasons genre (esp. fantasy/sci-fi, multi-POV) writers
pick Campfire.

Checked before writing this up: grepped the codebase for "timeline" and
found nothing — the only two hits are an example prompt for the built-in
Continuity sentinel agent ("timelines that don't add up") and an unrelated
line of seed placeholder text ("Check every compass mention against the map
timeline"). No feature exists. This pairs with the still-unbuilt
location-map item (round 7) as the second Campfire headline feature we
lack, and it's also a stronger version of what the Continuity inspector
already half-does: its "unordered chapters" check only knows manuscript
order, so a flashback chapter or a second POV thread that's supposed to run
concurrently with chapter 3 reads as "out of order" when it isn't. A
lightweight in-world date field on scenes plus a horizontal-timeline view
would fix both the feature gap and that false-positive class in Continuity.
Filed below the location map (bigger surface — needs a new scene field, not
just reusing the existing image-upload path) but for the same audience.

## New finding: Sudowrite's loudest complaint has shifted from price to credits running out

Earlier rounds tracked NovelCrafter's BYOK cost surprise ($24–44/month once
API usage is added) and Sudowrite's flat $29–59/month price. This round's
reviews surface a sharper, more specific pain: credits "run out faster than
expected," named explicitly against the new Muse model, which writers now
have to budget and ration mid-manuscript rather than just pay for once a
month. That's a different anxiety than price — it's the fear of hitting a
wall mid-scene, not knowing in advance how far a subscription will
stretch. A local Ollama model has no credit system to run dry: generation
is bounded only by what the writer's own machine can compute, at any hour,
forever. Filed as a fourth, distinct copy item alongside the existing
no-API-key, no-training, export, and performance items — cheap to say,
and evidenced by a complaint pattern none of the earlier rounds had yet.

## New finding: we're underselling our own optional Claude Fable 5 model

Not a competitor gap — a self-check prompted by 2026 coverage of Claude
Fable 5 as Anthropic's purpose-built creative-writing model, reported to
top benchmarks specifically for prose voice, subtext, and character work
(as distinct from general coding/reasoning benchmarks). Novella already
ships an optional Anthropic provider (`src/plugins/providers/anthropic.ts`)
for writers who opt into cloud AI, and its model catalog
(`src/ai/models.ts`) already lists Fable 5 — but the blurb reads "Most
capable, most expensive. For the hardest work," which describes it as a
generic expensive flagship and never mentions the one thing that actually
matters to a writer choosing a model in a writing app: it's the model
built for prose, not just the priciest one. One-line fix, filed as a cheap
copy item. This sits entirely inside the optional cloud-AI path — it
doesn't touch the local-first default or the thesis, it just stops
underselling a real advantage to writers who do opt in.

## Landscape notes (confirm existing findings, no new build item)

**NovelCrafter's Chat-with-your-book and Codex templates are real and
already tracked.** Fresh reviews describe Chat as reviewers' "#1 way to
brainstorm and worldbuild," pulling in scenes/chapters/Codex entries as
context to ask about plot holes and consistency. This confirms rather than
adds to the existing NovelCrafter-parity item in "Next up" (chat-with-your-
book mode is already named there as a concrete gap) — no new bullet
needed, just evidence the priority is right.

**BetaReader.io and BetaBooks are dedicated paid products for exactly the
gap already at the top of "Next up."** Both exist solely to collect and
manage inline/chapter feedback from beta readers — sort by reader, chapter,
or keyword; turn comments into a revision to-do list. That an entire market
category exists around a feature Novella doesn't have yet is strong
external validation that "inline comments / margin notes" deserves its
current top-of-list priority. Not a reason to add a duplicate item, and a
reminder that if/when it's built, "resolve" and "turn into a to-do" (not
just "reply") are the parts reviewers say beta-reader workflows actually
need.

**Scrivener's sync complaints are unchanged for a second straight round** —
still Dropbox/iCloud, still "close it on one device before opening another"
to avoid conflict files, still no real-time collaboration. Reinforces
PLAN-sync.md's priority; nothing new to add until the product changes.

**Dabble confirmed at 2.5/5 for a second round**, same root cause (writers
"outgrow it" for lack of advanced export, need a second tool for
production) — already tracked against our export advantage.

**Campfire's per-module pricing confirmed for a second round** ($2/month
for just the manuscript editor up to $12/month for every module) — still
the inverse of Novella's flat local install, nothing new to add.

**Author Guild survey: 45% of published fiction writers now use AI tools**
in some part of their process, mostly for brainstorming (2025 survey, cited
in July 2026 roundups). Context on how normalized AI-assisted writing has
become — not a feature gap, no action.

**Type.ai and Obsidian's four-plugin stack (Longform, Kanban, Templater,
Word Count) are unchanged from prior rounds** — no new angle surfaced this
pass.

## Sources

- [Novelcrafter: Full Review, Pricing & Better Alternatives (April 2026) — jenova.ai](https://www.jenova.ai/en/resources/novelcrafter)
- [Novelcrafter Review (2026): Writing Plans, Codex & BYOK AI — Toolworthy](https://www.toolworthy.ai/tool/novelcrafter)
- [Sudowrite Review 2026 — Nerdynav](https://nerdynav.com/sudowrite-review/)
- [Muse by Sudowrite: Reviews, Features, Pricing — AIPure](https://aipure.ai/products/muse-by-sudowrite)
- [Sudowrite Review: Tested the $22/month AI across 70,000 words — UC Strategies](https://ucstrategies.com/news/sudowrite-review-i-tested-the-22-month-ai-against-chatgpt-across-70000-words/)
- [Scrivener Review 2026 — All About AI](https://www.allaboutai.com/ai-reviews/scrivener/)
- [Scrivener Review (2026) — Elephas](https://elephas.app/blog/scrivener-review)
- [Dabble Writer Review: Features, Pros & Cons for 2026 — Automateed](https://www.automateed.com/dabble-writer)
- [Dabble Review: What Authors Should Know in 2026 — Reedsy](https://reedsy.com/studio/resources/dabble-writing-review/)
- [Campfire Writing Review: The 17 Modules Explained — selfpublishing.com](https://selfpublishing.com/campfire-writing-review/)
- [Timeline Module Tutorial — Campfire](https://campfirewriting.com/learn/timeline-tutorial)
- [Multi-Purpose Timeline Maker for Authors — Campfire](https://campfirewriting.com/timeline-maker)
- [Type.ai Review: My Top Pick After Testing Three AI Writing Tools (April 2026)](https://ilampadmanabhan.medium.com/type-ai-review-719f59c68dbb)
- [Essential Obsidian Plugins for Writers — practicalpkm.com](https://practicalpkm.com/essential-obsidian-plugins-for-writers/)
- [Obsidian for Fiction Writers: Setup, Plugins, and Workflow — Loreteller](https://loreteller.com/learn/obsidian-fiction-writers-guide/)
- [The 28 Best Notion Templates for Writers in 2026 — Gridfiti](https://gridfiti.com/notion-templates-for-writers/)
- [BetaReader.io - Features & Pricing (July 2026)](https://www.saasworthy.com/product/betareader-io)
- [BetaBooks: Reader management software for authors](https://www.betabooks.co/)
- [Beta Reader Feedback: Turning Notes Into a Revision Plan](https://www.webproworld.com/creative-writing/beta-reader-feedback-turning-notes-into-a-revision-plan-1/)
- [Best AI for Creative Writing July 2026: Claude Fable 5, GPT-5.5 and Top 10 — buildmvpfast.com](https://www.buildmvpfast.com/articles/best-llms-2026-guide/creative-writing-ai)
- [Are Fictionbots Triumphing Over Writers? — Mind Matters](https://mindmatters.ai/2026/07/are-fictionbots-triumphing-over-writers/)
- [28 Best Notion Templates for Writers in 2026 — Gridfiti](https://gridfiti.com/notion-templates-for-writers/)

# Round 11 — sweep of NovelCrafter, Sudowrite, Dabble, Scrivener, Campfire,
type.ai, Obsidian-for-writers, Notion novel templates, and a new
"local-first AI novel writing" category search

Autopilot run 2026-07-28, one day after round 10. Widened the last search of
the round beyond the usual named competitors to "local-first / no-subscription
novel writing software" specifically, since that phrase is Novella's own
positioning — worth checking whether anyone else has started using it too.
They have.

## Biggest finding: local-first, no-subscription AI novel writing is no longer just us

Three products now exist that describe themselves in almost the same words
Novella's thesis uses — "local AI," "zero cloud," "no subscription":

- **LocalProse** (Windows/macOS/Linux/Android/iOS) — local-model generation,
  an Idea Box of note post-its linked to chapters, Character/Location/Item
  profiles, a one-time lifetime license, and **LAN Continuity**: a phone app
  syncs to the desktop app directly over the writer's own WiFi, with no
  cloud server in the path at all (not even a Dropbox-style folder — a direct
  device-to-device protocol).
- **Novel Mage** (Windows/macOS) — free 7-day trial, Codex, story planner,
  character interviews, and "Writer's Voice": upload samples of the writer's
  own past prose and the model matches its output to that voice. Supports
  local Ollama/LM Studio or BYOK cloud, same dual-path choice Novella offers.
- **Noveling** (Windows/macOS/Linux) — free editor forever, AI gated behind
  prepaid credits (not a subscription) so there's no recurring bill and no
  training-data question tied to a subscription account; project templates
  for Novel/Non-fiction/Screenplay.

None of the three claim task management, a sprint timer, or a word-count/goal
system — they are novel-writing-plus-local-AI tools, not the four-app bundle
Novella's thesis targets. That distinction now matters more than it did a
round ago: "local AI, no subscription" by itself is measurably no longer a
differentiator unique to Novella — three funded/shipping competitors say the
same sentence on their landing pages. The thing that's still true only of
Novella, checked against all three: none of them fold in task management or
a sprint/focus timer, so the "one app instead of four" bet is now carrying
more of the differentiation weight than the "local, no subscription" half
was previously assumed to carry alone. Filed as a copy item below — lead
with the bundle, not just the local-AI half, now that the local-AI half is
common ground.

Also worth a note for whoever next revisits `PLAN-sync.md`: LocalProse's LAN
Continuity is a genuinely different fourth option from the three already
listed there (A: our own server, B: Supabase, C: user's own cloud-drive
folder) — direct phone-to-desktop sync over local WiFi, no account, no
cloud storage of any kind, not even a Dropbox folder. Worth weighing next to
option C when that plan is picked back up; not added to the plan file itself
this round since this is a research-only pass.

## New finding: "Writer's Voice"-style prose matching is a real gap in our own Assistant

Checked our own code before writing this up, since Novel Mage's marketing
claim ("matches your own voice") is exactly the kind of thing worth
verifying rather than assuming. `InspectorPane.tsx`'s "Upload style…"
control imports a `.txt`/`.md` file as the literal body of a new prompt note
— it expects the writer to have already written a *prompt template*
(with `{{prose}}`/`{{guidance}}` placeholders) describing the voice they
want. There's nothing that takes actual prose the writer already wrote —
three chapters of their own manuscript, say — and derives a style from it
the way Novel Mage's Writer's Voice does. Grepped for "style sample" and
"Writer's Voice" equivalents; nothing. This is a distinct, buildable gap
from the existing style-menu system (round 3), not a duplicate of it —
today's styles are hand-authored templates, never learned from the
writer's own words.

## New finding: NovelCrafter shipped a reasoning/thinking toggle we have no equivalent of

NovelCrafter's January 9, 2026 changelog entry opened "AI Thinking" support
to everyone: a per-request preference to have the model "prefer" or "avoid"
reasoning/thinking tokens, exposed across Scene Beats and Chats. This
matters more for a local-first tool than it does for NovelCrafter's
cloud-API model list, because several popular local Ollama models (the
DeepSeek-R1 family in particular) emit a visible "thinking" preamble before
the actual prose — slow and occasionally distracting when a writer just
wants a paragraph continued, useful when they're using Chat to work out a
plot problem. Grepped `src/ai` for "reasoning"/"thinking"; no matches — we
pass every request through identically regardless of model or task.
Genuine AI-UX gap, not copy.

## NovelCrafter's March 21, 2026 Codex update: two concrete, checkable gaps

Rolled out to everyone: entries can now belong to more than one custom
category at once, and an entry can be marked case-sensitive to cut down
false-positive text-matching (e.g. a character named "Will" no longer
matches every incidental use of the word "will"). Checked our own codex
(`CodexPane.tsx`, `QuickCreate.tsx`): entries carry a single `type` field,
and the Continuity inspector's near-duplicate-name check has no
case-sensitivity option. Both are small, concrete additions to the existing
"NovelCrafter-parity pass, ongoing" item rather than new bullets of their
own.

## Landscape notes (confirm existing findings or add context, no new build item)

**Sudowrite's most-cited technical complaint is still prose-quality errors**
("character placement inconsistencies," "faulty metaphors") even as its
Muse model is otherwise well reviewed — a second round of evidence (after
round 9's finding that Sudowrite's own AI manuscript review "missed major
plot points") that generative accuracy claims from cloud tools don't hold up
under scrutiny, which is exactly why Novella's Continuity inspector stays
deterministic-only rather than adding an AI-guess tier. No action, reinforces
an existing design decision.

**Scrivener's Windows version remains years behind its Mac version** — Mac is
at 3.5.0, Windows is still on the 1.x line, a gap reviewers call out
directly in 2026 writeups. Novella ships one Tauri codebase to
Windows/macOS/Linux with no platform gap by construction — a real
differentiator, but a narrow one (mostly matters to Windows-using Scrivener
switchers), so noted here rather than added as a fifth "say it louder" copy
item; revisit if a future round finds sharper evidence this is a common
switching reason.

**Dabble reviewers still flag no image support in content** — "one user
mentioned the absence of the ability to incorporate images into content" —
while Novella has shipped drag-image-onto-board-cards since 2026-07-23.
Confirms an existing shipped advantage; not a new item.

**Campfire reviews (Reedsy updated June 2, Kindlepreneur updated July 16)
report the app getting "glitchy" — blinking custom tags, scrolling issues —
specifically as characters accumulate more fields.** Second-hand evidence
for the standing "stay FAST as projects grow" guardrail already in the
thesis section; not a new item, a reason not to relax that guardrail.

**Type.ai, Obsidian's plugin stack, and Notion templates are unchanged from
prior rounds** — no new angle surfaced this pass beyond what rounds 7–10
already recorded.

## Round 11 sources

- [Changelog | novelcrafter](https://feedback.novelcrafter.com/changelog)
- [January 9, 2026 - AI Thinking support | novelcrafter Changelog](https://feedback.novelcrafter.com/changelog/january-9-2026-ai-thinking-support)
- [Novelcrafter Review: Powerful for Fiction Writers, Frustrating to Set Up (April 2026)](https://ilampadmanabhan.medium.com/novelcrafter-review-powerful-for-fiction-writers-frustrating-to-set-up-april-2026-64d391c629a2)
- [Sudowrite Review 2026: Pricing, Features, Pros & Cons — Inkfluence AI](https://www.inkfluenceai.com/blog/sudowrite-review-pricing-2026)
- [Sudowrite Review 2026 A Deep Dive — Cybernews](https://cybernews.com/ai-tools/sudowrite-review/)
- [Sudowrite Reviews - SmartCustomer (2026)](https://www.smartcustomer.com/reviews/sudowrite.com)
- [Scrivener Review 2026: Is it Cost Effective? — All About AI](https://www.allaboutai.com/ai-reviews/scrivener/)
- [Scrivener 2026 Detailed Review — Elephas](https://elephas.app/blog/scrivener-review)
- [Campfire Write Review — Reedsy (updated June 2026)](https://reedsy.com/blog/guide/book-writing-software/campfire-write-review/)
- [Campfire Write Review — Kindlepreneur (updated July 2026)](https://kindlepreneur.com/campfire-write-review/)
- [Dabble Writer Review: Features, Pros & Cons for 2026 — Automateed](https://www.automateed.com/dabble-writer)
- [Dabble Review: What Authors Should Know in 2026 — Reedsy](https://reedsy.com/studio/resources/dabble-writing-review/)
- [LocalProse - Novel writing software with local AI](https://www.localprose.com/en/)
- [LocalProse Alternatives: Top 12 Novel Authoring Tools — AlternativeTo](https://alternativeto.net/software/localprose/)
- [Novel Mage – Offline AI Novel Writing Software | No Subscription, No Cloud](https://novelmage.com/)
- [Best AI Writing Software for Novelists in 2026 — Novel Mage blog](https://novelmage.com/blog/best-ai-writing-software-for-novelists-in-2026-i-tried-all-the-major-tools-so-you-dont-have-to)
- [Best Free Novel Writing Software with AI in 2026 — Noveling Guide](https://noveling.dev/guide/en/blog/free-novel-writing-software-ai)
- [19 Best Novel Writing Software Compared (2026 Edition) — Noveling Guide](https://noveling.dev/guide/en/blog/novel-writing-software-comparison-2026/)
