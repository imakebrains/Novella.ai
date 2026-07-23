import { useEffect, useState } from "react";
import { store } from "../state/vaultStore";
import { boardStore, useBoards } from "../state/boards";
import { deleteNoteWithUndo } from "../state/deleteNote";
import { stripWikiLinks } from "../ai/context";
import { saveExport } from "../export/save";

/* The right-click menu for any note, anywhere it appears — the codex
   list, a board card, wherever. One component so "right-click a thing"
   behaves identically across the app instead of each surface growing
   its own half-menu.

   Everything here works on the NOTE (open it, pin it to boards, export
   it, promote it into the manuscript); surfaces can append their own
   extras (like "remove from this board") without forking the menu. */

export interface NoteMenuExtra {
  label: string;
  danger?: boolean;
  action: () => void;
}

export function NoteMenu({
  noteId,
  x,
  y,
  onClose,
  onOpenNote,
  extras = [],
}: {
  noteId: string;
  x: number;
  y: number;
  onClose: () => void;
  /** Called after "Open" so the host can switch views if it needs to. */
  onOpenNote?: () => void;
  extras?: NoteMenuExtra[];
}) {
  const boards = useBoards();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const note = store.vault.get(noteId);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".editor-menu")) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);

  if (!note) return null;
  const isManuscript = note.type === "chapter" || note.type === "scene";

  const exportMarkdown = () => {
    // A shareable chapter, not a database record: title as a heading,
    // prose with the [[link]] plumbing stripped out.
    const filename = `${note.title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || "note"}.md`;
    void saveExport({
      filename,
      data: `# ${note.title}\n\n${stripWikiLinks(note.body).trim()}\n`,
      mime: "text/markdown",
    });
    onClose();
  };

  const style: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - 240),
    top: Math.min(y, window.innerHeight - 300),
  };

  return (
    <div className="editor-menu" style={style} role="menu" aria-label={`Menu for ${note.title}`}>
      <div className="editor-menu-title">“{note.title}”</div>

      <button
        role="menuitem"
        className="editor-menu-item"
        onClick={() => {
          store.open(noteId);
          onOpenNote?.();
          onClose();
        }}
      >
        Open
      </button>

      {!isManuscript && (
        <button
          role="menuitem"
          className="editor-menu-item"
          title="Turns this note into a chapter at the end of the book"
          onClick={() => {
            store.convertToChapter(noteId);
            onClose();
          }}
        >
          Add to Manuscript as chapter
        </button>
      )}

      <button role="menuitem" className="editor-menu-item" onClick={exportMarkdown}>
        Export as Markdown…
      </button>

      <div className="editor-menu-label">Add to board</div>
      {boards.map((b) => {
        const on = b.noteIds.includes(noteId);
        return (
          <button
            key={b.id}
            role="menuitem"
            className="editor-menu-item"
            onClick={() => {
              if (on) boardStore.removeNote(b.id, noteId);
              else boardStore.addNote(b.id, noteId);
              onClose();
            }}
          >
            {on ? "✓ " : ""}
            {b.name}
            {on && <span className="editor-menu-hint"> — remove</span>}
          </button>
        );
      })}
      {naming ? (
        <input
          className="editor-menu-input"
          autoFocus
          value={name}
          placeholder="New board name…"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const board = boardStore.add(name);
              boardStore.addNote(board.id, noteId);
              onClose();
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
          aria-label="New board name"
        />
      ) : (
        <button role="menuitem" className="editor-menu-item" onClick={() => setNaming(true)}>
          + New board…
        </button>
      )}

      {extras.length > 0 && <div className="editor-menu-label">This view</div>}
      {extras.map((extra) => (
        <button
          key={extra.label}
          role="menuitem"
          className={`editor-menu-item ${extra.danger ? "danger" : ""}`}
          onClick={() => {
            extra.action();
            onClose();
          }}
        >
          {extra.label}
        </button>
      ))}

      <button
        role="menuitem"
        className="editor-menu-item danger"
        title="Deletes this note. Undo is offered, and a copy is kept in the project's trash."
        onClick={() => {
          void deleteNoteWithUndo(noteId);
          onClose();
        }}
      >
        Delete note
      </button>
    </div>
  );
}
