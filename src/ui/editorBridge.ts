/* A tiny bridge so panels outside the editor can put text into it.

   The Assistant needs to insert generated prose at the cursor. Going
   through the vault store instead would not work: the store updates
   note.body, but CodeMirror only rebuilds its document when the active
   note *changes*, so the new text would not appear until you navigated
   away and back. The editor registers its own insert function here. */

import { snapshotById } from "../state/history";
import { store } from "../state/vaultStore";

type InsertFn = (text: string) => void;

let insertFn: InsertFn | null = null;

export function registerEditorInsert(fn: InsertFn | null): void {
  insertFn = fn;
}

export function editorReady(): boolean {
  return insertFn !== null;
}

/** Insert at the cursor. Returns false if no editor is mounted.

    Every path that lets the assistant write into the manuscript comes
    through here, which makes it the one place a "before the AI" revision
    has to be taken. The snapshot reads the current text synchronously
    before the insert lands, so it genuinely records the earlier version. */
export function insertIntoEditor(text: string): boolean {
  if (!insertFn) return false;
  const id = store.activeIdOrUndefined();
  if (id) void snapshotById(id, "before the assistant added prose");
  insertFn(text);
  return true;
}
