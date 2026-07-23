import type { VaultFile, VaultStorage } from "./adapter";

/* Real disk access via the Tauri shell. Imports are dynamic so the
   web build never pulls Tauri internals into its bundle. */
export class TauriStorage implements VaultStorage {
  readonly kind = "tauri" as const;
  readonly persistent = true;

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

    const walk = async (abs: string, rel: string): Promise<void> => {
      for (const entry of await readDir(abs)) {
        // Skip dotfolders — .git, .obsidian and friends aren't the book.
        if (entry.name.startsWith(".")) continue;
        const childAbs = `${abs}/${entry.name}`;
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;

        if (entry.isDirectory) {
          await walk(childAbs, childRel);
        } else if (entry.name.toLowerCase().endsWith(".md")) {
          out.push({ path: childRel, contents: await readTextFile(childAbs) });
        }
      }
    };

    await walk(root, "");
    return out;
  }

  async write(root: string, relPath: string, contents: string): Promise<void> {
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(await this.ensureDir(root, relPath), contents);
  }

  async writeBytes(root: string, relPath: string, bytes: Uint8Array): Promise<void> {
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    await writeFile(await this.ensureDir(root, relPath), bytes);
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
  }

  async listFiles(root: string): Promise<{ path: string; bytes: Uint8Array }[]> {
    const { readDir, readFile } = await import("@tauri-apps/plugin-fs");
    const out: { path: string; bytes: Uint8Array }[] = [];

    // Unlike readAll, dotfolders ARE included — .novella holds history,
    // covers and configs, which is half the point of a backup. Only .git
    // stays out: it can dwarf the vault and restores badly from a zip.
    const walk = async (abs: string, rel: string): Promise<void> => {
      for (const entry of await readDir(abs)) {
        if (entry.name === ".git") continue;
        const childAbs = `${abs}/${entry.name}`;
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory) await walk(childAbs, childRel);
        else out.push({ path: childRel, bytes: await readFile(childAbs) });
      }
    };

    await walk(root, "");
    return out;
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
