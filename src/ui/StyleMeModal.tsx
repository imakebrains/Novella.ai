import { useEffect, useMemo, useRef, useState } from "react";

import { store, useVaultVersion } from "../state/vaultStore";
import { NoProviderError, generate } from "../ai/generate";
import type { PaletteCommand } from "./CommandPalette";
import {
  SAMPLE_MIN_WORDS,
  STYLE_FIELDS,
  buildStyleRequest,
  checkSample,
  cleanSample,
  countWords,
  parseStyleReply,
  styleNoteMarkdown,
  styleNotePath,
  suggestStyleName,
  trimSample,
  type DerivedStyle,
} from "../ai/styleMe";

/* Style me.

   Give it a page of writing you like — pasted, or a note already in the
   project — and it describes the voice: rhythm, diction, habits, what
   the writer never does. That description is saved as a `type: prompt`
   note, which means it turns up in the assistant's "Writing style" list
   with the built-in prompts and can be edited like any other file.

   Two things this screen exists to be honest about.

   The analysis needs a model. There is no local heuristic that can read
   a voice, and a hand-written paragraph about "vivid, evocative prose"
   dressed up as an analysis would be worse than nothing — the writer
   would build a book on it. So when nothing can answer, this fails and
   says which button to press. It never produces a style from nothing.

   The model does not always answer in the shape it was asked for. When
   the reply cannot be read as a style, the writer sees exactly what came
   back, verbatim, and decides whether to try again. Nothing is invented
   to fill the gap.

   Everything decidable without a model — how much prose is enough, what
   the note ends up containing, what it gets called — lives in
   ../ai/styleMe.ts and is unit-tested in test-styleme.ts. */

const OPEN_EVENT = "novella:style-me";

/** Open the flow from anywhere, without threading state through the
    component tree. One line at the call site is the whole point: this
    wants to be reachable from the palette, from the projects screen the
    moment a book is created, and from wherever it turns out to belong
    next, without any of those files learning how it works. */
