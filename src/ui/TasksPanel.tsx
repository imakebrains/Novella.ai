import { useEffect, useRef, useState } from "react";
import type { Note } from "../core/vault";
import {
  appendLooseTask,
  createHeaderWithTask,
  extractSections,
  insertTaskUnderHeaderAt,
  removeHeaderAt,
  removeTaskLineAt,
  renameHeaderAt,
  replaceTaskTextAt,
  type BodyTask,
  type TaskHeader,
  type TaskSection,
} from "../core/tasks";
import { store, useVaultVersion } from "../state/vaultStore";

/* The Tasks panel — every to-do in the project, one place.

   Tasks are plain `- [ ]` lines living wherever they were written; this
   panel is just a lens over them. Ticking one here edits the underlying
   note exactly as typing in the editor would, and so does renaming,
   archiving or deleting one: every action in this file ends in a
   store.setBody, because there is no task store to keep in sync.

   A checklist long enough to matter wants sections in it, so tasks can
   sit under a heading the writer makes — `## Act one` with the boxes
   beneath. That grouping is Markdown too, parsed in core/tasks.ts, and a
   note that has never seen a heading behaves exactly as it always has.

   Checking a task does NOT teleport it by default. A checklist is a
   document — "third item, done" is information, and a list that
   reshuffles itself under your eyes stops being trustworthy. Writers
   who prefer the tidy-up can switch it per taste:

     in place  — done items stay exactly where they are (default)
     bottom    — done items sink below the open ones, per note
     archive   — done items fold away behind one toggle
*/

type DoneMode = "in-place" | "bottom" | "archive";

const MODE_KEY = "novella.tasks.doneMode";

/* The stored ids are load-bearing — a writer's saved preference has to
   survive being relabelled — so the words shown are only ever the labels.
   They say where a finished task goes, because that is the entire job of
   this control and the old "In place / Sink / Collapse" left it to be
   guessed at. */
const MODES: { id: DoneMode; label: string; blurb: string }[] = [
  { id: "in-place", label: "Stay put", blurb: "A ticked task stays on the line where you wrote it" },
  { id: "bottom", label: "Move down", blurb: "Ticked tasks sink below the ones still open, note by note" },
  { id: "archive", label: "Hide", blurb: "Ticked tasks fold away behind one “Show finished” toggle" },
];

function readMode(): DoneMode {
  const raw = localStorage.getItem(MODE_KEY);
  return raw === "bottom" || raw === "archive" ? raw : "in-place";
}

/** What a section shows under the current mode. Nothing is dropped from
    the note — only from this render. */
function shownTasks(tasks: BodyTask[], mode: DoneMode): BodyTask[] {
  if (mode === "bottom") return [...tasks.filter((t) => !t.done), ...tasks.filter((t) => t.done)];
  if (mode === "archive") return tasks.filter((t) => !t.done);
  return tasks;
}

/* ------------------------------------------------------------
   Writing back

   Each of these takes the offsets the row was rendered from and
   hands them to a pure rewriter in core/tasks.ts. A refusal (null)
   means the note moved under the panel — re-render and the writer
   can try again, which is always better than editing a line we can
   no longer identify.
   ------------------------------------------------------------ */

function addLooseTask(noteId: string, text: string): void {
  const note = store.vault.get(noteId);
  if (!note) return;
  const next = appendLooseTask(note.body, text);
  if (next !== null) store.setBody(noteId, next);
}

/* Quick capture: no note in hand, so it goes to the one that's open, or to
   a note called "Tasks" (created on first use). No hidden task store —
   what this adds, the editor shows. */
function captureTask(text: string): void {
  if (!text.trim()) return;
  let target = store.active();
  if (!target) {
    target =
      store.vault.all().find((n) => n.title === "Tasks") ?? store.createNote("note", "Tasks");
  }
  addLooseTask(target.id, text);
}

function addTaskUnderHeader(noteId: string, header: TaskHeader, text: string): void {
  const note = store.vault.get(noteId);
  if (!note) return;
  const next = insertTaskUnderHeaderAt(note.body, header.lineFrom, header.text, text);
  if (next !== null) store.setBody(noteId, next);
}

/* The header and its first task are written in one edit, because a heading
   with nothing beneath it isn't a header — see core/tasks.ts. Until this
   runs the new header exists only in this panel's state. */
