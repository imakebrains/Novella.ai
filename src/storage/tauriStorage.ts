import type { VaultFile, VaultStorage } from "./adapter";
import { isTempPath, tempPathFor } from "./vaultSafety";

/* Real disk access via the Tauri shell. Imports are dynamic so the
   web build never pulls Tauri internals into its bundle. */

/* ============================================================
   Two things this adapter knows that the others cannot

   1. ATOMIC WRITES. Vaults live in Dropbox/Drive/iCloud folders —
      that is the headline storage story — which means a second
      process is reading these files while we write them. writeTextFile
      truncates and then fills, so an interrupted save (crash, power
      cut, a sync client holding the handle) leaves a chapter that is
      half its old self and half nothing. Writing to a sibling temp
      file and renaming over the target makes the swap atomic at the
      filesystem level: readers see the old bytes or the new bytes,
      never a seam.

   2. WHAT THE FILE LOOKED LIKE LAST TIME. mtime plus the text we last
      saw, per path, so saveAll can ask "did somebody else touch this
      while the writer was typing?" before it writes. Kept here rather
      than in the store because this is the only layer that already
      has both values for free — readAll read the text, write() was
      handed it — and because the web and memory adapters genuinely
      have nothing to say on the subject.

   Neither is exposed through the VaultStorage interface. Callers
   narrow on `kind === "tauri"` and cast, the same pattern
   ProjectsPanel already uses for WebStorage.rootExists.
   ============================================================ */

/** What we last saw on disk for one file. */
interface Seen {
  /** Epoch ms. */
  mtimeMs: number;
  /** The exact text, so "did WE change this, or did they?" is answerable. */
  text: string;
}

/** How long to wait before retrying a failed rename. Long enough for a
    sync client to finish its own read and drop the handle, short enough
    that a writer hitting Ctrl+S never notices it happened. */
const RENAME_RETRY_MS = 40;

let tempCounter = 0;

/** Unique per call within a process, and unlikely to collide across two
    Novella windows on the same folder — which is the case this guards. */
