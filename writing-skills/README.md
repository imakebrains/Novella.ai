# writing-skills

A pullable library of Agent Skills, templates, and human-authored craft
sources for writing novels and books. Owned by drewpmedia; maintained by
the Novella.ai autopilot's skills-scouting pass (cadence in ROADMAP.md,
scouting log in SKILLS.md, both at the repo root).

**This folder is designed to become its own repository.** It is fully
self-contained — nothing in here reaches outside the folder — so it can
be lifted into a dedicated `writing-skills` repo unchanged. It lives
inside Novella.ai for now because the automation's GitHub access is
scoped to this repo only (repo creation was attempted 2026-08-12 and
denied). Until the split, pull it with a sparse checkout or just:
`git clone --depth 1 https://github.com/imakebrains/Novella.ai && cp -r
Novella.ai/writing-skills .`

## Layout

- **`skills/`** — installable Agent Skills (each a folder with a
  `SKILL.md`; copy into `.claude/skills/` of any project, or upload to
  claude.ai → Settings → Capabilities → Skills).
- **`sources/`** — the distillation shelf: indexed, verified
  human-authored craft sources (real novelists, editors, screenwriters)
  that future skills get built from. Cite ideas, never copy text.
- **`vendor/`** — complete third-party skill suites, licenses intact
  (see `vendor/README.md` for provenance). Don't edit in place; distill
  improvements into `skills/` instead.
- **`reference-library/`** — full-text public-domain and openly licensed
  works: the craft canon (`craft/`) and technique-exemplar fiction
  (`fiction/`), each entry indexed with provenance, license, and the
  lesson it carries. Only confirmed-free works, ever — see the folder's
  INDEX.md.

## The skills

**The novel playbook** (imported 2026-08-11 from a prior session) — the
full lifecycle, one skill per stage plus a combined router:

| Skill | Stage |
|-------|-------|
| `novel-playbook` | whole lifecycle, detects the current stage |
| `novel-day-one` | new-project setup: repo, ledgers, voice, premise, first promises |
| `novel-session` | open/close rituals; the session log |
| `novel-scene` | per-scene: context load → contract → draft → ledger update |
| `novel-checkpoint` | every ~5 chapters: quick audits |
| `novel-revision` | act boundaries: seven audits, structure first |
| `novel-finish` | final sweeps, polish, compile, export, submission |

**The stack** (rebuilt 2026-08-12 — the playbook's five dependencies
were lost with their original chat; these are original reconstructions
from the playbook's own call sites):

| Skill | Job |
|-------|-----|
| `master-novel` | the state engine: `story-state/` ledgers, schemas, update discipline |
| `conversational-authority` | the house register + voice-anchor seeding + drift checks |
| `every-word` | the ten line-editing passes (cut → … → read-aloud), two strictness levels |
| `manuscript-export` | compile script + DOCX/EPUB/beta-PDF export recipes + format checklists |
| `graphify-novel` | optional story graph: threads, wake dates, staleness queries, Mermaid render |

Three more of the original stack turned out to exist publicly and are
vendored whole instead of rebuilt: `story-skills`,
`creative-writing-skills`, `author-toolkit` (see `vendor/`).

## House rules

- Human-authored sources first; every source entry names its author.
- New skills match the suite's voice: terse, constraint-first, triggers
  in the description.
- Vendored code keeps its license and never gets edited in place.
