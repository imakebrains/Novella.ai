# Novella autopilot — the daily routine

These are the standing instructions for the autonomous build loop. They
used to live in a local scheduled task on the owner's machine; as of
2026-07-24 the routine runs in the cloud, and this file is the single
source of those instructions. ROADMAP.md remains the authority for WHAT
to build; this file is HOW a run behaves.

You are continuing the autonomous build of Novella.ai — a local-first
writing app (Tauri + React + TypeScript) meant to become the #1 writing
AND task-managing app: better than NovelCrafter, Notion, Dabble,
Scrivener and Sudowrite at the whole job.

Repo: https://github.com/imakebrains/Novella.ai (public, main branch).
On the owner's machine the clone lives at `C:\Users\drewp\Novella.ai`;
a cloud runner works from its own clone — paths in old logs that
mention C:\ are historical.

FIRST: read ROADMAP.md at the repo root. It holds the thesis, the
quality gate, the backlog, and the log of past runs. It is the
authority — not your memory of previous sessions.

DO ONE OF THESE PER RUN, then stop:

A) BUILD (default): implement the TOPMOST unchecked item in "Next up",
   completely, to the gate in ROADMAP.md — `npx tsc --noEmit` clean,
   unit tests in test-units.ts for pure logic, `npm run verify` green.
   Where a live browser is available, verify UI in the running dev
   server through the DOM and the `window.__novella` dev handle
   (screenshots are unreliable; computed styles and live probes are
   not). Where no browser exists, say so in the log line rather than
   claiming UI verification. IMPORTANT: never check an exit code
   through a pipe (`cmd | tail` reports tail's status) — run the
   command bare. Never rewrite src/core/vault.ts. Then tick the item,
   append a dated log line, commit with the Co-Authored-By line, push.

B) RESEARCH (roughly every third run, or when "Next up" has fewer than
   4 items): no code. Search for fresh reviews, feature announcements
   and complaints about NovelCrafter, Sudowrite, Dabble, Scrivener,
   Campfire, type.ai, Obsidian-for-writers and Notion writing
   templates. Add the best findings to "Next up" (one line each + why
   it matters), append long-form notes to RESEARCH.md under a new dated
   round, commit and push.

C) QA (roughly every third run, alternating with research): no new
   features. Use the app like a writer would — build a stress project
   (dozens of chapters, dozens of codex entries), exercise the boards,
   editor, import/export, agents, tabs and focus mode, and look for
   what breaks, stalls or reads badly at realistic scale. Fix anything
   you broke yourself; file everything else into "Next up". A previous
   QA pass found a shipped feature whose layout collapsed at 44
   entries — only real use catches that class of bug.

ALWAYS, on every run regardless of mode: if you notice a bug, a rough
edge, a competitor feature worth having, or you simply have a good
idea, APPEND IT TO "Next up" in the same run with one line on why.
Place it in priority order against the thesis in ROADMAP.md, not just
at the end. If you build something you thought of yourself, say so in
the log line. Do not sit on ideas waiting for a research run.

RELEASES: only if `git log $(git describe --tags --abbrev=0)..HEAD
--oneline` shows meaningful user-visible features AND the last tag is
7+ days old: bump `version` in package.json AND
src-tauri/tauri.conf.json, commit, then `git tag vX.Y.Z && git push
origin vX.Y.Z`. CI builds and publishes installers; the in-app updater
picks them up. Never tag when the suite is red. (Standing owner
instruction 2026-07-23: no release until the owner lifts the hold.)

HARD RULES:
- One item (or one research/QA pass) per run. Do it well, verify
  honestly, stop.
- If something needs the owner (accounts, payments, signing keys,
  hosting), do not fake it: leave it unchecked, add "NEEDS OWNER:"
  beside it, move on.
- If the working tree has uncommitted changes you didn't make, commit
  nothing over them — stop and report.
- Report at the end: what shipped or was learned, what was actually
  verified (with numbers where they exist), and what's next.
