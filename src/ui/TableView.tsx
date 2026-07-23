import { useMemo, useState } from "react";
import { store, useVaultVersion } from "../state/vaultStore";
import { countWords } from "../analysis/prose";
import { taskProgress } from "../core/tasks";
import { useActiveProject } from "../state/projects";
import { BoardLayoutToggle, BoardPicker, type BoardLayout } from "./BoardLayoutToggle";
import { MANUSCRIPT_BOARD } from "../state/boards";
import { NoteMenu } from "./NoteMenu";
import { sortTable, type TableSortKey } from "./chapterTable";

/* The table layout — the manuscript as a spreadsheet.

   Scrivener calls this the outliner; Notion, a database. Same instinct:
   sometimes a writer needs the book as rows and numbers, not prose —
   which chapter is short, which one still owes tasks, what's tagged
   where. Click a column to sort, click it again to flip, click a row
   to open the chapter. */

const COLUMNS: { key: TableSortKey; label: string; align?: "right" }[] = [
  { key: "order", label: "#", align: "right" },
  { key: "title", label: "Chapter" },
  { key: "words", label: "Words", align: "right" },
  { key: "tasks", label: "Tasks", align: "right" },
  { key: "tags", label: "Tags" },
];

export function TableView({
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
  const [sortKey, setSortKey] = useState<TableSortKey>("order");
  const [dir, setDir] = useState<1 | -1>(1);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const chapters = store.orderedChapters();
  const rows = useMemo(() => {
    const base = chapters.map((c, i) => {
      const tasks = taskProgress(c.body);
      return {
        id: c.id,
        order: i + 1,
        title: c.title,
        words: countWords(c.body),
        tasksDone: tasks.done,
        tasksTotal: tasks.total,
        tags: c.tags,
      };
    });
    return sortTable(base, sortKey, dir);
  }, [chapters, sortKey, dir]);

  const total = rows.reduce((sum, r) => sum + r.words, 0);

  const clickHeader = (key: TableSortKey) => {
    if (key === sortKey) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setDir(1);
    }
  };

  return (
    <main className="corkboard table-view">
      <header className="board-head">
        <div className="board-head-left">
          <h1 className="board-title">{project?.name ?? "Manuscript"}</h1>
          <span className="board-meta">
            {rows.length} {rows.length === 1 ? "chapter" : "chapters"} ·{" "}
            {total.toLocaleString()} words
          </span>
        </div>
        <div className="board-head-right">
          <BoardPicker
            boardId={MANUSCRIPT_BOARD}
            onPick={(id) => {
              localStorage.setItem("novella.activeBoard", id);
              if (id !== MANUSCRIPT_BOARD) setLayout("cards");
            }}
          />
          <BoardLayoutToggle layout={layout} setLayout={setLayout} />
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="empty-state">
          <p>No chapters yet — nothing to list.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="chapter-table">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.key} className={col.align === "right" ? "num" : ""}>
                    <button
                      className={`table-sort ${sortKey === col.key ? "on" : ""}`}
                      onClick={() => clickHeader(col.key)}
                      title={`Sort by ${col.label.toLowerCase()}`}
                    >
                      {col.label}
                      {sortKey === col.key && (
                        <span className="sort-dir">{dir === 1 ? "▲" : "▼"}</span>
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onOpen(row.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ id: row.id, x: e.clientX, y: e.clientY });
                  }}
                  title="Open in the editor — right-click for more"
                >
                  <td className="num faint">{row.order}</td>
                  <td className="table-title">{row.title}</td>
                  <td className="num">{row.words.toLocaleString()}</td>
                  <td className="num">
                    {row.tasksTotal === 0 ? (
                      <span className="faint">—</span>
                    ) : (
                      <span className={row.tasksDone === row.tasksTotal ? "tasks-done" : ""}>
                        {row.tasksDone}/{row.tasksTotal}
                      </span>
                    )}
                  </td>
                  <td>
                    {row.tags.length === 0 ? (
                      <span className="faint">—</span>
                    ) : (
                      <span className="table-tags">
                        {row.tags.map((t) => (
                          <span key={t} className="table-tag">
                            {t}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {menu && (
        <NoteMenu
          noteId={menu.id}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onOpenNote={() => onOpen(menu.id)}
        />
      )}
    </main>
  );
}
