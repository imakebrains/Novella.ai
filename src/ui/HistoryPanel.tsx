import { useState, useSyncExternalStore } from "react";
import { store, useVaultVersion } from "../state/vaultStore";
import {
  clearHistory,
  historyVersion,
  restore,
  revisionsOf,
  subscribeHistory,
  type Revision,
} from "../state/history";
import { diffParagraphs, diffWords, relativeTime } from "./diff";

/* Revision history for the open note.

   The point of this panel is confidence: a writer should be able to let
   the model rewrite a scene knowing the earlier version is one click
   away. So the diff is the main event, not an afterthought — seeing what
   changed is what makes restoring a decision instead of a gamble. */

function useHistoryVersion(): number {
  return useSyncExternalStore(subscribeHistory, historyVersion, historyVersion);
}

export function HistoryPanel() {
  useVaultVersion();
  useHistoryVersion();
  const active = store.active();
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  if (!active) return null;
  const revisions = revisionsOf(active.id);

  if (revisions.length === 0) {
    return (
      <div className="history-empty">
        <p className="hint">No earlier versions yet.</p>
        <p className="hint">
          Novella saves one automatically before the assistant writes into your
          prose, and each time your work is saved. Nothing is recorded while you
          type — only at the moments you might want to undo.
        </p>
        {!store.isPersistent() && (
          <p className="hint">
            No folder is open, so history lives in this browser only. Open a
            project folder and it will be stored alongside the book.
          </p>
        )}
      </div>
    );
  }

  const doRestore = async (at: number) => {
    setBusy(true);
    try {
      await restore(active.id, at);
      setOpenAt(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="history-panel">
      <p className="hint">
        {revisions.length} {revisions.length === 1 ? "version" : "versions"} kept.
        Restoring saves the current text first, so it is never a one-way door.
      </p>

      <ol className="revision-list">
        {revisions.map((rev, i) => {
          const previous = revisions[i + 1];
          const delta = previous ? rev.words - previous.words : null;
          return (
            <li key={rev.at} className={`revision ${openAt === rev.at ? "open" : ""}`}>
              <button className="revision-head" onClick={() => setOpenAt(openAt === rev.at ? null : rev.at)}>
                <span className="revision-when">{relativeTime(rev.at)}</span>
                <span className="revision-reason">{rev.reason}</span>
                <span className="revision-words">
                  {rev.words.toLocaleString()}w
                  {delta !== null && delta !== 0 && (
                    <span className={delta > 0 ? "delta up" : "delta down"}>
                      {delta > 0 ? `+${delta}` : delta}
                    </span>
                  )}
                </span>
              </button>

              {openAt === rev.at && (
                <div className="revision-body">
                  <Diff from={rev.body} to={active.body} />
                  <div className="btn-row">
                    <button
                      className="btn-primary"
                      disabled={busy || rev.body === active.body}
                      onClick={() => void doRestore(rev.at)}
                      title={
                        rev.body === active.body
                          ? "This is identical to what's open"
                          : "Put this version back in the editor"
                      }
                    >
                      {rev.body === active.body ? "Already current" : "Restore this version"}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <button
        className="btn-ghost danger"
        disabled={busy}
        onClick={() => {
          if (confirm(`Delete all ${revisions.length} saved versions of "${active.title}"? The text in the editor is not affected.`)) {
            void clearHistory(active.id);
          }
        }}
      >
        Clear history for this note
      </button>
    </div>
  );
}

/* ---------------- diff ---------------- */

function Diff({ from, to }: { from: string; to: string }) {
  const rows = diffParagraphs(from, to);
  const changed = rows.filter((r) => r.kind !== "same").length;

  if (changed === 0) {
    return <p className="hint">Identical to the text in the editor.</p>;
  }

  return (
    <div className="diff">
      <p className="hint diff-legend">
        <span className="swatch remove" /> in this version ·{" "}
        <span className="swatch add" /> in the editor now
      </p>
      {rows.map((row, i) => {
        if (row.kind === "same") {
          // Unchanged prose is collapsed to a marker; showing an entire
          // untouched chapter to highlight one edited paragraph buries it.
          return (
            <p key={i} className="diff-same" title={row.text}>
              {row.text.length > 90 ? `${row.text.slice(0, 90)}…` : row.text}
            </p>
          );
        }

        // A remove followed by an add is a REWRITE of one paragraph —
        // show it once with the changed words marked, instead of striking
        // the whole thing for a swapped adjective.
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
        if (row.kind === "add" && rows[i - 1]?.kind === "remove") {
          return null; // consumed by the rewrite row above
        }

        return (
          <p key={i} className={`diff-row ${row.kind}`}>
            {row.text}
          </p>
        );
      })}
    </div>
  );
}

export type { Revision };
