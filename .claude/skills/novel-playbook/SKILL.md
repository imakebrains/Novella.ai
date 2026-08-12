---
name: novel-playbook
description: >
  The complete novel-writing lifecycle in one skill — from empty folder to exported
  manuscript. Detects where the project currently is and routes to the right stage:
  day-one setup, session open/close rituals, per-scene drafting protocol, five-chapter
  checkpoints, act-boundary revision, and finishing/export. Use when the user says
  "start my novel", "follow the playbook", "what's next in my novel", "where are we",
  "open/close a session", "draft the next scene", "run the checkpoint", "revision
  pass", or "finish and export the book".
---

# Novel Playbook — the whole lifecycle

## Stage detection (run first, silently)

- No `story-state/` and no chapters → **Stage 0: Day One**
- `story-state/` exists, session just started → **Stage 1: Session open**
- Mid-session, user wants prose → **Stage 2: Scene loop**
- Chapter count hit a multiple of ~5 since last checkpoint → **Stage 3: Checkpoint**
- Act boundary reached, or user asks for revision → **Stage 4: Revision**
- Manuscript complete and audited → **Stage 5: Finish**
- Session ending for any reason → always run the Session close ritual

State the detected stage in one line, then follow it.

## Stage 0 — Day One (new novel)

1. Project folder → `git init` → `.gitignore` with `build/` → first commit.
2. Scaffold state: run master-novel init (creates `story-state/` ledgers; if a bible
   system already exists, point at it — never duplicate canon).
3. Choose the register: conversational-authority, or seed `voice-anchor.md` from the
   writer's own prose samples.
4. Premise work (muse / fiction-studio personas): premise, POV scheme, genre, target
   word count (check genre norms). Log every decision in `session-log.md`.
5. Plant the first promises in `promise-ledger.md` before drafting — a book opens by
   making promises.
6. Done when: repo + ledgers + voice anchor + premise exist, and `session-log.md`
   ends with "Next: draft 1.1 — target feeling: ___".

## Stage 1 — Session open

Read `session-log.md`'s newest entry. Skim ledger headers. State "where we are" in
three lines. Confirm today's single target before touching prose.

## Stage 2 — Scene loop (repeat per scene)

1. **Context load** (only these slices): previous 2–3 `scene-functions.md` rows;
   relationship standing + "unsaid" for characters present; their knowledge rows;
   promises due; reader-experience target for this chapter and the previous two
   actuals; `voice-anchor.md`; motifs available for echo.
2. **Scene contract**, one line: "This scene exists to ___. When it ends: ___."
3. **Draft** in the book's register.
4. **After-scene update**, fixed order: scene-functions row → causality chain →
   knowledge/irony deltas → relationship deltas → promise/reveal/motif entries →
   reader-experience row → threads. If Change AND Revelation are both "—", flag the
   scene now.

## Stage 3 — Checkpoint (every ~5 chapters)

Quick audits only: reverse-outline scan (nothing-changes scenes, vanished characters,
escalation slope) + promise/payoff scan (orphans, droughts) + last-5-chapters
waveform check (flat stretches). Update the story graph if graphify-novel is
installed. Triage findings: fix-now vs park-for-revision. Log the checkpoint in
`session-log.md`.

## Stage 4 — Revision (act boundaries)

1. Full seven-audit pass (reverse outline, promise/payoff, knowledge, waveform,
   reveal economy, voice drift, removability) → one findings table by severity.
2. Fix structure first — never line-edit a scene that might be cut.
3. Re-run the audits that failed.
4. every-word ten passes, chapter by chapter; AI-pattern rewrite (avoid-ai-writing /
   deslop) only on flagged sections.
5. Roll up ledger snapshots (relationship standings, archive old deltas), then
   `git tag act-N-revised`.

## Stage 5 — Finish

1. Sweep `open-threads.md` + `promise-ledger.md`: nothing status=open without a
   recorded decision.
2. every-word at maximum strictness on chapters 1–3 (they carry the submission).
3. `git tag draft-vN` → compile → export via manuscript-export (submission DOCX with
   Shunn checklist / EPUB with KDP checklist / DRAFT-watermarked beta PDF).
4. Word count vs. genre norms — flag, don't block.
5. If querying: query letter (hook–book–cook), one-page synopsis built from the
   causality ledger, tracking table.

## Session close (always, every session)

Append ≤10 lines to `session-log.md`: wrote / decided (with why) / state files
touched / flagged / open question / "Next: ___ — target feeling: ___".
Then `git commit`. Never end without the Next line.
