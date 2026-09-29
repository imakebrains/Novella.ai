/* Assertion tests for incremental critique highlighting.

   The underlines used to come from a full findInlineIssues scan of the
   chapter on every keystroke. Now the local kinds rescan only the
   sentences an edit touched and echoes rescan when typing pauses. The
   promise is that none of this changes what is found, so every check
   here holds the incremental result against the full rescan it replaced
   — over hundreds of random edits on a generated chapter, with real
   @codemirror/state transactions.

   critiqueExtension.ts is never imported: it pulls in the store. The
   field and the planner are pure state and run in node as they are.

   Same shape as test-units.ts: silent unless something is wrong,
   non-zero exit when it is. */

import { EditorState, type ChangeSpec } from "@codemirror/state";
import { findInlineIssues, splitSentences, type InlineIssue, type IssueKind } from "./src/analysis/prose";
import {
  critiqueField,
  critiqueHitAt,
  critiqueRanges,
  decorationsFor,
  echoStale,
  setCritiqueKinds,
  setEchoIssues,
} from "./src/ui/critiqueField";
import { bracketIndexOf, isCut, linkCovers, mapBracketIndex, planWindow } from "./src/ui/critiquePlan";

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

function ok(name: string, condition: boolean, detail?: string): void {
  checks++;
  if (!condition) {
    failures++;
    console.error(`FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

type Painted = { from: number; to: number; kind: string; message: string };

/** Lists too long to print whole: report the first place they part. */
function same(name: string, actual: Painted[], expected: Painted[]): boolean {
  checks++;
  const n = Math.max(actual.length, expected.length);
  for (let i = 0; i < n; i++) {
    const a = actual[i];
    const e = expected[i];
    if (!a || !e || a.from !== e.from || a.to !== e.to || a.kind !== e.kind || a.message !== e.message) {
      failures++;
      console.error(
        `FAIL  ${name}\n        ${actual.length} painted, ${expected.length} from a full scan; first difference at #${i}` +
          `\n        expected ${JSON.stringify(e)}\n        actual   ${JSON.stringify(a)}`,
      );
      return false;
    }
  }
  return true;
}

/* ---------- fixtures ---------- */

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rand: () => number, list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;

/* Every detector gets something to find, and every trap the planner has
   to respect is in here: glue-heavy sentences, -ly words that are and are
   not adverbs, passive and stative "was tired", long repeated words,
   mid-sentence names, curly-quoted dialogue ending .”, ellipses, "Mr.",
   headings with no full stop, and links — one with a full stop inside,
   one nested, one across a line break. No sentence runs past 40 words. */
const SENTENCES = [
  "It was just that the thing of it was in the way of all of the rest of it.",
  "She walked slowly and quietly toward the family home early in the evening.",
  "The door was opened by the captain before anyone could stop him.",
  "The letters were given to him at the gate.",
  "She was tired.",
  "He was tired by the long road north.",
  "The phosphorescent water moved, and the phosphorescent silence held in the silence of the cove.",
  "Then Sparrow ran for the boats, and Sparrow did not look back.",
  "“Where is Sparrow?” she asked.",
  "“Go home.” He turned away.",
  "Wait... she thought, and the silence answered.",
  "Mr. Smith arrived at the harbour with the only lamp.",
  "They sailed with [[Kestrel]] until the weather turned!",
  "[[Mr. Smith]] was seen at the harbour.",
  "The map named it [[a [[b]] c]] and nothing else.",
  "Is it really over?",
  "The old road to [[Halden\nReach]] was known to everyone.",
  "It is what it is, and it was what it was, and that is all of it that there is to it in the end.",
  "The lamps were lit, and the lamps were quietly smoking in the phosphorescent dark.",
];

function chapter(rand: () => number, words: number): string {
  const paragraphs: string[] = [];
  let count = 0;
  while (count < words) {
    if (rand() < 0.06) {
      paragraphs.push(pick(rand, ["# Part Seven", "## The Harbour", "# Sparrow"]));
      count += 2;
      continue;
    }
    const n = 2 + Math.floor(rand() * 4);
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const s = pick(rand, SENTENCES);
      out.push(s);
      count += s.split(/\s+/).length;
    }
    paragraphs.push(out.join(" "));
  }
  return paragraphs.join("\n\n");
}

const ALL: IssueKind[] = ["adverb", "passive", "echo", "sticky"];
const LOCAL: IssueKind[] = ["adverb", "passive", "sticky"];
const KNOWN = ["Kestrel"];