function addHeaderWithTask(noteId: string, name: string, text: string): void {
  const note = store.vault.get(noteId);
  if (!note) return;
  const next = createHeaderWithTask(note.body, name, text);
  if (next !== null) store.setBody(noteId, next);
}

function renameTask(noteId: string, lineFrom: number, text: string): void {
  const note = store.vault.get(noteId);
  if (!note) return;
  const next = replaceTaskTextAt(note.body, lineFrom, text);
  if (next !== null) store.setBody(noteId, next);
}

function renameHeader(noteId: string, header: TaskHeader, name: string): void {
  const note = store.vault.get(noteId);
  if (!note) return;
  const next = renameHeaderAt(note.body, header.lineFrom, header.text, name);
  if (next !== null) store.setBody(noteId, next);
}

/** Removing a header takes out the heading line and nothing else — its
    tasks stay in the note and simply stop being grouped. */
function removeHeader(noteId: string, header: TaskHeader): void {
  const note = store.vault.get(noteId);
  if (!note) return;
  const next = removeHeaderAt(note.body, header.lineFrom, header.text);
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

/* Two clicks instead of a confirm() dialog — the pattern the trash and
   history panels use. The armed state disarms itself after a few seconds
   so a forgotten button can't fire on a stray later click. */
function ArmedButton({
  className,
  label,
  armedLabel,
  tip,
  onFire,
}: {
  className: string;
  label: string;
  armedLabel: string;
  tip: string;
  onFire: () => void;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      className={`${className} ${armed ? "armed" : ""}`}
      data-tip={tip}
      aria-label={armed ? armedLabel : tip}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onFire();
      }}
    >
      {armed ? armedLabel : label}
    </button>
  );
}

/* The add field.

   Not a box and not a popover. Adding a task should feel like typing the
   next line of the note, so the input carries no border of its own, runs
   the full width so long text stays readable, and sits in the flow of the
   list at the exact place the line will land. It is always there: a
   writer shouldn't have to ask permission to type.

   Enter commits and so does the arrow — a field with no visible way to say
   "yes" asks the writer to guess at a keystroke. Escape drops what was
   typed and steps out. Focus stays put after a commit, so a run of tasks
   is a run of Enters. */
function AddTaskLine({
  placeholder,
  autoFocus,
  onAdd,
}: {
  placeholder: string;
  autoFocus?: boolean;
  onAdd: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const field = useRef<HTMLInputElement>(null);

  const submit = () => {
    const clean = text.trim();
    if (!clean) return;
    onAdd(clean);
    setText("");
    field.current?.focus();
  };

  return (
    <div className="task-add-line">
      <span className="task-add-mark" aria-hidden>
        +
      </span>
      <input
        ref={field}
        className="task-add-input"
        value={text}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          else if (e.key === "Escape") {
            setText("");
            field.current?.blur();
          }
        }}
      />
      <button
        className="icon-btn task-add-send"
        onClick={submit}
        disabled={!text.trim()}
        aria-label="Add this task"
        data-tip="Add task"
      >
        →
      </button>
    </div>
  );
}

/* Naming a new header. Same borderless line as everything else here, and
   it writes nothing: leaving it empty abandons the whole idea, because a
   heading with no tasks under it is not a header the panel can show. */
