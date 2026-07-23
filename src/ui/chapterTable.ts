/* Sorting for the manuscript table view.

   Pure so ranking can be tested in Node. The table is the spreadsheet
   read of the book — Notion databases and Scrivener's outliner both
   prove writers want one — and a table that sorts wrongly is worse
   than no table. */

export interface TableRow {
  id: string;
  /** Book position, 1-based — the tie-break for every other sort. */
  order: number;
  title: string;
  words: number;
  tasksDone: number;
  tasksTotal: number;
  tags: string[];
}

export type TableSortKey = "order" | "title" | "words" | "tasks" | "tags";

export function sortTable(rows: TableRow[], key: TableSortKey, dir: 1 | -1): TableRow[] {
  const cmp = (a: TableRow, b: TableRow): number => {
    switch (key) {
      case "title":
        return a.title.localeCompare(b.title);
      case "words":
        return a.words - b.words;
      case "tags":
        return a.tags.length - b.tags.length;
      case "tasks":
        return a.tasksDone / a.tasksTotal - b.tasksDone / b.tasksTotal;
      default:
        return a.order - b.order;
    }
  };
  return [...rows].sort((a, b) => {
    // Chapters without tasks stay at the bottom whichever way the tasks
    // column sorts — an empty cell is an absence, not a value.
    if (key === "tasks") {
      const ea = a.tasksTotal === 0;
      const eb = b.tasksTotal === 0;
      if (ea !== eb) return ea ? 1 : -1;
      if (ea) return a.order - b.order;
    }
    return dir * cmp(a, b) || a.order - b.order;
  });
}
