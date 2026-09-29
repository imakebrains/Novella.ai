import { useSyncExternalStore } from "react";
import { localDay, normalizeDueInput } from "../core/taskDates";
import type { BodyTask } from "../core/tasks";
import { SORT_KEY, dueSummary, parseSort, rowWithDue, rowsWithDue, type DueRow, type TaskSort } from "../core/taskViews";

/* The due-date pieces of the Tasks panel, kept out of TasksPanel.tsx so
   that file gains mounts and nothing else — the owner has unpushed work
   in it, and every prop threaded through NoteGroup/HeaderSection/TaskRow
   would be a hunk that conflicts with their reshape. So nothing here is
   passed down: each piece reads the clock or the sort for itself.
   Everything computed here is computed by core/taskViews.ts; this file
   only draws it and holds the one preference. */

/* Typed dates become the canonical token on the way in — "due fri" means
   a different day every week, so the file never holds the phrase. */
export function dated(text: string): string {
  return normalizeDueInput(text, localDay(new Date()));
}

/** A task as its row should read. Today is read per call rather than
    handed down; rows rendered in the same frame agree on the day except
    across the stroke of midnight, and the next render fixes that. */
export function dueRow(task: BodyTask): DueRow {
  return rowWithDue(task, localDay(new Date()));
}

/* ---- the sort, one value for the whole panel ----

   A module value behind useSyncExternalStore, not component state: the
   panel's shownTasks reads it with currentSort() from any depth, so the
   sections that apply it need no new props. The hook is what makes the
   panel re-render when it changes. */

let sort: TaskSort | null = null;
const listeners = new Set<() => void>();

/** The sort in force. Read lazily — localStorage can throw (private
    mode, blocked storage) and a preference is never worth a crash. */
export function currentSort(): TaskSort {
  if (sort === null) {
    try {
      sort = parseSort(localStorage.getItem(SORT_KEY));
    } catch {
      sort = "note";
    }
  }
  return sort;
}

function pickSort(next: TaskSort): void {
  sort = next;
  try {
    localStorage.setItem(SORT_KEY, next);
  } catch {
    /* preference only */
  }
  for (const fire of listeners) fire();
}

function subscribe(fire: () => void): () => void {
  listeners.add(fire);
  return () => {
    listeners.delete(fire);
  };
}

export function useTaskSort(): [TaskSort, (s: TaskSort) => void] {
  return [useSyncExternalStore(subscribe, currentSort, currentSort), pickSort];
}

/* ---- what the panel draws ---- */

/** The chip on a task row. Nothing at all for an undated task, so a
    list with no dates looks exactly as it did. The title carries the
    ISO day, because "Thu" is only useful while it is this week. */
export function DueChip({ row }: { row: DueRow }) {
  if (row.due === null) return null;
  return (
    <span className={`task-due ${row.state}`} title={`Due ${row.due}`}>
      {row.label}
    </span>
  );
}

/** Late and due-today counts for the toolbar. Renders nothing when
    both are zero — the count is an alarm, not a status line. */
export function DueCount({ tasks }: { tasks: BodyTask[] }) {
  const sum = dueSummary(rowsWithDue(tasks, localDay(new Date())));
  if (sum.overdue === 0 && sum.today === 0) return null;
  return (
    <span className="hint tasks-due-summary">
      {sum.overdue > 0 && <span className="overdue tnum">{sum.overdue} overdue</span>}
      {sum.overdue > 0 && sum.today > 0 && " · "}
      {sum.today > 0 && <span className="today tnum">{sum.today} due today</span>}
    </span>
  );
}

/* Same shape and classes as the "Done tasks" radio group beside it, so
   the toolbar reads as one control strip and needs no new CSS. The blurb
   says finished tasks stay where "Done tasks" puts them, because that is
   the whole contract between the two controls. */
const SORTS: { id: TaskSort; label: string; blurb: string }[] = [
  { id: "note", label: "As written", blurb: "Tasks in the order they sit in the note" },
  {
    id: "due",
    label: "By due date",
    blurb: "Open tasks nearest-due first, undated after; finished tasks go where “Done tasks” says",
  },
];

export function SortToggle({ sort, onPick }: { sort: TaskSort; onPick: (s: TaskSort) => void }) {
  return (
    <div className="tasks-mode-field">
      <span className="hint tasks-mode-label" id="tasks-sort">
        Sort
      </span>
      <div className="tasks-mode" role="radiogroup" aria-labelledby="tasks-sort">
        {SORTS.map((s) => (
          <button
            key={s.id}
            className={`tasks-mode-btn ${sort === s.id ? "on" : ""}`}
            role="radio"
            aria-checked={sort === s.id}
            title={s.blurb}
            onClick={() => onPick(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
