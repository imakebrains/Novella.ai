import { store } from "./vaultStore";
import { boardStore } from "./boards";
import { showUndo } from "./undo";

/* Deleting a note touches more than the vault: board cards point at it,
   and the undo toast must put all of that back. One function owns the
   whole sequence so every surface (codex, boards, table) deletes the
   same way.

   Revision history is left alone on purpose: restoring the note finds
   its history intact, and an orphaned history file for a note that
   stays deleted is harmless — one more place the words survive. */

export async function deleteNoteWithUndo(id: string): Promise<void> {
  const memberships = boardStore
    .all()
    .filter((b) => b.noteIds.includes(id))
    .map((b) => b.id);

  const snapshot = await store.deleteNote(id);
  if (!snapshot) return;
  for (const boardId of memberships) boardStore.removeNote(boardId, id);

  showUndo(`Deleted “${snapshot.note.title}”`, () => {
    store.restoreNote(snapshot);
    for (const boardId of memberships) boardStore.addNote(boardId, id);
  });
}
