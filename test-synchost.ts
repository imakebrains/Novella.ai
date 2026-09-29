/* Assertion tests for the cloud sync host's pure parts.

   The host itself (src/cloud/syncHost.ts) imports the project registry,
   which reads localStorage at import time, so it cannot load in node.
   Every decision it makes is a pure function in a module of its own,
   and those are what this suite walks: the storage wrapper that hears
   writes, the engine's view of a local folder, the scheduler, the
   status line, and the per-device binding map. Section 3 runs the real
   engine between two memory "devices" through those pieces, which is
   the proof that a pulled file is never pushed back.

   Silent unless something is wrong; non-zero exit when it is. */

import { rawStorage, setStorageDecorator, storage, type VaultStorage } from "./src/storage";
import { MemoryStorage } from "./src/storage/memoryStorage";
import { classifyVaultFile } from "./src/storage/vaultSafety";
import { syncingStorage } from "./src/cloud/syncingStorage";
import { localFilesFor, type EditorView } from "./src/cloud/localFiles";
import {
  DEBOUNCE_MS,
  FOCUS_GAP_MS,
  POLL_MS,
  RELOAD_IDLE_MS,
  bindAction,
  canReloadNow,
  needsRefresh,
  staleNotePath,
  wantedTarget,
  whenToSync,
  type SyncTrigger,
} from "./src/cloud/syncSchedule";
import { INITIAL_STATUS, reduceStatus, statusText, statusTip, type SyncStatus } from "./src/cloud/syncStatus";
import {
  BINDINGS_KEY,
  bindingFor,
  defaultDeviceName,
  localProjectFor,
  parseBindings,
  readBindings,
  webRootFor,
  withBinding,
  withoutBinding,
  writeBindings,
  type PlainKV,
} from "./src/cloud/bindingMap";
import {
  ProjectSync,
  deviceLabel,
  emptySyncState,
  type PullPage,
  type PushChange,
  type PushResult,
  type RemoteFile,
  type RemoteFiles,
  type SyncEvent,
  type SyncResult,
} from "./src/cloud/syncEngine";
import { describeCloudError } from "./src/cloud/wire";

let failures = 0;
let checks = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

function ok(name: string, condition: boolean): void {
  checks++;
  if (!condition) {
    failures++;
    console.error(`FAIL  ${name}`);
  }
}

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array | null) => (b === null ? null : new TextDecoder().decode(b));

/** A MemoryStorage with the seed world taken out, so counts mean something. */
async function emptyMemory(): Promise<MemoryStorage> {
  const m = new MemoryStorage();
  for (const f of await m.listFiles()) await m.remove("", f.path);
  return m;
}

/* ---------- 1. the reporting wrapper, through the real storage() hook ---------- */

{
  const before = rawStorage();
  const reports: { kind: string; path: string }[] = [];
  let bound: string | null = "web://a";
  setStorageDecorator((raw) => syncingStorage(raw, () => bound, (kind, path) => reports.push({ kind, path })));
  const s = storage();
  ok("the decorator is what storage() hands out", s !== rawStorage());
  ok("the raw adapter is never re-created by a decorator", rawStorage() === before);
  check("node gets the memory adapter", s.kind, "memory");

  await s.write("web://a", "Manuscript/01.md", "x");
  check("a write to the bound root reports", reports, [{ kind: "write", path: "Manuscript/01.md" }]);
  await s.writeBytes("web://a", ".novella/cover.jpg", new Uint8Array([1, 2]));
  check("writeBytes reports as a write", reports[1], { kind: "write", path: ".novella/cover.jpg" });
  await s.remove("web://a", "Manuscript/01.md");
  check("remove reports as a remove", reports[2], { kind: "remove", path: "Manuscript/01.md" });

  await s.write("web://other", "Manuscript/02.md", "y");
  check("another root never reports", reports.length, 3);
  bound = null;
  await s.write("web://a", "Manuscript/03.md", "z");
  check("nothing bound, nothing reported", reports.length, 3);
  ok("reads still reach the real adapter", (await s.readAll("")).some((f) => f.path === "Manuscript/03.md"));

  setStorageDecorator(null);
  ok("clearing the decorator hands out the raw adapter", storage() === rawStorage());
  ok("…the same one as before", storage() === before);
}

