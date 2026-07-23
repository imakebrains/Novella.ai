import { zipSync } from "fflate";
import { storage } from "../storage";
import { store } from "../state/vaultStore";
import { projectStore } from "../state/projects";
import { saveExport } from "./save";
import { backupFilename } from "./backupName";

export { backupFilename } from "./backupName";

/* ============================================================
   Full-project backup

   One click, one .zip, everything: the manuscript, the codex, and
   the whole .novella folder — history, covers, plot threads, agents,
   boards. A writer's protection against every disaster autosave
   can't cover: a dying disk, a stolen laptop, a cleared browser
   profile, or their own catastrophic find-and-replace.

   The zip restores by simple extraction — unzip it anywhere and
   "Open a folder" (or re-import on web) brings the whole project
   back. No proprietary container, no companion tool, in keeping
   with the exit-hatch promise: leaving Novella must always be easy,
   including leaving it for a backup.
   ============================================================ */

export interface BackupResult {
  filename: string;
  fileCount: number;
  bytes: number;
  /** Where it landed (desktop path), or null when the save was cancelled. */
  savedTo: string | null;
}

/** Zip the open project and hand it to the writer. */
export async function backupProject(): Promise<BackupResult> {
  const root = store.vaultRoot();
  const backing = storage();

  // Memory storage ignores the root; everything else needs one.
  if (root === null && backing.kind !== "memory") {
    throw new Error("No project is open, so there is nothing to back up.");
  }

  const files = await backing.listFiles(root ?? "");
  if (files.length === 0) {
    throw new Error("The project has no files yet — nothing to back up.");
  }

  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f.path] = f.bytes;

  // Level 6 is the sweet spot: prose compresses ~70% and the whole zip of
  // a full novel still builds in well under a second.
  const zipped = zipSync(entries, { level: 6 });

  const name = projectStore.active()?.name ?? "project";
  const filename = backupFilename(name);
  const savedTo = await saveExport({
    filename,
    data: zipped,
    mime: "application/zip",
  });

  return { filename, fileCount: files.length, bytes: zipped.length, savedTo };
}
