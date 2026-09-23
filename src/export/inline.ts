/* ============================================================
   Inline formatting for export

   A chapter is Markdown, so *never* and **back** reach the exporter as
   asterisks. Until this module existed every format wrote them out
   literally: the DOCX an agent opened, the EPUB a reader bought and the
   printed PDF all said "*never*". Italics carry meaning in fiction —
   thought, emphasis, a ship's name — so losing them is a correctness
   bug, not a cosmetic one.

   This is deliberately not a Markdown renderer. It understands the
   three things prose actually uses (italic, bold, both), backslash
   escapes, and the scene-break line, and leaves every other character
   exactly as typed. A stray asterisk with nothing to close it stays an
   asterisk; "5 * 3" is arithmetic, and snake_case is a word.
   ============================================================ */

export interface Run {
  text: string;
  italic: boolean;
  bold: boolean;
}

/* Private-use sentinels. They cannot come from a writer's keyboard in
   any normal way, and anything that somehow carries one is scrubbed
   first so it can't toggle formatting. */
const B_OPEN = "";
const B_CLOSE = "";
const I_OPEN = "";
const I_CLOSE = "";
const ESC_STAR = "";
const ESC_UNDER = "";
const SENTINELS = /[-]/g;

/* Underscores only count at a word boundary: `_word_` is emphasis,
   `snake_case_name` is not. Asterisks may sit inside a word
   ("un*frigging*believable"), as in CommonMark. */
const PATTERNS: { re: RegExp; open: string; close: string }[] = [
  { re: /\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, open: B_OPEN + I_OPEN, close: I_CLOSE + B_CLOSE },
  { re: /(?<![\p{L}\p{N}])___(?=\S)([\s\S]*?\S)___(?![\p{L}\p{N}])/gu, open: B_OPEN + I_OPEN, close: I_CLOSE + B_CLOSE },
  { re: /\*\*(?=\S)([\s\S]*?\S)\*\*/g, open: B_OPEN, close: B_CLOSE },
  { re: /(?<![\p{L}\p{N}])__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}])/gu, open: B_OPEN, close: B_CLOSE },
  { re: /\*(?=[^\s*])([\s\S]*?[^\s*])\*/g, open: I_OPEN, close: I_CLOSE },
  { re: /(?<![\p{L}\p{N}_])_(?=[^\s_])([\s\S]*?[^\s_])_(?![\p{L}\p{N}_])/gu, open: I_OPEN, close: I_CLOSE },
];

/** PURE. One paragraph of Markdown prose as formatted runs.

    Adjacent runs never share the same formatting, and no run is empty,
    so callers can map runs to output nodes one to one. */
export function parseInline(paragraph: string): Run[] {
  let s = paragraph
    .replace(SENTINELS, "")
    .replace(/\\\*/g, ESC_STAR)
    .replace(/\\_/g, ESC_UNDER);

  for (const { re, open, close } of PATTERNS) {
    s = s.replace(re, (_m, inner: string) => `${open}${inner}${close}`);
  }

  const runs: Run[] = [];
  let bold = 0;
  let italic = 0;
  let text = "";
  const flush = () => {
    if (!text) return;
    const run: Run = { text: text.replace(new RegExp(ESC_STAR, "g"), "*").replace(new RegExp(ESC_UNDER, "g"), "_"), italic: italic > 0, bold: bold > 0 };
    const last = runs[runs.length - 1];
    if (last && last.italic === run.italic && last.bold === run.bold) last.text += run.text;
    else runs.push(run);
    text = "";
  };
  for (const ch of s) {
    if (ch === B_OPEN || ch === B_CLOSE || ch === I_OPEN || ch === I_CLOSE) {
      flush();
      if (ch === B_OPEN) bold++;
      else if (ch === B_CLOSE) bold = Math.max(0, bold - 1);
      else if (ch === I_OPEN) italic++;
      else italic = Math.max(0, italic - 1);
    } else {
      text += ch;
    }
  }
  flush();
  return runs;
}

/** PURE. The paragraph's words with every formatting mark removed —
    for word counts, and for formats that can't carry emphasis. */
export function plainText(paragraph: string): string {
  return parseInline(paragraph)
    .map((r) => r.text)
    .join("");
}

/** The one spelling of a scene break a compiled manuscript uses. */
export const SCENE_BREAK = "* * *";

/** PURE. Is this paragraph a scene break? Writers type `***`, `* * *`,
    `---`, `___`, `~~~` or a lone `#`; all of them mean the same thing,
    and none of them is prose to be indented or counted. */
export function isSceneBreak(paragraph: string): boolean {
  const t = paragraph.trim();
  return /^(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,}|(?:~\s*){3,}|#|§)$/.test(t);
}

const escHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** PURE. Runs as escaped HTML/XHTML — <em> and <strong>, nothing else.
    Safe for both EPUB (XHTML) and the print window. */
export function runsToHtml(runs: Run[]): string {
  return runs
    .map((r) => {
      let out = escHtml(r.text);
      if (r.italic) out = `<em>${out}</em>`;
      if (r.bold) out = `<strong>${out}</strong>`;
      return out;
    })
    .join("");
}