function tempToken(): string {
  tempCounter = (tempCounter + 1) % 100000;
  return `${Date.now().toString(36)}${tempCounter.toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;
}

export class TauriStorage implements VaultStorage {
  readonly kind = "tauri" as const;
  readonly persistent = true;

  /** root + "\0" + relPath -> what disk held when we last looked. */
  private seen = new Map<string, Seen>();

  private static key(root: string, relPath: string): string {
    return `${root}\u0000${relPath}`;
  }

  async pickFolder(): Promise<string | null> {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Choose your vault folder",
    });
    if (typeof picked !== "string") return null;
    await this.grantAccess(picked);
    return picked;
  }

  /** The app ships with no filesystem scope. Widen it to this one folder,
      otherwise every read is denied by the capability system. */
  async grantAccess(root: string): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("allow_vault", { path: root });
  }

  async readAll(root: string): Promise<VaultFile[]> {
    const { readDir, readTextFile } = await import("@tauri-apps/plugin-fs");
    const out: VaultFile[] = [];
    // Baselines are gathered concurrently and awaited at the end. The walk
    // itself is sequential (it has to be — it discovers directories as it
    // goes), and making a whole novel's worth of stats wait their turn
    // behind it would put a visible pause on opening a project.
    const baselines: Promise<void>[] = [];

    const walk = async (abs: string, rel: string): Promise<void> => {
      for (const entry of await readDir(abs)) {
        // Skip dotfolders — .git, .obsidian and friends aren't the book.
        // This also sweeps up our own temp files, which are dot-prefixed
        // for exactly that reason.
        if (entry.name.startsWith(".")) continue;
        const childAbs = `${abs}/${entry.name}`;
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;

        if (entry.isDirectory) {
          await walk(childAbs, childRel);
        } else if (entry.name.toLowerCase().endsWith(".md")) {
          const contents = await readTextFile(childAbs);
          out.push({ path: childRel, contents });
          // One extra stat per note, and it buys the don't-clobber check
          // a starting point. Without a baseline recorded HERE, the first
          // save after opening a project has nothing to compare against —
          // and that is precisely the save most likely to land on top of
          // what another machine synced down overnight.
          baselines.push(this.remember(root, childRel, contents, childAbs));
        }
      }
    };

    await walk(root, "");
    // remember() swallows its own failures — a missing baseline degrades
    // to "write", never to a blocked save — so this can never reject.
    await Promise.all(baselines);
    return out;
  }

  async write(root: string, relPath: string, contents: string): Promise<void> {
    const { writeTextFile, remove } = await import("@tauri-apps/plugin-fs");
    const abs = await this.ensureDir(root, relPath);
    const tmpRel = tempPathFor(relPath, tempToken());
    const tmpAbs = `${root}/${tmpRel}`;

    // Step one: get the bytes down somewhere safe. If even this fails
    // there is nothing clever to do — fall through to the plain write so
    // the failure is the writer's real filesystem problem, reported once,
    // rather than a second failure mode we invented.
    try {
      await writeTextFile(tmpAbs, contents);
    } catch {
      await writeTextFile(abs, contents);
      await this.remember(root, relPath, contents, abs);
      return;
    }

    // Step two: the atomic swap. On Windows a sync client can hold the
    // destination open just long enough to make MoveFileEx fail, so one
    // retry after a short pause catches the common case.
    //
    // And if it still won't rename: write directly. This whole feature is
    // hardening, and hardening that turns into a new way to lose a save
    // has failed at its only job. A direct write is exactly as safe as
    // what shipped before this code existed.
    try {
      await this.renameOver(tmpAbs, abs);
    } catch {
      try {
        await new Promise((r) => setTimeout(r, RENAME_RETRY_MS));
        await this.renameOver(tmpAbs, abs);
      } catch {
        // Direct write FIRST, cleanup second. If the direct write also
        // throws we want the temp file to survive: it holds the writer's
        // words, it is invisible to the vault, and litter beats loss.
        await writeTextFile(abs, contents);
        try {
          await remove(tmpAbs);
        } catch {
          /* a stray temp file is litter, not damage */
        }
      }
    }

    await this.remember(root, relPath, contents, abs);
  }

  async writeBytes(root: string, relPath: string, bytes: Uint8Array): Promise<void> {
    const { writeFile, remove } = await import("@tauri-apps/plugin-fs");
    const abs = await this.ensureDir(root, relPath);
    const tmpAbs = `${root}/${tempPathFor(relPath, tempToken())}`;

    // Same argument as write(), and it matters more here than it looks:
    // this is the path .novella/trash/index.json goes through, and a
    // half-written manifest is the one failure trash.ts cannot recover
    // from on its own.
    try {
      await writeFile(tmpAbs, bytes);
    } catch {
      await writeFile(abs, bytes);
      return;
    }

    try {
      await this.renameOver(tmpAbs, abs);
    } catch {
      try {
        await new Promise((r) => setTimeout(r, RENAME_RETRY_MS));
        await this.renameOver(tmpAbs, abs);
      } catch {
        await writeFile(abs, bytes);
        try {
          await remove(tmpAbs);
        } catch {
          /* litter, not damage */
        }
      }
    }
  }

  async readBytes(root: string, relPath: string): Promise<Uint8Array | null> {
    const { readFile, exists } = await import("@tauri-apps/plugin-fs");
    const abs = `${root}/${relPath}`;
    if (!(await exists(abs))) return null;
    return readFile(abs);
  }

  async remove(root: string, relPath: string): Promise<void> {
    const { remove, exists } = await import("@tauri-apps/plugin-fs");
    const abs = `${root}/${relPath}`;
    if (await exists(abs)) await remove(abs);
    this.seen.delete(TauriStorage.key(root, relPath));
  }

  async listFiles(root: string): Promise<{ path: string; bytes: Uint8Array }[]> {
    const { readDir, readFile } = await import("@tauri-apps/plugin-fs");
    const out: { path: string; bytes: Uint8Array }[] = [];

    // Unlike readAll, dotfolders ARE included — .novella holds history,
    // covers and configs, which is half the point of a backup. Only .git
    // stays out: it can dwarf the vault and restores badly from a zip.
    // Our own scratch files stay out too — restoring a backup should not
    // resurrect a save that was interrupted months ago.
    const walk = async (abs: string, rel: string): Promise<void> => {
      for (const entry of await readDir(abs)) {
        if (entry.name === ".git") continue;
        const childAbs = `${abs}/${entry.name}`;
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory) await walk(childAbs, childRel);
        else if (!isTempPath(childRel)) out.push({ path: childRel, bytes: await readFile(childAbs) });
      }
    };

    await walk(root, "");
    return out;
  }

  /* ---------- what disk looked like last time ---------- */

  /** mtime when we last read or wrote this file, or null if we never did.
      Null is not "unchanged" — it is "no opinion", and every caller must
      treat it as permission to write. */
  knownMtime(root: string, relPath: string): number | null {
    return this.seen.get(TauriStorage.key(root, relPath))?.mtimeMs ?? null;
  }

  /** The exact text we last saw on disk. The conflict dialog diffs
      against this, and saveAll uses it to tell "the writer changed this"
      apart from "the note is merely flagged dirty". */
  knownText(root: string, relPath: string): string | null {
    return this.seen.get(TauriStorage.key(root, relPath))?.text ?? null;
  }

  /** mtime right now. Null when the file is missing or stat refuses —
      a new note, a permission oddity, a filesystem with no mtime. Never
      throws: a failed stat must not be able to block a save. */
  async statMtime(root: string, relPath: string): Promise<number | null> {
    try {
      const { stat } = await import("@tauri-apps/plugin-fs");
      const info = await stat(`${root}/${relPath}`);
      return info.mtime ? info.mtime.getTime() : null;
    } catch {
      return null;
    }
  }

  /** Re-read one file and adopt it as the new baseline. This is how
      "load theirs" gets the text it is loading. */
  async readOne(root: string, relPath: string): Promise<string | null> {
    try {
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const abs = `${root}/${relPath}`;
      const text = await readTextFile(abs);
      await this.remember(root, relPath, text, abs);
      return text;
    } catch {
      return null;
    }
  }

  /** Record text + the mtime it now carries.

      If the stat fails the entry is DROPPED rather than kept with a
      stale timestamp. A stale baseline would make the next save think
      the file moved under us and raise a conflict over nothing, which
      is the most annoying possible way for this feature to be wrong. */
  private async remember(
    root: string,
    relPath: string,
    text: string,
    abs?: string,
  ): Promise<void> {
    const key = TauriStorage.key(root, relPath);
    try {
      const { stat } = await import("@tauri-apps/plugin-fs");
      const info = await stat(abs ?? `${root}/${relPath}`);
      if (!info.mtime) {
        this.seen.delete(key);
        return;
      }
      this.seen.set(key, { mtimeMs: info.mtime.getTime(), text });
    } catch {
      this.seen.delete(key);
    }
  }

  /** rename() with the destination's parent guaranteed to exist. Split
      out so write and writeBytes share one definition of "the swap". */
  private async renameOver(fromAbs: string, toAbs: string): Promise<void> {
    const { rename } = await import("@tauri-apps/plugin-fs");
    // std::fs::rename replaces an existing destination on both Windows
    // (MOVEFILE_REPLACE_EXISTING) and POSIX, which is the property the
    // whole scheme rests on. Sibling paths, so it never crosses volumes.
    await rename(fromAbs, toAbs);
  }

  /** Create the parent directory if needed; returns the absolute path. */
  private async ensureDir(root: string, relPath: string): Promise<string> {
    const { mkdir, exists } = await import("@tauri-apps/plugin-fs");
    const abs = `${root}/${relPath}`;
    const slash = abs.lastIndexOf("/");
    if (slash > 0) {
      const dir = abs.slice(0, slash);
      if (!(await exists(dir))) await mkdir(dir, { recursive: true });
    }
    return abs;
  }
}
