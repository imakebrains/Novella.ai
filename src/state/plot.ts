import { useSyncExternalStore } from "react";
import { storage } from "../storage";
import { store } from "./vaultStore";

/* ============================================================
   Plot threads

   The columns of the plot grid: a main plot and its subplots, each
   a coloured lane running the length of the book. Dabble's plot grid
   is the most-praised structural idea in the category and this is its
   spine.

   Two halves, stored in two places on purpose:

   - PLOT POINTS (the cell contents) live in each chapter's own
     frontmatter, handled by vaultStore. They are content, they belong
     with the prose, and keeping them there means reordering a chapter
     carries its points along for free.

   - THREAD DEFINITIONS (name, colour, order) are project config, not
     content, so they live in .novella/plot.json alongside cover art
     and history — hidden from the codex, travelling with the folder.

   The grid's columns are the UNION of the stored threads and any thread
   id found in a chapter's frontmatter. That means a thread can never
   fully disappear while points reference it: a missing config only costs
   the colour and pretty name, and the column still shows up, recovered
   from the content. Self-healing beats a dangling reference.
   ============================================================ */

export interface PlotThread {
  /** Stable slug, also the frontmatter key on chapters. */
  id: string;
  name: string;
  /** Index into PALETTE. Stored as an index so a palette change reskins
      every project rather than freezing old hexes into the files. */
  color: number;
}

/* Muted, ink-and-parchment hues that sit alongside the themes rather than
   shouting over them. Index-referenced so threads store a number, not a hex. */
export const PALETTE = [
  "#c8794e", // amber
  "#6f8faf", // slate blue
  "#8a9a5b", // moss
  "#b0687f", // rose
  "#9a7bb0", // heather
  "#4f9a94", // teal
  "#c2a24a", // ochre
  "#a06a52", // clay
];

export function threadColor(color: number): string {
  return PALETTE[((color % PALETTE.length) + PALETTE.length) % PALETTE.length]!;
}

const PATH = ".novella/plot.json";

function lsKey(root: string | null): string {
  return `novella.plot.${root ?? "memory"}`;
}

let cached: PlotThread[] | null = null;
let loaded = false;
const listeners = new Set<() => void>();
let version = 0;

/* The load/persist race guard. Mutating before the current root's file has
   been read — trivially easy right after a project opens — used to persist
   the empty post-reset cache over the real file. Every persist now waits
   for the load; the load merges instead of clobbering in-flight edits. */
let loadPromise: Promise<void> | null = null;
let mutatedSinceLoad = false;

function ensureLoaded(): Promise<void> {
  if (loaded && loadPromise === null) return Promise.resolve();
  loadPromise ??= load().finally(() => {
    loadPromise = null;
  });
  return loadPromise;
}

async function persistSafely(): Promise<void> {
  await ensureLoaded();
  await persist();
}

function emit(): void {
  version++;
  for (const l of listeners) l();
}

/* ---------- persistence ---------- */

async function load(): Promise<void> {
  const root = store.vaultRoot();
  let threads: PlotThread[] = [];

  if (root) {
    try {
      const bytes = await storage().readBytes(root, PATH);
      if (bytes) threads = JSON.parse(new TextDecoder().decode(bytes)) as PlotThread[];
    } catch {
      // Unreadable or corrupt config must never block the grid — the
      // columns can still be recovered from chapter frontmatter.
    }
  } else {
    try {
      const raw = localStorage.getItem(lsKey(root));
      if (raw) threads = JSON.parse(raw) as PlotThread[];
    } catch {
      /* same reasoning */
    }
  }

  if (mutatedSinceLoad) {
    // Disk first, local edits on top — a thread made while the file was
    // still loading survives it arriving.
    const local = new Map((cached ?? []).map((t) => [t.id, t]));
    cached = [...threads.filter((t) => !local.has(t.id)), ...local.values()];
  } else {
    cached = threads;
  }
  mutatedSinceLoad = false;
  loaded = true;
  emit();
}

