import { useRef, useState } from "react";
import type { Note } from "../core/vault";
import { store, useVaultVersion } from "../state/vaultStore";
import { stripWikiLinks } from "../ai/context";
import { cardDerived } from "./cardDerived";
import { cardImageOf, removeCardImage, setCardImage, useCardImages } from "../state/cardImages";
import { showUndo } from "../state/undo";
import { useActiveProject } from "../state/projects";
import { boardStore, MANUSCRIPT_BOARD, useBoards } from "../state/boards";
import { plotStore, threadColor, usePlotThreads } from "../state/plot";
import { BoardLayoutToggle, BoardPicker, type BoardLayout } from "./BoardLayoutToggle";
import { NoteMenu } from "./NoteMenu";

/* The corkboard.

   Every chapter as a card, dragged to reorder. Order is stored as a
   frontmatter number, so it survives to disk and never requires renaming
   files — renaming would break every [[link]] pointing at them.

   Dragging is pointer-based rather than HTML5 drag-and-drop. The first
   version used `draggable`, which silently doesn't work here: most of the
   card is a <button> (so it can be clicked to open), and browsers refuse
   to start a native drag from inside a button. Only a thin strip at the
   top was grabbable, which felt broken. Pointer events have no such
   restriction, work with touch and pen, and let the card follow the
   cursor properly. */

const DRAG_THRESHOLD_PX = 5;

