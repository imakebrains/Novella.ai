import { useEffect, useState } from "react";
import { store } from "../state/vaultStore";
import { clearDraft, pendingRecovery, type Draft } from "../state/autosave";

/* Offers back work that a crash or force-quit would have eaten.

   Checked once at startup, before the writer touches anything, so a
   recovered draft can never overwrite edits made in this session. */

export function RecoveryBanner() {
  const [found, setFound] = useState<{ id: string; draft: Draft }[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setFound(pendingRecovery());
  }, []);

  if (dismissed || found.length === 0) return null;

  const restoreAll = () => {
    for (const { id, draft } of found) {
      // A draft for a note that no longer exists can't be restored in
      // place; skip rather than silently inventing a file.
      if (!store.vault.get(id)) continue;
      store.setBody(id, draft.body);
    }
    setDismissed(true);
  };

  const discardAll = () => {
    for (const { id } of found) clearDraft(id);
    setDismissed(true);
  };

  const newest = found.reduce((t, f) => Math.max(t, f.draft.savedAt), 0);
  const when = newest ? new Date(newest).toLocaleString() : "an earlier session";

  return (
    <div className="banner recovery">
      <strong>Unsaved work found.</strong>
      <span>
        {found.length} {found.length === 1 ? "note has" : "notes have"} changes from {when} that
        never reached disk
        {found.length <= 3 && (
          <> — {found.map((f) => f.draft.title).join(", ")}</>
        )}
        .
      </span>
      <button className="banner-action" onClick={restoreAll}>
        Restore
      </button>
      <button className="banner-action muted" onClick={discardAll}>
        Discard
      </button>
    </div>
  );
}
