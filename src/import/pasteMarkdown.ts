/* ============================================================
   Paste that keeps its shape

   A writer copies a scene out of Google Docs, or an outline out of
   a browser, and expects the bold to still be bold. The clipboard
   always carries two flavours — text/plain and text/html — and the
   editor only ever read the first, so every emphasis, list and
   heading was thrown away on the way in.

   This file is the whole conversion and nothing else: an HTML
   string in, Markdown out. It is pure on purpose. No DOM global is
   touched at module level, so the tests drive it in Node. In the
   app the browser's DOMParser does the parsing (fast, forgiving,
   and inert — parseFromString never runs a script, never fetches an
   image, and never touches the live document); in Node the small
   tokenizer at the bottom of this file stands in for it.

   The governing rule is that a paste must never make a mess. This
   is a manuscript, not a scratch buffer: a conversion that inserts
   garbage costs the writer more than one that gives up. So every
   ambiguous case resolves the same way — markdownFromPaste returns
   null and the caller lets CodeMirror paste the plain text exactly
   as it always has.
   ============================================================ */

/* ---------------- the tree we convert ---------------- */

export interface PasteText {
  kind: "text";
  text: string;
}

export interface PasteElement {
  kind: "element";
  /** Lowercased tag name. The synthetic root is "#root". */
  tag: string;
  attrs: Record<string, string>;
  children: PasteNode[];
}

export type PasteNode = PasteText | PasteElement;

/** Anything that can turn an HTML string into a tree. Injectable so the
    tests never need a DOM, and so the browser can keep using DOMParser. */
export type ParseHtml = (html: string) => PasteElement;

export interface PasteOptions {
  parse?: ParseHtml;
}

export interface PasteConversion {
  markdown: string;
  /** False when the result looked wrong enough that the caller should
      paste the plain text instead. `reason` says which check tripped. */
  ok: boolean;
  reason: string | null;
  /** True when the HTML actually carried formatting worth keeping.
      Plain prose converts to itself, and we would rather paste that
      through untouched than add escape backslashes for nothing. */
  enriched: boolean;
}

export const element = (
  tag: string,
  attrs: Record<string, string> = {},
  children: PasteNode[] = [],
): PasteElement => ({ kind: "element", tag, attrs, children });

export const textNode = (text: string): PasteText => ({ kind: "text", text });

/* Word HTML runs about ten times the size of the prose it carries, so
   these are generous. Past them we stop rather than lock the editor up
   mid-paste; the plain-text paste still lands, so nothing is lost. */
const MAX_HTML = 4_000_000;
const MAX_MARKDOWN = 1_000_000;

/* ---------------- public API ---------------- */

/** Convert a clipboard HTML string to Markdown. Never throws. */
export function htmlToMarkdown(html: string, opts: PasteOptions = {}): PasteConversion {
  const parse = opts.parse ?? defaultParse;
  try {
    const root = parse(clipboardFragment(html));
    const st: State = { enriched: false };
    const blocks = walkBlocks(root.children, st, NO_MARKS);
    const markdown = tidy(joinBlocks(blocks));
    const problem = firstProblem(markdown);
    return { markdown, enriched: st.enriched, ok: problem === null, reason: problem };
  } catch (err) {
    // A parse or conversion bug must not cost the writer their paste.
    return { markdown: "", enriched: false, ok: false, reason: `threw: ${String(err)}` };
  }
}

/**
 * What the editor actually calls. Returns the Markdown to insert, or null
 * meaning "leave this paste alone" — which the caller honours by doing
 * nothing at all, so CodeMirror inserts `plain` the way it always has.
 *
 * It returns null when:
 *   - there is no HTML, or it is implausibly large;
 *   - the conversion threw, or came out empty;
 *   - the HTML carried no formatting, so there is nothing to preserve;
 *   - the result failed a sanity check (unbalanced markers, syntax soup);
 *   - the result lost the writer's words, or gained words the reader
 *     never saw — the shape of a stylesheet leaking into the prose.
 */
export function markdownFromPaste(
  html: string,
  plain: string,
  opts: PasteOptions = {},
): string | null {
  if (!html || !html.trim()) return null;
  if (html.length > MAX_HTML) return null;

  const conv = htmlToMarkdown(html, opts);
  if (!conv.ok || !conv.enriched) return null;
  if (!conv.markdown.trim()) return null;

  // Compared against the plain-text flavour of the same clipboard, which
  // is the honest record of what the writer saw before they hit copy.
  const reference = plain ?? "";
  if (reference.trim()) {
    const made = letters(conv.markdown);
    const had = letters(reference);
    if (made < had * 0.9) return null;
    if (made > had * 1.6) return null;
  }
  return conv.markdown;
}

/* ---------------- what we keep and what we drop ---------------- */

/** Markup that carries no prose. Dropped whole, children and all —
    <style> and <script> above all, since a converter that walks into
    them pastes CSS into the middle of a chapter. */
