import type { Note } from "../core/vault";

/* ============================================================
   Codex sidebar search — names first, prose last.
   vault.search is a flat filter over title / tags / body and knows
   nothing of aliases; vault.ts is the protected engine, so ranking
   lives here and treats vault.search's hits as a floor, never a
   replacement.
   ============================================================ */

/* The tiers, best first:
     0  title exact        3  alias prefix
     1  alias exact        4  title-or-alias substring
     2  title prefix       5  tag or body hit
   A codex is consulted by name. An exact alias outranks a partial title
   because a writer who types the nickname means that person, not every
   entry that happens to start with the same letters. */
export type CodexRank = 0 | 1 | 2 | 3 | 4 | 5;

export interface CodexHit {
  id: string;
  rank: CodexRank;
  /** Set only when an alias won and the title did not match at all — as
      written in frontmatter, so the pane can say why an entry appeared
      under a name nobody typed. */
  alias?: string;
}

/** Case- and accent-blind key. Zoë gets typed as Zoe; the accented key is
    not on every keyboard. Lowercase comes BEFORE NFKD on purpose: "İ"
    lowercases to i plus a combining dot, which the strip then removes. */
export function fold(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/\p{M}+/gu, "").trim();
}

function nameRank(name: string, q: string, exact: CodexRank, prefix: CodexRank): CodexRank | null {
  const n = fold(name);
  if (!n) return null;
  if (n === q) return exact;
  if (n.startsWith(q)) return prefix;
  if (n.includes(q)) return 4;
  return null;
}

/** Ranked hits, or null for an empty query — null means "no filter", the
    same contract the pane had with its old `query.trim() ? … : null`. */
export function searchCodex(
  notes: readonly Note[],
  query: string,
  vaultHits: readonly Note[] = [],
): CodexHit[] | null {
  const q = fold(query);
  if (!q) return null;

  const ranked = new Map<string, { note: Note; hit: CodexHit }>();
  for (const note of notes) {
    const titleRank = nameRank(note.title, q, 0, 2);
    let best = titleRank;
    let alias: string | undefined;
    // Same source as [[link]] resolution: parseNote's toArray(data.aliases).
    // A singular `alias:` key is deliberately not read — search would then
    // find names that links refuse to resolve.
    if (Array.isArray(note.aliases)) {
      for (const a of note.aliases) {
        const r = nameRank(a, q, 1, 3);
        // Strictly better only: on a tie the title wins, so a title match
        // never gets labelled with an alias the writer did not type.
        if (r !== null && (best === null || r < best)) {
          best = r;
          alias = a;
        }
      }
    }
    if (best === null) {
      const inTags = note.tags.some((t) => fold(t).includes(q));
      if (inTags || fold(note.body).includes(q)) best = 5;
    }
    if (best === null) continue;
    // "Wren" typed, "Wren Calloway" shown: the alias still earns the rank,
    // but the label is noise when the reason is already on screen.
    if (titleRank !== null) alias = undefined;
    const hit: CodexHit = alias === undefined ? { id: note.id, rank: best } : { id: note.id, rank: best, alias };
    ranked.set(note.id, { note, hit });
  }

  // Anything the old search found stays found, even in the Unicode corners
  // where fold() and vault.ts's trim().toLowerCase() disagree.
  for (const note of vaultHits) {
    if (!ranked.has(note.id)) ranked.set(note.id, { note, hit: { id: note.id, rank: 5 } });
  }

  // Fully ordered so the list does not jitter between keystrokes.
  return [...ranked.values()]
    .sort(
      (a, b) =>
        a.hit.rank - b.hit.rank ||
        a.note.title.localeCompare(b.note.title, undefined, { sensitivity: "base" }) ||
        (a.note.id < b.note.id ? -1 : a.note.id > b.note.id ? 1 : 0),
    )
    .map((r) => r.hit);
}

/** Ids in rank order, or null for an empty query. */
export function codexSearchIds(
  notes: readonly Note[],
  query: string,
  vaultHits: readonly Note[] = [],
): string[] | null {
  return searchCodex(notes, query, vaultHits)?.map((h) => h.id) ?? null;
}
