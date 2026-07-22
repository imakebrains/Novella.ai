import { unzipSync, strFromU8 } from "fflate";

/* ============================================================
   Reading .docx

   A .docx is a zip with an XML document inside. We already ship
   fflate for EPUB export, so reading one needs no new dependency —
   and going through the raw XML is actually the point: chapter
   splitting depends on paragraph STYLES ("Heading 1", "Title"),
   which a plain docx-to-text converter throws away.

   Only what a manuscript needs is read: paragraphs, their style,
   and bold/italic runs. Tables, images, footnotes and comments are
   deliberately ignored rather than half-supported.
   ============================================================ */

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export interface DocxParagraph {
  text: string;
  /** The Word style name, lowercased — "heading1", "title", "normal". */
  style: string;
  /** True when the whole paragraph is centered; a common chapter-title cue
      in manuscripts that never applied a real heading style. */
  centered: boolean;
}

/** Pull the paragraphs out of a .docx file's bytes. */
export function readDocx(bytes: Uint8Array): DocxParagraph[] {
  const files = unzipSync(bytes);
  const doc = files["word/document.xml"];
  if (!doc) {
    throw new Error("That doesn't look like a Word document — no document.xml inside.");
  }

  const xml = new DOMParser().parseFromString(strFromU8(doc), "application/xml");
  if (xml.getElementsByTagName("parsererror").length > 0) {
    throw new Error("That Word document appears to be damaged.");
  }

  const out: DocxParagraph[] = [];
  for (const p of Array.from(xml.getElementsByTagNameNS(W_NS, "p"))) {
    const text = paragraphText(p);
    const style = (attr(first(p, "pStyle"), "val") ?? "normal").toLowerCase().replace(/\s+/g, "");
    const centered = attr(first(p, "jc"), "val") === "center";
    // Blank paragraphs are spacing, not content — but a run of them may be
    // a scene break, so keep one marker rather than dropping them silently.
    out.push({ text, style, centered });
  }
  return out;
}

/** Concatenate a paragraph's runs, preserving emphasis as Markdown. */
function paragraphText(p: Element): string {
  let out = "";
  for (const r of Array.from(p.getElementsByTagNameNS(W_NS, "r"))) {
    let run = "";
    for (const node of Array.from(r.childNodes)) {
      const el = node as Element;
      if (el.namespaceURI !== W_NS) continue;
      if (el.localName === "t") run += el.textContent ?? "";
      else if (el.localName === "tab") run += "\t";
      else if (el.localName === "br") run += "\n";
    }
    if (!run) continue;

    // Emphasis is applied to the trimmed run so the markers sit against
    // the words: " word " must become " *word* ", not "* word *".
    const bold = has(r, "b");
    const italic = has(r, "i");
    const lead = run.match(/^\s*/)?.[0] ?? "";
    const tail = run.match(/\s*$/)?.[0] ?? "";
    let core = run.trim();
    if (core) {
      if (bold && italic) core = `***${core}***`;
      else if (bold) core = `**${core}**`;
      else if (italic) core = `*${core}*`;
    }
    out += lead + core + tail;
  }
  return out.replace(/[ \t]+/g, " ").trim();
}

function first(parent: Element, local: string): Element | null {
  return parent.getElementsByTagNameNS(W_NS, local)[0] ?? null;
}

function attr(el: Element | null, local: string): string | null {
  if (!el) return null;
  return el.getAttributeNS(W_NS, local) ?? el.getAttribute(`w:${local}`);
}

/** True when a run carries a toggle property like <w:b/> that isn't
    explicitly switched off with val="0". */
function has(run: Element, local: string): boolean {
  const props = first(run, "rPr");
  if (!props) return false;
  for (const child of Array.from(props.children)) {
    if (child.namespaceURI === W_NS && child.localName === local) {
      const v = attr(child as Element, "val");
      return v !== "0" && v !== "false";
    }
  }
  return false;
}