{
  // Report only after the write lands: a failed write must never queue
  // a push, a failed remove never a tombstone.
  const reports: string[] = [];
  const failing = {
    kind: "web",
    persistent: true,
    write: async () => {
      throw new Error("disk full");
    },
    writeBytes: async () => {
      throw new Error("disk full");
    },
    remove: async () => {
      throw new Error("locked");
    },
    rootExists: async (root: string) => root === "r",
  } as unknown as VaultStorage;
  const w = syncingStorage(failing, () => "r", (kind, path) => reports.push(`${kind}:${path}`));
  let threw = 0;
  for (const attempt of [
    () => w.write("r", "a.md", "x"),
    () => w.writeBytes("r", "a.bin", new Uint8Array()),
    () => w.remove("r", "a.md"),
  ]) {
    try {
      await attempt();
    } catch {
      threw++;
    }
  }
  check("failures still reach the caller", threw, 3);
  check("and never report", reports, []);

  // The cast pattern vaultStore (TauriStorage) and ProjectsPanel
  // (WebStorage) rely on: extra methods and fields forward.
  check("kind forwards", w.kind, "web");
  check("persistent forwards", w.persistent, true);
  check(
    "an adapter-specific method forwards",
    await (w as unknown as { rootExists(r: string): Promise<boolean> }).rootExists("r"),
    true,
  );

  // A report that throws must not turn a landed write into a failed save.
  const m = await emptyMemory();
  const noisy = syncingStorage(m, () => "", () => {
    throw new Error("bookkeeping broke");
  });
  let saved = true;
  try {
    await noisy.write("", "a.md", "x");
  } catch {
    saved = false;
  }
  ok("a throwing report never fails the save", saved);
  check("…and the write landed", (await m.readAll()).map((f) => f.path), ["a.md"]);
}

/* ---------- 2. LocalFiles over the memory adapter ---------- */

{
  const m = await emptyMemory();
  const local = localFilesFor(m, "", null);
  const chapter = "---\ntype: chapter\n---\nhi";
  await local.write("Manuscript/02.md", enc(chapter));
  ok("a pulled note lands as TEXT, visible to readAll", (await m.readAll()).some((f) => f.path === "Manuscript/02.md"));
  check("and reads back as the same bytes", dec(await local.read("Manuscript/02.md")), chapter);

  await local.write(".novella/boards.json", enc("{}"));
  check("a pulled config lands as BYTES, where boards.ts reads it", dec(await m.readBytes("", ".novella/boards.json")), "{}");
  check("and the engine reads it back", dec(await local.read(".novella/boards.json")), "{}");

  await local.write("cover.jpg", new Uint8Array([0xff, 0xd8]));
  check("binary stays binary", [...((await m.readBytes("", "cover.jpg")) ?? [])], [0xff, 0xd8]);

  const bad = new Uint8Array([0x68, 0xff, 0xfe, 0x69]);
  await local.write("Manuscript/garbled.md", bad);
  ok("a .md that isn't UTF-8 is not forced into text", !(await m.readAll()).some((f) => f.path === "Manuscript/garbled.md"));
  check("…and still reads back byte for byte", [...((await local.read("Manuscript/garbled.md")) ?? [])], [...bad]);

  const bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]);
  await local.write("Manuscript/bom.md", bom);
  check("a byte-order mark survives the text round trip (the hash must match)", [...((await local.read("Manuscript/bom.md")) ?? [])], [...bom]);

  // One path, one file: rewriting it in the other shape replaces it.
  await m.write("", "cover.jpg", "now text");
  check("a text write replaces a byte entry at the same path", dec(await local.read("cover.jpg")), "now text");

  const listed = await local.list();
  for (const p of ["Manuscript/02.md", ".novella/boards.json", "cover.jpg", "Manuscript/garbled.md"]) {
    ok(`list() includes ${p}`, listed.includes(p));
  }
  check("list() has each path once", new Set(listed).size, listed.length);

  await local.remove("Manuscript/02.md");
  check("remove, then read", await local.read("Manuscript/02.md"), null);
  check("reading a file that was never there", await local.read("nowhere.md"), null);

  let flushed = 0;
  const editor: EditorView = {
    noteIdAt: (p) => (p === "Manuscript/02.md" ? "n1" : undefined),
    isDirty: (id) => id === "n1",
    flush: async () => {
      flushed++;
    },
  };
  const watched = localFilesFor(m, "", editor);
  check("dirty in the editor", watched.isDirty?.("Manuscript/02.md"), true);
  check("not a note in the editor", watched.isDirty?.("Codex/x.md"), false);
  await watched.flush?.("Manuscript/02.md");
  await watched.flush?.("Codex/x.md");
  check("flush writes only when that path is dirty", flushed, 1);
  check("no editor: never dirty", local.isDirty?.("Manuscript/02.md"), false);
  await local.flush?.("Manuscript/02.md");
  ok("no editor: flush is a no-op", true);
}

