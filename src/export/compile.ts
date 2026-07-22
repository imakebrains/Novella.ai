import { store } from "../state/vaultStore";
import { stripWikiLinks } from "../ai/context";
import { bylineOf, profileStore } from "../state/profile";
import { countWords } from "../analysis/prose";

/* Turning a vault into a manuscript.

   Chapters come out in board order (the `order` frontmatter number), not
   filename order, so what you arranged on the corkboard is what gets
   exported. Wiki-link syntax is stripped — [[Halden's Reach]] is a tool
   for the writer, not something an agent should ever see. */

export interface CompiledChapter {
  title: string;
  paragraphs: string[];
  words: number;
}

export interface Manuscript {
  title: string;
  author: string;
  chapters: CompiledChapter[];
  words: number;
}

export interface CompileOptions {
  title?: string;
  author?: string;
  /** Leave out chapters with no prose — useful when half the book is beats. */
  skipEmpty?: boolean;
}

/** A sensible default book title: the vault folder, else the first chapter. */
export function defaultTitle(): string {
  const root = store.vaultRoot();
  if (root) {
    const leaf = root.split(/[\\/]/).filter(Boolean).pop();
    if (leaf) return leaf.replace(/[-_]+/g, " ");
  }
  return "Untitled Manuscript";
}

function toParagraphs(body: string): string[] {
  return stripWikiLinks(body)
    // Markdown emphasis and headings don't belong in exported prose.
    .replace(/^#{1,6}\s+/gm, "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

export function compileManuscript(opts: CompileOptions = {}): Manuscript {
  const profile = profileStore.get();

  const chapters = store
    .orderedChapters()
    .map((note) => {
      const paragraphs = toParagraphs(note.body);
      return {
        title: note.title,
        paragraphs,
        words: paragraphs.reduce((n, p) => n + countWords(p), 0),
      };
    })
    .filter((c) => (opts.skipEmpty ? c.paragraphs.length > 0 : true));

  return {
    title: opts.title?.trim() || defaultTitle(),
    author: opts.author?.trim() || bylineOf(profile),
    chapters,
    words: chapters.reduce((n, c) => n + c.words, 0),
  };
}
