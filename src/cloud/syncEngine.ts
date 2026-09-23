/* ============================================================
   Cloud sync — the engine

   The shape is Google Docs offline, not Dropbox: every device keeps a
   full working copy (the real folder on desktop, IndexedDB in a
   browser), writing never waits on the network, and a background
   courier moves changes both ways whenever there is a connection.

   The whole module is written against two small interfaces —
   LocalFiles and RemoteFiles — and never touches a network, a disk or
   a clock directly. That is what lets test-cloud.ts run two, three,
   four "devices" against one in-memory server and prove the rules
   below by losing nothing, rather than by argument.

   THE RULES, in order of how much they matter:

   1. Nothing a writer typed is ever silently discarded. When a file
      changed here AND in the cloud since the last sync, this device's
      text stays where it is and the cloud's text is written beside it
      as "Chapter 7 (Laptop conflicted copy 2026-09-23).md". That name
      is deliberately one the vault's own sync-client detector already
      recognises (storage/vaultSafety.ts), so the copy is held out of
      the link index — it carries the original's frontmatter id, and
      loading it as a note would evict the real chapter — and it lands
      in the Conflicts panel as a decision for the writer. Both files
      then sync, so the question is asked once, on whichever machine
      the writer happens to be at.

   2. A deletion only reaches the cloud when Novella itself made it.
      A file that is simply missing from the local folder — a moved
      vault, a half-restored backup, a sync client mid-download — is
      restored from the cloud, never deleted from it. That is the
      exact mistake that has emptied people's Google Drives.

   3. A deletion that loses to an edit, loses. Deleted here but
      edited elsewhere: the edit comes back. Edited here but deleted
      elsewhere: the edit is pushed and the file returns everywhere.

   4. Many deletions at once wait for a yes. See MASS_DELETE below.

   5. Every byte pulled is checked against the hash the server holds
      before it is written. A truncated download never becomes the
      writer's chapter.

   Config and history under .novella/ follow rule 1 differently:
   there is no writer-facing decision to hand over for a board layout
   JSON, so this device's copy wins, and the cloud's is simply
   replaced. Visible files — the book — always get the copy.
   ============================================================ */

import { isTempPath, sidecarPathFor, splitPath } from "../storage/vaultSafety";

/* ------------------------------------------------------------
   Wire shapes
   ------------------------------------------------------------ */

/** One file as the server currently holds it (a project_files row). */
export interface RemoteFile {
  path: string;
  version: number;
  seq: number;
  sha256: string;
  size: number;
  deleted: boolean;
  /** Inline text, for Markdown and other small text files. */
  content: string | null;
  /** Storage key for everything else. */
  blobKey: string | null;
  /** The name of the device that wrote it — shown in conflict copies. */
  device: string | null;
}

export interface PushChange {
  path: string;
  baseVersion: number;
  sha256: string;
  deleted: boolean;
  content: string | null;
  blobKey: string | null;
}

export type PushResult =
  | { ok: true; version: number; seq: number }
  | { ok: false; reason: "conflict"; current: RemoteFile | null }
  | { ok: false; reason: "limit"; limit: "projects" | "bytes" };

export interface PullPage {
  /** Ascending by seq. */
  files: RemoteFile[];
  /** True when the server stopped at its page size. */
  more: boolean;
}

/** The cloud, as far as one project is concerned. */
export interface RemoteFiles {
  pull(sinceSeq: number): Promise<PullPage>;
  push(change: PushChange): Promise<PushResult>;
  /** Upload bytes, content-addressed. Uploading something already
      there is not an error. Returns the storage key. */
  putBlob(sha256: string, bytes: Uint8Array): Promise<string>;
  getBlob(key: string): Promise<Uint8Array>;
}

/** This device's copy of the project.

    The host MUST hand the engine the raw adapter here, not a wrapper
    that reports writes back to the engine — otherwise every file the
    engine pulls down would queue itself to be pushed straight back up. */
