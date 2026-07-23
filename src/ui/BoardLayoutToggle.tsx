import { useState } from "react";
import { boardStore, MANUSCRIPT_BOARD, useBoards } from "../state/boards";

/* Cards vs Grid — two layouts of the same chapters.

   The corkboard ("Cards") is the loose, spatial view; the plot grid
   ("Grid") is the structured, thread-by-thread view. Both reorder the
   same `order` frontmatter, so switching between them never loses or
   reshuffles anything. Shared here so both boards render an identical
   control in their header.

   The board PICKER is shared too — Manuscript plus the writer's own
   boards — so it exists in every layout. The plot grid is manuscript-
   specific, so picking a custom board from it lands in Cards. */

export type BoardLayout = "cards" | "grid" | "web" | "stats";

export function BoardPicker({
  boardId,
  onPick,
}: {
  boardId: string;
  onPick: (id: string) => void;
}) {
  const boards = useBoards();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  return (
    <div className="board-picker" role="group" aria-label="Which board">
      <button
        className={`board-pick ${boardId === MANUSCRIPT_BOARD ? "on" : ""}`}
        onClick={() => onPick(MANUSCRIPT_BOARD)}
      >
        Manuscript
      </button>
      {boards.map((b) => (
        <button
          key={b.id}
          className={`board-pick ${boardId === b.id ? "on" : ""}`}
          onClick={() => onPick(b.id)}
          title={`${b.noteIds.length} cards`}
        >
          {b.name}
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
            if (e.key === "Enter") {
              const board = boardStore.add(name);
              setName("");
              setNaming(false);
              onPick(board.id);
            } else if (e.key === "Escape") {
              setNaming(false);
              setName("");
            }
          }}
          onBlur={() => {
            setNaming(false);
            setName("");
          }}
          aria-label="New board name"
        />
      ) : (
        <button
          className="board-pick add"
          onClick={() => setNaming(true)}
          title="New board — a working table for any notes, in any order"
        >
          +
        </button>
      )}
    </div>
  );
}

const LAYOUTS: { id: BoardLayout; label: string; title: string }[] = [
  { id: "cards", label: "Cards", title: "Loose cards" },
  { id: "grid", label: "Grid", title: "Plot grid — threads across chapters" },
  { id: "web", label: "Web", title: "The codex as a living map of who connects to whom" },
  { id: "stats", label: "Stats", title: "Pacing — words, threads and tasks across chapters" },
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
