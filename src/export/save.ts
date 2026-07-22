import { isTauri } from "../storage";
import type { ExportResult } from "./formats";

/* Getting the finished file to the writer.

   Desktop opens a real save dialog so the book lands wherever they want.
   The browser falls back to a download, which is the only thing it can do
   without the File System Access API. */

export async function saveExport(result: ExportResult): Promise<string | null> {
  if (isTauri()) return saveViaTauri(result);
  saveViaDownload(result);
  return result.filename;
}

async function saveViaTauri(result: ExportResult): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const ext = result.filename.split(".").pop() ?? "txt";

  const path = await save({
    defaultPath: result.filename,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (!path) return null; // cancelled

  // The app's filesystem scope covers the vault folder only, so an export
  // saved anywhere else would be refused. Widen it to exactly this file.
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("allow_export_file", { path });

  const { writeTextFile, writeFile } = await import("@tauri-apps/plugin-fs");
  if (typeof result.data === "string") {
    await writeTextFile(path, result.data);
  } else {
    await writeFile(path, result.data);
  }
  return path;
}

function saveViaDownload(result: ExportResult): void {
  const blob =
    typeof result.data === "string"
      ? new Blob([result.data], { type: `${result.mime};charset=utf-8` })
      : // Copy into a fresh buffer: some bundlers hand back a view over a
        // larger pool, and Blob would otherwise capture the whole thing.
        new Blob([new Uint8Array(result.data)], { type: result.mime });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick; revoking immediately can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
