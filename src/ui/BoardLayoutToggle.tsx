import { useEffect, useRef, useState } from "react";
import { boardStore, MANUSCRIPT_BOARD, useBoards } from "../state/boards";

/* Cards vs Grid vs Table — three layouts of the same chapters. All
   reorder the same `order` frontmatter, so switching between them never
   loses or reshuffles anything. (Web and Stats were cut from this
   switch on owner feedback 2026-07-23 — the components survive in the
   codebase if they earn a way back.)

   The board PICKER is a dropdown: with several boards the old pill row
   crowded the header, and the owner read it as clutter. One button,
   named for where you are; the menu lists everywhere you could be. */

export type BoardLayout = "cards" | "grid" | "table" | "web" | "stats";

export function BoardPicker({
  boardId,
  onPick,
}: {
  boardId: string;
  onPick: (id: string) => void;
}) {
  const boards = useBoards();
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) {
        setOpen(false);
        setNaming(false);
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setNaming(false);
      }
    };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  const current =
    boardId === MANUSCRIPT_BOARD
      ? "Manuscript"
      : (boards.find((b) => b.id === boardId)?.name ?? "Manuscript");

  const pick = (id: string) => {
    onPick(id);
    setOpen(false);
    setNaming(false);
  };

  return (
    <div className="board-picker-drop" ref={wrap}>
      <button
        className="board-picker-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Which board you're looking at — the Manuscript is the book itself; other boards are side tables"
      >
        {current} <span className="picker-caret">▾</span>
      </button>

      {open && (
        <div className="board-picker-menu" role="menu">
          <button
            role="menuitem"
            className={`picker-item ${boardId === MANUSCRIPT_BOARD ? "on" : ""}`}
            onClick={() => pick(MANUSCRIPT_BOARD)}
          >
            Manuscript
            <span className="picker-hint">the book, in order</span>
          </button>
          {boards.map((b) => (
            <button
              key={b.id}
              role="menuitem"
              className={`picker-item ${boardId === b.id ? "on" : ""}`}
              onClick={() => pick(b.id)}
            >
              {b.name}
              <span className="picker-hint">
                {b.noteIds.length} {b.noteIds.length === 1 ? "card" : "cards"}
              </span>
            </button>
          ))}

          {naming ? (
            <input
              className="board-new-name"
              autoFocus
              value={name}
              placeholder="Board name…"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  const board = boardStore.add(name);
                  setName("");
                  pick(board.id);
                }
              }}
              aria-label="New board name"
            />
          ) : (
            <button role="menuitem" className="picker-item add" onClick={() => setNaming(true)}>
              + New board…
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const LAYOUTS: { id: BoardLayout; label: string; title: string }[] = [
  { id: "cards", label: "Cards", title: "Loose cards — drag to reorder" },
  { id: "grid", label: "Grid", title: "Plot grid — threads across chapters" },
  { id: "table", label: "Table", title: "The manuscript as a sortable table" },
];

export function BoardLayoutToggle({
  layout,
  setLayout,
}: {
  layout: BoardLayout;
  setLayout: (l: BoardLayout) => void;
}) {
  return (
    <div className="view-switch board-layout" role="group" aria-label="Board layout">
      {LAYOUTS.map((l) => (
        <button
          key={l.id}
          className={layout === l.id ? "on" : ""}
          onClick={() => setLayout(l.id)}
          aria-pressed={layout === l.id}
          title={l.title}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
