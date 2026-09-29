/* Assertions for the manuscript word count.

   Same shape as test-units.ts: silent unless something is wrong, non-zero
   exit when it is.

   Two things are proved here. Markup is not words — a scene break, a
   heading's #, an emphasis star — so the titlebar number is the number on
   the exported title page. And the count is cached per note, so typing in
   one chapter never re-reads the other three hundred. The store is driven
   headless at the end so the cache is proved against the real in-place
   body mutation in vaultStore.setBody, not a stand-in. */

import {
  manuscriptNotes,
  manuscriptWordCount,
  noteWordCount,
  proseWordCount,
  recountsSoFar,
} from "./src/analysis/wordCounts";
import { manuscriptWordCount as sessionsWordCount } from "./src/state/sessions";
import { store } from "./src/state/vaultStore";
import { paragraphWords, toParagraphs } from "./src/export/compile";
import type { Note, NoteType } from "./src/core/vault";

let failures = 0;
let checks = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

function ok(name: string, condition: boolean): void {
  checks++;
  if (!condition) {
    failures++;
    console.error(`FAIL  ${name}`);
  }
}

function note(id: string, body: string, type: NoteType = "chapter"): Note {
  return { id, path: `chapters/${id}.md`, type, title: id, aliases: [], tags: [], data: {}, body };
}

/* ---------- markup is not words ---------- */

// Each expectation was read off the export's own counter, and several
// are here because the old whitespace split got them wrong: `***` was a
// word, `* * *` was three, a heading's # was one more.
const MARKUP: [string, string, number][] = [
  ["empty", "", 0],
  ["whitespace only", "   \n\n ", 0],
  ["*** scene break", "***", 0],
  ["* * * scene break", "* * *", 0],
  ["--- scene break", "---", 0],
  ["lone # scene break", "#", 0],
  ["heading marks are not words", "# Chapter One\n\nHello world", 4],
  ["h2 marks are not words", "## Two words here", 3],
  ["emphasis stars are not words", "She *never* said **back**", 4],
  ["emphasis underscores are not words", "_quiet_ and __loud__", 3],
  ["break between paragraphs counts zero", "one two\n\n***\n\nthree", 3],
  ["break typed flush against prose counts zero", "one two\n***\nthree", 3],
  ["wiki-link alias reads as its text", "[[Halden's Reach|the Reach]] fell", 3],
  ["html comment is not prose", "<!-- todo -->\n\nfine", 1],
  ["blockquote mark is not a word", "> he said", 2],
  ["contraction is one word", "don't stop", 2],
  ["em-dash separates words", "word—word", 2],
];
for (const [name, body, expected] of MARKUP) {
  check(`prose: ${name}`, proseWordCount(body), expected);
  check(`note: ${name}`, noteWordCount(note(`m-${name}`, body)), expected);
}

// The export's own counter is the definition; the two must never drift.
{
  const mixed = "# One\n\nShe *never* said **back** to [[Halden's Reach]].\n\n***\n\n> Quiet. Don't.\n\n<!-- beat -->";
  check("agrees with export paragraphWords", noteWordCount(note("mixed", mixed)), paragraphWords(toParagraphs(mixed)));
}

// A manuscript is whatever notes it is handed; selection is manuscriptNotes' job.
{
  const chapter = note("ch", "one two three");
  const scene = note("sc", "four five", "scene");
  check("manuscript total sums chapters and scenes", manuscriptWordCount([chapter, scene]), 5);
  check("empty manuscript is zero", manuscriptWordCount([]), 0);
}

/* ---------- the cache ---------- */