export function Corkboard({
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
  const boards = useBoards();
  usePlotThreads();
  const [boardId, setBoardId] = useState<string>(
    () => localStorage.getItem("novella.activeBoard") ?? MANUSCRIPT_BOARD,
  );
  const [cardMenu, setCardMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [adding, setAdding] = useState(false);

  // The manuscript board is the chapters in reading order. A custom board
  // is whatever notes were put on it, in the board's own order — reordering
  // one never touches the book.
  const customBoard = boards.find((b) => b.id === boardId);
  const onManuscript = !customBoard;
  const chapters = onManuscript
    ? store.orderedChapters()
    : (customBoard?.noteIds ?? [])
        .map((id) => store.vault.get(id))
        .filter((n): n is NonNullable<typeof n> => Boolean(n));

  const pickBoard = (id: string) => {
    setBoardId(id);
    localStorage.setItem("novella.activeBoard", id);
  };

  const gridRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  // How far the dragged card has moved from where it was grabbed. The card
  // is translated by this so it physically follows the cursor — a card that
  // stays pinned in place while you drag reads as broken.
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);

  // Mutable drag bookkeeping. Refs, not state: pointermove fires far
  // faster than React re-renders, and the first few moves would be lost
  // waiting for state to settle.
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);

  /** Which card index sits under a point, by hit-testing the rendered cards.
      The dragged card is skipped — it's moving with the cursor, so it would
      otherwise always be the answer. */
  const indexAt = (x: number, y: number, skipId?: string | null): number | null => {
    const grid = gridRef.current;
    if (!grid) return null;
    for (const card of grid.querySelectorAll<HTMLElement>("[data-card-index]")) {
      if (skipId && card.dataset.cardId === skipId) continue;
      const r = card.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return Number(card.dataset.cardIndex);
      }
    }
    return null;
  };

  const commit = (fromId: string, toIndex: number) => {
    const ids = chapters.map((c) => c.id);
    const from = ids.indexOf(fromId);
    if (from < 0 || toIndex < 0 || from === toIndex) return;
    ids.splice(toIndex, 0, ids.splice(from, 1)[0]!);
    if (onManuscript) store.reorderChapters(ids);
    else boardStore.setOrder(boardId, ids);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>, id: string) => {
    // Ignore the nudge buttons — they have their own job.
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    if (e.button !== 0) return;

    // Capture keeps the drag alive when the cursor outruns the card.
    // It can throw if the pointer is already released; a failed capture
    // shouldn't take dragging down with it.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* drag still works, just without capture */
    }
    drag.current = { id, startX: e.clientX, startY: e.clientY, active: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;

    if (!d.active) {
      // A click shouldn't become a drag; require real movement first,
      // otherwise opening a chapter would be impossible.
      const moved = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
      if (moved < DRAG_THRESHOLD_PX) return;
      d.active = true;
      setDragId(d.id);
    }

    setOffset({ x: e.clientX - d.startX, y: e.clientY - d.startY });

    const idx = indexAt(e.clientX, e.clientY, d.id);
    if (idx !== null) setOverIndex(idx);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLElement>, id: string) => {
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
      const idx = indexAt(e.clientX, e.clientY, d.id);
      if (idx !== null) commit(d.id, idx);
    } else {
      // Never moved — treat as a click and open the chapter.
      onOpen(id);
    }

    setDragId(null);
    setOverIndex(null);
    setOffset(null);
  };

  const cancelDrag = () => {
    drag.current = null;
    setDragId(null);
    setOverIndex(null);
    setOffset(null);
  };

  return (
    <main className="corkboard">
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
          <h1 className="board-title">
            {onManuscript ? (project?.name ?? "Manuscript") : customBoard.name}
          </h1>
          <span className="board-meta">
            {chapters.length} {chapters.length === 1 ? "card" : "cards"} ·{" "}
            {chapters.reduce((sum, c) => sum + cardDerived(c).words, 0).toLocaleString()} words ·
            drag to reorder
            {!onManuscript && " · this board's order only — the book is untouched"}
          </span>
        </div>
        <div className="board-head-right">
          <BoardPicker boardId={onManuscript ? MANUSCRIPT_BOARD : boardId} onPick={pickBoard} />
          {!onManuscript && (
            <button className="btn-primary" onClick={() => setAdding(true)}>
              + Add cards
            </button>
          )}
          {!onManuscript && (
            <button
              className="btn-ghost"
              onClick={() => {
                // No confirm() dialog — some webviews suppress those and the
                // button reads as dead. Delete now, offer the way back.
                const snapshot = { ...customBoard, noteIds: [...customBoard.noteIds] };
                boardStore.remove(boardId);
                pickBoard(MANUSCRIPT_BOARD);
                showUndo(`Deleted the “${snapshot.name}” board`, () => {
                  boardStore.restore(snapshot);
                });
              }}
              title="Delete this board — its notes stay, and Undo is offered"
            >
              Delete board
            </button>
          )}
          {onManuscript && <BoardLayoutToggle layout={layout} setLayout={setLayout} />}
        </div>
      </header>

      {chapters.length === 0 && (
        <div className="empty-state">
          {onManuscript ? (
            <>
              <p>No chapters yet.</p>
              <p className="muted">
                Anything typed <code>chapter</code> or <code>scene</code> shows up here.
              </p>
            </>
          ) : (
            <>
              <p>Nothing on this board yet.</p>
              <p className="muted">
                Click the dashed <em>Add cards</em> tile below to pin chapters and
                notes here — or right-click anything in the left pane or the editor.
              </p>
            </>
          )}
        </div>
      )}

      <div className="board-grid" ref={gridRef}>
        {chapters.map((chapter, i) => (
          <Card
            key={chapter.id}
            note={chapter}
            index={i}
            boardId={onManuscript ? null : boardId}
            dragging={dragId === chapter.id}
            dropTarget={overIndex === i && dragId !== null && dragId !== chapter.id}
            offset={dragId === chapter.id ? offset : null}
            onPointerDown={(e) => onPointerDown(e, chapter.id)}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => onPointerUp(e, chapter.id)}
            onPointerCancel={cancelDrag}
            onContextMenu={(e) => {
              e.preventDefault();
              setCardMenu({ id: chapter.id, x: e.clientX, y: e.clientY });
            }}
            onNudge={(dir) => {
              const ids = chapters.map((c) => c.id);
              const target = i + dir;
              if (target < 0 || target >= ids.length) return;
              ids.splice(target, 0, ids.splice(i, 1)[0]!);
              store.reorderChapters(ids);
            }}
          />
        ))}

        {/* The two dashed tiles are the discoverable path — an empty
            outline where a card would be says "make one" without a
            manual. The header buttons still exist for muscle memory. */}
        <button
          className="ghost-card"
          onClick={() => {
            if (onManuscript) {
              let n = chapters.length + 1;
              while (store.vault.resolveLink(`Chapter ${n}`)) n++;
              store.createNote("chapter", `Chapter ${n}`);
            } else {
              setAdding(true);
            }
          }}
          title={
            onManuscript
              ? "A fresh chapter at the end of the book — rename it any time"
              : "Pin existing chapters and notes to this board"
          }
        >
          <span className="ghost-card-plus">+</span>
          <span className="ghost-card-label">{onManuscript ? "New chapter" : "Add cards"}</span>
        </button>

        <NewBoardTile
          onCreate={(name) => {
            const b = boardStore.add(name);
            pickBoard(b.id);
            setAdding(true);
          }}
        />
      </div>

      {cardMenu && (
        <NoteMenu
          noteId={cardMenu.id}
          x={cardMenu.x}
          y={cardMenu.y}
          onClose={() => setCardMenu(null)}
          onOpenNote={() => onOpen(cardMenu.id)}
          extras={
            onManuscript
              ? []
              : [
                  {
                    label: "Remove from this board",
                    danger: true,
                    action: () => boardStore.removeNote(boardId, cardMenu.id),
                  },
                ]
          }
        />
      )}

      {adding && !onManuscript && customBoard && (
        <AddCardsPicker
          boardId={boardId}
          onClose={() => setAdding(false)}
        />
      )}
    </main>
  );
}

