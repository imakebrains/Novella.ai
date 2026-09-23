/* ============================================================
   Reading RTF — just enough for manuscripts

   Scrivener keeps every scene as an RTF file, so importing a Scrivener
   project means reading RTF. Not the whole spec: the parts prose uses.
   Paragraphs, line breaks, tabs, italic and bold, and every way RTF
   spells a character (\'92 code-page escapes, 舗? Unicode with its
   fallback, \emdash and friends). Everything else — font tables,
   colours, stylesheets, pictures, headers, footnotes, Scrivener's own
   {\*\...} extensions — is skipped whole, rather than half-read into
   the book as stray text.

   Output is Markdown paragraphs, emphasis included, the same shape the
   .docx importer produces, so both flow into one chapter pipeline.
   ============================================================ */

/* Destinations whose contents are never prose. An unknown destination
   marked with \* is skipped too, which is RTF's own rule. "field" is
   deliberately absent: a hyperlink's visible words live in its
   \fldrslt, and only the \fldinst instruction beside them is noise. */
const SKIP = new Set([
  "fonttbl", "colortbl", "stylesheet", "info", "pict", "header", "headerl", "headerr", "headerf",
  "footer", "footerl", "footerr", "footerf", "footnote", "listtable", "listoverridetable",
  "revtbl", "rsidtbl", "generator", "xmlnstbl", "object", "fldinst", "themedata",
  "colorschememapping", "latentstyles", "datastore", "annotation", "atnid", "atnauthor",
]);

/* Windows-1252's 0x80–0x9F block, where it differs from Latin-1.
   Everything else in \'hh maps straight to the same code point. */
const CP1252: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡", 0x88: "ˆ", 0x89: "‰",
  0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•",
  0x96: "–", 0x97: "—", 0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›", 0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

const SYMBOL: Record<string, string> = {
  emdash: "—", endash: "–", lquote: "‘", rquote: "’", ldblquote: "“", rdblquote: "”", bullet: "•",
  tab: "\t", line: "\n", emspace: " ", enspace: " ", qmspace: " ", "~": " ", "-": "", _: "-",
};

interface State {
  bold: boolean;
  italic: boolean;
  skip: boolean;
  /** Characters to drop after a \u escape — the ANSI fallback (\ucN). */
  uc: number;
}

interface Piece {
  text: string;
  bold: boolean;
  italic: boolean;
}

/** PURE. RTF source to Markdown paragraphs (emphasis as *, **, ***). */
export function rtfToParagraphs(rtf: string): string[] {
  const paragraphs: Piece[][] = [];
  let current: Piece[] = [];
  const stack: State[] = [];
  let st: State = { bold: false, italic: false, skip: false, uc: 1 };
  let pendingSkip = 0;

  const emit = (text: string) => {
    if (st.skip || !text) return;
    if (pendingSkip > 0) {
      const drop = Math.min(pendingSkip, text.length);
      text = text.slice(drop);
      pendingSkip -= drop;
      if (!text) return;
    }
    const last = current[current.length - 1];
    if (last && last.bold === st.bold && last.italic === st.italic) last.text += text;
    else current.push({ text, bold: st.bold, italic: st.italic });
  };
  const endParagraph = () => {
    if (st.skip) return;
    paragraphs.push(current);
    current = [];
  };

  let i = 0;
  let groupStart = false;
  while (i < rtf.length) {
    const ch = rtf[i]!;
    if (ch === "{") {
      stack.push({ ...st });
      groupStart = true;
      i++;
      continue;
    }
    if (ch === "}") {
      st = stack.pop() ?? st;
      groupStart = false;
      pendingSkip = 0;
      i++;
      continue;
    }
    if (ch === "\\") {
      const next = rtf[i + 1] ?? "";
      // \* marks an ignorable destination: skip the whole group.
      if (next === "*") {
        st.skip = true;
        i += 2;
        continue;
      }
      if (next === "'") {
        const code = parseInt(rtf.slice(i + 2, i + 4), 16);
        if (!Number.isNaN(code)) emit(CP1252[code] ?? String.fromCharCode(code));
        i += 4;
        groupStart = false;
        continue;
      }
      if (next === "\\" || next === "{" || next === "}") {
        emit(next);
        i += 2;
        groupStart = false;
        continue;
      }
      if (next === "\n" || next === "\r") {
        // An escaped newline is a paragraph break in old writers.
        endParagraph();
        i += 2;
        continue;
      }
      if (!/[a-zA-Z]/.test(next)) {
        // Control symbols: \~ \- \_ and friends.
        if (next in SYMBOL) emit(SYMBOL[next]!);
        i += 2;
        groupStart = false;
        continue;
      }
      const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i + 1, i + 40));
      if (!m) {
        i++;
        continue;
      }
      const word = m[1]!;
      const arg = m[2] === undefined ? null : Number(m[2]);
      i += 1 + m[0].length;
      const wasGroupStart = groupStart;
      groupStart = false;

      if (wasGroupStart && SKIP.has(word)) {
        st.skip = true;
        continue;
      }
      switch (word) {
        case "par":
        case "sect":
        case "page":
          endParagraph();
          break;
        case "i":
          st.italic = arg !== 0;
          break;
        case "b":
          st.bold = arg !== 0;
          break;
        case "plain":
          st.bold = false;
          st.italic = false;
          break;
        case "uc":
          st.uc = arg ?? 1;
          break;
        case "u": {
          const code = arg === null ? 0 : arg < 0 ? arg + 65536 : arg;
          emit(String.fromCharCode(code));
          pendingSkip = st.uc;
          break;
        }
        default:
          if (word in SYMBOL) emit(SYMBOL[word]!);
      }
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      // Raw newlines in RTF source are formatting, not text.
      i++;
      continue;
    }
    groupStart = false;
    emit(ch);
    i++;
  }
  if (current.length) paragraphs.push(current);

  return paragraphs.map(toMarkdown).filter((p) => p.trim() !== "");
}

function toMarkdown(pieces: Piece[]): string {
  let out = "";
  for (const { text, bold, italic } of pieces) {
    const lead = text.match(/^\s*/)?.[0] ?? "";
    const tail = text.match(/\s*$/)?.[0] ?? "";
    let core = text.trim();
    if (core) {
      if (bold && italic) core = `***${core}***`;
      else if (bold) core = `**${core}**`;
      else if (italic) core = `*${core}*`;
    }
    out += lead + core + tail;
  }
  return out.replace(/[ \t]+/g, " ").trim();
}
