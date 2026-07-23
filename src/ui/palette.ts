/* Matching for the Ctrl+K palette.

   Pure and separate from the component so ranking can be tested in Node.
   The palette mixes commands and notes in one list, so ranking quality is
   what decides whether it feels like teleportation or like search. */

export interface PaletteItem {
  id: string;
  label: string;
  /** Right-aligned context: "chapter", "character", a shortcut hint, … */
  hint?: string;
  kind: "command" | "chapter" | "note";
}

/* Tiers, best first: label starts with the query; some word in the label
   starts with it; the query appears anywhere; the query letters appear in
   order (so "tcl" finds "The Compass That Lies"). Anything else is out.
   Within a tier, shorter labels first — the query explains more of them. */
const START = 0;
const WORD = 1;
const SUBSTRING = 2;
const SUBSEQUENCE = 3;

function tierOf(query: string, label: string): number | null {
  const l = label.toLowerCase();
  if (l.startsWith(query)) return START;
  if (l.split(/[\s/–—-]+/).some((w) => w.startsWith(query))) return WORD;
  if (l.includes(query)) return SUBSTRING;
  let i = 0;
  for (const ch of l) {
    if (ch === query[i]) i++;
    if (i === query.length) return SUBSEQUENCE;
  }
  return null;
}

export function matchPalette(
  query: string,
  items: PaletteItem[],
  limit = 12,
): PaletteItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, limit);

  const scored: { item: PaletteItem; tier: number; at: number }[] = [];
  items.forEach((item, at) => {
    const tier = tierOf(q, item.label);
    if (tier !== null) scored.push({ item, tier, at });
  });

  scored.sort(
    (a, b) =>
      a.tier - b.tier ||
      a.item.label.length - b.item.label.length ||
      a.at - b.at,
  );
  return scored.slice(0, limit).map((s) => s.item);
}
