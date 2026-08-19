import { useEffect, useRef, useState } from "react";
import { isTauri, storage } from "../storage";
import { SEED_FILES } from "../seed/seedWorld";
import { hydrateProjectBanner, projectStore, type Project } from "../state/projects";
import { reducedMotion } from "./personalize";
import {
  buildFrames,
  frameLabel,
  planReads,
  type PreviewFrame,
} from "./projectPreview";

/* ============================================================
   The project preview

   A small slideshow of what a project actually contains, shown
   before the writer commits to swapping the whole vault into it.
   Four frames at most — cover, the opening of chapter one, the
   codex, the counts — and any frame the project can't fill for
   real is simply absent.

   THE COST RULE. A preview must never cost what an open costs.
   Opening a project reads every Markdown file in it; this reads
   the file NAMES plus at most four files (see planReads). On
   desktop the names come from a directory walk that never opens a
   file. Everything else — chapter count, codex count — is derived
   from the names, which is why the counts are free.

   Reads fail quietly and individually. A project on a disconnected
   drive, a folder that has been renamed, a file with broken
   frontmatter: each of those costs at most one frame, never the
   projects screen. Nothing here writes to the vault.
   ============================================================ */

/** How long a frame sits before the slideshow moves on. Slow on purpose:
    this is a thing to read, not a thing to watch. */
const DWELL_MS = 6000;

/* ---------- reading (the impure half) ---------- */

/** Ceilings for the directory walk. A vault is a book folder, not a drive;
    if something points this at one, the preview stops walking rather than
    hanging the projects screen. */
const MAX_FILES = 4000;
const MAX_DEPTH = 6;

/** Every .md path under a real folder, WITHOUT reading a single file.
    The storage adapter's readAll() would hand back names and contents
    together — hundreds of file reads for a glance — and adapter.ts is
    owned elsewhere, so the cheap path is spelled out here instead. */
async function walkNames(root: string): Promise<string[]> {
  const { readDir } = await import("@tauri-apps/plugin-fs");
  const out: string[] = [];

  const walk = async (abs: string, rel: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
    for (const entry of await readDir(abs)) {
      if (out.length >= MAX_FILES) return;
      // Same rule the adapters use: dotfolders (.git, .obsidian, .novella)
      // are not the book.
      if (entry.name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory) await walk(`${abs}/${entry.name}`, childRel, depth + 1);
      else if (entry.name.toLowerCase().endsWith(".md")) out.push(childRel);
    }
  };

  await walk(root, "", 0);
  return out;
}

/** Names first, contents later. The browser vault has no names-only
    primitive on the adapter, so there we take readAll's result and keep
    only the two-to-four files the slideshow shows — it's one IndexedDB
    transaction against a local, single-project store, not disk I/O. */
async function listVault(root: string): Promise<{ paths: string[]; cache: Map<string, string> }> {
  if (isTauri()) {
    try {
      return { paths: await walkNames(root), cache: new Map() };
    } catch {
      // A shell without the fs plugin, or a scope refusal. The adapter
      // knows another way; better a slower preview than none.
    }
  }
  const files = await storage().readAll(root);
  return { paths: files.map((f) => f.path), cache: new Map(files.map((f) => [f.path, f.contents])) };
}

async function readText(root: string, path: string): Promise<string | null> {
  try {
    const bytes = await storage().readBytes(root, path);
    return bytes ? new TextDecoder().decode(bytes) : null;
  } catch {
    // One unreadable file costs one frame, not the preview.
    return null;
  }
}

/** Build the slideshow for one project. Throws only when the project
    itself can't be reached at all — the caller shows that as a message. */