{
  const a = note("cache-a", "alpha beta gamma");
  const b = note("cache-b", "delta");
  const before = recountsSoFar();
  check("cold: both counted", manuscriptWordCount([a, b]), 4);
  check("cold: two recounts", recountsSoFar() - before, 2);

  const warm = recountsSoFar();
  check("warm: same total", manuscriptWordCount([a, b]), 4);
  check("warm: no recount when nothing changed", recountsSoFar() - warm, 0);

  // Same content, different string instance — still no recount, because
  // === on strings compares value.
  const copy = note("cache-a", "alpha beta gamma".split(" ").join(" "));
  const same = recountsSoFar();
  check("equal body under a new string is a hit", manuscriptWordCount([copy, b]), 4);
  check("equal body under a new string does not recount", recountsSoFar() - same, 0);

  // In-place mutation is what vaultStore.setBody does: same object, new string.
  const edit = recountsSoFar();
  a.body = "alpha beta gamma delta epsilon";
  check("edit: total reflects the new body", manuscriptWordCount([a, b]), 6);
  check("edit: exactly the edited note is recounted", recountsSoFar() - edit, 1);

  // A note dropped from the manuscript leaves the cache; bringing it back
  // costs one recount, which is how we know it was pruned.
  manuscriptWordCount([b]);
  const prune = recountsSoFar();
  manuscriptWordCount([a, b]);
  check("pruned note is recounted on return", recountsSoFar() - prune, 1);
}

// 400 chapters of ~2,500 words: a keystroke must not re-read the book.
{
  const para = "The quick brown fox jumps over the lazy dog and *keeps* running. ".repeat(105);
  const book = Array.from({ length: 400 }, (_, i) => note(`big-${i}`, `# Chapter ${i + 1}\n\n${para}\n\n***\n\n${para}`));
  let t = performance.now();
  const cold = manuscriptWordCount(book);
  const coldMs = performance.now() - t;

  // Best of three: the bar is 2 ms and the assertion should fail on a
  // broken cache, not on a busy CI box.
  let warmMs = Infinity;
  let warm = -1;
  for (let i = 0; i < 3; i++) {
    t = performance.now();
    warm = manuscriptWordCount(book);
    warmMs = Math.min(warmMs, performance.now() - t);
  }
  check("big book: 2,522 words a chapter", cold, 400 * 2522);
  check("big book: warm equals cold", warm, cold);
  ok(`big book: warm under 2 ms (was ${warmMs.toFixed(3)} ms)`, warmMs < 2);
  ok(`big book: cold did real work (${coldMs.toFixed(1)} ms)`, coldMs > warmMs);

  // Editing one chapter recounts one chapter.
  const before = recountsSoFar();
  book[7]!.body += "\n\nfive more words added here";
  check("big book: one edit adds five", manuscriptWordCount(book), cold + 5);
  check("big book: one edit is one recount", recountsSoFar() - before, 1);
}

/* ---------- titlebar and sessions agree, on the real store ---------- */

{
  // The bundled seed world: no vault root, memory storage, no disk.
  store.loadSeed();
  const titlebar = manuscriptWordCount(manuscriptNotes(store.vault));
  ok("seed: the manuscript has words", titlebar > 0);
  check("seed: sessions total equals the titlebar total", sessionsWordCount(), titlebar);
  check(
    "seed: export order sums to the same total",
    store.orderedChapters().reduce((n, c) => n + noteWordCount(c), 0),
    titlebar,
  );

  // An edit through the store — in-place mutation of note.body — is seen
  // by both counters, and only that note is recounted.
  const first = store.orderedChapters()[0]!;
  const before = recountsSoFar();
  // The store logs the session's first edit as a desktop diagnostic;
  // this suite stays silent unless something fails.
  const log = console.log;
  console.log = () => {};
  try {
    store.setBody(first.id, `${first.body}\n\nfive more words added here`);
  } finally {
    console.log = log;
  }
  const after = manuscriptWordCount(manuscriptNotes(store.vault));
  check("store edit: titlebar total grows by five", after, titlebar + 5);
  check("store edit: sessions total follows", sessionsWordCount(), after);
  check("store edit: only the edited note was recounted", recountsSoFar() - before, 1);
}

/* ---------- report ---------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`word counts: ${checks} checks passed`);
