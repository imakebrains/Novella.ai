import type { ChangeSet, Text } from "@codemirror/state";
import { findInlineIssues, type InlineIssue, type IssueKind } from "../analysis/prose";

/* Which part of the chapter an edit forces the critique to look at again.

   findInlineIssues is a whole-text scan, and on a 100k-word chapter that
   is too slow to run per keystroke. Three of its four checks are local,
   though: an adverb or passive match never contains . ! or ?, and sticky
   works sentence by sentence. So the text can be cut wherever a sentence
   starts — the point splitSentences starts a match: a . ! or ? behind,
   anything else ahead — and each piece scanned alone gives exactly what
   the whole scan gives for it. The one thing that reaches further is
   [[link]] detection (adverbs and passives inside a link are skipped),
   so a cut must not fall inside a link either.

   Paragraph breaks are NOT cuts. Passive's \s+ crosses a newline, and a
   heading with no full stop runs into the next sentence as far as
   splitSentences is concerned. */

/** Checks whose answer for a sentence depends only on that sentence. */
export const LOCAL_KINDS: readonly IssueKind[] = ["adverb", "passive", "sticky"];

/* Echo is document-global, twice over. Whether a word counts as a name
   (and so is exempt) comes from properNounsIn over the whole text — one
   mid-sentence capital anywhere exempts it everywhere. And the per-word
   cap keeps the first two near-repeats in document order, so an edit in
   the first paragraph can take an underline off the three-hundredth. No
   window short of the whole chapter is right for it. */
export const GLOBAL_KINDS: readonly IssueKind[] = ["echo"];

/** Sorted positions of every "[" and every "]" in a doc. */
export interface BracketIndex {
  open: number[];
  close: number[];
}

/* The link regex in prose.ts is /\[\[[^\]]*\]\]/, which crosses newlines
   and has no length limit, so whether a position sits inside a link is a
   question about brackets arbitrarily far away. Keeping every bracket
   position answers it with a binary search instead of a walk back
   through the chapter, and the index can be carried through an edit in
   time proportional to the brackets, not the text. */
export function bracketIndexOf(doc: Text): BracketIndex {
  const open: number[] = [];
  const close: number[] = [];
  let offset = 0;
  for (const it = doc.iter(); !it.next().done; ) {
    const chunk = it.value;
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk.charCodeAt(i);
      if (ch === 91) open.push(offset + i);
      else if (ch === 93) close.push(offset + i);
    }
    offset += chunk.length;
  }
  return { open, close };
}

export function mapBracketIndex(prev: BracketIndex, changes: ChangeSet): BracketIndex {
  const deleted: [number, number][] = [];
  const addOpen: number[] = [];
  const addClose: number[] = [];
  changes.iterChanges((fromA, toA, fromB, _toB, inserted) => {
    if (toA > fromA) deleted.push([fromA, toA]);
    let offset = fromB;
    for (const it = inserted.iter(); !it.next().done; ) {
      const chunk = it.value;
      for (let i = 0; i < chunk.length; i++) {
        const ch = chunk.charCodeAt(i);
        if (ch === 91) addOpen.push(offset + i);
        else if (ch === 93) addClose.push(offset + i);
      }
      offset += chunk.length;
    }
  });

  // assoc 1: a position names the character starting there, and text
  // inserted at that position lands in front of it.
  const carry = (list: number[]): number[] => {
    const out: number[] = [];
    let d = 0;
    for (const p of list) {
      while (d < deleted.length && (deleted[d]?.[1] ?? 0) <= p) d++;
      const span = deleted[d];
      if (span && span[0] <= p && p < span[1]) continue;
      out.push(changes.mapPos(p, 1));
    }
    return out;
  };
  return { open: merge(carry(prev.open), addOpen), close: merge(carry(prev.close), addClose) };
}

function merge(a: number[], b: number[]): number[] {
  if (!b.length) return a;
  const out: number[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const x = a[i];
    const y = b[j];
    if (y === undefined || (x !== undefined && x < y)) {
      out.push(x as number);
      i++;
    } else {
      out.push(y);
      j++;
    }
  }
  return out;
}

