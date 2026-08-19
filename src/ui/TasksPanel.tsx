import { useEffect, useRef, useState } from "react";
import type { Note } from "../core/vault";
import { removeTaskLineAt, replaceTaskTextAt, type BodyTask } from "../core/tasks";
import { store, useVaultVersion } from "../state/vaultStore";

/* The Tasks panel — every to-do in the project, one place.

   Tasks are plain `- [ ]` lines living wherever they were written; this
   panel is just a lens over them. Ticking one here edits the underlying
   note exactly as typing in the editor would, and so does renaming,
   archiving or deleting one: every action in this file ends in a
   store.setBody, because there is no task store to keep in sync.

   Checking a task does NOT teleport it by default. A checklist is a
   document — "third item, done" is information, and a list that
   reshuffles itself under your eyes stops being trustworthy. Writers
   who prefer the tidy-up can switch it per taste:

     in place  — done items stay exactly where they are (default)
     bottom    — done items sink below the open ones, per note
     archive   — done items collapse into an Archive section
*/

type DoneMode = "in-place" | "bottom" | "archive";

const MODE_KEY = "novella.tasks.doneMode";

const MODES: { id: DoneMode; label: string; blurb: string }[] = [
  { id: "in-place", label: "In place", blurb: "Done items stay where they are" },
  { id: "bottom", label: "Sink", blurb: "Done items drop below open ones" },
  { id: "archive", label: "Collapse", blurb: "Done items fold into a section at the bottom" },
];

function readMode(): DoneMode {
  const raw = localStorage.getItem(MODE_KEY);
  return raw === "bottom" || raw === "archive" ? raw : "in-place";
}

/* ------------------------------------------------------------
   Writing back

   Each of these takes the offsets the row was rendered from and
   hands them to a pure rewriter in core/tasks.ts. A refusal (null)
   means the note moved under the panel — re-render and the writer
   can try again, which is always better than editing a line we can
   no longer identify.
   ------------------------------------------------------------ */

/* The + appends a real `- [ ]` line to a real note — the active one if
   something's open, otherwise a note called "Tasks" (created on first
   use). No hidden task store: what this adds, the editor shows. */
function addTaskTo(text: string): void {
  const clean = text.trim();
  if (!clean) return;
  let target = store.active();
  if (!target) {
    target =
      store.vault.all().find((n) => n.title === "Tasks") ?? store.createNote("note", "Tasks");
  }
  const body = store.vault.get(target.id)?.body ?? "";
  const glue = body.length === 0 || body.endsWith("\n") ? "" : "\n";
  store.setBody(target.id, `${body}${glue}- [ ] ${clean}\n`);
}

function renameTask(noteId: string, lineFrom: number, text: string): void {
  const note = store.vault.get(noteId);
  if (!note) return;
  const next = replaceTaskTextAt(note.body, lineFrom, text);
  if (next !== null) store.setBody(noteId, next);
}

function deleteTask(noteId: string, task: BodyTask): void {
  const note = store.vault.get(noteId);
  if (!note) return;
  const next = removeTaskLineAt(note.body, task.lineFrom, task.text);
  if (next !== null) store.setBody(noteId, next);
}

/* ════════════════════════════════════════════════════════════
   SEAM — where an archived task goes.

   This is the ONLY place archiving is implemented. Everything else
   (the context menu, anything added later) goes through archiveTask
   below, so repointing archive at the retention module is a change
   to this one function: call trash.put(...) instead of appending,
   delete the ARCHIVE_PATH constant, and nothing else in the panel
   moves.

   Until then the archive is a plain note in the vault, because
   "recoverable" has to survive the app not being installed. Lines
   are written struck-through and WITHOUT a checkbox on purpose:
   extractTasks skips them, so an archived task can't reappear in
   this panel as a live to-do.
   ════════════════════════════════════════════════════════════ */

const ARCHIVE_PATH = "Archive/Tasks.md";

const ARCHIVE_SEED =
  "---\ntype: note\nname: Archived tasks\n---\n\n" +
  "Tasks archived from the Tasks panel. They are plain lines rather than\n" +
  "checkboxes, so they don't come back as to-dos — copy one out to revive it.\n";

function stashArchivedTask(entry: { text: string; done: boolean; from: string }): void {
  const note =
    store.vault.all().find((n) => n.path === ARCHIVE_PATH) ??
    store.createNoteAtPath(ARCHIVE_PATH, ARCHIVE_SEED);
  const body = store.vault.get(note.id)?.body ?? "";
  const glue = body.length === 0 || body.endsWith("\n") ? "" : "\n";
  const stamp = new Date().toISOString().slice(0, 10);
  const line = `- ~~${entry.text || "(empty)"}~~ · ${entry.done ? "done" : "open"} · from [[${entry.from}]] · ${stamp}`;
  store.setBody(note.id, `${body}${glue}${line}\n`);
}

