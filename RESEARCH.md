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

# Round 12 — sweep of NovelCrafter, Sudowrite, Dabble, Scrivener, Campfire,
type.ai, Obsidian-for-writers, Notion novel templates, plus a new angle:
*which* local model novelists actually run, not just whether they run one

Autopilot run 2026-07-29, one day after round 11. Rather than re-sweep the
same named-competitor ground a fifth time, this round asked a question round
11's "local-first AI is no longer unique to us" finding raised but didn't
answer: given that local-model novel writing is now a small crowded
category (Novella, LocalProse, Novel Mage, Noveling, plus DIY Ollama/
KoboldCpp setups), what do novelists who actually run local models say about
*which* model to pick — and does Novella's own one-click setup reflect that?

## Biggest finding: our own default model pull has no fiction awareness, and we never say why local avoids moralizing

Sudowrite's core product bet is that a model fine-tuned specifically on
published novels and short stories (Muse, not a general instruct model)
writes meaningfully better fiction than ChatGPT/Claude style generalist
models — this is stated plainly in Sudowrite's own materials and repeated
across multiple 2026 reviews as its actual differentiator, not marketing
fluff. From the other direction, current write-ups on local AI for
novelists (localaimaster.com's local-model roundup, Novel Mage's own
comparison blog) independently converge on the same idea: writers running
local models for fiction gravitate toward community fine-tunes built for
storytelling — the Nous-Hermes line, uncensored Llama 3.3 builds,
KoboldCpp-oriented models with story-memory and instruct/chat modes — over
stock instruct models, specifically because generic instruct models
"moralize" and are weaker at staying in scene, refusing or sanitizing
darker material a novelist may legitimately need to write (violence, morally
grey characters, mature themes).

Checked our own code before writing this up. `src/plugins/providers/
ollama.ts` line 109: `export const DEFAULT_MODEL = "llama3.1:8b";` — a
generic instruct model, no fiction tuning. `SetupPanel.tsx` calls
`pullOllamaModel(DEFAULT_MODEL, ...)` with no alternative model offered
anywhere in the setup flow, and no copy anywhere explaining why this model
was chosen or that other local options exist. This matters more for Novella
than it would for a generalist tool, because a first-time writer's very
first AI generation in the app runs on this default — if the prose reads as
generic, or the model hedges on a dark scene, the writer has no way to know
this is a model-choice problem rather than a ceiling on what local AI can
do at all. That's the worst possible moment for the "writes with you, no
gatekeeper" half of the thesis to underdeliver, since it happens before the
writer has any basis for comparison.

This is distinct from the existing "voice-matching" item (round 11, learning
a writer's own style from their prose) and the existing "reasoning toggle"
item (round 11, hiding chain-of-thought preambles) — both assume the model
itself is fine, and address presentation/personalization on top of it. This
finding is about the model itself being the generic option by default, with
zero signposting that better-suited alternatives exist. Filed as a new item,
ranked above the reasoning-toggle item since it affects every local-AI
writer's first impression, not just users of reasoning-model families
(DeepSeek-R1 and similar).

Scoping note for whoever picks this up: the fix doesn't have to be changing
the shipped default (a larger or specialty fine-tune may not suit the
one-click install-size promise) — the cheap, low-risk version is copy plus
an optional second pull target, the same "show honestly, let the writer
choose" pattern already used for the AI-setup step's honesty language.

## Landscape notes (confirm existing findings, correct one, no new build item)

**NovelCrafter's freshest complaint is a context-visibility problem we
already avoid.** The April 2026 review this round re-checked (also cited in
round 11) states plainly: "the AI couldn't see the document when asked about
the manuscript," requiring the writer to explicitly add the manuscript as
context by selecting specific scenes and chapters — described as "not
obvious at all." Checked our own `ai/context.ts` (`buildSceneContext`,
`estimateTokens`) and `InspectorPane.tsx`'s "Context for this scene" section
before assuming this was a shared problem: Novella already auto-builds scene
context for the Assistant and shows a live estimated-token count, no manual
selection required. This is an existing shipped advantage, not a gap — worth
folding into a future "say it louder" copy pass, but not urgent enough to
add as a sixth standalone copy item this round.

**Sudowrite's manuscript-training stance is now explicit — updates, doesn't
erase, round 9's finding.** Round 9 found Sudowrite's training policy "not
clearly public." This round found Sudowrite's own blog and Terms of Service
now state plainly that Sudowrite never trains on user manuscripts and claims
no rights to the work. That's a real, specific promise worth noting — but it
remains a *policy* promise sitting on top of a cloud architecture that still
transmits the manuscript to run inference, not the architectural guarantee a
fully local Ollama model gives by construction (the question of "did my
words leave my machine" doesn't have a policy answer to check, because they
never left). The existing "say the no-training/privacy advantage louder"
copy item's framing should account for this if it's ever revisited: the
honest comparison is now "policy promise vs. structural fact," not "clear
policy vs. no stated policy."

**Obsidian's novelist setup keeps growing more plugins, not fewer.**
StoryLine — a plugin that "transforms your Obsidian vault into a complete
book planning and writing tool" — was added to Obsidian's official community
plugin directory in February 2026, joining Longform (scene ordering/
reordering sidebar) and Novel Word Count as now-standard parts of a novelist
Obsidian setup. Reconfirms round 7/9's underlying point from a new angle:
getting Obsidian to do what Novella does out of the box now takes assembling
four-plus separate community plugins with their own settings and update
cycles, not "Obsidian is basically already a novel tool." No new item —
this strengthens the existing local-first/integrated-app positioning rather
than surfacing a gap.

**Fresh, independent evidence for the four-app thesis, from outside the
usual named-competitor list.** This round deliberately searched "best
productivity apps for writers 2026" rather than the standing competitor
list, to see whether the fragmented-toolkit problem shows up in
recommendations that have no reason to flatter Novella's framing. It does:
current roundups (textwordcount.com, nownovel.com) recommend Todoist for
task management, Forest for focus/sprint timers, Obsidian for research
notes, and Hemingway Editor for prose quality — four separate apps,
explicitly presented as the current best-practice stack for a working
writer. One source states outright that "most writers use 3-4 apps that
each solve one problem well, rather than relying on a single comprehensive
app." This is stronger evidence than a repeat competitor sweep would have
been, because it's an independent confirmation rather than the same sources
cited again.

**Unchanged from prior rounds, reconfirmed only:** Scrivener's price
complaints and years-stale Windows line (3rd round); Campfire's a-la-carte
module pricing and glitchiness at scale (2nd/3rd round); Dabble and type.ai
sit at the same 2.5/5 and generally-positive-minimalist reception,
respectively, as previous rounds found. No new evidence, no action.

## Round 12 sources

