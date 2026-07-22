import type { VaultFile, VaultStorage } from "./adapter";
import { SEED_FILES } from "../seed/seedWorld";

/* The web-build fallback. Edits live only for this page session —
   the UI is explicit about that rather than pretending to save. */
export class MemoryStorage implements VaultStorage {
  readonly kind = "memory" as const;
  readonly persistent = false;

  private files = new Map<string, string>(SEED_FILES);
  private blobs = new Map<string, Uint8Array>();

  async pickFolder(): Promise<string | null> {
    return null; // no filesystem to pick from
  }

  async grantAccess(): Promise<void> {
    // Nothing to authorize — there is no filesystem here.
  }

  async readAll(): Promise<VaultFile[]> {
    return [...this.files.entries()].map(([path, contents]) => ({ path, contents }));
  }

  async write(_root: string, relPath: string, contents: string): Promise<void> {
    this.files.set(relPath, contents);
  }

  async writeBytes(_root: string, relPath: string, bytes: Uint8Array): Promise<void> {
    this.blobs.set(relPath, bytes);
  }

  async readBytes(_root: string, relPath: string): Promise<Uint8Array | null> {
    return this.blobs.get(relPath) ?? null;
  }

  async remove(_root: string, relPath: string): Promise<void> {
    this.files.delete(relPath);
    this.blobs.delete(relPath);
  }
}
