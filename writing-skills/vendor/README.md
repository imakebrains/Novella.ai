# Vendored skill suites

Third-party Agent Skill suites acquired by the skills-scouting pass (see
SKILLS.md at the repo root for the scouting notes and ROADMAP.md for the
cadence). Vendored whole — each suite's skills reference shared folders
(`references/`, CLI engines, framework files) inside its own repo, so
cherry-picking individual skill folders into `.claude/skills/` would break
them. Wiring selected skills into `.claude/skills/` (auto-load) is a
follow-up task tracked in SKILLS.md.

Provenance (acquired 2026-08-12, shallow clones, `.git` stripped):

| Suite | Upstream | Commit | License | What it is |
|-------|----------|--------|---------|------------|
| `creative-writing-skills/` | github.com/haowjy/creative-writing-skills | fd7a3ad | Apache-2.0 | 13-skill craft suite: reader-sim, character-sim, story-memory, story-review, writing-staffing, multi-agent architecture |
| `story-skills/` | github.com/danjdewhurst/story-skills | c482d48 | MIT | 7 skills (story-init, character-management, worldbuilding, plot-structure, chapter-writing, revision-continuity, story-maintenance) + deterministic CLI continuity engine and story-bible schema |
| `author-toolkit/` | github.com/rhavekost/author-toolkit | b782870 | MIT | 6 skills incl. avoid-ai-writing, prose-mechanics, story-structure; five editorial personas; shared `references/` library |
| `obsidian-novel-starter-vault/` | github.com/rrbaker/obsidian-novel-starter-vault | 402b6f2 | CC0-1.0 | Manuscript/chapter folder structure + character/setting sketch templates (public domain) |

Licenses travel with each suite (`LICENSE` in each folder). Do not edit
vendored files in place — distill improvements into our own skills under
`.claude/skills/` instead, so upstream diffs stay clean if we re-pull.
