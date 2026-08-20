import { useEffect, useState } from "react";
import { store, useVaultVersion, type SaveConflict } from "../state/vaultStore";
import { trashStore } from "../state/trash";
import { parseNote } from "../core/vault";
import { diffParagraphs, diffWords } from "./diff";
import type { FlaggedFile } from "../storage/vaultSafety";
import type { VaultFile } from "../storage";

/* ============================================================
   Sync collisions, put in front of the writer

   Two things bring this up, and both mean the same thing: a second
   process — Dropbox, Drive, iCloud, OneDrive, Syncthing — touched the
   manuscript while Novella had it open.

     1. A SAVE was refused because the file changed under us and we had
        unsaved edits. Nothing was written. The writer picks a winner.
     2. A file that looks like a sync client's leftover copy was found
        at open time and kept out of the vault index.

   The rule this screen exists to enforce: nothing merges prose
   automatically and nothing is deleted. Every path out of here is a
   choice a human made, and "keep both" is always available for the
   writer who doesn't want to make one yet.

   The diff is the existing paragraph diff from History — same code,
   same colours, so it reads the way the writer has already learned to
   read a diff in this app.
   ============================================================ */

function bodyOf(path: string, raw: string): string {
  // Diff the prose, not the YAML. A frontmatter `order:` that moved is
  // technically a difference and is never what the writer is deciding.
  try {
    return parseNote(path, raw).body;
  } catch {
    return raw;
  }
}

