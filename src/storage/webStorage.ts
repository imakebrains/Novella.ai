import type { VaultFile, VaultStorage } from "./adapter";

/* ============================================================
   Browser persistence via IndexedDB

   The web build's answer to "edits live in memory and vanish on
   reload" — which was the one thing keeping it from being a real
   product rather than a demo. Projects created in the browser live
   in IndexedDB: they survive reloads, restarts, and offline use,
   with no install and no permission prompts.

   The shape mirrors a disk vault exactly. A "root" is a virtual
   folder named web://<slug>; keys are root + "\0" + relative path.
   Because the interface is identical to TauriStorage, everything
   built on storage() — saving, history, covers, plot config,
   imports — works in the browser without knowing the difference.

   This is still one browser profile on one machine. Clearing site
   data deletes the projects, and the UI says so where it matters.
   ============================================================ */

const DB_NAME = "novella-vault";
const STORE = "files";
const SEP = "\u0000";

/** Stored value: text for .md files, bytes for everything else. */
interface Entry {
  text?: string;
  bytes?: Uint8Array;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB refused to open."));
  });
  return dbPromise;
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
  });
}

export function fileKey(root: string, relPath: string): string {
  return `${root}${SEP}${relPath}`;
}

/** Every key under one root — the virtual folder's contents. */
function rootRange(root: string): IDBKeyRange {
  return IDBKeyRange.bound(`${root}${SEP}`, `${root}${SEP}\uffff`);
}

export class WebStorage implements VaultStorage {
  readonly kind = "web" as const;
  readonly persistent = true;

  /** There is no OS folder picker on the open web. Projects are created by
      name instead (the projects screen handles that), so this never fires. */
  async pickFolder(): Promise<string | null> {
    return null;
  }

  async grantAccess(): Promise<void> {
    // Nothing to authorize — same-origin storage is already ours.
  }

  async readAll(root: string): Promise<VaultFile[]> {
    if (!root) return [];
    const [keys, values] = await Promise.all([
      withStore("readonly", (s) => s.getAllKeys(rootRange(root))),
      withStore("readonly", (s) => s.getAll(rootRange(root))),
    ]);
    const out: VaultFile[] = [];
    keys.forEach((key, i) => {
      const path = String(key).slice(root.length + SEP.length);
      const entry = values[i] as Entry | undefined;
      // Parity with the disk adapter: the vault is .md files; anything
      // else (covers, history) is fetched explicitly via readBytes.
      if (typeof entry?.text === "string" && path.toLowerCase().endsWith(".md")) {
        out.push({ path, contents: entry.text });
      }
    });
    return out;
  }

  async write(root: string, relPath: string, contents: string): Promise<void> {
    await withStore("readwrite", (s) => s.put({ text: contents } satisfies Entry, fileKey(root, relPath)));
  }

  async writeBytes(root: string, relPath: string, bytes: Uint8Array): Promise<void> {
    await withStore("readwrite", (s) => s.put({ bytes } satisfies Entry, fileKey(root, relPath)));
  }

  async readBytes(root: string, relPath: string): Promise<Uint8Array | null> {
    const entry = (await withStore("readonly", (s) => s.get(fileKey(root, relPath)))) as
      | Entry
      | undefined;
    return entry?.bytes ?? null;
  }

  async remove(root: string, relPath: string): Promise<void> {
    await withStore("readwrite", (s) => s.delete(fileKey(root, relPath)));
  }

  async listFiles(root: string): Promise<{ path: string; bytes: Uint8Array }[]> {
    if (!root) return [];
    const [keys, values] = await Promise.all([
      withStore("readonly", (s) => s.getAllKeys(rootRange(root))),
      withStore("readonly", (s) => s.getAll(rootRange(root))),
    ]);
    const enc = new TextEncoder();
    const out: { path: string; bytes: Uint8Array }[] = [];
    keys.forEach((key, i) => {
      const path = String(key).slice(root.length + SEP.length);
      const entry = values[i] as Entry | undefined;
      if (entry?.bytes) out.push({ path, bytes: entry.bytes });
      else if (typeof entry?.text === "string") out.push({ path, bytes: enc.encode(entry.text) });
    });
    return out;
  }

  /** True when a virtual root already holds files. Used to avoid
      scaffolding over an existing project that shares a name. */
  async rootExists(root: string): Promise<boolean> {
    const count = await withStore("readonly", (s) => s.count(rootRange(root)));
    return count > 0;
  }
}
