# KDP EPUB upload checklist

Walk every item before the file touches KDP. A rejected or garbled upload
costs days; this list costs minutes.

## File

- [ ] EPUB built with `--toc --toc-depth=1` — one TOC entry per chapter,
      no scene-level entries.
- [ ] Opened in a previewer (Kindle Previewer preferred) and paged through:
      cover, title page, first page of at least three chapters, the ending.
- [ ] Every TOC entry jumps to the right chapter.
- [ ] No stray markup: no leftover `#` scene markers rendered as headings,
      no HTML comments, no ledger/planning text.
- [ ] Cover image embedded via `--epub-cover-image=`; JPEG, at least
      1600 x 2560 px, under 50MB, RGB (not CMYK).
- [ ] Front matter order sane: cover, title page, copyright, then chapter 1
      (readers open at chapter 1 — nothing skippable before it that matters).
- [ ] File size well under KDP's conversion limit (flag anything over ~200MB;
      images are usually the culprit).

## Metadata (must match the book's YAML block exactly)

- [ ] Title and subtitle — exactly as on the cover, no keyword stuffing.
- [ ] Author name — consistent with any existing author page.
- [ ] Series name and number, if any.
- [ ] Description: hook first line; no raw HTML errors; within KDP's length
      limit.
- [ ] 7 keywords chosen; no competitor names, no "free", no claims
      ("bestselling") — those violate KDP policy.
- [ ] Categories selected (browse categories, not just BISAC guesses).
- [ ] Language, publication date, publisher (or blank for self).
- [ ] ISBN: optional for Kindle eBooks — leave blank unless you own one.

## Rights and pricing

- [ ] Territories: worldwide unless rights are sold somewhere.
- [ ] Royalty plan chosen deliberately (70% requires the price inside
      Amazon's eligible band; 35% otherwise).
- [ ] List price checked against comparable titles in the category.
- [ ] KDP Select enrollment is a deliberate yes/no — it requires eBook
      exclusivity; do not enroll by reflex if selling wide.
- [ ] DRM decision made (it is permanent for the edition).

## After upload

- [ ] KDP's online previewer checked again post-conversion — Amazon's
      converter can differ from the local one.
- [ ] "Look Inside" sample reviewed once live: it is the sales page.
