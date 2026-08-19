import type { ProjectPreset } from "../seed/presets";

/* What a project preset actually looks like, derived from the files it
   would really create.

   The intro shows this as a small demonstration beside each choice, so
   "The Big Book" isn't a name you have to trust — you can see the shape
   of the folder before you commit to it. Derived, never hand-written:
   if a preset gains a file, the demonstration gains a row. */

export interface PreviewRow {
  /** Folder name, or "" for files at the project root. */
  folder: string;
  /** Display names of the first few files in that folder. */
  items: string[];
  /** How many more the folder holds beyond `items`. */
  more: number;
}

export interface PresetPreview {
  rows: PreviewRow[];
  chapters: number;
  codex: number;
  /** A line of real prose or prompt text from the preset, if it has one. */
  taste: string | null;
}

const MAX_ROWS = 3;
const MAX_ITEMS = 3;

/** "Manuscript/Act-1/02-What-The-Archivist-Kept.md" → "What The Archivist Kept" */
export function prettyName(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base
    .replace(/\.md$/i, "")
    .replace(/^\d+[-_ ]*/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

/** The folder a file lives in, one level deep — deeper nesting rolls up
    so the demonstration stays a glance, not a file browser. */
function topFolder(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts[0]! : "";
}

/** First non-frontmatter, non-empty line — the preset's own voice. */
function firstProseLine(contents: string): string | null {
  const body = contents.replace(/^---[\s\S]*?---\n?/, "");
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("- [ ]")) continue;
    return line.length > 90 ? `${line.slice(0, 88).trimEnd()}…` : line;
  }
  return null;
}

export function previewOf(preset: ProjectPreset): PresetPreview {
  const byFolder = new Map<string, string[]>();
  for (const [path] of preset.files) {
    const folder = topFolder(path);
    const list = byFolder.get(folder) ?? [];
    list.push(prettyName(path));
    byFolder.set(folder, list);
  }

  const rows: PreviewRow[] = [...byFolder.entries()]
    .slice(0, MAX_ROWS)
    .map(([folder, items]) => ({
      folder,
      items: items.slice(0, MAX_ITEMS),
      more: Math.max(0, items.length - MAX_ITEMS),
    }));

  let chapters = 0;
  let codex = 0;
  let taste: string | null = null;
  for (const [, contents] of preset.files) {
    const type = /^type:\s*(\w+)/m.exec(contents)?.[1];
    if (type === "chapter" || type === "scene") chapters++;
    else if (type && type !== "note") codex++;
    if (!taste) taste = firstProseLine(contents);
  }

  return { rows, chapters, codex, taste };
}

/** One honest line under the demonstration: what you actually get. */
export function previewSummary(p: PresetPreview): string {
  const bits: string[] = [];
  if (p.chapters) bits.push(`${p.chapters} chapter${p.chapters === 1 ? "" : "s"}`);
  if (p.codex) bits.push(`${p.codex} codex entr${p.codex === 1 ? "y" : "ies"}`);
  return bits.length ? bits.join(" · ") : "An empty page";
}