/** Archive = stash a copy, then cut the line. Stashing only happens once
    the cut is known to be possible, so a stale offset can never leave the
    task in two places at once. */
function archiveTask(noteId: string, task: BodyTask): void {
  const note = store.vault.get(noteId);
  if (!note) return;
  const next = removeTaskLineAt(note.body, task.lineFrom, task.text);
  if (next === null) return;
  stashArchivedTask({ text: task.text, done: task.done, from: note.title });
  store.setBody(noteId, next);
}

/* ------------------------------------------------------------
   Pieces
   ------------------------------------------------------------ */

/* The add field. Enter commits, and so does the arrow — a text field with
   no visible way to say "yes" asks the writer to guess at a keystroke. */
function AddTaskRow({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const target = store.active()?.title ?? "Tasks";

  const submit = (keepOpen: boolean) => {
    if (!text.trim()) {
      onClose();
      return;
    }
    addTaskTo(text);
    setText("");
    if (!keepOpen) onClose();
  };

  return (
    <div className="task-add-row">
      <input
        className="field-input"
        autoFocus
        value={text}
        placeholder={`Add to “${target}”…`}
        aria-label="New task"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Shift-Enter keeps the field open for a run of tasks.
          if (e.key === "Enter") submit(e.shiftKey);
          else if (e.key === "Escape") onClose();
        }}
      />
      <button
        className="icon-btn task-add-send"
        onClick={() => submit(false)}
        disabled={!text.trim()}
        aria-label="Add this task"
        data-tip="Add task"
      >
        →
      </button>
    </div>
  );
}

interface MenuTarget {
  noteId: string;
  task: BodyTask;
  x: number;
  y: number;
}

/* Right-click menu for one task. Deliberately short: the destructive pair
   and nothing else, so the two entries never have to be read carefully. */
function TaskMenu({
  target,
  onClose,
}: {
  target: MenuTarget;
  onClose: () => void;
}) {
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".task-menu")) onClose();
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

  // Cursor coordinates are runtime data, not styling — hence fixed
  // positioning inline, clamped so a right-click near an edge still
  // opens the whole menu on screen.
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(target.x, window.innerWidth - 200),
    top: Math.min(target.y, window.innerHeight - 110),
  };

  return (
    <div className="menu-pop task-menu" style={style} role="menu" aria-label="Task actions">
      <button
        role="menuitem"
        className="menu-item"
        title="Moves this task out of its note and into Archive/Tasks.md, where it stays readable"
        onClick={() => {
          archiveTask(target.noteId, target.task);
          onClose();
        }}
      >
        Archive
      </button>
      <button
        role="menuitem"
        className="menu-item danger"
        title="Removes the task's line from its note"
        onClick={() => {
          deleteTask(target.noteId, target.task);
          onClose();
        }}
      >
        Delete
      </button>
    </div>
  );
}

