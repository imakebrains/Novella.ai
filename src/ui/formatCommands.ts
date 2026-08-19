/* Every formatting action the toolbar offers, as arithmetic on a string.

   The bar's whole promise is that pressing a button twice leaves the page
   exactly as it found it — same characters, same selection. That is a
   claim about text, not about CodeMirror, so none of it lives near an
   editor: everything here takes (text, from, to) and hands back the new
   text with the new selection. Which means every toggle can be *proved*
   in test-format.ts instead of trusted, and a formatting bar you cannot
   trust is a trap rather than a feature.

   Detection is deliberately local: a mark counts as "on" only when its
   markers sit immediately around the selection. A full Markdown parse
   would notice more cases and be able to reverse fewer of them, and a
   button whose lit state and whose behaviour disagree is worse than one
   that only claims what it can undo. resolveInline() is shared by the
   toggles and by inspect() for exactly that reason — the light and the
   action read the same sentence. */

export interface FormatResult {
  /** The whole document text after the command. */
  text: string;
  /** New selection anchor. Equal to `to` when the caret is collapsed. */
  from: number;
  /** New selection head. */
  to: number;
}

export type InlineMark = "bold" | "italic" | "strike" | "code";
export type ListKind = "bullet" | "numbered";
/** 0 is body prose; 1–4 are the hash counts behind Title / H1 / H2 / H3. */
export type HeadingLevel = 0 | 1 | 2 | 3 | 4;

export interface FormatState {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
  bullet: boolean;
  numbered: boolean;
  quote: boolean;
  /** 0 when the selected lines are body prose or disagree with each other. */
  heading: HeadingLevel;
  link: boolean;
}

export const INLINE_MARKERS: Record<InlineMark, string> = {
  bold: "**",
  /* `_` and not `*`: italic-inside-bold with asterisks produces `***x***`,
     which nothing can take apart again without guessing. Underscores are
     ordinary CommonMark emphasis and they never collide with `**`. */
  italic: "_",
  strike: "~~",
  code: "`",
};

/** The placeholder a link gets when there is nothing to wrap. */
export const LINK_LABEL = "text";

/* ---------------- splices ---------------- */

/* One edit to the string, in original coordinates. Commands describe
   themselves as a sorted, non-overlapping list of these; text and
   selection are then derived from the same list, so they can never
   drift apart. */
interface Splice {
  at: number;
  remove: number;
  insert: string;
}

function spliced(text: string, edits: Splice[]): string {
  let out = "";
  let cursor = 0;
  for (const e of edits) {
    out += text.slice(cursor, e.at) + e.insert;
    cursor = e.at + e.remove;
  }
  return out + text.slice(cursor);
}

/** Where a position lands afterwards.

    `bias` only matters for a position sitting exactly where text is
    inserted, and that case is the whole reason toggles round-trip: a
    selection's start steps over the opening marker ("after"), its end
    stays in front of the closing one ("before"). Get this backwards and
    the second press selects the asterisks. */
function moved(pos: number, edits: Splice[], bias: "after" | "before"): number {
  let delta = 0;
  for (const e of edits) {
    if (pos < e.at) break;
    if (pos === e.at) {
      if (e.remove === 0 && bias === "after") delta += e.insert.length;
      break;
    }
    if (pos >= e.at + e.remove) delta += e.insert.length - e.remove;
    // Inside a stretch that is going away: collapse onto the replacement.
    else return e.at + delta + (bias === "after" ? e.insert.length : 0);
  }
  return pos + delta;
}

function finish(text: string, edits: Splice[], from: number, to: number): FormatResult {
  return {
    text: spliced(text, edits),
    from: moved(from, edits, "after"),
    to: moved(to, edits, from === to ? "after" : "before"),
  };
}

/* ---------------- reading the text ---------------- */

/* Letters, digits and apostrophes — no underscore, on purpose. If `_`
   counted as a word character then "unbold this word" inside `_word_`
   would swallow the emphasis markers and lose the caret's place. */