/* The new-board tile: a dashed outline that becomes a name field on
   click. Creating switches straight to the fresh board and opens the
   add-cards picker, so "new board" never lands on a dead end. */
function NewBoardTile({ onCreate }: { onCreate: (name: string) => void }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  if (!naming) {
    return (
      <button
        className="ghost-card"
        onClick={() => setNaming(true)}
        title="A separate board of cards — planning, research, anything. The book is untouched."
      >
        <span className="ghost-card-plus">+</span>
        <span className="ghost-card-label">New board</span>
      </button>
    );
  }

  return (
    <div className="ghost-card naming">
      <input
        className="board-new-name"
        autoFocus
        value={name}
        placeholder="Name the board…"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) {
            onCreate(name.trim());
            setName("");
            setNaming(false);
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
      <p className="hint">Enter creates · Esc cancels</p>
    </div>
  );
}

/* The add-cards picker — a custom board fills from here.

   Every note in the project, tick to pin. This answered a real confusion:
   a fresh board looked like a dead end because the only way onto it was a
   right-click somewhere else entirely. */
function AddCardsPicker({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  useVaultVersion();
  const [query, setQuery] = useState("");
  const board = boardStore.get(boardId);
  const q = query.trim().toLowerCase();
  const notes = store.vault
    .all()
    .filter((n) => n.type !== "prompt")
    .filter((n) => !q || n.title.toLowerCase().includes(q))
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal add-cards-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Add to “{board?.name ?? "board"}”</h2>
          <button className="icon-btn" onClick={onClose} title="Done (Esc)">
            ✕
          </button>
        </header>
        <div className="modal-body">
          <input
            className="search bare"
            autoFocus
            value={query}
            placeholder="Filter notes…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
            aria-label="Filter notes"
          />
          <ul className="add-cards-list">
            {notes.map((n) => {
              const on = board?.noteIds.includes(n.id) ?? false;
              return (
                <li key={n.id}>
                  <label className="add-cards-row">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        if (on) boardStore.removeNote(boardId, n.id);
                        else boardStore.addNote(boardId, n.id);
                      }}
                    />
                    <span className="type-dot" data-type={n.type} />
                    <span className="add-cards-name">{n.title}</span>
                    <span className="add-cards-type">{n.type}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="hint">
            Cards are the notes themselves — pinning one here never copies or moves it.
          </p>
        </div>
      </div>
    </div>
  );
}

function Card({
  note,
  index,
  boardId,
  dragging,
  dropTarget,
  offset,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onContextMenu,
  onNudge,
}: {
  note: Note;
  index: number;
  /** Set when this card sits on a custom board — enables "remove". */
  boardId: string | null;
  dragging: boolean;
  dropTarget: boolean;
  offset: { x: number; y: number } | null;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
  onContextMenu: (e: React.MouseEvent<HTMLElement>) => void;
  onNudge: (dir: -1 | 1) => void;
}) {
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  useCardImages();
  const art = cardImageOf(note.id);
  const derived = cardDerived(note);
  const words = derived.words;
  const tasks = derived.tasks;
  const pov = typeof note.data.pov === "string" ? stripWikiLinks(note.data.pov).trim() : null;
  const synopsis =
    typeof note.data.synopsis === "string" ? note.data.synopsis : derived.stripped;
  const beats = store.beatsOf(note);
  // Which plot threads run through this chapter — shown as colour dots so
  // the cards carry the grid's information without the grid.
  const threadDots = plotStore
    .columns()
    .filter((t) => store.plotPointsOf(note, t.id).length > 0);

  const commitTag = () => {
    const tag = tagDraft.trim();
    if (tag) store.setTags(note.id, [...note.tags, tag]);
    setTagDraft("");
    setAddingTag(false);
  };

  return (
    <article
      className={`board-card ${dragging ? "dragging" : ""} ${dropTarget ? "drop-target" : ""}`}
      data-card-index={index}
      data-card-id={note.id}
      style={
        offset
          ? { transform: `translate(${offset.x}px, ${offset.y}px) rotate(1.5deg)` }
          : undefined
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={onContextMenu}
      onDragOver={(e) => {
        if ([...e.dataTransfer.items].some((i) => i.kind === "file")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
        if (!file) return;
        e.preventDefault();
        e.stopPropagation();
        void setCardImage(note.id, file);
      }}
      tabIndex={0}
      role="button"
      aria-label={`${note.title}. Chapter ${index + 1}. Click to open.`}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onNudge(-1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onNudge(1);
        }
      }}
    >
      {art && (
        <div className="card-art-wrap" data-no-drag>
          <img className="card-art" src={art} alt="" draggable={false} />
          <button
            className="card-art-remove"
            title="Remove this image"
            onClick={(e) => {
              e.stopPropagation();
              void removeCardImage(note.id);
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* No arrow buttons — the card is dragged, full stop. Keyboard users
          still get ← / → via onKeyDown below, which stays out of the way. */}
      <div className="card-top">
        <span className="card-index">{index + 1}</span>
        {store.isDirty(note.id) && <span className="dot-dirty" title="Unsaved" />}
      </div>

      <div className="card-body">
        <h2 className="card-title">{note.title}</h2>
        {synopsis ? (
          <p className="card-synopsis">{synopsis.slice(0, 220)}</p>
        ) : (
          <p className="card-synopsis empty">Nothing written yet.</p>
        )}
      </div>

      <footer className="card-foot">
        {threadDots.length > 0 && (
          <span className="card-threads" data-no-drag>
            {threadDots.map((t) => (
              <span
                key={t.id}
                className="thread-dot"
                style={{ background: threadColor(t.color) }}
                title={`Thread: ${t.name}`}
              />
            ))}
          </span>
        )}
        {pov && (
          <span className="chip">
            <span className="type-dot" data-type="character" /> {pov}
          </span>
        )}
        {note.tags.map((tag) => (
          <span key={tag} className="chip tag-chip" title={`Tagged ${tag}`}>
            #{tag}
          </span>
        ))}
        {addingTag ? (
          <input
            className="tag-input"
            data-no-drag
            autoFocus
            value={tagDraft}
            placeholder="tag…"
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTag();
              else if (e.key === "Escape") {
                setAddingTag(false);
                setTagDraft("");
              }
            }}
            onBlur={commitTag}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`Add a tag to ${note.title}`}
          />
        ) : (
          <button
            className="chip tag-add"
            data-no-drag
            title="Add a tag"
            onClick={(e) => {
              e.stopPropagation();
              setAddingTag(true);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            +
          </button>
        )}
        {beats.length > 0 && (
          <span className="chip" title="This chapter's scene plan — open it to see the steps">
            {beats.length}-step plan
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
        {boardId && (
          <button
            className="chip board-remove"
            data-no-drag
            title="Take this card off the board (the note itself stays)"
            onClick={(e) => {
              e.stopPropagation();
              boardStore.removeNote(boardId, note.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            ✕
          </button>
        )}
      </footer>
    </article>
  );
}
