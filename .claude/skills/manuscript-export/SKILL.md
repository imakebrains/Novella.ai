---
name: manuscript-export
description: >
  The compile-and-export stage: tag the repo, compile chapters into one clean
  manuscript, then export per audience — submission DOCX with the Shunn
  standard-format checklist, EPUB with the KDP metadata checklist, or a
  DRAFT-watermarked beta PDF with a feedback sheet. Use when the user says
  "export the manuscript", "compile the book", "make the EPUB", "submission
  DOCX", "beta PDF", or when novel-finish / novel-playbook Stage 5 reaches
  the export step.
---

# Manuscript Export — from chapters/ to deliverable

## 0. Tag first — no exceptions

Every delivered version must be reproducible from git.

1. Working tree clean (`git status`); commit anything pending.
2. `git tag draft-vN` (next N; list with `git tag -l 'draft-v*'`).
3. Only then compile. If asked to export from a dirty tree, commit and tag
   first — never hand out a file no tag can regenerate.

All outputs go to `build/` (already gitignored by day-one setup).

## 1. Compile

```
python scripts/compile_manuscript.py chapters/ --title "TITLE" --author "Name" --out build/manuscript.md
```

What it does (deterministic, stdlib-only):

- **Natural sort**: ch1, ch2, … ch10 — never lexical order.
- **Strips state noise**: HTML comments (multi-line), `%%` lines,
  `[ledger:` / `[scene:` / `[note:` / `[todo` lines. Prose only survives.
- **Normalizes scene breaks**: `***`, `* * *`, `~~~`, `# # #`, lone `#`
  variants → one consistent centered `#`.
- **Chapter headings**: keeps each file's first heading, or inserts
  `# Chapter N`. Level-1 headings so `--toc-depth=1` catches them.
- **Reports** per-chapter and total word counts.

Sanity check `--selftest` if the script's behavior is ever in doubt.

## 2. Export per audience

Pick the target(s); each has a recipe and a checklist. Verify the compiled
word count against genre norms before any export — flag, don't block.

### Agents / editors — DOCX

```
pandoc build/manuscript.md -o build/manuscript.docx
```

Then walk `assets/shunn-format-checklist.md` item by item (12pt serif,
double-spaced, 1" margins, running header, contact block). Pandoc gets the
text right; the checklist gets the format right. Do not submit unchecked.

### Self-pub — EPUB

```
pandoc build/manuscript.md -o build/book.epub --toc --toc-depth=1 --epub-cover-image=cover.jpg
```

Title/author come from the compiled file's YAML block. Then:

1. Walk `assets/kdp-epub-checklist.md`.
2. **Validate in a previewer before upload** (Kindle Previewer or an EPUB
   reader): cover renders, TOC entries jump correctly, no stray `#` headings,
   front matter in order. Never upload an EPUB nobody has opened.

### Beta readers — watermarked PDF

```
printf '%s\n' '\usepackage{draftwatermark}' \
  "\SetWatermarkText{DRAFT $(date +%Y-%m-%d)}" \
  '\SetWatermarkScale{0.35}' '\SetWatermarkColor[gray]{0.85}' > build/wm.tex
pandoc build/manuscript.md -o build/beta-draft.pdf --pdf-engine=xelatex \
  -V geometry:margin=1in -H build/wm.tex
```

Every page carries DRAFT + date — beta copies must never be mistakable for
final. Send it with `assets/beta-reader-sheet.md` (3–5 questions: where did
you skim, what didn't you believe, where did you stop wanting to read).
Never send a beta copy without the sheet: unprompted readers return "it was
good", which is unusable.

## 3. Record it

Append to `session-log.md`: tag name, targets exported, word count, who
received what, date. Commit. The next export starts from a known state.