export interface LocalFiles {
  read(path: string): Promise<Uint8Array | null>;
  write(path: string, bytes: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  /** Every file path in the project, dotfolders included. */
  list(): Promise<string[]>;
  /** True while the editor holds unsaved changes to this path. */
  isDirty?(path: string): boolean;
  /** Write any unsaved editor changes for this path to disk now. */
  flush?(path: string): Promise<void>;
}

/* ------------------------------------------------------------
   Persisted per-device state
   ------------------------------------------------------------ */

export interface KnownFile {
  /** The server version this device last matched. */
  version: number;
  sha256: string;
  deleted: boolean;
}

export interface SyncState {
  /** Highest change seq already applied here. */
  cursor: number;
  /** What this device believes the server holds, per path — the base
      every push is compared against. */
  known: Record<string, KnownFile>;
  /** Paths changed here and not yet accepted by the server, each with
      the tick of its most recent change. */
  outbox: Record<string, number>;
  /** Monotonic counter behind outbox ticks. Ticks rather than
      timestamps, because two changes in one millisecond must still be
      told apart — see the push loop. */
  tick: number;
}

export function emptySyncState(): SyncState {
  return { cursor: 0, known: {}, outbox: {}, tick: 0 };
}

/** PURE. A persisted state, validated. Anything malformed yields a
    fresh state: that costs one full re-download, which is slow but
    loses nothing, whereas trusting a corrupt `known` could turn into
    a wrong base version and a bogus conflict. */
export function parseSyncState(raw: unknown): SyncState {
  if (!raw || typeof raw !== "object") return emptySyncState();
  const r = raw as Partial<SyncState>;
  if (typeof r.cursor !== "number" || typeof r.tick !== "number") return emptySyncState();
  if (!r.known || typeof r.known !== "object" || !r.outbox || typeof r.outbox !== "object") {
    return emptySyncState();
  }
  const known: Record<string, KnownFile> = {};
  for (const [path, k] of Object.entries(r.known)) {
    if (k && typeof k.version === "number" && typeof k.sha256 === "string" && typeof k.deleted === "boolean") {
      known[path] = { version: k.version, sha256: k.sha256, deleted: k.deleted };
    }
  }
  const outbox: Record<string, number> = {};
  for (const [path, t] of Object.entries(r.outbox)) {
    if (typeof t === "number") outbox[path] = t;
  }
  return { cursor: r.cursor, known, outbox, tick: r.tick };
}

/* ------------------------------------------------------------
   What syncs
   ------------------------------------------------------------ */

/** Device-only state inside a vault. Nothing under here ever leaves
    the machine — the place for anything that is about THIS computer
    (window geometry, the sync state itself if a host keeps it on disk). */
export const LOCAL_ONLY_DIR = ".novella/local/";

const OS_LITTER = new Set([".ds_store", "thumbs.db", "desktop.ini", ".localized"]);

/** PURE. Does this path travel? */
export function isSyncable(path: string): boolean {
  if (!path || path.length > 1024) return false;
  if (path.startsWith("/") || path.includes("\\")) return false;
  if (path.split("/").some((part) => part === ".." || part === "")) return false;
  if (isTempPath(path)) return false;
  if (path.startsWith(LOCAL_ONLY_DIR)) return false;
  if (path === ".git" || path.startsWith(".git/")) return false;
  const base = splitPath(path).base;
  if (OS_LITTER.has(base.toLowerCase())) return false;
  // Word's lock file for an open .docx: "~$apter 7.docx".
  if (base.startsWith("~$")) return false;
  return true;
}

/** PURE. Is this part of the book a writer reads, as opposed to config
    and history under a dotfolder? Decides who gets a conflict copy. */
export function isVisiblePath(path: string): boolean {
  return !path.split("/").some((part) => part.startsWith("."));
}

/* ------------------------------------------------------------
   Text or bytes
   ------------------------------------------------------------ */

/** Largest file stored inline. Mirrors max_inline_bytes() in the
    migration, and is well under it on purpose so a multi-byte edge
    case can never land exactly on the server's limit. */
export const MAX_INLINE_BYTES = 1_048_576;

const TEXT_EXT = /\.(md|markdown|txt|json|ics|csv|yaml|yml)$/i;

/** PURE. The file as a string when it can travel inline, else null.

    Inline means Postgres `text`, which rules out two things a file on
    disk can legally contain: bytes that aren't UTF-8, and NUL. Both
    fall through to blob storage rather than failing the push.
    `ignoreBOM` keeps a leading byte-order mark IN the string, so the
    server's hash of the text equals the client's hash of the bytes. */
export function inlineText(path: string, bytes: Uint8Array): string | null {
  if (!TEXT_EXT.test(path) || bytes.length > MAX_INLINE_BYTES) return null;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
  if (text.includes("\u0000")) return null;
  return text;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource);
  let hex = "";
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/* ------------------------------------------------------------
   Conflict copies
   ------------------------------------------------------------ */

/** PURE. A device name safe inside a file name and inside the
    "(… conflicted copy …)" pattern — which forbids parentheses. */
export function deviceLabel(raw: string | null | undefined): string {
  const cleaned = (raw ?? "")
    .replace(/[()[\]{}\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .trim();
  return cleaned || "Another device";
}

/** PURE. Where the cloud's side of a conflict is kept.

    `Manuscript/Chapter 7.md` becomes
    `Manuscript/Chapter 7 (Laptop conflicted copy 2026-09-23).md`, and
    `(… 2)` after that if the same device conflicts twice in a day.
    The date is the writer's local calendar day, not UTC — it is read
    by a person trying to remember which evening this was. */
export function conflictCopyPath(path: string, device: string | null, when: Date, taken: Iterable<string>): string {
  const day = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}-${String(when.getDate()).padStart(2, "0")}`;
  return sidecarPathFor(path, `${deviceLabel(device)} conflicted copy ${day}`, taken);
}

/* ------------------------------------------------------------
   Events and results
   ------------------------------------------------------------ */

export type SyncEvent =
  /** A file here was replaced or removed with the cloud's version. The
      host reloads it — an editor still showing the old text would save
      it straight back over the new one. */
  | { type: "applied"; path: string; deleted: boolean }
  /** Both sides changed `path`; the cloud's version is now at `copyPath`. */
  | { type: "conflict"; path: string; copyPath: string }
  /** Deleted here, edited elsewhere — the edit was restored. */
  | { type: "restored"; path: string }
  | { type: "limit"; limit: "projects" | "bytes" }
  | { type: "deletions-held"; paths: string[] };

export interface SyncResult {
  pulled: number;
  pushed: number;
  conflicts: { path: string; copyPath: string }[];
  limit: "projects" | "bytes" | null;
  heldDeletions: string[];
  /** Set when the run stopped early. Everything already done is kept;
      the next run resumes from where this one got to. */
  error: string | null;
}

/** More than this many deletions in one run, AND more than a quarter
    of the synced files, waits for the writer to confirm. Both
    conditions, so tidying ten scratch notes out of a big book never
    nags, and deleting three of a five-file project never does either. */
export const MASS_DELETE_MIN = 10;
export const MASS_DELETE_SHARE = 0.25;

export interface EngineOptions {
  remote: RemoteFiles;
  local: LocalFiles;
  state: SyncState;
  /** Persist state. Called often; hosts should make it cheap. */
  saveState: (state: SyncState) => void | Promise<void>;
  onEvent?: (event: SyncEvent) => void;
  now?: () => Date;
}

/* ------------------------------------------------------------
   The engine
   ------------------------------------------------------------ */

export class ProjectSync {
  private readonly remote: RemoteFiles;
  private readonly local: LocalFiles;
  private readonly saveStateFn: EngineOptions["saveState"];
  private readonly onEvent: (event: SyncEvent) => void;
  private readonly now: () => Date;
  private state: SyncState;
  private running: Promise<SyncResult> | null = null;
  private again = false;
  /** Set by the host after the writer says yes to a held mass delete. */
  private deletionsConfirmed = false;

  constructor(opts: EngineOptions) {
    this.remote = opts.remote;
    this.local = opts.local;
    this.state = opts.state;
    this.saveStateFn = opts.saveState;
    this.onEvent = opts.onEvent ?? (() => {});
    this.now = opts.now ?? (() => new Date());
  }

  /** A copy, so a caller can't mutate what the engine trusts. */
  snapshot(): SyncState {
    return structuredClone(this.state);
  }

  /** Changes waiting for the cloud. The number behind "3 changes not
      yet synced" — the same honesty rule as the autosave line. */
  pendingCount(): number {
    return Object.keys(this.state.outbox).length;
  }

  /** The host calls this after every local write it makes. */
  markChanged(path: string): void {
    if (!isSyncable(path)) return;
    this.state.tick += 1;
    this.state.outbox[path] = this.state.tick;
    void this.persist();
  }

  /** The host calls this after every deletion NOVELLA makes. A file
      that merely went missing is not a deletion — see rule 2. */
  markRemoved(path: string): void {
    this.markChanged(path);
  }

  confirmDeletions(): void {
    this.deletionsConfirmed = true;
  }

  /** Compare the local copy with what this device last synced, and
      queue anything that changed while Novella wasn't watching —
      edited in Notepad, restored from a backup, written by an older
      version of the app. Files that vanished are pulled back down,
      never pushed as deletions. */
  async scan(): Promise<{ queued: number; missing: number }> {
    const paths = (await this.local.list()).filter(isSyncable);
    const present = new Set(paths);
    let queued = 0;
    for (const path of paths) {
      if (path in this.state.outbox) continue;
      const bytes = await this.local.read(path);
      if (bytes === null) continue;
      const k = this.state.known[path];
      if (k && !k.deleted && k.sha256 === (await sha256Hex(bytes))) continue;
      this.state.tick += 1;
      this.state.outbox[path] = this.state.tick;
      queued++;
    }
    let missing = 0;
    for (const [path, k] of Object.entries(this.state.known)) {
      if (k.deleted || present.has(path) || path in this.state.outbox) continue;
      missing++;
    }
    if (missing > 0) {
      // Forget where we were and re-walk the project from the start.
      // The pull applies only what differs, so this costs bandwidth,
      // not correctness — and it is the only way to get the missing
      // files back without a per-file fetch the server doesn't offer.
      this.state.cursor = 0;
      for (const [path, k] of Object.entries(this.state.known)) {
        if (!k.deleted && !present.has(path)) k.version = 0;
      }
    }
    await this.persist();
    return { queued, missing };
  }

  /** One full round: pull, then push. Concurrent calls share the run
      in flight and schedule exactly one more after it, so a burst of
      "sync now" triggers never runs two rounds over the same outbox. */
  sync(): Promise<SyncResult> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      let result: SyncResult;
      do {
        this.again = false;
        result = await this.round();
      } while (this.again && result.error === null);
      return result;
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async round(): Promise<SyncResult> {
    const result: SyncResult = { pulled: 0, pushed: 0, conflicts: [], limit: null, heldDeletions: [], error: null };
    try {
      await this.pullAll(result);
      await this.pushAll(result);
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
    }
    await this.persist();
    return result;
  }

  /* ---------------- pull ---------------- */

  private async pullAll(result: SyncResult): Promise<void> {
    for (;;) {
      const page = await this.remote.pull(this.state.cursor);
      for (const file of page.files) {
        await this.take(file, result);
        if (file.seq > this.state.cursor) this.state.cursor = file.seq;
      }
      await this.persist();
      if (!page.more || page.files.length === 0) return;
    }
  }

  /** Bring one server row to this device. */
  private async take(file: RemoteFile, result: SyncResult): Promise<void> {
    if (!isSyncable(file.path)) return;
    const k = this.state.known[file.path];
    // Our own push coming back, or something already applied.
    if (k && k.version >= file.version) return;

    if (this.local.isDirty?.(file.path)) await this.local.flush?.(file.path);

    const localBytes = await this.local.read(file.path);
    const localSha = localBytes === null ? null : await sha256Hex(localBytes);

    if (!this.diverged(file.path, localBytes, localSha)) {
      await this.apply(file, localSha);
      this.settle(file.path, file);
      result.pulled++;
      return;
    }
    await this.reconcile(file, localBytes, localSha, result);
  }

  /** Has this path changed here since the last sync? Judged by
      content, not by the outbox alone — a path can sit in the outbox
      because the same text was saved twice, and treating that as an
      edit would manufacture a conflict copy out of nothing. */
  private diverged(path: string, localBytes: Uint8Array | null, localSha: string | null): boolean {
    const k = this.state.known[path];
    if (localBytes === null) {
      // Missing here. Only a deletion Novella queued counts as a change.
      return path in this.state.outbox && !!k && !k.deleted;
    }
    if (!k || k.deleted) return true;
    return k.sha256 !== localSha;
  }

  /** Write the server's version here, verifying it first. */
  private async apply(file: RemoteFile, localSha: string | null): Promise<void> {
    if (file.deleted) {
      if (localSha !== null) {
        await this.local.remove(file.path);
        this.onEvent({ type: "applied", path: file.path, deleted: true });
      }
      return;
    }
    if (localSha === file.sha256) return;
    const bytes = await this.fetchBody(file);
    await this.local.write(file.path, bytes);
    this.onEvent({ type: "applied", path: file.path, deleted: false });
  }

  private async fetchBody(file: RemoteFile): Promise<Uint8Array> {
    let bytes: Uint8Array;
    if (file.content !== null) bytes = new TextEncoder().encode(file.content);
    else if (file.blobKey !== null) bytes = await this.remote.getBlob(file.blobKey);
    else throw new Error(`The cloud copy of ${file.path} has no body.`);
    const sha = await sha256Hex(bytes);
    if (sha !== file.sha256) {
      // Rule 5. Throwing stops the round before the cursor moves past
      // this file, so the next round tries it again from scratch.
      throw new Error(`The cloud copy of ${file.path} didn't arrive intact. Nothing was changed; it will be retried.`);
    }
    return bytes;
  }

