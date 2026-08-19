/* Assertions for the formatting bar's text arithmetic.

   Same shape as test-units.ts: silent unless something is wrong, non-zero
   exit when it is.

   The bar makes one promise — press a button twice and the page is
   exactly as you left it, same characters and same selection. That is the
   difference between a toolbar and a trap, and it is not a promise you
   can keep by reading the code, so every toggle is round-tripped here.

   Selections are written in the source as `«selected»` or `|caret`, and
   read back the same way, so a failure prints something you can see. */

import {
  inspect,
  linkTarget,
  toggleHeading,
  toggleInline,
  toggleLink,
  toggleList,
  toggleQuote,
  type FormatResult,
  type HeadingLevel,
  type InlineMark,
  type ListKind,
} from "./src/ui/formatCommands";

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

/* ---------------- notation ---------------- */

interface Spot {
  text: string;
  from: number;
  to: number;
}

/** `a«bc»d` is a selection; `ab|cd` is a caret. */
function at(spec: string): Spot {
  const caret = spec.indexOf("|");
  if (caret !== -1) {
    return { text: spec.slice(0, caret) + spec.slice(caret + 1), from: caret, to: caret };
  }
  const a = spec.indexOf("«");
  const b = spec.indexOf("»");
  if (a === -1 || b === -1) throw new Error(`no selection marked in ${JSON.stringify(spec)}`);
  return {
    text: spec.slice(0, a) + spec.slice(a + 1, b) + spec.slice(b + 1),
    from: a,
    to: b - 1,
  };
}

function show(r: FormatResult): string {
  return r.from === r.to
    ? r.text.slice(0, r.from) + "|" + r.text.slice(r.from)
    : r.text.slice(0, r.from) + "«" + r.text.slice(r.from, r.to) + "»" + r.text.slice(r.to);
}

type Command = (text: string, from: number, to: number) => FormatResult;

function run(command: Command, spec: string): FormatResult {
  const s = at(spec);
  return command(s.text, s.from, s.to);
}

/** Press once, and say exactly what you got. */
function once(name: string, command: Command, spec: string, expected: string): FormatResult {
  const r = run(command, spec);
  check(name, show(r), expected);
  return r;
}

/** The whole quality bar: press twice, get the page back — text AND
    selection, to the character. */
function trip(name: string, command: Command, spec: string): void {
  const start = at(spec);
  const first = command(start.text, start.from, start.to);
  const second = command(first.text, first.from, first.to);
  check(`${name} — round trip`, show(second), spec);
}

/** Weaker promise for selections that were never canonical to begin with
    (padded with spaces, or swallowing their own markers): the prose comes
    back untouched even though the selection tightens. */
function tripText(name: string, command: Command, spec: string): void {
  const start = at(spec);
  const first = command(start.text, start.from, start.to);
  const second = command(first.text, first.from, first.to);
  check(`${name} — round trip (text)`, second.text, start.text);
}

const inline = (mark: InlineMark): Command => (t, f, o) => toggleInline(t, f, o, mark);
const list = (kind: ListKind): Command => (t, f, o) => toggleList(t, f, o, kind);
const heading = (level: HeadingLevel): Command => (t, f, o) => toggleHeading(t, f, o, level);
const link = (url: string): Command => (t, f, o) => toggleLink(t, f, o, url);

/* ---------------- inline marks ---------------- */

const MARKS: { mark: InlineMark; m: string }[] = [
  { mark: "bold", m: "**" },
  { mark: "italic", m: "_" },
  { mark: "strike", m: "~~" },
  { mark: "code", m: "`" },
];

for (const { mark, m } of MARKS) {
  const cmd = inline(mark);

  once(`${mark} wraps a selection`, cmd, "the «quick» fox", `the ${m}«quick»${m} fox`);
  trip(`${mark} selection`, cmd, "the «quick» fox");

  once(`${mark} unwraps`, cmd, `the ${m}«quick»${m} fox`, "the «quick» fox");

  // The caret alone means the word under it.
  once(`${mark} takes the word under the caret`, cmd, "the qu|ick fox", `the ${m}qu|ick${m} fox`);
  trip(`${mark} caret in a word`, cmd, "the qu|ick fox");

  // Nowhere to grab: leave a pair to type into, and take it away again.
  once(`${mark} opens an empty pair`, cmd, "the |", `the ${m}|${m}`);
  trip(`${mark} empty pair`, cmd, "the |");

  // A selection that swallowed its own markers still comes off.
  once(`${mark} unwraps from outside`, cmd, `the «${m}quick${m}» fox`, "the «quick» fox");
  tripText(`${mark} markers inside the selection`, cmd, `the «${m}quick${m}» fox`);

  // Markdown will not emphasise across a trailing space, so the edges
  // pull in. The prose still round-trips; the selection tightens by one.
  once(`${mark} trims a trailing space`, cmd, "the «quick » fox", `the ${m}«quick»${m}  fox`);
  tripText(`${mark} padded selection`, cmd, "the «quick » fox");

  // Whole-document selections and first-character positions.
  trip(`${mark} at the very start`, cmd, "«quick» fox");
  trip(`${mark} whole line`, cmd, "«quick fox»");

  // What the bar lights up has to agree with what the button does.
  const on = run(cmd, "the «quick» fox");
  ok(`${mark} reads as on after applying`, inspect(on.text, on.from, on.to)[mark]);
  const start = at("the «quick» fox");
  ok(`${mark} reads as off before applying`, !inspect(start.text, start.from, start.to)[mark]);
}

