import { Decoration, EditorView, ViewPlugin, hoverTooltip, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { StateEffect, StateField, Compartment, RangeSetBuilder } from "@codemirror/state";
import { findInlineIssues, type InlineIssue, type IssueKind } from "../analysis/prose";

/* Inline critique for the manuscript.

   Sticky sentences get a soft background; adverbs, passive constructions
   and echoes get an underline. Hovering explains why. Everything is
   advisory — this never changes the text. */

export const setCritiqueKinds = StateEffect.define<Set<IssueKind> | null>();

/** Which issue kinds to show, or null for off. Held in editor state so a
    toggle re-renders decorations without rebuilding the whole editor. */
export const critiqueKinds = StateField.define<Set<IssueKind> | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setCritiqueKinds)) return e.value;
    }
    return value;
  },
});

const marks: Record<IssueKind, Decoration> = {
  adverb: Decoration.mark({ class: "cm-issue cm-issue-adverb" }),
  passive: Decoration.mark({ class: "cm-issue cm-issue-passive" }),
  echo: Decoration.mark({ class: "cm-issue cm-issue-echo" }),
  sticky: Decoration.mark({ class: "cm-issue cm-issue-sticky" }),
};

function buildDecorations(view: EditorView): DecorationSet {
  const kinds = view.state.field(critiqueKinds, false);
  if (!kinds || kinds.size === 0) return Decoration.none;

  const text = view.state.doc.toString();
  const issues = findInlineIssues(text, kinds);
  const builder = new RangeSetBuilder<Decoration>();
  const docLength = view.state.doc.length;

  // RangeSetBuilder requires strictly sorted, non-overlapping-by-start
  // ranges. Sticky sentences span other issues, so they're layered by
  // sorting on `from` and skipping anything that would go backwards.
  let lastFrom = -1;
  for (const issue of issues.sort((a, b) => a.from - b.from || a.to - b.to)) {
    const from = Math.max(0, Math.min(issue.from, docLength));
    const to = Math.max(from, Math.min(issue.to, docLength));
    if (from === to || from < lastFrom) continue;
    builder.add(from, to, marks[issue.kind]);
    lastFrom = from;
  }
  return builder.finish();
}

const critiquePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.startState.field(critiqueKinds, false) !== u.state.field(critiqueKinds, false)) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

const critiqueTooltip = hoverTooltip((view, pos) => {
  const kinds = view.state.field(critiqueKinds, false);
  if (!kinds || kinds.size === 0) return null;

  const issues = findInlineIssues(view.state.doc.toString(), kinds);
  // Innermost match wins, so hovering an adverb inside a sticky sentence
  // explains the adverb rather than the sentence.
  const hit = issues
    .filter((i: InlineIssue) => pos >= i.from && pos <= i.to)
    .sort((a, b) => a.to - a.from - (b.to - b.from))[0];
  if (!hit) return null;

  return {
    pos: hit.from,
    end: hit.to,
    above: true,
    create() {
      const dom = document.createElement("div");
      dom.className = "cm-issue-tooltip";
      dom.textContent = hit.message;
      return { dom };
    },
  };
});

export const critiqueTheme = EditorView.baseTheme({
  ".cm-issue-adverb": {
    textDecoration: "underline wavy",
    textDecorationColor: "var(--type-object)",
    textUnderlineOffset: "4px",
  },
  ".cm-issue-passive": {
    textDecoration: "underline wavy",
    textDecorationColor: "var(--type-lore)",
    textUnderlineOffset: "4px",
  },
  ".cm-issue-echo": {
    textDecoration: "underline wavy",
    textDecorationColor: "var(--type-chapter)",
    textUnderlineOffset: "4px",
  },
  ".cm-issue-sticky": {
    backgroundColor: "color-mix(in srgb, var(--accent) 11%, transparent)",
    borderRadius: "3px",
  },
  ".cm-issue-tooltip": {
    padding: "6px 10px",
    maxWidth: "280px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--text-xs)",
    lineHeight: "1.5",
    color: "var(--fg-primary)",
    backgroundColor: "var(--bg-raised)",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius-md)",
    boxShadow: "var(--shadow)",
  },
});

export const critiqueCompartment = new Compartment();

export function critiqueExtension() {
  return [critiqueKinds, critiquePlugin, critiqueTooltip, critiqueTheme];
}

export const ALL_KINDS: IssueKind[] = ["sticky", "adverb", "passive", "echo"];

export const KIND_LABEL: Record<IssueKind, string> = {
  sticky: "Sticky",
  adverb: "Adverbs",
  passive: "Passive",
  echo: "Echoes",
};
