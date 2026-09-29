/* Assertion tests for [[links]] in the prose.

   The live preview — which characters hide, which read as a link, which
   read as dangling — is decided by a StateField, and a StateField is pure
   state: an EditorState can be built, its selection moved and its
   decorations read back in node with no DOM. Only the view is
   browser-side (the hover card, tooltip placement, Ctrl+click through
   posAtCoords), so wikiLinkExtension.ts is never imported here — it
   pulls in the store, the storage adapters and React.

   Same shape as test-units.ts: silent unless something is wrong,
   non-zero exit when it is. */

import { EditorSelection, EditorState } from "@codemirror/state";
import { extractWikiLinks } from "./src/core/vault";
import {
  firstParagraph,
  linkAt,
  linkExists,
  parseWikiLinks,
  refreshWikiLinks,
  revealedLines,
  wikiLinkField,
  wikiLinkSpans,
  type WikiSpan,
} from "./src/ui/wikiLinks";

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

/* ---------- parser ---------- */

check("plain link", parseWikiLinks("see [[Halden's Reach]] now"), [
  { from: 4, to: 22, name: "Halden's Reach", alias: null, display: "Halden's Reach", displayFrom: 6, displayTo: 20 },
]);

{
  const [l] = parseWikiLinks("[[Kestrel|the captain]]");
  check("alias", l && [l.name, l.alias, l.display, l.displayFrom, l.displayTo, l.to], [
    "Kestrel",
    "the captain",
    "the captain",
    10,
    21,
    23,
  ]);
}

{
  const links = parseWikiLinks("[[A]] and [[B|bee]]");
  check("two per line: froms", links.map((l) => l.from), [0, 10]);
  check("two per line: displays", links.map((l) => l.display), ["A", "bee"]);
}

{
  const links = parseWikiLinks("x\n[[A]]\n\n[[B]]");
  check("absolute offsets across lines: froms", links.map((l) => l.from), [2, 9]);
  check("absolute offsets across lines: tos", links.map((l) => l.to), [7, 14]);
}

{
  const s = "[[a [[b]] c]]";
  const links = parseWikiLinks(s);
  check("nested brackets follow vault.ts", links.map((l) => [l.name, l.from, l.to]), [["a [[b", 0, 9]]);
  check("nested brackets: parity with vault.extractWikiLinks", links.map((l) => l.name), extractWikiLinks(s));
}

for (const s of ["[[Halden", "[[Halden]", "[Halden]]", "[[]]", "[[Name|]]", "[[|x]]", "[Halden]", "[[ ]]"]) {
  check(`not a link: ${JSON.stringify(s)}`, parseWikiLinks(s), []);
}

/* The parity corpus leaves out the two deliberate divergences below:
   vault.ts still yields "a\nb" for a link across a newline, and "" for
   `[[ ]]`. The editor refuses both, so it only ever decorates less. */
for (const s of [
  "see [[Halden's Reach]] now",
  "[[Kestrel|the captain]]",
  "[[A]] and [[B|bee]]",
  "x\n[[A]]\n\n[[B]]",
  "[[a [[b]] c]]",
  "[[Halden",
  "[[Halden]",
  "[Halden]]",
  "[[]]",
  "[[Name|]]",
  "[[|x]]",
  "[Halden]",
  "[[A]][[B]]",
  "[[ Halden ]]",
  "[[Ærøskøbing]]",
  "[[東京|the capital]]",
]) {
  check(`parity with vault.ts: ${JSON.stringify(s)}`, parseWikiLinks(s).map((l) => l.name), extractWikiLinks(s));
}

// A decoration can't span lines, so the editor stops at the newline.
check("newline divergence: editor", parseWikiLinks("[[a\nb]]"), []);
check("newline divergence: vault.ts", extractWikiLinks("[[a\nb]]"), ["a\nb"]);
check("blank divergence: vault.ts still counts it", extractWikiLinks("[[ ]]"), [""]);

{
  const [l] = parseWikiLinks("[[ Halden ]]");
  check("whitespace: trimmed name, raw display", l && [l.name, l.display, l.displayFrom, l.displayTo], [
    "Halden",
    " Halden ",
    2,
    10,
  ]);
}

{
  // A blank alias would render as an empty link; the name shows instead.
  const [l] = parseWikiLinks("[[Kestrel| ]]");
  check("blank alias falls back to the name", l && [l.name, l.alias, l.display, l.displayFrom, l.displayTo, l.to], [
    "Kestrel",
    null,
    "Kestrel",
    2,
    9,
    13,
  ]);
}

{
  const [a] = parseWikiLinks("[[Ærøskøbing]]");
  check("unicode name", a && [a.name, a.display, a.to], ["Ærøskøbing", "Ærøskøbing", 14]);
  const [b] = parseWikiLinks("[[東京|the capital]]");
  check("CJK name with alias", b && [b.name, b.alias, b.displayFrom], ["東京", "the capital", 5]);
  // The surrogate pair counts as 2 UTF-16 units — CodeMirror's offset unit —
  // so 2 + 2 + 4 + 2 = 10.
  const astral = "[[𝔊uild]]";
  const [c] = parseWikiLinks(astral);
  check("astral name: length", astral.length, 10);
  check("astral name: to is UTF-16", c && [c.name, c.to], ["𝔊uild", astral.length]);
}

/* ---------- spans ---------- */

check("hidden form", wikiLinkSpans(parseWikiLinks("[[Halden]]"), () => false, () => true), [
  { from: 0, to: 2, kind: "hidden", dangling: false },
  { from: 2, to: 8, kind: "link", dangling: false },
  { from: 8, to: 10, kind: "hidden", dangling: false },
]);

