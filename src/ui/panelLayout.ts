/* Geometry for the board's free-floating tool panels.

   Named for the arithmetic rather than the component (BoardPanels.tsx)
   because a filename differing only in case is a compile error on
   Windows and a working import everywhere else — the worst kind.

   The inspector docks one tool at a time in a fixed column. The board is
   a planner: the writer should be able to pull the calendar, the task
   list and the codex links out onto it, put them where they want them,
   size them, and have that arrangement still be there next week.

   Every bit of arithmetic lives here rather than in the component, for
   the same reason the tab grid does: "place a new panel where it does
   not land on top of an existing one", "keep a panel reachable when the
   window shrinks", and "do not let a resize invert the panel" are
   exactly the sort of thing that goes quietly wrong, and none of it
   needs a DOM to check. test-panels.ts does the checking. */

import { ALL_TABS, type TabId } from "./inspectorTabs";

export interface Panel {
  /** Stable per panel, not per tool: the same tool can be open twice. */
  id: string;
  tool: TabId;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Higher is nearer the front. Kept dense by normalizeZ. */
  z: number;
  /** Folded to its title bar. The size is remembered, not lost. */
  collapsed?: boolean;
}

/** Below this a panel is a scrollbar with ambitions. */
export const MIN_W = 240;
export const MIN_H = 160;

/** A collapsed panel is its title bar and nothing else. */
export const HEAD_H = 34;

/* Opening size, per tool. A calendar needs a month; a timer needs a
   clock. Guessing one size for both is how a planner ends up feeling
   like a settings dialog. */
const SIZES: Partial<Record<TabId, [number, number]>> = {
  calendar: [420, 560],
  tasks: [420, 460],
  chat: [420, 520],
  assistant: [400, 420],
  critique: [380, 480],
  history: [380, 420],
  continuity: [400, 420],
  links: [320, 380],
  goals: [360, 300],
  music: [340, 300],
  timer: [300, 260],
};

const DEFAULT_SIZE: [number, number] = [380, 420];

export function sizeFor(tool: TabId): [number, number] {
  return SIZES[tool] ?? DEFAULT_SIZE;
}

let seq = 0;
export function newPanelId(tool: TabId): string {
  seq += 1;
  return `${tool}-${seq}`;
}

/** Reset between tests so ids are predictable. Not used by the app. */
export function resetPanelIds(): void {
  seq = 0;
}

export function topZ(panels: Panel[]): number {
  return panels.reduce((n, p) => Math.max(n, p.z), 0);
}

/**
 * Cascade: step each new panel down and right from the last one, and
 * wrap back to the top when the run would leave the viewport.
 *
 * The alternative — always opening at the same spot — hides the new
 * panel exactly underneath the one already there, which reads as the
 * button being broken.
 */
const STEP = 28;
const MARGIN = 16;

export function placeFor(
  panels: Panel[],
  w: number,
  h: number,
  vw: number,
  vh: number,
): { x: number; y: number } {
  const runs = Math.max(1, Math.floor((vh - MARGIN * 2 - h) / STEP) || 1);
  for (let i = 0; i < 200; i++) {
    const x = MARGIN + (i % runs) * STEP + Math.floor(i / runs) * STEP;
    const y = MARGIN + (i % runs) * STEP;
    if (x + w > vw - MARGIN) break;
    // Exact-corner collision only: panels are meant to overlap, they are
    // just never meant to hide each other completely.
    if (!panels.some((p) => Math.abs(p.x - x) < 2 && Math.abs(p.y - y) < 2)) {
      return { x, y };
    }
  }
  return { x: MARGIN, y: MARGIN };
}

export function addPanel(
  panels: Panel[],
  tool: TabId,
  vw: number,
  vh: number,
): Panel[] {
  const [dw, dh] = sizeFor(tool);
  // A panel must fit the room it opens into, whatever the room.
  const w = Math.max(MIN_W, Math.min(dw, vw - MARGIN * 2));
  const h = Math.max(MIN_H, Math.min(dh, vh - MARGIN * 2));
  const { x, y } = placeFor(panels, w, h, vw, vh);
  return [
    ...panels,
    { id: newPanelId(tool), tool, x, y, w, h, z: topZ(panels) + 1 },
  ];
}

