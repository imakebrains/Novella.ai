/* ============================================================
   Importing a Scrivener project

   A .scriv "file" is a folder: one .scrivx XML binder that holds the
   structure and titles, and one RTF file per document holding the
   words. Scrivener 3 keeps a document at Files/Data/<UUID>/content.rtf;
   Scrivener 2 kept it at Files/Docs/<ID>.rtf. Both are read.

   How the binder becomes a book, chosen so a Scrivener writer's own
   structure survives without anyone re-arranging it:

   - Only the Draft (Manuscript) folder is the book. Research becomes
     notes; Trash is left behind.
   - A text document directly in the Draft is a chapter.
   - A folder in the Draft is a chapter; the documents inside it are
     its scenes, joined with a scene break, which is how nearly every
     Scrivener novel is laid out.
   - A folder holding folders is a part: each inner folder becomes a
     chapter titled "Part One — Chapter Three", the same convention the
     .docx importer uses for part dividers.
   - "Include in Compile" switched off means the writer already said
     this isn't the book. Those are skipped, and counted, so the
     preview can say so.

   Pure: a map of paths to bytes in, chapters and notes out. The folder
   picker or zip reader that produces the map lives with the UI.
   ============================================================ */

import { rtfToParagraphs } from "./rtf";
import type { ImportedChapter } from "./manuscript";

export interface ScrivenerNote {
  title: string;
  body: string;
}

export interface ScrivenerImport {
  title: string;
  chapters: ImportedChapter[];
  notes: ScrivenerNote[];
  /** Documents left out because "Include in Compile" was off. */
  excluded: number;
  /** Documents the binder lists whose text file wasn't found. */
  missing: number;
}

interface Item {
  id: string;
  type: string;
  title: string;
  include: boolean;
  children: Item[];
}

const SCENE = "* * *";

function childElements(el: Element, name?: string): Element[] {
  return (Array.from(el.childNodes) as Element[]).filter((n) => n.nodeType === 1 && (!name || n.localName === name || n.nodeName === name));
}

function readItem(el: Element): Item {
  const title = childElements(el, "Title")[0]?.textContent?.trim() ?? "";
  const meta = childElements(el, "MetaData")[0];
  const includeText = meta ? childElements(meta, "IncludeInCompile")[0]?.textContent?.trim() : undefined;
  const kids = childElements(el, "Children")[0];
  return {
    id: el.getAttribute("UUID") || el.getAttribute("ID") || "",
    type: el.getAttribute("Type") || "",
    title,
    include: includeText === undefined ? true : !/^no$/i.test(includeText),
    children: kids ? childElements(kids, "BinderItem").map(readItem) : [],
  };
}

/** PURE. Read a Scrivener project from its files, keyed by path. Paths
    may include the project folder itself ("Novel.scriv/…") or not. */
export function readScrivener(files: Record<string, Uint8Array>): ScrivenerImport {
  const scrivx = Object.keys(files).find((p) => /\.scrivx$/i.test(p) && !p.split("/").some((part) => part.startsWith(".")));
  if (!scrivx) throw new Error("That doesn't look like a Scrivener project: there's no .scrivx file inside.");
  const root = scrivx.includes("/") ? scrivx.slice(0, scrivx.lastIndexOf("/") + 1) : "";
  const projectTitle = scrivx.slice(root.length).replace(/\.scrivx$/i, "");

  const xml = new DOMParser().parseFromString(new TextDecoder("utf-8").decode(files[scrivx]!), "application/xml");
  if (xml.getElementsByTagName("parsererror").length > 0) {
    throw new Error("That Scrivener project's binder is damaged and can't be read.");
  }
  const binder = xml.getElementsByTagName("Binder")[0];
  if (!binder) throw new Error("That Scrivener project has no binder.");
  const top = childElements(binder, "BinderItem").map(readItem);

  const decoder = new TextDecoder("windows-1252");
  let missing = 0;
  let excluded = 0;
  const textOf = (item: Item): string[] | null => {
    const bytes = files[`${root}Files/Data/${item.id}/content.rtf`] ?? files[`${root}Files/Docs/${item.id}.rtf`];
    if (!bytes) return null;
    return rtfToParagraphs(decoder.decode(bytes));
  };

  /* Every paragraph under an item, depth first, with a scene break
     between documents that both have words. */
  const gather = (item: Item, into: string[]) => {
    if (!item.include) {
      excluded++;
      return;
    }
    const own = textOf(item);
    if (own === null && item.type === "Text") missing++;
    if (own && own.length) {
      if (into.length && into[into.length - 1] !== SCENE) into.push(SCENE);
      into.push(...own);
    }
    for (const child of item.children) gather(child, into);
  };

  const chapters: ImportedChapter[] = [];
  const add = (title: string, paragraphs: string[]) => {
    const body = paragraphs.join("\n\n").trim();
    chapters.push({ title: title || `Chapter ${chapters.length + 1}`, body, order: chapters.length + 1 });
  };

  const draft = top.find((t) => t.type === "DraftFolder");
  for (const item of draft?.children ?? []) {
    if (!item.include) {
      excluded++;
      continue;
    }
    const innerFolders = item.children.filter((c) => c.type === "Folder");
    if (item.type === "Folder" && innerFolders.length > 0) {
      // A part. Its own text and loose documents become a chapter named
      // for the part; each inner folder is a chapter under it.
      const loose: string[] = [];
      const own = textOf(item);
      if (own) loose.push(...own);
      for (const child of item.children.filter((c) => c.type !== "Folder")) gather(child, loose);
      if (loose.length) add(item.title, loose);
      for (const folder of innerFolders) {
        if (!folder.include) {
          excluded++;
          continue;
        }
        const paras: string[] = [];
        gather(folder, paras);
        add(`${item.title} — ${folder.title}`, paras);
      }
      continue;
    }
    const paras: string[] = [];
    gather(item, paras);
    add(item.title, paras);
  }

  const notes: ScrivenerNote[] = [];
  const research = top.find((t) => t.type === "ResearchFolder");
  const collect = (item: Item) => {
    if (item.type === "Text") {
      const paras = textOf(item);
      if (paras && paras.length) notes.push({ title: item.title || "Research note", body: paras.join("\n\n") });
    }
    item.children.forEach(collect);
  };
  research?.children.forEach(collect);

  return { title: projectTitle, chapters, notes, excluded, missing };
}
