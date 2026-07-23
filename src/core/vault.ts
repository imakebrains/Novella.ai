import matter from "gray-matter";

/* ============================================================
   Novella vault engine
   The "writing brain": a folder of Markdown files becomes a
   linked database. Files are the source of truth; this builds
   the in-memory index (links, backlinks, search, graph) on top.
   ============================================================ */

export type NoteType =
  | "character" | "location" | "lore" | "faction" | "object"
  | "chapter" | "scene" | "note" | (string & {});

export interface Note {
  id: string;                          // stable id (from frontmatter or path)
  path: string;                        // relative path in the vault
  type: NoteType;
  title: string;                       // display name
  aliases: string[];                   // alternate names that also resolve links
  tags: string[];
  data: Record<string, unknown>;       // all other frontmatter (age, role, POV…)
  body: string;                        // the prose / notes below the frontmatter
}

const norm = (s: string) => s.trim().toLowerCase();
const slug = (s: string) =>
  s.trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");

/** Parse a raw Markdown file (with frontmatter) into a Note. */
export function parseNote(path: string, raw: string): Note {
  const { data, content } = matter(raw);
  const title =
    (data.name as string) || (data.title as string) || fileTitle(path);
  return {
    id: (data.id as string) || slug(title),
    path,
    type: (data.type as NoteType) || inferType(path),
    title,
    aliases: toArray(data.aliases),
    tags: toArray(data.tags),
    data,
    body: content.trim(),
  };
}

/** Serialize a Note back to a Markdown file string. */
export function serializeNote(n: Note): string {
  const fm: Record<string, unknown> = {
    ...n.data,
    id: n.id,
    type: n.type,
    name: n.title,
  };
  if (n.aliases.length) fm.aliases = n.aliases;
  if (n.tags.length) fm.tags = n.tags;
  return matter.stringify("\n" + n.body + "\n", fm);
}

/** Pull [[wiki-links]] and [[target|alias]] out of any text. */
export function extractWikiLinks(text: string): string[] {
  const out: string[] = [];
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const name = m[1];
    if (name) out.push(name.trim());
  }
  return out;
}

/** Recursively collect wiki-links from any frontmatter value. */
function linksInData(v: unknown): string[] {
  if (typeof v === "string") return extractWikiLinks(v);
  if (Array.isArray(v)) return v.flatMap(linksInData);
  if (v && typeof v === "object") return Object.values(v).flatMap(linksInData);
  return [];
}

/** All links a note makes — from its prose AND its frontmatter fields. */
export function linksOf(note: Note): string[] {
  return [...extractWikiLinks(note.body), ...linksInData(note.data)];
}

export interface Backlink { note: Note; count: number; }
export interface GraphEdge { from: string; to: string; }

/** The live index over all notes in a vault. */
export class Vault {
  private notes = new Map<string, Note>();       // id -> note
  private resolve = new Map<string, string>();   // normalized title/alias -> id

  add(note: Note) {
    this.notes.set(note.id, note);
    this.resolve.set(norm(note.title), note.id);
    for (const a of note.aliases) this.resolve.set(norm(a), note.id);
  }

  /** Forget a note. Only resolve entries that still point at it are
      dropped — a later note may have claimed the same title. */
  remove(id: string) {
    if (!this.notes.delete(id)) return;
    for (const [key, val] of this.resolve)
      if (val === id) this.resolve.delete(key);
  }

  all(): Note[] { return [...this.notes.values()]; }
  get(id: string): Note | undefined { return this.notes.get(id); }
  byType(type: NoteType): Note[] { return this.all().filter((n) => n.type === type); }

  /** Resolve a [[link text]] to a real note, honoring aliases. */
  resolveLink(text: string): Note | undefined {
    const id = this.resolve.get(norm(text));
    return id ? this.notes.get(id) : undefined;
  }

  /** Every note that links to `target`, with mention counts. */
  backlinksOf(target: Note): Backlink[] {
    const result: Backlink[] = [];
    for (const n of this.all()) {
      if (n.id === target.id) continue;
      const count = linksOf(n).filter(
        (l) => this.resolveLink(l)?.id === target.id
      ).length;
      if (count > 0) result.push({ note: n, count });
    }
    return result.sort((a, b) => b.count - a.count);
  }

  /** The relationship graph: one edge per resolved link. */
  graph(): GraphEdge[] {
    const edges: GraphEdge[] = [];
    for (const n of this.all())
      for (const link of linksOf(n)) {
        const to = this.resolveLink(link);
        if (to) edges.push({ from: n.id, to: to.id });
      }
    return edges;
  }

  /** Find unresolved links — names referenced but not yet created. */
  danglingLinks(): string[] {
    const missing = new Set<string>();
    for (const n of this.all())
      for (const link of linksOf(n))
        if (!this.resolveLink(link)) missing.add(link);
    return [...missing];
  }

  /** Simple full-text search across titles, tags, and bodies. */
  search(query: string): Note[] {
    const q = norm(query);
    return this.all().filter(
      (n) =>
        norm(n.title).includes(q) ||
        n.tags.some((t) => norm(t).includes(q)) ||
        norm(n.body).includes(q)
    );
  }
}

/* ---------- helpers ---------- */
function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") return [v];
  return [];
}
function fileTitle(path: string): string {
  return (path.split("/").pop() || path).replace(/\.md$/i, "").replace(/-/g, " ");
}
function inferType(path: string): NoteType {
  const p = path.toLowerCase();
  if (p.includes("/characters/")) return "character";
  if (p.includes("/locations/")) return "location";
  if (p.includes("/lore/")) return "lore";
  if (p.includes("/manuscript/")) return "chapter";
  return "note";
}
