import { useCallback, useEffect, useState } from "react";
import { useActiveProject, useProjects, type Project } from "../state/projects";
import { relativeTime } from "../ui/diff";
import { listProjects, type CloudProject } from "./supabaseRemote";
import { describeCloudError } from "./wire";
import { localProjectFor } from "./bindingMap";
import { cloudAccess, confirmHeldDeletions, installSyncHost } from "./syncHost";
import { BindingError, bindProject, openCloudProject, switchTo, unbindProject, useBindings } from "./projectBinding";
import { statusText, useSyncStatus } from "./syncStatus";

type Listing =
  | { kind: "loading" }
  | { kind: "off" }
  | { kind: "signed-out" }
  | { kind: "error"; message: string }
  | { kind: "ready"; books: CloudProject[] };

/* Settings → Account: which books are in the cloud, which are here,
   and the three doors between them. Mounted by the Account tab; it
   finds the client through syncHost's cloudAccess(), so it works the
   moment sign-in has handed that over and says so plainly before. */
export function CloudBooksSection() {
  const [listing, setListing] = useState<Listing>({ kind: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bindings = useBindings();
  const projects = useProjects();
  const active = useActiveProject();
  const status = useSyncStatus();

  const load = useCallback(async () => {
    const access = cloudAccess();
    const client = access ? await access.client() : null;
    if (!client) {
      setListing({ kind: "off" });
      return;
    }
    try {
      const { data } = await client.auth.getSession();
      if (!data.session) {
        setListing({ kind: "signed-out" });
        return;
      }
      setListing({ kind: "ready", books: await listProjects(client) });
    } catch (err) {
      setListing({ kind: "error", message: describeCloudError(err).message });
    }
  }, []);

  useEffect(() => {
    installSyncHost();
    void load();
    return cloudAccess()?.onAuthChange?.(() => void load());
  }, [load]);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      // Our own sentences pass through; anything from the server is
      // turned into one, never shown raw.
      setError(err instanceof BindingError ? err.message : describeCloudError(err).message);
    } finally {
      setBusy(null);
    }
  };

  if (listing.kind === "loading") return <p className="hint">Looking for your cloud books…</p>;
  if (listing.kind === "off") return <p className="hint">Cloud sync isn't available in this build.</p>;
  if (listing.kind === "signed-out") return <p className="hint">Sign in above to see the books in your cloud account.</p>;
  if (listing.kind === "error") return <p className="cloud-books-error">{listing.message}</p>;

  const cloudIds = new Set(listing.books.map((b) => b.id));
  const unsynced = projects.filter((p): p is Project & { path: string } => !!p.path && !bindings[p.id]);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const held = status.heldDeletions.length;

  return (
    <div className="cloud-books">
      <h3>In your cloud account</h3>
      {listing.books.length === 0 && <p className="hint">Nothing synced yet. Choose a book below to start.</p>}
      {listing.books.map((book) => {
        const localId = localProjectFor(bindings, book.id);
        const local = localId ? byId.get(localId) : undefined;
        const isActive = !!local && local.id === active?.id;
        const updated = Date.parse(book.updatedAt);
        return (
          <div className="cloud-book-row" key={book.id}>
            <span className="cloud-book-name">{book.name}</span>
            <span className="cloud-book-meta">
              {Number.isFinite(updated) ? `updated ${relativeTime(updated)}` : ""}
            </span>
            <span className="cloud-book-actions">
              {isActive && local ? (
                <>
                  <span className={`sync-status ${status.state}`}>{statusText(status) ?? ""}</span>
                  <button className="btn-ghost" disabled={!!busy} onClick={() => void act("Stopping…", () => unbindProject(local.id))}>
                    Stop syncing
                  </button>
                </>
              ) : local ? (
                <>
                  <button className="btn-ghost" disabled={!!busy} onClick={() => void act(`Opening ${local.name}…`, () => switchTo(local))}>
                    Open here
                  </button>
                  <button className="btn-ghost" disabled={!!busy} onClick={() => void act("Stopping…", () => unbindProject(local.id))}>
                    Stop syncing
                  </button>
                </>
              ) : (
                <button
                  className="btn-ghost"
                  disabled={!!busy}
                  onClick={() => void act(`Bringing ${book.name} to this device…`, () => openCloudProject(book))}
                >
                  Open here
                </button>
              )}
            </span>
          </div>
        );
      })}

      <h3>On this device</h3>
      {unsynced.length === 0 ? (
        <p className="hint">Every book on this device is syncing.</p>
      ) : (
        unsynced.map((p) => (
          <div className="cloud-book-row" key={p.id}>
            <span className="cloud-book-name">{p.name}</span>
            <span className="cloud-book-actions">
              <button className="btn-ghost" disabled={!!busy} onClick={() => void act(`Syncing ${p.name}…`, () => bindProject(p))}>
                Sync this book
              </button>
            </span>
          </div>
        ))
      )}
      {/* A binding whose cloud book is gone (deleted on another device)
          is not listed above; say so rather than leave it invisible. */}
      {Object.entries(bindings)
        .filter(([pid, b]) => byId.has(pid) && !cloudIds.has(b.cloudProjectId))
        .map(([pid]) => (
          <div className="cloud-book-row" key={`gone-${pid}`}>
            <span className="cloud-book-name">{byId.get(pid)?.name}</span>
            <span className="cloud-book-meta">no longer in your cloud account</span>
            <span className="cloud-book-actions">
              <button className="btn-ghost" disabled={!!busy} onClick={() => void act("Stopping…", () => unbindProject(pid))}>
                Stop syncing
              </button>
            </span>
          </div>
        ))}

      <p className="hint">
        Opening a cloud book on the desktop asks for a folder — pick an empty one. Files already in it are synced
        too, and any with the same name as the cloud's become conflict copies.
      </p>

      {held > 0 && (
        <p className="cloud-books-hold">
          {held} files were deleted on this device at once. They are still in the cloud until you say so.{" "}
          <button className="btn-primary" disabled={!!busy} onClick={() => confirmHeldDeletions()}>
            Yes, delete them in the cloud too
          </button>
        </p>
      )}
      {busy && <p className="hint">{busy}</p>}
      {error && <p className="cloud-books-error">{error}</p>}
    </div>
  );
}
