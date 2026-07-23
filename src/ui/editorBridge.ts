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

/* Same problem, opposite direction: the editor's "/beat" slash command
   needs to open the Beats panel and focus its draft input. A beat can't
   be added as inline prose text — setBeats() scrubs blank entries, and a
   beat lives in note.data.beats, not the body — so the slash command
   hands off to whatever the mounted BeatsPanel registers here instead. */
let beatFocusFn: (() => void) | null = null;

export function registerBeatFocus(fn: (() => void) | null): void {
  beatFocusFn = fn;
}

export function focusBeatDraft(): boolean {
  if (!beatFocusFn) return false;
  beatFocusFn();
  return true;
}

/* And once more for renaming: "Rename" on a note's right-click menu
   opens the note and puts the cursor in the editable title — the title
   input IS the rename surface, this just walks you to it. */
let titleFocusFn: (() => void) | null = null;

export function registerTitleFocus(fn: (() => void) | null): void {
  titleFocusFn = fn;
}

export function focusEditorTitle(): boolean {
  if (!titleFocusFn) return false;
  titleFocusFn();
  return true;
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