  /** Both sides changed `file.path`. Rules 1 and 3. */
  private async reconcile(
    file: RemoteFile,
    localBytes: Uint8Array | null,
    localSha: string | null,
    result: SyncResult,
  ): Promise<void> {
    const path = file.path;

    // Same outcome reached twice — nothing to decide.
    if ((file.deleted && localBytes === null) || (!file.deleted && localSha === file.sha256)) {
      this.settle(path, file);
      return;
    }

    // Edited here, deleted there: the edit wins and will be pushed
    // on top of the tombstone.
    if (file.deleted) {
      this.state.known[path] = { version: file.version, sha256: "", deleted: true };
      this.requeue(path);
      return;
    }

    // Deleted here, edited there: the edit comes back.
    if (localBytes === null) {
      await this.apply(file, null);
      this.settle(path, file);
      this.onEvent({ type: "restored", path });
      return;
    }

    // Edited on both sides.
    if (isVisiblePath(path)) {
      const taken = await this.local.list();
      const copyPath = conflictCopyPath(path, file.device, this.now(), taken);
      const theirs = await this.fetchBody(file);
      await this.local.write(copyPath, theirs);
      this.requeue(copyPath);
      result.conflicts.push({ path, copyPath });
      this.onEvent({ type: "conflict", path, copyPath });
    }
    // Ours stays in place and goes up on top of theirs.
    this.state.known[path] = { version: file.version, sha256: file.sha256, deleted: false };
    this.requeue(path);
  }