const DROP = new Set([
  "script", "style", "head", "meta", "link", "title", "noscript",
  "iframe", "object", "embed", "param", "svg", "canvas", "math",
  "video", "audio", "source", "track", "picture",
  "input", "button", "select", "option", "optgroup", "textarea",
  "fieldset", "legend", "map", "area", "colgroup", "col", "template",
]);

const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "body", "center", "dd",
  "details", "div", "dl", "dt", "figcaption", "figure", "footer", "form",
  "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "html", "li", "main",
  "nav", "ol", "p", "pre", "section", "summary", "table", "tbody", "td",
  "tfoot", "th", "thead", "tr", "ul",
]);

const HEADING_LEVEL: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };

const isBlockTag = (tag: string): boolean => BLOCK.has(tag);

/* ---------------- emphasis ---------------- */

interface Marks {
  bold: boolean;
  italic: boolean;
  code: boolean;
  strike: boolean;
  underline: boolean;
}

const NO_MARKS: Marks = { bold: false, italic: false, code: false, strike: false, underline: false };

const marksKey = (m: Marks): string =>
  `${+m.bold}${+m.italic}${+m.code}${+m.strike}${+m.underline}`;

/** Inline CSS the source applied, as a lowercased map. */
function styleOf(el: PasteElement): Record<string, string> {
  const raw = el.attrs.style;
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const decl of raw.split(";")) {
    const colon = decl.indexOf(":");
    if (colon === -1) continue;
    const key = decl.slice(0, colon).trim().toLowerCase();
    if (key) out[key] = decl.slice(colon + 1).trim().toLowerCase();
  }
  return out;
}

/** null when the value says nothing about weight. */
function weightIsBold(value: string): boolean | null {
  const num = Number.parseInt(value, 10);
  if (Number.isFinite(num) && /^\d/.test(value)) return num >= 600;
  if (value.includes("bolder") || value.includes("bold")) return true;
  if (value.includes("normal") || value.includes("lighter")) return false;
  return null;
}

/**
 * The emphasis in force inside an element, given what it inherited.
 *
 * Tags are only half the story, and on their own they are actively
 * misleading. Google Docs wraps an entire copied document in
 * `<b style="font-weight:normal" id="docs-internal-guid-…">` and then
 * carries the real bold on inner `<span style="font-weight:700">`. A
 * converter that trusts <b> turns the whole document bold — the single
 * most common way this feature goes wrong. So the inline style always
 * wins over the tag, and an explicit `font-weight:normal` switches bold
 * off no matter what element it sits on.
 */
function marksFor(el: PasteElement, from: Marks, inLink = false): Marks {
  const m: Marks = { ...from };
  const tag = el.tag;

  if (tag === "b" || tag === "strong") m.bold = true;
  if (tag === "i" || tag === "em" || tag === "cite" || tag === "var" || tag === "dfn") m.italic = true;
  if (tag === "code" || tag === "kbd" || tag === "samp" || tag === "tt") m.code = true;
  if (tag === "s" || tag === "strike" || tag === "del") m.strike = true;
  if (tag === "u" || tag === "ins") m.underline = true;

  const style = styleOf(el);
  const weight = style["font-weight"];
  if (weight) {
    const bold = weightIsBold(weight);
    if (bold !== null) m.bold = bold;
  }
  const fontStyle = style["font-style"];
  if (fontStyle) {
    if (fontStyle.includes("italic") || fontStyle.includes("oblique")) m.italic = true;
    else if (fontStyle.includes("normal")) m.italic = false;
  }
  const deco = style["text-decoration-line"] ?? style["text-decoration"];
  if (deco) {
    if (/\bnone\b/.test(deco)) {
      m.strike = false;
      m.underline = false;
    }
    if (deco.includes("line-through")) m.strike = true;
    if (deco.includes("underline")) m.underline = true;
  }

  // Belt and braces for the Google Docs wrapper: even if the style
  // attribute is stripped by whatever the clipboard passed through, that
  // id means "container", not "bold".
  if ((el.attrs.id ?? "").startsWith("docs-internal-guid")) m.bold = from.bold;

  // Every link on the web is underlined, and none of that is authoring
  // intent. Carrying it through would wrap half a pasted article in <u>.
  if (inLink) m.underline = from.underline;

  return m;
}

/* ---------------- inline rendering ---------------- */

interface State {
  enriched: boolean;
  /** containsBlock() answers are memoized: without it, a document of
      deeply nested spans is quadratic to walk. */
  blocky?: Map<PasteElement, boolean>;
}

function containsBlock(el: PasteElement, st: State): boolean {
  const memo = (st.blocky ??= new Map());
  const seen = memo.get(el);
  if (seen !== undefined) return seen;
  let found = false;
  for (const child of el.children) {
    if (child.kind !== "element" || DROP.has(child.tag)) continue;
    if (isBlockTag(child.tag) || HEADING_LEVEL[child.tag] || containsBlock(child, st)) {
      found = true;
      break;
    }
  }
  memo.set(el, found);
  return found;
}