function ConflictRow({ clash }: { clash: SaveConflict }) {
  const [busy, setBusy] = useState(false);
  const mine = bodyOf(clash.path, clash.mine);
  const theirs = bodyOf(clash.path, clash.theirs);

  const choose = async (choice: "mine" | "theirs" | "both") => {
    setBusy(true);
    try {
      await store.resolveConflict(clash.noteId, choice);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="conflict-item">
      <h3 className="conflict-title">{clash.title}</h3>
      <p className="hint">
        <code>{clash.path}</code> changed on disk while you were writing — most likely
        another device finished syncing. Novella did not overwrite it.
      </p>

      <div className="btn-row conflict-actions">
        <button className="btn-primary" disabled={busy} onClick={() => void choose("both")}>
          Keep both
        </button>
        <button className="btn-ghost" disabled={busy} onClick={() => void choose("mine")}>
          Keep mine
        </button>
        <button className="btn-ghost" disabled={busy} onClick={() => void choose("theirs")}>
          Load theirs
        </button>
      </div>
      <p className="hint">
        Keep both leaves the synced file exactly where it is — links keep working — and
        puts your version beside it as a new note.
      </p>

      <Diff from={theirs} to={mine} />
    </section>
  );
}

function CopyRow({ entry }: { entry: FlaggedFile<VaultFile> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const words = entry.file.contents.trim().split(/\s+/).filter(Boolean).length;

  const keep = async () => {
    setBusy(true);
    setError(null);
    try {
      await store.adoptConflictCopy(entry.file.path);
    } finally {
      setBusy(false);
    }
  };

  /* Into the existing trash, not deleted. It goes through the vault
     first because that is the only door the trash has — and it is
     staged WITHOUT being marked dirty, so an autosave firing in the
     gap can't write it straight back out. Retention then looks after
     it exactly like any other deleted note. */
  const discard = async () => {
    setBusy(true);
    setError(null);
    try {
      const note = store.stageConflictCopyForTrash(entry.file.path);
      if (!note) return;
      const result = await trashStore.moveToTrash(note.id, "deleted");
      if (!result.ok) setError(result.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="conflict-item">
      <h3 className="conflict-title">{entry.file.path}</h3>
      <p className="hint">
        {entry.info.label} It holds about {words.toLocaleString()} word
        {words === 1 ? "" : "s"}, and it has been kept out of your codex so it can't
        take over the original note's name.
      </p>
      {error && <div className="notice error-notice">{error}</div>}

      <div className="btn-row conflict-actions">
        <button className="btn-primary" disabled={busy} onClick={() => void keep()}>
          Keep it as a note
        </button>
        <button className="btn-ghost" disabled={busy} onClick={() => void discard()}>
          Move it to the trash
        </button>
        <button
          className="btn-ghost"
          disabled={busy}
          onClick={() => store.forgetConflictCopy(entry.file.path)}
        >
          Leave it alone
        </button>
      </div>
    </section>
  );
}

export function ConflictModal({ onClose }: { onClose: () => void }) {
  useVaultVersion();
  const clashes = store.conflicts();
  const copies = store.conflictCopies();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal conflict-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Your folder synced while you were writing</h2>
          <button className="icon-btn" onClick={onClose} title="Decide later (Esc)">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <p className="hint">
            Nothing has been overwritten and nothing has been deleted. Your unsaved work is
            still here — and still in the crash-recovery snapshot — until you choose.
          </p>

          {clashes.map((c) => (
            <ConflictRow key={c.noteId} clash={c} />
          ))}
          {copies.map((c) => (
            <CopyRow key={c.file.path} entry={c} />
          ))}

          {clashes.length === 0 && copies.length === 0 && (
            <div className="empty-state">
              <span className="empty-glyph" aria-hidden>
                ✓
              </span>
              <p>All settled. Your folder and Novella agree again.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- diff ---------------- */

function Diff({ from, to }: { from: string; to: string }) {
  const rows = diffParagraphs(from, to);
  const changed = rows.filter((r) => r.kind !== "same").length;

  if (changed === 0) {
    return <p className="hint ok">The prose is identical — only the note's details differ.</p>;
  }

  return (
    <div className="diff">
      <p className="hint diff-legend">
        <span className="swatch remove" /> the file on disk ·{" "}
        <span className="swatch add" /> your unsaved version
      </p>
      {rows.map((row, i) => {
        if (row.kind === "same") {
          return (
            <p key={i} className="diff-same" title={row.text}>
              {row.text.length > 90 ? `${row.text.slice(0, 90)}…` : row.text}
            </p>
          );
        }
        const next = rows[i + 1];
        if (row.kind === "remove" && next?.kind === "add") {
          return (
            <p key={i} className="diff-row rewrite">
              {diffWords(row.text, next.text).map((run, j) => (
                <span key={j} className={`diff-word ${run.kind}`}>
                  {run.text}
                </span>
              ))}
            </p>
          );
        }
        if (row.kind === "add" && rows[i - 1]?.kind === "remove") return null;
        return (
          <p key={i} className={`diff-row ${row.kind}`}>
            {row.text}
          </p>
        );
      })}
    </div>
  );
}

/* ============================================================
   Where this appears

   One line in App.tsx — <ConflictHost /> beside <TrashHost /> — is the
   proper home. Until that line exists the first collision mounts its
   own root, exactly as TrashPanel does; the fallback checks for a real
   host first and only ever runs once, so wiring App.tsx later costs
   nothing and changes nothing.

   Closing the dialog does NOT resolve anything — it can't, there is no
   safe default. Unresolved items collapse to a chip in the corner that
   opens it again. A modal you can't escape is hostile; a warning you
   can lose is worse.
   ============================================================ */

let hostCount = 0;
let fallbackMounted = false;

function keyOf(): string {
  return [
    ...store.conflicts().map((c) => c.noteId),
    ...store.conflictCopies().map((c) => c.file.path),
  ].join("|");
}

export function ConflictHost() {
  useVaultVersion();
  const key = keyOf();
  const [dismissed, setDismissed] = useState("");

  useEffect(() => {
    hostCount++;
    return () => {
      hostCount--;
    };
  }, []);

  if (!key) return null;
  // Anything NEW re-opens the dialog: dismissing "Chapter 7" must not
  // silence the collision that arrives four minutes later.
  if (key !== dismissed) return <ConflictModal onClose={() => setDismissed(key)} />;

  const count = store.conflicts().length + store.conflictCopies().length;
  return (
    <button className="conflict-chip" onClick={() => setDismissed("")}>
      {count} sync {count === 1 ? "decision" : "decisions"} waiting
    </button>
  );
}

function mountFallbackHost(): void {
  if (hostCount > 0 || fallbackMounted) return;
  if (typeof document === "undefined") return;
  fallbackMounted = true;
  const node = document.createElement("div");
  node.className = "conflict-host";
  document.body.appendChild(node);
  // Dynamic so a test or a headless import never drags react-dom in.
  void import("react-dom/client").then(({ createRoot }) => {
    createRoot(node).render(<ConflictHost />);
  });
}

function checkForWork(): void {
  if (store.conflictCount() > 0 || store.conflictCopies().length > 0) mountFallbackHost();
}

// The store lazy-loads this module the moment it has something to ask
// about, which means the triggering emit has usually already happened by
// the time we subscribe. Check once on load as well as on every change.
store.subscribe(checkForWork);
checkForWork();
