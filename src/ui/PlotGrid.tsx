import { useRef, useState } from "react";
import type { Note } from "../core/vault";
import { store, useVaultVersion } from "../state/vaultStore";
import { stripWikiLinks } from "../ai/context";
import { countWords } from "../analysis/prose";
import { taskProgress } from "../core/tasks";
import { useActiveProject } from "../state/projects";
import { plotStore, threadColor, usePlotThreads, type PlotThread } from "../state/plot";
import { BoardLayoutToggle, type BoardLayout } from "./BoardLayoutToggle";

/* The plot grid.

   Rows are chapters in manuscript order; columns are plot threads. Each
   cell holds the plot points for that thread in that chapter. It's the
   view a plotter lives in — seeing every subplot advance (or stall)
   chapter by chapter, side by side.

   The leftmost column is the manuscript itself, and dragging a chapter
   there reorders the book exactly as the corkboard does — same `order`
   frontmatter, so the two board layouts stay in perfect agreement. A
   chapter's plot points ride along on reorder because they live in that
   chapter's own frontmatter. */

const DRAG_THRESHOLD_PX = 5;

export function PlotGrid({
  onOpen,
  layout,
  setLayout,
}: {
  onOpen: (id: string) => void;
  layout: BoardLayout;
  setLayout: (l: BoardLayout) => void;
}) {
  useVaultVersion();
  const project = useActiveProject();
  const threads = usePlotThreads();
  const chapters = store.orderedChapters();

  const bodyRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [offsetY, setOffsetY] = useState(0);
  const drag = useRef<{ id: string; startY: number; active: boolean } | null>(null);

  /** Which row index sits under a vertical position, skipping the dragged
      row (it's following the cursor, so it would always win). */
  const rowAt = (y: number, skipId: string): number | null => {
    const body = bodyRef.current;
    if (!body) return null;
    for (const el of body.querySelectorAll<HTMLElement>("[data-row-index]")) {
      if (el.dataset.rowId === skipId) continue;
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) return Number(el.dataset.rowIndex);
    }
    return null;
  };

  const commit = (fromId: string, toIndex: number) => {
    const ids = chapters.map((c) => c.id);
    const from = ids.indexOf(fromId);
    if (from < 0 || toIndex < 0 || from === toIndex) return;
    ids.splice(toIndex, 0, ids.splice(from, 1)[0]!);
    store.reorderChapters(ids);
  };

  const onRowPointerDown = (e: React.PointerEvent<HTMLElement>, id: string) => {
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* drag still works without capture */
    }
    drag.current = { id, startY: e.clientY, active: false };
  };

  const onRowPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.active) {
      if (Math.abs(e.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
      d.active = true;
      setDragId(d.id);
    }
    setOffsetY(e.clientY - d.startY);
    const idx = rowAt(e.clientY, d.id);
    if (idx !== null) setOverIndex(idx);
  };

  const onRowPointerUp = (e: React.PointerEvent<HTMLElement>, id: string) => {
    const d = drag.current;
    drag.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* already released */
    }
    if (d?.active) {
      const idx = rowAt(e.clientY, d.id);
      if (idx !== null) commit(d.id, idx);
    } else {
      onOpen(id);
    }
    setDragId(null);
    setOverIndex(null);
    setOffsetY(0);
  };

  const cancelDrag = () => {
    drag.current = null;
    setDragId(null);
    setOverIndex(null);
    setOffsetY(0);
  };

  const templateColumns = `var(--pg-chapter-w, 15rem) repeat(${threads.length}, minmax(11rem, 1fr))`;

  return (
    <main className="corkboard plot-grid-view">
      {project?.banner && (
        <div
          className="board-banner"
          style={{ backgroundImage: `url(${project.banner})` }}
          role="img"
          aria-label={`Cover art for ${project.name}`}
        >
          <span className="board-banner-title">{project.name}</span>
        </div>
      )}

      <header className="board-head">
        <div className="board-head-left">
          <h1 className="board-title">{project?.name ?? "Manuscript"}</h1>
          <span className="board-meta">
            {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"} ·{" "}
            {threads.length} {threads.length === 1 ? "thread" : "threads"} · drag a chapter to reorder
          </span>
        </div>
        <div className="board-head-right">
          <button className="btn-ghost" onClick={() => plotStore.add("New thread")}>
            + Thread
          </button>
          <BoardLayoutToggle layout={layout} setLayout={setLayout} />
        </div>
      </header>

      {chapters.length === 0 ? (
        <div className="empty-state">
          <p>No chapters yet.</p>
          <p className="muted">
            Anything typed <code>chapter</code> or <code>scene</code> shows up here.
          </p>
        </div>
      ) : (
        <div className="plot-grid-scroll">
          <div className="plot-grid" style={{ gridTemplateColumns: templateColumns }} ref={bodyRef}>
            {/* header row */}
            <div className="pg-corner">Chapters</div>
            {threads.map((thread) => (
              <ThreadHead key={thread.id} thread={thread} count={threads.length} />
            ))}
            {threads.length === 0 && (
              <div className="pg-no-threads">
                Add a thread to start mapping subplots across your chapters.
              </div>
            )}

            {/* body rows */}
            {chapters.map((chapter, i) => (
              <Row
                key={chapter.id}
                chapter={chapter}
                index={i}
                threads={threads}
                dragging={dragId === chapter.id}
                dropTarget={overIndex === i && dragId !== null && dragId !== chapter.id}
                offsetY={dragId === chapter.id ? offsetY : 0}
                onPointerDown={(e) => onRowPointerDown(e, chapter.id)}
                onPointerMove={onRowPointerMove}
                onPointerUp={(e) => onRowPointerUp(e, chapter.id)}
                onPointerCancel={cancelDrag}
              />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

function ThreadHead({ thread, count }: { thread: PlotThread; count: number }) {
  const [open, setOpen] = useState(false);
  const color = threadColor(thread.color);

  return (
    <div className="pg-thread-head" style={{ borderTopColor: color }}>
      <input
        className="pg-thread-name"
        value={thread.name}
        aria-label="Thread name"
        onChange={(e) => plotStore.update(thread.id, { name: e.target.value })}
      />
      <button
        className="pg-thread-menu"
        onClick={() => setOpen((v) => !v)}
        title="Thread options"
        aria-label={`Options for ${thread.name}`}
      >
        ⋯
      </button>
      {open && (
        <div className="pg-thread-pop" onMouseLeave={() => setOpen(false)}>
          <div className="pg-swatches">
            {Array.from({ length: 8 }, (_, i) => (
              <button
                key={i}
                className={`pg-swatch ${thread.color === i ? "on" : ""}`}
                style={{ background: threadColor(i) }}
                aria-label={`Colour ${i + 1}`}
                onClick={() => {
                  plotStore.update(thread.id, { color: i });
                  setOpen(false);
                }}
              />
            ))}
          </div>
          <div className="pg-thread-actions">
            <button onClick={() => { plotStore.reorder(thread.id, -1); setOpen(false); }} disabled={count < 2}>
              ← Move left
            </button>
            <button onClick={() => { plotStore.reorder(thread.id, 1); setOpen(false); }} disabled={count < 2}>
              Move right →
            </button>
            <button
              className="danger"
              onClick={() => {
                if (
                  confirm(
                    `Delete the "${thread.name}" thread? Its plot points on every chapter are removed too. The chapters themselves are untouched.`,
                  )
                ) {
                  plotStore.remove(thread.id);
                }
                setOpen(false);
              }}
            >
              Delete thread
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  chapter,
  index,
  threads,
  dragging,
  dropTarget,
  offsetY,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  chapter: Note;
  index: number;
  threads: PlotThread[];
  dragging: boolean;
  dropTarget: boolean;
  offsetY: number;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
}) {
  const words = countWords(chapter.body);
  const tasks = taskProgress(chapter.body);
  const pov =
    typeof chapter.data.pov === "string" ? stripWikiLinks(chapter.data.pov).trim() : null;

  return (
    <>
      <article
        className={`pg-chapter ${dragging ? "dragging" : ""} ${dropTarget ? "drop-target" : ""}`}
        data-row-index={index}
        data-row-id={chapter.id}
        style={dragging ? { transform: `translateY(${offsetY}px)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        role="button"
        tabIndex={0}
        aria-label={`${chapter.title}. Chapter ${index + 1}. Click to open, drag to reorder.`}
      >
        <div className="pg-chapter-top">
          <span className="card-index">{index + 1}</span>
          {store.isDirty(chapter.id) && <span className="dot-dirty" title="Unsaved" />}
        </div>
        <h2 className="pg-chapter-title">{chapter.title}</h2>
        <div className="pg-chapter-foot">
          {pov && (
            <span className="chip">
              <span className="type-dot" data-type="character" /> {pov}
            </span>
          )}
          {tasks.total > 0 && (
            <span
              className={`chip task-chip ${tasks.done === tasks.total ? "all-done" : ""}`}
              title={`${tasks.done} of ${tasks.total} tasks done`}
            >
              ✓ {tasks.done}/{tasks.total}
            </span>
          )}
          <span className="card-words">{words.toLocaleString()}w</span>
        </div>
      </article>

      {threads.map((thread) => (
        <PlotCell key={thread.id} chapter={chapter} thread={thread} dropTarget={dropTarget} />
      ))}
    </>
  );
}

function PlotCell({
  chapter,
  thread,
  dropTarget,
}: {
  chapter: Note;
  thread: PlotThread;
  dropTarget: boolean;
}) {
  const points = store.plotPointsOf(chapter, thread.id);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState("");
  const color = threadColor(thread.color);

  const startEdit = (index: number | "new") => {
    setEditing(index);
    setDraft(index === "new" ? "" : (points[index] ?? ""));
  };

  const commit = () => {
    const text = draft.trim();
    const next = [...points];
    if (editing === "new") {
      if (text) next.push(text);
    } else if (typeof editing === "number") {
      if (text) next[editing] = text;
      else next.splice(editing, 1);
    }
    store.setPlotPoints(chapter.id, thread.id, next);
    setEditing(null);
    setDraft("");
  };

  return (
    <div className={`pg-cell ${dropTarget ? "drop-target" : ""}`}>
      {points.map((point, i) =>
        editing === i ? (
          <textarea
            key={i}
            className="pg-point-edit"
            data-no-drag
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                setEditing(null);
                setDraft("");
              }
            }}
          />
        ) : (
          <button
            key={i}
            className="pg-point"
            data-no-drag
            style={{ borderLeftColor: color }}
            onClick={() => startEdit(i)}
            title="Click to edit"
          >
            {point}
          </button>
        ),
      )}

      {editing === "new" ? (
        <textarea
          className="pg-point-edit"
          data-no-drag
          autoFocus
          placeholder="A beat for this thread…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setEditing(null);
              setDraft("");
            }
          }}
        />
      ) : (
        <button className="pg-point-add" data-no-drag onClick={() => startEdit("new")} title="Add a plot point">
          +
        </button>
      )}
    </div>
  );
}