/* ---------- 3. the engine between two devices, through the real pieces ---------- */

/** push_file() in miniature: compare-and-swap on version, one seq per
    accepted write. Trimmed from test-cloud.ts's FakeServer. */
class FakeServer {
  files = new Map<string, RemoteFile>();
  blobs = new Map<string, Uint8Array>();
  seq = 0;
}

class FakeRemote implements RemoteFiles {
  constructor(
    private readonly server: FakeServer,
    private readonly device: string,
  ) {}
  async pull(since: number): Promise<PullPage> {
    const files = [...this.server.files.values()].filter((f) => f.seq > since).sort((a, b) => a.seq - b.seq);
    return { files: files.map((f) => ({ ...f })), more: false };
  }
  async push(change: PushChange): Promise<PushResult> {
    const cur = this.server.files.get(change.path);
    if ((cur?.version ?? 0) !== change.baseVersion) return { ok: false, reason: "conflict", current: cur ? { ...cur } : null };
    this.server.seq += 1;
    const version = (cur?.version ?? 0) + 1;
    this.server.files.set(change.path, {
      path: change.path,
      version,
      seq: this.server.seq,
      sha256: change.deleted ? "" : change.sha256,
      size: change.content?.length ?? 0,
      deleted: change.deleted,
      content: change.deleted ? null : change.content,
      blobKey: change.deleted ? null : change.blobKey,
      device: this.device,
    });
    return { ok: true, version, seq: this.server.seq };
  }
  async putBlob(sha256: string, bytes: Uint8Array): Promise<string> {
    this.server.blobs.set(sha256, bytes);
    return sha256;
  }
  async getBlob(key: string): Promise<Uint8Array> {
    const b = this.server.blobs.get(key);
    if (!b) throw new Error("no blob");
    return b;
  }
}

interface Device {
  raw: MemoryStorage;
  wrapped: VaultStorage;
  engine: ProjectSync;
  events: SyncEvent[];
  editor: { dirty: Set<string>; flushes: number; onFlush: (() => Promise<void>) | null };
}

async function device(server: FakeServer, name: string): Promise<Device> {
  const raw = await emptyMemory();
  const events: SyncEvent[] = [];
  const editor: Device["editor"] = { dirty: new Set(), flushes: 0, onFlush: null };
  const view: EditorView = {
    noteIdAt: (p) => p,
    isDirty: (id) => editor.dirty.has(id),
    flush: async () => {
      editor.flushes++;
      await editor.onFlush?.();
      editor.dirty.clear();
    },
  };
  let engine: ProjectSync | null = null;
  // The app's arrangement: the app writes through the reporting wrapper,
  // the engine reads and writes the raw adapter underneath it.
  const wrapped = syncingStorage(raw, () => "", (kind, path) => {
    if (kind === "remove") engine?.markRemoved(path);
    else engine?.markChanged(path);
  });
  engine = new ProjectSync({
    remote: new FakeRemote(server, name),
    local: localFilesFor(raw, "", view),
    state: emptySyncState(),
    saveState: () => {},
    onEvent: (e) => events.push(e),
  });
  return { raw, wrapped, engine, events, editor };
}