check(
  "alias hidden form hides the Name| prefix",
  wikiLinkSpans(parseWikiLinks("[[Kestrel|the captain]]"), () => false, () => true).map((s) => [s.from, s.to, s.kind]),
  [
    [0, 10, "hidden"],
    [10, 21, "link"],
    [21, 23, "hidden"],
  ],
);

check(
  "revealed form keeps every character",
  wikiLinkSpans(parseWikiLinks("[[Halden]]"), () => true, () => true).map((s) => [s.from, s.to, s.kind]),
  [
    [0, 2, "bracket"],
    [2, 8, "link"],
    [8, 10, "bracket"],
  ],
);

check(
  "dangling flag",
  wikiLinkSpans(parseWikiLinks("[[Halden]] [[Nobody]]"), () => false, (n) => n === "Halden")
    .filter((s) => s.kind === "link")
    .map((s) => s.dangling),
  [false, true],
);

/* ---------- state field ---------- */

const doc = "[[Halden]] here\n[[Nobody]] there\nplain";
const known = new Set(["halden"]);
const ext = [wikiLinkField, linkExists.of((n) => known.has(n.toLowerCase()))];

const shape = (spans: WikiSpan[]) => spans.map((s) => [s.from, s.to, s.kind, s.dangling]);

/* "hidden" must mean a replace decoration, not merely one without a class —
   a classless mark hides nothing, and inferring from the missing class let
   exactly that swap pass. */
function decorationsOf(state: EditorState): [number, number, string][] {
  const out: [number, number, string][] = [];
  state.field(wikiLinkField).decorations.between(0, state.doc.length, (from, to, d) => {
    out.push([from, to, d.point ? "hidden" : ((d.spec.class as string | undefined) ?? "(classless mark)")]);
  });
  return out;
}

const state = EditorState.create({ doc, extensions: ext, selection: EditorSelection.single(0) });

check("cursor on line 1: line 1 raw, line 2 rendered", shape(state.field(wikiLinkField).spans), [
  [0, 2, "bracket", false],
  [2, 8, "link", false],
  [8, 10, "bracket", false],
  [16, 18, "hidden", true],
  [18, 24, "link", true],
  [24, 26, "hidden", true],
]);
check("decorations match the spans", decorationsOf(state), [
  [0, 2, "cm-wikilink-bracket"],
  [2, 8, "cm-wikilink"],
  [8, 10, "cm-wikilink-bracket"],
  [16, 18, "hidden"],
  [18, 24, "cm-wikilink cm-wikilink-dangling"],
  [24, 26, "hidden"],
]);
ok(
  "one decoration per span",
  state.field(wikiLinkField).decorations.size === state.field(wikiLinkField).spans.length,
);

{
  const moved = state.update({ selection: EditorSelection.single(18) }).state;
  check("cursor on line 2: line 1 renders, line 2 reveals", shape(moved.field(wikiLinkField).spans), [
    [0, 2, "hidden", false],
    [2, 8, "link", false],
    [8, 10, "hidden", false],
    [16, 18, "bracket", true],
    [18, 24, "link", true],
    [24, 26, "bracket", true],
  ]);
}

{
  const s2 = state.update({ selection: EditorSelection.single(3) }).state;
  ok("same line keeps the same state object", s2.field(wikiLinkField) === state.field(wikiLinkField));
}

{
  const s3 = state.update({ selection: EditorSelection.create([EditorSelection.range(0, 20)]) }).state;
  check("multi-line selection reveals every line it touches", [...revealedLines(s3)], [1, 2]);
  check(
    "multi-line selection: no hidden spans on either line",
    s3.field(wikiLinkField).spans.filter((s) => s.kind === "hidden"),
    [],
  );
}

{
  const s4 = state.update({ changes: { from: 0, insert: "ab" } }).state;
  const links = s4.field(wikiLinkField).links;
  check("an edit shifts offsets", links.map((l) => [l.from, l.to]), [
    [2, 12],
    [18, 28],
  ]);
}

{
  known.add("nobody");
  const linkDangling = (s: EditorState) =>
    s.field(wikiLinkField).spans.filter((x) => x.kind === "link").map((x) => x.dangling);
  // Nothing in the transaction says the codex changed, so the field keeps
  // its old answer — which is why the extension's vault watcher exists.
  check("no refresh: still dangling", linkDangling(state.update({}).state), [false, true]);
  check("refresh effect repaints", linkDangling(state.update({ effects: refreshWikiLinks.of(null) }).state), [
    false,
    false,
  ]);
  known.delete("nobody");
}

{
  const bare = EditorState.create({ doc, extensions: [wikiLinkField] });
  ok(
    "without the facet every link is treated as existing",
    bare.field(wikiLinkField).spans.every((s) => !s.dangling),
  );
}

/* ---------- helpers ---------- */

{
  const links = parseWikiLinks("[[Halden]] x");
  check(
    "linkAt covers both brackets",
    [0, 5, 10, 11].map((p) => linkAt(links, p)?.name ?? null),
    ["Halden", "Halden", "Halden", null],
  );
}

check("firstParagraph skips a heading", firstParagraph("# Title\n\nShe walked in.\nAnd sat.\n\nSecond."), "She walked in. And sat.");
check("firstParagraph: heading directly above the prose", firstParagraph("# Kestrel\nThe captain.\n\nMore."), "The captain.");
check("firstParagraph: empty", firstParagraph(""), "");
check("firstParagraph flattens links", firstParagraph("See [[Kestrel|the captain]] and [[Halden]] now"), "See the captain and Halden now");
{
  const long = firstParagraph("a".repeat(300), 240);
  ok("firstParagraph truncates with an ellipsis", long.length === 241 && long.endsWith("…"));
}
check("firstParagraph: headings and rules only", firstParagraph("# One\n\n## Two\n\n---"), "");

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`wikilinks: ${checks} checks passed`);