/** Index of the first element >= x, or list.length. */
function lowerBound(list: number[], x: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((list[mid] ?? Infinity) < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function has(list: number[], x: number): boolean {
  return list[lowerBound(list, x)] === x;
}

/** The last element < x, or -1. */
function lastBelow(list: number[], x: number): number {
  return list[lowerBound(list, x) - 1] ?? -1;
}

/** Leftmost "[[" starting strictly between lo and hi, or -1. */
function firstPairBetween(open: number[], lo: number, hi: number): number {
  for (let i = lowerBound(open, lo + 1); i < open.length; i++) {
    const o = open[i] ?? Infinity;
    if (o >= hi) break;
    if (open[i + 1] === o + 1) return o;
  }
  return -1;
}

/* Whether c falls strictly inside a match of prose.ts's link regex, as
   its global scan reports them (leftmost, non-overlapping).

   A match holds no "]" before its closing "]]", so the scan starts clean
   after every "]": every "[[" between that "]" and c shares the same
   closing bracket, and the leftmost of them is the one reported. The one
   case that reasoning misses is c sitting between the two brackets of a
   closing "]]" — the "]" at c-1 then belongs to the match — which is
   handled by looking one bracket further back. */
export function linkCovers(idx: BracketIndex, c: number): boolean {
  const r = lastBelow(idx.close, c);
  if (r === c - 1) {
    if (!has(idx.close, c)) return false;
    return firstPairBetween(idx.open, lastBelow(idx.close, r), r) >= 0;
  }
  const s = firstPairBetween(idx.open, r, c);
  if (s < 0) return false;
  const q = idx.close[lowerBound(idx.close, s + 2)];
  if (q === undefined) return false;
  return has(idx.close, q + 1) && c < q + 2;
}

const isStop = (ch: string | undefined) => ch === "." || ch === "!" || ch === "?";

export function isCut(doc: Text, idx: BracketIndex, c: number): boolean {
  if (c <= 0 || c >= doc.length) return true;
  const pair = doc.sliceString(c - 1, c + 1);
  return isStop(pair[0]) && !isStop(pair[1]) && !linkCovers(idx, c);
}

const CHUNK = 256;

/** Largest sentence start <= pos (0 counts). Ignores links. */
function sentenceStartAtOrBefore(doc: Text, pos: number): number {
  if (pos >= doc.length) return doc.length;
  let c = pos;
  while (c > 0) {
    const lo = Math.max(0, c - CHUNK);
    const s = doc.sliceString(lo, c + 1);
    for (let k = c - lo; k >= 1; k--) {
      if (isStop(s[k - 1]) && !isStop(s[k])) return lo + k;
    }
    c = lo;
  }
  return 0;
}

/** Smallest sentence start >= pos (the doc's length counts). Ignores links. */
function sentenceStartAtOrAfter(doc: Text, pos: number): number {
  const len = doc.length;
  if (pos <= 0) return 0;
  let c = pos;
  while (c < len) {
    const hi = Math.min(len, c + CHUNK);
    const s = doc.sliceString(c - 1, hi);
    for (let x = c; x < hi; x++) {
      if (isStop(s[x - c]) && !isStop(s[x - c + 1])) return x;
    }
    c = hi;
  }
  return len;
}

/* The smallest stretch of the new doc that must be rescanned for the
   local kinds. Outside it, the old decorations — mapped through the
   change — are already exactly what a full scan would find.

   Both ends sit strictly outside the changed text, so the two characters
   deciding each cut are the same characters in the old doc and the new,
   and old decorations cannot span them either. Each end must also be
   clear of a link in BOTH docs: typing between the two "[" of a "[[" can
   dissolve or create a link reaching far past the edit, and that changes
   what is skipped out there. Checking both is what spares the bracket
   edits a whole-document fallback.

   Text with no sentence punctuation at all has no cuts, and the window
   grows to the whole doc — slower, never wrong. */
export function planWindow(
  oldDoc: Text,
  oldIdx: BracketIndex,
  doc: Text,
  idx: BracketIndex,
  changes: ChangeSet,
): { from: number; to: number } {
  let minFrom = Infinity;
  let maxTo = -1;
  changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    if (fromB < minFrom) minFrom = fromB;
    if (toB > maxTo) maxTo = toB;
  });
  if (maxTo < 0) return { from: 0, to: 0 };
  const len = doc.length;
  const delta = len - oldDoc.length;

  let from = Math.max(0, minFrom - 1);
  for (;;) {
    from = sentenceStartAtOrBefore(doc, from);
    if (from === 0 || (!linkCovers(idx, from) && !linkCovers(oldIdx, from))) break;
    from--;
  }

  let to = Math.min(len, maxTo + 1);
  for (;;) {
    to = sentenceStartAtOrAfter(doc, to);
    if (to >= len || (!linkCovers(idx, to) && !linkCovers(oldIdx, to - delta))) break;
    to++;
  }
  return { from, to: Math.min(to, len) };
}

/** The local-kind issues inside [from, to), in doc coordinates. */
export function scanWindow(
  doc: Text,
  from: number,
  to: number,
  kinds: ReadonlySet<IssueKind>,
): InlineIssue[] {
  const local = new Set(LOCAL_KINDS.filter((k) => kinds.has(k)));
  if (!local.size || to <= from) return [];
  // No `known` names: only echo reads them, and echo is never scanned here.
  return findInlineIssues(doc.sliceString(from, to), local).map((i) => ({
    ...i,
    from: i.from + from,
    to: i.to + from,
  }));
}