{
  const server = new FakeServer();
  const a = await device(server, "Laptop");
  const b = await device(server, "Desk");

  await a.wrapped.write("", "Manuscript/01.md", "It was a dark night.");
  check("a write through the wrapper queues a push", a.engine.pendingCount(), 1);
  const pushed = await a.engine.sync();
  check("A pushes the chapter", pushed.pushed, 1);
  check("and has nothing left waiting", a.engine.pendingCount(), 0);

  const pulled = await b.engine.sync();
  check("B pulls it", pulled.pulled, 1);
  check("into its vault, as a note", (await b.raw.readAll()).map((f) => f.contents), ["It was a dark night."]);
  check("and the pull queued nothing to push back", b.engine.pendingCount(), 0);
  ok("the pull asks the host to reload", needsRefresh(b.events));
  const quiet = await b.engine.sync();
  check("a second round is quiet", [quiet.pushed, quiet.pulled], [0, 0]);

  // The dirty path. B has unsaved words in this chapter; the engine
  // flushes them before deciding, so they are on disk and the cloud's
  // newer text lands beside them instead of over them.
  await a.wrapped.write("", "Manuscript/01.md", "It was a bright morning.");
  await a.engine.sync();
  b.events.length = 0;
  b.editor.dirty.add("Manuscript/01.md");
  b.editor.onFlush = () => b.wrapped.write("", "Manuscript/01.md", "It was a dark and stormy night.");
  const clash = await b.engine.sync();
  check("the editor was flushed before the pull decided", b.editor.flushes, 1);
  check("one conflict", clash.conflicts.length, 1);
  const conflict = b.events.find((e) => e.type === "conflict");
  ok("reported as a conflict event", !!conflict);
  const copyPath = conflict && conflict.type === "conflict" ? conflict.copyPath : "";
  check("the copy is one the vault holds out as a conflict", classifyVaultFile(copyPath).kind, "conflict");
  ok("the copy names the other device", copyPath.includes("Laptop conflicted copy"));
  check("B keeps its own words in place", (await b.raw.readAll()).find((f) => f.path === "Manuscript/01.md")?.contents, "It was a dark and stormy night.");
  check("and A's beside them", dec(await localFilesFor(b.raw, "", null).read(copyPath)), "It was a bright morning.");
  ok("a conflict asks the host to reload", needsRefresh(b.events));

  await a.engine.sync();
  check("A now holds B's words", (await a.raw.readAll()).find((f) => f.path === "Manuscript/01.md")?.contents, "It was a dark and stormy night.");
  ok("and the conflict copy too", (await a.raw.readAll()).some((f) => f.path === copyPath));

  // A deletion Novella made travels; a pull of it reports "applied".
  await a.wrapped.remove("", copyPath);
  await a.engine.sync();
  b.events.length = 0;
  await b.engine.sync();
  ok("the delete reached B", !(await b.raw.readAll()).some((f) => f.path === copyPath));
  ok("a pulled delete asks for a reload", needsRefresh(b.events));

  // A pulled dotfolder config must reload too — boards.ts caches it.
  await a.wrapped.writeBytes("", ".novella/boards.json", enc('{"cards":[]}'));
  await a.engine.sync();
  b.events.length = 0;
  await b.engine.sync();
  check("the board layout arrived as bytes", dec(await b.raw.readBytes("", ".novella/boards.json")), '{"cards":[]}');
  ok("a pulled .novella file asks for a reload", needsRefresh(b.events));
}

/* ---------- 4. the scheduler ---------- */

