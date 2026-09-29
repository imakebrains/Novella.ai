/* ============================================================
   Task views — what the Tasks panel shows, computed away from React

   A task line carries its due date as text (taskDates.ts). The panel
   needs three things derived from that: the row as it should READ
   (date token out, label and urgency in), an order that puts the
   nearest day first, and a count of what is late. All three are pure
   functions over BodyTask[] so they can be tested with a pinned
   "today", and so the panel — which the owner is mid-way through
   reshaping — only ever mounts them, never reimplements them.

   The calendar will want the same DueRow shape when tasks start
   appearing on their day; that is a later item, not this one.
   ============================================================ */

import { compareDue, dueLabel, dueState, parseDue, type Day, type DueState } from "./taskDates";
import type { BodyTask } from "./tasks";

/** One task as a row. `text` is the task with its date token removed
    (the file keeps the token — this is display only). The dated and
    undated shapes are split so a chip never has to null-check three
    fields that stand or fall together. */
export type DueRow =
  | { task: BodyTask; text: string; due: null; state: null; label: null }
  | { task: BodyTask; text: string; due: Day; state: DueState; label: string };

/** PURE. */
export function rowWithDue(task: BodyTask, today: Day): DueRow {
  const { due, text } = parseDue(task.text);
  if (!due) return { task, text, due: null, state: null, label: null };
  return { task, text, due, state: dueState(due, today), label: dueLabel(due, today) };
}

/** PURE. Rows in the order given — file order, untouched. */
export function rowsWithDue(tasks: BodyTask[], today: Day): DueRow[] {
  return tasks.map((task) => rowWithDue(task, today));
}

/** PURE. Open tasks by due day, nearest first, undated after the dated
    ones. Finished tasks keep the slots they already hold: where a ticked
    task goes is the "Done tasks" control's job, and that control
    promises "Stay put" means a tick never moves a line. So only the open
    tasks are permuted, among the positions open tasks occupied. The sort
    is stable, so equal days keep the file's order. */
export function sortByDue(rows: DueRow[]): DueRow[] {
  const open = rows.filter((r) => !r.task.done).sort((a, b) => compareDue(a.due, b.due));
  let next = 0;
  return rows.map((r) => (r.task.done ? r : open[next++]!));
}

export type TaskSort = "note" | "due";

/** localStorage key for the sort. Classified in src/cloud/prefs.ts —
    test-prefs fails on a key with no home. */
export const SORT_KEY = "novella.tasks.sort";

/** PURE. A stored value → a sort. Anything unrecognised is the default,
    which is the panel's existing order. */
export function parseSort(raw: string | null | undefined): TaskSort {
  return raw === "due" ? "due" : "note";
}

/** PURE. The tasks a list should render, in the order the sort asks
    for. "note" returns the input itself so the default path is exactly
    what the panel rendered before due dates existed. */
export function orderTasks(tasks: BodyTask[], today: Day, sort: TaskSort): BodyTask[] {
  if (sort !== "due") return tasks;
  return sortByDue(rowsWithDue(tasks, today)).map((r) => r.task);
}

export interface DueSummary {
  overdue: number;
  today: number;
}

/** PURE. How many OPEN tasks are late or due today. Finished tasks are
    not counted however they are dated — a ticked box is not overdue. */
export function dueSummary(rows: DueRow[]): DueSummary {
  const out: DueSummary = { overdue: 0, today: 0 };
  for (const r of rows) {
    if (r.task.done || !r.due) continue;
    if (r.state === "overdue") out.overdue++;
    else if (r.state === "today") out.today++;
  }
  return out;
}