export function TasksPanel() {
  useVaultVersion();
  const [mode, setMode] = useState<DoneMode>(readMode);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const all = store.allTasks();

  const pickMode = (m: DoneMode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* preference only */
    }
  };

  const openMenu = (noteId: string, task: BodyTask, e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ noteId, task, x: e.clientX, y: e.clientY });
  };

  if (all.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-glyph" aria-hidden>
          ✓
        </span>
        <p className="empty-line">No tasks yet.</p>
        <p className="empty-line muted">
          Type <code>- [ ] something to do</code> on its own line in any note — a chapter, a
          codex entry, anywhere — and it shows up here as a real checkbox.
        </p>
        {adding ? (
          <AddTaskRow onClose={() => setAdding(false)} />
        ) : (
          <button className="empty-cta" onClick={() => setAdding(true)}>
            + Add one now
          </button>
        )}
      </div>
    );
  }

  const open = all.filter(({ task }) => !task.done);
  const done = all.filter(({ task }) => task.done);

  // Group by note, preserving allTasks() order (manuscript first). What
  // lands in each group depends on the done-mode.
  const grouped = (items: typeof all) => {
    const byNote = new Map<string, { note: Note; tasks: BodyTask[] }>();
    for (const { note, task } of items) {
      const entry = byNote.get(note.id) ?? { note, tasks: [] };
      entry.tasks.push(task);
      byNote.set(note.id, entry);
    }
    return [...byNote.values()];
  };

  // in-place: everything, document order. bottom: open then done, within
  // each note. archive: open only, done behind the toggle.
  const mainGroups =
    mode === "in-place"
      ? grouped(all)
      : mode === "bottom"
        ? grouped(all).map((g) => ({
            ...g,
            tasks: [...g.tasks.filter((t) => !t.done), ...g.tasks.filter((t) => t.done)],
          }))
        : grouped(open);

  return (
    <div className="tasks-panel">
      <div className="tasks-toolbar">
        <span className="hint tasks-summary">
          {open.length} open · {done.length} done
        </span>
        <div className="tasks-mode" role="radiogroup" aria-label="Where done items go">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={`tasks-mode-btn ${mode === m.id ? "on" : ""}`}
              role="radio"
              aria-checked={mode === m.id}
              title={m.blurb}
              onClick={() => pickMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mainGroups.length === 0 && mode === "archive" ? (
        <p className="hint">Everything's ticked and archived. Go write.</p>
      ) : (
        mainGroups.map(({ note, tasks }) => (
          <TaskGroup key={note.id} note={note} tasks={tasks} onMenu={openMenu} />
        ))
      )}

      {mode === "archive" && done.length > 0 && (
        <>
          <button className="btn-ghost tasks-done-toggle" onClick={() => setArchiveOpen((v) => !v)}>
            {archiveOpen ? "Hide" : "Show"} archive ({done.length})
          </button>
          {archiveOpen &&
            grouped(done).map(({ note, tasks }) => (
              <TaskGroup key={note.id} note={note} tasks={tasks} onMenu={openMenu} />
            ))}
        </>
      )}

      {/* The + lives under the last task rather than up in the toolbar:
          a list you add to grows downward, and the place your eye stops
          reading is the place your hand wants to type. */}
      <div className="tasks-add-foot">
        {adding ? (
          <AddTaskRow onClose={() => setAdding(false)} />
        ) : (
          <button
            className="task-add-btn"
            onClick={() => setAdding(true)}
            aria-label="Add a task"
            data-tip="Add a task"
          >
            +
          </button>
        )}
      </div>

      {menu && <TaskMenu target={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

function TaskGroup({
  note,
  tasks,
  onMenu,
}: {
  note: Note;
  tasks: BodyTask[];
  onMenu: (noteId: string, task: BodyTask, e: React.MouseEvent) => void;
}) {
  return (
    <section className="task-group">
      <button
        className="task-group-head"
        onClick={() => store.open(note.id)}
        title={`Open ${note.title}`}
      >
        <span className="type-dot" data-type={note.type} />
        <span className="task-group-title">{note.title}</span>
      </button>
      <ul className="task-list">
        {tasks.map((task) => (
          <TaskRow key={task.checkbox} note={note} task={task} onMenu={onMenu} />
        ))}
      </ul>
    </section>
  );
}

/* One task. The text is the edit control — click it and you're typing in
   the note, which is the only honest model here, since that IS the note.
   Enter and blur commit, Escape abandons; the ref is what tells the two
   apart, because leaving the field is also how Escape unmounts it. */
function TaskRow({
  note,
  task,
  onMenu,
}: {
  note: Note;
  task: BodyTask;
  onMenu: (noteId: string, task: BodyTask, e: React.MouseEvent) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.text);
  const live = useRef(false);

  const begin = () => {
    setDraft(task.text);
    live.current = true;
    setEditing(true);
  };

  const finish = (save: boolean) => {
    if (!live.current) return;
    live.current = false;
    setEditing(false);
    if (save) renameTask(note.id, task.lineFrom, draft);
  };

  return (
    <li
      className={`task-row ${task.done ? "done" : ""}`}
      onContextMenu={(e) => onMenu(note.id, task, e)}
    >
      <button
        className={`task-check ${task.done ? "on" : ""}`}
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.text || "Untitled task"}
        onClick={() => store.toggleTask(note.id, task.checkbox)}
      >
        {task.done ? "✓" : ""}
      </button>

      {editing ? (
        <input
          className="field-input task-edit-input"
          autoFocus
          value={draft}
          aria-label={`Edit task: ${task.text}`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") finish(true);
            else if (e.key === "Escape") finish(false);
          }}
        />
      ) : (
        <span
          className="task-text"
          role="button"
          tabIndex={0}
          title="Click to edit — Enter saves, Escape cancels"
          onClick={begin}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              begin();
            }
          }}
        >
          {task.text || <em className="muted">(empty)</em>}
        </span>
      )}
    </li>
  );
}
