# Skills & assets library

The companion to RESEARCH.md, but for *capability* instead of competitive
intelligence. This file tracks two things:

1. **The acquired library** — Agent Skills and reusable assets committed to
   this repo (under `.claude/skills/`), where every future session in this
   repo picks them up automatically.
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
`promise-ledger.md`) and reference a dependency stack that is **not yet in
this repo**: `master-novel`, `conversational-authority`, `every-word`,
`manuscript-export`, `story-skills`, `creative-writing-skills`,
`author-toolkit`, `graphify-novel`. Without the stack they still work as
disciplined checklists. **Standing acquisition goal: recover or rebuild
the missing stack** — the owner gathered it in another chat, so first ask
the owner for an export before rebuilding from scratch.

## Scouting rounds

(Newest first. Each round: what was found, authorship notes, what was
acquired or queued, and what next round should chase.)
