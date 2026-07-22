import { useEffect, useRef, useState } from "react";
import { store } from "../state/vaultStore";
import { readDocx } from "../import/docx";
import {
  chapterFilename,
  chapterToMarkdown,
  splitIntoChapters,
  textToParagraphs,
  type ImportedChapter,
} from "../import/manuscript";
import { extractEntities, type EntityCandidate, type EntityGuess } from "../import/entities";
import { storage } from "../storage";

/* Bringing an existing book in.

   Two stages, both reviewable, because an import that guesses wrong and
   writes anyway is worse than no import at all:

     1. Chapters — what we think the structure is. Editable before commit.
     2. Codex    — the characters and places already named in the prose.

   Stage 2 is the one the competition doesn't do. Importing a finished
   manuscript elsewhere means re-typing the cast list that is sitting
   right there in the text. */

type Stage = "choose" | "review" | "done";

export function ImportModal({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<Stage>("choose");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chapters, setChapters] = useState<ImportedChapter[]>([]);
  const [entities, setEntities] = useState<EntityCandidate[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [types, setTypes] = useState<Record<string, EntityGuess>>({});
  const [summary, setSummary] = useState<{ chapters: number; codex: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(`Reading ${file.name}…`);
    try {
      const name = file.name.toLowerCase();
      let found: ImportedChapter[];

      if (name.endsWith(".docx")) {
        found = splitIntoChapters(readDocx(new Uint8Array(await file.arrayBuffer())));
      } else if (name.endsWith(".md") || name.endsWith(".markdown") || name.endsWith(".txt")) {
        found = splitIntoChapters(textToParagraphs(await file.text()));
      } else if (name.endsWith(".doc")) {
        throw new Error(
          "That's the older .doc format. Open it in Word and save as .docx, then try again.",
        );
      } else {
        throw new Error("Novella can read .docx, .md and .txt manuscripts.");
      }

      if (found.length === 0) throw new Error("That file has no text in it.");

      setBusy("Reading the cast…");
      const prose = found.map((c) => c.body).join("\n\n");
      const known = store.linkTargets();
      const candidates = extractEntities(prose, known);

      setChapters(found);
      setEntities(candidates);
      // Pre-tick only the confident guesses. An unknown is a question, and
      // a pre-ticked question is just a trap that creates junk entries.
      setPicked(new Set(candidates.filter((c) => c.guess !== "unknown").map((c) => c.name)));
      setTypes(Object.fromEntries(candidates.map((c) => [c.name, c.guess])));
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const commit = async () => {
    setBusy("Writing files…");
    setError(null);
    try {
      const root = store.vaultRoot();
      const backing = storage();

      // Importing into a project that already has chapters must not reuse
      // their order numbers, or the board interleaves the new book with the
      // old one. Continue the running order instead of restarting it.
      const existing = store.orderedChapters();
      const offset = existing.reduce(
        (max, note) => (typeof note.data.order === "number" ? Math.max(max, note.data.order) : max),
        0,
      );

      for (const chapter of chapters) {
        const placed = { ...chapter, order: chapter.order + offset };
        await backing.write(root ?? "", chapterFilename(placed), chapterToMarkdown(placed));
      }

      let codexCount = 0;
      for (const candidate of entities) {
        if (!picked.has(candidate.name)) continue;
        const type = types[candidate.name] ?? "note";
        const folder =
          type === "character" ? "Codex/Characters" : type === "location" ? "Codex/Locations" : "Codex/Lore";
        const slug = candidate.name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
        // Aliases matter more than they look: the prose says "Mira" far more
        // often than "Mira Vance", and without the alias every one of those
        // mentions would fail to resolve to this entry.
        const aliases = candidate.aliases.length
          ? `aliases:\n${candidate.aliases.map((a) => `  - "${a.replace(/"/g, '\\"')}"`).join("\n")}\n`
          : "";
        const body =
          `---\ntype: ${type === "unknown" ? "note" : type}\n` +
          `name: "${candidate.name.replace(/"/g, '\\"')}"\n${aliases}---\n\n` +
          `Mentioned ${candidate.count} time${candidate.count === 1 ? "" : "s"} in the manuscript.\n\n` +
          `> ${candidate.evidence}\n`;
        await backing.write(root ?? "", `${folder}/${slug}.md`, body);
        codexCount++;
      }

      // Re-read from storage so the vault reflects exactly what was written,
      // rather than a hopeful in-memory reconstruction of it.
      await store.reloadFromStorage();

      setSummary({ chapters: chapters.length, codex: codexCount });
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (name: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Import a manuscript</h2>
          <button className="icon-btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </header>

        <div className="modal-body">
          {error && <div className="notice error-notice">{error}</div>}
          {busy && <p className="hint">{busy}</p>}

          {stage === "choose" && (
            <>
              <p className="hint">
                Bring in a book you've already started. Novella reads the chapters, then
                reads the prose for the characters and places you've already named — so you
                don't have to type your cast list twice.
              </p>
              <div className="btn-row">
                <button
                  className="btn-primary"
                  onClick={() => fileInput.current?.click()}
                  disabled={!!busy}
                >
                  Choose a file…
                </button>
              </div>
              <p className="hint">Word (.docx), Markdown (.md) or plain text (.txt).</p>
              <input
                ref={fileInput}
                type="file"
                accept=".docx,.md,.markdown,.txt"
                hidden
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
              {!store.isPersistent() && (
                <p className="hint">
                  No project folder is open, so an import will live in memory only until you
                  open one.
                </p>
              )}
            </>
          )}

          {stage === "review" && (
            <>
              <section className="import-section">
                <h3>
                  {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"}
                </h3>
                <p className="hint">
                  Rename anything that came through wrong, or drop a title page you don't
                  want as a chapter.
                </p>
                <ol className="import-chapters">
                  {chapters.map((c, i) => (
                    <li key={i}>
                      <input
                        className="import-chapter-title"
                        value={c.title}
                        aria-label={`Title of chapter ${i + 1}`}
                        onChange={(e) =>
                          setChapters((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                          )
                        }
                      />
                      <span className="import-words">
                        {(c.body.trim() ? c.body.trim().split(/\s+/).length : 0).toLocaleString()}w
                      </span>
                      <button
                        className="icon-btn"
                        title={`Don't import "${c.title}"`}
                        aria-label={`Remove ${c.title}`}
                        onClick={() =>
                          setChapters((prev) =>
                            prev
                              .filter((_, j) => j !== i)
                              // Renumber, or the running order gets a hole in it.
                              .map((x, j) => ({ ...x, order: j + 1 })),
                          )
                        }
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ol>
              </section>

              <section className="import-section">
                <h3>
                  {entities.length} {entities.length === 1 ? "name" : "names"} found in the prose
                </h3>
                {entities.length === 0 ? (
                  <p className="hint">
                    No recurring names stood out. You can always add story bible entries by hand.
                  </p>
                ) : (
                  <>
                    <p className="hint">
                      Ticked entries become story bible notes. Nothing here is created unless you
                      say so — and unticking costs one click.
                    </p>
                    <div className="btn-row">
                      <button
                        className="btn-ghost"
                        onClick={() => setPicked(new Set(entities.map((e) => e.name)))}
                      >
                        Select all
                      </button>
                      <button className="btn-ghost" onClick={() => setPicked(new Set())}>
                        Select none
                      </button>
                    </div>
                    <ul className="entity-list">
                      {entities.map((e) => (
                        <li key={e.name} className={picked.has(e.name) ? "picked" : ""}>
                          <label className="entity-row">
                            <input
                              type="checkbox"
                              checked={picked.has(e.name)}
                              onChange={() => toggle(e.name)}
                            />
                            <span className="entity-name">
                              {e.name}
                              {e.aliases.length > 0 && (
                                <span className="entity-alias"> also “{e.aliases.join("”, “")}”</span>
                              )}
                            </span>
                            <span className="entity-count">{e.count}×</span>
                            <select
                              value={types[e.name] ?? "unknown"}
                              onChange={(ev) =>
                                setTypes((prev) => ({
                                  ...prev,
                                  [e.name]: ev.target.value as EntityGuess,
                                }))
                              }
                              onClick={(ev) => ev.preventDefault()}
                              aria-label={`Type for ${e.name}`}
                            >
                              <option value="character">Character</option>
                              <option value="location">Location</option>
                              <option value="unknown">Note</option>
                            </select>
                          </label>
                          <p className="entity-evidence">{e.evidence}</p>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>

              <div className="btn-row import-actions">
                <button className="btn-primary" onClick={() => void commit()} disabled={!!busy}>
                  Import {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"}
                  {picked.size > 0 && ` and ${picked.size} story bible ${picked.size === 1 ? "entry" : "entries"}`}
                </button>
                <button className="btn-ghost" onClick={() => setStage("choose")} disabled={!!busy}>
                  Back
                </button>
              </div>
            </>
          )}

          {stage === "done" && summary && (
            <>
              <p>
                Imported {summary.chapters} {summary.chapters === 1 ? "chapter" : "chapters"}
                {summary.codex > 0 &&
                  ` and ${summary.codex} story bible ${summary.codex === 1 ? "entry" : "entries"}`}
                .
              </p>
              <p className="hint">
                Story bible entries start nearly empty on purpose — they're a place for what you
                know, not a guess at it. Link them from your prose with [[double brackets]].
              </p>
              <div className="btn-row">
                <button className="btn-primary" onClick={onClose}>
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