export function removePanel(panels: Panel[], id: string): Panel[] {
  return normalizeZ(panels.filter((p) => p.id !== id));
}

export function bringToFront(panels: Panel[], id: string): Panel[] {
  const top = topZ(panels);
  const target = panels.find((p) => p.id === id);
  // Already in front: return the SAME array so React can skip the render.
  if (!target || target.z === top) return panels;
  return normalizeZ(panels.map((p) => (p.id === id ? { ...p, z: top + 1 } : p)));
}

/** Keep z values dense so they cannot climb forever across sessions. */
export function normalizeZ(panels: Panel[]): Panel[] {
  const order = [...panels].sort((a, b) => a.z - b.z);
  const rank = new Map(order.map((p, i) => [p.id, i + 1]));
  return panels.map((p) => ({ ...p, z: rank.get(p.id) ?? p.z }));
}

export function movePanel(
  panels: Panel[],
  id: string,
  x: number,
  y: number,
  vw: number,
  vh: number,
): Panel[] {
  return panels.map((p) => (p.id === id ? { ...p, ...clamp({ ...p, x, y }, vw, vh) } : p));
}

export function resizePanel(
  panels: Panel[],
  id: string,
  w: number,
  h: number,
): Panel[] {
  return panels.map((p) =>
    p.id === id ? { ...p, w: Math.max(MIN_W, w), h: Math.max(MIN_H, h) } : p,
  );
}

export function toggleCollapse(panels: Panel[], id: string): Panel[] {
  return panels.map((p) => (p.id === id ? { ...p, collapsed: !p.collapsed } : p));
}

/**
 * Keep a panel reachable.
 *
 * Not "fully inside": dragging a wide panel half off the right edge is a
 * legitimate way to park it. What must never happen is a title bar
 * leaving the viewport, because the title bar is the only handle — a
 * panel dragged above the top edge can never be dragged back.
 */
export function clamp(p: Panel, vw: number, vh: number): { x: number; y: number } {
  const keep = 80; // enough title bar left to grab
  return {
    x: Math.min(Math.max(p.x, -(p.w - keep)), Math.max(0, vw - keep)),
    y: Math.min(Math.max(p.y, 0), Math.max(0, vh - HEAD_H)),
  };
}

/** Re-seat everything after the window changes size. */
export function clampAll(panels: Panel[], vw: number, vh: number): Panel[] {
  return panels.map((p) => ({ ...p, ...clamp(p, vw, vh) }));
}

/* ---------------- storage ---------------- */

export function panelsKey(vaultRoot: string | null): string {
  // Per project: a planner laid out for one book should not follow you
  // into another one.
  return `novella.board.panels.${vaultRoot ?? "app"}`;
}

/**
 * Read panels back off disk without trusting a byte of it.
 *
 * localStorage is editable, survives version changes, and is exactly
 * where a half-written value lives. A panel naming a tool that no longer
 * exists, or carrying NaN for a coordinate, must be dropped rather than
 * rendered — an unparseable layout should cost the layout, never the
 * board.
 */
export function parsePanels(raw: string | null): Panel[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = Array.isArray(data) ? data : (data as { panels?: unknown })?.panels;
  if (!Array.isArray(list)) return [];

  const seen = new Set<string>();
  const out: Panel[] = [];
  for (const item of list) {
    const p = item as Partial<Panel>;
    if (typeof p?.id !== "string" || seen.has(p.id)) continue;
    if (typeof p.tool !== "string" || !ALL_TABS.includes(p.tool as TabId)) continue;
    const num = (v: unknown, fallback: number) =>
      typeof v === "number" && Number.isFinite(v) ? v : fallback;
    const [dw, dh] = sizeFor(p.tool as TabId);
    seen.add(p.id);
    out.push({
      id: p.id,
      tool: p.tool as TabId,
      x: num(p.x, MARGIN),
      y: num(p.y, MARGIN),
      w: Math.max(MIN_W, num(p.w, dw)),
      h: Math.max(MIN_H, num(p.h, dh)),
      z: num(p.z, out.length + 1),
      ...(p.collapsed ? { collapsed: true } : {}),
    });
  }
  return normalizeZ(out);
}

export function serializePanels(panels: Panel[]): string {
  return JSON.stringify(panels);
}
