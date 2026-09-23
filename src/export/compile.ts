import { store } from "../state/vaultStore";
import { stripWikiLinks } from "../ai/context";
import { bylineOf, profileStore } from "../state/profile";
import { countWords } from "../analysis/prose";
import { SCENE_BREAK, isSceneBreak, plainText } from "./inline";

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

/** PURE. A chapter body as export paragraphs.

    Emphasis markers are KEPT — each format renders them (inline.ts);
    stripping them here is how every export used to lose its italics.
    Scene breaks are recognised before heading markers are removed,
    because a lone `#` is the manuscript-format scene break and the
    heading rule would otherwise eat it. Breaks at the very start or
    end of a chapter, or doubled up, carry no meaning and are dropped. */
export function toParagraphs(body: string): string[] {
  const blocks = stripWikiLinks(body)
    // Notes to self never belong in a manuscript.
    .replace(/<!--[\s\S]*?-->/g, "")
    // [text](url) reads as its text in prose.
    .replace(/(?<!!)\[([^\]\n]+)\]\([^)\s]+\)/g, "$1")
    // A break line typed flush against prose is still its own block.
    .replace(/^[ \t]*(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:~[ \t]*){3,}|#|§)[ \t]*$/gm, "\n$&\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) =>
      isSceneBreak(p)
        ? SCENE_BREAK
        : p
            .replace(/^#{1,6}\s+/gm, "")
            .replace(/\s*\n\s*/g, " ")
            .trim(),
    )
    .filter(Boolean);

  const out: string[] = [];
  for (const p of blocks) {
    if (p === SCENE_BREAK && (out.length === 0 || out[out.length - 1] === SCENE_BREAK)) continue;
    out.push(p);
  }
  while (out[out.length - 1] === SCENE_BREAK) out.pop();
  return out;
}

/** PURE. Words in export paragraphs: markup and scene breaks excluded. */
export function paragraphWords(paragraphs: string[]): number {
  return paragraphs.reduce((n, p) => (p === SCENE_BREAK ? n : n + countWords(plainText(p))), 0);
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
        words: paragraphWords(paragraphs),
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