  private settle(path: string, file: RemoteFile): void {
    this.state.known[path] = { version: file.version, sha256: file.deleted ? "" : file.sha256, deleted: file.deleted };
    delete this.state.outbox[path];
  }

  private requeue(path: string): void {
    this.state.tick += 1;
    this.state.outbox[path] = this.state.tick;
  }

  /* ---------------- push ---------------- */

  private async pushAll(result: SyncResult): Promise<void> {
    const queue = Object.entries(this.state.outbox).sort((a, b) => a[1] - b[1]);

    // Rule 4, decided before anything is sent.
    const deletions: string[] = [];
    for (const [path] of queue) {
      const k = this.state.known[path];
      if (k && !k.deleted && (await this.local.read(path)) === null) deletions.push(path);
    }
    const live = Object.values(this.state.known).filter((k) => !k.deleted).length;
    const hold =
      !this.deletionsConfirmed &&
      deletions.length > MASS_DELETE_MIN &&
      deletions.length > live * MASS_DELETE_SHARE;
    if (hold) {
      result.heldDeletions = deletions;
      this.onEvent({ type: "deletions-held", paths: deletions });
    }
    const held = new Set(hold ? deletions : []);

    // The outbox can grow mid-loop: a conflict found while pushing
    // writes a copy and queues it. Walk until nothing unvisited is
    // left, visiting each path once, so the copy goes up this round
    // instead of sitting on one device until the next.
    const visited = new Set<string>();
    for (;;) {
      const next = Object.entries(this.state.outbox)
        .filter(([path]) => !visited.has(path) && !held.has(path))
        .sort((a, b) => a[1] - b[1])[0];
      if (!next) break;
      const [path, tick] = next;
      visited.add(path);
      const outcome = await this.pushOne(path, tick, result);
      if (outcome === "stop") return;
    }
    if (!hold) this.deletionsConfirmed = false;
  }