{
  const all: SyncTrigger[] = ["bind", "focus", "poll", "change", "debounce", "online", "realtime"];
  for (const trigger of all) {
    check(`offline: ${trigger} waits`, whenToSync({ trigger, now: 1000, online: false, lastRunAt: null }), { run: false, debounceAt: null });
  }
  check("a change starts the debounce", whenToSync({ trigger: "change", now: 1000, online: true, lastRunAt: null }), {
    run: false,
    debounceAt: 1000 + DEBOUNCE_MS,
  });
  check("a later change restarts it", whenToSync({ trigger: "change", now: 3000, online: true, lastRunAt: null }).debounceAt, 3000 + DEBOUNCE_MS);
  for (const trigger of ["debounce", "bind", "poll", "online", "realtime"] as SyncTrigger[]) {
    check(`${trigger} runs now`, whenToSync({ trigger, now: 50_000, online: true, lastRunAt: 49_999 }), { run: true, debounceAt: null });
  }
  check("focus with no round yet runs", whenToSync({ trigger: "focus", now: 50_000, online: true, lastRunAt: null }).run, true);
  check("focus just after a round waits", whenToSync({ trigger: "focus", now: 50_000, online: true, lastRunAt: 48_000 }).run, false);
  check("focus after the gap runs", whenToSync({ trigger: "focus", now: 50_000, online: true, lastRunAt: 50_000 - FOCUS_GAP_MS }).run, true);
  check("poll every minute", POLL_MS, 60_000);
  check("debounce five seconds", DEBOUNCE_MS, 5_000);

  const applied = (path: string): SyncEvent => ({ type: "applied", path, deleted: false });
  check("no events, no reload", needsRefresh([]), false);
  check("a pulled chapter reloads", needsRefresh([applied("Manuscript/01.md")]), true);
  check("a pulled board layout reloads", needsRefresh([applied(".novella/boards.json")]), true);
  check("a merged history file reloads", needsRefresh([{ type: "merged", path: ".novella/history/x.json" }]), true);
  check("a restored file reloads", needsRefresh([{ type: "restored", path: "Codex/Wren.md" }]), true);
  check("device-only state never reloads", needsRefresh([applied(".novella/local/sync.json")]), false);
  check(
    "limit and held-deletion events alone don't reload",
    needsRefresh([{ type: "limit", limit: "bytes" }, { type: "deletions-held", paths: ["a.md"] }]),
    false,
  );

  check("a pulled chapter is stale in the editor", staleNotePath(applied("Manuscript/01.md")), "Manuscript/01.md");
  check("a restored note too", staleNotePath({ type: "restored", path: "Codex/Wren.md" }), "Codex/Wren.md");
  check("a pulled delete leaves nothing to overwrite", staleNotePath({ type: "applied", path: "Manuscript/01.md", deleted: true }), null);
  check("config is not a note", staleNotePath(applied(".novella/boards.json")), null);
  check("an image is not a note", staleNotePath(applied("Art/map.png")), null);
  // The conflict copy is a new file; the original keeps this device's words.
  check("a conflict leaves the open note current", staleNotePath({ type: "conflict", path: "a.md", copyPath: "a (x conflicted copy 2026-09-29).md" }), null);

  check("unsaved words block a reload", canReloadNow(1, null, 10_000), false);
  check("clean and never edited: reload", canReloadNow(0, null, 10_000), true);
  check("clean but typed a moment ago: wait", canReloadNow(0, 9_000, 10_000), false);
  check("clean and still for the idle gap: reload", canReloadNow(0, 10_000 - RELOAD_IDLE_MS, 10_000), true);

  const project = { id: "p1", path: "web://book" };
  const binding = { cloudProjectId: "c1" };
  const target = { projectId: "p1", root: "web://book", cloudProjectId: "c1" };
  check("the vault on screen is the bound book", wantedTarget(project, "web://book", binding), target);
  check("no binding, nothing wanted", wantedTarget(project, "web://book", null), null);
  check("the demo world never binds", wantedTarget({ id: "seed", path: null }, null, binding), null);
  check("no active project", wantedTarget(undefined, "web://book", binding), null);
  // Mid-switch: ProjectsPanel opens the new folder, then sets it active.
  check("vault and registry disagree mid-switch: wait", wantedTarget(project, "web://other", binding), null);
  // Boot: the project is active before its folder has finished opening.
  check("folder not open yet at boot: wait", wantedTarget(project, null, binding), null);

  check("want it, have nothing: bind", bindAction(target, null), "bind");
  check("already bound to it: stay", bindAction(target, { ...target }), "stay");
  check("nothing wanted, nothing held: stay", bindAction(null, null), "stay");
  check("nothing wanted, something held: unbind", bindAction(null, target), "unbind");
  check("another book: rebind", bindAction({ ...target, projectId: "p2", root: "web://two" }, target), "bind");
  check("same book re-pointed at another cloud book: rebind", bindAction({ ...target, cloudProjectId: "c2" }, target), "bind");
}

