import type { Note } from "../core/vault";
import { countWords } from "../analysis/prose";
import { taskProgress, type TaskProgress } from "../core/tasks";
import { stripWikiLinks } from "../ai/context";

/* Per-note derived values the board surfaces all need — word count,
   task progress, link-stripped prose. Recomputing these for every card
   on every vault change is fine at 20 chapters and a stall at 200, so
   they're cached per note object and invalidated by body identity.
   A WeakMap keyed on the Note lets reloads (which rebuild note objects)
   drop stale entries by garbage collection instead of bookkeeping. */

interface Derived {
  body: string;
  words: number;
  tasks: TaskProgress;
  /** Body with [[wiki-link]] plumbing removed and whitespace collapsed. */
  stripped: string;
}

const cache = new WeakMap<Note, Derived>();

export function cardDerived(note: Note): Derived {
  const hit = cache.get(note);
  if (hit && hit.body === note.body) return hit;
  const fresh: Derived = {
    body: note.body,
    words: countWords(note.body),
    tasks: taskProgress(note.body),
    stripped: stripWikiLinks(note.body).replace(/\s+/g, " ").trim(),
  };
  cache.set(note, fresh);
  return fresh;
}
