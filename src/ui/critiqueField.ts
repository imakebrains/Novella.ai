import { StateEffect, StateField, type EditorState, type Range, type Text } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import type { InlineIssue, IssueKind } from "../analysis/prose";
import {
  LOCAL_KINDS,
  bracketIndexOf,
  mapBracketIndex,
  planWindow,
  scanWindow,
  type BracketIndex,
} from "./critiquePlan";

/* The critique underlines as editor state.

   Pure state, no view and no store, so node can drive it with real
   transactions and hold it against a full rescan — test-critiqueperf.ts
   does exactly that. The store-facing half (codex names, the idle echo
   rescan) lives in critiqueExtension.ts. */

/** Which issue kinds to show, or null for off. */
export const setCritiqueKinds = StateEffect.define<Set<IssueKind> | null>();

/** A finished echo scan. The doc it ran against travels with it so a
    result that lands after further typing is dropped, not painted onto
    text it no longer describes. */
export const setEchoIssues = StateEffect.define<{ doc: Text; issues: InlineIssue[] }>();

export interface CritiqueValue {
  kinds: Set<IssueKind> | null;
  /** Bracket positions of the current doc; null while critique is off. */
  brackets: BracketIndex | null;
  local: DecorationSet;
  echo: DecorationSet;
  /** The doc the echo set was computed against; null when it never was
      for the current kinds. Anything else than the current doc means the
      echo underlines are only mapped, not rechecked. */
  echoDoc: Text | null;
  /** Characters the last transaction rescanned synchronously. */
  scanned: number;
}

const off: CritiqueValue = {
  kinds: null,
  brackets: null,
  local: Decoration.none,
  echo: Decoration.none,
  echoDoc: null,
  scanned: 0,
};

/* The message and kind ride on the decoration spec, so the tooltip can
   explain what is painted without scanning again. */
function markFor(issue: InlineIssue): Decoration {
  return Decoration.mark({
    class: "cm-issue cm-issue-" + issue.kind,
    message: issue.message,
    kind: issue.kind,
  });
}

function rangesFor(issues: InlineIssue[], docLength: number): Range<Decoration>[] {
  const out: Range<Decoration>[] = [];
  for (const issue of issues) {
    const from = Math.max(0, Math.min(issue.from, docLength));
    const to = Math.max(from, Math.min(issue.to, docLength));
    if (from === to) continue;
    out.push(markFor(issue).range(from, to));
  }
  return out;
}

export function decorationsFor(issues: InlineIssue[], docLength: number): DecorationSet {
  return Decoration.set(rangesFor(issues, docLength), true);
}

// EditorPane dispatches a fresh Set on every render of the toggles.
function sameKinds(a: Set<IssueKind> | null, b: Set<IssueKind> | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}

const hasLocal = (kinds: Set<IssueKind>) => LOCAL_KINDS.some((k) => kinds.has(k));

export const critiqueField = StateField.define<CritiqueValue>({
  create: () => off,
  update(value, tr) {
    let kinds = value.kinds;
    for (const e of tr.effects) if (e.is(setCritiqueKinds)) kinds = e.value;
    // Nothing is maintained while critique is off, so it costs nothing per keystroke.
    if (!kinds || kinds.size === 0) return off;

    const doc = tr.state.doc;
    const len = doc.length;
    let next: CritiqueValue = value;

    if (!sameKinds(kinds, value.kinds) || !value.brackets) {
      const echoWas = value.kinds?.has("echo") ?? false;
      const echoOn = kinds.has("echo");
      next = {
        kinds,
        brackets: bracketIndexOf(doc),
        local: decorationsFor(scanWindow(doc, 0, len, kinds), len),
        echo: echoOn && echoWas ? value.echo.map(tr.changes) : Decoration.none,
        echoDoc: echoOn && echoWas ? value.echoDoc : null,
        scanned: len,
      };
    } else if (tr.docChanged) {
      const brackets = mapBracketIndex(value.brackets, tr.changes);
      let local = Decoration.none;
      let scanned = 0;
      if (hasLocal(kinds)) {
        const w = planWindow(tr.startState.doc, value.brackets, doc, brackets, tr.changes);
        local = value.local.map(tr.changes).update({
          filterFrom: w.from,
          filterTo: w.to,
          filter: (from) => from < w.from || from >= w.to,
          add: rangesFor(scanWindow(doc, w.from, w.to, kinds), len),
          sort: true,
        });
        scanned = w.to - w.from;
      }
      // The echo set goes stale here; the idle rescan replaces it.
      next = { ...value, brackets, local, echo: value.echo.map(tr.changes), scanned };
    }

    for (const e of tr.effects) {
      if (!e.is(setEchoIssues)) continue;
      // Identity, not equality: the effect ships in a change-free
      // transaction, so a result for this doc carries this very object.
      if (!kinds.has("echo") || e.value.doc !== doc) continue;
      next = { ...next, echo: decorationsFor(e.value.issues, len), echoDoc: doc };
    }
    return next;
  },
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.local),
    EditorView.decorations.from(f, (v) => v.echo),
  ],
});

/** True while echoes are on and their underlines were not computed for this doc. */
export function echoStale(state: EditorState): boolean {
  const v = state.field(critiqueField, false);
  return !!v?.kinds?.has("echo") && v.echoDoc !== state.doc;
}

/* findInlineIssues pushed adverb, passive, echo, sticky and then sorted
   by position, and the old tooltip stable-sorted that by length. Spelled
   out here because RangeSet.between promises no order at all. */
const KIND_RANK: Record<string, number> = { adverb: 0, passive: 1, echo: 2, sticky: 3 };

export function critiqueHitAt(
  value: CritiqueValue,
  pos: number,
): { from: number; to: number; message: string } | null {
  const hits: { from: number; to: number; message: string; rank: number }[] = [];
  const visit = (from: number, to: number, deco: Decoration) => {
    hits.push({ from, to, message: String(deco.spec.message ?? ""), rank: KIND_RANK[String(deco.spec.kind)] ?? 4 });
  };
  value.local.between(pos, pos, visit);
  value.echo.between(pos, pos, visit);
  hits.sort((a, b) => a.to - a.from - (b.to - b.from) || a.from - b.from || a.rank - b.rank);
  const hit = hits[0];
  return hit ? { from: hit.from, to: hit.to, message: hit.message } : null;
}

/** Every painted range, flattened and sorted — what a full scan is held against. */
export function critiqueRanges(
  value: CritiqueValue,
): { from: number; to: number; kind: string; message: string }[] {
  const out: { from: number; to: number; kind: string; message: string }[] = [];
  for (const set of [value.local, value.echo]) {
    for (let it = set.iter(); it.value; it.next()) {
      out.push({ from: it.from, to: it.to, kind: String(it.value.spec.kind), message: String(it.value.spec.message) });
    }
  }
  return out.sort((a, b) => a.from - b.from || a.to - b.to || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
}
