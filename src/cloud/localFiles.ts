/* ============================================================
   This device's copy of a book, as the sync engine sees it

   The engine's LocalFiles over one root of the RAW storage adapter —
   never the reporting wrapper, or every pulled file would queue itself
   to be pushed straight back (syncEngine.ts says the same from its
   side). Kept free of the vault store and the project registry so
   test-synchost.ts can drive it against MemoryStorage in node.
   ============================================================ */

import type { LocalFiles } from "./syncEngine";
import type { VaultStorage } from "../storage/adapter";

/** What the engine needs to know about the editor. An interface so the
    test can hand in a fake and the host can hand in the real store. */
export interface EditorView {
  /** The note open at this vault path, if the vault has one. */
  noteIdAt(path: string): string | undefined;
  isDirty(id: string): boolean;
  /** Write every unsaved note. */
  flush(): Promise<void>;
}

type WithReadFile = VaultStorage & { readFile?(root: string, relPath: string): Promise<Uint8Array | null> };

/** The text of a Markdown file, or null when its bytes aren't UTF-8.
    ignoreBOM keeps a leading byte-order mark IN the string, so the
    bytes read back later hash exactly as the server's copy does. */
function markdownText(path: string, bytes: Uint8Array): string | null {
  if (!path.toLowerCase().endsWith(".md")) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function localFilesFor(raw: VaultStorage, root: string, editor: EditorView | null): LocalFiles {
  const isDirty = (path: string): boolean => {
    const id = editor?.noteIdAt(path);
    return !!id && !!editor?.isDirty(id);
  };
  return {
    async read(path) {
      // Web and memory keep a note as text and answer readBytes only for
      // byte entries; the disk adapter's readBytes reads anything.
      const r = raw as WithReadFile;
      return typeof r.readFile === "function" ? r.readFile(root, path) : raw.readBytes(root, path);
    },

    async write(path, bytes) {
      // In the browser a note must land as TEXT: readAll lists only text
      // entries ending in .md, so a chapter pulled as bytes would be on
      // the device and invisible to the vault. Everything else lands as
      // bytes, because every .novella config is read back with readBytes.
      //
      // On desktop both calls write the same file, and writeBytes is the
      // right one for a note too: write() re-baselines the don't-clobber
      // check to the pulled text, so a stale copy still open in the editor
      // would then save straight over it. Through writeBytes the baseline
      // stays behind, and guardWrite adopts a clean note in place or asks
      // about an edited one — the existing conflict dialog.
      const text = raw.kind === "tauri" ? null : markdownText(path, bytes);
      if (text !== null) await raw.write(root, path, text);
      else await raw.writeBytes(root, path, bytes);
    },

    async remove(path) {
      await raw.remove(root, path);
    },

    async list() {
      // listFiles reads every byte to answer a path listing. One scan per
      // bind (and one per conflict) is the accepted cost for v1; a
      // path-only walk on the adapters is the optimisation if a big
      // research folder makes binding slow.
      return (await raw.listFiles(root)).map((f) => f.path);
    },

    isDirty,

    async flush(path) {
      // saveAll writes every dirty note, not just this one. Harmless — the
      // writer's words reach disk sooner — and the store has no
      // single-note save to call instead.
      if (editor && isDirty(path)) await editor.flush();
    },
  };
}