export async function loadProjectFrames(project: Project): Promise<PreviewFrame[]> {
  if (!project.path) {
    // The bundled demo world: no folder to read, its files ship with the app.
    const contents = new Map(SEED_FILES);
    return buildFrames({ paths: [...contents.keys()], cover: project.banner, contents });
  }

  const root = project.path;
  await storage().grantAccess(root);

  // A project made on another machine keeps its cover in the folder, not in
  // this browser's cache. One small read gets the frame it deserves; without
  // it we'd correctly but sadly decide the project has no cover.
  let cover = project.banner;
  if (!cover) {
    await hydrateProjectBanner(project);
    cover = projectStore.all().find((p) => p.id === project.id)?.banner ?? null;
  }

  const { paths, cache } = await listVault(root);
  const plan = planReads(paths);

  const contents = new Map<string, string>();
  await Promise.all(
    plan.reads.map(async (path) => {
      const text = cache.get(path) ?? (await readText(root, path));
      if (text) contents.set(path, text);
    }),
  );

  return buildFrames({ paths, cover, contents });
}

/* ---------- the modal ---------- */

export function ProjectPreviewModal({
  project,
  active,
  busy,
  onOpen,
  onClose,
}: {
  project: Project;
  /** True when this project is already the open one. */
  active: boolean;
  busy: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [frames, setFrames] = useState<PreviewFrame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const shell = useRef<HTMLDivElement>(null);

  // Load off the render path: the panel paints its spinner immediately and
  // the reads land whenever they land. Keyed on the project, not on the
  // whole object — a banner arriving mid-load must not restart the read.
  useEffect(() => {
    let cancelled = false;
    setFrames(null);
    setError(null);
    setIndex(0);
    loadProjectFrames(project)
      .then((next) => {
        if (!cancelled) setFrames(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? `Could not read this project. ${err.message}`
            : "Could not read this project.",
        );
        setFrames([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.path]);

  const count = frames?.length ?? 0;

  // Gentle auto-advance. A timeout rather than an interval so that paging
  // by hand gives you a full dwell on the frame you chose, and so hover
  // genuinely stops the clock instead of queueing a jump for later.
  useEffect(() => {
    if (count < 2 || paused || reducedMotion()) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), DWELL_MS);
    return () => clearTimeout(timer);
  }, [count, index, paused]);

  useEffect(() => {
    if (count < 2) return;
    const onKey = (e: KeyboardEvent) => {
      // The projects screen behind this has editable name fields. Arrow keys
      // belong to the caret whenever one of them has focus.
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable='true']")) {
        return;
      }
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 1 : -1;
      setIndex((i) => (i + step + count) % count);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count]);

  // Take focus so the arrow keys work without a click, and so the writer
  // isn't still typing into the card's name field underneath.
  useEffect(() => {
    shell.current?.focus();
  }, []);

  const current = frames?.[Math.min(index, count - 1)];
  const openLabel = active ? "Open" : "Open this project";

  return (
    <div className="modal-backdrop project-preview-backdrop" onClick={onClose}>
      <div
        ref={shell}
        tabIndex={-1}
        className="modal project-preview"
        role="dialog"
        aria-modal="true"
        aria-label={`Preview of ${project.name}`}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        // Focus pauses too — but not the shell's own focus-on-open, which
        // would stop the slideshow before it ever started.
        onFocusCapture={(e) => {
          if (e.target !== shell.current) setPaused(true);
        }}
        onBlurCapture={(e) => {
          if (e.target !== shell.current) setPaused(false);
        }}
      >
        <header className="modal-head">
          <h2>{project.name}</h2>
          <button className="icon-btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </header>

        <div className="modal-body preview-body">
          <p className="hint preview-where">
            {project.subtitle ? `${project.subtitle} · ` : ""}
            {project.path === null
              ? "In memory — nothing saved to disk"
              : project.path.startsWith("web://")
                ? "Stored in this browser"
                : project.path}
          </p>

          {frames === null ? (
            <div className="preview-loading">
              <span className="spinner" aria-hidden /> Looking inside…
            </div>
          ) : count === 0 ? (
            <div className="empty-state">
              <span className="empty-glyph" aria-hidden>
                ⁂
              </span>
              <p className="empty-line">
                {error ?? "Nothing to show yet — this project has no writing in it."}
              </p>
            </div>
          ) : (
            <>
              {/* The live region is the stage, which stays put — announcing
                  from the frame itself would announce nothing, since the
                  frame is replaced rather than updated. */}
              <div className="preview-stage" aria-live="polite">
                <button
                  className="icon-btn preview-arrow prev"
                  onClick={() => setIndex((i) => (i - 1 + count) % count)}
                  disabled={count < 2}
                  aria-label="Previous"
                  title="Previous (←)"
                >
                  ‹
                </button>

                {/* Keyed on the index so the CSS entrance animation replays
                    for each frame instead of only the first. */}
                <div className="preview-frame" key={index}>
                  {current && <Frame frame={current} project={project} />}
                </div>

                <button
                  className="icon-btn preview-arrow next"
                  onClick={() => setIndex((i) => (i + 1) % count)}
                  disabled={count < 2}
                  aria-label="Next"
                  title="Next (→)"
                >
                  ›
                </button>
              </div>

              {count > 1 && (
                <div className="preview-dots">
                  {frames.map((frame, i) => (
                    <button
                      key={frame.kind}
                      className={`preview-dot ${i === index ? "on" : ""}`}
                      onClick={() => setIndex(i)}
                      aria-label={frameLabel(frame)}
                      aria-current={i === index}
                      title={frameLabel(frame)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <footer className="btn-row preview-actions">
          <button className="btn-primary" onClick={onOpen} disabled={busy}>
            {openLabel}
          </button>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Not now
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ---------- frames ---------- */

function Frame({ frame, project }: { frame: PreviewFrame; project: Project }) {
  switch (frame.kind) {
    case "cover":
      return (
        <figure className="preview-frame-cover">
          <img className="preview-cover" src={frame.image} alt={`Cover of ${project.name}`} />
        </figure>
      );

    case "opening":
      return (
        <div className="preview-frame-opening">
          <h3 className="preview-frame-title">{frame.title}</h3>
          <div className="preview-prose">
            {frame.paragraphs.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
          <p className="hint preview-frame-note">
            {frame.words.toLocaleString()} word{frame.words === 1 ? "" : "s"} in this chapter
            {frame.truncated ? " — this is how it opens" : ""}
          </p>
        </div>
      );

    case "codex":
      return (
        <div className="preview-frame-codex">
          <h3 className="preview-frame-title">
            {frame.total} codex entr{frame.total === 1 ? "y" : "ies"}
          </h3>
          <ul className="preview-codex-list">
            {frame.entries.map((entry) => (
              <li className="preview-codex-item" key={`${entry.kind}:${entry.title}`}>
                <span className="preview-codex-name">{entry.title}</span>
                <span className="preview-codex-kind">{entry.kind}</span>
                {entry.line && <span className="preview-codex-line">{entry.line}</span>}
              </li>
            ))}
          </ul>
          {frame.total > frame.entries.length && (
            <p className="hint preview-frame-note">
              and {frame.total - frame.entries.length} more
            </p>
          )}
        </div>
      );

    case "stats": {
      // Only counts that are true get a tile. A project with no codex says
      // nothing about its codex rather than proudly displaying a zero.
      const tiles = [
        { n: frame.chapters, label: frame.chapters === 1 ? "chapter" : "chapters" },
        { n: frame.codex, label: frame.codex === 1 ? "codex entry" : "codex entries" },
        { n: frame.notes, label: frame.notes === 1 ? "note" : "notes" },
      ].filter((t) => t.n > 0);
      if (tiles.length === 0) {
        tiles.push({ n: frame.files, label: frame.files === 1 ? "file" : "files" });
      }

      return (
        <div className="preview-frame-stats">
          <h3 className="preview-frame-title">At a glance</h3>
          <div className="preview-stats">
            {tiles.map((tile) => (
              <div className="preview-stat" key={tile.label}>
                <span className="preview-stat-num">{tile.n.toLocaleString()}</span>
                <span className="preview-stat-label">{tile.label}</span>
              </div>
            ))}
          </div>
          {frame.openingWords !== null && (
            <p className="hint preview-frame-note">
              {/* Deliberately the opening chapter only. A whole-vault word
                  count would mean reading the whole vault to draw a card. */}
              {frame.openingWords.toLocaleString()} words in the opening chapter
            </p>
          )}
        </div>
      );
    }
  }
}