interface InlineCtx {
  marks: Marks;
  inLink: boolean;
  st: State;
}

/** One stretch of already-escaped Markdown under one set of marks. */
interface Run {
  md: string;
  marks: Marks;
}

/**
 * Emphasis is applied to *runs*, not to elements.
 *
 * Wrapping at element boundaries looks simpler and is wrong: in
 * `<b>bold <span style="font-weight:normal">not</span></b>` the outer
 * markers would swallow the child that explicitly turned bold off. So
 * every text fragment records the marks in force where it sits, and
 * adjacent fragments that agree are wrapped together afterwards.
 */
function inlineRuns(nodes: PasteNode[], ctx: InlineCtx, out: Run[]): void {
  for (const node of nodes) {
    if (node.kind === "text") {
      const md = ctx.marks.code ? node.text : escapeInline(collapse(node.text));
      if (md) out.push({ md, marks: ctx.marks });
      continue;
    }
    const tag = node.tag;
    if (DROP.has(tag)) continue;
    if (isWordBulletGlyph(node)) continue;

    if (tag === "br") {
      out.push({ md: "\n", marks: ctx.marks });
      continue;
    }
    if (tag === "img") {
      const run = imageRun(node, ctx);
      if (run) out.push(run);
      continue;
    }
    if (tag === "a") {
      const run = linkRun(node, ctx);
      if (run) out.push(run);
      continue;
    }

    const marks = marksFor(node, ctx.marks, ctx.inLink);
    // Code short-circuits: nothing inside a code span is Markdown, so its
    // text goes in raw and no child emphasis is read.
    if (marks.code && !ctx.marks.code) {
      const raw = rawText(node).replace(/\s+/g, " ").trim();
      if (raw) out.push({ md: raw, marks });
      continue;
    }
    inlineRuns(node.children, { ...ctx, marks }, out);
  }
}

/** Group runs by their marks and wrap each group once. `base` is the
    emphasis already applied by an enclosing construct (a link's brackets
    sit inside the bold markers, not the other way round). */
function runsToMarkdown(runs: Run[], base: Marks = NO_MARKS, st?: State): string {
  let out = "";
  let i = 0;
  while (i < runs.length) {
    const head = runs[i];
    if (!head) break;
    const marks = subtract(head.marks, base);
    const key = marksKey(marks);
    let body = "";
    while (i < runs.length) {
      const run = runs[i];
      if (!run || marksKey(subtract(run.marks, base)) !== key) break;
      body += run.md;
      i++;
    }
    out += wrap(body, marks, st);
  }
  return out;
}

function subtract(marks: Marks, base: Marks): Marks {
  return {
    bold: marks.bold && !base.bold,
    italic: marks.italic && !base.italic,
    code: marks.code && !base.code,
    strike: marks.strike && !base.strike,
    underline: marks.underline && !base.underline,
  };
}

/**
 * Put the markers on. Whitespace is shifted outside them because
 * `**word **` is not emphasis in any Markdown dialect — the marker has to
 * sit against the word, which is the same rule docx.ts follows on import.
 *
 * UNDERLINE: Markdown has no underline, and the three ways out are all
 * imperfect. Mapping it to italic destroys the distinction the writer made
 * (a passage that is both italic and underlined would come back as one
 * thing), and dropping it loses formatting the owner explicitly asked to
 * keep. So underline passes through as a literal <u> tag: inline HTML is
 * part of Markdown, every renderer and every HTML/DOCX export understands
 * it, the writer can see it and delete it, and — unlike the other two —
 * nothing about the original is lost or invented.
 */
function wrap(body: string, marks: Marks, st?: State): string {
  if (!body) return body;
  const lead = /^\s*/.exec(body)?.[0] ?? "";
  const tail = /\s*$/.exec(body)?.[0] ?? "";
  let core = body.slice(lead.length, body.length - tail.length);
  if (!core) return body;

  if (marks.code) core = codeSpan(core);
  if (marks.italic) core = `*${core}*`;
  if (marks.bold) core = `**${core}**`;
  if (marks.strike) core = `~~${core}~~`;
  if (marks.underline) core = `<u>${core}</u>`;
  if (st && (marks.code || marks.italic || marks.bold || marks.strike || marks.underline)) {
    st.enriched = true;
  }
  return lead + core + tail;
}

/** Backtick runs long enough to survive backticks in the content. */
function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((r) => r.length));
  const fence = "`".repeat(longest + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}

/** Schemes that still mean something once the text leaves its page.
    A relative href, a bare "#anchor" or a javascript: URL would all be
    dead links in a manuscript, so those keep their words and lose the
    link rather than pointing at nothing. */
const SAFE_LINK = /^(https?:|mailto:|tel:|ftp:)/i;