function NewHeaderLine({
  onName,
  onCancel,
}: {
  onName: (name: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  // Escape unmounts this field, and unmounting is also a blur — without
  // the latch, abandoning a header would immediately re-create it.
  const live = useRef(true);

  const finish = (keep: boolean) => {
    if (!live.current) return;
    live.current = false;
    const clean = text.trim();
    if (keep && clean) onName(clean);
    else onCancel();
  };

  return (
    <div className="task-header task-header-new">
      <input
        className="task-header-input"
        autoFocus
        value={text}
        placeholder="Header name…"
        aria-label="New header name"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(true);
          else if (e.key === "Escape") finish(false);
        }}
      />
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

/* ------------------------------------------------------------
   The panel
   ------------------------------------------------------------ */

/** A header being made, held here rather than in the file. `named` is
    false while its name is still being typed and true once it is waiting
    for the first task that will commit both to the note at once. */
interface HeaderDraft {
  noteId: string;
  name: string;
  named: boolean;
}

export function TasksPanel() {
  useVaultVersion();
  const [mode, setMode] = useState<DoneMode>(readMode);
  const [finishedOpen, setFinishedOpen] = useState(false);
  const [draft, setDraft] = useState<HeaderDraft | null>(null);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const all = store.allTasks();
  const capture = store.active()?.title ?? "Tasks";

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
        <AddTaskLine placeholder={`Add to “${capture}”…`} onAdd={captureTask} />
      </div>
    );
  }

  const open = all.filter(({ task }) => !task.done);
  const done = all.filter(({ task }) => task.done);

  // One parse per note per render, in allTasks() order (manuscript first),
  // so a note's sections and its tasks can never disagree about the body
  // they came from.
  const seen = new Set<string>();
  const groups: { note: Note; sections: TaskSection[] }[] = [];
  for (const { note } of all) {
    if (seen.has(note.id)) continue;
    seen.add(note.id);
    groups.push({ note, sections: extractSections(note.body) });
  }

  // Hiding finished tasks empties out any note whose whole list is ticked —
  // unless it has headers, which stay so their add fields stay with them.
  const shownGroups =
    mode === "archive"
      ? groups.filter(
          (g) =>
            g.sections.some((s) => s.header !== null) ||
            g.sections.some((s) => s.tasks.some((t) => !t.done)),
        )
      : groups;

  return (
    <div className="tasks-panel">
      <div className="tasks-toolbar">
        <span className="hint tasks-summary">
          {open.length} open · {done.length} done
        </span>
        <div className="tasks-mode-field">
          <span className="hint tasks-mode-label" id="tasks-done-mode">
            Done tasks
          </span>
          <div className="tasks-mode" role="radiogroup" aria-labelledby="tasks-done-mode">
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
      </div>

      {shownGroups.length === 0 ? (
        <p className="hint">Everything's ticked. Go write.</p>
      ) : (
        shownGroups.map(({ note, sections }) => (
          <NoteGroup
            key={note.id}
            note={note}
            sections={sections}
            mode={mode}
            draft={draft?.noteId === note.id ? draft : null}
            setDraft={setDraft}
            onMenu={openMenu}
          />
        ))
      )}

      {mode === "archive" && done.length > 0 && (
        <>
          <button className="btn-ghost tasks-done-toggle" onClick={() => setFinishedOpen((v) => !v)}>
            {finishedOpen ? "Hide" : "Show"} finished ({done.length})
          </button>
          {finishedOpen &&
            groups.map(({ note, sections }) => {
              const finished = sections.flatMap((s) => s.tasks.filter((t) => t.done));
              if (finished.length === 0) return null;
              return (
                <section className="task-group" key={note.id}>
                  <NoteHead note={note} />
                  <ul className="task-list">
                    {finished.map((task) => (
                      <TaskRow key={task.checkbox} note={note} task={task} onMenu={openMenu} />
                    ))}
                  </ul>
                </section>
              );
            })}
        </>
      )}

      {/* Quick capture, under everything: the place your eye stops reading
          is the place your hand wants to type, and this one goes to
          whatever note is open rather than to a list you have to find. */}
      <div className="tasks-add-foot">
        <AddTaskLine placeholder={`Add to “${capture}”…`} onAdd={captureTask} />
      </div>

      {menu && <TaskMenu target={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

function NoteHead({ note }: { note: Note }) {
  return (
    <button
      className="task-group-head"
      onClick={() => store.open(note.id)}
      title={`Open ${note.title}`}
    >
      <span className="type-dot" data-type={note.type} />
      <span className="task-group-title">{note.title}</span>
    </button>
  );
}

/* One note's tasks: the ungrouped ones first, then each header section.
   That order is the file's order too — appendLooseTask puts a new
   ungrouped task in front of the first header — so the panel is never
   showing a shape the note doesn't have. */
function NoteGroup({
  note,
  sections,
  mode,
  draft,
  setDraft,
  onMenu,
}: {
  note: Note;
  sections: TaskSection[];
  mode: DoneMode;
  draft: HeaderDraft | null;
  setDraft: (d: HeaderDraft | null) => void;
  onMenu: (noteId: string, task: BodyTask, e: React.MouseEvent) => void;
}) {
  const loose = sections.find((s) => s.header === null);
  const headed = sections.filter((s) => s.header !== null);
  const looseShown = shownTasks(loose?.tasks ?? [], mode);

  return (
    <section className="task-group">
      <NoteHead note={note} />

      <ul className="task-list">
        {looseShown.map((task) => (
          <TaskRow key={task.checkbox} note={note} task={task} onMenu={onMenu} />
        ))}
      </ul>
      <AddTaskLine
        placeholder={`Add to “${note.title}”…`}
        onAdd={(text) => addLooseTask(note.id, text)}
      />

      {/* Keyed by position, not by offset: adding a task to one section
          shifts every offset below it, and a key that moved would throw
          away whatever the writer had half-typed in another field. */}
      {headed.map((section, i) => (
        <HeaderSection key={`h${i}`} note={note} section={section} mode={mode} onMenu={onMenu} />
      ))}

      {draft?.named && (
        <div className="task-section">
          <div className="task-header">
            <span className="task-header-text">{draft.name}</span>
          </div>
          <AddTaskLine
            autoFocus
            placeholder={`First task under “${draft.name}”…`}
            onAdd={(text) => {
              addHeaderWithTask(note.id, draft.name, text);
              setDraft(null);
            }}
          />
        </div>
      )}

      {draft && !draft.named && (
        <NewHeaderLine
          onName={(name) => setDraft({ noteId: note.id, name, named: true })}
          onCancel={() => setDraft(null)}
        />
      )}

      {!draft && (
        <button
          className="btn-ghost task-header-add"
          data-tip="Group the next tasks under a heading"
          onClick={() => setDraft({ noteId: note.id, name: "", named: false })}
        >
          + Header
        </button>
      )}
    </section>
  );
}

function HeaderSection({
  note,
  section,
  mode,
  onMenu,
}: {
  note: Note;
  section: TaskSection;
  mode: DoneMode;
  onMenu: (noteId: string, task: BodyTask, e: React.MouseEvent) => void;
}) {
  const header = section.header!;
  const shown = shownTasks(section.tasks, mode);
  const done = section.tasks.filter((t) => t.done).length;

  return (
    <div className="task-section">
      <HeaderRow note={note} header={header} done={done} total={section.tasks.length} />
      <ul className="task-list">
        {shown.map((task) => (
          <TaskRow key={task.checkbox} note={note} task={task} onMenu={onMenu} />
        ))}
      </ul>
      {/* Every header carries its own add field, always open, directly
          under its last task — the owner's "open space auto appears". */}
      <AddTaskLine
        placeholder={`Add under “${header.text}”…`}
        onAdd={(text) => addTaskUnderHeader(note.id, header, text)}
      />
    </div>
  );
}

/* The header line. Its text edits in place exactly as a task's does, so a
   writer who has renamed one already knows how. Removing it is armed
   rather than confirmed, and it only ever takes the heading: the tasks
   underneath stay in the note and go back to being ungrouped. */
function HeaderRow({
  note,
  header,
  done,
  total,
}: {
  note: Note;
  header: TaskHeader;
  done: number;
  total: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(header.text);
  const live = useRef(false);

  const begin = () => {
    setDraft(header.text);
    live.current = true;
    setEditing(true);
  };

  const finish = (save: boolean) => {
    if (!live.current) return;
    live.current = false;
    setEditing(false);
    if (save) renameHeader(note.id, header, draft);
  };

  return (
    <div className={`task-header ${done === total ? "all-done" : ""}`}>
      {editing ? (
        <input
          className="task-header-input"
          autoFocus
          value={draft}
          aria-label={`Rename header: ${header.text}`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") finish(true);
            else if (e.key === "Escape") finish(false);
          }}
        />
      ) : (
        <span
          className="task-header-text"
          role="button"
          tabIndex={0}
          title="Click to rename — Enter saves, Escape cancels"
          onClick={begin}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              begin();
            }
          }}
        >
          {header.text}
        </span>
      )}
      <span className="task-header-count tnum">
        {done}/{total}
      </span>
      <ArmedButton
        className="btn-ghost task-header-remove"
        label="×"
        armedLabel="Remove header?"
        tip="Remove this header — its tasks stay in the note, ungrouped"
        onFire={() => removeHeader(note.id, header)}
      />
    </div>
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
