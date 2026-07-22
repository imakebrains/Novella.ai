import { useState } from "react";
import type { Note } from "../core/vault";
import type { BodyTask } from "../core/tasks";
import { store, useVaultVersion } from "../state/vaultStore";

/* The Tasks panel — every to-do in the project, one place.

   Tasks are plain `- [ ]` lines living wherever they were written; this
   panel is just a lens over them. Ticking one here edits the underlying
   note exactly as typing in the editor would, so autosave, drafts and
   history all treat it as the edit it is.

   Open tasks lead. Done tasks collapse behind a toggle — a wall of
   ticked boxes is history, not a to-do list. */

export function TasksPanel() {
  useVaultVersion();
  const [showDone, setShowDone] = useState(false);
  const active = store.active();
  const all = store.allTasks();

  if (all.length === 0) {
    return (
      <div className="tasks-empty">
        <p className="hint">No tasks yet.</p>
        <p className="hint">
          Type <code>- [ ] something to do</code> on its own line in any note — a chapter, a
          codex entry, anywhere — and it shows up here as a real checkbox.
        </p>
      </div>
    );
  }

  const open = all.filter(({ task }) => !task.done);
  const done = all.filter(({ task }) => task.done);

  // Group by note, preserving allTasks() order (manuscript first).
  const grouped = (items: typeof all) => {
    const byNote = new Map<string, { note: Note; tasks: BodyTask[] }>();
    for (const { note, task } of items) {
      const entry = byNote.get(note.id) ?? { note, tasks: [] };
      entry.tasks.push(task);
      byNote.set(note.id, entry);
    }
    return [...byNote.values()];
  };

  return (
    <div className="tasks-panel">
      <p className="hint tasks-summary">
        {open.length} open · {done.length} done
      </p>

      {open.length === 0 ? (
        <p className="hint">Everything's ticked. Go write.</p>
      ) : (
        grouped(open).map(({ note, tasks }) => (
          <TaskGroup key={note.id} note={note} tasks={tasks} activeId={active?.id} />
        ))
      )}

      {done.length > 0 && (
        <>
          <button className="btn-ghost tasks-done-toggle" onClick={() => setShowDone((v) => !v)}>
            {showDone ? "Hide" : "Show"} {done.length} done
          </button>
          {showDone &&
            grouped(done).map(({ note, tasks }) => (
              <TaskGroup key={note.id} note={note} tasks={tasks} activeId={active?.id} />
            ))}
        </>
      )}
    </div>
  );
}

function TaskGroup({
  note,
  tasks,
  activeId,
}: {
  note: Note;
  tasks: BodyTask[];
  activeId: string | undefined;
}) {
  return (
    <section className="task-group">
      <button
        className="task-group-head"
        onClick={() => store.open(note.id)}
        title={activeId === note.id ? "This note is open" : `Open ${note.title}`}
      >
        <span className="type-dot" data-type={note.type} />
        <span className="task-group-title">{note.title}</span>
      </button>
      <ul className="task-list">
        {tasks.map((task) => (
          <li key={task.checkbox} className={`task-row ${task.done ? "done" : ""}`}>
            <button
              className={`task-check ${task.done ? "on" : ""}`}
              role="checkbox"
              aria-checked={task.done}
              aria-label={task.text || "Untitled task"}
              onClick={() => store.toggleTask(note.id, task.checkbox)}
            >
              {task.done ? "✓" : ""}
            </button>
            <span className="task-text">{task.text || <em className="muted">(empty)</em>}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
