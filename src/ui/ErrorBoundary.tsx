import { Component, type ErrorInfo, type ReactNode } from "react";
import { allDrafts } from "../state/autosave";
import { desktopLog } from "../debug";

/* Catches render crashes so a bug can't silently swallow someone's work.

   The important thing this screen does is answer the only question the
   writer actually has — "did I just lose my chapter?" — before saying
   anything about the error itself. Draft snapshots are written on every
   keystroke, so the answer is normally no, and it should say so plainly
   rather than showing a stack trace to a novelist. */

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  drafts: number;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, drafts: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Count what's recoverable before anything else touches storage.
    let drafts = 0;
    try {
      drafts = allDrafts().length;
    } catch {
      /* storage unavailable */
    }
    this.setState({ drafts });

    desktopLog(`CRASH: ${error.message}`);
    desktopLog(`  at: ${(info.componentStack ?? "").split("\n").slice(1, 4).join(" | ").trim()}`);
    console.error("Novella crashed:", error, info.componentStack);
  }

  render() {
    const { error, drafts } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash">
        <div className="crash-card">
          <h1>Novella hit a bug.</h1>

          <p className="crash-reassure">
            {drafts > 0 ? (
              <>
                <strong>Your writing is safe.</strong> {drafts} unsaved{" "}
                {drafts === 1 ? "note was" : "notes were"} snapshotted and will be offered
                back when you reload.
              </>
            ) : (
              <>
                <strong>Nothing was unsaved</strong> when this happened, so no work was
                lost.
              </>
            )}
          </p>

          <p className="crash-detail">
            This is a fault in the app, not something you did.
          </p>

          <div className="crash-actions">
            <button className="btn-primary" onClick={() => window.location.reload()}>
              Reload Novella
            </button>
          </div>

          <details className="crash-tech">
            <summary>Technical detail</summary>
            <pre>{error.message}</pre>
            {error.stack && <pre className="crash-stack">{error.stack}</pre>}
          </details>
        </div>
      </div>
    );
  }
}
