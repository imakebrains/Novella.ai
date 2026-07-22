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
  const [suggesting, setSuggesting] = useState(false);
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

  /** The reverse direction: read the prose and propose what happens next.
      Suggestions land as ordinary beats the writer can edit or delete —
      never straight into the chapter. */
  const suggestBeats = async () => {
    setSuggesting(true);
    setError(null);
    try {
      const text = await generate({
        system:
          "You plan scenes for a novelist. Answer with plain lines only — no numbering, no bullets, no commentary.",
        prompt: `Here is the chapter "${active.title}" so far:\n\n${active.body.trim() || "(nothing written yet)"}\n\n${
          beats.length ? `Beats already planned:\n${beats.join("\n")}\n\n` : ""
        }Propose the next 3 beats — what should happen next, one short line each. Concrete events, not themes.`,
        maxTokens: 200,
      });
      const proposed = text
        .split("\n")
        .map((line) => line.replace(/^[\s\d.\-•*]+/, "").trim())
        .filter((line) => line.length > 3)
        .slice(0, 3);
      if (proposed.length === 0) throw new Error("The model returned nothing usable — try again.");
      commit([...beats, ...proposed]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSuggesting(false);
    }
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
              Beats are your plan for this chapter — one line per thing that has to happen.
              Write them yourself, or let <em>Suggest next beats</em> read the prose and
              propose some. "Write this beat" then turns a single line into prose, held for
              your review before anything enters the chapter.
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
                  disabled={busyIndex !== null || suggesting}
                  title="Turn this one beat into prose, shown for review first"
                >
                  {busyIndex === i ? "Writing…" : "Write this beat"}
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
              placeholder="What happens next? Add it as a beat…"
            />
            <button className="beat-action" onClick={addBeat} disabled={!draft.trim()}>
              Add
            </button>
            <button
              className="beat-action ghost"
              onClick={() => void suggestBeats()}
              disabled={suggesting || busyIndex !== null}
              title="Read the chapter and propose the next few beats"
            >
              {suggesting ? "Thinking…" : "✦ Suggest next beats"}
            </button>
          </div>

          {error && <div className="notice error-notice">{error}</div>}

          {output && (
            <div className="beat-output">
              <div className="generated">{output.text || "…"}</div>
              <div className="btn-row">
                <button className="btn-primary" onClick={accept} disabled={busyIndex !== null}>
                  Add to chapter
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