function linkRun(el: PasteElement, ctx: InlineCtx): Run | null {
  const marks = marksFor(el, ctx.marks, true);
  const inner: Run[] = [];
  inlineRuns(el.children, { marks, inLink: true, st: ctx.st }, inner);
  const label = runsToMarkdown(inner, marks, ctx.st).replace(/\s+/g, " ").trim();
  if (!label) return null;

  const href = (el.attrs.href ?? "").trim().replace(/\s+/g, "");
  if (!href || href.length > 2000 || !SAFE_LINK.test(href)) {
    return { md: label, marks };
  }
  ctx.st.enriched = true;
  return { md: `[${label}](${url(href)})`, marks };
}

function imageRun(el: PasteElement, ctx: InlineCtx): Run | null {
  const marks = marksFor(el, ctx.marks, ctx.inLink);
  const alt = collapse(el.attrs.alt ?? "").trim();
  const src = (el.attrs.src ?? "").trim().replace(/\s+/g, "");

  // A data: URI is the whole image encoded in the href — pasting one drops
  // megabytes of base64 into the middle of a chapter, and blob:/cid:/file:
  // URLs are dead the moment the source app closes. None of them survive
  // as a manuscript, so the alt text is kept and the image is not.
  if (!/^https?:\/\//i.test(src) || src.length > 2000) {
    return alt ? { md: escapeInline(alt), marks } : null;
  }
  ctx.st.enriched = true;
  return { md: `![${escapeInline(alt)}](${url(src)})`, marks };
}

/** Angle-bracket form for URLs that would otherwise break the link. */
function url(href: string): string {
  return /[()\s<>]/.test(href) ? `<${href.replace(/[<>]/g, "")}>` : href;
}

/* ---------------- block rendering ---------------- */

interface Block {
  md: string;
  /** Lists join tight against the line above them inside a list item. */
  list: boolean;
}

function walkBlocks(nodes: PasteNode[], st: State, marks: Marks): Block[] {
  const out: Block[] = [];
  let buf: Run[] = [];
  const flush = () => {
    const md = runsToMarkdown(buf, NO_MARKS, st).replace(/[ \t]*\n[ \t]*/g, "\n").trim();
    buf = [];
    if (md) out.push({ md: escapeBlockStarts(md), list: false });
  };

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    if (node.kind === "text") {
      inlineRuns([node], { marks, inLink: false, st }, buf);
      continue;
    }
    if (DROP.has(node.tag)) continue;

    // Word writes lists as a run of ordinary paragraphs (see wordListBlock),
    // so the whole run has to be swallowed at once to become one list.
    if (isWordListItem(node)) {
      flush();
      const run: PasteElement[] = [];
      let j = i;
      while (j < nodes.length) {
        const next = nodes[j];
        if (!next) break;
        if (next.kind === "text" && !next.text.trim()) { j++; continue; }
        if (next.kind === "element" && isWordListItem(next)) { run.push(next); j++; continue; }
        break;
      }
      i = j - 1;
      out.push(wordListBlock(run, st, marks));
      continue;
    }

    if (isBlockTag(node.tag) || HEADING_LEVEL[node.tag]) {
      flush();
      out.push(...blockFor(node, st, marks));
      continue;
    }
    // An inline tag wrapped around whole paragraphs — which is precisely
    // the Google Docs wrapper, a <b> containing every <p> in the document.
    // Treated as a container, so the paragraphs survive and its (switched
    // off) bold is inherited rather than applied.
    if (containsBlock(node, st)) {
      flush();
      out.push(...walkBlocks(node.children, st, marksFor(node, marks)));
      continue;
    }
    inlineRuns([node], { marks, inLink: false, st }, buf);
  }
  flush();
  return out.filter((b) => b.md.trim() !== "");
}

function blockFor(el: PasteElement, st: State, from: Marks): Block[] {
  const marks = marksFor(el, from);
  const tag = el.tag;

  const level = HEADING_LEVEL[tag];
  if (level) {
    const runs: Run[] = [];
    inlineRuns(el.children, { marks, inLink: false, st }, runs);
    const text = runsToMarkdown(runs, NO_MARKS, st).replace(/\s+/g, " ").trim();
    if (!text) return [];
    st.enriched = true;
    return [{ md: `${"#".repeat(level)} ${text}`, list: false }];
  }

  if (tag === "hr") {
    st.enriched = true;
    return [{ md: "---", list: false }];
  }
  if (tag === "pre") return preBlock(el, st);
  if (tag === "blockquote") return quoteBlock(el, st, marks);
  if (tag === "ul" || tag === "ol") return [listBlock(el, st, marks, tag === "ol")];
  if (tag === "table") {
    const table = tableBlock(el, st, marks);
    if (table) return [table];
  }
  // Everything else is a container — a <div>, a <section>, a Word
  // <div class=WordSection1>, a table we declined to draw. Walk through it.
  return walkBlocks(el.children, st, marks);
}

