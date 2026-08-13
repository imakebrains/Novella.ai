import { useEffect, useRef, useState } from "react";
import { generate, NoProviderError } from "../ai/generate";
import { buildRewordRequest, cleanReword, REWORD_STYLES } from "./rewordCore";

/* The reword popover — select prose, pick a voice, replace in place.

   Three stages in one small card: the style menu, the streaming
   rewrite, and the result with Replace. The card never moves between
   stages; jumping UI under a decision is how trust dies. Replacing
   goes through the editor's normal dispatch, so Ctrl+Z undoes it
   like any other edit. */

interface Props {
  selection: { text: string; before: string; after: string };
  /** Position inside the editor pane, already clamped. */
  pos: { x: number; y: number };
  onReplace: (newText: string) => void;
  onClose: () => void;
}

type Stage =
  | { kind: "menu" }
  | { kind: "loading"; label: string }
  | { kind: "result"; label: string; text: string }
  | { kind: "error"; message: string };

export function RewordPopover({ selection, pos, onReplace, onClose }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: "menu" });
  const [custom, setCustom] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Escape closes from anywhere; clicks outside close too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      abortRef.current?.abort();
    };
  }, [onClose]);

  const run = (label: string, instruction: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStage({ kind: "loading", label });

    const req = buildRewordRequest(instruction, selection.text, selection.before, selection.after);
    let streamed = "";
    generate(
      { ...req, maxTokens: 1200 },
      (chunk) => {
        streamed += chunk;
        if (!ctrl.signal.aborted) {
          setStage({ kind: "result", label, text: cleanReword(streamed) });
        }
      },
      ctrl.signal,
    )
      .then((full) => {
        if (!ctrl.signal.aborted) setStage({ kind: "result", label, text: cleanReword(full) });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        const message =
          err instanceof NoProviderError
            ? "No AI connection is on. Settings → Connections turns one on — local Ollama works offline."
            : err instanceof Error
              ? err.message
              : "The rewrite failed.";
        setStage({ kind: "error", message });
      });
  };

  return (
    <div
      ref={cardRef}
      className="reword-pop"
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label="Reword selection"
    >
      {stage.kind === "menu" && (
        <>
          <div className="reword-styles">
            {REWORD_STYLES.map((s) => (
              <button key={s.id} className="reword-style" onClick={() => run(s.label, s.instruction)}>
                {s.label}
              </button>
            ))}
          </div>
          <form
            className="reword-custom"
            onSubmit={(e) => {
              e.preventDefault();
              const wish = custom.trim();
              if (wish) run("Custom", `Rewrite this passage. ${wish}`);
            }}
          >
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Or say what you want…"
              aria-label="Custom rewrite instruction"
            />
          </form>
        </>
      )}

      {stage.kind === "loading" && (
        <div className="reword-wait">
          <span className="reword-spinner" aria-hidden />
          {stage.label}…
        </div>
      )}

      {stage.kind === "result" && (
        <>
          <div className="reword-head">
            <span>{stage.label}</span>
            <button className="reword-again" onClick={() => setStage({ kind: "menu" })}>
              Styles
            </button>
          </div>
          <div className="reword-preview">{stage.text || "…"}</div>
          <div className="reword-actions">
            <button className="btn-primary" onClick={() => stage.text.trim() && onReplace(stage.text)}>
              Replace
            </button>
            <button className="btn-ghost" onClick={onClose}>
              Keep original
            </button>
          </div>
        </>
      )}

      {stage.kind === "error" && (
        <>
          <div className="reword-preview reword-error">{stage.message}</div>
          <div className="reword-actions">
            <button className="btn-ghost" onClick={() => setStage({ kind: "menu" })}>
              Back
            </button>
          </div>
        </>
      )}
    </div>
  );
}
