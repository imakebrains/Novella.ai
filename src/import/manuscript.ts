import type { DocxParagraph } from "./docx";

/* ============================================================
   Turning someone else's manuscript into a vault

   The hard part isn't reading the file, it's guessing where the
   chapters are. Manuscripts arrive formatted every possible way:
   real Heading 1 styles, centered bold text, "CHAPTER SEVEN" in
   caps, or nothing but a page break. So detection is a stack of
   signals, strongest first, and the writer gets to correct the
   result before anything is written to disk.

   Everything here is pure — paragraphs in, chapters out — so it
   can be tested without a DOM or a filesystem.
   ============================================================ */

export interface ImportedChapter {
  title: string;
  body: string;
  order: number;
}

/** Lines that split scenes rather than chapters. Kept in the prose. */
const SCENE_BREAK = /^(\*\s*){3,}$|^#{1,3}$|^-{3,}$|^_{3,}$|^~{3,}$/;

const CHAPTER_WORD = /^\s*(chapter|part|book|prologue|epilogue|interlude|act)\b/i;

/** A heading-ish line: "Chapter Seven", "SEVEN", "7.", "VII" — the forms
    manuscripts actually use, with or without a real style applied. */
function looksLikeChapterTitle(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 60) return false;
  if (CHAPTER_WORD.test(t)) return true;
  if (/^\d{1,3}[.:)]?$/.test(t)) return true; // "7", "7."
  if (/^[ivxlc]{1,7}[.:)]?$/i.test(t)) return true; // roman numerals
  // ALL CAPS short line with no sentence punctuation.
  if (t === t.toUpperCase() && /[A-Z]/.test(t) && !/[.!?]$/.test(t) && t.length <= 40) return true;
  return false;
}

function isHeadingStyle(style: string): boolean {
  return /^(heading[12]|title|chaptertitle|ch)$/.test(style);
}

/** A chapter heading is usually styled bold or italic in the source. That
    emphasis is presentation, not content — carrying it into the title would
    produce chapters literally called "**Chapter One**". */
function cleanTitle(text: string): string {
  return text
    .replace(/^[*_~\s]+/, "")
    .replace(/[*_~\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split a flow of paragraphs into chapters. */
export function splitIntoChapters(paragraphs: DocxParagraph[]): ImportedChapter[] {
  const chapters: ImportedChapter[] = [];
  let title: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join("\n\n").trim();
    // A heading with nothing under it is a part divider, not a chapter;
    // dropping it silently would lose the writer's structure, so it is
    // folded into the next chapter's title instead.
    if (!title && !body) return;
    if (!body && title) {
      pendingPrefix = cleanTitle(title);
      title = null;
      buffer = [];
      return;
    }
    // Prose that arrives before any heading is a title page, epigraph or
    // dedication — not chapter one. Naming it "Chapter 1" would quietly
    // promote the front matter into the book.
    const fallback = sawBreak ? `Chapter ${chapters.length + 1}` : "Front matter";
    const full = pendingPrefix
      ? `${pendingPrefix} — ${cleanTitle(title ?? "Untitled")}`
      : title
        ? cleanTitle(title)
        : fallback;
    pendingPrefix = null;
    chapters.push({ title: full.trim() || fallback, body, order: chapters.length + 1 });
    title = null;
    buffer = [];
  };

  let pendingPrefix: string | null = null;
  // Whether any chapter boundary was actually recognized. Without this,
  // a manuscript with no detectable structure still yields one chapter
  // called "Chapter 1" — which claims a detection that never happened.
  let sawBreak = false;

  for (const p of paragraphs) {
    const text = p.text.trim();

    if (!text) {
      continue; // blank spacing paragraph
    }

    if (SCENE_BREAK.test(text)) {
      buffer.push("* * *");
      continue;
    }

    // A short line opening with "Chapter"/"Part"/"Prologue" is a boundary
    // wherever it appears — including as the very first line, which is the
    // usual shape of a plain-text manuscript.
    const isBreak =
      isHeadingStyle(p.style) ||
      ((p.centered || p.style.startsWith("heading")) && looksLikeChapterTitle(text)) ||
      (CHAPTER_WORD.test(text) && text.length <= 60);

    if (isBreak) {
      flush();
      title = text;
      sawBreak = true;
      continue;
    }

    buffer.push(text);
  }
  flush();

  // A heading at the very end with nothing under it. Mid-document that's a
  // part divider and folds into the next chapter's title, but here there is
  // no next chapter — so it's an empty chapter the writer made on purpose,
  // and discarding it would quietly delete part of their outline.
  if (pendingPrefix) {
    chapters.push({ title: pendingPrefix, body: "", order: chapters.length + 1 });
    pendingPrefix = null;
  }

  // Nothing looked like a chapter — keep it as one piece and say so, rather
  // than labelling it "Chapter 1" and implying we found a structure.
  if (!sawBreak) {
    const body = paragraphs.map((p) => p.text.trim()).filter(Boolean).join("\n\n");
    return body ? [{ title: "Imported manuscript", body, order: 1 }] : [];
  }
  return chapters;
}

/** Treat Markdown or plain text as paragraphs so it goes through the same
    splitter. Markdown headings become heading-styled paragraphs. */
export function textToParagraphs(text: string): DocxParagraph[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const out: DocxParagraph[] = [];
  for (const block of normalized.split(/\n{2,}/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      out.push({ text: heading[2]!.trim(), style: `heading${heading[1]!.length}`, centered: false });
      continue;
    }
    // A single-line block inside a plain-text manuscript may still be a
    // chapter marker; the splitter decides, this just preserves the shape.
    out.push({ text: trimmed.replace(/\n/g, " "), style: "normal", centered: false });
  }
  return out;
}

/** Filename-safe slug that keeps the running order visible on disk. */
export function chapterFilename(chapter: ImportedChapter): string {
  const slug =
    chapter.title
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "chapter";
  return `Manuscript/${String(chapter.order).padStart(2, "0")}-${slug}.md`;
}

/** The Markdown file for one imported chapter. */
export function chapterToMarkdown(chapter: ImportedChapter): string {
  const escaped = chapter.title.replace(/"/g, '\\"');
  return `---\ntype: chapter\nname: "${escaped}"\norder: ${chapter.order}\n---\n\n${chapter.body}\n`;
}
