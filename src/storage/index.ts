import { isTauri, type VaultStorage } from "./adapter";
import { MemoryStorage } from "./memoryStorage";
import { TauriStorage } from "./tauriStorage";
import { WebStorage } from "./webStorage";

let raw: VaultStorage | undefined;
let cached: VaultStorage | undefined;
let decorator: ((raw: VaultStorage) => VaultStorage) | null = null;

/** The storage backend for this runtime: real disk on desktop, IndexedDB in
    a browser, and plain memory only where IndexedDB doesn't exist (some
    private-browsing modes). Memory is the fallback of last resort — the UI
    tells the writer their edits won't survive a reload. */
export function storage(): VaultStorage {
  raw ??= isTauri()
    ? new TauriStorage()
    : typeof indexedDB !== "undefined"
      ? new WebStorage()
      : new MemoryStorage();
  cached ??= decorator ? decorator(raw) : raw;
  return cached;
}

/** Wrap what storage() hands out — the cloud sync host hears about writes
    through this. The raw adapter is built once and kept: TauriStorage
    carries the mtime baselines the don't-clobber check depends on, so it
    must never be re-created. */
export function setStorageDecorator(fn: ((raw: VaultStorage) => VaultStorage) | null): void {
  decorator = fn;
  cached = undefined;
}

/** The undecorated adapter. The sync engine writes pulled files through
    this, or every file it pulls would queue itself to be pushed back. */
export function rawStorage(): VaultStorage {
  storage();
  return raw as VaultStorage;
}

export type { VaultFile, VaultStorage } from "./adapter";
export { isTauri } from "./adapter";
