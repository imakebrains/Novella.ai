import { useSyncExternalStore } from "react";
import { storage } from "../storage";
import { store } from "./vaultStore";
import { toBannerDataUrl } from "./projects";

/* Card art: drop an image on a board card and it stays with the book.

   Files live at .novella/images/<note-id>.jpg — inside the project
   folder, so a backup zip carries them and a moved folder keeps them.
   In memory they're data URLs in one map, loaded lazily the first time
   a board asks; a project switch empties the map (different book,
   different art). */

const cache = new Map<string, string | null>(); // noteId -> dataURL, null = known absent
const loading = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

const emit = () => {
  version++;
  listeners.forEach((fn) => fn());
};

store.onVaultReplaced(() => {
  cache.clear();
  loading.clear();
  emit();
});

const pathOf = (noteId: string) => `.novella/images/${noteId}.jpg`;

function bytesToDataUrl(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

export async function setCardImage(noteId: string, file: File): Promise<void> {
  const dataUrl = await toBannerDataUrl(file, 640);
  const root = store.vaultRoot();
  if (root) {
    const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    await storage().writeBytes(root, pathOf(noteId), bytes);
  }
  cache.set(noteId, dataUrl);
  emit();
}

export async function removeCardImage(noteId: string): Promise<void> {
  cache.set(noteId, null);
  emit();
  const root = store.vaultRoot();
  if (root) {
    try {
      await storage().remove(root, pathOf(noteId));
    } catch {
      /* nothing there to remove */
    }
  }
}

/** The card's image, or null. Kicks off a lazy disk read on first ask. */
export function cardImageOf(noteId: string): string | null {
  const hit = cache.get(noteId);
  if (hit !== undefined) return hit;
  const root = store.vaultRoot();
  if (!root || loading.has(noteId)) return null;
  loading.add(noteId);
  void storage()
    .readBytes(root, pathOf(noteId))
    .then((bytes) => {
      cache.set(noteId, bytes && bytes.length > 0 ? bytesToDataUrl(bytes) : null);
      if (cache.get(noteId)) emit();
    })
    .catch(() => cache.set(noteId, null))
    .finally(() => loading.delete(noteId));
  return null;
}

export function useCardImages(): number {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => version,
    () => version,
  );
}
