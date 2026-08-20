/* Assertions for the prose critique — mostly for the things it must NOT say.

   Same shape as test-units.ts: silent unless something is wrong, non-zero
   exit when it is.

   The echo detector shipped flagging every five-letter word repeated
   within sixty words. In fiction that means it underlines the
   protagonist's name on every page, and a detector a novelist has to
   ignore is a detector they turn off. Most of what follows is therefore
   negative: proof that ordinary, correct prose comes back clean. The
   false-positive tests are the point; the true-positive tests only make
   sure the fix didn't hollow the feature out. */

import { analyseProse, findInlineIssues, type IssueKind } from "./src/analysis/prose";

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

/* ---------------- helpers ---------------- */

const ECHO: Set<IssueKind> = new Set(["echo"]);
const ADVERB: Set<IssueKind> = new Set(["adverb"]);

/** Words the echo check underlines, lowercased, in document order. */
function echoWords(text: string, known?: string[]): string[] {
  return findInlineIssues(text, ECHO, known ? { known } : undefined)
    .sort((a, b) => a.from - b.from)
    .map((i) => text.slice(i.from, i.to).toLowerCase());
}

/** Words the adverb check underlines. */
function adverbWords(text: string): string[] {
  return findInlineIssues(text, ADVERB)
    .sort((a, b) => a.from - b.from)
    .map((i) => text.slice(i.from, i.to).toLowerCase());
}

/** Repeat a word twice with `gap` filler words between them. */
function spaced(word: string, gap: number): string {
  const filler = Array.from({ length: gap }, (_, i) => `w${i}`).join(" ");
  return `${word} ${filler} ${word}`;
}

/* ============================================================
   Names are not echoes

   This is the whole reason the detector was unusable. A novel repeats
   its characters' names constantly and should — the alternative ("the
   taller woman") is worse writing.
   ============================================================ */

const scene = `Calloway crossed the yard before dawn. The frost had not lifted, and
Calloway could see her own breath ahead of her. Somewhere past the wall a dog
started up, and Calloway stopped walking to listen.`;

check("a character's name is never an echo", echoWords(scene), []);

check(
  "a place name is never an echo",
  echoWords(`They rode for Halden's Reach. Nothing waited at Halden's Reach.`),
  [],
);

// A name at the very start of a sentence still counts as a name, because
// it also appears mid-sentence somewhere in the passage.
check(
  "a name is exempt even where it opens a sentence",
  echoWords(`The road bent north. Marlow whistled. Nobody answered Marlow.`),
  [],
);

// Dialogue puts names behind an opening quote at the start of a line —
// the case that breaks a naive "capitalised and not first" rule.
check(
  "a name inside dialogue is still a name",
  echoWords(`"Nesbitt," she said. "Nesbitt, you have to look at me."`),
  [],
);

check(
  "a curly-quoted name is still a name",
  echoWords(`“Nesbitt,” she said. “Nesbitt, look at me.”`),
  [],
);

/* ============================================================
   The codex knows things a regex cannot

   A character called Sparrow is a common noun to a detector and a
   protagonist to the book. Nothing but the codex can tell them apart.
   ============================================================ */

const sparrow = `The sparrow went ahead, because the sparrow never waited.`;

ok("without the codex, sparrow reads as an echo", echoWords(sparrow).length > 0);
check("a codex entry named Sparrow is exempt", echoWords(sparrow, ["Sparrow"]), []);

check(
  "a multi-word codex title exempts each of its words",
  echoWords(`The reach was quiet. Past the reach, nothing moved.`, ["Halden's Reach"]),
  [],
);

check(
  "an alias is exempt the same as a title",
  echoWords(`The magistrate spoke. Nobody argued with the magistrate.`, ["The Magistrate"]),
  [],
);

/* ============================================================
   Dialogue attribution repeats on purpose
   ============================================================ */

