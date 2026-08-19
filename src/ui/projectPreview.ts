import { prettyName } from "./presetPreview";

/* ============================================================
   What a project looks like from the outside

   The projects screen used to ask a writer to commit blind: the
   card showed a name, a folder path, and cover art — then clicking
   it swapped the entire vault. Six months away from a draft and
   "novel-2" tells you nothing.

   This module derives a SLIDESHOW of that project from its own
   files: its cover, the opening of its first chapter, the codex it
   carries, and a count of what's inside. Nothing here is invented.
   Every frame is skipped when the project has nothing real to put
   in it — an empty chapter file shows no prose frame rather than a
   polite placeholder pretending there's a book.

   Everything in this file is PURE. It takes a list of paths (and,
   for the two or three files worth reading, their text) and returns
   frames. That's deliberate:

     * a preview must never cost what an OPEN costs. planReads()
       names the handful of files the slideshow will actually
       display, so the caller reads those and nothing else — the
       counts come from the file list, which is free.
     * pure means testable without a filesystem, a DOM, or a vault.

   Path classification mirrors inferType() in core/vault.ts, which
   isn't exported and which this file must not reach into. It is
   deliberately more forgiving here: guessing wrong in the vault
   mislabels a note, guessing wrong here only shows a slightly odd
   preview, so we cast a wider net over the folder names writers
   actually use (Manuscript/, Book-1/, Act-2/, Chapters/).
   ============================================================ */

/* ---------- limits ----------
   These are the whole safety story. The slideshow reads at most
   1 + MAX_CODEX_READS files no matter how large the project is. */

/** Codex entries we open far enough to quote a line from. */
export const MAX_CODEX_READS = 3;
/** Codex entries we NAME. Names come from the file list, so they're free. */
export const MAX_CODEX_ENTRIES = 6;
/** Paragraphs of the opening we show. */
export const OPENING_PARAGRAPHS = 3;
/** Total characters of prose in the opening frame. */
export const OPENING_CHARS = 460;
/** Characters of the one-line taste under a codex entry. */
export const CODEX_LINE_CHARS = 110;
/** Below this much remaining budget, stop rather than show a stub. */
const MIN_PARAGRAPH_CHARS = 60;

/* ---------- frames ---------- */

export type FrameKind = "cover" | "opening" | "codex" | "stats";

export interface CoverFrame {
  kind: "cover";
  /** A real cover only — data URL from the project's own .novella/cover.jpg.
      Generated placeholder art is not content, so it never earns a frame. */
  image: string;
}

export interface OpeningFrame {
  kind: "opening";
  /** The chapter's own name (frontmatter first, filename second). */
  title: string;
  path: string;
  /** First paragraphs, already truncated to preview length. */
  paragraphs: string[];
  /** Words in the whole chapter, not just what's shown. */
  words: number;
  /** True when there is more chapter than the frame shows. */
  truncated: boolean;
}

export interface CodexEntry {
  title: string;
  /** "Character", "Location", "Lore"… — display label, never invented. */
  kind: string;
  /** One real line from the entry, or null when we didn't read it. */
  line: string | null;
}

export interface CodexFrame {
  kind: "codex";
  entries: CodexEntry[];
  /** How many the project holds in total, including ones not listed. */
  total: number;
}

export interface StatsFrame {
  kind: "stats";
  chapters: number;
  codex: number;
  notes: number;
  /** Every Markdown file in the vault, whatever we managed to classify it as. */
  files: number;
  /** Words in the opening chapter — the only file we actually counted.
      A whole-vault word count would mean reading the whole vault. */
  openingWords: number | null;
}

export type PreviewFrame = CoverFrame | OpeningFrame | CodexFrame | StatsFrame;

/* ---------- path classification ---------- */

/** Folders that hold prose. Numbered book/act/part folders included —
    a series project keeps its manuscripts in Book-1/, not Manuscript/. */
const PROSE_DIR =
  /(^|\/)(manuscript|manuscripts|chapters?|drafts?|scenes?|prose|book[-_ ]?\d+|act[-_ ]?\d+|part[-_ ]?\d+)\//i;

/** Folders that hold the story bible. */
const CODEX_DIR =
  /(^|\/)(codex|characters?|locations?|places|settings?|lore|world|worldbuilding|factions?|objects?|items?)\//i;

/** Folders that hold thinking rather than the book. */
const NOTE_DIR = /(^|\/)(notes?|research|outlines?|planning|plan|scratch)\//i;

/** A numbered file — "01-Chapter-One.md". Writers who keep a flat vault
    still order it this way, so it's the fallback for "this is a chapter". */
const NUMBERED_FILE = /(^|\/)\d+[-_. ]/;