function sortPainted(list: Painted[]): Painted[] {
  return list.sort((a, b) => a.from - b.from || a.to - b.to || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
}

/** The full-rescan oracle, through the same clamp and empty-range rule. */
function expected(state: EditorState, kinds: Iterable<IssueKind>): Painted[] {
  return painted(findInlineIssues(state.doc.toString(), new Set(kinds), { known: KNOWN }), state.doc.length);
}

function painted(issues: InlineIssue[], len: number): Painted[] {
  const out: Painted[] = [];
  for (const i of issues) {
    const from = Math.max(0, Math.min(i.from, len));
    const to = Math.max(from, Math.min(i.to, len));
    if (from !== to) out.push({ from, to, kind: i.kind, message: i.message });
  }
  return sortPainted(out);
}

const localOf = (list: Painted[]) => list.filter((p) => p.kind !== "echo");
// The oracle skips echo when only the local marks are compared: it is the slow one.
const localOnly = (kinds: Set<IssueKind>) => [...kinds].filter((k) => k !== "echo");
const field = (state: EditorState) => state.field(critiqueField);

function withKinds(state: EditorState, kinds: IssueKind[] | null): EditorState {
  return state.update({ effects: setCritiqueKinds.of(kinds ? new Set(kinds) : null) }).state;
}

/** What the idle job does, minus the timer. */
function refreshEcho(state: EditorState, all?: InlineIssue[]): EditorState {
  const issues = all
    ? all.filter((i) => i.kind === "echo")
    : findInlineIssues(state.doc.toString(), new Set<IssueKind>(["echo"]), { known: KNOWN });
  return state.update({ effects: setEchoIssues.of({ doc: state.doc, issues }) }).state;
}

/** The tooltip as it was: a full scan, filter, stable sort by length. */
function oldTooltip(issues: InlineIssue[], pos: number): string | undefined {
  return issues
    .filter((i: InlineIssue) => pos >= i.from && pos <= i.to)
    .sort((a, b) => a.to - a.from - (b.to - b.from))[0]?.message;
}

const SPECIAL = "[].!?\n”";
const SNIPPETS = [
  " softly", " was opened", " Sparrow", " phosphorescent", " the", "ly", ". ", "!", "?", "\n\n",
  "[[", "]]", "[", "]", "“", "”", "...", " of it", "x",
];

/** Positions next to brackets and punctuation are where the planner can go wrong. */
function position(rand: () => number, text: string): number {
  const p = Math.floor(rand() * (text.length + 1));
  if (rand() < 0.7) return p;
  for (let i = p; i < text.length; i++) if (SPECIAL.includes(text[i] ?? "")) return rand() < 0.5 ? i : i + 1;
  return p;
}

function randomChange(rand: () => number, text: string, lo = 0, hi = text.length): ChangeSpec {
  const at = Math.max(lo, Math.min(hi, position(rand, text)));
  const op = rand();
  if (op < 0.45) return { from: at, insert: pick(rand, SNIPPETS) };
  const to = Math.min(hi, at + 1 + Math.floor(rand() * 8));
  if (op < 0.8) return { from: at, to };
  return { from: at, to, insert: pick(rand, SNIPPETS) };
}

function randomEdit(rand: () => number, text: string): ChangeSpec | ChangeSpec[] {
  if (rand() < 0.15 && text.length > 40) {
    const mid = Math.floor(text.length / 2);
    // Two ranges in old-doc coordinates that cannot overlap.
    return [randomChange(rand, text, 0, mid - 1), randomChange(rand, text, mid + 1, text.length)];
  }
  return randomChange(rand, text);
}

/* ---------- property: incremental equals a full rescan ---------- */

function run(
  label: string,
  seed: number,
  startKinds: IssueKind[],
  toggles: Record<number, IssueKind[]> = {},
  steps = 400,
): void {
  const rand = mulberry32(seed);
  let state = EditorState.create({ doc: chapter(rand, 3000), extensions: [critiqueField] });
  let kinds = new Set(startKinds);
  state = withKinds(state, startKinds);
  let broken = 0;

  same(`${label}: initial`, localOf(critiqueRanges(field(state))), expected(state, localOnly(kinds)));

  for (let step = 1; step <= steps && broken < 3; step++) {
    const toggle = toggles[step];
    if (toggle) {
      const echoWas = kinds.has("echo");
      const before = field(state).echoDoc;
      kinds = new Set(toggle);
      state = withKinds(state, toggle);
      const v = field(state);
      same(`${label}: local after toggle at ${step}`, localOf(critiqueRanges(v)), expected(state, localOnly(kinds)));
      if (kinds.has("echo") && !echoWas) {
        ok(`${label}: echo switched on at ${step} starts unscanned`, v.echoDoc === null);
        ok(`${label}: echo switched on at ${step} is stale`, echoStale(state));
        state = refreshEcho(state);
        ok(`${label}: refresh clears stale at ${step}`, !echoStale(state));
        same(`${label}: all after echo on at ${step}`, critiqueRanges(field(state)), expected(state, kinds));
      } else if (kinds.has("echo")) {
        ok(`${label}: echo kept on at ${step} keeps its doc`, v.echoDoc === before);
      } else {
        ok(`${label}: echo off at ${step} paints none`, v.echo.size === 0 && v.echoDoc === null);
      }
    }

    const text = state.doc.toString();
    const tr = state.update({ changes: randomEdit(rand, text) });
    state = tr.state;
    const v = field(state);

    if (!same(`${label}: step ${step} local`, localOf(critiqueRanges(v)), expected(state, localOnly(kinds)))) broken++;
    check(`${label}: step ${step} bracket index`, v.brackets, bracketIndexOf(state.doc));

    if (step % 7 === 0 || step === steps) {
      // One scan serves the idle job, the oracle and the old tooltip: echo
      // results do not depend on which other kinds ran beside them.
      const raw = findInlineIssues(state.doc.toString(), new Set<IssueKind>([...kinds, "echo"]), { known: KNOWN });
      state = refreshEcho(state, raw);
      const r = field(state);
      const wanted = raw.filter((i) => kinds.has(i.kind));
      if (kinds.has("echo")) {
        ok(`${label}: step ${step} echo fresh`, !echoStale(state));
        if (!same(`${label}: step ${step} all`, critiqueRanges(r), painted(wanted, state.doc.length))) broken++;
      } else {
        ok(`${label}: step ${step} echo result ignored while off`, r.echo.size === 0);
      }
      for (let k = 0; k < 20; k++) {
        const pos = Math.floor(rand() * (state.doc.length + 1));
        check(`${label}: step ${step} tooltip at ${pos}`, critiqueHitAt(r, pos)?.message, oldTooltip(wanted, pos));
      }
    }
  }
}

run("all kinds", 0x5eed, ALL);
run("adverb only", 0x5eed + 1, ["adverb"]);
run("sticky only", 0x5eed + 2, ["sticky"]);
run("passive only", 0x5eed + 3, ["passive"], {}, 200);
run("toggles", 0x5eed + 4, ALL, { 100: ["passive"], 150: ["passive", "echo"], 200: ALL });

/* ---------- window size on a long chapter ---------- */

{
  const rand = mulberry32(0x5eed);
  const text = chapter(rand, 100_000);
  const kinds: IssueKind[] = ["adverb", "passive", "sticky"];
  const base = withKinds(EditorState.create({ doc: text, extensions: [critiqueField] }), kinds);
  const baseIdx = bracketIndexOf(base.doc);

  // Clear of any link, so the window is the plain sentence rule.
  let mid = Math.floor(text.length / 2);
  while (linkCovers(baseIdx, mid) || !/[a-z]/.test(text[mid] ?? "")) mid++;

  {
    const tr = base.update({ changes: { from: mid, insert: "q" } });
    const v = field(tr.state);
    ok("100k words: one letter rescans under 2000 chars", v.scanned < 2000, `scanned ${v.scanned} of ${text.length}`);
    const w = planWindow(base.doc, baseIdx, tr.state.doc, bracketIndexOf(tr.state.doc), tr.changes);
    ok("100k words: planned window under 2000", w.to - w.from < 2000, JSON.stringify(w));
    ok("100k words: window straddles the edit", w.from < mid && w.to > mid, JSON.stringify(w));
    same("100k words: one letter matches a full scan", critiqueRanges(v), expected(tr.state, kinds));
  }

  {
    // Two sentences merge when the full stop between them goes.
    let dot = text.indexOf(". ", mid);
    while (linkCovers(baseIdx, dot) || text[dot - 1] === "." || text.slice(dot - 3, dot) === " Mr") dot = text.indexOf(". ", dot + 1);
    const tr = base.update({ changes: { from: dot, to: dot + 1 } });
    const w = planWindow(base.doc, baseIdx, tr.state.doc, bracketIndexOf(tr.state.doc), tr.changes);
    const merged = splitSentences(tr.state.doc.toString()).find((s) => s.start <= dot && dot < s.start + s.text.length);
    ok("merge: the two sentences read as one", !!merged && merged.start < dot - 1 && merged.start + merged.text.length > dot + 1);
    ok(
      "merge: window covers the merged sentence",
      !!merged && w.from <= merged.start && w.to >= merged.start + merged.text.length,
      `${JSON.stringify(w)} sentence ${merged?.start}+${merged?.text.length}`,
    );
    ok("merge: window under 2000", w.to - w.from < 2000, JSON.stringify(w));
    same("merge: matches a full scan", critiqueRanges(field(tr.state)), expected(tr.state, kinds));
  }

  {
    const link = text.indexOf("[[Kestrel]]", mid);
    const before = base.update({ changes: { from: link, insert: "[" } });
    const w1 = planWindow(base.doc, baseIdx, before.state.doc, bracketIndexOf(before.state.doc), before.changes);
    ok("bracket before a link: window under 2000", w1.to - w1.from < 2000, JSON.stringify(w1));
    same("bracket before a link: matches a full scan", critiqueRanges(field(before.state)), expected(before.state, kinds));

    const close = link + "[[Kestrel]".length;
    const between = base.update({ changes: { from: close, insert: "[" } });
    const w2 = planWindow(base.doc, baseIdx, between.state.doc, bracketIndexOf(between.state.doc), between.changes);
    ok("bracket between ]]: window under 2000", w2.to - w2.from < 2000, JSON.stringify(w2));
    same("bracket between ]]: matches a full scan", critiqueRanges(field(between.state)), expected(between.state, kinds));

    const open = link + 1;
    const split = base.update({ changes: { from: open, insert: "x" } });
    const w3 = planWindow(base.doc, baseIdx, split.state.doc, bracketIndexOf(split.state.doc), split.changes);
    ok("splitting [[: window under 2000", w3.to - w3.from < 2000, JSON.stringify(w3));
    same("splitting [[: matches a full scan", critiqueRanges(field(split.state)), expected(split.state, kinds));
  }

  {
    // Echo alone is never rescanned inside a keystroke.
    const echoOnly = withKinds(EditorState.create({ doc: text.slice(0, 60_000), extensions: [critiqueField] }), ["echo"]);
    const ready = refreshEcho(echoOnly);
    ok("echo only: fresh after the idle scan", !echoStale(ready));
    const typed = ready.update({ changes: { from: 30_000, insert: "q" } }).state;
    check("echo only: a keystroke scans nothing", field(typed).scanned, 0);
    ok("echo only: a keystroke leaves it stale", echoStale(typed));
  }
}

{
  // No sentence punctuation anywhere: no cuts, so the whole doc — slower, still right.
  const rand = mulberry32(0x5eed + 9);
  const words = ["walked", "slowly", "was", "opened", "the", "of", "it", "that", "family", "quietly", "[[Kestrel]]", "\n\n"];
  let text = "";
  while (text.length < 5000) text += pick(rand, words) + " ";
  const kinds: IssueKind[] = ["adverb", "passive", "sticky"];
  const base = withKinds(EditorState.create({ doc: text, extensions: [critiqueField] }), kinds);
  const tr = base.update({ changes: { from: 2500, insert: "ly" } });
  const w = planWindow(base.doc, bracketIndexOf(base.doc), tr.state.doc, bracketIndexOf(tr.state.doc), tr.changes);
  check("no punctuation: window is the whole doc", w, { from: 0, to: tr.state.doc.length });
  same("no punctuation: matches a full scan", critiqueRanges(field(tr.state)), expected(tr.state, kinds));
}

/* ---------- unit edges ---------- */

{
  const idxOf = (s: string) => bracketIndexOf(EditorState.create({ doc: s }).doc);
  const cut = (s: string, c: number) => isCut(EditorState.create({ doc: s }).doc, idxOf(s), c);

  ok("isCut: start", cut("Wait... she said.", 0));
  ok("isCut: end", cut("Wait... she said.", 17));
  ok("isCut: not inside an ellipsis", !cut("Wait... she said.", 5));
  ok("isCut: after the ellipsis", cut("Wait... she said.", 7));
  ok("isCut: after a full stop before a closing quote", cut("“Go home.” He left.", 9));
  ok("isCut: not before the closing quote's own full stop", !cut("“Go home.” He left.", 8));
  const mr = "See [[Mr. Smith]] now.";
  ok("isCut: not after the full stop inside a link", !cut(mr, mr.indexOf(". ") + 1));
  ok("isCut: not mid-word", !cut("She left. He stayed.", 3));

  const nested = idxOf("[[a [[b]] c]]");
  ok("linkCovers: nested — inside the one match", linkCovers(nested, 3));
  ok("linkCovers: nested — between the brackets of the closing ]]", linkCovers(nested, 8));
  ok("linkCovers: nested — not after the first ]]", !linkCovers(nested, 9));
  ok("linkCovers: nested — not the trailing c", !linkCovers(nested, 10));
  ok("linkCovers: unclosed [[ covers nothing", !linkCovers(idxOf("a [[b c. d"), 7));
  ok("linkCovers: a lone ] closer covers nothing", !linkCovers(idxOf("[[b] c. d"), 6));
  ok("linkCovers: between ]] of a plain link", linkCovers(idxOf("[[x]]"), 4));
  ok("linkCovers: not the link's own start", !linkCovers(idxOf("[[x]]"), 0));
  ok("linkCovers: across a newline", linkCovers(idxOf("[[Halden\nReach]]"), 9));
  ok("linkCovers: third [ joins the match", linkCovers(idxOf("[[[x]] y"), 2));

  const s0 = EditorState.create({ doc: "a[b]c" });
  const atBracket = s0.update({ changes: { from: 1, insert: "zz" } });
  check("mapBracketIndex: insertion at a bracket moves it right", mapBracketIndex(idxOf("a[b]c"), atBracket.changes), {
    open: [3],
    close: [5],
  });
  const gone = s0.update({ changes: { from: 1, to: 2 } });
  check("mapBracketIndex: a deleted bracket is dropped", mapBracketIndex(idxOf("a[b]c"), gone.changes), {
    open: [],
    close: [2],
  });
  const added = s0.update({ changes: [{ from: 0, insert: "]" }, { from: 5, insert: "[[" }] });
  check("mapBracketIndex: inserted brackets are indexed", mapBracketIndex(idxOf("a[b]c"), added.changes), {
    open: [2, 6, 7],
    close: [0, 4],
  });
}

{
  let state = withKinds(EditorState.create({ doc: "The phosphorescent sea and the phosphorescent sky.", extensions: [critiqueField] }), ALL);
  const oldDoc = state.doc;
  state = state.update({ changes: { from: 0, insert: "Then " } }).state;
  const before = field(state).echo;
  const late = findInlineIssues(oldDoc.toString(), new Set<IssueKind>(["echo"]));
  state = state.update({ effects: setEchoIssues.of({ doc: oldDoc, issues: late }) }).state;
  ok("a late echo result for an older doc is dropped", field(state).echo === before && echoStale(state));

  state = withKinds(state, null);
  const v = field(state);
  ok("off: no local marks", v.local.size === 0);
  ok("off: no echo marks", v.echo.size === 0);
  check("off: no bracket index", v.brackets, null);
  ok("off: never stale", !echoStale(state));

  const again = withKinds(state, LOCAL);
  const same1 = again.update({ effects: setCritiqueKinds.of(new Set(LOCAL)) }).state;
  ok("the same kinds in a fresh Set keep the value", field(same1) === field(again));
}

{
  // Ties the random chapters almost never produce. Local marks are
  // visited before echo marks, so each case puts the one that must win
  // in the set visited second.
  const issue = (from: number, to: number, kind: IssueKind): InlineIssue => ({ from, to, kind, message: kind + from });
  const value = (local: InlineIssue[], echo: InlineIssue[]) => ({
    kinds: new Set(ALL),
    brackets: null,
    local: decorationsFor(local, 100),
    echo: decorationsFor(echo, 100),
    echoDoc: null,
    scanned: 0,
  });
  check("tooltip: equal length, earlier start wins", critiqueHitAt(value([issue(3, 9, "sticky")], [issue(0, 6, "echo")]), 4)?.message, "echo0");
  check("tooltip: same range, echo outranks sticky", critiqueHitAt(value([issue(0, 6, "sticky")], [issue(0, 6, "echo")]), 2)?.message, "echo0");
  check("tooltip: shorter wins over rank", critiqueHitAt(value([issue(0, 5, "sticky")], [issue(0, 6, "echo")]), 2)?.message, "sticky0");
  check("tooltip: touching the end counts", critiqueHitAt(value([issue(0, 6, "adverb")], []), 6)?.message, "adverb0");
  check("tooltip: nothing there", critiqueHitAt(value([issue(0, 6, "adverb")], []), 7), null);
}

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`critiqueperf: ${checks} checks passed`);