async function persist(): Promise<void> {
  const root = store.vaultRoot();
  const json = JSON.stringify(cached ?? []);
  if (root) {
    try {
      await storage().writeBytes(root, PATH, new TextEncoder().encode(json));
    } catch {
      /* config is best-effort; the points in frontmatter are the real data */
    }
  } else {
    try {
      localStorage.setItem(lsKey(root), json);
    } catch {
      /* quota — nothing to be done */
    }
  }
}

/* ---------- pure column assembly ---------- */

function prettify(id: string): string {
  return id
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** The grid's columns: stored threads first (in their saved order), then
    any thread id present in the content but missing from the config,
    recovered with a prettified name and a stable auto-colour.

    Pure over its inputs so the ordering logic is unit-testable without a
    store or a filesystem. */
export function assembleColumns(stored: PlotThread[], idsInUse: string[]): PlotThread[] {
  const byId = new Map(stored.map((t) => [t.id, t]));
  const columns: PlotThread[] = stored.map((t) => ({ ...t }));

  let nextAuto = stored.length;
  for (const id of idsInUse) {
    if (byId.has(id)) continue;
    columns.push({ id, name: prettify(id), color: nextAuto++ });
  }
  return columns;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 40) || "thread"
  );
}

/** Make an id that collides with nothing already present. */
function uniqueId(name: string, taken: Set<string>): string {
  const base = slugify(name);
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/* ---------- public API ---------- */

export const plotStore = {
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  getVersion(): number {
    return version;
  },

  /** The columns to render, config + content merged. Triggers a load the
      first time it's read for a vault. */
  columns(): PlotThread[] {
    if (!loaded) {
      void load();
      // Even before config loads, the content already knows its columns.
      return assembleColumns([], store.plotThreadIdsInUse());
    }
    return assembleColumns(cached ?? [], store.plotThreadIdsInUse());
  },

  /** Add a thread and return it. Materialises the current display order into
      stored config first, then appends the new thread — so it lands at the
      end where you'd expect, not ahead of columns that were only recovered
      from content. */
  add(name: string): PlotThread {
    const columns = assembleColumns(cached ?? [], store.plotThreadIdsInUse());
    const taken = new Set(columns.map((t) => t.id));
    const thread: PlotThread = {
      id: uniqueId(name || "thread", taken),
      name: name.trim() || "New thread",
      color: columns.length,
    };
    cached = [...columns, thread];
    mutatedSinceLoad = true;
    void persistSafely();
    emit();
    return thread;
  },

  /** Update a thread's name or colour. Materialises the full column order so
      editing one thread never reshuffles the rest, and promotes any
      content-recovered columns to stored config along the way. */
  update(id: string, patch: Partial<Omit<PlotThread, "id">>): void {
    cached = assembleColumns(cached ?? [], store.plotThreadIdsInUse()).map((t) =>
      t.id === id ? { ...t, ...patch } : t,
    );
    mutatedSinceLoad = true;
    void persistSafely();
    emit();
  },

  /** Remove a thread from config AND strip its points from every chapter,
      so nothing is left dangling. */
  remove(id: string): void {
    cached = (cached ?? []).filter((t) => t.id !== id);
    mutatedSinceLoad = true;
    void persistSafely();
    store.removePlotThread(id);
    emit();
  },

  /** Move a column left or right. */
  reorder(id: string, direction: -1 | 1): void {
    const columns = assembleColumns(cached ?? [], store.plotThreadIdsInUse());
    const from = columns.findIndex((t) => t.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= columns.length) return;
    const next = [...columns];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    // Reordering fixes the whole set as stored config — otherwise recovered
    // columns would snap back to content order on the next render.
    cached = next;
    mutatedSinceLoad = true;
    void persistSafely();
    emit();
  },

  /** Drop in-memory config when the vault is swapped, so one book's threads
      never bleed into another's. */
  reset(): void {
    cached = null;
    loaded = false;
    emit();
  },
};

/* Register with the vault store: a new project starts with a clean slate. */
store.onVaultReplaced(() => plotStore.reset());

export function usePlotThreads(): PlotThread[] {
  useSyncExternalStore(plotStore.subscribe, plotStore.getVersion, plotStore.getVersion);
  return plotStore.columns();
}