// Marks compose without eating each other — the reason italic is `_`.
{
  const bolded = run(inline("bold"), "«brave» new world");
  check("bold then italic nests", show(run(inline("italic"), show(bolded))), "_**«brave»**_ new world");
  // Bold has to see its own asterisks through the italic markers, or the
  // button lies about the state and then makes a second pair.
  ok(
    "italic inside bold reads as both",
    inspect("**_brave_** new", 3, 8).italic && inspect("**_brave_** new", 3, 8).bold,
  );
  check(
    "bold comes off from inside the italics",
    show(run(inline("bold"), "**_«brave»_** new")),
    "_«brave»_ new",
  );
  trip("italic inside bold", inline("italic"), "**«brave»** new world");
  trip("bold outside italic", inline("bold"), "«_brave_» new world");
}

/* ---------------- lists ---------------- */

once("bullet on one line", list("bullet"), "«Ashes.»", "- «Ashes.»");
trip("bullet one line", list("bullet"), "«Ashes.»");
trip("bullet caret only", list("bullet"), "Ash|es.");
trip("bullet three lines", list("bullet"), "«one\ntwo\nthree»");
once(
  "bullet three lines",
  list("bullet"),
  "«one\ntwo\nthree»",
  "- «one\n- two\n- three»",
);

once(
  "numbered counts up",
  list("numbered"),
  "«one\ntwo\nthree»",
  "1. «one\n2. two\n3. three»",
);
trip("numbered three lines", list("numbered"), "«one\ntwo\nthree»");
trip("numbered one line", list("numbered"), "«Ashes.»");

// Applying a list to the same list removes it; to the other list, converts.
once("bullet over numbered converts", list("bullet"), "«1. one\n2. two»", "«- one\n- two»");
once("numbered over bullet converts", list("numbered"), "«- one\n- two»", "«1. one\n2. two»");
// Converting is not a toggle: the next press takes the list off, it does
// not put the numbers back.
check(
  "a converted list toggles off, not back",
  show(run(list("bullet"), show(run(list("bullet"), "«1. one\n2. two»")))),
  "«one\ntwo»",
);

// A blank line inside the range stays blank.
once(
  "lists skip blank lines",
  list("bullet"),
  "«one\n\ntwo»",
  "- «one\n\n- two»",
);
trip("bullet across a blank line", list("bullet"), "«one\n\ntwo»");

// A selection ending exactly at a line start does not drag the next line in.
once("a trailing newline does not reach the next line", list("bullet"), "«one\n»two", "- «one\n»two");

// Indentation survives.
once("bullet keeps indentation", list("bullet"), "«  one»", "«  - one»");
trip("bullet indented", list("bullet"), "«  one»");

/* ---------------- blockquote ---------------- */

once("quote one line", toggleQuote, "«He lied.»", "> «He lied.»");
trip("quote one line", toggleQuote, "«He lied.»");
trip("quote caret only", toggleQuote, "He li|ed.");
once("quote three lines", toggleQuote, "«a\nb\nc»", "> «a\n> b\n> c»");
trip("quote three lines", toggleQuote, "«a\nb\nc»");
trip("quote across a blank line", toggleQuote, "«a\n\nb»");

// Quotes and lists stack rather than fight: the list goes *inside* the
// quote, and each still comes off on its own.
{
  const quoted = run(toggleQuote, "«one\ntwo»");
  check("quote then bullet", show(run(list("bullet"), show(quoted))), "> - «one\n> - two»");
  trip("bullet inside a quote", list("bullet"), "«> one\n> two»");
  trip("quote around a list", toggleQuote, "«- one\n- two»");
  check(
    "heading inside a quote",
    show(run(heading(2), "«> one»")),
    "«> ## one»",
  );
}

