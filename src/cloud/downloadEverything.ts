/* ============================================================
   "Download everything" — the network half of archive.ts

   Pulls every book in the account through the same RemoteFiles the
   sync engine uses (so a file that syncs intact exports intact), adds
   the synced settings document, zips it on this device and hands it to
   the ordinary export save. No server ever assembles a copy.

   The device label on SupabaseProjectFiles only matters for pushes;
   this never pushes, so "export" is a name and nothing more.
   ============================================================ */

import type { SupabaseClient } from "@supabase/supabase-js";
import { saveExport } from "../export/save";
import { buildAccountArchive, fetchBook, type ArchiveBook } from "./archive";
import { archiveFilename, type CloudUser } from "./authCore";
import { SupabaseProjectFiles, listProjects } from "./supabaseRemote";

/** The saved path (desktop), the filename (browser download), or null
    when the writer cancelled the save dialog. */
export async function downloadEverything(
  client: SupabaseClient,
  user: CloudUser,
  onProgress?: (line: string) => void,
): Promise<string | null> {
  const projects = await listProjects(client);
  const books: ArchiveBook[] = [];
  for (const [i, p] of projects.entries()) {
    onProgress?.(`Fetching ${p.name} (${i + 1} of ${projects.length})…`);
    books.push({ name: p.name, files: await fetchBook(new SupabaseProjectFiles(client, user.id, p.id, "export")) });
  }

  // Settings are a nicety beside the books. If they can't be read the
  // archive still goes out, and its README already says what
  // settings.json is for.
  let settings: unknown = {};
  try {
    const { data } = await client.from("user_settings").select("doc").maybeSingle();
    settings = (data as { doc?: unknown } | null)?.doc ?? {};
  } catch {
    settings = {};
  }

  onProgress?.("Packing the zip…");
  const now = new Date();
  const bytes = buildAccountArchive(books, settings, now);
  return saveExport({ filename: archiveFilename(now), data: bytes, mime: "application/zip" });
}
