import { useCallback, useEffect, useRef, useState } from "react";
import { store, useVaultVersion } from "../state/vaultStore";
import { ALL_TABS, type TabId } from "./inspectorTabs";
import { TAB_DEFS, ToolBody } from "./InspectorPane";
import {
  addPanel,
  bringToFront,
  clampAll,
  HEAD_H,
  MIN_H,
  MIN_W,
  movePanel,
  panelsKey,
  parsePanels,
  removePanel,
  resizePanel,
  serializePanels,
  toggleCollapse,
  type Panel,
} from "./panelLayout";

/* The board as a planner.

   Any tool can be pulled onto the board as a panel, dragged anywhere,
   sized, folded and closed, and the arrangement is remembered per
   project. This is the "make it mine" surface — the inspector is one
   tool in a fixed column, and that is the wrong shape for planning a
   book.

   All the arithmetic is in panelLayout.ts. What is left here is pointer
   handling, and the one rule that matters for it: pointer capture, so a
   drag that outruns the cursor still ends up in the right place. Every
   other drag in the app works this way. */

type Drag =
  | { kind: "move"; id: string; dx: number; dy: number }
  | { kind: "size"; id: string; ox: number; oy: number; w: number; h: number }
  | null;

export function BoardPanels({ onShowMusicPlayer }: { onShowMusicPlayer?: () => void }) {
  useVaultVersion();
  const root = store.vaultRoot();
  const key = panelsKey(root);

  const [panels, setPanels] = useState<Panel[]>(() =>
    parsePanels(localStorage.getItem(panelsKey(store.vaultRoot()))),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const layerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag>(null);

  // Switching project swaps the whole arrangement. Read the new one
  // rather than carrying the old one across, which would silently write
  // one book's layout into another book's key.
  useEffect(() => {
    setPanels(parsePanels(localStorage.getItem(key)));
  }, [key]);

  useEffect(() => {
    try {
      localStorage.setItem(key, serializePanels(panels));
    } catch {
      // A full quota costs the layout, never the board.
    }
  }, [key, panels]);

  const viewport = useCallback((): [number, number] => {
    const el = layerRef.current;
    if (!el) return [1200, 800];
    const r = el.getBoundingClientRect();
    return [r.width, r.height];
  }, []);

  // A narrower window must not strand a panel where its title bar cannot
  // be reached. Re-seat on resize rather than on every render.
  useEffect(() => {
    const onResize = () => {
      const [vw, vh] = viewport();
      setPanels((ps) => clampAll(ps, vw, vh));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [viewport]);

  const startMove = (e: React.PointerEvent, p: Panel) => {
    // Let the buttons in the title bar be buttons.
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const rect = layerRef.current!.getBoundingClientRect();
    dragRef.current = {
      kind: "move",
      id: p.id,
      dx: e.clientX - rect.left - p.x,
      dy: e.clientY - rect.top - p.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setPanels((ps) => bringToFront(ps, p.id));
  };

  const startSize = (e: React.PointerEvent, p: Panel) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { kind: "size", id: p.id, ox: e.clientX, oy: e.clientY, w: p.w, h: p.h };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setPanels((ps) => bringToFront(ps, p.id));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const [vw, vh] = viewport();
    const rect = layerRef.current!.getBoundingClientRect();
    if (d.kind === "move") {
      setPanels((ps) =>
        movePanel(ps, d.id, e.clientX - rect.left - d.dx, e.clientY - rect.top - d.dy, vw, vh),
      );
    } else {
      setPanels((ps) =>
        resizePanel(ps, d.id, d.w + (e.clientX - d.ox), d.h + (e.clientY - d.oy)),
      );
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };

  const open = (tool: TabId) => {
    const [vw, vh] = viewport();
    setPanels((ps) => addPanel(ps, tool, vw, vh));
    setMenuOpen(false);
  };

  return (
    <div className="board-panels" ref={layerRef}>
      {/* The one control that has to exist even with nothing open. */}
      <div className="board-panel-add">
        <button
          className="btn-ghost"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          title="Put a tool on the board — drag it anywhere, size it, keep it"
        >
          + Tool
        </button>
        {menuOpen && (
          <div className="menu-pop board-panel-menu" role="menu">
            {ALL_TABS.map((id) => (
              <button key={id} role="menuitem" className="menu-item" onClick={() => open(id)}>
                {TAB_DEFS[id].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {panels.map((p) => (
        <section
          key={p.id}
          className={`board-panel ${p.collapsed ? "collapsed" : ""}`}
          style={{
            left: p.x,
            top: p.y,
            width: p.w,
            height: p.collapsed ? HEAD_H : p.h,
            zIndex: p.z,
          }}
          onPointerDown={() => setPanels((ps) => bringToFront(ps, p.id))}
        >
          <header
            className="board-panel-head"
            onPointerDown={(e) => startMove(e, p)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDoubleClick={() => setPanels((ps) => toggleCollapse(ps, p.id))}
            title="Drag to move — double-click to fold"
          >
            <span className="board-panel-title">{TAB_DEFS[p.tool].label}</span>
            <button
              className="icon-btn"
              onClick={() => setPanels((ps) => toggleCollapse(ps, p.id))}
              title={p.collapsed ? "Unfold" : "Fold to the title bar"}
            >
              {p.collapsed ? "⌄" : "⌃"}
            </button>
            <button
              className="icon-btn"
              onClick={() => setPanels((ps) => removePanel(ps, p.id))}
              title="Take this off the board"
            >
              ✕
            </button>
          </header>

          {!p.collapsed && (
            <div className="board-panel-body">
              <ToolBody id={p.tool} onShowMusicPlayer={onShowMusicPlayer} />
            </div>
          )}

          {!p.collapsed && (
            <span
              className="board-panel-grip"
              onPointerDown={(e) => startSize(e, p)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              title={`Drag to resize (at least ${MIN_W}×${MIN_H})`}
              aria-hidden
            />
          )}
        </section>
      ))}
    </div>
  );
}
