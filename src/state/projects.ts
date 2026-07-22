import { useSyncExternalStore } from "react";
import { storage } from "../storage";

/* ============================================================
   Projects

   A project is ONE VAULT FOLDER. Not a database row that points
   at scattered files — a folder you can zip, move, hand to an
   editor, or restore from a backup, with the whole book inside it.

   Projects are hard-isolated: the codex, backlinks, graph and
   corkboard of one project never see another's. That's the point —
   a character named "Wren" in your fantasy shouldn't autocomplete
   while you're writing a contemporary romance.

   A SERIES is not an exception to that rule. A series is one
   project containing several manuscripts that share one codex,
   which is how a series bible actually works. Cross-project
   references are deliberately impossible.

   The registry itself (which folders are projects) is app-level,
   not book-level, so it lives in local storage rather than in any
   vault. Losing it loses no writing — you re-open the folders.

   COVER ART follows the folder rule, not the registry rule. The
   real image is written to <vault>/.novella/cover.jpg, so it moves
   with the project when you zip it, sync it, or clone it to another
   machine. Local storage only holds a copy for instant rendering;
   that copy is a cache and is treated as disposable.
   ============================================================ */

export interface Project {
  id: string;
  name: string;
  /** Absolute path to the vault folder. Null for the in-memory demo. */
  path: string | null;
  /** Downscaled JPEG data URI. For disk-backed projects this is a cache of
      .novella/cover.jpg; for the in-memory demo it's the only copy. */
  banner: string | null;
  /** Freeform, shown on the card — genre, status, whatever helps. */
  subtitle: string;
  createdAt: number;
  lastOpenedAt: number;
}

const KEY = "novella.projects";
const ACTIVE_KEY = "novella.activeProject";

function read(): Project[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Project[]) : [];
  } catch {
    return [];
  }
}

let cached: Project[] = read();
let activeId: string | null = localStorage.getItem(ACTIVE_KEY);
const listeners = new Set<() => void>();

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    // Out of quota. Note that the culprit is often NOT a cover — draft
    // snapshots share this storage and grow with every keystroke — so
    // evict as little as possible instead of wiping every cover.
    //
    // Order: coldest project first, and only where the image also exists
    // on disk (dropping that loses nothing, it re-reads on open). The
    // in-memory demo's cover is the only copy, so it goes last.
    const order = [...cached]
      .sort((a, b) => a.lastOpenedAt - b.lastOpenedAt)
      .sort((a, b) => Number(a.path === null) - Number(b.path === null));

    for (const victim of order) {
      if (!victim.banner) continue;
      cached = cached.map((p) => (p.id === victim.id ? { ...p, banner: null } : p));
      try {
        localStorage.setItem(KEY, JSON.stringify(cached));
        break; // it fit — stop evicting
      } catch {
        /* still too big; drop the next one */
      }
    }
  }
  if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
  else localStorage.removeItem(ACTIVE_KEY);
  for (const l of listeners) l();
}

/** Where cover art lives inside a vault. Dotfolder, so `readAll` skips it
    and it never shows up as a note. */
const COVER_PATH = ".novella/cover.jpg";

function newId(): string {
  return `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const projectStore = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  getSnapshot: (): Project[] => cached,

  all(): Project[] {
    return [...cached].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  },

  active(): Project | undefined {
    return cached.find((p) => p.id === activeId);
  },

  activeId(): string | null {
    return activeId;
  },

  /** Register a folder as a project. Re-opening a known path returns the
      existing entry rather than creating a duplicate. */
  add(input: { name: string; path: string | null; subtitle?: string }): Project {
    const existing = input.path
      ? cached.find((p) => p.path === input.path)
      : undefined;
    if (existing) {
      existing.lastOpenedAt = Date.now();
      persist();
      return existing;
    }

    const project: Project = {
      id: newId(),
      name: input.name.trim() || "Untitled project",
      path: input.path,
      banner: null,
      subtitle: input.subtitle?.trim() ?? "",
      createdAt: Date.now(),
      lastOpenedAt: Date.now(),
    };
    cached = [...cached, project];
    persist();
    return project;
  },

  update(id: string, patch: Partial<Omit<Project, "id">>): void {
    cached = cached.map((p) => (p.id === id ? { ...p, ...patch } : p));
    persist();
  },

  setActive(id: string | null): void {
    activeId = id;
    if (id) {
      cached = cached.map((p) =>
        p.id === id ? { ...p, lastOpenedAt: Date.now() } : p,
      );
    }
    persist();
  },

  /** Forget a project. Never touches the folder on disk — the writing is
      the writer's, and a UI list is not the place to delete a novel. */
  forget(id: string): void {
    cached = cached.filter((p) => p.id !== id);
    if (activeId === id) activeId = null;
    persist();
  },
};

export function useProjects(): Project[] {
  useSyncExternalStore(projectStore.subscribe, projectStore.getSnapshot, projectStore.getSnapshot);
  return projectStore.all();
}

export function useActiveProject(): Project | undefined {
  useSyncExternalStore(projectStore.subscribe, projectStore.getSnapshot, projectStore.getSnapshot);
  return projectStore.active();
}

/* ---------- banners ---------- */

/** Downscale an image to something that fits comfortably in local storage.
    A 6MB phone photo becomes ~60KB; the quota is ~5MB for everything. */
export async function toBannerDataUrl(file: File, maxWidth = 960): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // The browser's own message here is "The source image could not be
    // decoded", which tells a novelist nothing useful.
    throw new Error(`"${file.name}" isn't an image this app can read. Try a JPEG or PNG.`);
  }
  const scale = Math.min(1, maxWidth / bitmap.width);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that image.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", 0.78);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToDataUrl(bytes: Uint8Array): string {
  let binary = "";
  // Chunked: spreading a megabyte-sized array into apply() blows the stack.
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

/** Set a project's cover. Writes it into the vault folder when there is
    one, so the image travels with the project rather than living only in
    this browser profile. */
export async function setProjectBanner(project: Project, file: File): Promise<void> {
  const dataUrl = await toBannerDataUrl(file);
  if (project.path) {
    await storage().grantAccess(project.path);
    await storage().writeBytes(project.path, COVER_PATH, dataUrlToBytes(dataUrl));
  }
  projectStore.update(project.id, { banner: dataUrl });
}

/** Remove a project's cover, from disk as well as the cache. */
export async function clearProjectBanner(project: Project): Promise<void> {
  if (project.path) {
    try {
      await storage().remove(project.path, COVER_PATH);
    } catch {
      // The folder may be on a disconnected drive. Clearing the cached
      // copy still does what the writer asked for on this machine.
    }
  }
  projectStore.update(project.id, { banner: null });
}

/** Pull a project's cover off disk into the cache. Called when a project is
    opened, so a cover made on another machine shows up here. */
export async function hydrateProjectBanner(project: Project): Promise<void> {
  if (!project.path) return;
  try {
    const bytes = await storage().readBytes(project.path, COVER_PATH);
    const banner = bytes ? bytesToDataUrl(bytes) : null;
    if (banner !== project.banner) projectStore.update(project.id, { banner });
  } catch {
    // No cover, or no access. Keep whatever is cached.
  }
}