const WORD = /[\p{L}\p{N}'’]/u;

function wordAt(text: string, pos: number): { from: number; to: number } | null {
  let s = pos;
  let e = pos;
  while (s > 0 && WORD.test(text.charAt(s - 1))) s--;
  while (e < text.length && WORD.test(text.charAt(e))) e++;
  return e > s ? { from: s, to: e } : null;
}

interface Line {
  start: number;
  end: number;
  text: string;
}

/** Every line the selection touches. A selection that ends exactly at a
    line start does not drag that line in — the writer selected the break,
    not the next paragraph. */
function linesIn(text: string, from: number, to: number): Line[] {
  const first = text.lastIndexOf("\n", from - 1) + 1;
  const tail = to > from && text.charAt(to - 1) === "\n" ? to - 1 : to;
  let last = text.indexOf("\n", Math.max(first, tail));
  if (last === -1) last = text.length;

  const out: Line[] = [];
  let i = first;
  while (i <= last) {
    let j = text.indexOf("\n", i);
    if (j === -1 || j > last) j = last;
    out.push({ start: i, end: j, text: text.slice(i, j) });
    i = j + 1;
  }
  return out;
}

/** The lines a block command should act on: the written ones, or all of
    them when the selection is entirely blank (that is how you start a
    list on an empty line). */
function rowsIn(text: string, from: number, to: number): Line[] {
  const lines = linesIn(text, from, to);
  const live = lines.filter((l) => l.text.trim() !== "");
  return live.length ? live : lines;
}

const INDENT = /^[ \t]*/;
/* Whitespace plus any blockquote markers. Lists and headings belong
   *inside* a quote: quoting a paragraph and then bulleting it should give
   `> - line`, not a bullet with a quote hanging off the front of it. */
const BLOCK_LEAD = /^[ \t]*(?:> ?[ \t]*)*/;
const BULLET_RE = /^[ \t]*(?:> ?[ \t]*)*[-*+] /;
const NUMBER_RE = /^[ \t]*(?:> ?[ \t]*)*\d+[.)] /;
const QUOTE_RE = /^[ \t]*> ?/;
const HEADING_RE = /^[ \t]*(?:> ?[ \t]*)*(#{1,6}) /;

function leadOf(line: string, re: RegExp): string {
  return re.exec(line)?.[0] ?? "";
}

/** Length of `re`'s match past the lead — i.e. how much prefix a toggle
    has to take off. 0 when the line does not match. */
function markerLen(line: string, re: RegExp, lead: string): number {
  const hit = re.exec(line);
  return hit ? (hit[0] ?? "").length - lead.length : 0;
}

function headingLevel(line: string): HeadingLevel {
  const hit = HEADING_RE.exec(line);
  const n = (hit?.[1] ?? "").length;
  return n >= 1 && n <= 4 ? (n as HeadingLevel) : 0;
}

/* ---------------- inline marks ---------------- */

type InlineKind =
  /** Put the markers around `edit`. */
  | "wrap"
  /** The markers sit just outside `edit` — take them off. */
  | "unwrap"
  /** The range swallowed its own markers — take them off. */
  | "unwrap-inside"
  /** Nothing to grab: leave an empty pair with the caret inside. */
  | "open"
  /** The caret sits inside an empty pair: take it away again. */
  | "close";

interface Range {
  from: number;
  to: number;
}

interface InlineHit {
  kind: InlineKind;
  /** Where the markers arrive or leave. */
  edit: Range;
  /** The prose the selection should still be holding afterwards. */
  sel: Range;
  /** True when a bare caret was widened to the word under it. */
  word: boolean;
}

/* Longest first, so `**` is never mistaken for two `*`. */
const ALL_MARKERS = ["**", "~~", "_", "`"];

/** The range, then each way of stepping out over a *complete* pair of
    inline markers.

    Bold has to be able to see past emphasis it already sits outside of:
    without this, pressing Bold inside `**_word_**` fails to find its own
    asterisks and grows a second pair every time — and pressing it again
    never gets the page back. Wrapping climbs to the top of the same
    ladder that unwrapping searches, which is what keeps the two moves
    exact inverses. */
function ladderOf(text: string, s: number, e: number): Range[] {
  const out: Range[] = [{ from: s, to: e }];
  let a = s;
  let b = e;
  for (let step = 0; step < ALL_MARKERS.length; step++) {
    const m = ALL_MARKERS.find(
      (x) => a >= x.length && text.slice(a - x.length, a) === x && text.slice(b, b + x.length) === x,
    );
    if (!m) break;
    a -= m.length;
    b += m.length;
    out.push({ from: a, to: b });
  }
  return out;
}

function resolveInline(text: string, from: number, to: number, mark: InlineMark): InlineHit {
  const m = INLINE_MARKERS[mark];
  const n = m.length;
  const caret: Range = { from, to };
  let s = from;
  let e = to;
  let word = false;

  if (from === to) {
    // A caret in a word means the word — clicking Bold mid-word should
    // bold the word, the way it does in every editor a writer has used.
    const w = wordAt(text, from);
    if (w) {
      s = w.from;
      e = w.to;
      word = true;
    } else {
      const closing =
        from >= n && text.slice(from - n, from) === m && text.slice(from, from + n) === m;
      return { kind: closing ? "close" : "open", edit: caret, sel: caret, word: false };
    }
  } else {
    // `**word **` is not emphasis in Markdown, it is four literal
    // asterisks. Double-clicking a word often takes the space with it,
    // so pull the edges back in before wrapping.
    while (s < e && /\s/.test(text.charAt(s))) s++;
    while (e > s && /\s/.test(text.charAt(e - 1))) e--;
    if (s === e) return { kind: "open", edit: caret, sel: caret, word: false };
  }

  const sel: Range = { from: s, to: e };
  const ladder = ladderOf(text, s, e);

  for (const rung of ladder) {
    if (
      rung.from >= n &&
      text.slice(rung.from - n, rung.from) === m &&
      text.slice(rung.to, rung.to + n) === m
    ) {
      return { kind: "unwrap", edit: rung, sel, word };
    }
  }
  if (e - s >= n * 2 && text.slice(s, s + n) === m && text.slice(e - n, e) === m) {
    return { kind: "unwrap-inside", edit: sel, sel, word };
  }
  return { kind: "wrap", edit: ladder[ladder.length - 1] ?? sel, sel, word };
}

/** Bold / italic / strikethrough / inline code, on or off. */
export function toggleInline(
  text: string,
  from: number,
  to: number,
  mark: InlineMark,
): FormatResult {
  const m = INLINE_MARKERS[mark];
  const n = m.length;
  const hit = resolveInline(text, from, to, mark);

  if (hit.kind === "open") {
    const at = from + n;
    return { text: spliced(text, [{ at: from, remove: 0, insert: m + m }]), from: at, to: at };
  }
  if (hit.kind === "close") {
    return finish(text, [{ at: from - n, remove: n * 2, insert: "" }], from, to);
  }

  const edits: Splice[] =
    hit.kind === "unwrap"
      ? [
          { at: hit.edit.from - n, remove: n, insert: "" },
          { at: hit.edit.to, remove: n, insert: "" },
        ]
      : hit.kind === "unwrap-inside"
        ? [
            { at: hit.edit.from, remove: n, insert: "" },
            { at: hit.edit.to - n, remove: n, insert: "" },
          ]
        : [
            { at: hit.edit.from, remove: 0, insert: m },
            { at: hit.edit.to, remove: 0, insert: m },
          ];

  /* A caret keeps its exact place inside the word it widened to. The
     word's own characters never move relative to each other, so carrying
     the offset across is both simpler and more honest than mapping the
     caret through the splices — which would strand it outside the
     markers whenever it sat on either end of the word. */
  if (hit.word) {
    const at = moved(hit.sel.from, edits, "after") + (from - hit.sel.from);
    return { text: spliced(text, edits), from: at, to: at };
  }
  // A selection keeps the prose it had hold of, trimmed edges and all.
  return finish(text, edits, hit.sel.from, hit.sel.to);
}

/* ---------------- block prefixes ---------------- */

/** Bullets or numbers. Applying a list to the same kind of list removes
    it; applying it to the other kind converts, which is what every
    writer means by clicking "numbered" on a bulleted paragraph. */
export function toggleList(
  text: string,
  from: number,
  to: number,
  kind: ListKind,
): FormatResult {
  const rows = rowsIn(text, from, to);
  const re = kind === "bullet" ? BULLET_RE : NUMBER_RE;
  const off = rows.every((l) => re.test(l.text));

  const edits: Splice[] = [];
  let n = 0;
  for (const line of rows) {
    const lead = leadOf(line.text, BLOCK_LEAD);
    const remove = Math.max(
      markerLen(line.text, BULLET_RE, lead),
      markerLen(line.text, NUMBER_RE, lead),
    );
    n += 1;
    const insert = off ? "" : kind === "bullet" ? "- " : `${n}. `;
    if (remove === 0 && insert === "") continue;
    edits.push({ at: line.start + lead.length, remove, insert });
  }
  return finish(text, edits, from, to);
}

/** Blockquote. Blank lines are left blank so a quote never grows a `>`
    on a paragraph break the writer cannot see. */
export function toggleQuote(text: string, from: number, to: number): FormatResult {
  const rows = rowsIn(text, from, to);
  const off = rows.every((l) => QUOTE_RE.test(l.text));

  const edits: Splice[] = rows.map((line) => {
    const indent = leadOf(line.text, INDENT);
    return {
      at: line.start + indent.length,
      remove: off ? markerLen(line.text, QUOTE_RE, indent) : 0,
      insert: off ? "" : "> ",
    };
  });
  return finish(text, edits, from, to);
}

/** Set the selected lines to a heading level. Choosing the level the
    lines already have puts them back to body prose, so the menu is a
    toggle as well as a picker; level 0 always means body. */
export function toggleHeading(
  text: string,
  from: number,
  to: number,
  level: HeadingLevel,
): FormatResult {
  const rows = rowsIn(text, from, to);
  const already = level > 0 && rows.every((l) => headingLevel(l.text) === level);
  const insert = already || level === 0 ? "" : `${"#".repeat(level)} `;

  const edits: Splice[] = [];
  for (const line of rows) {
    const lead = leadOf(line.text, BLOCK_LEAD);
    const remove = markerLen(line.text, HEADING_RE, lead);
    if (remove === 0 && insert === "") continue;
    edits.push({ at: line.start + lead.length, remove, insert });
  }
  return finish(text, edits, from, to);
}

/* ---------------- links ---------------- */

const LINK_RE = /\[([^\]\n]*)\]\(([^)\n]*)\)/g;