- [Changelog | novelcrafter](https://feedback.novelcrafter.com/changelog)
- [Novelcrafter Review: Powerful for Fiction Writers, Frustrating to Set Up (April 2026)](https://ilampadmanabhan.medium.com/novelcrafter-review-powerful-for-fiction-writers-frustrating-to-set-up-april-2026-64d391c629a2)
- [Sudowrite Review 2026: Is It Still the Best AI Fiction Writing Tool? — Scribe](https://scribehow.com/page/Sudowrite_Review_2026_Is_It_Still_the_Best_AI_Fiction_Writing_Tool__2hcgTzI9T4O9U5Im0yKtwQ)
- [Sudowrite Review 2026 A Deep Dive — Cybernews](https://cybernews.com/ai-tools/sudowrite-review/)
- [Uncensored AI Writer: Best Tools for Writing Without Being Blocked — Sudowrite blog](https://sudowrite.com/blog/uncensored-ai-writer/)
- [Best AI for Creative Writing in 2026: A Beginner's Guide — Sudowrite blog](https://sudowrite.com/blog/best-ai-for-creative-writing-2026-beginners-guide/)
- [Best Local AI Models for Writing in 2026: Tested & Ranked — Local AI Master](https://localaimaster.com/blog/local-ai-writing-models)
- [Best AI Writing Software for Novelists in 2026 — Novel Mage blog](https://novelmage.com/blog/best-ai-writing-software-for-novelists-in-2026-i-tried-all-the-major-tools-so-you-dont-have-to)
- [Dabble Review: What Authors Should Know in 2026 — Reedsy](https://reedsy.com/studio/resources/dabble-writing-review/)
- [Dabble Writer Review: Features, Pros & Cons for 2026 — Automateed](https://www.automateed.com/dabble-writer)
- [Scrivener Review 2026: Still the Best Writing Software for Authors? — Automateed](https://www.automateed.com/scrivener-review)
- [Scrivener Review: A Great 20% Discount (But Why I Don't Use It) — Kindlepreneur](https://kindlepreneur.com/scrivener-review/)
- [Campfire Writing Review: The 17 Modules Explained — Self-Publishing.com](https://selfpublishing.com/campfire-writing-review/)
- [Campfire Write Review — Kindlepreneur](https://kindlepreneur.com/campfire-write-review/)
- [Type.ai Review: My Top Pick After Testing Three AI Writing Tools (April 2026)](https://ilampadmanabhan.medium.com/type-ai-review-719f59c68dbb)
- [The Ultimate Guide to Writing Novels with Obsidian! — Royal Road forum](https://www.royalroad.com/forums/thread/134725)
- [Obsidian for Fiction Writers: Setup, Plugins, and Workflow — Loreteller](https://loreteller.com/learn/obsidian-fiction-writers-guide/)
- [Two new novel-writing plugins — Obsidian Forum](https://forum.obsidian.md/t/two-new-novel-writing-plugins/84340)
- [8 Best Notion Templates for Writers in 2026 — NotionEverything](https://www.notioneverything.com/blog/notion-templates-for-writers)
- [Best Productivity Apps 2026: 15 Expert Picks for Writers & Creators — TextWordCount](https://www.textwordcount.com/blog/best-productivity-apps-2026)
- [Best Writing Apps for Authors (2026) — 26 Tools Compared — NowNovel](https://nownovel.com/best-writing-apps/)
- [19 Best Novel Writing Software Compared (2026 Edition) — Noveling Guide](https://noveling.dev/guide/en/blog/novel-writing-software-comparison-2026/)

## Round 13 (2026-07-30)

Swept the usual named competitors again — NovelCrafter, Sudowrite, Dabble,
Scrivener, Campfire, type.ai, Obsidian, Notion — looking specifically for
angles rounds 7–12 hadn't already covered, plus a fresh look at new local-AI
entrants.

**Sudowrite's biggest 2026 story has quietly shifted from "prose quality" to
"reliability."** Earlier rounds tracked prose-accuracy complaints and the
training-policy question; this round found a different, sharper problem.
Sudowrite had an app-wide outage April 22–23, 2026 that cost some users
unsaved work (status page incident report). Separately, a changelog entry
admits to (and fixes) an Android bug where Story Bible entry fields could be
unexpectedly cleared — a real data-loss bug, not a hypothetical one, and
strikingly similar in shape to the empty-cache-over-disk bug Novella itself
found and fixed in its own config stores back on 2026-07-23. As recently as
July 24, 2026, Trustpilot and community reports call the app "clunky and
full of bugs" on both web and native clients; Sudowrite replied publicly
that it is "shipping fixes steadily." Checked our own `FirstRunWizard.tsx`
before writing this up: the only reliability-adjacent line in first-run copy
is "free, private, nothing leaves the machine" — true, but it never names
outages or lost work, the specific fear this competitor's incidents would
speak to. Because a cloud service can go down and a local vault structurally
cannot, this is a real, ownable advantage Novella already has (autosave +
crash recovery, both shipped) and isn't saying. Filed as the strongest new
item this round, ranked above the training-privacy copy item because these
are reported incidents, not survey sentiment.

**A concrete named model closes some of round 12's open question.** Round
12 flagged that Novella's one-click Ollama setup pulls a generic instruct
model with no fiction-tuned alternative offered. This round found a
specific candidate worth naming when that item gets built: a Local AI
Master write-up on local setups for novelists ranks Qwen 2.5 32B above Llama
3.1 70B on fiction-specific metrics — more literary-text training data,
better long-range character-voice consistency, and line-edit suggestions
described as reading like "an actual editor" wrote them. Folded into the
existing item rather than filed as new, since it's evidence for the same
gap, not a new one.

**type.ai's whole-manuscript context reinforces, rather than adds to, the
existing chat-with-your-book gap.** type.ai markets a 200k-token context
window specifically so the model "sees" the entire manuscript rather than
whatever the writer manually selects. Checked our own `src/ai/context.ts`
before treating this as a gap: `buildSceneContext` deliberately sends only
the codex entries a scene actually references, the tail of the current
scene (6,000 chars), and other chapters as bare titles — a documented
token-economy choice, not an oversight, and the right one for a local
8B-class model's context window and generation speed. But it confirms the
existing NovelCrafter-parity item's "chat-with-your-book mode" gap is real
and will need its own retrieval design (not just a bigger prompt) whenever
it's picked up, rather than being a solved problem. No new item; appended
as a note to the existing one.

**NovelCrafter's pricing has changed enough that round 7's sticker-shock
framing needs an update, not a repeat.** Round 7 through 9 cited
NovelCrafter's advertised price as misleading once BYOK API costs are
added ($14/month tier landing at $24–44/month all-in). This round found
NovelCrafter now lists a $4/month Scribe tier and an $8/month Hobbyist tier
that includes BYOK AI access — materially cheaper headline pricing than
what earlier rounds captured. The underlying point survives (BYOK still
meters through the provider, so the real cost still isn't the sticker
price), but future rounds citing NovelCrafter pricing should use the
current $4/$8 tiers, not the older $14 figure, or the citation becomes
stale and inaccurate rather than just outdated.

**Sudowrite's Muse model was quietly upgraded at no extra cost.** Separate
from the reliability story above: Sudowrite replaced its original Muse
model with an improved version in 2026 — scenes stretch further, prose
reads denser, voice holds more consistently across full manuscripts, same
price and credit cost. Worth tracking as a reminder that Sudowrite's AI
quality keeps improving even as its app stability slips; the two aren't the
same axis and shouldn't be conflated in future copy.

**Unchanged from prior rounds, reconfirmed only, no new angle:** Scrivener
sits at 4.2/5 despite the same standing complaints (Windows version still
years behind Mac, Dropbox-only sync, steep learning curve, price-increase
resentment) — third-plus round with the same findings. Dabble confirmed
again at 2.5/5, explicitly described as something serious plotters/
researchers "outgrow." Campfire now lists 18 modules (up from 17 last
round) with entry pricing "as low as $0.50/month" for an a-la-carte
structure that's still the opposite of Novella's flat local install.
Obsidian's novelist setup still requires assembling multiple community
plugins (Longform, Novel Word Count, StoryLine, Keep the Rhythm) with no
single-plugin alternative emerging. Notion's writer-template ecosystem
keeps growing (Scriborg, Storybook, World Building Bible, several official
marketplace templates) but nothing in it changes the flat/fast/easy-to-
leave critique from round 6.

## Round 13 sources

- [Sudowrite Review 2026: Tested w/ 3 Stories — Nerdynav](https://nerdynav.com/sudowrite-review/)
- [Sudowrite Muse – Sudowrite Documentation](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/sudowrite-muse/4k9bFDMSyic6mFPkYFHrkZ)
- [Sudowrite Muse 1.5: What's New, What's Better, What's Gone — AIMojo](https://aimojo.io/sudowrite-muse-1-5/)
- [App-wide errors — Sudowrite status page](https://status.sudowrite.com/incident/877582)
- [Changelog — Sudowrite](https://feedback.sudowrite.com/changelog)
- [Improvements & Fixes — Sudowrite changelog](https://feedback.sudowrite.com/changelog/improvements-and-fixes)
- [sudowrite.com Reviews — Trustpilot](https://www.trustpilot.com/review/www.sudowrite.com)
- [Novelcrafter Review (2026): Writing Plans, Codex & BYOK AI — Toolworthy](https://www.toolworthy.ai/tool/novelcrafter)
- [Novelcrafter Review 2026: Pricing, Use Cases, Pros & Cons — BestAITables](https://bestaitables.com/novelcrafter-review/)
- [Scrivener Review 2026: Still the Best Writing Software for Authors? — Automateed](https://www.automateed.com/scrivener-review)
- [Scrivener Review: A Great 20% Discount (But Why I Don't Use It) — Kindlepreneur](https://kindlepreneur.com/scrivener-review/)
- [Dabble Writer Review: Features, Pros & Cons for 2026 — Automateed](https://www.automateed.com/dabble-writer)
- [Dabble Review: What Authors Should Know in 2026 — Reedsy](https://reedsy.com/studio/resources/dabble-writing-review/)
- [Campfire Worldbuilding Software Review: Complete Tutorial for 2026 — Automateed](https://www.automateed.com/campfire-write/)
- [Campfire Writing Review: The 17 Modules Explained — Self-Publishing.com](https://selfpublishing.com/campfire-writing-review/)
- [Type.ai Review: My Top Pick After Testing Three AI Writing Tools (April 2026)](https://ilampadmanabhan.medium.com/type-ai-review-719f59c68dbb)
- [Local AI for Writers: Private Novel-Writing Assistant Setup (2026) — Local AI Master](https://localaimaster.com/blog/local-ai-writers)
- [Best AI Writing Software for Novelists in 2026 — Novel Mage blog](https://novelmage.com/blog/best-ai-writing-software-for-novelists-in-2026-i-tried-all-the-major-tools-so-you-dont-have-to)
- [Two new novel-writing plugins — Obsidian Forum](https://forum.obsidian.md/t/two-new-novel-writing-plugins/84340)
- [I would never try writing a novel in Obsidian without these 5 plugins — XDA](https://www.xda-developers.com/would-never-try-writing-novel-in-obsidian-without-these-plugins/)
- [The 28 Best Notion Templates for Writers in 2026 — Gridfiti](https://gridfiti.com/notion-templates-for-writers/)

# Round 14 (2026-07-31)

Rather than run a sixth-plus identical sweep of the standing named-competitor
list, this round split into three parallel passes — NovelCrafter + Sudowrite,
Dabble + Scrivener + Campfire, and type.ai + Obsidian + Notion (with a fourth
angle folded into that last pass: new local-first entrants, the AI-training
legal landscape, and the post-NaNoWriMo sprint/goal-tracking niche) — each
briefed on everything rounds 1-13 already found, and told to report only what
was genuinely new.

## Biggest new finding: the NaNoWriMo-orphaned sprint/goal-tracking audience is still homeless

With no central org running NaNoWriMo since its 2025 nonprofit shutdown
(first noted in round 8), this July's "Camp NaNoWriMo" made the resulting gap
concrete: writers are stitching together separate trackers — Pacemaker,
Trackbear, 4theWords — plus a volunteer-run "NaNoWriMo 2.0" revival site and
Discord servers (Writers Hangout) just to get word-count accountability, the
single simplest feature in this whole category. No one tool has consolidated
this niche.

Checked our own state before writing this up: Novella already ships exactly
what this audience is assembling piecemeal — the sprint timer
(`src/ui/SprintTimer.tsx`, `src/state/sprints.ts`) and the daily-goal/streak
system, both shipped 2026-07-23. Nothing in `FirstRunWizard.tsx` or any
marketing copy names NaNoWriMo, Camp NaNoWriMo, or sprint-and-goal writers as
an audience the app already serves. This is a zero-build, pure-copy
opportunity to court a specific, currently-searching, currently-homeless
audience rather than a general comparison point — filed as a new item
alongside the four-app-bundle copy item, since it's a sharper, named version
of the same "the fourth app is real and unclaimed" pitch.

## A sharper hook for the training/privacy item: real money, not a survey

Round 9 found a 2026 Authorlytica survey (96% of authors want training
consent, 52% would refuse a tool outright) — real sentiment, but abstract.
This round found something authors would actually recognize by name: the
Bartz v. Anthropic author-copyright class action settlement received final
court approval on July 20, 2026 — $1.5 billion, with the presiding judge
(Araceli Martinez-Olguin) overruling 53 objections. Only roughly 350 authors
opted out of a settlement covering close to a million works, though a
smaller holdout group is pursuing further suits ("the opt-outs strike back,"
per Writer Beware, July 17). The same week, a separate group of major
publishers and authors (Hachette, Cengage, Elsevier, Scott Turow, S.C.R.I.B.E.)
filed a fresh suit against Google over book-training data (TechCrunch, July
14).

This doesn't change the underlying point the existing item already makes —
a local Ollama model sidesteps the question by construction, since a
manuscript that never leaves the machine can never become evidence in a
training-data lawsuit — but it gives the copy a current, dollar-figure,
named-court-case hook instead of a survey statistic. Folded into the
existing item rather than filed separately; future copy should lead with
this instead of (or alongside) the Authorlytica numbers.

## Two more reliability incidents, and one billing complaint, feeding existing items

**No-outage item:** beyond Sudowrite's already-tracked April 2026 outage, this
round found a fresh Dabble Trustpilot review reporting a large portion of a
user's book deleted, with no support response for over a day (Dabble has no
phone support). Separately, app-store reviews from the Campfire Update 40
period describe the editor resetting before a user can finish typing a
sentence while online, with the cursor jumping unpredictably during
scrolling — a sharper, more specific version of the "glitchy at scale"
reputation tracked since round 11. Three different cloud writing tools, three
different flavors of the same structural risk: sync/server round-trips as a
single point of failure. A local vault removes the failure mode entirely, not
just patches this quarter's instance of it.

Worth carrying forward honestly: Sudowrite's own July 28 changelog response
to bug complaints, plus a same-month "faster loading" update alongside new
model access (GPT-5.6 suite, Claude Sonnet 4.6), show the company is actively
triaging reliability rather than ignoring it. The advantage is real today;
it isn't guaranteed to stay this wide.

**No-credit-limits item:** fresh complaints describe Sudowrite users being
charged after repeatedly trying to pause a subscription (one review quotes
the app's own message: "We updated your subscription for you!" after a
cancellation attempt), and Sudowrite's feedback board carries an open,
acknowledged item about billing/membership-status mismatches costing users
days of paid access they tried to avoid. This is a different pain point from
the credit-throttling-mid-scene complaint the item already tracks — it's
subscription mechanics itself, the kind of friction that cannot exist for an
app with no billing relationship at all.

## The "one app instead of four" and "local, no training" pitches keep getting more crowded

Three more products are now making pitches adjacent to Novella's own,
beyond the LocalProse/Novel Mage/Noveling trio round 11 already found:

- **Novel Mage now ships a $99 one-time lifetime license** — fully local
  (BYOK or Ollama; the manuscript never touches a server), Codex and
  character tools, a 7-day full-feature trial, Windows and Mac. This is
  closer to Novella's own pricing shape (one-time cost, not a subscription)
  than round 11 first captured it.
- **Storyloft** launched May 4, 2026 ($19/month, web-based): "Eddy," a
  manuscript-aware AI that reads the whole draft before responding (the
  same "reads your document automatically" praise type.ai earns), paired
  with an explicit no-training privacy pledge as its stated selling point.
  It's a cloud subscription competitor fighting on the exact privacy ground
  a local model owns by construction — worth watching as the closest thing
  yet to "type.ai, but privacy-branded specifically for novelists."
- **Scribeist** relaunched in early 2026 ("Write without switching tools,"
  Product Hunt), bundling Novel/Blog/General workspaces with context-aware
  AI at $8-18/month.

None of the three fold in task management or a sprint/focus timer — the
fourth-app half of the thesis remains untouched competitive ground, same as
round 11 found — but the crowd making the local-AI/no-subscription/unify-
everything pitch keeps growing. Folded into the existing four-app-bundle
item rather than filed as a new one.

## Landscape notes (confirm existing findings or explicitly correct one, no new build item)

**Scrivener remains at zero AI features, confirmed with current version
numbers.** Multiple 2026 review sites independently reconfirm Scrivener ships
no AI assistance and sends no text to any server. As of this round, Mac sits
at Scrivener 3.5.0 (added macOS 26 Tahoe support) while Windows sits at
3.1.6 — a concrete, dated version of the known Mac/Windows lag rather than
just a general reputation. Literature & Latte's long-teased "lighter, next-
gen" spinoff app (in beta since 2023-2024) still has no public release, name,
pricing, or announced AI angle as of forum activity in mid/late June 2026.
Reinforces rather than changes the standing read: the entire legacy-desktop-
writing-tool category is leaving both AI-assist and local-first execution on
the table at the same time — exactly Novella's wedge — with no sign that's
about to change.

**Sudowrite's AI-quality and app-stability stories keep moving on separate
axes.** New model access (OpenAI's GPT-5.6 suite — Sol, Terra, Luna — plus
Claude Sonnet 4.6) shipped alongside faster editor load times, especially on
slower devices. Confirms round 13's point: Sudowrite keeps riding "best model
access" as its differentiator while reliability complaints (above) continue
in parallel. Two separate axes, worth tracking separately in future copy
rather than conflating.

**A "Dabble was acquired by Headout" claim is false — checked and
disregarded.** Some AI-generated search summaries asserted this; Headout is
an unrelated travel/tours-booking company, and this appears to be a search-
engine name collision, not a real acquisition. Not repeating it without
independent confirmation from Dabble's own channels.

**Nothing new surfaced for type.ai, Obsidian-for-writers, or Notion writing
templates this round** beyond what rounds 1-13 already found (type.ai's
minimalism, Obsidian's 4-5-plugin novelist stack, Notion's growing but
still-buried-and-hard-to-leave template ecosystem).

## Round 14 sources

- [Sudowrite Changelog](https://feedback.sudowrite.com/changelog)
- [Faster Loading, GPT-5.6 Models & More Improvements — Sudowrite changelog](https://feedback.sudowrite.com/changelog/faster-loading-gpt-56-models-and-more-improvements)
- [Sudowrite reviews — SmartCustomer](https://www.smartcustomer.com/reviews/sudowrite.com)
- [Adjust Billing and Membership Correlation — Sudowrite feedback board](https://feedback.sudowrite.com/p/adjust-billing-and-membership-correlation)
- [Sudowrite status/incidents](https://status.sudowrite.com/incidents)
- [Novel Mage — Offline AI Novel Writing Software](https://novelmage.com/)
- [NovelCrafter offline-mode FAQ](https://www.novelcrafter.com/help/faq/general/can-i-use-nc-in-ofline-mode)
- [NovelCrafter export help doc](https://docs.novelcrafter.com/en/articles/9319221-how-do-i-export-my-novel)
- [New Lit & Lat writing app — Literature & Latte forum](https://forum.literatureandlatte.com/t/new-lit-lat-writing-app/136936)
- [Something new — Literature & Latte blog](https://www.literatureandlatte.com/blog/something-new)
- [Scrivener Review — All About AI](https://www.allaboutai.com/ai-reviews/scrivener/)
- [Scrivener Review 2026 — Automateed](https://www.automateed.com/scrivener-review)
- [Is Scrivener Discontinued? The Shocking Truth for 2026 Writers](https://techradar.info/is-scrivener-discontinued-the-shocking-truth-for-2026-writers/)
- [Update 40: Returning to Our Roots — Campfire](https://campfirewriting.com/learn/update40)
- [Campfire: Write Your Book reviews — JustUseApp](https://justuseapp.com/en/app/1626123915/campfire-write-your-book/reviews)
- [Dabble reviews — Trustpilot (CA)](https://ca.trustpilot.com/review/dabblewriter.com)
- [Storyloft: what makes an AI writing tool safe for authors](https://storyloft.app/what-makes-an-ai-writing-tool-safe-for-authors-privacy-training-and-manuscript-control-explained/)
- [Storyloft launch press release — Marketers Media](https://news.marketersmedia.com/storyloft-launches-eddy-an-ai-co-writer-designed-to-help-authors-edit-manuscripts-and-improve-their-craft/89192872)
- [Scribeist V2 — ChatGate](https://chatgate.ai/post/scribeist-v2)
- [Scribeist on Product Hunt](https://www.producthunt.com/products/scribeist)
- [Bartz v. Anthropic granted final approval by the court — TAA](https://blog.taaonline.net/2026/07/bartz-v-anthropic-granted-final-approval-by-the-court/)
- [Anthropic settlement update: the opt-outs strike back — Writer Beware](https://writerbeware.blog/2026/07/17/anthropic-settlement-update-the-opt-outs-strike-back/)
- [Google faces another AI training lawsuit from major publishers — TechCrunch](https://techcrunch.com/2026/07/14/google-faces-another-ai-training-lawsuit-from-major-publishers/)
- [NPR: Anthropic/Bartz settlement pros and cons](https://www.npr.org/2026/07/27/nx-s1-5904606/anthropic-vs-bartz-ai-copyright-lawsuit-pros-cons)
- [Camp NaNoWriMo 2026 tools/tracker roundup — CipherWrite](https://cipherwrite.com/blog/camp-nanowrimo-2026-tools-tracker)
- [Obsidian StoryLine plugin](https://www.storyline.pixero.com/)

# Round 15 (2026-08-01)

A note on how this round came to run: AUTOPILOT.md was edited 2026-07-31,
right after round 14, to cap the build-loop's own research fallback at "at
most one run in three, never twice in a row" — eight straight research-only
runs had grown the backlog from 7 items to 18 with no code shipped. This
round fired from a separate, dedicated research schedule rather than the
build loop choosing research on its own, so that cap didn't directly gate
it — but it's flagged in the ROADMAP.md log line for the owner to confirm
the schedule's frequency still matches intent now that the cap exists.
Findings below turned out substantial either way.

Split into four parallel passes: NovelCrafter + Sudowrite; Dabble +
Scrivener + Campfire; type.ai + Obsidian + Notion (plus a scan for new
local-first entrants); and a broader industry/legal-sentiment sweep. Each
was briefed on everything rounds 1-14 already found and told to report only
genuinely new material, with primary sources prioritized over AI-generated
summary sites.

## Biggest new finding: a named, paying competitor has zero generative AI

Multiple independent 2026 reviews (Reedsy, WriteABookAI's Dabble-vs-Scrivener
comparison, Knowara) now state plainly what earlier rounds only implied
through feature-gap comparisons: Dabble ships no generative AI writing
assistance at all. Its $29/mo Premium tier (or $699 lifetime) bundles a
ProWritingAid-powered grammar/style checker — editing help, not drafting
help — plus a novelty text-to-speech "Read to Me" feature. That's the whole
AI story for a tool charging real subscription or lifetime money for "the
whole job."

This is the sharpest, most quotable proof point found in fifteen rounds for
the "writes with you" half of the thesis, because it needs no caveat about
competitors catching up or matching the feature later — Dabble isn't even
trying. Filed as a new copy item, ranked with the other marketing-copy
findings but placed high in that cluster since it's a single fact rather
than a comparison that could shift under a competitor's next release.

## The four-app-bundle thesis gets its sharpest direct hit yet — and a sharper stat

Scribeist V2 (relaunched, Product Hunt) now ships a dedicated **Novel
workspace** — character tracking, timeline visualization, worldbuilding
docs — alongside a General notes workspace, with context-aware AI that
behaves differently per workspace, marketed explicitly as "write without
switching tools." Round 14 had already logged Scribeist's relaunch as one of
three entrants using similar language to Novella's own positioning; this
round found the specifics, and they land closer to the actual "one app
instead of four" pitch than anything found so far — worldbuilding and
organization tooling under one roof, not just an editor with AI bolted on.
The clean counter-argument survives intact: Scribeist's AI routes through
OpenRouter/BYOK, metered and cloud-dependent, not local and free — Novella's
"one app instead of four, and it's yours forever, no meter" pitch still
has ground Scribeist doesn't occupy.

Separately, a fresh "best productivity apps for writers 2026" roundup
(independent of any named competitor) now recommends a **five**-tool stack —
a word-count tracker, Todoist, Forest, Obsidian, and Hemingway — rather than
the four the thesis names. If anything the fragmentation problem is getting
worse, not better, which is a fresher, sharper stat to lead marketing copy
with than "3-4 apps." Both findings folded into the existing four-app-bundle
item.

## NovelCrafter and Sudowrite converge on chat-with-your-book — the differentiator has to move

Sudowrite shipped "Chat" and "Feedback" as major features on May 12, 2026
("Your Personal Writing Partner Has Arrived" changelog post), giving Chat
full context of characters, outline, and story world, plus — new — the
ability to edit existing documents and create new ones, not just discuss
them. Feedback (manuscript-level critique) was opened free to all
subscribers through a launch promo. Combined with NovelCrafter's existing
Codex-grounded chat and type.ai's 200k-token whole-manuscript context (round
13), all three major AI-writing competitors now offer some form of
chat-with-your-book. Once Novella builds its own version of this (tracked
in the NovelCrafter-parity item), the feature's mere existence won't be a
competitive edge — every serious competitor will have it. The differentiator
that survives is local, private, and free of per-token cost; future copy and
design work on this item should lead with that, not with parity.

Also corrected while checking Sudowrite's changelog: Sudowrite's reliability
complaints are not a stale July 24 data point closed by the "shipping fixes
steadily" reply already logged in round 13 — a Google Play developer
response dated on or about July 28, 2026 responds to the same class of
bugginess complaint with near-identical language, meaning it was still
unresolved days before this round ran, not a one-off that got fixed.

## A pricing correction: NovelCrafter is a 4-tier ladder, not "$4/$8"

Round 13 logged NovelCrafter's pricing as having "dropped to $4/$8 tiers."
That's the bottom of the ladder, not the whole thing — current tiers across
multiple aggregators are Scribe $4/mo, Hobbyist $8/mo, Artisan $14/mo, and
Specialist $20/mo (annual billing saves roughly two months). Worth keeping
straight for any future "cheaper than NovelCrafter" comparison copy so it
doesn't accidentally understate NovelCrafter's power-user tier pricing.

## Reliability watch continues: Campfire and Dabble both add a data point

Campfire's mid-sentence editor-reset/cursor-jump bug — first logged in round
14 from the Update 40 changelog era — is still being reported in the app's
current mobile release (v1.3.2, updated July 3, 2026): "can't type a single
sentence before it resets while online," "jumps to the top every time." This
is now a multi-cycle unresolved defect, not a one-off tied to one update.
Separately, Dabble's own Facebook page acknowledged a "more widespread
issue" that backlogged support tickets, on top of the already-logged
Trustpilot report of a large portion of a user's book being deleted with no
support response for over a day. Both folded into the existing no-outage
item, which now carries three named cloud tools with three separate,
still-open reliability windows.

## The legal/regulatory ground under "no-training" shifted: training itself is being called fair use

The Bartz v. Anthropic settlement's final approval (July 20) carries a
specific piece of legal reasoning worth separating from the settlement
dollar figure already logged in round 14: the court's theory was that
training an AI on copyrighted books is fair use — the actionable wrong was
Anthropic's use of pirated/torrented source copies, not the training itself.
A parallel ruling in the Meta/Kadrey litigation lands the same way: the
court dismissed the authors' core "training equals infringement" theory
against Meta while letting the illegally-sourced-copies claim proceed.
Two separate cases, the same emerging legal consensus.

This matters for how Novella frames its no-training advantage going
forward. "We were trained legally" is no longer a strong claim to make on
anyone's behalf, including ours — courts are saying training itself is
fair use regardless of how careful the sourcing was. The durable version of
this pitch was never about legality; it's about consent and architecture: a
local Ollama model doesn't transmit a manuscript anywhere, so it cannot
train on it, cannot be sued over doing so, and cannot need a court's fair-use
ruling to defend it. That claim survives a legal system that keeps ruling
training itself is fine.

Adding to the news cycle keeping this topic current: a fresh Google/Gemini
suit (Hachette, Cengage, Elsevier, Scott Turow, S.C.R.I.B.E., filed
~July 14, already logged in round 14) alleges Gemini was trained on
pirated/torrented books with copyright management info stripped to conceal
it — not yet decided, a filing only. And the EU AI Act's Article 53
training-data-transparency duty becomes enforceable August 2, 2026: the AI
Office can now audit general-purpose AI models and fine providers up to
€15M or 3% of global turnover for failing to publish what they trained on.
A concrete, dated regulatory hook for EU-facing copy — Novella has nothing
to disclose under this rule, because nothing leaves the device to train
anything in the first place.

## NaNoWriMo-successor niche: still fragmenting, not consolidating

Beyond the Pacemaker/Trackbear/4theWords/NaNoWriMo-2.0/Writers-Hangout
fragmentation logged in round 14, this round found still more events
competing for the same orphaned audience: World Anvil's "NovelEmber,"
ProWritingAid's "Novel November," Reedsy's Novel Sprint, and a Discord-based
"Order of the Written Word" running three parallel November challenges.
More than a year after NaNoWriMo's shutdown, no single successor has
consolidated the sprint/goal-tracking community — reinforcing rather than
changing round 14's read that this is a cheap, no-code naming opportunity
Novella hasn't taken yet.

## Sudowrite leans into "uncensored fiction" — a genuine structural advantage, and a values call

Sudowrite is now actively marketing an "uncensored fiction" positioning
through a cluster of new blog posts (dark romance, erotica, dark fantasy,
explicitly contrasted against Claude/ChatGPT refusals), built around Muse.
But user reports describe inconsistent enforcement even within Sudowrite's
own product: certain scenes routed through Claude-based pipelines inside
the app still reintroduce refusals or toned-down output, "depending on mood
and phrasing." A fully local model with zero vendor-side content policy is
a structural advantage over that inconsistency — not just "a less
restrictive model," but the complete absence of a moderation layer to be
inconsistent in the first place. Worth stating plainly once the local-model-
recommendation item ships, but which content a shipped default should
actually permit is a deliberate values decision for the owner to make, not
something to default into silently by picking an "uncensored" community
fine-tune without discussion.

## Landscape notes (confirm existing findings, correct one, or note with no action)

**Scrivener's Mac/Windows gap widened rather than narrowed.** Mac shipped
3.5.1 and 3.5.2 in 2026 (chasing Apple's own macOS 26.1/26.2 bugs — a
Liquid Glass icon rework, a scroller-over-footer rendering glitch), while
Windows remains frozen at 3.1.6. Literature & Latte's long-teased next-gen
app is confirmed still in closed beta as of forum activity around July 2026
(nearly three years after its October 2023 tease), now known to be built for
simultaneous Mac/iOS/Windows release — unlike Scrivener 3 — but explicitly
stripping out the corkboard, scriptwriting mode, custom metadata, and
multi-column outline, with still no AI feature, pricing, or release date
announced. Reinforces the standing read (legacy desktop tools leaving both
AI-assist and local-first execution on the table) but the beta is worth
watching since it could surface with little warning.

**Both NovelCrafter and Sudowrite have a nearly-empty review-platform
footprint.** NovelCrafter has no G2 or Capterra reviews and only one
(negative) Trustpilot review; Sudowrite's G2 profile shows only two reviews
and looks stale despite a "2026 Best Software Awards" listing. This is a
go-to-market opening, not a product gap — if Novella invests early in
G2/Trustpilot/Capterra presence, it could win "best AI writing tool"
review-platform visibility essentially uncontested. No code follows from
this, so it isn't filed as a Next-up item, but it's worth the owner's
attention outside the autopilot loop.

**Several frequently-cited author-survey statistics could not be traced to
a primary source this round and were deliberately not repeated as fact.**
Specific figures like "78% of authors use AI, up from 33% in 2024," "61%
deeply concerned about training," and "89% always review AI output"
appeared only in SEO/content-marketing blog posts (mylifenote.ai,
authorlytica.com, cipherwrite.com, storyloft.app) with no traceable primary
survey behind them — read as likely inflated or blended by AI-generated
content, not verified data. A recirculating "90% of writers want
compensation, 65% support collective licensing" Authors Guild figure could
not be freshly confirmed either (authorsguild.org blocked automated
fetches) and closely matches an older, 2023-era survey being reshared —
flagged as probably stale rather than new signal.

**Ruled out as false or miscategorized, not repeated:** a claim that
"Campfire Blaze launched in 2026 as a successor to Campfire Pro" is
mistaken — Campfire Blaze actually dates to an August 2019 Kickstarter and
was folded into the single unified Campfire product years ago, misdated by
an AI-generated summary site. Several "Dabble Trustpilot 2026" search
results turned out to be for an unrelated Australian/UK sports-betting app
also called "Dabble" (dabble.com.au, dabble.co.uk) and were discarded; a
separate unrelated company, "dabble.ai," is a different AI writing-assistant
product entirely and should not be conflated with Dabble Writer in future
comparison copy. Claims of a Sudowrite "Story Engine 3.0," a pay-as-you-go
Developer API, and a "Canvas 2.0" spatial-plotting feature came from a
single low-authority SEO aggregator and were not corroborated anywhere
else — treated as unverified marketing copy, not fact.

**Nothing materially new surfaced for type.ai this round** — pricing and
positioning ($12/mo entry tier, GPT-5 + Claude 4.5 Sonnet access, 4.5/5
rating) are stable, with no fresh negative reviews or regressions found
across G2, Slashdot, or Medium in 2026. Differentiation against type.ai
still has to rest on cost and local-privacy rather than waiting for a crack
in its manuscript-context quality.

## Round 15 sources

- [Dabble vs Scrivener: Book Writing Software Compared 2026 — WriteABookAI](https://writeabookai.com/blog/dabble-vs-scrivener-book-writing-software-2026)
- [Dabble Writer Review — Knowara](https://knowara.com/ai-tools/writing/dabble-writer-review/)
- [Scrivener 3.5.2 for macOS Now Available — Literature & Latte forum](https://forum.literatureandlatte.com/t/scrivener-3-5-2-for-macos-now-available/152621)
- [Scrivener 3.5.1 — TidBITS Watchlist](https://tidbits.com/watchlist/scrivener-3-5-1/)
- [L&L New Product? — Literature & Latte forum](https://forum.literatureandlatte.com/t/l-l-new-product/152462)
- [Something new — Literature & Latte blog](https://www.literatureandlatte.com/blog/something-new)
- [Scribeist: Write without switching tools — Product Hunt](https://www.producthunt.com/products/scribeist)
- [Scribeist V2 Review — FunBlocks](https://www.funblocks.net/aitools/reviews/scribeist-v2)
- [Scribeist V2 — ChatGate](https://chatgate.ai/post/scribeist-v2)
- [Scribeist plans/billing](https://scribeist.com/help/billing/general/plans/)
- [Novelcrafter — Jenova AI resources](https://www.jenova.ai/en/resources/novelcrafter)
- [Novelcrafter Review 2026 — Toolworthy](https://www.toolworthy.ai/tool/novelcrafter)
- [Novelcrafter Review: Powerful for Fiction Writers, Frustrating to Set Up (April 2026)](https://ilampadmanabhan.medium.com/novelcrafter-review-powerful-for-fiction-writers-frustrating-to-set-up-april-2026-64d391c629a2)
- [Your Personal Writing Partner Has Arrived — Sudowrite changelog](https://feedback.sudowrite.com/changelog/your-personal-writing-partner-has-arrived)
- [Sudowrite — uncensored AI writer blog post](https://sudowrite.com/blog/uncensored-ai-writer)
- [AI for Erotic Fiction: Why Sudowrite's Muse Model Changes Everything](https://sudowrite.com/blog/ai-for-erotic-fiction-why-sudowrites-muse-model-changes-everything)
- [Sudowrite vs Claude — eesel.ai](https://eesel.ai/blog/sudowrite-vs-claude)
- [Type.ai Review (April 2026) — Medium](https://ilampadmanabhan.medium.com/type-ai-review-my-top-pick-after-testing-three-ai-writing-tools-april-2026-719f59c68dbb)
- [Type.ai — AIChief](https://aichief.com/ai-text-tools/typeai/)
- [Type.ai pricing](https://type.ai/pricing)
- [LocalProse](https://www.localprose.com/en/)
- [Best productivity apps 2026 — TextWordCount blog](https://www.textwordcount.com/blog/best-productivity-apps-2026)
- [Google faces another AI training lawsuit from major publishers — TechCrunch](https://techcrunch.com/2026/07/14/google-faces-another-ai-training-lawsuit-from-major-publishers/)
- [Authors, publishers sue Google over alleged AI copyright infringement — Al Jazeera](https://www.aljazeera.com/economy/2026/7/15/authors-publishers-sue-google-over-alleged-ai-copyright-infringement)
- [Publishers file lawsuit against Google for AI training — Jane Friedman](https://janefriedman.com/publishers-file-lawsuit-against-google-for-ai-training/)
- [Court grants final approval of Anthropic copyright settlement — Authors Guild](https://authorsguild.org/news/court-grants-final-approval-anthropic-copyright-settlement/)
- [AI vs. Authors update: court approves historic Anthropic settlement while Meta... — National Law Review](https://natlawreview.com/article/ai-vs-authors-update-court-approves-historic-anthropic-settlement-while-meta)
- [AI in Litigation Series: an update on AI copyright cases in 2026 — Norton Rose Fulbright](https://www.nortonrosefulbright.com/en/knowledge/publications/ce8eaa5f/ai-in-litigation-series-an-update-on-ai-copyright-cases-in-2026)
- [The EU AI Act: when does it become enforceable now? — Data Protection Report](https://www.dataprotectionreport.com/2026/07/the-eu-ai-act-when-does-it-become-enforceable-now/)
- [OpenAI's EU AI Act statement skips training-data copyright gap, activates Sunday — Tech Times](https://www.techtimes.com/articles/322519/20260731/openais-eu-ai-act-statement-skips-training-data-copyright-gap-activates-sunday.htm)
- [NaNoWriMo alternatives 2026 — CipherWrite](https://cipherwrite.com/blog/nanowrimo-alternatives-2026)

# Round 16 (2026-08-02)

Only one day had passed since round 15, so this round was run as a
deliberate stress test of the "report only what's genuinely new" discipline
rather than an expectation of a big haul. Four parallel passes covered the
usual split (NovelCrafter + Sudowrite; Dabble + Scrivener + Campfire;
type.ai + Obsidian + Notion plus a new-entrant scan; broader industry/legal
sentiment), each handed a full brief of everything rounds 1-15 already
found so nothing already logged would resurface as "new." Three of the four
passes came back mostly or entirely empty after real effort, which is
reported honestly below rather than padded — but the fourth surfaced a
genuine crack in a competitor's flagship claim, and two others sharpened
existing items in ways worth carrying forward.

## Two more local-first entrants, plus a nuance that complicates "runs locally" as a unique claim

Novelist (novelist-app.com) is a Windows desktop novel-writing app, $49
one-time with a 14-day trial, working fully offline via Ollama or BYOK
across ten providers. Its feature set — reorderable chapters, a
drag-and-connect character-relationship map, a plot timeline, a corkboard,
a worldbuilding codex, word-count targets and streak tracking — is a close
mirror of Novella's own surface area, and site metadata suggests it's been
live since around May 2026 rather than a brand-new launch, so it's "new to
our tracking" rather than newly shipped. Separately, a new Obsidian plugin,
Noveler (community-listed roughly three weeks before this check), bundles
StoryLine's scene routing with manuscript export and Antidote grammar-
checker integration — pushing the plugin count required for a workable
Obsidian novel setup to at least four (Longform, Novel Word Count,
StoryLine, Noveler).

Both were checked specifically for task management and a sprint/focus
timer, since that's the one piece of the thesis no competitor has claimed.
Novelist has word-count streaks (gamification) but no task manager and no
timer. Noveler and the StoryLine ecosystem it extends have neither. A
direct search across Product Hunt, Hacker News Show HN, and writing-
community subreddits for *any* product pairing task-tracking with a
focus/sprint timer alongside writing and worldbuilding turned up nothing.
The fourth-app gap is now checked against six-plus dedicated competitors
(NovelCrafter, Sudowrite, Dabble, Scrivener, Campfire, type.ai) and at
least six local-first/indie entrants (LocalProse, Novel Mage, Noveling,
Storyloft, Scribeist, Novelist) across sixteen rounds, and remains
completely unclaimed.

The nuance is less comfortable: NovelCrafter's own help docs, dated
February 8, 2026, confirm it already supports pointing the app at a
locally-running Ollama or LM Studio instance instead of paid API calls
(novelcrafter.com/help/docs/ai-connections/ollama). This isn't new — the
docs predate this whole research project — but it hadn't been checked or
logged in fifteen prior rounds, and it matters: "Novella runs AI locally
with no per-token cost" is not, on its own, a claim NovelCrafter can't also
make for a slice of its usage. What NovelCrafter still can't offer, even
with Ollama plugged in, is the packaging: it's still a cloud-hosted,
browser-only app that needs the well-documented ~1-hour BYOK setup for any
model *besides* the one a writer manually configures through Ollama, the
manuscript itself still lives on NovelCrafter's own servers regardless of
which model answers a prompt, and there's still no offline mode and no
desktop process. Future "local AI" copy should lead with the whole
package — zero-config local AI *and* a local-only manuscript *and* no
cloud dependency at all *and* task/sprint tools bundled in the same
app — rather than the bare fact that a local model can be attached, since
that fact alone just stopped being exclusively ours to claim.

## A concrete crack in Sudowrite's "reads your whole manuscript" claim

A Trustpilot review of Sudowrite states plainly that its manuscript-review
output "missed major plot points," and separately calls the claim that
Sudowrite "reads all messages" — i.e., has full context of the manuscript —
a "flagrant lie" based on direct experience. The same reviewer describes
being locked out of their account with no 24/7 support and no response
after complaining, both via chat and again on attempting to cancel;
Sudowrite reached out to try to resolve it on June 23, 2026. This is the
first specific, named complaint found across sixteen rounds that
Sudowrite's "Feedback" manuscript-critique feature (shipped May 12, 2026,
marketed with "full context of characters, outline, and story world") does
not deliver on that promise in practice.

The same pass found Sudowrite shipped a third model family in roughly two
weeks — Kimi K3 (Moonshot AI), added July 29, 2026 to Write/Draft/Plugins
and pitched as #2 on the EQ-Bench creative-writing leaderboard behind only
Claude Opus 5, notable for adapting sentence rhythm rather than just word
choice to a requested register. The same release fixed a real bug: Undo
(Ctrl/Cmd+Z) after a Chat-based edit had been rolling the entire document
back to before that edit, not just undoing the edit itself — a document-
corruption-adjacent bug in exactly the feature Sudowrite is racing
competitors to build out. Taken together with the GPT-5.6 suite and Claude
Sonnet 4.6 access already logged in round 15, Sudowrite added three model
families in about two weeks while also patching a bug that could silently
roll back a writer's work — evidence it's competing on model breadth
faster than it's stabilizing the underlying feature.

This sharpens rather than replaces the existing NovelCrafter-parity item's
framing: once Novella builds its own chat-with-your-book mode, the
differentiator was already identified (round 15) as local/private/free
rather than the feature's mere existence. This round adds a second,
concrete argument to lead with alongside that one — a local Codex-grounded
implementation has no cloud context window to silently truncate a
manuscript against, and no server-side Undo state that can roll back past
an edit a writer already accepted.

## A legal nuance on Article 53, live as of today

The EU AI Act's Article 53 general-purpose-AI transparency duty took
enforcement effect today, August 2, 2026, confirmed via the European
Commission's own press release — investigation powers and fines (up to
€15M or 3% of global turnover) are now live, retroactive to violations
since August 2025. Checked specifically for two things beyond the bare
fact already logged in round 14: any writing-tool-specific reaction to the
date landing, and whether local/on-device deployment gets any distinct
treatment under the statute. Found no writing-tool-specific reaction. On
the second question, the answer is more useful than "no distinct
treatment" — it's that the obligation was never aimed at apps like
Novella in the first place. Article 53's transparency duty is a *provider*
obligation: it falls on whoever publishes and releases the general-purpose
model (Meta for Llama, Mistral, Alibaba for Qwen, etc.), not on downstream
software that deploys someone else's already-published model locally.
Article 53(2) separately exempts models released under a free/open license
with public weights and no monetization outright, which covers most of the
model families Novella's Ollama integration would point at anyway. So the
existing "nothing leaves the device, so there's nothing to disclose" claim
already logged is true, but it turns out to be the *second* reason Article
53 has nothing to bite on here — the first is that Novella was never the
regulated party to begin with, being a downstream deployer rather than a
GPAI provider. Worth having ready if a legally-minded reviewer or reporter
asks how Novella complies with the Act; not sharp or dramatic enough to
lead marketing copy with on its own.

## Landscape notes (no action)

**Nothing new for Dabble, Scrivener, or Campfire this round**, despite a
real search effort (~20 queries across Trustpilot, App Store/Google Play,
G2, justuseapp.com, X, Reddit, and the vendors' own official pages).
Scrivener's Mac version is still 3.5.2, Windows still 3.1.6, and every
"new writing app" beta thread findable by search predates the already-
logged "still in closed beta as of ~July 2026" status — literatureandlatte.com
and its forum blocked direct fetches this round, so this is search-snippet-
sourced only, flagged as a limitation for a future round to close with
different access. Campfire's most recent numbered changelog is still
Update 41 (Jan 27, 2026), well before the already-logged v1.3.2 mobile
release; the false "Campfire Blaze successor" claim is still circulating on
at least one SEO site (automateed.com) but wasn't repeated as fact.
Dabble's rating and pricing are unchanged; a Facebook-support-page mention
of an "SDK Misconfigured" desktop error and a persistent web banner bug
could not be dated distinctly from the already-logged "widespread issue"
report, so it's noted but not counted as new.

**Nothing new on the Google/Gemini publisher lawsuit or on fresh author-
sentiment survey data.** The Gemini suit (Hachette, Cengage, Elsevier,
Scott Turow, S.C.R.I.B.E.) has no answer, motion, or hearing date yet. The
same unverifiable "78% of authors use AI," "61% deeply concerned," "89%
always review AI output" stats are still recirculating on the same
content-marketing sites (cipherwrite.com, storyloft.app, mylifenote.ai,
authorlytica.com) with no traceable primary source — round 15's skepticism
holds. One correction worth carrying forward: the Authors Guild's actual
November 2025 survey (~2,400 authors; "96% want consent," "90% believe
authors should be compensated") looks like it may be the real primary
source behind the "96% consent" figure this project has been citing under
an "Authorlytica" attribution since round 9 — the AG survey predates this
research window so it isn't logged as a new finding, but the attribution
should probably be corrected to Authors Guild the next time that stat is
cited in copy.

**A NovelCrafter changelog entry ("Draft 11": Codex filter by type and
custom category simultaneously, plus a new `novel.title`/`novel.*` custom-
prompt variable) was found but its date could not be confirmed** —
feedback.novelcrafter.com blocked direct fetches this round and the
changelog URL slug carries no year. Noted for a future round to verify
directly rather than relied on now. type.ai and Notion writing templates:
no material change found in either — type.ai's pricing snapshot found this
round is dated July 3, 2026 and matches what's already logged; Notion
template listicles surfaced only pre-existing products.

## Round 16 sources

- [Novelist — local-first novel-writing app](https://www.novelist-app.com/)
- [Novelist — AlternativeTo listing](https://alternativeto.net/software/novelist-app/about/)
- [Noveler — A StoryLine Expansion — Obsidian community plugin](https://community.obsidian.md/plugins/noveler-a-storyline-expansion)
- [StoryLine — Obsidian plugin for writers — Obsidian forum](https://forum.obsidian.md/t/plugin-storyline-obsidian-plugin-for-writers/111494)
- [NovelCrafter — connecting to Ollama](https://www.novelcrafter.com/help/docs/ai-connections/ollama)
- [Sudowrite Trustpilot reviews](https://www.trustpilot.com/review/www.sudowrite.com)
- [Kimi K3, safer Undo, Chat reliability and more fixes — Sudowrite changelog](https://feedback.sudowrite.com/changelog/kimi-k3-safer-undo-chat-reliability-and-more-fixes)
- [NovelCrafter changelog — "Draft 11"](https://feedback.novelcrafter.com/changelog/draft-11)
- [Google faces another AI training lawsuit from major publishers — TechCrunch](https://techcrunch.com/2026/07/14/google-faces-another-ai-training-lawsuit-from-major-publishers/)
- [U.S. publishers sue Google alleging massive copyright infringement behind Gemini — Publishing Perspectives](https://publishingperspectives.com/2026/07/u-s-publishers-sue-google-alleging-massive-copyright-infringement-behind-its-gemini-ai-service/)
- [Google faces class action over books used to train Gemini — Search Engine Journal](https://www.searchenginejournal.com/google-faces-class-action-over-books-used-to-train-gemini/582708/)
- [AG AI Survey Reveals Authors Overwhelmingly Want Consent and Compensation — Authors Guild](https://authorsguild.org/news/ag-ai-survey-reveals-authors-overwhelmingly-want-consent-and-compensation-for-use-of-their-works/)
- [European Commission press release — EU AI Act GPAI obligations](https://ec.europa.eu/commission/presscorner/detail/en/ip_26_1714)
- [EU AI Act — Article 53 text](https://artificialintelligenceact.eu/article/53/)
- [How the EU AI Act treats open-source GPAI models — Hugging Face](https://huggingface.co/blog/yjernite/eu-act-os-guideai)
- [Campfire Update 41 changelog](https://campfirewriting.com/learn/update41)
- [NaNoWriMo alternatives — Authors Breeze](https://authorsbreeze.com/blogs/nanowrimo-alternatives/)

# Round 17 (2026-08-03)

A note on how this round came to run, escalated from round 15's note: on
2026-07-31, right after round 14, AUTOPILOT.md was edited to cap the build
loop's own research fallback at "at most one run in three, never twice in a
row" — eight straight research-only runs had grown the backlog from 7 items
to 18 with no code shipped. Round 15 (2026-08-01) already flagged that this
round fires from a schedule dedicated to research, separate from the build
loop's own cadence choice, so that cap doesn't directly gate it, and asked
the owner to confirm the schedule still fits now that the cap exists. That
flag went unaddressed through round 16 (2026-08-02) and now round 17
(2026-08-03) — three consecutive research-only rounds from this dedicated
schedule, one per day, against a backlog that already had 14+ open items
and gained zero new checklist entries this round. Re-flagged more visibly
in ROADMAP.md's log line this time, since the quiet version didn't reach
the owner.

Split into the same four parallel passes as recent rounds: NovelCrafter +
Sudowrite; Dabble + Scrivener + Campfire; type.ai + Obsidian + Notion (plus
a scan for new local-first entrants); and a broader industry/legal-
sentiment sweep. Each was briefed on everything rounds 1-16 already found
and told to report only genuinely new material dated in roughly the last
10 days to 3 weeks, and to say plainly if nothing qualified rather than pad
with re-summaries.

## The research well for named competitors is running dry on a daily cadence

Three of four passes came back substantially empty after real search
effort, and said so honestly rather than padding:

- **NovelCrafter and Sudowrite:** no material dated within ~10 days of
  round 16 found anywhere — not on either company's own changelog/status
  page (both largely blocked direct fetches; indexed search snippets used
  instead), not on Trustpilot, not on Reddit. The only Sudowrite item
  surfaced (Claude Opus 4.8 + Ballad 1.1 model, a "Free Excellent Friday"
  promo) is from June 5, 2026 — roughly eight weeks old, already stale
  before this project ever logged it, not new.
- **Dabble, Scrivener, and Campfire:** same result. Scrivener's version
  history was checked in detail (3.5, 3.5.1, 3.5.2) and all releases
  predate round 16. A Campfire mobile-app "last updated" date conflict
  between search snippets (July 3 vs. July 29, 2026 for v1.3.2) looks like
  Play Store re-indexing noise, not a real release — could not confirm a
  version bump via direct fetch (403).
- **type.ai, Obsidian, Notion specifically:** no movement found beyond
  what rounds 1-16 already logged.

This is worth noting plainly for whoever tunes this schedule: a daily
cadence is now outpacing how often these specific companies actually ship
or get reviewed. A weekly or biweekly interval would very likely catch the
same signal with far less wasted search effort per round.

## What did surface: reinforcement and one new design nuance, not a new gap

**Local-first competitors still don't touch the fourth app, now checked
directly rather than assumed.** A dedicated search asked specifically
whether LocalProse or Novel Mage — the two most-direct local-AI-drafting
competitors already logged — have added anything resembling task/goal
tracking or a focus/sprint timer since they were first found. Neither has.
LocalProse's own site (updated June 25, 2026) lists a "Focus mode" but
that's the extent of it — no task manager, no goal streaks. This converts
the fourth-app-gap claim from "true as of when we last checked" to "true as
of a dedicated recheck this round," which is worth more in a competitive
claim than the earlier phrasing implied.

**Novel Mage's per-task model-switching is a genuinely new nuance, not
previously logged.** Earlier rounds noted Novel Mage runs local models via
Ollama/LM Studio. This round found more: a writer can switch models *per
task within one project* — a fast local model for drafting, a cloud model
like Claude for nuanced rewrites — rather than committing to one model for
the whole project. Novella already supports multiple providers (local
Ollama by default, optional cloud providers like Anthropic), but not this
specific per-task hot-swap pattern. Worth studying as a possible UX
direction before building it — it's a middle path between "pure local" and
"pure cloud" that blurs the local-first line somewhat, which is exactly the
kind of design decision that should be made deliberately rather than
absorbed by imitation. Filed as a note, not a build item.

**Two more local-first entrants, neither closing the gap:**

- **Mergen Ink** (free beta, macOS/Windows) — local-first file storage
  with on-device encrypted API keys, but its AI runs through BYOK cloud
  providers (Claude/Gemini/GPT-4), not a true local LLM. Architecturally
  closer to Scribeist (local shell, cloud brain) than to Novella (local
  shell, local brain by default). Source: [mergen.ink](https://mergen.ink/)
- **Epilogue** (Product Hunt, ~late June 2026) — local-first, offline,
  plain-Markdown novel/script/poetry app, no subscription, but explicitly
  ships **no AI at all**. The newest local-first entrant found yet, and it
  still doesn't combine local-first + AI + the four-app bundle in one
  place — if anything this reinforces the thesis rather than threatens it.
  Source: [Epilogue on Product Hunt](https://www.producthunt.com/products/epilogue-book-writing-app)

**A sharper, quotable illustration for the no-training item — same
lawsuit already logged, not a new one.** Round 14 already logged the
Hachette/Cengage/Elsevier/Scott Turow suit against Google over Gemini's
book-training data (filed the week of July 13-15, 2026). This round found
a specific detail from the complaint itself worth quoting directly in
future copy instead of the abstract "trained on scraped books" framing: it
alleges Gemini can generate "a 100-page murder mystery set in a quiet
seaside town... that substitutes for an original copyrighted murder
mystery on which Gemini trained" in 20 minutes for 39 cents. Concrete,
fiction-specific, and cheap to verify against the complaint text if it's
ever quoted publicly. Sources:
[TechCrunch](https://techcrunch.com/2026/07/14/google-faces-another-ai-training-lawsuit-from-major-publishers/),
[Al Jazeera](https://www.aljazeera.com/economy/2026/7/15/authors-publishers-sue-google-over-alleged-ai-copyright-infringement)

## Landscape notes (no action)

**An unverified "78% of authors now use AI, up 33% from 2024, 61% deeply
concerned about training" stat is circulating under an "Authors Guild 2026"
attribution and should not be cited.** It could not be traced to any
primary Authors Guild report or press release this round — the Guild's own
published figures (its actual November 2025 survey, already identified in
round 16 as the likely real source behind this project's long-standing "96%
want consent" citation) use different numbers and different wording. This
looks like the same class of content-mill stat-recirculation round 15 and
16 already flagged for other figures. Do not cite the 78%/33%/61% numbers
in any Novella copy without tracing them to a primary source first.

**The Bartz v. Anthropic settlement's payout structure was found with more
precision than previously logged** (~$3,000 per work across roughly
500,000 works) but this is the same settlement already logged in rounds 14
and 15 under a slightly different framing (~$1.5B total, ~350 authors
opting out of roughly a million works) — both figures describe the same
settlement from different angles (per-work payout vs. total pool size,
opted-in vs. total-eligible-work counts) rather than a contradiction. Not
logged as a correction; the existing item's numbers stand, this is just a
confirmation from a second angle.

**Nothing new surfaced for NovelCrafter, Sudowrite, Dabble, Scrivener,
Campfire, type.ai, Obsidian-for-writers, or Notion writing templates**
beyond what rounds 1-16 already found, despite real search effort across
each company's own changelog/status pages (where reachable), Trustpilot,
Google Play, and Reddit.

## Round 17 sources

- [feedback.sudowrite.com/changelog/opus-48-new-plugin-editor-free-excellent-friday-and-more](https://feedback.sudowrite.com/changelog/opus-48-new-plugin-editor-free-excellent-friday-and-more)
- [Sudowrite status page](https://status.sudowrite.com/)
- [NovelCrafter blog](https://www.novelcrafter.com/blog)
- [Mergen Ink](https://mergen.ink/)
- [Epilogue — Product Hunt](https://www.producthunt.com/products/epilogue-book-writing-app)
- [LocalProse](https://www.localprose.com/en/)
- [Novel Mage — local models](https://novelmage.com/resources/local-models)
- [Novel Mage](https://novelmage.com/)
- [Google faces another AI training lawsuit from major publishers — TechCrunch](https://techcrunch.com/2026/07/14/google-faces-another-ai-training-lawsuit-from-major-publishers/)
- [Authors, publishers sue Google over alleged AI copyright infringement — Al Jazeera](https://www.aljazeera.com/economy/2026/7/15/authors-publishers-sue-google-over-alleged-ai-copyright-infringement)
- [Court grants final approval of Anthropic copyright settlement — Authors Guild](https://authorsguild.org/news/court-grants-final-approval-anthropic-copyright-settlement/)
- [Anthropic's landmark $1.5B copyright settlement is approved — TechCrunch](https://techcrunch.com/2026/07/20/anthropics-landmark-1-5b-copyright-settlement-is-approved/)
- [Commission starts enforcing AI Act rules and new transparency requirements — European Commission](https://digital-strategy.ec.europa.eu/en/news/commission-starts-enforcing-ai-act-rules-and-new-transparency-requirements-2-august)

# Round 18 (2026-08-04)

One day after round 17, and the fourth consecutive day this dedicated
research schedule has fired research-only (rounds 15, 16, 17, 18 — Aug 1
through Aug 4). Round 17 already re-flagged this in ROADMAP.md's log line
after rounds 15 and 16's quieter notes went unaddressed; that flag is
repeated once more in this round's log line and then intentionally not
repeated a fifth time — see ROADMAP.md's Round 18 entry for the full
argument and the numbers behind it.

Split into the same four parallel passes as rounds 15-17: NovelCrafter +
Sudowrite; Dabble + Scrivener + Campfire; type.ai + Obsidian + Notion (plus
a new-entrant scan); and a broader industry/legal-sentiment sweep. Each was
briefed on rounds 1-17's findings and told to search specifically for
material dated after 2026-07-30 and report "nothing new" plainly rather
than pad with re-summaries.

## Three of four passes: confirmed empty, with a new access wrinkle

NovelCrafter, Sudowrite, Dabble, Scrivener, and Campfire all returned
nothing genuinely new dated after 2026-07-30 across 30+ combined search
queries. New this round: direct fetches of feedback.novelcrafter.com,
feedback.sudowrite.com, status.sudowrite.com, Trustpilot, and the
Literature & Latte forum all returned HTTP 403 — every finding this round
relies on search-engine indexed snapshots of those pages rather than a
live read, which can lag the real page by days to weeks. Worth flagging
for whoever tunes future rounds: if this 403 pattern persists, findings
from these sources should be treated as lower-confidence than in rounds
where direct fetch worked.

The type.ai/Obsidian/Notion/new-entrant pass was equally dry: no product
update for type.ai, no new novelist-specific Obsidian plugin, no Notion
template-marketplace activity, and — checked directly for a third time,
after rounds 15 and 17 — no competitor of any kind, named or brand-new,
pairs a task tracker with a focus/sprint timer alongside writing and
worldbuilding. Two tools surfaced that are not on the tracked list but
are not new either: Novel Forge AI (mediachance.com), a rebrand of
"CQuill Writer" dating to early 2025, and novelistAI (novelistai.com),
cloud-based (GPT-5.6/Grok-4.5) rather than local, with no confirmed launch
date in the window. Neither qualifies as a fourth wave of local-AI
entrants.

## What did surface: one item worth folding in, two worth naming only

**A Cambridge/Minderoo Centre novelist survey, previously unlogged, adds a
sharper personal-impact stat to the no-training item.** Dr. Clementine
Collett's study for Cambridge's Minderoo Centre for Technology and
Democracy surveyed 258 published UK novelists plus 74 industry insiders
(commissioning editors, literary agents), published November 2025 — dated
well before this project's research window but not previously found or
logged in rounds 1-17. Headline numbers: 59% of novelists say they know
their own work has trained an LLM without permission or payment; 51%
believe AI is likely to *entirely replace* their work as fiction writers;
39% say their income has already been hit by generative AI, and 85%
expect future income to fall because of it; two-thirds of respondents rank
romance authors as "extremely threatened," followed by thriller (61%) and
crime (60%) writers. This is a harder, more personal number than the
existing "96% want consent" stat (which itself traces to the Authors
Guild's ~Nov 2025 survey, per round 16) — folded into the no-training item
in ROADMAP.md as an addition, not a replacement. Sources:
[University of Cambridge](https://www.cam.ac.uk/stories/generative-ai-novelists),
[EurekAlert!](https://www.eurekalert.org/news-releases/1105954),
[TechXplore](https://techxplore.com/news/2025-11-novelists-ai.html)

**Two more items are directly thesis-adjacent but not actionable for
Novella's own roadmap — logged here for awareness, not folded into any
build or copy item:**

- **An arXiv study on AI-flooded self-published books** (Chakrabarty, Liu,
  Ginsburg, Dhillon — Stony Brook / Columbia Law / Michigan / MIT,
  submitted July 22 2026, revised July 26) analyzed 14,419 self-published
  Amazon genre-fiction ebooks (2023-2026) matched against sales through
  June 2026. Books with substantial detected AI text (>25%) are a growing
  share of both catalog and sales, increasingly taking the scarce top-rank
  positions once held by books with no detected AI text; across the study
  period the number of books with observed sales grew 19.2x while revenue
  grew only 8.9x — the market is diluting faster than it's growing. This
  is about the self-publishing marketplace, not a writing tool, so it
  doesn't point at a Novella feature gap — noted for context on how the
  broader AI-fiction conversation is trending, in case it's useful
  background for future copy about AI-assisted vs. AI-generated work.
  Source: [arXiv:2607.20349](https://arxiv.org/abs/2607.20349)
- **The "Daggermouth" AI-detection controversy.** A Stony Brook team (same
  researchers as above) scanned 14,000+ Kindle ebooks with the Pangram
  AI-detection tool and flagged *Daggermouth*, a BookTok-viral Simon &
  Schuster (Scarlett Press/Tor Bramble) bestseller by H.M. Wolfe, at 60%
  AI-likelihood — the highest score of any popular title in the dataset,
  and higher than an outside University of Maryland reviewer called
  "almost statistically impossible" for fully human writing, though that
  same reviewer noted AI-assisted-with-heavy-editing is a real gray zone
  for detection tools. The study isn't peer-reviewed; Wolfe's lawyer and
  Simon & Schuster both deny AI use and stand behind the book; Tor Bramble
  publicly backed the author. No Novella angle (Novella isn't a detection
  or publishing-compliance tool) — logged for awareness only. Sources:
  [Book Riot](https://bookriot.com/study-claims-viral-bestseller-daggermouth-is-ai-generated/),
  [Tech Times](https://www.techtimes.com/articles/321780/20260728/daggermouth-hardcover-drops-today-booktok-hit-flagged-ai-researchers.htm),
  [The Bookseller](https://www.thebookseller.com/news/tor-bramble-backs-h-m-wolfe-after-ai-detection-claims-over-daggermouth)

## Landscape notes (no action)

**Nothing new found for AI-copyright litigation, EU AI Act enforcement
actions, or NaNoWriMo-successor tools beyond what rounds 1-17 already
logged**, despite 14+ dedicated searches. A six-author suit against
Anthropic/OpenAI/Google/Meta/xAI/Perplexity (Carreyrou et al., opted out
of the Bartz settlement, seeking $150k/work) was found but dates to
December 23, 2025 — predates this project's entire research window and
isn't newly relevant, noted only in case a future round needs the
reference. A recurring "39% worried about training data, 52% would refuse
certain AI tools" stat cluster appears in secondary blog roundups
(CipherWrite and similar) with no traceable primary source — likely a
mangled restatement of the Authors Guild 96% figure — not cited anywhere
in this project's copy.

## Round 18 sources

- [Half of UK novelists believe AI is likely to replace their work entirely — University of Cambridge](https://www.cam.ac.uk/stories/generative-ai-novelists)
- [Half of novelists believe AI is likely to replace their work entirely, research finds — EurekAlert!](https://www.eurekalert.org/news-releases/1105954)
- [Half of novelists believe AI is likely to replace their work entirely, research finds — TechXplore](https://techxplore.com/news/2025-11-novelists-ai.html)
- [Generative AI floods and dilutes the market for books — arXiv:2607.20349](https://arxiv.org/abs/2607.20349)
- [Study Claims Viral Bestseller DAGGERMOUTH is AI-Generated — Book Riot](https://bookriot.com/study-claims-viral-bestseller-daggermouth-is-ai-generated/)
- [Daggermouth Hardcover Drops Today: BookTok Hit Flagged as AI by Researchers — Tech Times](https://www.techtimes.com/articles/321780/20260728/daggermouth-hardcover-drops-today-booktok-hit-flagged-ai-researchers.htm)
- [Tor Bramble backs HM Wolfe after AI-detection claims over Daggermouth — The Bookseller](https://www.thebookseller.com/news/tor-bramble-backs-h-m-wolfe-after-ai-detection-claims-over-daggermouth)

# Round 19 (2026-08-05)

Fifth consecutive day this dedicated research schedule has fired
research-only (rounds 15-19, Aug 1 through Aug 5). Round 18 already logged
the cadence flag a fourth time and explicitly said it would stop repeating
it — that decision stands; this round doesn't re-raise it, per round 18's
own note that doing so a fifth time would add no new information.

Split into the same four parallel passes as rounds 15-18: NovelCrafter +
Sudowrite; Dabble + Scrivener + Campfire; type.ai + Obsidian + Notion (plus
a new-entrant scan); and a broader industry/legal-sentiment sweep. Each was
briefed on rounds 1-18's findings and told to search specifically for
material dated after 2026-08-04.

## Two of four passes: confirmed empty

Dabble, Scrivener and Campfire came back dry after 9 searches and 4
direct-fetch attempts (dabblewriter.com/blog, literatureandlatte.com
release notes, campfirewriting.com/blog, and Trustpilot all 403'd). Search
itself was noisier than usual this round: "Campfire" collides with an
unrelated AI-native ERP fintech startup that just raised a Series B, and
"Dabble" collides with an unrelated UK/AU sports-betting company — both
polluted result pages without surfacing anything from the actual writing
tools. Confirmed-stale, no change: Scrivener still 3.5.2 (Mac) / 3.1.6
(Windows); Campfire mobile still v1.3.2 (~July 8 2026), cursor-jump bug
still unfixed as far as public reports show.

NovelCrafter came back dry too: no changelog, pricing, or review activity
found dated after July 30, 2026 (its own blog's latest post is still
June 11). The feedback/changelog subdomain is still 403ing to direct
fetch, consistent with rounds 17-18.

## What did surface: one real item, one architectural near-miss, two landscape-only

**A second, distinct Sudowrite outage.** Status page incident 877582
records app-wide errors and login failures Aug 1-3, 2026 — separate from
the already-logged April 22-23 outage, not a re-report of it. A Google
Play review thread (posted Aug 1, Sudowrite's official reply Aug 3)
independently reports laggy/unstable chat, AI response freezing, and
file-deletion bugs following a prior app update; Sudowrite's reply
promised a "fresh update" that week and asked the reviewer to confirm
afterward. Folded into the no-outage item in ROADMAP.md: two separate
outage incidents in under four months is a pattern, not a one-off, and
meaningfully wears down the "actively triaging reliability" caveat this
project has carried since round 14 as a reason not to over-claim.
(Lower-confidence aside, not folded in: aggregator/SEO sites describe a
"Story Engine 3.0" and "Canvas 2.0" as 2026 Sudowrite flagship features,
but these version numbers appear only in third-party content-farm
material, never in Sudowrite's own materials, which stayed 403'd to
direct fetch this round — treat as unconfirmed, possibly inflated, not
cited in ROADMAP.md.)

**PlotForge Desktop — the closest architectural analog to Novella found
yet, still doesn't close the fourth-app gap.** plotforge.app: $69 one-time
(rising to $79), local AI via Ollama/LM Studio, SQLite local storage, 11
bundled tools including 60+-field worldbuilding, an Idea Board, Outline,
Characters, Timeline, and a Consistency Checker. Closer to Novella's own
local-AI-plus-worldbuilding shape than any prior entrant (LocalProse,
Novel Mage, Noveling, Storyloft, Scribeist, Novelist, Mergen Ink,
Epilogue). It has a "Sessions" tool of unconfirmed purpose — reads from
available description as session/word-count logging rather than a focus
or sprint timer — and no dedicated task tracker was found anywhere in its
feature list. The direct check for a task-tracker-plus-sprint-timer
competitor (run a fourth time now, after rounds 15, 17, 18) again came
back negative. Folded into the four-app-bundle item as reinforcement, with
PlotForge named as the one to watch if it adds a timer later.

Two more items surfaced outside the five tracked categories, logged here
for awareness only — neither was folded into a ROADMAP.md build or copy
item, because neither points at a specific Novella action:

- **OpenAI's EU AI Act compliance gap.** A July 31, 2026 report says
  OpenAI's own Article 53 compliance statement omits the copyright/
  training-data-transparency chapter of the GPAI Code of Practice — no
  public training-data summary, no documented text-and-data-mining
  opt-out policy — filed right before the EU AI Office's enforcement
  powers activated August 2. This is the first concrete example this
  project has found of a named major provider with a visible Article 53
  gap, rather than the purely hypothetical enforcement discussed in
  rounds 15-16. Relevant background if Novella's own Article 53-exemption
  reasoning (round 16) ever needs restating to a reporter, but doesn't
  change what Novella should say today. Source:
  [Tech Times](https://www.techtimes.com/articles/322519/20260731/openais-eu-ai-act-statement-skips-training-data-copyright-gap-activates-sunday.htm)
- **A $2.4M two-book deal pulled over AI-prose suspicion.** Minotaur/
  Macmillan withdrew from a 14-way-auction deal for debut author Jerry
  Falade's thriller "Call Me, I'll Hide the Body" in late July/early
  August 2026, after readers flagged AI-typical prose (negative
  parallelism, off-kilter metaphors); reporting frames the real driver as
  a copyright chain-of-title concern — publishers can't cleanly register
  copyright if AI-generated passages are mixed into a manuscript. A fresh,
  concrete case distinct from the already-logged "Daggermouth" story, and
  the first to hit a front-list trade deal rather than a self-published or
  already-published title. Deliberately NOT turned into a "Novella's edit
  history proves human authorship" marketing angle: Novella's AI writes
  prose directly into the document at the writer's request, so a
  provenance-history claim would overstate what the app can actually
  attest to about any given passage's origin — an honest positioning
  problem, not a gap to paper over. Noted here so a future round doesn't
  reach for this hook without the same caveat. Sources:
  [Publishers Lunch](https://lunch.publishersmarketplace.com/2026/07/seven-figure-book-deal-cancelled-over-ai-suspicions-raises-questions-about-ai-guardrails/),
  [Boing Boing](https://boingboing.net/2026/07/31/unpublished-novels-2-4m-deal-pulled-over-ai-concerns.html),
  [Futurism via Yahoo](https://www.yahoo.com/entertainment/articles/major-publisher-cans-2-4-205939362.html)

## Landscape notes (no action)

Nothing new found for type.ai, Obsidian-for-writers plugins (Longform
still v2.1.0 from March 2025; Novel Word Count's latest release, v4.6.4,
predates this round's window at July 5), or Notion novel/writing
templates. NaNoWriMo-successor landscape unchanged — same fragmented list
(Pacemaker, Trackbear, Reedsy Novel Sprint, etc.) plus one minor,
insignificant new entrant ("Authorlytica," not chased further). EU AI Act
enforcement mechanics reconfirmed (Aug 2 2026 start, up to €15M/3% global
turnover in fines) but no fine has actually been issued against anyone
yet. A claim of "hundreds of authors returning book advances" surfaced in
one AI-generated summary blurb with no traceable primary source —
excluded, not cited.

## Round 19 sources

- [Sudowrite status incident 877582 — app-wide errors, Aug 1-3 2026](https://status.sudowrite.com/incident/877582)
- [OpenAI's EU AI Act statement skips training-data copyright gap as enforcement activates — Tech Times](https://www.techtimes.com/articles/322519/20260731/openais-eu-ai-act-statement-skips-training-data-copyright-gap-activates-sunday.htm)
- [Seven-figure book deal cancelled over AI suspicions raises questions about AI guardrails — Publishers Lunch](https://lunch.publishersmarketplace.com/2026/07/seven-figure-book-deal-cancelled-over-ai-suspicions-raises-questions-about-ai-guardrails/)
- [Unpublished novel's $2.4M deal pulled over AI concerns — Boing Boing](https://boingboing.net/2026/07/31/unpublished-novels-2-4m-deal-pulled-over-ai-concerns.html)
- [Major publisher cans $2.4 million book deal — Futurism via Yahoo Entertainment](https://www.yahoo.com/entertainment/articles/major-publisher-cans-2-4-205939362.html)

# Round 20 (2026-08-06)

Sixth consecutive day this dedicated research schedule has fired
research-only (rounds 15-20, Aug 1 through Aug 6). Per round 19's explicit
note ("repeating the same request a fifth time next round would add no new
information the owner doesn't already have — logging it here once more,
plainly, and stopping"), this round does not re-raise the cadence flag.

Split into the same four parallel passes as rounds 15-19: NovelCrafter +
Sudowrite; Dabble + Scrivener + Campfire; type.ai + Obsidian + Notion (plus
a new-entrant scan); and a broader industry/legal-sentiment sweep. Each was
briefed on rounds 1-19's findings and told to search specifically for
material dated after 2026-08-05, the narrowest window yet (roughly one day).

## All four passes: confirmed empty

This is the first round in the cadence where all four passes independently
came back with nothing dated after the prior round's cutoff, after real
search effort in each (12, 12, 12, and 14 searches respectively, plus
several direct-fetch attempts that continued to 403 across
status.sudowrite.com, feedback.novelcrafter.com, dabblewriter.com,
literatureandlatte.com forums, campfirewriting.com, and plotforge.app —
consistent with the access pattern noted since round 17).

**NovelCrafter/Sudowrite**: no changelog, pricing, review, or outage
activity found past 2026-08-05. NovelCrafter's blog is still dated June 11;
its changelog's latest confirmed entry remains March 21. Sudowrite's known
Aug 1-3 outage thread and Kimi K3 addition were re-surfaced, not new.

**Dabble/Scrivener/Campfire**: no changelog, pricing, or outage activity
found past 2026-08-05. Dabble and Campfire app versions unchanged from
round 19 (Campfire 1.3.2, updated July 29). A Campfire "State of the
Campfire: 2026" roadmap page was found but 403'd before its publish date
could be confirmed, so it was not logged as new.

**type.ai/Obsidian/Notion/new-entrants**: no news dated past 2026-08-05.
Two Obsidian plugin version bumps surfaced but both predate the window —
Novel Word Count v5.0.0 (Aug 3, added a save-counts-to-disk toggle) and
StoryLine v1.10.55 (Aug 2) — neither adds task-tracking or a focus timer.
The task-tracker-plus-sprint-timer check was run a fifth time (after
rounds 15, 17, 18, 19) and again found nothing. PlotForge Desktop's
"Sessions" tool remains unconfirmed as a focus timer: a secondary-source
description ("session timer, words-per-session tracking, project
statistics dashboard, Next Actions Engine") still reads as logging rather
than a Pomodoro-style timer, but the site's continued 403 means this
can't be confirmed from a primary source either way.

**Industry/legal**: no new lawsuit filing, ruling, EU AI Act enforcement
action, survey, or AI-book controversy dated past 2026-08-05. The EU AI
Act's Article 53 fine tiers are live but multiple sources confirm no
public fine or named complaint has actually been issued yet. One
previously-unlogged but pre-window item surfaced: Hachette/Orbit pulled a
novel called "Shy Girl" in March 2026 over reader-flagged AI-typical prose
— the same copyright-chain-of-title dynamic as round 19's Macmillan/
Minotaur pull, just an earlier, previously-untracked instance of it. Not
folded into any ROADMAP.md item for the same reason round 19 gave for the
Macmillan case: Novella's own AI writes prose directly into the document
at the writer's request, so a "provenance proves human authorship" angle
would overstate what the app can attest to about any given passage.
Landscape note only.

## What changed in ROADMAP.md

One amendment, to the four-app-bundle item: the fifth "still no
task-tracker-plus-timer competitor" confirmation and the two Obsidian
plugin version bumps (neither closing the gap). No new checklist items —
nothing this round cleared the bar of being both new and dated within the
window. This is the emptiest round of the cadence to date; six straight
research-only firings (rounds 15-20) against the same narrowing daily
window is very likely why, not a change in search quality — noted as
observation, not as the cadence flag round 19 said not to repeat.

## Round 20 sources

No new primary sources this round — every item found either predates the
2026-08-05 research window (Novel Word Count v5.0.0, Aug 3; StoryLine
v1.10.55, Aug 2; the Hachette/Orbit "Shy Girl" pull, March 2026) or
re-confirms a source already cited in an earlier round's list (Sudowrite
incident 877582, round 19; the Macmillan/Minotaur coverage stream, round
19). See those rounds' source lists rather than duplicating links here.

# Round 21 (2026-08-07)

Seventh consecutive day this dedicated research schedule has fired
research-only (rounds 15-21, Aug 1 through Aug 7), and the second straight
round where every pass came back essentially dry for new competitor
material. Same four parallel passes as rounds 15-20: NovelCrafter +
Sudowrite; Dabble + Scrivener + Campfire; type.ai + Obsidian + Notion (plus
a new-entrant and task-tracker-plus-timer recheck); and the broader
industry/legal sweep. Each was briefed on rounds 1-20's findings and told
to search specifically for material dated after 2026-08-05/06, and, if that
window was dry, to widen slightly rather than pad with restated facts.
Roughly 12-13 searches per pass.

## NovelCrafter / Sudowrite

No NovelCrafter changelog, pricing, or review activity found past
2026-08-05 — its blog is still dated June 11, its changelog's latest
confirmed entry is still March 21, and its status page shows no incidents
in the last 14 days.

One genuinely new Sudowrite item, dated just inside the window: a
changelog entry titled **"Cheaper GPT-5.6 Models, Plus a Batch of Chat
Fixes"** (Aug 3, 2026, https://feedback.sudowrite.com/changelog/cheaper-gpt-56-models-plus-a-batch-of-chat-fixes).
It cuts GPT-5.6 Luna's credit cost by 70%, Terra's by 10%, and GPT-5.5's by
~12% — Sudowrite passing through OpenAI's own July 30, 2026 price cuts on
those tiers rather than an unprompted generosity move. Also ships three
chat fixes: the "working" indicator now shows in Chat Only mode (previously
only visible in Allow Edits mode); asking about one specific item in Chat
no longer triggers a full Feedback sweep across every review type (this had
been silently burning extra credits); and Resend now properly retries a
stalled response instead of erroring. This implies an earlier, separate
changelog entry added GPT-5.6 (Sol/Terra/Luna) support in the first place —
likely mid-to-late July 2026, exact date unconfirmed and not previously
logged — worth a targeted check next time the research well isn't already
this dry. Folded into the no-credit-limits item: Sudowrite's own bug fix
(a single Chat question silently burning credits across every review type)
is a concrete instance of the exact throttling anxiety that item already
tracks, from Sudowrite's own mouth rather than a user complaint.

Everything else this pass surfaced — billing/subscription-pause
complaints, "not fit for purpose" Trustpilot reviews, NovelCrafter's fixed
4-tier pricing, the January AI Thinking toggle, March Codex updates —
matches facts already logged in rounds 1-20 and is not new.

Access note (unchanged from round 18 on): feedback.novelcrafter.com and
status.sudowrite.com are still blocked to direct fetch by the network
egress proxy; changelog/status contents came from search-result snippets
only, so a live fetch might surface entries search indexing hasn't picked
up yet.

## Dabble / Scrivener / Campfire

No changelog, pricing, AI-feature, or outage activity found past
2026-08-05/06 for any of the three — the second straight dry round for
this pass specifically.

One item surfaced with content but no confirmable date: the **"State of
the Campfire: 2026"** roadmap page (campfirewriting.com/learn/state-of-the-campfire-2026,
still 403 to direct fetch, content came from a search snippet) lists 2026
priorities as faster performance, fewer bugs, "major Encyclopedia & panel
upgrades," better mobile writing, cleaner navigation, and new
gamification features — streaks, achievements, and challenges. No AI
features mentioned anywhere on the page. It also recaps 2025: the Campfire
community wrote 210M+ words and published 1,000+ books that year. Because
no publish date is visible in the snippet, this can't be confirmed as new
material from this window, but the content itself hadn't been captured by
any prior round, so it's logged here and folded into the four-app-bundle
item as a landscape note: Campfire is investing in streaks/achievements
(overlapping Novella's own daily-goal/streak system) and explicitly not
in AI or task/time tools, which is more reinforcement, not a narrowing,
of the fourth-app gap.

Confirmed but minor: Scrivener's Mac build (still v3.5.2, no 3.5.3) picked
up macOS 26 "Tahoe" compatibility fixes — a Liquid Glass app icon, a
trackpad-scroll-lag fix, and a workaround for an Apple list-formatting
bug — but no date past early October 2025 could be confirmed for this
release, so it's not being treated as new-this-window. Windows remains
frozen at 3.1.6. Literature & Latte's long-teased next-gen app remains in
undisclosed beta; one forum thread ("Scrivenix Beta Update — Scrivener on
Linux") is an unofficial third-party project, not L&L's own next-gen app —
flagged so a future round doesn't mistake the two.

Search-collision note, worth carrying forward: "Campfire" increasingly
collides with Campfire (campfire.ai), an unrelated AI-native finance/
accounting platform that raised a $65M Series B and ships "Ember Agents"
for AP/AR automation; "Dabble" collides with Dabble Sports Pty Ltd, an
Australian sports-betting app (dabble.com.au). Both collisions are getting
worse as general search indices grow, not better — future rounds should
qualify queries with "writing" or "novelist" explicitly.

The sub-agent running this pass recommended, unprompted, either dropping
cadence to every 2-3 days for this specific trio or widening scope (e.g.,
checking Squibler as an adjacent competitor) given two consecutive dry
rounds. Recorded here as input for the owner, not acted on unilaterally.

## type.ai / Obsidian / Notion / new-entrant scan

**Task-tracker + focus-timer check, run a sixth time (after rounds 15, 17,
18, 19, 20): still no.** Nothing found pairs a task/to-do tracker with a
sprint/focus timer alongside writing and worldbuilding tools in one app.
Closest analogues remain generic productivity apps with zero writing
features (TickTick, Focus To-Do) and ScribeCount's AuthorFLOW, a Pomodoro
timer that logs word counts but has no task list or worldbuilding.
Novelist-specific sprint/streak tools (Final Draft, Novlr, WriteMate, My
Write Club) offer timers alone, no task manager.

**PlotForge Desktop's "Sessions" tool, partially clarified.** Direct fetch
to plotforge.app is now blocked at the network-egress level in this
environment (not just a 403), but a Capterra listing surfaced PlotForge's
full 11-tool list for the first time: Idea Board, Outline, Characters,
Worldbuilding, Draft Editor, AI Chat, Story Compass, Consistency Checker,
Timeline, Sessions, and Export. "Sessions" is listed distinctly from
"Timeline" (which is the plot/story timeline), which leans the reading
toward Sessions being a writing-session/word-count time log rather than a
Pomodoro-style focus timer — but no source (Capterra, PeerPush,
AlternativeTo) explicitly describes it as either a task list or a focus
timer, so this stays an inference, not a confirmation.

No new local-AI-for-novelists competitor found. One curiosity, checked and
ruled out: **novelist.saber-ai.org**, a Tauri-powered, open-source,
CJK-native, 12MB Markdown writing app on GitHub — a different product from
the already-tracked "Novelist" ($49 one-time Windows app), and no AI
features surfaced in any description found. Not worth tracking unless
evidence of AI features emerges.

type.ai: no update or news since Aug 5, same feature set (structured
outlining, 130k-word docs, multi-model access). Notion templates: no
genuinely new templates since Aug 5, same catalog as prior rounds (Novel &
Fanfic Writer Hub, Book Builder AI, World Building Bible); one listing
notes a Pomodoro timer bundled into a template, but that's a Notion widget
inside a template, not a competing product with the feature natively.

## Broader industry / legal sentiment

No new lawsuit filing, ruling, EU AI Act enforcement action or fine, fresh
survey, or AI-book-deal controversy dated after 2026-08-05 turned up after
10 searches across lawsuit trackers, EU Act enforcement news, book-deal
scandal follow-ups, Authors Guild, novelist surveys, AI-detector
controversies, and NaNoWriMo-successor events. Everything surfaced
predates the window and is already logged or is old enough not to need
logging:

- Carreyrou et al. v. Anthropic/OpenAI/Google/Meta/xAI/Perplexity (opt-outs
  from the Bartz settlement seeking $150K/title) — filed December 2025.
- AAP/Elsevier/Cengage/Hachette/Macmillan/McGraw Hill/Turow class action
  against Meta & Zuckerberg over Llama training — filed May 5, 2026.
- The Granta/Commonwealth Foundation Short Story Prize AI-authorship
  controversy ("The Serpent in the Grove," flagged 100% AI by Pangram,
  Granta severed ties by July 1) — surfaced mid-May through June 2026.
- EU AI Act Article 53 enforcement is confirmed live (up to €15M/3% global
  turnover) but still zero fines or named complaints actually issued as of
  the most recent reporting found.
- The Minotaur "Call Me, I'll Hide the Body" AI-suspicion deal collapse —
  already logged; reconfirmed with more detail this round (agents Marc
  Gerald/Ashley Coleman at Europa Content; Pangram scored the manuscript
  99% AI; the author denies AI use).
- Authors Guild's Human Authored certification and AI best-practices
  update — dated March-May 2026, old.

Structural note, not news: NaNoWriMo itself shut down permanently in
March/April 2025 (funding collapse, previously logged). Its de facto
successor remains Reedsy's Novel Sprint (November, $5,000 prize + agent
intros) and a "30k in 30 Days" StoryForge challenge — no autumn-2026
registration announcement has posted yet.

## What changed in ROADMAP.md

No new checklist items — nothing this round cleared the bar of being both
new and dated within the window. Three small findings were folded into
existing items rather than added as bullets: Sudowrite's Aug 3 credit-cost
cut and Chat credit-burn bug fix (no-credit-limits item); the sixth
negative task-tracker-plus-timer recheck plus the first full PlotForge
Sessions feature-list clarification and the Campfire 2026 roadmap page
(four-app-bundle item, both folded together). Two dead ends were logged
above so future rounds don't re-chase them (Scrivener's undated Tahoe
compatibility fixes; the worsening Campfire/Dabble name collisions).

Per round 19's explicit note that repeating the cadence-frequency flag a
fifth time would add no new information, this round does not raise it as
a new escalation. It is nonetheless worth recording plainly, once, that
two independent sub-agents this round — the Dabble/Scrivener/Campfire pass
and the broader industry/legal pass — each recommended on their own,
unprompted, either widening scope or reducing frequency given two
straight dry rounds. That is now four separate signals pointing the same
direction (three prior owner-facing log entries plus these two
independent sub-agent observations), recorded here rather than repeated
as another direct request.

## Round 21 sources

- [Sudowrite changelog — Cheaper GPT-5.6 Models, Plus a Batch of Chat Fixes (Aug 3, 2026)](https://feedback.sudowrite.com/changelog/cheaper-gpt-56-models-plus-a-batch-of-chat-fixes)
- [Campfire — "State of the Campfire: 2026" roadmap page](https://campfirewriting.com/learn/state-of-the-campfire-2026)
- PlotForge Desktop feature list via Capterra listing (URL not directly retrievable; site egress-blocked)

# Round 22 (2026-08-08)

Eighth consecutive day this dedicated research schedule has fired
research-only (rounds 15-22, Aug 1 through Aug 8), and the first fully dry
round on record — all four passes independently found nothing dated after
round 21's 2026-08-07 cutoff, not just thin material. Same four parallel
passes as rounds 15-21: NovelCrafter + Sudowrite; Dabble + Scrivener +
Campfire; type.ai + Obsidian + Notion (plus new-entrant and
task-tracker-plus-timer recheck); and the broader industry/legal sweep.
Each was briefed on rounds 1-21's findings and told to search specifically
for material dated after 2026-08-07. 10-16 searches per pass.

## NovelCrafter / Sudowrite

Nothing new. Sudowrite's Aug 3 "Cheaper GPT-5.6 Models" changelog entry
(already logged in round 21) remains the latest; its status page shows no
incident since the Aug 1-3 one already logged. NovelCrafter's changelog
still tops out at March 2026 for confirmed entries; its status page shows
only older/undated resolved incidents (routing blip, OpenRouter connection
issues, ARM migration, account access), none traceable to August 2026. No
lawsuit, funding, acquisition, or personnel news for either company.
Direct WebFetch to feedback.sudowrite.com, feedback.novelcrafter.com,
status.sudowrite.com and status.novelcrafter.com was blocked by the
environment's egress proxy this round (not a 403 from the site itself);
WebSearch's indexed summaries substituted.

## Dabble / Scrivener / Campfire

Nothing new. Direct fetches to literatureandlatte.com, dabblewriter.com and
campfirewriting.com are now blocked at the network-egress level in this
environment (EGRESS_BLOCKED), a step beyond the 403s logged since round 18
— worth noting as a further access wrinkle for future rounds, not a content
finding. Scrivener 3.5.2's Tahoe-compatibility fixes (already logged) are
still the newest version; no 3.5.3/3.5.4 exists per forum search; the
next-gen app is still "nearing beta completion" with no new date. A
"Campfire Update 41" changelog surfaced but is dated January 2026, already
superseded by the v1.3.2 (July 3, 2026) entry logged in round 15. The
"Campfire" name-collision problem (round 17+) has now spread beyond the
finance-platform and betting-app collisions to 2026 US/Washington wildfire
news dominating search results for the term.

## type.ai / Obsidian / Notion / new-entrant scan

Nothing confirmed new. The task-tracker-plus-focus-timer recheck (now run
an eighth time across rounds 15/17/18/19/20/21/22) surfaced one lead worth
flagging rather than folding in: an Obsidian community plugin called
**WebNovel Assistant** (listed on community.obsidian.md), whose own
description combines a writing dashboard with word-count/goal tracking,
focus-time tracking, worldbuilding tools (character profiles, timelines,
foreshadowing), and a timed task tracker with time-boxed sprints — on
paper the closest match to the four-app combination found in eight rounds
of checking. It could not be dated or confirmed as new this round
(obsidianstats.com, which would show its last-update date, was
egress-blocked; no search snippet carried a date), and it's a plugin
bolted onto Obsidian rather than a standalone app, with no local-AI
component mentioned anywhere in its description. Filed here as an
unconfirmed lead: round 23, if it fires on the same brief, should try to
find its GitHub repo directly and check the actual last-release date
before this gets treated as a real answer to the recurring check.

## Broader industry / legal sentiment

Nothing dated after 2026-08-07. Two items came close but land one to four
days short of the cutoff, so are logged here for awareness only, not as
findings:

- **Daggermouth AI-authorship dispute** (previously unlogged): H.M. Wolfe's
  novel *Daggermouth* (Simon & Schuster/Scarlett Press) was flagged ~60%
  AI-likely by the detector Pangram; the author denies AI use. Coverage
  clusters July 28-31, 2026 (TechTimes, The Bookseller, AI Weekly) — all
  before the window.
- **A racial-bias framing across three pulled deals**, via a Guardian
  interview dated **Aug 4, 2026** (one day short of round 21's Aug 7 close,
  three days short of round 22's Aug 8 firing): Jerry Falade (author of the
  already-logged "Call Me, I'll Hide the Body" collapse) states publicly
  that three Black authors — himself, Mia Ballard ("Shy Girl"), and H.M.
  Wolfe (Daggermouth) — all had deals cancelled or disrupted this year
  following AI-authorship suspicion, and frames this as a pattern of racial
  bias in how AI-detection accusations get applied. Widely reprinted
  (TheGrio, Vanguard, Breitbart, The Root). This is a live, unfolding, and
  sensitive story — a claim about bias in accusation patterns, not a
  product-comparison data point — and is recorded here for awareness only.
  It should not be turned into marketing copy of any kind without the
  owner's explicit judgment; Novella's own "no-training/privacy" and
  "no-outage" items are architecture claims about Novella's own product,
  not commentary on how other authors' AI-authorship accusations get
  adjudicated, and the two should stay separate.
- EU AI Act Article 53: still zero named fines or complaints; only
  "compliance dialogue" activity reported (CNBC, Aug 3).

## What changed in ROADMAP.md

No new checklist items — nothing this round cleared the bar of being both
new and dated within the window, and for the first time in this cadence
every one of the four passes came back genuinely empty rather than merely
thin. Nothing was folded into existing items either; the WebNovel Assistant
lead and the Falade/Guardian story are recorded above as unconfirmed/
pre-window rather than acted on. Per round 19's note that repeating the
cadence-frequency flag adds no new information on its own, this round
doesn't re-raise it as a request, but the fact pattern behind it has moved:
this is now the first *fully* dry round (all four passes, not two of four),
on the eighth consecutive research-only day, with a new environmental
wrinkle (egress-level blocks, not just 403s, on Scrivener/Dabble/Campfire's
and NovelCrafter/Sudowrite's own sites) that will keep degrading source
access regardless of cadence. Recorded once, plainly, as an update to the
standing observation rather than a fresh ask.

## Round 22 sources

- [Sudowrite status page](https://status.sudowrite.com/)
- [Sudowrite changelog](https://feedback.sudowrite.com/changelog) (indexed summary; direct fetch egress-blocked)
- [NovelCrafter changelog](https://feedback.novelcrafter.com/changelog) (indexed summary; direct fetch egress-blocked)
- [NovelCrafter status page](https://status.novelcrafter.com/) (indexed summary; direct fetch egress-blocked)
- [Sudowrite Trustpilot](https://www.trustpilot.com/review/www.sudowrite.com)
- WebNovel Assistant — Obsidian community plugin listing (community.obsidian.md; GitHub repo/date not located this round)
- The Guardian, Jerry Falade interview (Aug 4, 2026) — reprinted via TheGrio/Vanguard/Breitbart/The Root (original Guardian URL not directly retrieved)

# Round 23 (2026-08-09)

Ninth consecutive day this dedicated research schedule has fired
research-only (rounds 15-23, Aug 1 through Aug 9). Same four parallel
research passes as recent rounds (NovelCrafter/Sudowrite; Dabble/
Scrivener/Campfire; type.ai/Obsidian/Notion plus new-entrant scan and a
targeted WebNovel Assistant follow-up; broader industry/legal sentiment),
each briefed on rounds 1-22's findings and told to search specifically for
material dated after round 22's 2026-08-08 cutoff — a one-day window.

## NovelCrafter / Sudowrite

Nothing new. 10 searches ("Sudowrite August 2026," "NovelCrafter changelog
August 2026," "Sudowrite outage status," "NovelCrafter review 2026,"
"Sudowrite Trustpilot review," Reddit site-search for both products, exact
"August 8"/"August 9 2026" date queries for both, "Sudowrite price
increase 2026") returned nothing dated after Aug 8. Direct fetches to
feedback.sudowrite.com and feedback.novelcrafter.com remain
egress-blocked, as they have been since round 22; WebSearch's indexed
summaries substituted. Two items surfaced worth a future round's
attention but NOT logged as confirmed this round because no snippet
attached a specific post-Aug-8 date: a "Sudowrite Story Engine 3.0"
mention and a Sudowrite "Developer API" with Python/Node SDKs, both
appearing only in review-aggregator summaries (cybernews, bloggingwizard,
aitoolsdevpro) that read as re-summarizing pre-existing 2026 features
rather than reporting new launches. Round 24 should date-check these
specifically before treating either as new.

## Dabble / Scrivener / Campfire

Nothing new after 16 searches across new features, pricing, outages,
reviews, changelogs, and funding/acquisition angles for all three.
Scrivener still shows no next-gen beta date and no version past
macOS 3.5.0/Windows 3.1.6 in indexed results; Campfire still shows no
build past v1.3.2 (July 29, 2026 per this round's indexing — a
date correction from round 15's "July 3" reading, worth reconciling
against the primary changelog once egress access returns); Dabble's most
recent confirmed milestone remains the July 13, 2026 "Dabble 3.0" launch
(beta-reader sharing, mobile/PWA support). The "Dabble"/"Campfire"
name-collision problem (an unrelated Australian betting app and an
unrelated fintech company, respectively) continues to pollute search
results, as logged since round 17. Genuinely quiet 24 hours rather than a
coverage gap, per the sub-agent's own assessment — but worth re-running
the same terms in round 24 in case today's items index late.

## type.ai / Obsidian / Notion / new-entrant scan

The round's one substantive finding: round 22's unconfirmed "WebNovel
Assistant" lead is now **confirmed**. Its GitHub repo is
[github.com/HatanoChihiro/obsidian-webnovel-assistant](https://github.com/HatanoChihiro/obsidian-webnovel-assistant)
— created 2026-04-15, last commit **2026-08-09** (the day of this check,
so actively maintained, not abandoned), latest release v3.2.0, 144 stars,
9 forks, 0 open issues, MIT-licensed, bilingual (Chinese/English) UI.
Confirmed feature set: word count with 3 counting modes and
multi-direction goal tracking; a focus timer with a 365-day heatmap,
bar/line trend view, and automatic slack/distraction detection; a task
tracker for periodic writing goals; a story timeline; a foreshadowing
manager (mark → track → resolve); a chapter corkboard; a lore system with
auto-highlight and relation graphs; sticky notes; advanced search; an OBS
streaming overlay; and mobile floating widgets. That is a focus timer, a
task tracker, worldbuilding, and word-count tracking — all four of the
pillars this cadence has checked for across nine rounds — genuinely
present in one actively-maintained, real product for the first time.

The decisive gap: checking both the GitHub README and repo page directly
found **zero** mentions of AI, LLM, Ollama, OpenAI, or any
writing-generation feature anywhere. It is a pure organizational/
productivity shell around those four functions, not a writing partner —
and it's an Obsidian plugin inheriting Obsidian's general-notes paradigm,
not a purpose-built novel-drafting app. This means the standing
recheck's prior framing ("no competitor pairs a task tracker with a focus
timer alongside writing and worldbuilding") is no longer accurate as
stated and needed correcting in ROADMAP.md — see the four-app-bundle item.
The thesis itself is untouched: the claim that survives is "nobody bundles
the four apps *and* writes with you, locally, for free," which stays
fully unclaimed.

Secondary new-entrant search (7 queries) found nothing new post-2026-08-08.
Two items surfaced but predate the window or don't match the profile: The
Novelist (github.com/panossakalakis/the-novelist), a free/no-AI Obsidian
vault template, v2.0 released March 9, 2026 — not a plugin, no AI, predates
window; Laterpress (laterpress.com), a cloud/BYOK writing tool with a
10-category worldbuilding wiki that has existed since 2022, not local, no
confirmed timer or task tracker.

## Broader industry / legal sentiment

Nothing dated after 2026-08-08 across 17 searches (lawsuits, EU AI Act
enforcement, author surveys, pulled book deals, funding/acquisition news,
Authors Guild/Society of Authors statements). One reconciliation note: a
Publishers Lunch/Boing Boing/Futurism/Moneywise/Plagiarism Today report
describes a ~$2.5M Macmillan/Minotaur two-book deal (a 14-way auction debut
thriller about a Nigerian chemistry-PhD cleaner in Houston pulled into a
cartel body-disposal job) withdrawn by agent Marc Gerald on July 29, 2026,
citing inability to "authenticate how the manuscript... evolved" after a
Publishers Lunch AI-detector run scored it 97% AI-likely. This reads as
plausibly the *same* incident as the already-logged Jerry Falade/
Macmillan/Minotaur "Call Me, I'll Hide the Body" pull (same imprint, same
~$2.4-2.5M range, same late-July/early-August window) with fuller
reporting detail, rather than a second distinct deal — but it wasn't
confirmed either way this round, and it falls before the Aug-8 cutoff
regardless, so it isn't logged as a new finding. Round 24 should reconcile
whether "Falade" and "the Nigerian chemistry-PhD cleaner in Houston
thriller" name the same book before either version gets cited in copy —
citing them as two separate incidents would overstate the pattern if
they're one.

Two previously-logged items (UK Society of Authors "Human Authored"
declaration scheme launched by Tracy Chevalier at London Book Fair; a new
UK publisher alliance "SPUR" on AI licensing standards) surfaced again
this round but with no date confirming they're post-Aug-8 — left out per
the same rule.

## What changed in ROADMAP.md

One correction folded into the existing four-app-bundle item (see above):
the WebNovel Assistant confirmation, which changes that item's standing
claim from "no competitor combines the four pillars" to "one now does, but
with zero AI — the AI-plus-bundle combination stays unclaimed." No
wholly new checklist items; the Sudowrite Story Engine 3.0/Developer API
mentions and the Falade/Nigerian-thriller reconciliation are recorded
above as follow-ups for round 24, not acted on this round since neither
cleared the new-and-dated bar.

This is the ninth straight research-only day (rounds 15-23) but not a
repeat of round 22's fully-dry result — two of four passes came back
empty, one (industry/legal) came back thin-but-old, and one (the
Obsidian/new-entrant pass) produced a genuine, actionable confirmation.
Per round 19's note that repeating the cadence-frequency request adds
nothing new on its own, this entry does not re-raise it.

## Round 23 sources

- [WebNovel Assistant GitHub repo](https://github.com/HatanoChihiro/obsidian-webnovel-assistant)
- [The Novelist (Obsidian vault template) GitHub repo](https://github.com/panossakalakis/the-novelist)
- [Laterpress](https://laterpress.com/)
- Publishers Lunch / Boing Boing / Futurism coverage of the withdrawn Macmillan/Minotaur deal (July 29, 2026; exact Publishers Lunch URL is subscription-gated, not directly retrieved)
