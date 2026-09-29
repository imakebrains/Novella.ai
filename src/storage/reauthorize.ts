/* Re-granting a remembered vault, now that the scope is gated in Rust.

   allow_vault only widens the fs scope to folders a native picker has
   returned (src-tauri/src/known_vaults.rs). Every project remembered
   before that record existed was picked by the old JS dialog, so on the
   first launch after the update allow_vault refuses them all — and
   App.tsx's launch reopen would fall through to the seed world, which
   looks exactly like the writer's book has gone.

   Trusting the webview's project list to seed the record would put the
   hole straight back, so the migration is the writer's own hand: a refused
   project re-opens the picker already standing in that folder, one click
   confirms it, and it is remembered from then on. Kept out of
   tauriStorage.ts so the decision logic runs in node with a fake bridge. */

/** The Tauri bridge's shape, narrowed to what this needs. */
export type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

/** A phrase from allow_vault's refusal in src-tauri/src/lib.rs. The two
    are checked against each other by test-vaultscope.ts, because a
    rewording on one side would silently turn the re-confirm off. */
export const UNCHOSEN_FOLDER = "isn't a folder you chose with the folder picker";

export function isUnchosenFolderRefusal(err: unknown): boolean {
  const text = typeof err === "string" ? err : err instanceof Error ? err.message : "";
  return text.includes(UNCHOSEN_FOLDER);
}

/** grantAccess for the Tauri adapter: allow_vault, and on the one refusal
    that a confirmation can fix, a confirmation.

    Confirmations are queued, never concurrent. Launch, a banner write and
    a preview can all ask for the same unconfirmed root at once, and two
    OS dialogs stacked on each other is a bug report. The queued call
    re-tries allow_vault before asking, since the confirmation ahead of it
    may already have covered its root. A cancelled or mismatched pick
    rejects with the original refusal, whose text tells the writer where
    to go instead. */
export function vaultGranter(invoke: Invoke): (root: string) => Promise<void> {
  let queue: Promise<unknown> = Promise.resolve();

  const confirm = async (root: string, refusal: unknown): Promise<void> => {
    try {
      await invoke("allow_vault", { path: root });
      return;
    } catch (err) {
      if (!isUnchosenFolderRefusal(err)) throw err;
    }
    const picked = await invoke("pick_vault_folder", { defaultPath: root });
    if (typeof picked !== "string") throw refusal;
    // Rust decides whether the pick covers this root — it compares
    // canonical paths, which string equality here could not.
    await invoke("allow_vault", { path: root });
  };

  return async (root: string): Promise<void> => {
    try {
      await invoke("allow_vault", { path: root });
      return;
    } catch (err) {
      if (!isUnchosenFolderRefusal(err)) throw err;
      const turn = queue.then(() => confirm(root, err));
      queue = turn.catch(() => undefined);
      await turn;
    }
  };
}
