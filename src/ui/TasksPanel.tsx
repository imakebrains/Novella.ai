import { useState } from "react";
import type { Note } from "../core/vault";
import type { BodyTask } from "../core/tasks";
import { store, useVaultVersion } from "../state/vaultStore";

/* The Tasks panel — every to-do in the project, one place.

   Tasks are plain `- [ ]` lines living wherever they were written; this
   panel is just a lens over them. Ticking one here edits the underlying
   note exactly as typing in the editor would.

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
  { id: "archive", label: "Archive", blurb: "Done items collapse into an archive" },
];

function readMode(): DoneMode {
  const raw = localStorage.getItem(MODE_KEY);
  return raw === "bottom" || raw === "archive" ? raw : "in-place";
}

export function TasksPanel() {
  useVaultVersion();
  const [mode, setMode] = useState<DoneMode>(readMode);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const all = store.allTasks();

  const pickMode = (m: DoneMode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* preference only */
    }
  };

  if (all.length === 0) {
    return (
      <div className="tasks-empty">
        <p className="hint">No tasks yet.</p>
        <p className="hint">
          Type <code>- [ ] something to do</code> on its own line in any note — a chapter, a
          story bible entry, anywhere — and it shows up here as a real checkbox.
        </p>
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
        mainGroups.map(({ note, tasks }) => <TaskGroup key={note.id} note={note} tasks={tasks} />)
      )}

      {mode === "archive" && done.length > 0 && (
        <>
          <button className="btn-ghost tasks-done-toggle" onClick={() => setArchiveOpen((v) => !v)}>
            {archiveOpen ? "Hide" : "Show"} archive ({done.length})
          </button>
          {archiveOpen &&
            grouped(done).map(({ note, tasks }) => (
              <TaskGroup key={note.id} note={note} tasks={tasks} />
            ))}
        </>
      )}
    </div>
  );
}

function TaskGroup({ note, tasks }: { note: Note; tasks: BodyTask[] }) {
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
