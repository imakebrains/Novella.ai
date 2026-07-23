import { useEffect, useMemo, useState } from "react";
import { compileManuscript, defaultTitle } from "../export/compile";
import { backupProject } from "../export/backup";
import { openPrintWindow } from "../export/printPdf";
import { render, type Format } from "../export/formats";
import { saveExport } from "../export/save";
import { bylineOf, useProfile } from "../state/profile";
import { isTauri, storage } from "../storage";
import { store } from "../state/vaultStore";

type Choice = Format | "pdf" | "backup";

const FORMATS: { id: Choice; label: string; blurb: string }[] = [
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
  {
    id: "pdf",
    label: "PDF (print)",
    blurb:
      "Opens a print-ready copy — choose “Save as PDF” in the dialog. Proper page breaks, chapter starts, book typography.",
  },
  {
    id: "backup",
    label: "Full backup (.zip)",
    blurb:
      "The entire project — manuscript, codex, history, covers, boards, agents. Unzip it anywhere and open the folder to restore. Make one before anything that scares you.",
  },
];

export function ExportModal({ onClose }: { onClose: () => void }) {
  const [profile] = useProfile();
  const [format, setFormat] = useState<Choice>("docx");
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

  // Last-used options come back on reopen — retyping the byline for the
  // fourth export of the same book is pure friction. Per project, in
  // .novella/, so it travels with the folder like everything else.
  useEffect(() => {
    const root = store.vaultRoot();
    if (!root) return;
    storage()
      .readBytes(root, ".novella/export.json")
      .then((bytes) => {
        if (!bytes) return;
        const saved = JSON.parse(new TextDecoder().decode(bytes)) as Partial<{
          format: Choice;
          title: string;
          author: string;
          skipEmpty: boolean;
        }>;
        if (saved.format && FORMATS.some((f) => f.id === saved.format)) setFormat(saved.format);
        if (typeof saved.title === "string" && saved.title) setTitle(saved.title);
        if (typeof saved.author === "string") setAuthor(saved.author);
        if (typeof saved.skipEmpty === "boolean") setSkipEmpty(saved.skipEmpty);
      })
      .catch(() => {
        /* corrupt or missing presets aren't worth an error */
      });
  }, []);

  const manuscript = useMemo(
    () => compileManuscript({ title, author, skipEmpty }),
    [title, author, skipEmpty],
  );

  const run = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      if (format === "pdf") {
        if (openPrintWindow(manuscript)) setDone("Print dialog opened — choose “Save as PDF”.");
        else setError("The print window was blocked. Allow pop-ups for Novella and try again.");
      } else if (format === "backup") {
        const r = await backupProject();
        if (r.savedTo) {
          setDone(
            `${r.savedTo} — ${r.fileCount} files, ${(r.bytes / 1024).toFixed(0)} KB`,
          );
        }
      } else {
        const result = await render(manuscript, format);
        const where = await saveExport(result);
        if (where) setDone(where);
      }
      const root = store.vaultRoot();
      if (root) {
        void storage()
          .writeBytes(
            root,
            ".novella/export.json",
            new TextEncoder().encode(JSON.stringify({ format, title, author, skipEmpty })),
          )
          .catch(() => {});
      }
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
          {format !== "backup" && (
          <>
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
                aria-label="Skip empty chapters"
              />
              <span className="switch-track" />
            </label>
          </div>
          </>
          )}

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
            {format === "backup" ? (
              <>Everything in the project, including its history and settings.</>
            ) : empty ? (
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
            <button className="btn-primary" onClick={() => void run()} disabled={busy || (empty && format !== "backup")}>
              {busy ? "Working…" : format === "backup" ? "Back up now" : `Export ${FORMATS.find((f) => f.id === format)?.label}`}
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
