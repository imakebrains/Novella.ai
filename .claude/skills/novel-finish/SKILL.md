---
name: novel-finish
description: >
  The finishing sequence: final ledger sweeps, maximum-strictness polish on the
  opening chapters, manuscript compile and export (submission DOCX / EPUB / beta
  PDF), word-count sanity, and the submission package if querying. Use when the
  user says "the draft is done", "finish the book", "export the manuscript",
  "prepare my submission", or "get this ready for beta readers".
---

# Novel Finish — from final draft to deliverable

## 1. Nothing left open by accident

- `open-threads.md` + `promise-ledger.md` sweep: every row is paid, resolved, or
  **abandoned-intentional with a recorded why**. Zero silent orphans.
- `irony-tracker.md`: every knowledge gap closed on-page or carried on purpose.
- Motif registry: did the planned final echoes land?

## 2. The opening carries everything

Agents, editors, and browsing readers decide on chapters 1–3:

- every-word passes at maximum strictness on chapters 1–3
- First page against the register's friction rules: voice, want, and instability
  before geography and backstory
- Read the opening aloud, in full

## 3. Tag, compile, export (manuscript-export)

1. `git tag draft-vN` — every delivered version reproducible
2. Compile: `python compile_manuscript.py chapters/ --title "TITLE" --author "Name"`
   (natural-sorts, strips state noise, normalizes scene breaks, reports word count)
3. Export per audience:
   - **Agents/editors:** DOCX + the Shunn standard-manuscript-format checklist
   - **Self-pub:** EPUB (`--toc --toc-depth=1 --epub-cover-image=`) + KDP metadata
     checklist; validate in a previewer before uploading
   - **Beta readers:** PDF watermarked DRAFT + date, with a 3–5 question sheet
     (where did you skim / what didn't you believe / where did you stop wanting
     to read?)
4. Word count vs. genre norms — flag, don't block, but flag BEFORE submitting.

## 4. Submission package (traditional path only)

- Query letter: personalization → hook (protagonist + want + obstacle + stakes,
  in the book's voice) → book paragraphs ending on the dilemma → metadata line
  with 2 comp titles under five years old → 2–3 line bio, no apologies
- One-page synopsis: present tense, ending included, decisions causing events
  ("because", never "and then") — build it from the causality ledger's
  Event → Decision → Consequence chains
- Tracking table; query in waves of 6–10

## 5. Close the book

Final `session-log.md` entry: what shipped, where, and the date. Commit. Then the
only remaining instruction: start the next one — the ledgers made this book easier
at chapter 30 than at chapter 3, and that compounds across books.
