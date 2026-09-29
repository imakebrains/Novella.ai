/* ============================================================
   Which local book is which cloud book — on this device

   A folder path means nothing on another machine, so the map lives in
   this device's local storage and never syncs (prefs.ts says so). The
   cloud side knows only its own project ids; the join is here.

   Pure, and free of the project registry, so test-synchost.ts can
   round-trip it in node: projects.ts reads localStorage the moment it
   is imported. Callers pass the store in.
   ============================================================ */

import { isTauri } from "../storage/adapter";
import { deviceLabel } from "./syncEngine";

export const BINDINGS_KEY = "novella.cloudBindings";

export interface CloudBinding {
  cloudProjectId: string;
  /** The name conflict copies carry — "(Laptop conflicted copy …)". */
  deviceName: string;
}

/** Local Project.id -> the cloud book it syncs with. */
export type BindingMap = Record<string, CloudBinding>;

export interface PlainKV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** PURE. Anything malformed reads as "not bound" — the worst that costs
    is one "Sync this book" click, where a guessed binding could sync
    the wrong folder into a book. */
export function parseBindings(raw: unknown): BindingMap {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: BindingMap = {};
  for (const [projectId, b] of Object.entries(value as Record<string, unknown>)) {
    if (!projectId || !b || typeof b !== "object") continue;
    const { cloudProjectId, deviceName } = b as Partial<CloudBinding>;
    if (typeof cloudProjectId !== "string" || !cloudProjectId) continue;
    if (typeof deviceName !== "string" || !deviceName) continue;
    out[projectId] = { cloudProjectId, deviceName };
  }
  return out;
}

/** PURE. */
export function withBinding(map: BindingMap, projectId: string, binding: CloudBinding): BindingMap {
  return { ...map, [projectId]: { ...binding } };
}

/** PURE. */
export function withoutBinding(map: BindingMap, projectId: string): BindingMap {
  const next = { ...map };
  delete next[projectId];
  return next;
}

export function readBindings(kv: PlainKV): BindingMap {
  try {
    return parseBindings(kv.getItem(BINDINGS_KEY));
  } catch {
    return {};
  }
}

export function writeBindings(kv: PlainKV, map: BindingMap): void {
  if (Object.keys(map).length === 0) kv.removeItem(BINDINGS_KEY);
  else kv.setItem(BINDINGS_KEY, JSON.stringify(map));
}

export function bindingFor(kv: PlainKV, projectId: string): CloudBinding | null {
  return readBindings(kv)[projectId] ?? null;
}

/** PURE. The local book already syncing with this cloud book, if any —
    one cloud book is never bound to two folders on the same device. */
export function localProjectFor(map: BindingMap, cloudProjectId: string): string | null {
  for (const [projectId, b] of Object.entries(map)) if (b.cloudProjectId === cloudProjectId) return projectId;
  return null;
}

/** PURE. The slug rule ProjectsPanel's createWeb uses for a browser
    book's virtual root, so a book opened from the cloud looks like one
    made here. `taken` must hold every root already in use — registered
    projects AND orphaned IndexedDB roots, or an old forgotten book's
    files would be adopted into the cloud one. */
export function webRootFor(name: string, taken: readonly string[]): string {
  const slug =
    name.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "project";
  let root = `web://${slug}`;
  for (let i = 2; taken.includes(root); i++) root = `web://${slug}-${i}`;
  return root;
}

/** A name for this device inside conflict-copy file names. Node has a
    global `navigator` since v21, so the test for "not a browser" is the
    window, not the navigator. Always a legal deviceLabel. */
export function defaultDeviceName(): string {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "Another device";
  // userAgentData is Chromium-only and absent from TypeScript's DOM lib.
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = (nav.userAgentData?.platform || nav.platform || "").trim();
  const kind = isTauri() ? "desktop" : "browser";
  return deviceLabel(platform ? `${platform} ${kind}` : `This ${kind}`);
}
