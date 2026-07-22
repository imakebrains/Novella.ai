import { useEffect, useMemo, useState } from "react";
import { compileManuscript, defaultTitle } from "../export/compile";
import { render, type Format } from "../export/formats";
import { saveExport } from "../export/save";
import { bylineOf, useProfile } from "../state/profile";
import { isTauri } from "../storage";

const FORMATS: { id: Format; label: string; blurb: string }[] = [
  {
    id: "docx",
    label: "Word (.docx)",
    blurb:
      "Standard manuscript format — 12pt Times New Roman, double spaced, chapters on new pages. What agents and editors ask for.",
  },
  {
    id: "epub",
    label: "EPUB (.epub)",
    blurb: "For e-readers and self-publishing platforms. Includes a table of contents.",
  },
  {
    id: "markdown",
    label: "Markdown (.md)",
    blurb: "One plain-text file. Nothing is lost, and every tool can read it.",
  },
];

export function ExportModal({ onClose }: { onClose: () => void }) {
  const [profile] = useProfile();
  const [format, setFormat] = useState<Format>("docx");
  const [title, setTitle] = useState(defaultTitle);
  const [author, setAuthor] = useState(() => bylineOf(profile));
  const [skipEmpty, setSkipEmpty] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const manuscript = useMemo(
    () => compileManuscript({ title, author, skipEmpty }),
    [title, author, skipEmpty],
  );

  const run = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const result = await render(manuscript, format);
      const where = await saveExport(result);
      if (where) setDone(where);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const empty = manuscript.chapters.length === 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Export manuscript</h2>
          <button className="icon-btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <div className="setting">
            <label className="setting-label">Title</label>
            <input
              className="search bare"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Book title"
            />
          </div>

          <div className="setting">
            <label className="setting-label">Author</label>
            <input
              className="search bare"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Name on the title page"
            />
          </div>
          {!bylineOf(profile) && (
            <p className="hint">
              Tip: set your name in Settings → Profile and it fills in here automatically.
            </p>
          )}

          <div className="setting">
            <label className="setting-label">Skip empty chapters</label>
            <label className="switch">
              <input
                type="checkbox"
                checked={skipEmpty}
                onChange={(e) => setSkipEmpty(e.target.checked)}
              />
              <span className="switch-track" />
            </label>
          </div>

          <h3 className="settings-cat">Format</h3>
          <div className="format-list">
            {FORMATS.map((f) => (
              <label key={f.id} className={`radio-row ${format === f.id ? "on" : ""}`}>
                <input
                  type="radio"
                  name="export-format"
                  checked={format === f.id}
                  onChange={() => setFormat(f.id)}
                />
                <span className="radio-text">
                  <span className="radio-label">{f.label}</span>
                  <span className="radio-detail wrap">{f.blurb}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="export-summary">
            {empty ? (
              <span className="warn-text">
                Nothing to export — no chapters have prose in them yet.
              </span>
            ) : (
              <>
                <strong>{manuscript.chapters.length}</strong> chapter
                {manuscript.chapters.length === 1 ? "" : "s"} ·{" "}
                <strong>{manuscript.words.toLocaleString()}</strong> words
              </>
            )}
          </div>

          {error && <div className="notice error-notice">{error}</div>}
          {done && (
            <div className="notice">
              <strong>Exported.</strong>
              <p>{isTauri() ? done : `Saved to your downloads as ${done}`}</p>
            </div>
          )}

          <div className="btn-row">
            <button className="btn-primary" onClick={() => void run()} disabled={busy || empty}>
              {busy ? "Exporting…" : `Export ${FORMATS.find((f) => f.id === format)?.label}`}
            </button>
            <button className="btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