check(
  "attribution verbs are never echoes",
  echoWords(`"Go," she whispered. He shook his head. "Please," she whispered again.`),
  [],
);

check(
  "asked and answered repeat freely",
  echoWords(`"Where?" he asked. She shrugged. "Where," he asked again, louder.`),
  [],
);

/* ============================================================
   Range scales with distinctiveness

   A plain word twice in sixty words is invisible; a rare word twice in
   sixty words is a thud. One flat window could not be right for both.
   ============================================================ */

check("a short word repeating at 20 words is an echo", echoWords(spaced("stone", 20)), ["stone"]);
check("a short word repeating at 40 words is not", echoWords(spaced("stone", 40)), []);
check("a mid word repeating at 30 words is an echo", echoWords(spaced("lantern", 30)), ["lantern"]);
check("a mid word repeating at 50 words is not", echoWords(spaced("lantern", 50)), []);
check(
  "a rare word repeating at 50 words is still an echo",
  echoWords(spaced("phosphorescence", 50)),
  ["phosphorescence"],
);
check("nothing repeats past 60 words", echoWords(spaced("phosphorescence", 70)), []);

/* ============================================================
   One word cannot paint the whole chapter

   A scene about a lantern says "lantern". The report should say so once
   or twice, not underline every instance for three thousand words.
   ============================================================ */

const drumbeat = Array.from({ length: 12 }, () => "the lantern swung and the").join(" ");
const perWord = new Map<string, number>();
for (const w of echoWords(drumbeat)) perWord.set(w, (perWord.get(w) ?? 0) + 1);
ok("lantern recurs twelve times", drumbeat.split("lantern").length - 1 === 12);
ok(
  "no single word claims more than two underlines",
  [...perWord.values()].every((n) => n <= 2),
);

/* ============================================================
   Adverbs: words that merely end in -ly

   Underlining "family" and "butterfly" as adverbs is the fastest way to
   teach a writer to switch the feature off.
   ============================================================ */

check("family is not an adverb", adverbWords("He missed his family."), []);
check("butterfly is not an adverb", adverbWords("A butterfly crossed the path."), []);
check("supply is not an adverb", adverbWords("The supply held out."), []);
check("assembly is not an adverb", adverbWords("The assembly rose."), []);
check("real adverbs still get flagged", adverbWords("She walked slowly and spoke angrily."), [
  "slowly",
  "angrily",
]);
check(
  "an adverb beside a false one is still caught",
  adverbWords("His family waited quietly."),
  ["quietly"],
);

/* ============================================================
   The panel and the underlines agree

   If the report lists an echo the manuscript refuses to mark, the writer
   is looking for something that isn't there.
   ============================================================ */

const both = `The lantern guttered. Wind came off the water and the lantern went out.`;
const reported = analyseProse(both).echoes.map((e) => e.word);
const marked = echoWords(both);
check("panel and editor agree on the same passage", reported, ["lantern"]);
ok("every reported echo is also underlined", reported.every((w) => marked.includes(w)));

const namedPassage = analyseProse(scene);
check("the panel exempts names too", namedPassage.echoes, []);

check(
  "the panel honours the codex",
  analyseProse(sparrow, { known: ["Sparrow"] }).echoes,
  [],
);

check(
  "the panel does not count family as an adverb",
  analyseProse("He missed his family.").adverbs.map((a) => a.text),
  [],
);

/* ============================================================
   The rest of the report still works
   ============================================================ */

const paragraph = `He waited by the door. The rain had stopped an hour ago and the street
outside was bright with it. Nobody came.`;
const report = analyseProse(paragraph);
ok("word count is plausible", report.words > 20 && report.words < 40);
ok("sentences are counted", report.sentences === 3);
ok("readability lands in range", report.readability.score >= 0 && report.readability.score <= 100);
check("empty text does not throw", analyseProse("").words, 0);
check("empty text has no echoes", findInlineIssues("", ECHO), []);

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks failed.`);
  process.exit(1);
}
