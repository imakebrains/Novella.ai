/* ============================================================
   Take everything with you

   One zip of every book in the cloud account, each in its own folder
   exactly as it lives on disk, plus the writer's synced settings and a
   note saying what's inside. "Leaving stays easy" was a promise in the
   local-only design (PLAN-sync.md); an account must not quietly break
   it. Built on the writer's own device from files they can already
   read, so no server ever assembles a copy of their work.

   The pure half is here (naming, layout, the zip). Fetching the files
   uses the same RemoteFiles the sync engine uses, so a file that
   downloads intact for sync downloads intact for this.
   ============================================================ */

import { strToU8, zipSync } from "fflate";
import type { RemoteFiles } from "./syncEngine";
import { sha256Hex } from "./syncEngine";

export interface ArchiveBook {
  name: string;
  files: { path: string; bytes: Uint8Array }[];
}

/** PURE. A book name that is safe as a folder on Windows, macOS and
    Linux, and unique among `taken` (case-insensitively, since two of
    those three filesystems are). */
export function bookFolder(name: string, taken: Set<string>): string {
  let base = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 80)
    .trim();
  if (!base || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)) base = `Book ${base}`.trim();
  let candidate = base;
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) candidate = `${base} (${i})`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

/** PURE. The archive's bytes. */
export function buildAccountArchive(books: ArchiveBook[], settings: unknown, exportedAt: Date): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  const taken = new Set<string>();
  const lines: string[] = [];
  for (const book of books) {
    const folder = bookFolder(book.name, taken);
    lines.push(`- ${folder}/ (${book.files.length} file${book.files.length === 1 ? "" : "s"})`);
    for (const f of book.files) entries[`${folder}/${f.path}`] = f.bytes;
  }
  entries["settings.json"] = strToU8(JSON.stringify(settings ?? {}, null, 2));
  entries["README.txt"] = strToU8(
    [
      "Everything in your Novella cloud account.",
      `Exported ${exportedAt.toISOString()}.`,
      "",
      "Each folder is one book, exactly as Novella keeps it: Markdown files",
      "with a small header, plus a .novella folder for covers, boards and",
      "history. Open a folder in Novella with Open folder, or read the files",
      "in any text editor.",
      "",
      ...lines,
      "",
      "settings.json holds the preferences that followed you between devices.",
      "API keys were never stored in the cloud, so none are in here.",
    ].join("\n"),
  );
  return zipSync(entries, { level: 6 });
}

/** Every live file of one book, verified against its hash — the same
    check the sync engine makes, so a damaged download fails loudly. */
export async function fetchBook(remote: RemoteFiles): Promise<{ path: string; bytes: Uint8Array }[]> {
  const latest = new Map<string, { deleted: boolean; content: string | null; blobKey: string | null; sha256: string }>();
  for (let since = 0; ; ) {
    const page = await remote.pull(since);
    for (const f of page.files) {
      latest.set(f.path, f);
      since = Math.max(since, f.seq);
    }
    if (!page.more || page.files.length === 0) break;
  }
  const out: { path: string; bytes: Uint8Array }[] = [];
  for (const [path, f] of latest) {
    if (f.deleted) continue;
    const bytes = f.content !== null ? strToU8(f.content) : f.blobKey ? await remote.getBlob(f.blobKey) : null;
    if (!bytes) continue;
    if ((await sha256Hex(bytes)) !== f.sha256) {
      throw new Error(`${path} didn't download intact. Nothing was saved; try the export again.`);
    }
    out.push({ path, bytes });
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
