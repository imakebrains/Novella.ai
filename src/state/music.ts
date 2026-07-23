import { useSyncExternalStore } from "react";
import { storage } from "../storage";
import { store } from "./vaultStore";

/* ============================================================
   Music

   Writers write to sound — the Notion planner ad that inspired
   this literally ships with a Spotify playlist parked beside the
   manuscript. Novella takes a link to anything (Spotify, YouTube,
   SoundCloud, Apple Music), turns it into the right embed, and
   keeps it in a small dock that survives switching views, so the
   music doesn't stop when you go check the board.

   The choice of playlist is part of a book's atmosphere, so it's
   stored per project (.novella/music.json) and travels with it.
   No API keys, no accounts through us — the embeds are the
   platforms' own players, and any login happens inside them.
   ============================================================ */

export interface MusicEmbed {
  kind: "spotify" | "youtube" | "soundcloud" | "apple";
  embedUrl: string;
  /** Reasonable player height for this platform's embed. */
  height: number;
}

/** Turn a pasted link into an embeddable player URL. Null when the link
    isn't recognisably one of the supported platforms. */
export function parseMusicUrl(raw: string): MusicEmbed | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");

  if (host === "open.spotify.com") {
    const m = url.pathname.match(/^\/(playlist|album|track|artist|show|episode)\/([A-Za-z0-9]+)/);
    if (!m) return null;
    return {
      kind: "spotify",
      embedUrl: `https://open.spotify.com/embed/${m[1]}/${m[2]}`,
      height: m[1] === "track" ? 152 : 352,
    };
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const list = url.searchParams.get("list");
    const v = url.searchParams.get("v");
    if (list) {
      return {
        kind: "youtube",
        embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?list=${list}`,
        height: 200,
      };
    }
    if (v) {
      return { kind: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${v}`, height: 200 };
    }
    return null;
  }

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    if (!id) return null;
    return { kind: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}`, height: 200 };
  }

  if (host === "soundcloud.com") {
    return {
      kind: "soundcloud",
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.href)}&color=%23e8a33d`,
      height: 166,
    };
  }

  if (host === "music.apple.com") {
    return {
      kind: "apple",
      embedUrl: `https://embed.music.apple.com${url.pathname}${url.search}`,
      height: 175,
    };
  }

  return null;
}

/** Curated stations for one-click atmosphere. Public, well-known streams
    and editorial playlists — and anything pasted works just as well. */
export const MUSIC_PRESETS: { name: string; url: string }[] = [
  { name: "Lo-fi beats", url: "https://www.youtube.com/watch?v=jfKfPfyJRdk" },
  { name: "Chillhop radio", url: "https://www.youtube.com/watch?v=5yx6BWlEVcY" },
  { name: "Deep Focus", url: "https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ" },
  { name: "Peaceful Piano", url: "https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO" },
];

const FILE = ".novella/music.json";

function lsKey(): string {
  return `novella.music.${store.vaultRoot() ?? "app"}`;
}

let currentUrl: string | null = null;
let loadedFor: string | null | undefined; // undefined = never loaded
const listeners = new Set<() => void>();
let version = 0;

/* The load/persist race guard. Mutating before the current root's file has
   been read — trivially easy right after a project opens — used to persist
   the empty post-reset cache over the real file. Every persist now waits
   for the load; the load merges instead of clobbering in-flight edits. */
let loadPromise: Promise<void> | null = null;
let mutatedSinceLoad = false;

function ensureLoaded(): Promise<void> {
  if (loadedFor === store.vaultRoot() && loadPromise === null) return Promise.resolve();
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

async function load(): Promise<void> {
  const root = store.vaultRoot();
  loadedFor = root;
  let url: string | null = null;
  if (root) {
    try {
      const bytes = await storage().readBytes(root, FILE);
      if (bytes) url = (JSON.parse(new TextDecoder().decode(bytes)) as { url?: string }).url ?? null;
    } catch {
      /* no saved music — fine */
    }
  } else {
    url = localStorage.getItem(lsKey());
  }
  // A playlist chosen while the file was still loading wins over disk.
  if (!mutatedSinceLoad) currentUrl = url;
  mutatedSinceLoad = false;
  emit();
}

async function persist(): Promise<void> {
  const root = store.vaultRoot();
  if (root) {
    try {
      if (currentUrl) {
        await storage().writeBytes(root, FILE, new TextEncoder().encode(JSON.stringify({ url: currentUrl })));
      } else {
        await storage().remove(root, FILE);
      }
    } catch {
      /* atmosphere is best-effort */
    }
  } else {
    if (currentUrl) localStorage.setItem(lsKey(), currentUrl);
    else localStorage.removeItem(lsKey());
  }
}

export const musicStore = {
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  getVersion(): number {
    return version;
  },

  /** The project's saved music URL, loading it on first ask. */
  url(): string | null {
    if (loadedFor !== store.vaultRoot()) void load();
    return currentUrl;
  },

  embed(): MusicEmbed | null {
    const url = this.url();
    return url ? parseMusicUrl(url) : null;
  },

  set(url: string): boolean {
    if (!parseMusicUrl(url)) return false;
    currentUrl = url.trim();
    mutatedSinceLoad = true;
    void persistSafely();
    emit();
    return true;
  },

  clear(): void {
    currentUrl = null;
    mutatedSinceLoad = true;
    void persistSafely();
    emit();
  },
};

/* A different project may listen to different rain. */
store.onVaultReplaced(() => {
  loadedFor = undefined;
  currentUrl = null;
  emit();
});

export function useMusic(): { url: string | null; embed: MusicEmbed | null } {
  useSyncExternalStore(musicStore.subscribe, musicStore.getVersion, musicStore.getVersion);
  return { url: musicStore.url(), embed: musicStore.embed() };
}
