/* Cards vs Grid — two layouts of the same chapters.

   The corkboard ("Cards") is the loose, spatial view; the plot grid
   ("Grid") is the structured, thread-by-thread view. Both reorder the
   same `order` frontmatter, so switching between them never loses or
   reshuffles anything. Shared here so both boards render an identical
   control in their header. */

export type BoardLayout = "cards" | "grid";

export function BoardLayoutToggle({
  layout,
  setLayout,
}: {
  layout: BoardLayout;
  setLayout: (l: BoardLayout) => void;
}) {
  return (
    <div className="view-switch board-layout" role="group" aria-label="Board layout">
      <button
        className={layout === "cards" ? "on" : ""}
        onClick={() => setLayout("cards")}
        aria-pressed={layout === "cards"}
        title="Loose cards"
      >
        Cards
      </button>
      <button
        className={layout === "grid" ? "on" : ""}
        onClick={() => setLayout("grid")}
        aria-pressed={layout === "grid"}
        title="Plot grid — threads across chapters"
      >
        Grid
      </button>
    </div>
  );
}