export function openStyleMe(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export const STYLE_ME_COMMAND: PaletteCommand = {
  id: "style-me",
  label: "Style me — learn a writing style from a sample",
  hint: "AI",
  run: openStyleMe,
};

/** Mount once, near the other hosts. Renders nothing until asked. */
export function StyleMeHost({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  if (!open) return null;
  return <StyleMeModal onClose={() => setOpen(false)} onOpenSettings={onOpenSettings} />;
}

type Stage = "choose" | "review" | "saved";
type Source = "paste" | "note";

export function StyleMeModal({
  onClose,
  onOpenSettings,
}: {
  onClose: () => void;
  onOpenSettings?: () => void;
}) {
  const version = useVaultVersion();

  const [stage, setStage] = useState<Stage>("choose");
  const [source, setSource] = useState<Source>("paste");
  const [pasted, setPasted] = useState("");
  const [noteId, setNoteId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);
  /* The reply we could not read, kept verbatim. Showing it is the
     alternative to guessing what the model meant. */
  const [unreadable, setUnreadable] = useState<string | null>(null);
  const [style, setStyle] = useState<DerivedStyle | null>(null);
  const [name, setName] = useState("");
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Stop a run in flight if the writer closes the window on it.
  useEffect(() => () => abort.current?.abort(), []);

  /* Notes worth offering as a sample: anything with real prose in it.
     A codex stub of two lines would pass the model and come back
     describing nothing, so the floor is applied here rather than
     letting the writer discover it after the wait. */
  const candidates = useMemo(() => {
    const long = store.vault
      .all()
      .filter((n) => n.type !== "prompt" && countWords(n.body) >= SAMPLE_MIN_WORDS);
    const chapters = store.orderedChapters().filter((n) => long.includes(n));
    const rest = long
      .filter((n) => !chapters.includes(n))
      .sort((a, b) => a.title.localeCompare(b.title));
    return [...chapters, ...rest];
    // Keyed on the vault version: a chapter written in another pane while
    // this is open should be offerable without reopening the window.
  }, [version]);

  const picked = noteId ? store.vault.get(noteId) : undefined;
  const sourceLabel = source === "note" ? (picked?.title ?? "") : "";
  const sample = useMemo(
    () => cleanSample(source === "paste" ? pasted : (picked?.body ?? "")),
    [source, pasted, picked],
  );
  const verdict = checkSample(sample);

  const taken = store.prompts().map((n) => n.title);
  const clash =
    stage === "review" &&
    name.trim().length > 0 &&
    taken.some((t) => t.trim().toLowerCase() === name.trim().toLowerCase());

  const run = async () => {
    setBusy(true);
    setError(null);
    setNeedsConnection(false);
    setUnreadable(null);
    const controller = new AbortController();
    abort.current = controller;

    try {
      const req = buildStyleRequest(trimSample(sample), { source: sourceLabel });
      const reply = await generate(
        { system: req.system, prompt: req.prompt, role: req.role, maxTokens: 900 },
        undefined,
        controller.signal,
      );

      const read = parseStyleReply(reply);
      if (!read) {
        setUnreadable(reply.trim() || "(the model replied with nothing at all)");
        return;
      }

      setStyle(read);
      setName(suggestStyleName(sourceLabel, taken));
      setStage("review");
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof NoProviderError) {
        setNeedsConnection(true);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      abort.current = null;
      setBusy(false);
    }
  };

  const save = () => {
    if (!style) return;
    const finalName = name.trim() || suggestStyleName(sourceLabel, taken);
    const path = styleNotePath(finalName);
    const markdown = styleNoteMarkdown(style, {
      name: finalName,
      source: sourceLabel || "a pasted sample",
      derivedOn: new Date().toISOString().slice(0, 10),
    });

    const note = store.createNoteAtPath(path, markdown);
    store.open(note.id);
    // Write it now rather than leaving it to autosave: the writer is
    // about to go looking for the file.
    void store.saveAll();
    setSavedPath(path);
    setStage("saved");
  };

  const setField = (key: keyof DerivedStyle, value: string) =>
    setStyle((s) => (s ? { ...s, [key]: value } : s));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal styleme-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Style me</h2>
          <button className="icon-btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </header>

        <div className="modal-body">
          {stage === "choose" && (
            <>
              <p className="hint">
                Show it writing you want to sound like — your own best chapter, or a
                passage from a book you admire. It reads the voice back to you as
                something you can draft with, and saves it as an ordinary note in
                your Prompts folder.
              </p>

              {/* preset-chip rather than a new class: this is the same
                  "pick one of these" control the projects screen uses, and
                  a second set of chips that look almost like those would be
                  a design inconsistency for no gain. */}
              <div className="preset-row" role="radiogroup" aria-label="Where the sample comes from">
                <button
                  className={`preset-chip ${source === "paste" ? "on" : ""}`}
                  role="radio"
                  aria-checked={source === "paste"}
                  onClick={() => setSource("paste")}
                  disabled={busy}
                >
                  Paste a sample
                </button>
                <button
                  className={`preset-chip ${source === "note" ? "on" : ""}`}
                  role="radio"
                  aria-checked={source === "note"}
                  onClick={() => setSource("note")}
                  disabled={busy}
                >
                  From this project
                </button>
              </div>

              {source === "paste" ? (
                <textarea
                  className="field-input styleme-sample"
                  rows={10}
                  style={{ width: "100%", resize: "vertical" }}
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder="Paste a page or two of prose…"
                  aria-label="Prose sample"
                  disabled={busy}
                />
              ) : candidates.length === 0 ? (
                <p className="empty-note">
                  Nothing in this project is long enough yet — a sample needs about{" "}
                  {SAMPLE_MIN_WORDS} words. Paste one instead.
                </p>
              ) : (
                <select
                  className="field-input field-select"
                  style={{ width: "100%" }}
                  value={noteId}
                  onChange={(e) => setNoteId(e.target.value)}
                  aria-label="Note to read the style from"
                  disabled={busy}
                >
                  <option value="">Pick a note…</option>
                  {candidates.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title} — {countWords(n.body).toLocaleString()} words
                    </option>
                  ))}
                </select>
              )}

              {verdict.words > 0 && (
                <p className="hint">
                  {verdict.words.toLocaleString()} words.{" "}
                  {verdict.problem ?? verdict.note ?? "Enough to read a voice off."}
                </p>
              )}
              {verdict.words === 0 && verdict.problem && <p className="hint">{verdict.problem}</p>}

              <p className="hint">
                Reading a style needs a model — a local one through Ollama, or a
                connected account. Your sample is sent to whichever one answers, and
                nowhere else.
              </p>

              <div className="btn-row">
                <button
                  className="btn-primary"
                  onClick={() => void run()}
                  disabled={busy || !verdict.ok}
                  style={{ minWidth: 150 }}
                >
                  {busy ? (
                    <>
                      <span className="spinner" aria-hidden /> Reading…
                    </>
                  ) : (
                    "Read the style"
                  )}
                </button>
                {busy && (
                  <button className="btn-ghost" onClick={() => abort.current?.abort()}>
                    Stop
                  </button>
                )}
              </div>

              {error && (
                <div className="notice error-notice">
                  <p>{error}</p>
                  {needsConnection && onOpenSettings && (
                    <div className="btn-row">
                      <button
                        className="btn-ghost"
                        onClick={() => {
                          onOpenSettings();
                          onClose();
                        }}
                      >
                        Open Settings → Connections
                      </button>
                    </div>
                  )}
                </div>
              )}

              {unreadable && (
                <div className="notice">
                  <p>
                    That came back in a shape I can&rsquo;t turn into a style, so nothing
                    has been saved. Here it is exactly as it arrived — try again, or use
                    a longer sample.
                  </p>
                  {/* The wrapping and the scroll cap are inline because a
                      model's stray answer can be one 900-character line,
                      and an unstyled <pre> would push the modal sideways
                      the first time that happens. */}
                  <pre
                    className="styleme-raw"
                    style={{
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                      maxHeight: "12em",
                      overflowY: "auto",
                      margin: 0,
                    }}
                  >
                    {unreadable}
                  </pre>
                </div>
              )}
            </>
          )}

          {stage === "review" && style && (
            <>
              <p className="hint">
                This is what it read{sourceLabel ? ` in “${sourceLabel}”` : ""}. Correct
                anything that is wrong before saving — it is your style, and the words
                below are what gets handed to the model every time you use it.
              </p>

              {STYLE_FIELDS.map((field) => (
                <div key={field.key}>
                  <div className="settings-section-label">{field.label}</div>
                  <textarea
                    className="field-input styleme-field"
                    rows={2}
                    style={{ width: "100%", resize: "vertical" }}
                    value={style[field.key]}
                    onChange={(e) => setField(field.key, e.target.value)}
                    aria-label={field.label}
                  />
                </div>
              ))}

              <div className="settings-section-label">Call it</div>
              <input
                className="field-input"
                style={{ width: "100%" }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Style name"
              />
              {clash && (
                <p className="hint">
                  A note is already called that. Pick another name — two prompts with the
                  same title would be impossible to tell apart in the style list.
                </p>
              )}

              <div className="btn-row">
                <button
                  className="btn-primary"
                  onClick={save}
                  disabled={!name.trim() || clash || !style.summary.trim()}
                >
                  Save this style
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setStage("choose");
                    setStyle(null);
                  }}
                >
                  Back
                </button>
              </div>
            </>
          )}

          {stage === "saved" && savedPath && (
            <>
              <p className="hint">
                Saved as <code>{savedPath}</code> and opened in the editor. It is plain
                Markdown in your project folder, so you can rewrite it whenever it stops
                sounding right.
              </p>
              <p className="hint">
                To use it: open the Assistant panel on a chapter and pick{" "}
                <em>{name.trim()}</em> under <strong>Writing style</strong>.
              </p>
              <div className="btn-row">
                <button className="btn-primary" onClick={onClose}>
                  Done
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setStage("choose");
                    setStyle(null);
                    setSavedPath(null);
                    setPasted("");
                    setNoteId("");
                  }}
                >
                  Do another
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