function quoteBlock(el: PasteElement, st: State, marks: Marks): Block[] {
  const inner = joinBlocks(walkBlocks(el.children, st, marks));
  if (!inner.trim()) return [];
  st.enriched = true;
  const md = inner.split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n");
  return [{ md, list: false }];
}

function preBlock(el: PasteElement, st: State): Block[] {
  const raw = rawText(el).replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  if (!raw.trim()) return [];
  st.enriched = true;
  const longest = Math.max(2, ...(raw.match(/`+/g) ?? []).map((r) => r.length));
  const fence = "`".repeat(longest + 1);
  return [{ md: `${fence}${codeLanguage(el)}\n${raw}\n${fence}`, list: false }];
}

function codeLanguage(el: PasteElement): string {
  const classes = `${el.attrs.class ?? ""} ${firstCodeClass(el)}`;
  const match = /(?:language|lang|highlight)-([a-z0-9+#-]+)/i.exec(classes);
  return match?.[1] ? match[1].toLowerCase() : "";
}

function firstCodeClass(el: PasteElement): string {
  for (const child of el.children) {
    if (child.kind === "element" && child.tag === "code") return child.attrs.class ?? "";
  }
  return "";
}

/* ---------------- lists ---------------- */

function listBlock(list: PasteElement, st: State, from: Marks, ordered: boolean): Block {
  const marks = marksFor(list, from);
  const startAttr = Number.parseInt(list.attrs.start ?? "1", 10);
  let n = Number.isFinite(startAttr) && startAttr > 0 ? startAttr : 1;
  const lines: string[] = [];

  for (const child of list.children) {
    if (child.kind !== "element") continue;

    // A <ul> parented straight by another <ul>, with no <li> between them.
    // Invalid HTML that Word and half the web produce anyway; it belongs to
    // the item above it, so indent it rather than dropping it.
    if (child.tag === "ul" || child.tag === "ol") {
      const nested = listBlock(child, st, marks, child.tag === "ol");
      if (nested.md.trim()) lines.push(indent(nested.md, "  "));
      continue;
    }
    if (child.tag !== "li") continue;

    const marker = ordered ? `${n++}. ` : "- ";
    const pad = " ".repeat(marker.length);
    const blocks = walkBlocks(child.children, st, marksFor(child, marks));
    if (blocks.length === 0) continue;

    const first = blocks[0];
    lines.push(marker + indent(first ? first.md : "", pad).slice(pad.length));
    for (const block of blocks.slice(1)) {
      // A second paragraph inside an item needs the blank line or it
      // reads as a new item; a nested list must not have one or the
      // whole list turns loose.
      if (!block.list) lines.push("");
      lines.push(indent(block.md, pad));
    }
  }
  if (lines.length) st.enriched = true;
  return { md: lines.join("\n"), list: true };
}

const indent = (md: string, pad: string): string =>
  md.split("\n").map((line) => (line ? pad + line : line)).join("\n");

/* Word does not emit <ul>. It emits a run of ordinary paragraphs, each
   carrying `mso-list:l0 level1 lfo1` in its style attribute, with the
   bullet glyph itself in a sibling span marked `mso-list:Ignore`. Read
   naively that pastes as flat paragraphs beginning with a literal "·",
   which is exactly the mess this whole file exists to avoid. */

function isWordListItem(el: PasteElement): boolean {
  if (el.tag !== "p" && el.tag !== "div") return false;
  const spec = styleOf(el)["mso-list"];
  if (spec && !spec.includes("none")) return true;
  return /msolistparagraph/i.test(el.attrs.class ?? "") && LEADING_GLYPH.test(rawText(el));
}

const isWordBulletGlyph = (el: PasteElement): boolean =>
  (styleOf(el)["mso-list"] ?? "").includes("ignore");

/** Only glyphs and digits. Letter bullets ("o", "v" in Wingdings) are left
    alone — eating a real word that happens to start a line is worse than
    leaving one stray character. */
const LEADING_GLYPH = /^[\s\u00a0]*(?:[\u00b7\u2022\u25cf\u25aa\u25e6\u2023\uf0b7\uf0a7]|\d{1,3}[.)])[\s\u00a0]+/;

function wordListLevel(el: PasteElement): number {
  const spec = styleOf(el)["mso-list"] ?? "";
  const match = /level(\d+)/.exec(spec);
  const level = match?.[1] ? Number.parseInt(match[1], 10) : 1;
  return Number.isFinite(level) && level > 0 ? Math.min(level, 6) : 1;
}

/** The glyph Word put in the Ignore span, which is the only place the
    ordered-vs-bulleted answer is written down. */
function wordListMarker(el: PasteElement): string {
  if (el.kind === "element" && isWordBulletGlyph(el)) return rawText(el);
  for (const child of el.children) {
    if (child.kind !== "element") continue;
    const found = wordListMarker(child);
    if (found.trim()) return found;
  }
  return "";
}

function wordListBlock(items: PasteElement[], st: State, marks: Marks): Block {
  const lines: string[] = [];
  const counters: number[] = [];

  for (const item of items) {
    const level = wordListLevel(item);
    const ordered = /^[\s ]*(?:\d+|[a-z]|[ivxlc]+)[.)]/i.test(wordListMarker(item));
    counters.length = level;
    counters[level - 1] = (counters[level - 1] ?? 0) + 1;

    const runs: Run[] = [];
    inlineRuns(item.children, { marks: marksFor(item, marks), inLink: false, st }, runs);
    const body = runsToMarkdown(runs, NO_MARKS, st)
      .replace(/\s+/g, " ")
      .replace(LEADING_GLYPH, "")
      .trim();
    if (!body) continue;

    const marker = ordered ? `${counters[level - 1] ?? 1}. ` : "- ";
    lines.push("  ".repeat(level - 1) + marker + escapeBlockStarts(body));
  }
  if (lines.length) st.enriched = true;
  return { md: lines.join("\n"), list: true };
}

/* ---------------- tables ---------------- */

/**
 * Only tables a pipe table can actually hold: at least two rows, no merged
 * cells, no table inside a cell. Everything else — Word and Outlook use
    const ordered = /^[\s\u00a0]*(?:\d+|[a-z]|[ivxlc]+)[.)]/i.test(wordListMarker(item));
 * shape in pasted mail — returns null, and the caller walks the cells as
 * ordinary blocks. That keeps every word and loses only the grid, which
 * beats emitting a pipe table that doesn't parse.
 */
function tableBlock(table: PasteElement, st: State, marks: Marks): Block | null {
  const rows: PasteElement[][] = [];
  const collect = (el: PasteElement): boolean => {
    for (const child of el.children) {
      if (child.kind !== "element") continue;
      if (child.tag === "tr") {
        const cells: PasteElement[] = [];
        for (const cell of child.children) {
          if (cell.kind !== "element") continue;
          if (cell.tag !== "td" && cell.tag !== "th") continue;
          if (span(cell, "colspan") > 1 || span(cell, "rowspan") > 1) return false;
          if (contains(cell, "table")) return false;
          cells.push(cell);
        }
        if (cells.length) rows.push(cells);
      } else if (child.tag === "thead" || child.tag === "tbody" || child.tag === "tfoot") {
        if (!collect(child)) return false;
      }
    }
    return true;
  };
  if (!collect(table)) return null;
  if (rows.length < 2) return null;

  const width = Math.max(...rows.map((r) => r.length));
  if (width < 1 || width > 24) return null;

  const cellText = (cell: PasteElement | undefined): string => {
    if (!cell) return "";
    const runs: Run[] = [];
    inlineRuns(cell.children, { marks: marksFor(cell, marks), inLink: false, st }, runs);
    return runsToMarkdown(runs, NO_MARKS, st).replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
  };
  const line = (cells: PasteElement[]): string => {
    const out: string[] = [];
    for (let i = 0; i < width; i++) out.push(cellText(cells[i]) || " ");
    return `| ${out.join(" | ")} |`;
  };

  const head = rows[0];
  if (!head) return null;
  // GFM has no headerless table. Promoting row one is the convention every
  // Markdown editor uses, and it reads better than a strip of empty cells.
  const lines = [line(head), `| ${Array(width).fill("---").join(" | ")} |`];
  for (const row of rows.slice(1)) lines.push(line(row));
  st.enriched = true;
  return { md: lines.join("\n"), list: false };
}

function span(el: PasteElement, attr: string): number {
  const n = Number.parseInt(el.attrs[attr] ?? "1", 10);
  return Number.isFinite(n) ? n : 1;
}

function contains(el: PasteElement, tag: string): boolean {
  for (const child of el.children) {
    if (child.kind !== "element") continue;
    if (child.tag === tag || contains(child, tag)) return true;
  }
  return false;
}

/* ---------------- text, escaping, tidying ---------------- */

function rawText(node: PasteNode): string {
  if (node.kind === "text") return node.text;
  if (DROP.has(node.tag)) return "";
  if (node.tag === "br") return "\n";
  let out = "";
  for (const child of node.children) out += rawText(child);
  return out;
}

/** HTML collapses runs of whitespace, and so must we. Non-breaking spaces
    become ordinary ones: Word and Docs use them as padding, and a
    manuscript full of invisible U+00A0 is a bug the writer can't see. */
function collapse(text: string): string {
  return text
    .replace(/[\u00a0\u2007\u202f\u2000-\u200a\u3000]/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Escape what would otherwise become syntax. Deliberately narrow: this is
 * prose, and a paste peppered with backslashes is its own kind of mess.
 * Underscores inside a word (file_name) are not emphasis in CommonMark, so
 * they are left alone; quotes, dashes and ampersands are never escaped.
 */
function escapeInline(text: string): string {
  return text.replace(/[\\`*[\]_<~]/g, (ch, at: number) => {
    if (ch === "_") {
      const before = text[at - 1] ?? "";
      const after = text[at + 1] ?? "";
      return /\w/.test(before) && /\w/.test(after) ? "_" : "\\_";
    }
    if (ch === "<") return /[a-zA-Z/!?]/.test(text[at + 1] ?? "") ? "\\<" : "<";
    if (ch === "~") return (text[at + 1] ?? "") === "~" || (text[at - 1] ?? "") === "~" ? "\\~" : "~";
    return `\\${ch}`;
  });
}

/** A paragraph that happens to begin "- " or "1." or "# " is prose, not a
    list or a heading — but only the start of a line can make that mistake. */
function escapeBlockStarts(md: string): string {
  return md
    .split("\n")
    .map((line) =>
      line.replace(
        /^(\s*)(#{1,6}(?=\s|$)|>|\||[-+](?=\s)|\d{1,9}[.)](?=\s)|={2,}\s*$|-{2,}\s*$)/,
        (_all, pad: string, token: string) => `${pad}\\${token}`,
      ),
    )
    .join("\n");
}

const joinBlocks = (blocks: Block[]): string =>
  blocks.map((b) => b.md).filter((md) => md.trim() !== "").join("\n\n");

function tidy(md: string): string {
  return md
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const letters = (text: string): number => (text.match(/[\p{L}\p{N}]/gu) ?? []).length;

/**
 * The last gate before the writer sees it. Anything here means we produced
 * something we cannot vouch for, and the caller pastes plain text instead.
 * Escaped markers are removed first so `\*` never counts as syntax.
 */
function firstProblem(md: string): string | null {
  if (md.length > MAX_MARKDOWN) return "result is implausibly large";
  const bare = md.replace(/\\[\s\S]/g, "");

  if (countOf(bare, /\*\*/g) % 2 !== 0) return "unbalanced bold markers";
  if (countOf(bare.replace(/\*\*/g, ""), /\*/g) % 2 !== 0) return "unbalanced italic markers";
  if (countOf(bare, /~~/g) % 2 !== 0) return "unbalanced strikethrough markers";
  if (countOf(bare, /`/g) % 2 !== 0) return "unbalanced code markers";
  if (countOf(bare, /\[/g) !== countOf(bare, /\]/g)) return "unbalanced link brackets";
  if (countOf(bare, /<u>/g) !== countOf(bare, /<\/u>/g)) return "unbalanced underline tags";
  if (/data:[^)\s]{200,}/.test(md)) return "an embedded data URI leaked through";

  // A short paste is legitimately mostly markers ("**yes**"); a long one
  // that is a third punctuation has stopped being prose.
  if (md.length > 200) {
    const syntax = countOf(md, /[*_`[\]()#>~|]/g);
    if (syntax > md.length * 0.35) return "more syntax than words";
  }
  return null;
}

const countOf = (text: string, re: RegExp): number => (text.match(re) ?? []).length;

/* ---------------- parsing ---------------- */

/** Windows and Word wrap the real content in CF_HTML markers, with a
    stylesheet and a pile of Office metadata outside them. Taking the
    fragment throws all of that away before parsing even starts. */
export function clipboardFragment(html: string): string {
  let out = html;
  if (out.startsWith("Version:")) {
    const first = out.indexOf("<");
    if (first > 0) out = out.slice(first);
  }
  const start = out.indexOf("<!--StartFragment-->");
  const end = out.indexOf("<!--EndFragment-->");
  if (start !== -1 && end > start) {
    const slice = out.slice(start + "<!--StartFragment-->".length, end);
    if (slice.trim()) return slice;
  }
  return out;
}

/** The DOM in the app, the tokenizer in Node. */
export function defaultParse(html: string): PasteElement {
  if (typeof DOMParser !== "undefined") {
    try {
      // "text/html" builds an inert document: no scripts run, no images
      // load, and nothing is ever attached to the live page.
      const doc = new DOMParser().parseFromString(html, "text/html");
      const body = (doc.body ?? doc.documentElement) as unknown as DomLikeNode | null;
      if (body) return fromDomNode(body);
    } catch {
      /* fall through to the tokenizer */
    }
  }
  return parseHtml(html);
}

/** The slice of the DOM this file reads — small enough that a test can
    hand it a stand-in and exercise the same mapping the browser uses. */
export interface DomLikeNode {
  nodeType: number;
  nodeName: string;
  nodeValue: string | null;
  childNodes: ArrayLike<DomLikeNode>;
  attributes?: ArrayLike<{ name: string; value: string }> | null;
}

export function fromDomNode(root: DomLikeNode): PasteElement {
  const convert = (node: DomLikeNode): PasteNode | null => {
    if (node.nodeType === 3) return { kind: "text", text: node.nodeValue ?? "" };
    if (node.nodeType !== 1) return null; // comments, doctypes, CDATA
    const attrs: Record<string, string> = {};
    const list = node.attributes;
    if (list) {
      for (let i = 0; i < list.length; i++) {
        const attr = list[i];
        if (attr) attrs[attr.name.toLowerCase()] = attr.value;
      }
    }
    const children: PasteNode[] = [];
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (!child) continue;
      const made = convert(child);
      if (made) children.push(made);
    }
    return { kind: "element", tag: node.nodeName.toLowerCase(), attrs, children };
  };
  const made = convert(root);
  if (made && made.kind === "element") return { ...made, tag: "#root" };
  return element("#root");
}

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr",
]);

/** Elements whose content is text, not markup. Skipped wholesale — this
    is where a stylesheet would otherwise arrive as prose. */
const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);

/** Tags that end an open element when they start. Real-world clipboard
    HTML leaves <p> and <li> unclosed constantly. */
const AUTO_CLOSE: Record<string, string[]> = {
  p: [
    "address", "article", "aside", "blockquote", "details", "div", "dl", "fieldset",
    "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr",
    "li", "main", "nav", "ol", "p", "pre", "section", "table", "td", "th", "tr", "ul",
  ],
  li: ["li"],
  dt: ["dt", "dd"],
  dd: ["dt", "dd"],
  td: ["td", "th", "tr"],
  th: ["td", "th", "tr"],
  tr: ["tr"],
  option: ["option"],
};

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9:._-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/y;
const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]*))?/g;

/**
 * A small forgiving HTML tokenizer, so this file can be tested in Node and
 * so nothing in it depends on a live DOM. It is not a spec parser; it
 * covers what clipboards actually contain — unquoted Word attributes,
 * unclosed <p> and <li>, conditional comments, namespaced <o:p> tags.
 */
export function parseHtml(html: string): PasteElement {
  const root = element("#root");
  const stack: PasteElement[] = [root];
  const top = (): PasteElement => stack[stack.length - 1] ?? root;

  let i = 0;
  let buf = "";
  const pushText = () => {
    if (!buf) return;
    top().children.push({ kind: "text", text: decodeEntities(buf) });
    buf = "";
  };

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      buf += html.slice(i);
      break;
    }
    buf += html.slice(i, lt);

    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const end = html.indexOf(">", lt);
      i = end === -1 ? html.length : end + 1;
      continue;
    }

    TAG.lastIndex = lt;
    const match = TAG.exec(html);
    if (!match) {
      // A bare "<" in prose. It is text, not a tag.
      buf += "<";
      i = lt + 1;
      continue;
    }
    const closing = match[1] === "/";
    const name = (match[2] ?? "").toLowerCase();
    const attrText = match[3] ?? "";
    i = TAG.lastIndex;
    pushText();

    if (closing) {
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k]?.tag === name) {
          stack.length = k;
          break;
        }
      }
      continue;
    }

    for (;;) {
      let popped = false;
      for (let k = stack.length - 1; k > 0; k--) {
        const open = stack[k];
        if (!open) break;
        if (AUTO_CLOSE[open.tag]?.includes(name)) {
          stack.length = k;
          popped = true;
          break;
        }
        if (BLOCK.has(open.tag)) break;
      }
      if (!popped) break;
    }

    const node = element(name, parseAttrs(attrText));
    top().children.push(node);

    if (RAW_TEXT.has(name)) {
      const close = new RegExp(`</${name}[^>]*>`, "ig");
      close.lastIndex = i;
      const found = close.exec(html);
      // The text inside is deliberately not kept: <style> and <script>
      // are dropped later anyway, and <title> is not prose.
      i = found ? close.lastIndex : html.length;
      continue;
    }
    if (!VOID.has(name) && !attrText.trimEnd().endsWith("/")) stack.push(node);
  }
  pushText();
  return root;
}

function parseAttrs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!text.trim()) return out;
  ATTR.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR.exec(text))) {
    const name = (match[1] ?? "").toLowerCase();
    if (!name) continue;
    let value = match[2] ?? "";
    if (value.startsWith('"') || value.startsWith("'")) value = value.slice(1, -1);
    out[name] = decodeEntities(value);
  }
  return out;
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", bull: "•",
  middot: "·", lsquo: "‘", rsquo: "’", ldquo: "“",
  rdquo: "”", laquo: "«", raquo: "»", copy: "©",
  reg: "®", trade: "™", deg: "°", times: "×",
  frac12: "½", eacute: "é", egrave: "è", agrave: "à",
  ccedil: "ç", uuml: "ü", ouml: "ö", auml: "ä",
  szlig: "ß", prime: "′", sbquo: "‚", dagger: "†",
};

function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (all, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1] === "x" || body[1] === "X"
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return all;
      try {
        return String.fromCodePoint(code);
      } catch {
        return all;
      }
    }
    // An unknown entity stays as written rather than becoming a mystery
    // character — "&foo;" in the source is "&foo;" in the manuscript.
    return ENTITIES[body.toLowerCase()] ?? all;
  });
}
