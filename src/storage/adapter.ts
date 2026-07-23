/* ============================================================
   Storage adapters
   The vault engine doesn't know or care where files come from.
   Under Tauri that's a real folder on disk; in a plain browser
   it's memory. Same interface, so the UI never branches.
   ============================================================ */

export interface VaultFile {
  /** Path relative to the vault root, forward-slashed. */
  path: string;
  contents: string;
}

export interface VaultStorage {
  readonly kind: "memory" | "tauri" | "web";
  /** False means edits vanish on reload — the UI must say so. */
  readonly persistent: boolean;
  /** Returns the chosen root, or null if the user cancelled / unsupported. */
  pickFolder(): Promise<string | null>;
  /** Authorize access to a root obtained some way other than the picker. */
  grantAccess(root: string): Promise<void>;
  readAll(root: string): Promise<VaultFile[]>;
  write(root: string, relPath: string, contents: string): Promise<void>;
  /** Write non-text vault content — currently just cover art. */
  writeBytes(root: string, relPath: string, bytes: Uint8Array): Promise<void>;
  /** Read non-text vault content. Null when the file isn't there. */
  readBytes(root: string, relPath: string): Promise<Uint8Array | null>;
  /** Remove a file. Missing files are not an error. */
  remove(root: string, relPath: string): Promise<void>;
  /** Every file under the root, bytes included — covers .novella configs,
      covers and history, not just the .md vault. Powers full backups. */
  listFiles(root: string): Promise<{ path: string; bytes: Uint8Array }[]>;
}

/** True when running inside the Tauri desktop shell. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