/* ---------------- headings ---------------- */

once("title", heading(1), "«Chapter One»", "# «Chapter One»");
once("h1", heading(2), "«Chapter One»", "## «Chapter One»");
once("h2", heading(3), "«Chapter One»", "### «Chapter One»");
once("h3", heading(4), "«Chapter One»", "#### «Chapter One»");

for (const level of [1, 2, 3, 4] as HeadingLevel[]) {
  trip(`heading ${level} toggles off`, heading(level), "«Chapter One»");
  trip(`heading ${level} caret only`, heading(level), "Chapter |One");
}

// Levels replace each other rather than stacking hashes.
once("h2 over title", heading(3), "«# Chapter One»", "«### Chapter One»");
once("body strips any level", heading(0), "«#### Chapter One»", "«Chapter One»");
check("body on body is a no-op", show(run(heading(0), "«Chapter One»")), "«Chapter One»");

// Several lines at once.
once("heading over two lines", heading(2), "«one\ntwo»", "## «one\n## two»");
trip("heading over two lines", heading(2), "«one\ntwo»");

{
  const h = run(heading(3), "«Chapter One»");
  check("inspect reads the level back", inspect(h.text, h.from, h.to).heading, 3);
  check("inspect calls body 0", inspect("Chapter One", 0, 11).heading, 0);
  check("mixed levels read as body", inspect("# a\n### b", 0, 9).heading, 0);
}

/* ---------------- links ---------------- */

once(
  "link wraps a selection",
  link("https://x.dev"),
  "read «this» now",
  "read [«this»](https://x.dev) now",
);
trip("link a selection", link("https://x.dev"), "read «this» now");

once("link unwraps from the label", link(""), "read [«this»](https://x.dev) now", "read «this» now");
once("link unwraps from the caret", link(""), "read [th|is](https://x.dev) now", "read th|is now");

// The caret alone links the word under it, and unlinks it again.
once("link takes the word under the caret", link("u"), "read th|is now", "read [th|is](u) now");
trip("link a word under the caret", link("u"), "read th|is now");

// Nothing to link: the template, with the label selected to type over.
once("link with nothing to grab", link(""), "read |", "read [«text»](url)");
once("link with a url but nothing to grab", link("u"), "read |", "read [«text»](u)");

check("linkTarget finds the url", linkTarget("read [this](https://x.dev) now", 8, 8), "https://x.dev");
check("linkTarget outside a link", linkTarget("read this now", 6, 6), null);

{
  const l = run(link("u"), "read «this» now");
  ok("a fresh link reads as linked", inspect(l.text, l.from, l.to).link);
  ok("plain prose does not", !inspect("read this now", 5, 9).link);
}

/* ---------------- the marks agree with the lights ---------------- */

/* Every toggle above is really the same claim twice: inspect() says a
   mark is on exactly when pressing the button would take it off. Check
   that directly, from both sides, for every mark. */
for (const { mark } of MARKS) {
  const cmd = inline(mark);
  const before = at("the «quick» fox");
  const after = cmd(before.text, before.from, before.to);
  const lit = inspect(after.text, after.from, after.to)[mark];
  const undone = cmd(after.text, after.from, after.to);
  ok(`${mark}: lit means the next press removes it`, lit && undone.text === before.text);
}

for (const [name, cmd, key] of [
  ["bullet", list("bullet"), "bullet"],
  ["numbered", list("numbered"), "numbered"],
  ["quote", toggleQuote, "quote"],
] as const) {
  const before = at("«one\ntwo»");
  const after = cmd(before.text, before.from, before.to);
  ok(`${name}: reads as on once applied`, inspect(after.text, after.from, after.to)[key]);
  ok(`${name}: reads as off beforehand`, !inspect(before.text, before.from, before.to)[key]);
}

/* ---------------- odd corners ---------------- */

trip("bold in an empty document", inline("bold"), "|");
trip("bullet on an empty line", list("bullet"), "|");
trip("quote on an empty line", toggleQuote, "|");
check("heading on an empty line", show(run(heading(2), "|")), "## |");
trip("heading on an empty line", heading(2), "|");

// A caret at the very end of a word, and at the very end of the document.
trip("bold at the end of a word", inline("bold"), "quick| fox");
trip("bold at the end of the document", inline("bold"), "quick|");
trip("bold at the start of the document", inline("bold"), "|quick");

// Multi-paragraph selections.
trip("bullet over a whole passage", list("bullet"), "«He ran.\nShe waited.\nNobody spoke.»");
trip("quote over a whole passage", toggleQuote, "«He ran.\nShe waited.\nNobody spoke.»");

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks failed.`);
  process.exit(1);
}
