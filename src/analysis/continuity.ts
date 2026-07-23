import type { Note } from "../core/vault";
import { Vault, extractWikiLinks } from "../core/vault";

/* Continuity checks — the deterministic tier.

   No model, no guessing: every finding here is provable from the files,
   which means zero false mystery. The model-assisted tier can come
   later; this one earns trust first. A finding names the note to fix
   and says why, in one sentence. */

export interface ContinuityFinding {
  kind: "early-mention" | "duplicate-name" | "dangling" | "unordered" | "pov-unknown";
  /** Note to open when the finding is clicked. */
  noteId: string;
  message: string;
}

/** Chapter order helper: numeric `order` from frontmatter, else Infinity. */
const orderOf = (n: Note): number =>
  typeof n.data.order === "number" ? n.data.order : Number.POSITIVE_INFINITY;

export function checkContinuity(vault: Vault): ContinuityFinding[] {
  const findings: ContinuityFinding[] = [];
  const all = vault.all();
  const chapters = all
    .filter((n) => n.type === "chapter")
    .sort((a, b) => orderOf(a) - orderOf(b));

  /* 1. Mentioned before their entrance. Opt-in: a codex note that
     declares `introduced: <n>` (the chapter order number it first
     appears in) gets checked; without the field nothing fires. */
  const introducedAt = new Map<string, number>();
  for (const n of all) {
    if (typeof n.data.introduced === "number") introducedAt.set(n.id, n.data.introduced);
  }
  if (introducedAt.size > 0) {
    chapters.forEach((chapter, i) => {
      const chapterNo = i + 1;
      for (const link of extractWikiLinks(chapter.body)) {
        const target = vault.resolveLink(link);
        if (!target) continue;
        const entrance = introducedAt.get(target.id);
        if (entrance !== undefined && chapterNo < entrance) {
          findings.push({
            kind: "early-mention",
            noteId: chapter.id,
            message: `"${chapter.title}" (chapter ${chapterNo}) mentions ${target.title}, who isn't introduced until chapter ${entrance}.`,
          });
        }
      }
    });
  }

  /* 2. Two codex entries that normalize to the same name — usually one
     typo'd duplicate that will quietly split backlinks between them. */
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const seen = new Map<string, Note>();
  for (const n of all) {
    if (n.type === "chapter" || n.type === "scene" || n.path.startsWith("Templates/")) continue;
    const key = squash(n.title);
    if (!key) continue;
    const other = seen.get(key);
    if (other && other.id !== n.id) {
      findings.push({
        kind: "duplicate-name",
        noteId: n.id,
        message: `"${n.title}" and "${other.title}" are almost the same name — links may be splitting between two entries.`,
      });
    } else {
      seen.set(key, n);
    }
  }

  /* 3. Names the book keeps using that have no note yet. Counted, so the
     most-referenced missing person floats to the top. */
  const danglingCount = new Map<string, { count: number; from: Note }>();
  for (const n of all) {
    for (const link of extractWikiLinks(n.body)) {
      if (vault.resolveLink(link)) continue;
      const hit = danglingCount.get(link);
      if (hit) hit.count++;
      else danglingCount.set(link, { count: 1, from: n });
    }
  }
  for (const [name, { count, from }] of [...danglingCount.entries()].sort(
    (a, b) => b[1].count - a[1].count,
  )) {
    findings.push({
      kind: "dangling",
      noteId: from.id,
      message:
        count === 1
          ? `[[${name}]] is linked once but has no note yet.`
          : `[[${name}]] is linked ${count} times but has no note yet.`,
    });
  }

  /* 4. Chapters with no order number sort unpredictably — the book can
     silently reshuffle. */
  for (const c of all.filter((n) => n.type === "chapter")) {
    if (typeof c.data.order !== "number") {
      findings.push({
        kind: "unordered",
        noteId: c.id,
        message: `"${c.title}" has no order number, so its place in the book is a guess.`,
      });
    }
  }

  /* 5. A POV field that doesn't resolve is usually a typo'd name. */
  for (const c of chapters) {
    const pov = c.data.pov;
    if (typeof pov !== "string" || !pov.trim()) continue;
    const names = extractWikiLinks(pov);
    const plain = names.length > 0 ? names : [pov.trim()];
    for (const name of plain) {
      if (!vault.resolveLink(name)) {
        findings.push({
          kind: "pov-unknown",
          noteId: c.id,
          message: `"${c.title}" names its POV as "${name}", but the codex has no one by that name.`,
        });
      }
    }
  }

  return findings;
}