/* ---------- 5. the status line ---------- */

{
  const clean: SyncResult = { pulled: 1, pushed: 0, conflicts: [], merged: [], limit: null, heldDeletions: [], error: null };
  const run = (s: SyncStatus, ...actions: Parameters<typeof reduceStatus>[1][]) => actions.reduce(reduceStatus, s);
  const finished = (result: Partial<SyncResult>, pending = 0, at = 42) =>
    ({ type: "finished", result: { ...clean, ...result }, pending, at }) as const;

  check("starts off", INITIAL_STATUS.state, "off");
  check("off says nothing", statusText(INITIAL_STATUS), null);

  const synced = run(INITIAL_STATUS, { type: "bound", pending: 0 });
  check("bound with nothing waiting", [synced.state, statusText(synced)], ["synced", "synced"]);
  const waiting = run(INITIAL_STATUS, { type: "bound", pending: 3 });
  check("bound with three waiting", [waiting.state, statusText(waiting)], ["waiting", "3 waiting"]);

  const syncing = run(synced, { type: "started" });
  check("a round in the air", [syncing.state, statusText(syncing)], ["syncing", "syncing…"]);
  const done = run(syncing, finished({}));
  check("a clean round", [done.state, done.lastSyncedAt, done.message], ["synced", 42, null]);
  ok("the tip says when", (statusTip(done) ?? "").startsWith("Last synced "));

  const offlineMsg = describeCloudError(new TypeError("Failed to fetch")).message;
  const off1 = run(syncing, finished({ error: "Failed to fetch" }));
  check("a network failure is offline", [off1.state, statusText(off1), off1.message], ["offline", "offline", offlineMsg]);
  const off2 = run(syncing, finished({ error: "Failed to fetch" }, 2));
  check("offline with work waiting says so", statusText(off2), "2 waiting — offline");
  check("…and a failed round keeps the last good time", run(done, { type: "started" }, finished({ error: "Failed to fetch" })).lastSyncedAt, 42);

  const expired = run(syncing, finished({ error: "JWT expired" }));
  check("an expired sign-in", [expired.state, statusText(expired)], ["signed-out", "sign in to sync"]);

  const gone = run(syncing, finished({ error: "not_found" }));
  check("a missing book pauses", [gone.state, statusText(gone)], ["error", "sync paused"]);
  check("and says which problem", gone.message, describeCloudError(new Error("not_found")).message);

  const full = run(syncing, finished({ limit: "bytes" }));
  check("storage full", [full.state, full.message], ["error", "Your cloud storage is full. Changes are kept on this device."]);
  const oneBook = run(syncing, finished({ limit: "projects" }));
  check("one-book plan", oneBook.message, describeCloudError(new Error("plan_limit:projects")).message);
  ok("the one-book sentence names the limit", (oneBook.message ?? "").startsWith("Your plan syncs one book"));

  const held = run(syncing, finished({ heldDeletions: ["a.md", "b.md"] }));
  check("held deletions wait for a yes", [held.state, held.heldDeletions, statusText(held)], ["waiting", ["a.md", "b.md"], "2 deletions need your OK"]);
  check("a pending count doesn't hide the question", run(held, { type: "pending", count: 0 }).state, "waiting");

  check("a change while synced", statusText(run(synced, { type: "pending", count: 4 })), "4 waiting");
  check("the queue drains while waiting", run(waiting, { type: "pending", count: 0 }).state, "synced");
  check("a change mid-round stays syncing", run(syncing, { type: "pending", count: 2 }).state, "syncing");

  check("the network drops", run(synced, { type: "offline" }).state, "offline");
  check("and comes back", run(synced, { type: "offline" }, { type: "online" }).state, "waiting");
  check("online while synced changes nothing", run(synced, { type: "online" }), synced);
  check("off stays off through network events", run(INITIAL_STATUS, { type: "offline" }, { type: "online" }), INITIAL_STATUS);
  check("off ignores a straggling round", run(INITIAL_STATUS, finished({})), INITIAL_STATUS);
  check("off ignores pending counts", run(INITIAL_STATUS, { type: "pending", count: 5 }), INITIAL_STATUS);

  const signedOut = run(waiting, { type: "signed-out" });
  check("signed out clears the count", [signedOut.state, signedOut.pending, statusText(signedOut)], ["signed-out", 0, "sign in to sync"]);

  const failed = run(synced, { type: "failed", problem: describeCloudError(new Error("plan_limit:projects")) });
  check("a failure at bind time reads like a failed round", [failed.state, failed.message], ["error", oneBook.message]);
  check("failed offline", run(synced, { type: "failed", problem: describeCloudError(new TypeError("Failed to fetch")) }).state, "offline");
}

