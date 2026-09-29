import type { Note, Vault } from "../core/vault";
import { paragraphWords, toParagraphs } from "../export/compile";

/* ============================================================
   Manuscript word counts

   Two things were wrong with the old count. It split on whitespace,
   so a scene break, a heading's # and a stray emphasis star were each
   a word — the titlebar disagreed with the exported manuscript. And
   it re-read the whole book on every keystroke, because the autosave
   effect calls recordProgress() on each edit.

   The definition of "a word" is borrowed from the export path, so the
   number on the titlebar is the number on the title page. The cache is
   keyed by note id and compares the body STRING, not the note object:
   vaultStore.setBody mutates note.body in place, so object identity
   never changes, but the string does. Strings are immutable, so a body
   that === the cached one cannot have been edited.
   ============================================================ */

type Counted = Pick<Note, "id" | "body">;

interface Entry {
  body: string;
  words: number;
}

let cache = new Map<string, Entry>();
let recounts = 0;

/** PURE, uncached. Words in one body with Markdown markup removed. */
export function proseWordCount(body: string): number {
  return paragraphWords(toParagraphs(body));
}

function entryFor(note: Counted): Entry {
  const hit = cache.get(note.id);
  if (hit && hit.body === note.body) return hit;
  recounts++;
  const entry = { body: note.body, words: proseWordCount(note.body) };
  cache.set(note.id, entry);
  return entry;
}

export function noteWordCount(note: Counted): number {
  return entryFor(note).words;
}

/** The chapters and scenes — the manuscript, not the codex. One place
    to say so, so the titlebar, sessions and sprints can't drift apart. */
export function manuscriptNotes(vault: Pick<Vault, "byType">): Note[] {
  return [...vault.byType("chapter"), ...vault.byType("scene")];
}

/** Total across the given notes; only bodies that changed since the last
    call are recounted. The cache is rebuilt from what this call saw, so a
    deleted note or a swapped vault doesn't leave stale bodies pinned in
    memory. */
export function manuscriptWordCount(notes: Iterable<Counted>): number {
  const next = new Map<string, Entry>();
  let total = 0;
  for (const note of notes) {
    const entry = entryFor(note);
    next.set(note.id, entry);
    total += entry.words;
  }
  cache = next;
  return total;
}

/** Bodies counted from scratch since load. Exists so the test suite can
    prove the cache is doing its job without a stopwatch. */
export function recountsSoFar(): number {
  return recounts;
}