interface LinkHit {
  open: number;
  labelTo: number;
  close: number;
  url: string;
}

/** The `[label](target)` the selection sits inside, if any. Bounded to
    the caret's own line — a Markdown link cannot span one. */
function linkAround(text: string, from: number, to: number): LinkHit | null {
  const start = text.lastIndexOf("\n", from - 1) + 1;
  let end = text.indexOf("\n", from);
  if (end === -1) end = text.length;
  const line = text.slice(start, end);

  LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINK_RE.exec(line)) !== null) {
    const open = start + m.index;
    const close = open + (m[0] ?? "").length;
    if (from >= open && to <= close) {
      return { open, labelTo: open + 1 + (m[1] ?? "").length, close, url: m[2] ?? "" };
    }
  }
  return null;
}

/** The URL of the link under the selection, or null. */
export function linkTarget(text: string, from: number, to: number): string | null {
  return linkAround(text, from, to)?.url ?? null;
}

/** Wrap the selection in a link, or unlink one that is already there.

    With nothing selected it links the word under the caret; with no word
    either, it drops a `[text](url)` template and selects the label so the
    next thing typed replaces it. */
export function toggleLink(text: string, from: number, to: number, url: string): FormatResult {
  const hit = linkAround(text, from, to);
  if (hit) {
    const edits: Splice[] = [
      { at: hit.open, remove: 1, insert: "" },
      { at: hit.labelTo, remove: hit.close - hit.labelTo, insert: "" },
    ];
    return from === to
      ? finish(text, edits, from, from)
      : finish(text, edits, hit.open + 1, hit.labelTo);
  }

  let s = from;
  let e = to;
  if (s === e) {
    const w = wordAt(text, from);
    if (w) {
      s = w.from;
      e = w.to;
    } else {
      const insert = `[${LINK_LABEL}](${url || "url"})`;
      return {
        text: spliced(text, [{ at: from, remove: 0, insert }]),
        from: from + 1,
        to: from + 1 + LINK_LABEL.length,
      };
    }
  } else {
    while (s < e && /\s/.test(text.charAt(s))) s++;
    while (e > s && /\s/.test(text.charAt(e - 1))) e--;
    if (s === e) {
      const insert = `[${LINK_LABEL}](${url || "url"})`;
      return {
        text: spliced(text, [{ at: from, remove: 0, insert }]),
        from: from + 1,
        to: from + 1 + LINK_LABEL.length,
      };
    }
  }

  const edits: Splice[] = [
    { at: s, remove: 0, insert: "[" },
    { at: e, remove: 0, insert: `](${url})` },
  ];
  return from === to ? finish(text, edits, from, from) : finish(text, edits, s, e);
}

