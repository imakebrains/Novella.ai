import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { store, useVaultVersion } from "../state/vaultStore";
import { pluginHost, usePluginVersion } from "../plugins/runtime";
import { listOllamaModels, type OllamaModel } from "../plugins/providers/ollama";
import { buildSceneContext, estimateTokens } from "../ai/context";
import { buildFromTemplate, usedVariables } from "../ai/prompts";
import { generate } from "../ai/generate";
import { insertIntoEditor } from "./editorBridge";
import { CritiquePanel } from "./CritiquePanel";
import { ContinuityPanel } from "./ContinuityPanel";
import { HistoryPanel } from "./HistoryPanel";
import { ChatPanel } from "./ChatPanel";
import { TasksPanel } from "./TasksPanel";
import { SetupPanel } from "./SetupPanel";
import { CalendarTab } from "./CalendarTab";
import { GoalsTab } from "./GoalsTab";
import { MusicTab } from "./MusicTab";
import {
  MAX_SLOTS,
  canMovePanelTo,
  canSplit,
  canSplitTab,
  colShares,
  cycleTab,
  hiddenTabs,
  paneRows,
  panelTools,
  rowShares,
  tabPrefs,
  tabbedRow,
  useTabPrefs,
  visibleTabs,
  type TabId,
  type TabPrefs,
  type Where,
} from "./inspectorTabs";

/* The inspector: the writer's toolbelt, arranged by the writer.

   Every tab can be dragged to reorder or closed outright (the + menu
   brings closed ones back). Someone who never uses Critique shouldn't
   look at it every day; someone who lives in Tasks can put it first.

   Two doors onto the same tools, on purpose. The Tools button names where
   you are and lists everywhere you could be — one click, no aim required,
   and a wheel over it flips through them. The strip beneath it is the
   arrangement made physical: what you keep, in your order, one click away.
   Both read the same prefs, so neither can drift from the other.

   A tool can also be pulled out of the strip and opened in a panel of its
   own — dropped on the band along the bottom it takes a row under
   everything, dropped on the band down either side it takes a column
   beside what's already there. Tasks above the calendar, or tasks beside
   it: both on screen, neither costing a click. Three panels at most,
   divided by draggable splitters, and every rule about what may sit where
   lives in inspectorTabs.

   All of it is still one pane. The Tools button shows and hides the whole
   arrangement at once, because the split happens inside the inspector
   rather than by adding panes to the workspace — there is nothing here
   App.tsx has to know about.

   Needing the active note is per-tab: Calendar, Goals, Tasks and Music
   are project-wide and work with nothing open. */

import { TimerTab } from "./TimerTab";

const TAB_DEFS: Record<TabId, { label: string; title: string; needsNote: boolean }> = {
  links: { label: "Links", title: "Backlinks and references for this note", needsNote: true },
  critique: { label: "Critique", title: "Prose analysis of this note", needsNote: true },
  tasks: { label: "Tasks", title: "Every to-do across the project", needsNote: false },
  history: { label: "History", title: "Earlier versions of this note", needsNote: true },
  assistant: { label: "Assistant", title: "Draft with your connected AI", needsNote: true },
  // needsNote is false on purpose: a chat is worth having before a note is
  // open, and a [[Wren Calloway]] typed into the box still reaches the model.
  chat: {
    label: "Chat",
    title: "Talk to your AI about the book — a thread that remembers",
    needsNote: false,
  },
  continuity: {
    label: "Continuity",
    title: "Provable slips: early mentions, duplicate names, dangling links",
    needsNote: false,
  },
  goals: { label: "Goals", title: "Daily goal, streak and the month's writing", needsNote: false },
  calendar: { label: "Calendar", title: "A real calendar with your plans on it", needsNote: false },
  timer: { label: "Timer", title: "A countdown and an alarm", needsNote: false },
  music: { label: "Music", title: "This project's writing music", needsNote: false },
};

