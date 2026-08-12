# Novel Playbook Skills

The Day One playbook as installable Agent Skills — built 2026-08-11 from the
novel-writing stack (master-novel, conversational-authority, every-word,
manuscript-export, story-skills, creative-writing-skills, author-toolkit,
graphify-novel).

## Two formats, same content

- **`novel-playbook/`** — ONE skill containing the entire lifecycle. It detects where
  a project is and routes to the right stage. Install just this if you want one
  entry point.
- **Six stage skills** — the same lifecycle split into independent skills, each
  triggerable on its own moment:

| Skill | Fires when |
|-------|-----------|
| `novel-day-one` | starting a brand-new novel project |
| `novel-session` | opening or closing any writing session |
| `novel-scene` | drafting the next scene (context load → contract → draft → ledger update) |
| `novel-checkpoint` | every ~5 chapters (quick audits) |
| `novel-revision` | act boundaries and full revision passes |
| `novel-finish` | final polish, export, submission package |

Installing both the combined skill and the stage skills is fine — the combined one
delegates to the stage instructions rather than contradicting them.

## Install

- **Claude Code (all projects):** copy the skill folder(s) into `C:\Users\<you>\.claude\skills\`
- **Claude Code (one project):** copy into `<project>\.claude\skills\`
- **claude.ai:** Settings → Capabilities → Skills → upload a skill folder
- New sessions pick skills up automatically.

## Dependencies

These are orchestration skills: they run best with the full stack installed
(`master-novel` for the ledgers, `conversational-authority` for register,
`every-word` for line passes, `manuscript-export` for output). Without the stack
they still work as disciplined checklists — they just tell you what to maintain
by hand instead of delegating.
