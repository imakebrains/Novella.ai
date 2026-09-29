/* ============================================================
   Why the vault is being replaced

   store.onVaultReplaced fires for opening a project AND for a cloud
   pull reloading the same one. Most hooks want both (a pulled
   boards.json must reset the board cache). A few mean "the writer just
   opened this book" — the "When Novella opens" agents above all, which
   spend the writer's AI budget — and a pull every minute is not that.

   A module of its own so those hooks can ask without importing the
   cloud code, and the cloud code can say so without vaultStore
   growing a parameter.
   ============================================================ */

let syncReloading = false;

/** True while a cloud pull is reloading the vault already open. */
export function isSyncReload(): boolean {
  return syncReloading;
}

/** Run a reload marked as a sync reload. The hooks run synchronously
    inside ingest, so the flag only has to span the call. */
export async function asSyncReload<T>(fn: () => Promise<T>): Promise<T> {
  syncReloading = true;
  try {
    return await fn();
  } finally {
    syncReloading = false;
  }
}
