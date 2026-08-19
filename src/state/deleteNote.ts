import { showUndo } from "./undo";
import { openTrashPanel, retentionPromise, trashStore, type TrashReason } from "./trash";

/* Deleting a note touches more than the vault: board cards point at it,
   and the undo toast must put all of that back. One function owns the
   whole sequence so every surface (codex, boards, table) deletes the
   same way.

   The move itself lives in trash.ts, which writes the copy BEFORE the
   note leaves the vault. That changes what undo means here: it is no
   longer a snapshot held in a closure that dies with the toast, but a
   restore from a file on disk. Miss the toast and the note is still
   there, in the trash panel, for as long as the retention window says.

   Revision history is left alone on purpose: restoring the note finds
   its history intact, and an orphaned history file for a note that
   stays deleted is harmless — one more place the words survive. */

async function trashWithUndo(id: string, reason: TrashReason): Promise<void> {
  const result = await trashStore.moveToTrash(id, reason);
  if (!result.ok) {
    // The note is still in the vault — the move refused rather than
    // half-completing. An undo toast is the wrong shape for this (its
    // button would have nothing to undo), so the trash opens with the
    // reason on it and stays open until it's been read.
    openTrashPanel(result.error);
    return;
  }

  const entry = result.value;
  const verb = reason === "archived" ? "Archived" : "Deleted";
  showUndo(
    `${verb} “${entry.title}” — ${retentionPromise(trashStore.retention())}`,
    () => {
      void trashStore.restore(entry.entryId);
    },
  );
}

/** Delete a note: into the trash, undo offered, boards remembered. */
export async function deleteNoteWithUndo(id: string): Promise<void> {
  await trashWithUndo(id, "deleted");
}

/** Archive a note. Same machinery, different word — a writer filing a
    scene away is not doing the same thing as a writer throwing it out,
    and the trash panel says which one happened. */
export async function archiveNoteWithUndo(id: string): Promise<void> {
  await trashWithUndo(id, "archived");
}