  /** Send one path. A conflict is reconciled and retried once in the
      same round; a second conflict means another device is writing
      this file right now, and the next round will get it. */
  private async pushOne(path: string, tick: number, result: SyncResult): Promise<"next" | "stop"> {
    if (!isSyncable(path)) {
      delete this.state.outbox[path];
      return "next";
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const bytes = await this.local.read(path);
      const k = this.state.known[path];
      let change: PushChange;
      if (bytes === null) {
        if (!k || k.deleted) {
          // Created and deleted between syncs: the cloud never saw it.
          this.dropIfUnchanged(path, tick);
          return "next";
        }
        change = { path, baseVersion: k.version, sha256: "", deleted: true, content: null, blobKey: null };
      } else {
        const sha = await sha256Hex(bytes);
        if (k && !k.deleted && k.sha256 === sha) {
          this.dropIfUnchanged(path, tick);
          return "next";
        }
        const text = inlineText(path, bytes);
        const blobKey = text === null ? await this.remote.putBlob(sha, bytes) : null;
        change = { path, baseVersion: k?.version ?? 0, sha256: sha, deleted: false, content: text, blobKey };
      }

      const res = await this.remote.push(change);
      if (res.ok) {
        this.state.known[path] = { version: res.version, sha256: change.sha256, deleted: change.deleted };
        this.dropIfUnchanged(path, tick);
        result.pushed++;
        await this.persist();
        return "next";
      }
      if (res.reason === "limit") {
        result.limit = res.limit;
        this.onEvent({ type: "limit", limit: res.limit });
        return "stop";
      }
      // Conflict. With no current row the server has lost the file we
      // based this on (a project reset); start over as a new file.
      if (res.current === null) {
        delete this.state.known[path];
        continue;
      }
      const localSha = bytes === null ? null : await sha256Hex(bytes);
      await this.reconcile(res.current, bytes, localSha, result);
      // reconcile() requeued the path under a new tick; follow it.
      tick = this.state.outbox[path] ?? tick;
      if (!(path in this.state.outbox)) return "next";
    }
    return "next";
  }

  /** Clear a path from the outbox only if nothing touched it since we
      read it. The writer may have typed while the push was in the air;
      that newer change must survive to the next round. */
  private dropIfUnchanged(path: string, tick: number): void {
    if (this.state.outbox[path] === tick) delete this.state.outbox[path];
  }

  private async persist(): Promise<void> {
    await this.saveStateFn(this.state);
  }
}
