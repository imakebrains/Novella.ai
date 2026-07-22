import { isTauri, type VaultStorage } from "./adapter";
import { MemoryStorage } from "./memoryStorage";
import { TauriStorage } from "./tauriStorage";
import { WebStorage } from "./webStorage";

let cached: VaultStorage | undefined;

/** The storage backend for this runtime: real disk on desktop, IndexedDB in
    a browser, and plain memory only where IndexedDB doesn't exist (some
    private-browsing modes). Memory is the fallback of last resort — the UI
    tells the writer their edits won't survive a reload. */
export function storage(): VaultStorage {
  cached ??= isTauri()
    ? new TauriStorage()
    : typeof indexedDB !== "undefined"
      ? new WebStorage()
      : new MemoryStorage();
  return cached;
}

export type { VaultFile, VaultStorage } from "./adapter";
export { isTauri } from "./adapter";
