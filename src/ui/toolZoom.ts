/* Per-tool zoom.

   Ctrl+scroll anywhere in the app zooms the whole app, because that is
   what the browser does — so making the calendar bigger made the codex,
   the editor and the titlebar bigger with it. That is the wrong unit.
   A calendar wants to be roomy while a task list wants to be dense, and
   those are separate opinions about separate tools.

   The scale is per TOOL, not per panel: two calendars on the board
   should agree with each other and with the calendar in the inspector,
   because they are the same thing shown twice, not two documents.

   It is applied as a font-size multiplier rather than a transform. A
   transform would scale the tool's borders, its scrollbars and its hit
   targets, and would blur text on a fractional factor; changing the
   type size lets every rem-based measurement in the tool re-lay itself
   honestly, which is what "bigger" should mean for a panel of text. */

import type { TabId } from "./inspectorTabs";

export const MIN_ZOOM = 0.75;
export const MAX_ZOOM = 1.6;
export const DEFAULT_ZOOM = 1;

/** Multiplicative, so each step feels the same size at any zoom. */
const STEP = 1.1;

const KEY = "novella.toolZoom";

export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return DEFAULT_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** One notch. `dir` is -1 for out, 1 for in. Rounded so the stored value
    does not accumulate float dust across a hundred wheel events. */
export function stepZoom(current: number, dir: -1 | 1): number {
  const next = dir > 0 ? current * STEP : current / STEP;
  return clampZoom(Math.round(next * 1000) / 1000);
}

export type ZoomMap = Partial<Record<TabId, number>>;

/**
 * Read the map back without trusting it.
 *
 * localStorage is editable and survives version changes. A NaN here
 * would reach CSS as `font-size: NaNrem` and blank the tool, so anything
 * unparseable is dropped rather than rendered.
 */
export function parseZooms(raw: string | null): ZoomMap {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out: ZoomMap = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const c = clampZoom(v);
    // Storing the default is noise; absent already means 1.
    if (c !== DEFAULT_ZOOM) out[k as TabId] = c;
  }
  return out;
}

export function serializeZooms(z: ZoomMap): string {
  return JSON.stringify(z);
}

export function zoomOf(map: ZoomMap, tool: TabId): number {
  return clampZoom(map[tool] ?? DEFAULT_ZOOM);
}

/** Set one tool's zoom, dropping the entry entirely when it is back to 1. */
export function withZoom(map: ZoomMap, tool: TabId, zoom: number): ZoomMap {
  const next: ZoomMap = { ...map };
  const c = clampZoom(zoom);
  if (c === DEFAULT_ZOOM) delete next[tool];
  else next[tool] = c;
  return next;
}

/* ---------------- the store ---------------- */

let current: ZoomMap =
  typeof localStorage === "undefined" ? {} : parseZooms(localStorage.getItem(KEY));

const listeners = new Set<() => void>();

export function toolZooms(): ZoomMap {
  return current;
}

export function setToolZoom(tool: TabId, zoom: number): void {
  current = withZoom(current, tool, zoom);
  try {
    localStorage.setItem(KEY, serializeZooms(current));
  } catch {
    // A full quota costs the preference, never the tool.
  }
  for (const l of listeners) l();
}

export function subscribeToolZoom(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
