import { EditorState, Facet, RangeSetBuilder, StateEffect, StateField, type Transaction } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

/* [[links]] in the prose — the pure half.

   Everything here is state, not view: parsing, deciding which characters
   hide, and the decoration field built from them. That split is what lets
   test-wikilinks.ts assert the live-preview behaviour in node without a
   DOM. The store, the hover card and the mouse live in
   wikiLinkExtension.ts, which is the only file that knows the vault. */

export interface WikiLink {
  from: number;
  to: number;
  name: string;
  alias: string | null;
  /** The raw text left visible when the brackets are hidden. */
  display: string;
  displayFrom: number;
  displayTo: number;
}

/* The grammar mirrors extractWikiLinks in src/core/vault.ts, so the
   editor never paints something as a link that the codex, backlinks and
   the dangling-link list don't also count — `[[a [[b]] c]]` really is one
   link named "a [[b" there, so it is here too.

   Two deliberate divergences, both of which only ever make the editor
   decorate LESS than vault.ts counts: a newline ends a name or alias,
   because a decoration cannot sensibly span lines; and a name that trims
   to nothing (`[[ ]]`) is skipped, so nobody is offered "Create character"
   for an untitled entry.

   Offsets are UTF-16 code units, which is what CodeMirror positions are. */
export function parseWikiLinks(text: string): WikiLink[] {
  // Fresh per call: a module-level /g regex carries lastIndex between callers.
  const re = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;
  const out: WikiLink[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const rawName = m[1]!;
    const rawAlias = m[2];
    const name = rawName.trim();
    if (!name) continue;
    const from = m.index;
    const to = from + m[0].length;
    const trimmedAlias = rawAlias === undefined ? "" : rawAlias.trim();
    // A whitespace-only alias would render as a blank link; show the name.
    const showAlias = trimmedAlias !== "";
    const displayFrom = showAlias ? from + 2 + rawName.length + 1 : from + 2;
    const displayTo = showAlias ? to - 2 : from + 2 + rawName.length;
    out.push({
      from,
      to,
      name,
      alias: showAlias ? trimmedAlias : null,
      display: text.slice(displayFrom, displayTo),
      displayFrom,
      displayTo,
    });
  }
  return out;
}

export type SpanKind = "hidden" | "link" | "bracket";
export interface WikiSpan {
  from: number;
  to: number;
  kind: SpanKind;
  dangling: boolean;
}

/* A revealed link keeps every character and only dims the syntax; a
   rendered one hides everything but the shown text. Output is in
   document order and non-overlapping, which RangeSetBuilder requires. */
export function wikiLinkSpans(
  links: WikiLink[],
  revealed: (link: WikiLink) => boolean,
  exists: (name: string) => boolean,
): WikiSpan[] {
  const out: WikiSpan[] = [];
  for (const link of links) {
    const dangling = !exists(link.name);
    if (revealed(link)) {
      out.push(
        { from: link.from, to: link.from + 2, kind: "bracket", dangling },
        { from: link.from + 2, to: link.to - 2, kind: "link", dangling },
        { from: link.to - 2, to: link.to, kind: "bracket", dangling },
      );
    } else {
      out.push(
        { from: link.from, to: link.displayFrom, kind: "hidden", dangling },
        { from: link.displayFrom, to: link.displayTo, kind: "link", dangling },
        { from: link.displayTo, to: link.to, kind: "hidden", dangling },
      );
    }
  }
  return out;
}

/* Existence goes through a facet so tests can inject a Set and the app
   can inject the vault. Unset means "assume it exists" — better to show
   a plain link than to call every link in the book dangling. */
export const linkExists = Facet.define<(name: string) => boolean, (name: string) => boolean>({
  combine: (values) => values[0] ?? (() => true),
});

/* The codex can change without any editor transaction (an entry created
   from the Codex pane), so something outside has to ask for a repaint. */
export const refreshWikiLinks = StateEffect.define<null>();

export interface WikiLinkState {
  links: WikiLink[];
  spans: WikiSpan[];
  decorations: DecorationSet;
}

const hiddenMark = Decoration.replace({});
const linkMark = Decoration.mark({ class: "cm-wikilink" });
const danglingMark = Decoration.mark({ class: "cm-wikilink cm-wikilink-dangling" });
const bracketMark = Decoration.mark({ class: "cm-wikilink-bracket" });

/* Every line any selection range touches. A selection across lines
   reveals all of them — select-all shows the raw syntax everywhere,
   which is what a writer about to cut and paste wants to see. */
export function revealedLines(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) lines.add(n);
  }
  return lines;
}

export function buildWikiLinkState(
  state: EditorState,
  links: WikiLink[] = parseWikiLinks(state.doc.toString()),
): WikiLinkState {
  const lines = revealedLines(state);
  const exists = state.facet(linkExists);
  const spans = wikiLinkSpans(links, (l) => lines.has(state.doc.lineAt(l.from).number), exists);
  const builder = new RangeSetBuilder<Decoration>();
  for (const span of spans) {
    const mark =
      span.kind === "hidden" ? hiddenMark : span.kind === "bracket" ? bracketMark : span.dangling ? danglingMark : linkMark;
    builder.add(span.from, span.to, mark);
  }
  return { links, spans, decorations: builder.finish() };
}

function lineKey(state: EditorState): string {
  return [...revealedLines(state)].join(",");
}

function selectionMovedLines(tr: Transaction): boolean {
  if (!tr.selection) return false;
  return lineKey(tr.startState) !== lineKey(tr.state);
}

/* A StateField rather than a ViewPlugin (unlike taskCheckboxes) so the
   whole reveal/hide decision is testable without a view. It parses the
   whole document, not the viewport — the hover card and Ctrl+click look
   links up here too, and a chapter is small next to what critique does
   per keystroke. */
export const wikiLinkField = StateField.define<WikiLinkState>({
  create: (state) => buildWikiLinkState(state),
  update(value, tr) {
    if (tr.docChanged) return buildWikiLinkState(tr.state);
    const refresh = tr.effects.some((e) => e.is(refreshWikiLinks));
    // Doc unchanged, so the parse is still good; only the paint moves.
    if (refresh || selectionMovedLines(tr)) return buildWikiLinkState(tr.state, value.links);
    // Same object back: moving the cursor within a line costs nothing.
    return value;
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.decorations),
});

export function linkAt(links: WikiLink[], pos: number): WikiLink | undefined {
  return links.find((l) => pos >= l.from && pos <= l.to);
}

/* The hover card's excerpt: the first paragraph of real prose, with
   headings and rules skipped (a codex entry often opens with its own
   title) and links flattened to the words a reader would see. */
export function firstParagraph(body: string, max = 240): string {
  // Line by line, not paragraph by paragraph: "# Kestrel" directly above
  // the prose, with no blank line between, is the common shape.
  const para = body
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .split("\n")
        .filter((line) => !/^\s*#{1,6}\s/.test(line) && !/^\s*(-{3,}|\*{3,})\s*$/.test(line))
        .join("\n")
        .trim(),
    )
    .find((p) => p !== "");
  if (!para) return "";
  let text = para.replace(/\s+/g, " ");
  // From the end so earlier offsets stay valid as later links shrink.
  for (const link of parseWikiLinks(text).reverse()) {
    text = text.slice(0, link.from) + link.display + text.slice(link.to);
  }
  return text.length > max ? text.slice(0, max) + "…" : text;
}
