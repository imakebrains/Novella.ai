import { useEffect, useState } from "react";
import {
  RETENTION_CHOICES,
  closeTrashPanel,
  isTrashPanelOpen,
  normalizeRetention,
  openTrashPanel,
  remainingLabel,
  retentionLabel,
  subscribeTrashPanel,
  trashStore,
  useTrash,
  useTrashPanel,
  type TrashEntry,
} from "../state/trash";
import { relativeTime } from "./diff";

/* The trash: what was deleted or archived, how long it has left, and the
   two doors out — back into the book, or gone for good.

   Reached from the right-click menu on any note, which is where a writer
   who just deleted something is already looking. It is a modal rather
   than a pane because it is a place you visit, not a place you work.

   No confirm() anywhere: this webview suppresses dialogs, so a confirm
   silently returns false and the button looks broken. Destructive
   actions arm on the first click and fire on the second. */

export function TrashModal({ onClose }: { onClose: () => void }) {
  const { entries, retention } = useTrash();
  const { error: openError } = useTrashPanel();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const now = Date.now();

  /* Expiry is evaluated here and when a project opens — the two moments
     a writer could see a stale list. Nothing runs on a timer. */
  useEffect(() => {
    void trashStore.sweep();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const restore = async (entry: TrashEntry) => {
    setBusy(entry.entryId);
    setError(null);
    try {
      const result = await trashStore.restore(entry.entryId);
      if (!result.ok) setError(result.error);
    } finally {
      setBusy(null);
    }
  };

  const shown = error ?? openError;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal trash-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Trash</h2>
          <button className="icon-btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <p className="hint">
            Deleted and archived notes wait here instead of disappearing. They keep
            their place in the book — restoring one puts it back at its original path,
            board pins and all.
          </p>

          <div className="trash-toolbar">
            <label className="trash-retention">
              <span>Delete for good after</span>
              <select
                className="field-select"
                value={String(retention)}
                onChange={(e) => {
                  const raw = e.target.value;
                  void trashStore.setRetention(
                    normalizeRetention(raw === "keep" ? "keep" : Number(raw)),
                  );
                }}
                aria-label="How long the trash keeps things"
              >
                {RETENTION_CHOICES.map((choice) => (
                  <option key={String(choice)} value={String(choice)}>
                    {retentionLabel(choice)}
                  </option>
                ))}
              </select>
            </label>

            {entries.length > 0 && (
              <ArmedButton
                className="btn-ghost danger"
                label="Empty the trash"
                armedLabel={`Really delete all ${entries.length} for good? Click again`}
                title="Permanently deletes everything listed here, plus any loose copies left in .novella/trash by older versions. This one cannot be undone."
                onFire={() => {
                  setError(null);
                  void trashStore.empty();
                }}
              />
            )}
          </div>

          {shown && <div className="notice error-notice">{shown}</div>}

          {entries.length === 0 ? (
            <div className="empty-state">
              <span className="empty-glyph" aria-hidden>
                ⌫
              </span>
              <p className="empty-line">Nothing in the trash.</p>
              <p className="empty-line muted">
                Right-click any note to archive or delete it. It lands here first, and
                nothing is removed from your folder until the window above runs out or
                you empty it yourself.
              </p>
            </div>
          ) : (
            <ul className="trash-list">
              {entries.map((entry) => (
                <li key={entry.entryId} className="trash-row">
                  <div className="trash-row-main">
                    <span className="trash-title">{entry.title}</span>
                    <span className="trash-path" title={entry.path}>
                      {entry.path}
                    </span>
                  </div>

                  <div className="trash-meta">
                    <span className="trash-when">
                      {entry.reason === "archived" ? "Archived" : "Deleted"}{" "}
                      {relativeTime(entry.trashedAt, now)} · {entry.words.toLocaleString()}w
                    </span>
                    <span className="trash-left">{remainingLabel(entry, retention, now)}</span>
                  </div>

                  <div className="trash-actions">
                    <button
                      className="btn-ghost"
                      disabled={busy !== null}
                      title={`Put it back at ${entry.path}`}
                      onClick={() => void restore(entry)}
                    >
                      {busy === entry.entryId ? "Restoring…" : "Restore"}
                    </button>
                    <ArmedButton
                      className="btn-ghost danger"
                      label="Delete for good"
                      armedLabel="Really? Click again"
                      title="Removes the copy from your folder. This cannot be undone."
                      disabled={busy !== null}
                      onFire={() => {
                        setError(null);
                        void trashStore.purge(entry.entryId);
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="hint modal-footnote">
            Copies live in your project folder under <code>.novella/trash</code>, so they
            travel with the book and can be recovered by hand if you ever need to.
          </p>
        </div>
      </div>
    </div>
  );
}

/* Two clicks instead of a confirm() dialog — the same pattern the history
   panel uses. The armed state disarms itself after a few seconds so a
   forgotten button can't fire on a stray later click. */
function ArmedButton({
  className,
  label,
  armedLabel,
  title,
  disabled,
  onFire,
}: {
  className: string;
  label: string;
  armedLabel: string;
  title?: string;
  disabled?: boolean;
  onFire: () => void;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      className={`${className} ${armed ? "armed" : ""}`}
      disabled={disabled}
      title={title}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onFire();
      }}
    >
      {armed ? armedLabel : label}
    </button>
  );
}

/* ============================================================
   Mounting

   One line in App.tsx — <TrashHost /> beside <UndoToastHost /> — is the
   proper home for this. Until that line exists the panel would open into
   nowhere, so the first request mounts its own root. The fallback checks
   for a real host first and only ever runs once, so wiring App.tsx later
   costs nothing and changes nothing.
   ============================================================ */

let hostCount = 0;
let fallbackMounted = false;

export function TrashHost() {
  const { open } = useTrashPanel();

  useEffect(() => {
    hostCount++;
    return () => {
      hostCount--;
    };
  }, []);

  if (!open) return null;
  return <TrashModal onClose={closeTrashPanel} />;
}

function mountFallbackHost(): void {
  if (hostCount > 0 || fallbackMounted) return;
  if (typeof document === "undefined") return;
  fallbackMounted = true;
  const node = document.createElement("div");
  node.className = "trash-host";
  document.body.appendChild(node);
  // Dynamic so a test or a headless import never drags react-dom in.
  void import("react-dom/client").then(({ createRoot }) => {
    createRoot(node).render(<TrashHost />);
  });
}

subscribeTrashPanel(() => {
  if (isTrashPanelOpen()) mountFallbackHost();
});

/** Open the trash. The one call sites should use. */
export function openTrash(): void {
  openTrashPanel(null);
}