/* ---------- 6. the binding map ---------- */

{
  const good = { cloudProjectId: "c1", deviceName: "Laptop" };
  for (const junk of [undefined, null, "", "not json", "[]", "42", '{"p":{"cloudProjectId":1}}', '{"p":{"cloudProjectId":"c"}}']) {
    check(`junk reads as unbound: ${String(junk)}`, parseBindings(junk), {});
  }
  check("a valid entry survives", parseBindings(JSON.stringify({ p1: good })), { p1: good });
  check("a malformed sibling is dropped, the valid one kept", parseBindings({ p1: good, p2: { deviceName: "x" } }), { p1: good });
  check("extra fields are not carried", parseBindings({ p1: { ...good, token: "x" } }), { p1: good });

  const original = { p1: good };
  const added = withBinding(original, "p2", { cloudProjectId: "c2", deviceName: "Desk" });
  check("withBinding adds", Object.keys(added).sort(), ["p1", "p2"]);
  check("withBinding leaves its input alone", original, { p1: good });
  const removed = withoutBinding(added, "p1");
  check("withoutBinding removes", Object.keys(removed), ["p2"]);
  check("withoutBinding leaves its input alone", Object.keys(added).sort(), ["p1", "p2"]);

  const mem = new Map<string, string>();
  const kv: PlainKV = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  };
  writeBindings(kv, added);
  check("round trip", readBindings(kv), added);
  check("stored under the classified key", [...mem.keys()], ["novella.cloudBindings"]);
  check("bindingFor finds one", bindingFor(kv, "p2"), { cloudProjectId: "c2", deviceName: "Desk" });
  check("bindingFor misses cleanly", bindingFor(kv, "nope"), null);
  check("localProjectFor finds the local book", localProjectFor(added, "c2"), "p2");
  check("localProjectFor misses cleanly", localProjectFor(added, "c9"), null);
  writeBindings(kv, {});
  check("an empty map removes the key", kv.getItem(BINDINGS_KEY), null);
  const throwing: PlainKV = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {},
    removeItem: () => {},
  };
  check("blocked storage reads as unbound", readBindings(throwing), {});
  check("the key test-prefs classifies", BINDINGS_KEY, "novella.cloudBindings");

  check("slug", webRootFor("My Book!", []), "web://my-book");
  check("taken once", webRootFor("My Book!", ["web://my-book"]), "web://my-book-2");
  check("taken twice", webRootFor("My Book!", ["web://my-book", "web://my-book-2"]), "web://my-book-3");
  check("no usable characters", webRootFor("!!!", []), "web://project");
  check("empty name", webRootFor("", []), "web://project");
  check("long names cut to forty", webRootFor("a".repeat(60), []), `web://${"a".repeat(40)}`);

  const name = defaultDeviceName();
  check("node has a navigator but no window: a neutral name", name, "Another device");
  check("always a legal conflict-copy label", deviceLabel(name), name);
}

if (failures > 0) {
  console.error(`\ntest-synchost: ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`test-synchost: ${checks} checks passed`);
