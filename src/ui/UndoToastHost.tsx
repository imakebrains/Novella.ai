import { dismissUndo, runUndo, useUndoToast } from "../state/undo";

/* Renders the one live undo toast, bottom-center, above everything. */

export function UndoToastHost() {
  const toast = useUndoToast();
  if (!toast) return null;
  return (
    <div className="undo-toast" role="status">
      <span className="undo-label">{toast.label}</span>
      <button className="undo-btn" onClick={runUndo}>
        Undo
      </button>
      <button className="undo-dismiss" onClick={dismissUndo} title="Dismiss" aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