/** Vault content: Markdown, and not inside a dotfolder. Mirrors the rule
    every storage adapter already applies, so previews and opens agree on
    what counts as "the book". */
export function isVaultFile(path: string): boolean {
  if (!/\.md$/i.test(path)) return false;
  return !path.startsWith(".") && !path.includes("/.");
}

export function isCodexPath(path: string): boolean {
  return isVaultFile(path) && CODEX_DIR.test(path);
}

export function isNotePath(path: string): boolean {
  return isVaultFile(path) && !isCodexPath(path) && NOTE_DIR.test(path);
}

export function isProsePath(path: string): boolean {
  if (!isVaultFile(path) || isCodexPath(path) || isNotePath(path)) return false;
  return PROSE_DIR.test(path) || NUMBERED_FILE.test(path);
}

/** Natural order, so 2 comes before 10 and "Act-1" before "Act-2". */
export function comparePaths(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** The Markdown files of a vault, in reading order. */
export function vaultFiles(paths: readonly string[]): string[] {
  return paths.filter(isVaultFile).sort(comparePaths);
}

/** Where the book starts: the first prose file in reading order. */
export function openingPath(paths: readonly string[]): string | null {
  return vaultFiles(paths).find(isProsePath) ?? null;
}

const KIND_LABEL: Record<string, string> = {
  character: "Character",
  location: "Location",
  place: "Location",
  setting: "Location",
  lore: "Lore",
  world: "Lore",
  faction: "Faction",
  object: "Object",
  item: "Object",
};

/** A codex entry's label. The file's own `type:` wins when we read the
    file; otherwise the folder name says it, which is why writers put
    things in folders. Unknown types are shown as written rather than
    forced into one of ours — a vault may have `type: ship`. */
export function codexKindOf(path: string, raw?: string): string {
  const declared = raw ? frontMatterField(raw, "type") : null;
  if (declared) {
    const key = declared.toLowerCase().replace(/s$/, "");
    return KIND_LABEL[key] ?? declared.charAt(0).toUpperCase() + declared.slice(1);
  }
  for (const part of path.toLowerCase().split("/").slice(0, -1).reverse()) {
    const key = part.replace(/s$/, "");
    if (KIND_LABEL[key]) return KIND_LABEL[key]!;
  }
  return "Codex";
}

/** Characters first, then places, then everything else — the order a
    writer wants to be reminded of a project in. */
const KIND_ORDER = ["Character", "Location", "Lore", "Faction", "Object"];

/** Unknown kinds sort last rather than first — indexOf's -1 would put a
    vault's oddball `type: ship` ahead of its protagonist. */
function kindRank(path: string): number {
  const at = KIND_ORDER.indexOf(codexKindOf(path));
  return at === -1 ? KIND_ORDER.length : at;
}

export function codexPaths(paths: readonly string[]): string[] {
  return vaultFiles(paths)
    .filter(isCodexPath)
    .sort((a, b) => kindRank(a) - kindRank(b) || comparePaths(a, b));
}

/* ---------- text ---------- */

/** Frontmatter block, tolerant of CRLF and of an empty block. Preview
    parsing is deliberately regex-thin rather than a real YAML parse: a
    malformed file must produce a plain-looking frame, never an exception
    that takes the projects screen down with it. */
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n?---[ \t]*\r?\n?/;

export function stripFrontmatter(raw: string): string {
  return raw.replace(FRONT_MATTER, "").trim();
}

/** One frontmatter field, unquoted. `field` is always a literal from this
    file — never writer input — so building a RegExp from it is safe. */
export function frontMatterField(raw: string, field: string): string | null {
  const block = FRONT_MATTER.exec(raw)?.[1];
  if (!block) return null;
  const m = new RegExp(`^${field}[ \\t]*:[ \\t]*(.+)$`, "im").exec(block);
  const value = m?.[1]?.trim().replace(/^["']|["']$/g, "").trim();
  return value ? value : null;
}

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Cut prose to a length without cutting a word in half. */
export function truncateProse(text: string, maxChars: number): string {
  const t = text.trim();
  if (maxChars <= 1) return "…";
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars);
  const space = cut.lastIndexOf(" ");
  // Keep at least half the budget: a long unbroken string shouldn't
  // collapse the whole excerpt to an ellipsis.
  const body = space > maxChars / 2 ? cut.slice(0, space) : cut;
  return `${body.replace(/[\s,;:.\-–—]+$/, "")}…`;
}

/** The opening paragraphs of a file, headings and checklists dropped —
    those are scaffolding, and a preview should show writing. */
export function openingParagraphs(
  raw: string,
  maxParagraphs = OPENING_PARAGRAPHS,
  maxChars = OPENING_CHARS,
): string[] {
  const body = stripFrontmatter(raw);
  if (!body) return [];

  const out: string[] = [];
  let budget = maxChars;
  for (const block of body.split(/\r?\n[ \t]*\r?\n/)) {
    const para = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(
        (line) =>
          line &&
          !/^#{1,6}\s/.test(line) && // heading
          !/^([-*_])\1{2,}$/.test(line) && // horizontal rule
          !/^[-*]\s*\[[ xX]\]/.test(line), // task list
      )
      .join(" ")
      .trim();
    if (!para) continue;
    // A few characters left is not a paragraph. Stopping short reads as a
    // deliberate excerpt; a three-word stub reads as a bug.
    if (budget < MIN_PARAGRAPH_CHARS) break;

    const shown = truncateProse(para, budget);
    out.push(shown);
    budget -= shown.length;
    if (out.length >= maxParagraphs) break;
  }
  return out;
}

/** One real line from a file — the codex entry's own voice. */
export function firstLine(raw: string, maxChars = CODEX_LINE_CHARS): string | null {
  return openingParagraphs(raw, 1, maxChars)[0] ?? null;
}

/* ---------- the plan: what is worth reading ---------- */

export interface ReadPlan {
  /** The one prose file the slideshow quotes, if the project has prose. */
  opening: string | null;
  /** Codex files we open far enough to quote. Capped, never the whole codex. */
  codex: string[];
  /** Everything to read, deduped — the caller needs no other list. */
  reads: string[];
}

/** Which files a project must be read from to build its slideshow.
    Bounded by construction: at most 1 + MAX_CODEX_READS. */
export function planReads(paths: readonly string[]): ReadPlan {
  const opening = openingPath(paths);
  const codex = codexPaths(paths).slice(0, MAX_CODEX_READS);
  const reads = [...new Set([...(opening ? [opening] : []), ...codex])];
  return { opening, codex, reads };
}

/* ---------- the frames ---------- */

export interface FrameInput {
  /** Every path in the vault. Cheap to obtain; nothing here is read. */
  paths: readonly string[];
  /** The project's real cover, or null. Null skips the cover frame. */
  cover: string | null;
  /** Text of the files that were actually read, keyed by path. Files that
      failed to read are simply absent — a preview degrades, never breaks. */
  contents: ReadonlyMap<string, string>;
}

export function buildFrames(input: FrameInput): PreviewFrame[] {
  const files = vaultFiles(input.paths);
  const frames: PreviewFrame[] = [];

  if (input.cover) frames.push({ kind: "cover", image: input.cover });

  const opening = openingFrame(files, input.contents);
  if (opening) frames.push(opening);

  const codex = codexFrame(files, input.contents);
  if (codex) frames.push(codex);

  const stats = statsFrame(files, opening?.words ?? null);
  if (stats) frames.push(stats);

  return frames;
}

function openingFrame(
  files: readonly string[],
  contents: ReadonlyMap<string, string>,
): OpeningFrame | null {
  const path = openingPath(files);
  if (!path) return null;
  const raw = contents.get(path);
  // Unread (a failed read) or empty (a scaffolded chapter nobody has
  // written yet) both mean the same thing: there is no prose to show.
  if (!raw) return null;

  const paragraphs = openingParagraphs(raw);
  if (paragraphs.length === 0) return null;

  const body = stripFrontmatter(raw);
  const words = countWords(body);
  return {
    kind: "opening",
    title: frontMatterField(raw, "name") ?? frontMatterField(raw, "title") ?? prettyName(path),
    path,
    paragraphs,
    words,
    truncated: words > countWords(paragraphs.join(" ")),
  };
}

function codexFrame(
  files: readonly string[],
  contents: ReadonlyMap<string, string>,
): CodexFrame | null {
  const all = codexPaths(files);
  if (all.length === 0) return null;

  const entries: CodexEntry[] = all.slice(0, MAX_CODEX_ENTRIES).map((path) => {
    const raw = contents.get(path);
    return {
      title: (raw && frontMatterField(raw, "name")) || prettyName(path),
      kind: codexKindOf(path, raw),
      line: raw ? firstLine(raw) : null,
    };
  });
  return { kind: "codex", entries, total: all.length };
}

function statsFrame(files: readonly string[], openingWords: number | null): StatsFrame | null {
  if (files.length === 0) return null;
  return {
    kind: "stats",
    chapters: files.filter(isProsePath).length,
    codex: files.filter(isCodexPath).length,
    notes: files.filter(isNotePath).length,
    files: files.length,
    openingWords,
  };
}

/** What a frame is called — dot labels, screen readers, and tests. */
export function frameLabel(frame: PreviewFrame): string {
  switch (frame.kind) {
    case "cover":
      return "Cover";
    case "opening":
      return frame.title;
    case "codex":
      return "Codex";
    case "stats":
      return "At a glance";
  }
}