/* ---------------- what is on right now ---------------- */

/** What the toolbar should light up. Every answer is the same question
    the matching toggle asks, so `aria-pressed` and the click agree. */
export function inspect(text: string, from: number, to: number): FormatState {
  const rows = rowsIn(text, from, to);
  const on = (mark: InlineMark): boolean => {
    const kind = resolveInline(text, from, to, mark).kind;
    return kind === "unwrap" || kind === "unwrap-inside" || kind === "close";
  };
  const levels = rows.map((l) => headingLevel(l.text));
  const first = levels[0] ?? 0;

  return {
    bold: on("bold"),
    italic: on("italic"),
    strike: on("strike"),
    code: on("code"),
    bullet: rows.every((l) => BULLET_RE.test(l.text)),
    numbered: rows.every((l) => NUMBER_RE.test(l.text)),
    quote: rows.every((l) => QUOTE_RE.test(l.text)),
    heading: levels.every((n) => n === first) ? first : 0,
    link: linkAround(text, from, to) !== null,
  };
}

/** Everything off — what the bar shows with no editor, or when a
    selection is too big to be worth reading on the typing path. */
export const NO_FORMAT: FormatState = {
  bold: false,
  italic: false,
  strike: false,
  code: false,
  bullet: false,
  numbered: false,
  quote: false,
  heading: 0,
  link: false,
};
