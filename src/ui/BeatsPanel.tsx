import { useRef, useState } from "react";
import { store, useVaultVersion } from "../state/vaultStore";
import { buildFromTemplate } from "../ai/prompts";
import { generate } from "../ai/generate";
import { insertIntoEditor } from "./editorBridge";

/* Scene beats — the drafting loop.

   You write what has to happen as terse bullets, then expand them one at
   a time. Each beat is drafted with the codex entries the scene actually
   references, so the model knows who these people are without being handed
   the whole bible. Prose is held for review before it enters the chapter. */

const EXPAND_TEMPLATE = `Write the next passage of "{{scene}}".

What must happen in this passage:
{{beat}}

What came before:
{{prose}}

Write only the prose. Match the established voice, tense and point of view. Do not restate the beat or summarise.`;

export function BeatsPanel() {
  useVaultVersion();
  const active = store.active();
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [output, setOutput] = useState<{ index: number; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  if (!active) return null;
  const beats = store.beatsOf(active);

  const commit = (next: string[]) => store.setBeats(active.id, next);

  const addBeat = () => {
    const text = draft.trim();
    if (!text) return;
    commit([...beats, text]);
    setDraft("");
  };

  const expand = async (index: number) => {
    const beat = beats[index];
    if (!beat) return;

    setBusyIndex(index);
    setError(null);
    setOutput({ index, text: "" });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const referenced = store
        .outgoingLinks(active)
        .map((l) => l.note)
        .filter((n): n is NonNullable<typeof n> => Boolean(n));

      const built = buildFromTemplate(EXPAND_TEMPLATE, active, referenced, { beat });

      await generate(
        { system: built.system, prompt: built.prompt, maxTokens: 500 },
        (chunk) => setOutput((o) => (o ? { ...o, text: o.text + chunk } : o)),
        controller.signal,
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : String(err));
        setOutput(null);
      }
    } finally {
      setBusyIndex(null);
      abort.current = null;
    }
  };

  const accept = () => {
    if (!output?.text.trim()) return;
    if (!insertIntoEditor(output.text)) {
      setError("No chapter open to insert into.");
      return;
    }
    // A drafted beat has done its job — drop it so the list stays a
    // to-do rather than becoming a duplicate of the prose.
    commit(beats.filter((_, i) => i !== output.index));
    setOutput(null);
  };

  return (
    <section className={`beats ${open ? "open" : ""}`}>
      <button className="beats-head" onClick={() => setOpen((v) => !v)}>
        <span className={`caret ${open ? "" : "closed"}`}>▾</span>
        <span className="beats-title">Beats</span>
        {beats.length > 0 && <span className="count">{beats.length}</span>}
        {!open && beats.length > 0 && (
          <span className="beats-peek">{beats[0]}</span>
        )}
      </button>

      {open && (
        <div className="beats-body">
          {beats.length === 0 && (
            <p className="hint">
              Sketch what has to happen, one line per beat. Then draft them one at a time.
            </p>
          )}

          <ol className="beat-list">
            {beats.map((beat, i) => (
              <li key={i} className={`beat ${busyIndex === i ? "busy" : ""}`}>
                <input
                  className="beat-text"
                  value={beat}
                  onChange={(e) => commit(beats.map((b, j) => (j === i ? e.target.value : b)))}
                  placeholder="What happens here…"
                />
                <button
                  className="beat-action"
                  onClick={() => void expand(i)}
                  disabled={busyIndex !== null}
                  title="Draft this beat into prose"
                >
                  {busyIndex === i ? "…" : "Draft"}
                </button>
                <button
                  className="beat-action ghost"
                  onClick={() => commit(beats.filter((_, j) => j !== i))}
                  disabled={busyIndex !== null}
                  title="Remove beat"
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>

          <div className="beat-add">
            <input
              className="beat-text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addBeat();
                }
              }}
              placeholder="Add a beat…"
            />
            <button className="beat-action" onClick={addBeat} disabled={!draft.trim()}>
              Add
            </button>
          </div>

          {error && <div className="notice error-notice">{error}</div>}

          {output && (
            <div className="beat-output">
              <div className="generated">{output.text || "…"}</div>
              <div className="btn-row">
                <button className="btn-primary" onClick={accept} disabled={busyIndex !== null}>
                  Insert &amp; clear beat
                </button>
                {busyIndex !== null ? (
                  <button className="btn-ghost" onClick={() => abort.current?.abort()}>
                    Stop
                  </button>
                ) : (
                  <button className="btn-ghost" onClick={() => setOutput(null)}>
                    Discard
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
