import { useRef } from "react";
import { store, useVaultVersion } from "../state/vaultStore";
import { cardDerived } from "./cardDerived";
import { useScrollEdges } from "./useScrollEdges";
import { threadColor, usePlotThreads } from "../state/plot";
import { useActiveProject } from "../state/projects";
import { BoardLayoutToggle, BoardPicker, type BoardLayout } from "./BoardLayoutToggle";
import { MANUSCRIPT_BOARD } from "../state/boards";

/* The stats layout — pacing at a glance.

   Reviewers name chapter-level data as one of NovelCrafter's real
   strengths: it shows where the middle sags before a reader ever
   feels it. Novella has computed every number here since the features
   that produce them landed; this view draws them.

   Three reads, one screen: how long each chapter runs (bars, click to
   open), which plot threads run where (the coverage strip under each
   bar), and what's still owed (task chips). All SVG and CSS — nothing
   to install, nothing to load. */

export function BoardStats({
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
  const threads = usePlotThreads();
  const chapters = store.orderedChapters();
  const scrollRef = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(scrollRef, chapters.length);

  const rows = chapters.map((c) => ({
    note: c,
    words: cardDerived(c).words,
    tasks: cardDerived(c).tasks,
    threads: threads.filter((t) => store.plotPointsOf(c, t.id).length > 0),
  }));
  const maxWords = Math.max(1, ...rows.map((r) => r.words));
  const total = rows.reduce((sum, r) => sum + r.words, 0);
  const mean = rows.length ? Math.round(total / rows.length) : 0;

  return (
    <main className="corkboard stats-view">
      <header className="board-head">
        <div className="board-head-left">
          <h1 className="board-title">{project?.name ?? "Manuscript"}</h1>
          <span className="board-meta">
            {rows.length} {rows.length === 1 ? "chapter" : "chapters"} ·{" "}
            {total.toLocaleString()} words · average {mean.toLocaleString()} per chapter
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
          <p>No chapters yet — nothing to measure.</p>
        </div>
      ) : (
        <div className="stats-wrap">
          {edges.left && <div className="scroll-fade left" aria-hidden />}
          {edges.right && <div className="scroll-fade right" aria-hidden />}
        <div className="stats-scroll" ref={scrollRef}>
          <div className="stats-chart" role="img" aria-label="Words per chapter">
            {rows.map((row, i) => {
              const h = Math.max(3, Math.round((row.words / maxWords) * 100));
              const short = row.words > 0 && row.words < mean * 0.45;
              return (
                <button
                  key={row.note.id}
                  className="stats-col"
                  onClick={() => onOpen(row.note.id)}
                  title={`${row.note.title} — ${row.words.toLocaleString()} words${
                    short ? " (well under the average — thin, or just tight?)" : ""
                  }`}
                >
                  <span className="stats-col-words">{row.words > 0 ? row.words.toLocaleString() : "—"}</span>
                  <span className="stats-bar-track">
                    <span
                      className={`stats-bar ${short ? "short" : ""}`}
                      style={{ height: `${h}%` }}
                    />
                  </span>
                  <span className="stats-threads">
                    {row.threads.map((t) => (
                      <span
                        key={t.id}
                        className="thread-dot"
                        style={{ background: threadColor(t.color) }}
                        title={`Thread: ${t.name}`}
                      />
                    ))}
                  </span>
                  <span className="stats-col-label">
                    <span className="stats-col-num">{i + 1}</span>
                    <span className="stats-col-title">{row.note.title}</span>
                  </span>
                  {row.tasks.total > 0 && (
                    <span
                      className={`chip task-chip ${row.tasks.done === row.tasks.total ? "all-done" : ""}`}
                    >
                      ✓ {row.tasks.done}/{row.tasks.total}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {threads.length > 0 && (
            <section className="stats-coverage">
              <h2 className="settings-section-label">Where each thread runs</h2>
              {threads.map((t) => (
                <div key={t.id} className="coverage-row">
                  <span className="coverage-name" style={{ color: threadColor(t.color) }}>
                    {t.name}
                  </span>
                  <span className="coverage-cells">
                    {rows.map((row) => {
                      const on = row.threads.some((x) => x.id === t.id);
                      return (
                        <span
                          key={row.note.id}
                          className={`coverage-cell ${on ? "on" : ""}`}
                          style={on ? { background: threadColor(t.color) } : undefined}
                          title={`${row.note.title}${on ? "" : " — thread absent"}`}
                        />
                      );
                    })}
                  </span>
                </div>
              ))}
              <p className="hint">
                A thread that vanishes for four chapters is either resting or forgotten —
                the strip can't tell you which, only that it happened.
              </p>
            </section>
          )}
        </div>
        </div>
      )}
    </main>
  );
}
