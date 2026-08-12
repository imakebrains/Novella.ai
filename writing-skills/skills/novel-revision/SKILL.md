---
name: novel-revision
description: >
  The act-boundary revision pass: full seven-audit battery, severity-ranked findings,
  structure-first fixes, then word-level finishing and AI-pattern cleanup, ending
  with ledger snapshots and a git tag. Use when the user says "revision pass", "act
  one is done", "full audit", "revise the act", or reaches a natural act boundary.
  Structure first, words last — never line-edit a scene that might still be cut.
---

# Novel Revision — the act-boundary pass

## 1. The seven audits (read ledgers first, sample manuscript second)

Run all seven; produce ONE findings table
(`Severity | Location ch.scene | Evidence | Suggested fix`):

1. **Reverse outline** — nothing-changes scenes, repeated conversations, vanished
   characters, static wants, escalation plateaus, stable exits
2. **Promise/payoff** — orphans, payoff-before-setup, payoff pileups, droughts
3. **Knowledge consistency** — characters acting on facts their rows don't contain;
   secrets leaking early; false beliefs that silently evaporated
4. **Waveform** — flat stretches, peaks without valleys, unrelieved dread,
   confusion running 2+ chapters unresolved
5. **Reveal economy** — reveals doing none of: reinterpret past / change
   expectations / force a decision; double-reveals; spacing
6. **Voice drift** — sampled chapters vs. the voice anchor, axis by axis
7. **Removability** — chapters with zero downstream causality references: wire a
   consequence, fold the beat into a neighbor, or cut

Deduplicate overlaps (a nothing-changes scene often also fails removability —
report once, cite both).

## 2. Fix structure

Work the table top severity down. Cuts and rewires first, rewrites second.
Re-run only the audits that produced the fixes. **Do not touch sentences yet.**

## 3. Then the words

- every-word ten passes, chapter by chapter (cut → verb → filter → concreteness →
  echo → rhythm → dialogue → AI-tell → mechanical → read-aloud)
- AI-pattern rewrite (avoid-ai-writing detect → rewrite, or story-deslop) ONLY on
  sections pass 8 flagged
- Voice check: the polished act still sounds like the anchor; if polish sanded the
  voice off, restore the rough plank

## 4. Close the act

- Roll relationship deltas into "current standing" snapshots; archive raw rows
- Reader-experience: compare the act's intended waveform against a reader-sim /
  critic pass if available; log divergences
- `session-log.md` entry summarizing what the act now does
- `git tag act-N-revised`

One act at a time. Whole-book revision passes produce whole-book fatigue and
chapter-one-only polish.