export function InspectorPane({ onShowMusicPlayer }: { onShowMusicPlayer: () => void }) {
  useVaultVersion();
  const prefs = useTabPrefs();
  // The Tools dropdown. The strip's + menu is its own state inside
  // TabStrip — two menus, two names, so neither can close the other.
  const [menuOpen, setMenuOpen] = useState(false);
  // What the strip is dragging and where it would land, reported upward so
  // the pane can offer somewhere to drop it. The bands have to live down
  // here, around the panels — the strip can't render anything outside
  // itself.
  const [drag, setDrag] = useState<DragReport>({ tab: null, spot: null });
  const headRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const belowRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const active = store.active();
  const tab = prefs.active;
  const rows = paneRows(prefs);
  const heights = rowShares(prefs);
  const single = rows.length === 1 && rows[0]!.length === 1;

  /** Which row is under a point.

      Asked by the side bands, which run the height of the pane: dropping
      beside the calendar and dropping beside the tools are different
      moves, and the only thing that tells them apart is how far down the
      band the finger was. Rectangles rather than arithmetic, for the same
      reason the strip hit-tests its tabs that way — the rows are already
      on screen and can't be wrong about where they are. Off either end
      clamps to the nearest row instead of refusing: a drop a few pixels
      above the first row means the first row. */
  const rowAt = useCallback((y: number): number => {
    const grid = gridRef.current;
    if (!grid) return 0;
    const cells = [...grid.querySelectorAll<HTMLElement>("[data-row-index]")];
    for (const el of cells) {
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) return Number(el.dataset.rowIndex);
    }
    if (cells.length === 0) return 0;
    return y < cells[0]!.getBoundingClientRect().top ? 0 : cells.length - 1;
  }, []);

  /** Which band, if any, the pointer is over — the whole of "where would
      this land?" in one answer, so the strip never has to know how the
      pane is put together. Sides win over the bottom band where they meet,
      which is why the bottom band is inset to their width: a corner that
      could mean two things would mean neither. */
  const hitDrop = useCallback(
    (x: number, y: number): Where | null => {
      const inside = (el: HTMLElement | null): boolean => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      };
      if (inside(leftRef.current)) return { side: "left", row: rowAt(y) };
      if (inside(rightRef.current)) return { side: "right", row: rowAt(y) };
      if (inside(belowRef.current)) return { side: "below" };
      return null;
    },
    [rowAt],
  );

  // Click-away and Escape close the tool menu.
  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: MouseEvent) => {
      if (!headRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", key);
    };
  }, [menuOpen]);

  const renderTab = (id: TabId) => {
    if (TAB_DEFS[id].needsNote && !active)
      return (
        <div className="empty-state">
          <span className="empty-glyph" aria-hidden>
            ¶
          </span>
          <p className="empty-line">Nothing open.</p>
        </div>
      );
    switch (id) {
      case "links":
        return <LinksTab />;
      case "critique":
        return <CritiquePanel />;
      case "tasks":
        return <TasksPanel />;
      case "history":
        return <HistoryPanel />;
      case "assistant":
        return <AssistantTab />;
      case "chat":
        return <ChatPanel />;
      case "continuity":
        return <ContinuityPanel />;
      case "goals":
        return <GoalsTab />;
      case "calendar":
        return <CalendarTab />;
      case "music":
        return <MusicTab onShowPlayer={onShowMusicPlayer} />;
      case "timer":
        return <TimerTab />;
    }
  };

  return (
    <aside className="pane pane-right">
      <div className="pane-head inspector-head" ref={headRef}>
        <button
          className="tool-picker-btn"
          onClick={() => setMenuOpen((v) => !v)}
          onWheel={(e) => {
            // Scroll over the button to flip through tools without opening
            // the menu — peek by wheel, commit by click. It walks the
            // visible tabs in the writer's own order, so a reordered strip
            // reorders the wheel with it.
            e.preventDefault();
            const dir = e.deltaY > 0 ? 1 : -1;
            tabPrefs.setActive(cycleTab(tab, tabPrefs.visible(), dir));
          }}
          aria-expanded={menuOpen}
          title="Switch tool — click for the menu, or scroll over this button to flip through"
        >
          {TAB_DEFS[tab].label} <span className="picker-caret">▾</span>
        </button>

        {menuOpen && (
          <div className="tool-picker-menu" role="menu">
            {visibleTabs(prefs).map((id) => (
              <button
                key={id}
                role="menuitem"
                className={`picker-item ${tab === id ? "on" : ""}`}
                onClick={() => {
                  tabPrefs.show(id);
                  tabPrefs.setActive(id);
                  setMenuOpen(false);
                }}
              >
                <span className="tool-name">{TAB_DEFS[id].label}</span>
                <span className="tool-blurb">{TAB_DEFS[id].title}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <TabStrip prefs={prefs} hitDrop={hitDrop} onDrag={setDrag} />

      {/* The bands are positioned against this, so the pane never depends
          on anything outside itself being a positioning context. */}
      <div className="tool-area" style={AREA_STYLE}>
        {/* One tool is the ordinary case and renders exactly as it always
            did — splitting is additive, and the whole pane shouldn't pay a
            wrapper for a feature it isn't using. */}
        {single ? (
          <div
            className="pane-scroll"
            id={PANEL_ID}
            role="tabpanel"
            aria-label={`${TAB_DEFS[tab].label} — ${TAB_DEFS[tab].title}`}
          >
            {renderTab(tab)}
          </div>
        ) : (
          <div className="tool-grid" style={GRID_STYLE} ref={gridRef}>
            {rows.map((row, r) => (
              // Rows are keyed by position, not by what's in them: the
              // tabbed cell's tool changes every time the strip switches,
              // and a key that moved with it would tear down the panels
              // beside it — losing whatever state they were holding — for
              // a click that shouldn't touch them. The cells inside carry
              // their tool's id, which is what identity means here.
              <Fragment key={r}>
                {r > 0 && (
                  <SplitDivider
                    axis="row"
                    index={r - 1}
                    first={TAB_DEFS[rows[r - 1]![0]!].label}
                    second={TAB_DEFS[row[0]!].label}
                  />
                )}
                {/* flexGrow carries the split ratio, so it's the one style
                    that can't live in the stylesheet. */}
                <div
                  className={`tool-row ${
                    drag.spot && drag.spot.side !== "below" && drag.spot.row === r
                      ? "drop-target"
                      : ""
                  }`}
                  data-row-index={r}
                  style={{ ...ROW_STYLE, flexGrow: heights[r] }}
                >
                  {row.map((id, c) => {
                    const widths = colShares(prefs, r);
                    const tabbed = id === tab && r === tabbedRow(prefs);
                    return (
                      <Fragment key={id}>
                        {c > 0 && (
                          <SplitDivider
                            axis="col"
                            row={r}
                            index={c - 1}
                            first={TAB_DEFS[row[c - 1]!].label}
                            second={TAB_DEFS[id].label}
                          />
                        )}
                        <div className="tool-slot" style={{ ...SLOT_STYLE, flexGrow: widths[c] }}>
                          {!tabbed && <SlotHead id={id} prefs={prefs} />}
                          <div
                            // The tabbed cell stays the panel the tabs
                            // point at, markup and all; the others are
                            // regions of their own.
                            className={tabbed ? "pane-scroll" : "slot-body"}
                            id={tabbed ? PANEL_ID : undefined}
                            role={tabbed ? "tabpanel" : "region"}
                            aria-label={`${TAB_DEFS[id].label} — ${TAB_DEFS[id].title}`}
                            style={SLOT_BODY_STYLE}
                          >
                            {renderTab(id)}
                          </div>
                        </div>
                      </Fragment>
                    );
                  })}
                </div>
              </Fragment>
            ))}
          </div>
        )}

        {/* Only while a tab is actually in the air, and only when there's
            room for it to land — a band that would refuse the drop is
            worse than no band. Hidden from assistive tech because the +
            menu is the route that doesn't need a pointer. */}
        {drag.tab && canSplitTab(prefs, drag.tab) && (
          <>
            <div
              ref={leftRef}
              className={`tool-dropzone side left ${drag.spot?.side === "left" ? "over" : ""}`}
              style={LEFT_BAND_STYLE}
              aria-hidden
            >
              <span className="tool-dropzone-label">Open {TAB_DEFS[drag.tab].label} here</span>
            </div>
            <div
              ref={rightRef}
              className={`tool-dropzone side right ${drag.spot?.side === "right" ? "over" : ""}`}
              style={RIGHT_BAND_STYLE}
              aria-hidden
            >
              <span className="tool-dropzone-label">Open {TAB_DEFS[drag.tab].label} here</span>
            </div>
            <div
              ref={belowRef}
              className={`tool-dropzone below ${drag.spot?.side === "below" ? "over" : ""}`}
              style={BELOW_BAND_STYLE}
              aria-hidden
            >
              <span className="tool-dropzone-label">
                Drop to open {TAB_DEFS[drag.tab].label} below
              </span>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

/* ---------------- the split ---------------- */

/* Layout mechanics live inline; appearance lives in the stylesheet.

   The split is a set of proportions, and proportions only hold if the
   grid, the rows, the cells and their scrollers agree about flex and the
   min-height / min-width that lets a flex child shrink — miss one of them
   and a long list stops the panel beside or above it from ever shrinking.
   Rules that load-bearing shouldn't be editable by accident from a
   stylesheet, and the pane has to work the moment it renders, styled or
   not. Everything else — borders, colour, the grip, the dashed band — is
   the stylesheet's. */

// The bands hang off this, so they can be laid over the panels without
// pushing them around mid-drag and without the pane needing a positioned
// ancestor it doesn't control.
const AREA_STYLE: CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  flex: "1 1 auto",
  minHeight: 0,
};

const GRID_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: "1 1 auto",
  minHeight: 0,
};

const ROW_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  flexBasis: 0,
  minHeight: 0,
  minWidth: 0,
};

const SLOT_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flexBasis: 0,
  minHeight: 0,
  minWidth: 0,
  overflow: "hidden",
};

const SLOT_BODY_STYLE: CSSProperties = { flex: "1 1 auto", minHeight: 0, overflowY: "auto" };

const SLOT_HEAD_STYLE: CSSProperties = { flex: "0 0 auto" };

// A floor, not a size: the stylesheet can make either divider fatter, but
// neither may end up too small to hit. Nothing else here is a pointer
// target that only exists for a moment.
const ROW_DIVIDER_STYLE: CSSProperties = {
  flex: "0 0 auto",
  minHeight: 8,
  cursor: "row-resize",
  touchAction: "none",
};

const COL_DIVIDER_STYLE: CSSProperties = {
  flex: "0 0 auto",
  minWidth: 8,
  cursor: "col-resize",
  touchAction: "none",
};

/* The bands are overlaid rather than laid out. A band that took up space
   would squeeze the panels every time a drag began, and the pane would
   reflow under the writer's hand at exactly the moment they were aiming.

   Sized in clamp() so they stay a real target in a 180px pane and don't
   swallow a 560px one, and the bottom band is inset by the side bands'
   width so no point on screen belongs to two of them. pointer-events are
   off: the drag has the pointer captured on the tab, and hit-testing is
   done against these rectangles by hand. */
const BAND_W = "clamp(40px, 20%, 90px)";
const BAND: CSSProperties = {
  position: "absolute",
  zIndex: 4,
  pointerEvents: "none",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const LEFT_BAND_STYLE: CSSProperties = { ...BAND, left: 0, top: 0, bottom: 0, width: BAND_W };
const RIGHT_BAND_STYLE: CSSProperties = { ...BAND, right: 0, top: 0, bottom: 0, width: BAND_W };
const BELOW_BAND_STYLE: CSSProperties = {
  ...BAND,
  left: BAND_W,
  right: BAND_W,
  bottom: 0,
  height: "clamp(44px, 26%, 120px)",
};

/** A panel's own small header: what it is, and everything you can do to it
    without a pointer. */
function SlotHead({ id, prefs }: { id: TabId; prefs: TabPrefs }) {
  const label = TAB_DEFS[id].label;
  const panels = panelTools(prefs);
  const at = panels.indexOf(id);
  return (
    <div className="slot-head" style={SLOT_HEAD_STYLE}>
      <span className="slot-name" title={TAB_DEFS[id].title}>
        {label}
      </span>
      {/* Ordinary buttons, so the whole of splitting is reachable without a
          pointer: swap the panels around, send one beside the tools or
          into a row of its own, close it. */}
      <button
        className="slot-btn"
        disabled={at <= 0}
        aria-label={`Move the ${label} panel earlier`}
        title="Swap with the panel before this one"
        onClick={() => tabPrefs.movePanel(id, -1)}
      >
        ◀
      </button>
      <button
        className="slot-btn"
        disabled={at < 0 || at === panels.length - 1}
        aria-label={`Move the ${label} panel later`}
        title="Swap with the panel after this one"
        onClick={() => tabPrefs.movePanel(id, 1)}
      >
        ▶
      </button>
      <button
        className="slot-btn"
        disabled={!canMovePanelTo(prefs, id, { side: "right" })}
        aria-label={`Put the ${label} panel beside the tools`}
        title="Put this panel beside the tabbed tool"
        onClick={() => tabPrefs.movePanelTo(id, { side: "right" })}
      >
        ▐
      </button>
      <button
        className="slot-btn"
        disabled={!canMovePanelTo(prefs, id, { side: "below" })}
        aria-label={`Give the ${label} panel a row of its own`}
        title="Give this panel a row of its own, under everything"
        onClick={() => tabPrefs.movePanelTo(id, { side: "below" })}
      >
        ▼
      </button>
      <button
        className="slot-btn"
        aria-label={`Close the ${label} panel`}
        title={`Close this panel — ${label} goes back to the tabs`}
        onClick={() => tabPrefs.closePanel(id)}
      >
        ✕
      </button>
    </div>
  );
}

/* The in-pane twin of Resizer: same pointer-capture shape, same
   incremental deltas, same keyboard fallback because a hairline is not an
   accessible control. It can't be Resizer itself — that one reports
   pixels, and a split held in pixels would drift the moment the pane was
   widened. This one reports a fraction of the run it divides, which is
   what the prefs store.

   One component for both axes rather than two nearly-identical ones: the
   only real differences are which coordinate moves, which measurement
   turns it into a fraction, and which pair of arrow keys does it from the
   keyboard. */

function SplitDivider({
  axis,
  row = 0,
  index,
  first,
  second,
}: {
  axis: "row" | "col";
  /** Which row's columns this divides. Ignored on the row axis. */
  row?: number;
  index: number;
  first: string;
  second: string;
}) {
  // Dragging is a ref for the same reason it is in Resizer: state wouldn't
  // be true until React re-rendered, and the opening frames of the drag
  // arrive before that. State is kept only for the styling hook.
  const dragging = useRef(false);
  const [dragStyle, setDragStyle] = useState(false);
  const last = useRef(0);
  const vertical = axis === "col";

  const drag = (delta: number) => {
    if (vertical) tabPrefs.resizeCols(row, index, delta);
    else tabPrefs.resizeRows(index, delta);
  };

  const stop = (e: React.PointerEvent<HTMLDivElement>) => {
    // Capture must always come back, whichever way the drag ended — a lost
    // capture would leave the pane swallowing every pointer event.
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* already released */
    }
    dragging.current = false;
    setDragStyle(false);
  };

  return (
    <div
      className={`${vertical ? "col-divider" : "stack-divider"} ${dragStyle ? "dragging" : ""}`}
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-label={`Resize the ${first} and ${second} panels`}
      tabIndex={0}
      style={vertical ? COL_DIVIDER_STYLE : ROW_DIVIDER_STYLE}
      title="Drag to resize · double-click to even them up"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* the drag still works, just without capture */
        }
        last.current = vertical ? e.clientX : e.clientY;
        dragging.current = true;
        setDragStyle(true);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        // The run's own size turns pixels into the fraction the prefs keep.
        // Measured per move rather than cached: the pane is resizable from
        // the side while this drag is happening.
        const box = e.currentTarget.parentElement?.getBoundingClientRect();
        const span = (vertical ? box?.width : box?.height) ?? 0;
        if (span <= 0) return;
        const now = vertical ? e.clientX : e.clientY;
        const d = now - last.current;
        last.current = now;
        drag(d / span);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onDoubleClick={() => tabPrefs.evenSlots()}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.1 : 0.03;
        const back = vertical ? "ArrowLeft" : "ArrowUp";
        const on = vertical ? "ArrowRight" : "ArrowDown";
        if (e.key === back) {
          e.preventDefault();
          drag(-step);
        } else if (e.key === on) {
          e.preventDefault();
          drag(step);
        } else if (e.key === "Enter") {
          e.preventDefault();
          tabPrefs.evenSlots();
        }
      }}
    >
      <span className={vertical ? "col-grip" : "stack-grip"} />
    </div>
  );
}

/* ---------------- the tab strip ---------------- */

/* Reorder by dragging, close with the ✕, bring closed ones back from the +.

   Dragging is pointer-based rather than HTML5 drag-and-drop — the same
   choice the corkboard made, for the same reason: a tab is itself
   interactive (click to open, ✕ to close), and browsers refuse to start a
   native drag from inside a button. Pointer events have no such rule, and
   they carry touch and pen without a second code path.

   Dragging is never the ONLY way to rearrange. It is unavailable to a
   keyboard, and unkind to anyone with a tremor or a small trackpad, so
   Alt+← / Alt+→ nudges the focused tab, Alt+↓ opens it below,
   Alt+Shift+← / Alt+Shift+→ opens it beside, and the + menu spells every
   one of those out as ordinary buttons.

   A tab dragged clear of the strip and onto one of the bands around the
   panels leaves the strip altogether and becomes a panel of its own —
   under everything from the bottom band, beside a row from either side
   band. One gesture, four destinations, told apart by where it lands.

   The component stays thin on purpose: it turns pointers into an index or
   a landing spot and hands that to inspectorTabs, which owns every rule
   about what an arrangement may become. */

const PANEL_ID = "inspector-panel";
const DRAG_THRESHOLD_PX = 5;

/** What the strip is dragging and where it would land, for the pane that
    has to draw the bands. */
type DragReport = { tab: TabId | null; spot: Where | null };

/** A landing spot as one comparable string, so "the pointer is still over
    the same band" doesn't count as a change. Without it every pointermove
    would hand the pane a fresh object and re-render the whole pane. */
const spotKey = (spot: Where | null): string =>
  spot ? (spot.side === "below" ? "below" : `${spot.side}:${spot.row ?? 0}`) : "";

/** Why a split button is offered, or why it isn't. A disabled control that
    doesn't say why reads as a bug. */
function splitTitle(prefs: TabPrefs, id: TabId, room: boolean, where: string): string {
  if (id === prefs.active) return "This tool is already the one on show";
  if (!room) return `${MAX_SLOTS} panels at once is the limit — close one first`;
  return `Open ${where} — keep it on screen in its own panel`;
}

function TabStrip({
  prefs,
  hitDrop,
  onDrag,
}: {
  prefs: TabPrefs;
  /** Where a drop at this point would land, answered by the pane. The
      strip shouldn't have to know how the pane is put together, and the
      pane is the only thing that knows where its bands and rows are. */
  hitDrop: (x: number, y: number) => Where | null;
  onDrag: (report: DragReport) => void;
}) {
  const visible = visibleTabs(prefs);
  const hidden = hiddenTabs(prefs);
  const panels = panelTools(prefs);
  const room = canSplit(prefs);

  const stripRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [dragId, setDragId] = useState<TabId | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [spot, setSpot] = useState<Where | null>(null);
  // How far the tab has travelled from where it was grabbed. It's
  // translated by this so it physically follows the finger; a tab that
  // stays pinned while you drag reads as broken.
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);

  // Mutable drag bookkeeping lives in a ref, not state: pointermove fires
  // far faster than React re-renders, and the first few moves of a drag
  // would be lost waiting for state to settle.
  const drag = useRef<{ tab: TabId; startX: number; startY: number; active: boolean } | null>(null);

  const endDrag = useCallback(() => {
    drag.current = null;
    setDragId(null);
    setOverIndex(null);
    setSpot(null);
    setOffset(null);
  }, []);

  // The pane draws the bands, so it has to be told a drag is happening and
  // which band the pointer is over. Reported from an effect rather than
  // from the pointer handlers so the two states can't disagree — including
  // the one that matters, the drag ending.
  useEffect(() => {
    onDrag({ tab: dragId, spot });
  }, [dragId, spot, onDrag]);

  // A cancelled drag must leave nothing behind — no lifted tab, no stale
  // drop marker. Escape is the reflex people already have; pointercancel
  // and a lost capture (the browser taking the pointer for a scroll or a
  // system gesture) route to the same cleanup.
  useEffect(() => {
    if (!dragId) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") endDrag();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [dragId, endDrag]);

  // Click-away and Escape close the + menu.
  useEffect(() => {
    if (!plusOpen) return;
    const away = (e: MouseEvent) => {
      if (!plusRef.current?.contains(e.target as Node)) setPlusOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlusOpen(false);
    };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", key);
    };
  }, [plusOpen]);

  /** Which visible slot sits under a point, hit-tested against what's
      actually on screen. The strip wraps onto a second row in a narrow
      pane, so arithmetic along one axis would put tabs in the wrong place;
      rectangles can't be wrong about it. The dragged tab is skipped — it
      travels with the cursor, so it would otherwise always be the answer. */
  const indexAt = (x: number, y: number, skip: TabId | null): number | null => {
    const strip = stripRef.current;
    if (!strip) return null;
    for (const el of strip.querySelectorAll<HTMLElement>("[data-tab-index]")) {
      if (skip && el.dataset.tabId === skip) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return Number(el.dataset.tabIndex);
      }
    }
    return null;
  };

  // Moving the tool with an arrow key should move the focus ring with it,
  // or the next keypress comes from somewhere the writer isn't looking.
  // A frame's wait, because the tab to focus doesn't exist until React has
  // rendered the new arrangement.
  const focusTab = (id: TabId) => {
    requestAnimationFrame(() =>
      stripRef.current?.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)?.focus(),
    );
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>, tab: TabId) => {
    // The ✕ has its own job; a drag begun on it would fight the click.
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    if (e.button !== 0) return;
    // Capture keeps the drag alive when the cursor outruns the tab. It can
    // throw if the pointer is already released; a failed capture shouldn't
    // take dragging down with it.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* drag still works, just without capture */
    }
    drag.current = { tab, startX: e.clientX, startY: e.clientY, active: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;

    if (!d.active) {
      // A click must not become a drag, or opening a tool by tapping it
      // would be impossible.
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
      d.active = true;
      setDragId(d.tab);
    }

    setOffset({ x: e.clientX - d.startX, y: e.clientY - d.startY });
    const landing = hitDrop(e.clientX, e.clientY);
    // Same band as the last move is not a change. Keeping the old object
    // means the pane isn't re-rendered sixty times a second for a pointer
    // that hasn't left the band it was already over.
    setSpot((prev) => (spotKey(prev) === spotKey(landing) ? prev : landing));
    // Over a band the strip's own marker stands down: one drag can only
    // have one destination, and showing both would promise a move that
    // isn't the one about to happen.
    if (landing) {
      setOverIndex(null);
      return;
    }
    const idx = indexAt(e.clientX, e.clientY, d.tab);
    if (idx !== null) setOverIndex(idx);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLElement>, tab: TabId) => {
    // Read the drag before releasing capture: the release fires
    // lostpointercapture, whose handler clears this very ref.
    const d = drag.current;
    drag.current = null;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* already released */
    }

    // Nothing on record means the press began somewhere that opted out
    // (the ✕, or a right-click). That control answers for itself; this is
    // not a click on the tab.
    if (!d) return;

    if (d.active) {
      // Dropped on a band: the tool leaves the strip and gets a panel,
      // below or beside depending which band caught it. Dropped on another
      // tab: an ordinary reorder. Dropped anywhere else (off the edge, on
      // the editor): nothing, and the arrangement is exactly as it was.
      const landing = hitDrop(e.clientX, e.clientY);
      if (landing) {
        tabPrefs.split(d.tab, landing);
      } else {
        const idx = indexAt(e.clientX, e.clientY, d.tab);
        if (idx !== null) tabPrefs.move(d.tab, idx);
      }
    } else {
      tabPrefs.setActive(tab);
    }
    endDrag();
  };

  return (
    <div className="pane-head tabs inspector-tabs" role="tablist" aria-label="Tools" ref={stripRef}>
      {visible.map((id, i) => {
        const on = prefs.active === id;
        const dragging = dragId === id;
        return (
          <div
            key={id}
            className={`tab ${on ? "on" : ""} ${dragging ? "dragging" : ""} ${
              overIndex === i && dragId !== null && !dragging ? "drop-target" : ""
            }`}
            data-tab-index={i}
            data-tab-id={id}
            role="tab"
            aria-selected={on}
            aria-controls={PANEL_ID}
            tabIndex={0}
            title={`${TAB_DEFS[id].title} — drag to reorder, or Alt+← / Alt+→. Drag it onto the band below (Alt+↓) or down either side (Alt+Shift+← / Alt+Shift+→) to keep it open in a panel of its own.`}
            style={{
              // Drag mechanics, not decoration, so they live beside the code
              // that depends on them: without touch-action a finger drag
              // scrolls the pane instead of moving the tab, and without the
              // selection guard the strip highlights its own labels mid-drag.
              touchAction: "none",
              userSelect: "none",
              ...(dragging && offset
                ? { transform: `translate(${offset.x}px, ${offset.y}px)` }
                : null),
            }}
            onPointerDown={(e) => onPointerDown(e, id)}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => onPointerUp(e, id)}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                tabPrefs.setActive(id);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                const dir = e.key === "ArrowRight" ? 1 : -1;
                // Alt rearranges, a bare arrow walks the strip. One modifier
                // apart, so the gesture for moving a tab is a single step
                // from the navigation everyone tries first. Add Shift and
                // the tool goes sideways out of the strip altogether — the
                // side band said as a keypress.
                if (e.altKey && e.shiftKey) {
                  tabPrefs.split(id, { side: dir === 1 ? "right" : "left" });
                } else if (e.altKey) {
                  tabPrefs.nudge(id, dir);
                } else {
                  const next = cycleTab(id, visible, dir);
                  tabPrefs.setActive(next);
                  focusTab(next);
                }
              } else if (e.key === "ArrowDown" && e.altKey) {
                // Alt+↓ sends the tool downward into a panel, which is the
                // bottom band said as a keypress — and the reason the drag
                // is never the only way to split the pane.
                e.preventDefault();
                tabPrefs.split(id);
              }
            }}
          >
            {TAB_DEFS[id].label}
            {/* The last tab keeps its ✕ hidden rather than disabled: a
                control that refuses is worse than one that isn't offered. */}
            {visible.length > 1 && (
              <button
                className="tab-close"
                data-no-drag
                aria-label={`Close ${TAB_DEFS[id].label}`}
                title={`Close ${TAB_DEFS[id].label} — the + brings it back`}
                onClick={(e) => {
                  e.stopPropagation();
                  tabPrefs.hide(id);
                }}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}

      <div className="tab-plus-wrap" ref={plusRef}>
        <button
          className="tab tab-plus"
          aria-expanded={plusOpen}
          aria-haspopup="true"
          title="Add a tool back, or rearrange the tabs"
          onClick={() => setPlusOpen((v) => !v)}
        >
          +
        </button>

        {plusOpen && (
          <div className="tab-plus-pop" aria-label="Arrange tools">
            <p className="tab-plus-title">Add</p>
            {hidden.length === 0 ? (
              <p className="tab-plus-hint">Every tool is already here.</p>
            ) : (
              hidden.map((id) => (
                <button
                  key={id}
                  title={TAB_DEFS[id].title}
                  onClick={() => {
                    tabPrefs.show(id);
                    // Adding closes the menu — you asked for that tool, so
                    // the next thing you want is to see it.
                    setPlusOpen(false);
                  }}
                >
                  <span className="tab-plus-check">+</span>
                  {TAB_DEFS[id].label}
                </button>
              ))
            )}

            {/* The keyboard's route to everything the drag does. It stays
                open while you use it: rearranging is rarely one move. */}
            <p className="tab-plus-title">Arrange</p>
            {visible.map((id, i) => (
              <div className="tab-plus-row" key={id}>
                <span className="tab-plus-name">{TAB_DEFS[id].label}</span>
                <button
                  className="tab-plus-move"
                  disabled={i === 0}
                  aria-label={`Move ${TAB_DEFS[id].label} left`}
                  title="Move left"
                  onClick={() => tabPrefs.nudge(id, -1)}
                >
                  ◀
                </button>
                <button
                  className="tab-plus-move"
                  disabled={i === visible.length - 1}
                  aria-label={`Move ${TAB_DEFS[id].label} right`}
                  title="Move right"
                  onClick={() => tabPrefs.nudge(id, 1)}
                >
                  ▶
                </button>
                {/* The discoverable half of splitting: the bands only exist
                    mid-drag, so nobody finds them by looking. One button
                    per destination, in the shape of the destination. */}
                <button
                  className="tab-plus-move"
                  disabled={!canSplitTab(prefs, id)}
                  aria-label={`Open ${TAB_DEFS[id].label} beside, on the left`}
                  title={splitTitle(prefs, id, room, "on the left")}
                  onClick={() => tabPrefs.split(id, { side: "left" })}
                >
                  ▌
                </button>
                <button
                  className="tab-plus-move"
                  disabled={!canSplitTab(prefs, id)}
                  aria-label={`Open ${TAB_DEFS[id].label} beside, on the right`}
                  title={splitTitle(prefs, id, room, "on the right")}
                  onClick={() => tabPrefs.split(id, { side: "right" })}
                >
                  ▐
                </button>
                <button
                  className="tab-plus-move"
                  disabled={!canSplitTab(prefs, id)}
                  aria-label={`Open ${TAB_DEFS[id].label} below, in its own panel`}
                  title={splitTitle(prefs, id, room, "below")}
                  onClick={() => tabPrefs.split(id)}
                >
                  ▼
                </button>
                <button
                  className="tab-plus-move"
                  disabled={visible.length <= 1}
                  aria-label={`Remove ${TAB_DEFS[id].label}`}
                  title="Take it off the strip"
                  onClick={() => tabPrefs.hide(id)}
                >
                  ✕
                </button>
              </div>
            ))}
            <p className="tab-plus-hint">
              Drag a tab to move it, or use these arrows. ▌ ▐ ▼ keep a tool open in a panel of its
              own — beside, or underneath — and dragging a tab onto the bands around the pane does
              the same thing.
            </p>

            {/* Tools in panels have left the strip, so the Arrange rows
                above can't reach them. Their panel headers can, but only if
                you can point at one. */}
            {panels.length > 0 && (
              <>
                <p className="tab-plus-title">Panels</p>
                {panels.map((id, i) => (
                  <div className="tab-plus-row" key={id}>
                    <span className="tab-plus-name">{TAB_DEFS[id].label}</span>
                    <button
                      className="tab-plus-move"
                      disabled={i === 0}
                      aria-label={`Move the ${TAB_DEFS[id].label} panel earlier`}
                      title="Swap with the panel before this one"
                      onClick={() => tabPrefs.movePanel(id, -1)}
                    >
                      ◀
                    </button>
                    <button
                      className="tab-plus-move"
                      disabled={i === panels.length - 1}
                      aria-label={`Move the ${TAB_DEFS[id].label} panel later`}
                      title="Swap with the panel after this one"
                      onClick={() => tabPrefs.movePanel(id, 1)}
                    >
                      ▶
                    </button>
                    <button
                      className="tab-plus-move"
                      disabled={!canMovePanelTo(prefs, id, { side: "right" })}
                      aria-label={`Put the ${TAB_DEFS[id].label} panel beside the tools`}
                      title="Put this panel beside the tabbed tool"
                      onClick={() => tabPrefs.movePanelTo(id, { side: "right" })}
                    >
                      ▐
                    </button>
                    <button
                      className="tab-plus-move"
                      disabled={!canMovePanelTo(prefs, id, { side: "below" })}
                      aria-label={`Give the ${TAB_DEFS[id].label} panel a row of its own`}
                      title="Give this panel a row of its own, under everything"
                      onClick={() => tabPrefs.movePanelTo(id, { side: "below" })}
                    >
                      ▼
                    </button>
                    <button
                      className="tab-plus-move"
                      aria-label={`Close the ${TAB_DEFS[id].label} panel`}
                      title="Close this panel — the tool goes back to the tabs"
                      onClick={() => tabPrefs.closePanel(id)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- links ---------------- */

function LinksTab() {
  const active = store.active();
  if (!active) return null;

  const backlinks = store.vault.backlinksOf(active);
  const outgoing = store.outgoingLinks(active);
  const fields = Object.entries(active.data).filter(
    ([k]) => !["name", "title", "type", "id", "aliases", "tags"].includes(k),
  );

  return (
    <>
      <Section title="Backlinks" count={backlinks.length}>
        {backlinks.length === 0 ? (
          <div className="empty-state">
            <span className="empty-glyph" aria-hidden>
              §
            </span>
            <p className="empty-line">Nothing references this yet.</p>
          </div>
        ) : (
          backlinks.map(({ note, count }) => (
            <button key={note.id} className="link-row" onClick={() => store.open(note.id)}>
              <span className="type-dot" data-type={note.type} />
              <span className="link-name">{note.title}</span>
              {count > 1 && <span className="count">{count}</span>}
            </button>
          ))
        )}
      </Section>

      <Section title="References out" count={outgoing.length}>
        {outgoing.length === 0 ? (
          <p className="hint">This note links to nothing.</p>
        ) : (
          outgoing.map(({ name, note }) =>
            note ? (
              <button key={name} className="link-row" onClick={() => store.open(note.id)}>
                <span className="type-dot" data-type={note.type} />
                <span className="link-name">{note.title}</span>
              </button>
            ) : (
              <div key={name} className="link-row unresolved" data-tip="Not yet written">
                <span className="type-dot" data-type="dangling" />
                <span className="link-name">{name}</span>
              </div>
            ),
          )
        )}
      </Section>

      {active.aliases.length > 0 && (
        <Section title="Also known as">
          <div className="chips">
            {active.aliases.map((a) => (
              <span key={a} className="chip">
                {a}
              </span>
            ))}
          </div>
        </Section>
      )}

      {active.tags.length > 0 && (
        <Section title="Tags">
          <div className="chips">
            {active.tags.map((t) => (
              <span key={t} className="chip tag">
                #{t}
              </span>
            ))}
          </div>
        </Section>
      )}

      {fields.length > 0 && (
        <Section title="Details">
          <dl className="fields">
            {fields.map(([k, v]) => (
              <div key={k} className="field">
                <dt>{k}</dt>
                <dd>{String(v)}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
    </>
  );
}

/* ---------------- assistant ---------------- */

type DaemonState = "checking" | "ready" | "no-models" | "unreachable";

/* The old task-prompts (grammar check, storyboard, blurb…) crowded the
   style menu — owner feedback. Their notes stay in the vault for anyone
   who used them; the menu shows only styles: the default, the three
   samples, and anything the writer creates or uploads. */
const LEGACY_PROMPTS = new Set([
  "Expand beat",
  "Continue scene",
  "Rewrite selection",
  "Describe setting",
  "Dialogue pass",
  "Storyboard this chapter",
  "Grammar check",
  "Familiarity check",
  "Blurb writer",
]);

function AssistantTab() {
  usePluginVersion();
  const active = store.active();

  const [instruction, setInstruction] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [daemon, setDaemon] = useState<DaemonState>("checking");
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [promptId, setPromptId] = useState<string>("");
  const abort = useRef<AbortController | null>(null);

  const settings = pluginHost.settingsFor("provider-ollama-streaming");
  const chosenModel = (settings.get("model") as string) || "";

  const refreshModels = useCallback(async () => {
    setDaemon("checking");
    try {
      const found = await listOllamaModels();
      setModels(found);
      setDaemon(found.length ? "ready" : "no-models");
      if (found.length && !chosenModel) {
        settings.set("model", found[0]!.name);
      }
    } catch {
      setDaemon("unreachable");
      setModels([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenModel]);

  useEffect(() => {
    void refreshModels();
  }, [refreshModels]);

  useEffect(() => () => abort.current?.abort(), []);

  if (!active) return null;

  const referenced = store
    .outgoingLinks(active)
    .map((l) => l.note)
    .filter((n): n is NonNullable<typeof n> => Boolean(n));

  // A chosen style replaces the default "continue" behaviour. Both
  // builders return the same shape, so nothing downstream branches. The
  // writer's direction line rides along either way — styles that use
  // {{guidance}} place it themselves; for the rest it's appended.
  const chosen = promptId ? store.vault.get(promptId) : undefined;
  const baseCtx = chosen
    ? buildFromTemplate(chosen.body, active, referenced, { guidance: instruction })
    : buildSceneContext(active, referenced, { instruction });
  const ctx =
    chosen && instruction.trim() && !chosen.body.includes("{{guidance}}")
      ? { ...baseCtx, prompt: `${baseCtx.prompt}\n\nDirection from the writer: ${instruction.trim()}` }
      : baseCtx;

  const runGenerate = async () => {
    setBusy(true);
    setError(null);
    setOutput("");

    const controller = new AbortController();
    abort.current = controller;

    try {
      await generate(
        { system: ctx.system, prompt: ctx.prompt, maxTokens: 600 },
        (chunk) => setOutput((o) => o + chunk),
        controller.signal,
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const accept = () => {
    const text = output.trim();
    if (!text) return;
    // Spacing and position are the editor's business — it knows where the
    // cursor is and what's around it.
    if (!insertIntoEditor(text)) {
      setError("No chapter is open, so there is nowhere to insert.");
      return;
    }
    setOutput("");
  };

  return (
    <>
      <Section title="Model">
        <DaemonStatus state={daemon} models={models} />
        {models.length > 0 && (
          <select
            className="select"
            value={chosenModel}
            onChange={(e) => {
              settings.set("model", e.target.value);
              setOutput("");
            }}
          >
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name} ({(m.sizeBytes / 1e9).toFixed(1)} GB)
              </option>
            ))}
          </select>
        )}
      </Section>

      <Section title="Context for this scene">
        <p className="hint">
          Only the codex entries this scene references get sent — never the whole thing.
        </p>
        {ctx.referenced.length === 0 ? (
          <div className="empty-state">
            <span className="empty-glyph" aria-hidden>
              ❧
            </span>
            <p className="empty-line">No codex entries referenced yet.</p>
          </div>
        ) : (
          ctx.referenced.map((n) => (
            <button key={n.id} className="link-row" onClick={() => store.open(n.id)}>
              <span className="type-dot" data-type={n.type} />
              <span className="link-name">{n.title}</span>
              <span className="count">~{estimateTokens(n.body)}t</span>
            </button>
          ))
        )}
        <div className="token-bar">
          <span>Estimated context</span>
          <strong>~{ctx.estimatedTokens.toLocaleString()} tokens</strong>
        </div>
      </Section>

      <Section title="Writing style">
        <select
          className="select"
          value={promptId}
          onChange={(e) => {
            setPromptId(e.target.value);
            setOutput("");
          }}
          disabled={busy}
          aria-label="Writing style"
        >
          <option value="">Continue the scene (default)</option>
          {store
            .prompts()
            .filter((p) => !LEGACY_PROMPTS.has(p.title))
            .map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        {chosen && (
          <p className="hint">
            {String(chosen.data.description ?? "")}
            {usedVariables(chosen.body).length > 0 && (
              <>
                {" "}
                Uses:{" "}
                {usedVariables(chosen.body).map((v) => (
                  <code key={v} className="var-token">
                    {v}
                  </code>
                ))}
              </>
            )}
          </p>
        )}
        <p className="hint">
          A style is how the assistant writes — try <em>Extensive novel</em>,{" "}
          <em>Paragraph mode</em> or <em>Email writer</em>. Each one is an ordinary
          note under Prompts in the left pane, editable like any other file.
        </p>
        <div className="btn-row">
          <button
            className="btn-ghost"
            disabled={busy}
            title="Creates an editable style note and opens it — write instructions for how the assistant should sound"
            onClick={() => {
              let n = store.prompts().length + 1;
              while (store.vault.resolveLink(`My style ${n}`)) n++;
              const note = store.createNote("prompt", `My style ${n}`);
              store.setBody(
                note.id,
                `Continue "{{scene}}" in this style:\n\n(Describe the voice you want here — sentence length, mood, how much detail, what to avoid.)\n\n{{prose}}\n\nDirection from the writer:\n{{guidance}}\n\nWrite only the prose.`,
              );
            }}
          >
            + New style
          </button>
          <label className="btn-ghost upload-style" data-tip="Import a .txt or .md file as a style">
            Upload style…
            <input
              type="file"
              accept=".txt,.md"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void file.text().then((text) => {
                  const name = file.name.replace(/\.(txt|md)$/i, "").replace(/[-_]/g, " ");
                  let title = name;
                  let n = 2;
                  while (store.vault.resolveLink(title)) title = `${name} ${n++}`;
                  const note = store.createNote("prompt", title);
                  store.setBody(note.id, text);
                  setPromptId(note.id);
                });
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </Section>

      <Section title="Generate">
        <input
          className="search inline"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="What should this be about? e.g. “the storm hits mid-conversation”"
          title="One line of direction for this run — what should happen, what it's about. Works with every style."
          disabled={busy}
        />
        <div className="btn-row">
          <button
            className="btn-primary"
            onClick={() => void runGenerate()}
            disabled={busy || daemon !== "ready"}
            style={{ minWidth: 150 }}
          >
            {busy ? (
              <>
                <span className="spinner" aria-hidden /> Writing…
              </>
            ) : chosen ? (
              `Run “${chosen.title}”`
            ) : (
              "Continue the scene"
            )}
          </button>
          {busy && (
            <button className="btn-ghost" onClick={() => abort.current?.abort()}>
              Stop
            </button>
          )}
        </div>

        {error && <div className="notice error-notice">{error}</div>}

        {output && (
          <>
            <div className={busy ? "generated stream-caret" : "generated"}>{output}</div>
            <div className="btn-row">
              <button
                className="btn-primary"
                onClick={accept}
                disabled={busy}
                title="Inserts at the cursor, or at the end of the chapter if the editor isn't focused"
              >
                Insert
              </button>
              <button className="btn-ghost" onClick={() => setOutput("")} disabled={busy}>
                Discard
              </button>
            </div>
          </>
        )}
      </Section>
    </>
  );
}

function DaemonStatus({ state, models }: { state: DaemonState; models: OllamaModel[] }) {
  if (state === "checking")
    return (
      <p className="hint">
        <span className="spinner" aria-hidden /> Checking for Ollama…
      </p>
    );

  // Both failure states are fixable from inside the app — no terminal,
  // no visiting a download page.
  if (state === "unreachable" || state === "no-models") {
    return <SetupPanel compact />;
  }

  return (
    <p className="hint ok">
      Ollama ready · {models.length} model{models.length === 1 ? "" : "s"} installed
    </p>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="inspect-section">
      <h2 className="inspect-title">
        {title}
        {count !== undefined && count > 0 && <span className="count">{count}</span>}
      </h2>
      {children}
    </section>
  );
}
