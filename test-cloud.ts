/* Assertions for cloud sync — the engine and the plan table.

   Same shape as test-storage.ts: silent unless something is wrong,
   non-zero exit when it is.

   Everything here runs several "devices" against one in-memory server.
   FakeServer mirrors push_file() in supabase/migrations: compare-and-
   swap on the file version, a per-project change counter, tombstones,
   hash verification, blob sizes taken from storage and a byte quota.
   supabase/tests/isolation_test.sql proves the real function behaves
   that way; this file proves the engine does the right thing given a
   server that behaves that way. The two halves meet at that contract.

   The test that matters most is "edited on both sides": both texts
   must exist on both devices afterwards. Every other scenario is a
   variation on not losing a writer's words. */

import { readFileSync } from "node:fs";
import {
  MASS_DELETE_MIN,
  MAX_INLINE_BYTES,
  ProjectSync,
  conflictCopyPath,
  deviceLabel,
  emptySyncState,
  inlineText,
  isSyncable,
  isVisiblePath,
  parseSyncState,
  sha256Hex,
  type LocalFiles,
  type PullPage,
  type PushChange,
  type PushResult,
  type RemoteFile,
  type RemoteFiles,
  type SyncEvent,
  type SyncState,
} from "./src/cloud/syncEngine";
import {
  PLANS,
  TIERS,
  aiShareUsed,
  canSyncAnotherProject,
  formatBytes,
  monthsFreeOnYearly,
  parseAccount,
} from "./src/cloud/plans";
import { classifyVaultFile, tempPathFor } from "./src/storage/vaultSafety";
import { mergeHistory, mergeTrashIndex } from "./src/cloud/mergers";
import { MAX_REVISIONS } from "./src/core/historyThin";

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
const dec = (b: Uint8Array | null | undefined) => (b ? new TextDecoder().decode(b) : null);
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/* ============================================================
   The fake cloud
   ============================================================ */

class FakeServer {
  files = new Map<string, RemoteFile>();
  blobs = new Map<string, Uint8Array>();
  seq = 0;
  maxBytes = Number.POSITIVE_INFINITY;
  pageSize = 1000;
  /** Paths whose content is tampered with on the way out. */
  corrupt = new Set<string>();
  pulls = 0;

  push(change: PushChange, device: string): PushResult {
    const cur = this.files.get(change.path);
    if ((cur?.version ?? 0) !== change.baseVersion) {
      return { ok: false, reason: "conflict", current: cur ? { ...cur } : null };
    }
    let size: number;
    if (change.deleted) size = 0;
    else if (change.content !== null) {
      size = enc(change.content).length;
    } else if (change.blobKey !== null) {
      const blob = this.blobs.get(change.blobKey);
      if (!blob) throw new Error("bad_request:blob_missing");
      size = blob.length;
    } else throw new Error("bad_request:no_body");

    const prior = cur && !cur.deleted ? cur.size : 0;
    if (size > prior) {
      let used = 0;
      for (const f of this.files.values()) if (!f.deleted) used += f.size;
      if (used - prior + size > this.maxBytes) return { ok: false, reason: "limit", limit: "bytes" };
    }

    this.seq += 1;
    const version = (cur?.version ?? 0) + 1;
    this.files.set(change.path, {
      path: change.path,
      version,
      seq: this.seq,
      sha256: change.deleted ? "" : change.sha256,
      size,
      deleted: change.deleted,
      content: change.deleted ? null : change.content,
      blobKey: change.deleted ? null : change.blobKey,
      device,
    });
    return { ok: true, version, seq: this.seq };
  }

  pull(since: number): PullPage {
    this.pulls++;
    const after = [...this.files.values()].filter((f) => f.seq > since).sort((a, b) => a.seq - b.seq);
    const page = after.slice(0, this.pageSize).map((f) =>
      this.corrupt.has(f.path) && f.content !== null ? { ...f, content: f.content + " (truncated" } : { ...f },
    );
    return { files: page, more: after.length > this.pageSize };
  }

  text(path: string): string | null {
    const f = this.files.get(path);
    return f && !f.deleted ? f.content : null;
  }
}

class FakeRemote implements RemoteFiles {
  /** Runs inside push, after the server accepted or refused — the
      moment a writer typing mid-sync would land. */
  duringPush: ((change: PushChange) => void) | null = null;
  blobPuts = 0;

  constructor(
    private readonly server: FakeServer,
    private readonly device: string,
  ) {}

  async pull(since: number): Promise<PullPage> {
    await tick();
    return this.server.pull(since);
  }

  async push(change: PushChange): Promise<PushResult> {
    await tick();
    const res = this.server.push(change, this.device);
    this.duringPush?.(change);
    return res;
  }

  async putBlob(sha: string, bytes: Uint8Array): Promise<string> {
    await tick();
    this.blobPuts++;
    const key = `u/p/${sha}`;
    if (!this.server.blobs.has(key)) this.server.blobs.set(key, bytes.slice());
    return key;
  }

  async getBlob(key: string): Promise<Uint8Array> {
    await tick();
    const blob = this.server.blobs.get(key);
    if (!blob) throw new Error("missing blob");
    return blob.slice();
  }
}

class FakeLocal implements LocalFiles {
  files = new Map<string, Uint8Array>();
  /** Unsaved editor text, per path. */
  unsaved = new Map<string, string>();
  flushed: string[] = [];

  async read(path: string): Promise<Uint8Array | null> {
    const b = this.files.get(path);
    return b ? b.slice() : null;
  }
  async write(path: string, bytes: Uint8Array): Promise<void> {
    this.files.set(path, bytes.slice());
  }
  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }
  async list(): Promise<string[]> {
    return [...this.files.keys()];
  }
  isDirty(path: string): boolean {
    return this.unsaved.has(path);
  }
  async flush(path: string): Promise<void> {
    const text = this.unsaved.get(path);
    if (text === undefined) return;
    this.files.set(path, enc(text));
    this.unsaved.delete(path);
    this.flushed.push(path);
  }
}

interface Device {
  name: string;
  local: FakeLocal;
  remote: FakeRemote;
  engine: ProjectSync;
  events: SyncEvent[];
  saved: () => SyncState;
  write(path: string, text: string): void;
  writeBytes(path: string, bytes: Uint8Array): void;
  remove(path: string): void;
  text(path: string): string | null;
}

const WHEN = new Date(2026, 8, 23, 21, 30);

function device(server: FakeServer, name: string, state: SyncState = emptySyncState(), local = new FakeLocal()): Device {
  const remote = new FakeRemote(server, name);
  const events: SyncEvent[] = [];
  let saved = structuredClone(state);
  const engine = new ProjectSync({
    remote,
    local,
    state: structuredClone(state),
    saveState: (s) => {
      saved = structuredClone(s);
    },
    onEvent: (e) => events.push(e),
    now: () => WHEN,
  });
  return {
    name,
    local,
    remote,
    engine,
    events,
    saved: () => saved,
    write(path, text) {
      local.files.set(path, enc(text));
      engine.markChanged(path);
    },
    writeBytes(path, bytes) {
      local.files.set(path, bytes);
      engine.markChanged(path);
    },
    remove(path) {
      local.files.delete(path);
      engine.markRemoved(path);
    },
    text(path) {
      return dec(local.files.get(path));
    },
  };
}

async function main(): Promise<void> {
  /* ============================================================
     What travels
     ============================================================ */

  ok("syncable: a chapter", isSyncable("Manuscript/01.md"));
  ok("syncable: cover art under .novella", isSyncable(".novella/cover.jpg"));
  ok("not syncable: an atomic-write temp file", !isSyncable(tempPathFor("Manuscript/01.md", "k3f9")));
  ok("not syncable: macOS litter", !isSyncable("Manuscript/.DS_Store"));
  ok("not syncable: Windows litter", !isSyncable("Thumbs.db"));
  ok("not syncable: a Word lock file", !isSyncable("Research/~$notes.docx"));
  ok("not syncable: a git repo inside the vault", !isSyncable(".git/config"));
  ok("not syncable: device-only state", !isSyncable(".novella/local/window.json"));
  ok("not syncable: climbing out", !isSyncable("../escape.md"));
  ok("not syncable: absolute", !isSyncable("/etc/passwd"));
  ok("not syncable: backslash", !isSyncable("Manuscript\\01.md"));
  ok("not syncable: empty segment", !isSyncable("Manuscript//01.md"));
  ok("visible: a chapter", isVisiblePath("Manuscript/01.md"));
  ok("not visible: config", !isVisiblePath(".novella/boards.json"));
  ok("not visible: nested dotfolder", !isVisiblePath("Codex/.drafts/x.md"));

  /* ============================================================
     Text or bytes
     ============================================================ */

  {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]);
    const text = inlineText("a.md", bom);
    ok("BOM file travels inline", text !== null);
    check("BOM survives the round trip byte for byte", [...enc(text ?? "")], [...bom]);
    check("invalid UTF-8 goes to blob storage", inlineText("a.md", new Uint8Array([0x68, 0xff, 0x69])), null);
    check("NUL goes to blob storage (Postgres text can't hold it)", inlineText("a.md", new Uint8Array([0x61, 0x00])), null);
    check("images go to blob storage", inlineText("cover.jpg", enc("not really a jpeg")), null);
    check("an oversized chapter goes to blob storage", inlineText("big.md", new Uint8Array(MAX_INLINE_BYTES + 1).fill(0x61)), null);
    check("JSON config travels inline", inlineText(".novella/boards.json", enc("{}")), "{}");
    check(
      "sha256 of the empty input is the published constant",
      await sha256Hex(new Uint8Array()),
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  }

  /* ============================================================
     Conflict copy names
     ============================================================ */

  {
    check("device label strips the characters the pattern forbids", deviceLabel("Drew's (Laptop)"), "Drew's Laptop");
    check("device label has a fallback", deviceLabel("   "), "Another device");
    ok("device label is bounded", deviceLabel("x".repeat(200)).length <= 40);
    const first = conflictCopyPath("Manuscript/Chapter 7.md", "Laptop", WHEN, []);
    check("conflict copy name", first, "Manuscript/Chapter 7 (Laptop conflicted copy 2026-09-23).md");
    const second = conflictCopyPath("Manuscript/Chapter 7.md", "Laptop", WHEN, [first]);
    check("a second copy the same day is numbered", second, "Manuscript/Chapter 7 (Laptop conflicted copy 2026-09-23 2).md");
    for (const path of [first, second, conflictCopyPath("Ch 1.md", "Drew's (MacBook)", WHEN, [])]) {
      const info = classifyVaultFile(path);
      check(`the vault's detector holds ${path} out of the index`, info.kind, "conflict");
    }
    check(
      "and knows which chapter it is a copy of",
      classifyVaultFile(first).origin,
      "Manuscript/Chapter 7.md",
    );
  }

  /* ============================================================
     State persistence
     ============================================================ */

  {
    check("garbage state starts fresh", parseSyncState("nope"), emptySyncState());
    check("half a state starts fresh", parseSyncState({ cursor: 3 }), emptySyncState());
    const good: SyncState = { cursor: 9, known: { "a.md": { version: 2, sha256: "x", deleted: false } }, outbox: { "a.md": 4 }, tick: 4 };
    check("a good state round-trips", parseSyncState(JSON.parse(JSON.stringify(good))), good);
    check(
      "malformed entries are dropped, not trusted",
      parseSyncState({ cursor: 1, tick: 1, outbox: { "a.md": "soon" }, known: { "a.md": { version: "2" } } }),
      { cursor: 1, known: {}, outbox: {}, tick: 1 },
    );
  }

  /* ============================================================
     Two devices, the everyday path
     ============================================================ */

  {
    const server = new FakeServer();
    const desk = device(server, "Desk");
    const laptop = device(server, "Laptop");

    desk.write("Manuscript/01.md", "It was a dark night.");
    desk.write("Codex/Wren.md", "---\ntype: character\n---\nWren.");
    check("two changes waiting before the first sync", desk.engine.pendingCount(), 2);
    const r1 = await desk.engine.sync();
    check("desk pushes both", r1.pushed, 2);
    check("nothing waiting after", desk.engine.pendingCount(), 0);
    check("server holds the chapter", server.text("Manuscript/01.md"), "It was a dark night.");
    check("server stamps the device", server.files.get("Manuscript/01.md")?.device, "Desk");

    const r2 = await laptop.engine.sync();
    check("laptop pulls both", r2.pulled, 2);
    check("laptop has the chapter", laptop.text("Manuscript/01.md"), "It was a dark night.");
    check("laptop is told to reload what changed", laptop.events.filter((e) => e.type === "applied").length, 2);

    laptop.write("Manuscript/01.md", "It was a dark and stormy night.");
    await laptop.engine.sync();
    await desk.engine.sync();
    check("an edit on the laptop reaches the desk", desk.text("Manuscript/01.md"), "It was a dark and stormy night.");
    check("desk now knows version 2", desk.saved().known["Manuscript/01.md"]?.version, 2);

    const pushesBefore = server.seq;
    const r3 = await desk.engine.sync();
    check("a quiet sync pushes nothing", r3.pushed, 0);
    check("and pulls nothing", r3.pulled, 0);
    check("the server's counter did not move", server.seq, pushesBefore);

    desk.write("Manuscript/01.md", "It was a dark and stormy night.");
    const r4 = await desk.engine.sync();
    check("saving identical text is not a change", r4.pushed, 0);
    check("and leaves nothing waiting", desk.engine.pendingCount(), 0);

    desk.remove("Codex/Wren.md");
    await desk.engine.sync();
    ok("a deletion becomes a tombstone", server.files.get("Codex/Wren.md")?.deleted === true);
    await laptop.engine.sync();
    check("and removes the file on the laptop", laptop.text("Codex/Wren.md"), null);
    ok("with an event saying so", laptop.events.some((e) => e.type === "applied" && e.path === "Codex/Wren.md" && e.deleted));
  }

  /* ============================================================
     Edited on both sides — the one that matters
     ============================================================ */

  {
    const server = new FakeServer();
    const desk = device(server, "Desk");
    const laptop = device(server, "Laptop");
    desk.write("Manuscript/07.md", "Draft one.");
    await desk.engine.sync();
    await laptop.engine.sync();

    desk.write("Manuscript/07.md", "Draft one, revised at the desk.");
    laptop.write("Manuscript/07.md", "Draft one, revised on the train.");

    await desk.engine.sync();
    const r = await laptop.engine.sync();

    const copy = "Manuscript/07 (Desk conflicted copy 2026-09-23).md";
    check("the laptop reports one conflict", r.conflicts, [{ path: "Manuscript/07.md", copyPath: copy }]);
    check("the laptop keeps its own text in place", laptop.text("Manuscript/07.md"), "Draft one, revised on the train.");
    check("and the desk's text beside it", laptop.text(copy), "Draft one, revised at the desk.");
    check("the laptop's text is now the cloud's", server.text("Manuscript/07.md"), "Draft one, revised on the train.");
    check("the copy went up in the same round", server.text(copy), "Draft one, revised at the desk.");

    await desk.engine.sync();
    check("the desk now shows the laptop's text", desk.text("Manuscript/07.md"), "Draft one, revised on the train.");
    check("and has its own words back as the copy", desk.text(copy), "Draft one, revised at the desk.");
    check("the desk has no conflict of its own to report", desk.events.filter((e) => e.type === "conflict").length, 0);
    check("nothing is left waiting anywhere", desk.engine.pendingCount() + laptop.engine.pendingCount(), 0);

    // Same edit on both sides is agreement, not a conflict.
    desk.write("Manuscript/08.md", "Same.");
    await desk.engine.sync();
    await laptop.engine.sync();
    desk.write("Manuscript/08.md", "Same, but better.");
    laptop.write("Manuscript/08.md", "Same, but better.");
    await desk.engine.sync();
    const same = await laptop.engine.sync();
    check("identical edits on both sides make no copy", same.conflicts.length, 0);
    ok(
      "and no stray file",
      ![...laptop.local.files.keys()].some((p) => p.startsWith("Manuscript/08 (")),
    );
  }

  /* ============================================================
     Delete versus edit — the edit always wins
     ============================================================ */

  {
    const server = new FakeServer();
    const desk = device(server, "Desk");
    const laptop = device(server, "Laptop");
    desk.write("Notes/keep.md", "v1");
    desk.write("Notes/restore.md", "v1");
    await desk.engine.sync();
    await laptop.engine.sync();

    // Deleted at the desk, edited on the laptop.
    desk.remove("Notes/keep.md");
    await desk.engine.sync();
    laptop.write("Notes/keep.md", "v2 from the train");
    await laptop.engine.sync();
    check("an edit on top of a remote delete is pushed", server.text("Notes/keep.md"), "v2 from the train");
    await desk.engine.sync();
    check("and comes back to the device that deleted it", desk.text("Notes/keep.md"), "v2 from the train");

    // Edited at the desk, deleted on the laptop.
    desk.write("Notes/restore.md", "v2 from the desk");
    await desk.engine.sync();
    laptop.remove("Notes/restore.md");
    const r = await laptop.engine.sync();
    check("a local delete of a remotely edited file is undone", laptop.text("Notes/restore.md"), "v2 from the desk");
    ok("with a restored event", laptop.events.some((e) => e.type === "restored" && e.path === "Notes/restore.md"));
    check("the cloud copy was never deleted", server.files.get("Notes/restore.md")?.deleted, false);
    check("and the restore is not reported as a conflict", r.conflicts.length, 0);
  }

  /* ============================================================
     Config under .novella: this device wins, no copy
     ============================================================ */

  {
    const server = new FakeServer();
    const desk = device(server, "Desk");
    const laptop = device(server, "Laptop");
    desk.write(".novella/boards.json", '{"v":1}');
    await desk.engine.sync();
    await laptop.engine.sync();
    desk.write(".novella/boards.json", '{"v":"desk"}');
    laptop.write(".novella/boards.json", '{"v":"laptop"}');
    await desk.engine.sync();
    const r = await laptop.engine.sync();
    check("a config conflict makes no copy", r.conflicts.length, 0);
    ok("and no stray file", ![...laptop.local.files.keys()].some((p) => p.includes("conflicted copy")));
    check("this device's config wins", server.text(".novella/boards.json"), '{"v":"laptop"}');
    await desk.engine.sync();
    check("and reaches the other device", desk.text(".novella/boards.json"), '{"v":"laptop"}');
  }

  /* ============================================================
     History and the trash manifest are united, not chosen
     ============================================================ */

  {
    const at = WHEN.getTime();
    const rev = (n: number, reason: string) => ({ at: at - n * 60_000, body: `draft ${n}`, reason, words: 2 });
    const hist = (...revs: ReturnType<typeof rev>[]) => JSON.stringify({ id: "ch1", title: "One", revisions: revs });

    // Pure rules first.
    const m = mergeHistory(JSON.parse(hist(rev(3, "save"), rev(1, "mine"))), JSON.parse(hist(rev(3, "save"), rev(2, "theirs"))), at);
    check("history: the union, in time order", m?.revisions.map((r) => r.reason), ["save", "theirs", "mine"]);
    check("history: a different note's file is not merged", mergeHistory(JSON.parse(hist(rev(1, "a"))), { id: "ch2", title: "", revisions: [] }, at), null);
    check("history: a corrupt side is refused, not guessed", mergeHistory("nope", JSON.parse(hist(rev(1, "a"))), at), null);
    const many = Array.from({ length: MAX_REVISIONS }, (_, i) => rev(i * 60 * 24 + 1, `d${i}`));
    const big = mergeHistory({ id: "ch1", title: "", revisions: many }, { id: "ch1", title: "", revisions: many.map((r) => ({ ...r, at: r.at + 1 })) }, at);
    ok("history: a union over budget is thinned like a single device's", !!big && big.revisions.length <= MAX_REVISIONS && big.revisions.length > MAX_REVISIONS / 2);

    const idx = (retention: unknown, ...ids: string[]) => ({ version: 1, retention, entries: ids.map((entryId, i) => ({ entryId, trashedAt: at - i, path: `${entryId}.md`, title: entryId })) });
    const t = mergeTrashIndex(idx(7, "a", "b"), idx(30, "b", "c"));
    check("trash: the union of entries", t?.entries.map((e) => e.entryId).sort(), ["a", "b", "c"]);
    check("trash: this device's retention window", t?.retention, 7);
    check("trash: a corrupt side is refused", mergeTrashIndex({ entries: "x" }, idx(7, "a")), null);

    // Then the engine, two devices apart.
    const server = new FakeServer();
    const desk = device(server, "Desk");
    const laptop = device(server, "Laptop");
    desk.write(".novella/history/ch1.json", hist(rev(9, "save")));
    desk.write(".novella/trash/index.json", JSON.stringify(idx(7)));
    desk.write(".novella/boards.json", '{"v":1}');
    await desk.engine.sync();
    await laptop.engine.sync();

    desk.write(".novella/history/ch1.json", hist(rev(9, "save"), rev(5, "before the robot, desk")));
    laptop.write(".novella/history/ch1.json", hist(rev(9, "save"), rev(4, "before the robot, laptop")));
    desk.write(".novella/trash/index.json", JSON.stringify(idx(7, "scene-desk")));
    laptop.write(".novella/trash/index.json", JSON.stringify(idx(30, "scene-laptop")));
    desk.write(".novella/boards.json", '{"v":"desk"}');
    laptop.write(".novella/boards.json", '{"v":"laptop"}');

    await desk.engine.sync();
    const r = await laptop.engine.sync();
    check("the laptop reports the two merged files", r.merged.sort(), [".novella/history/ch1.json", ".novella/trash/index.json"]);
    check("and no conflict copy for any of them", r.conflicts.length, 0);
    ok("with a merged event per file", laptop.events.filter((e) => e.type === "merged").length === 2);
    await desk.engine.sync();
    for (const d of [desk, laptop]) {
      const h = JSON.parse(d.text(".novella/history/ch1.json") ?? "{}") as { revisions: { reason: string }[] };
      check(`${d.name} has both devices' snapshots`, h.revisions.map((x) => x.reason), ["save", "before the robot, desk", "before the robot, laptop"]);
      const ti = JSON.parse(d.text(".novella/trash/index.json") ?? "{}") as { entries: { entryId: string }[] };
      check(`${d.name} has both devices' trashed scenes`, ti.entries.map((e) => e.entryId).sort(), ["scene-desk", "scene-laptop"]);
    }
    check("the manifest's retention followed the device that merged", JSON.parse(laptop.text(".novella/trash/index.json") ?? "{}").retention, 30);
    check("a board layout still goes to the device that synced second", desk.text(".novella/boards.json"), '{"v":"laptop"}');
    check("nothing is left waiting", desk.engine.pendingCount() + laptop.engine.pendingCount(), 0);

    // A corrupt history on one side: the ordinary rule, no crash.
    desk.write(".novella/history/ch1.json", "{not json");
    laptop.write(".novella/history/ch1.json", hist(rev(9, "save"), rev(1, "laptop again")));
    await desk.engine.sync();
    const bad = await laptop.engine.sync();
    check("a corrupt side falls back to this-device-wins", [bad.error, bad.merged.length], [null, 0]);
    check("and the laptop's file is what the cloud now holds", server.text(".novella/history/ch1.json"), hist(rev(9, "save"), rev(1, "laptop again")));
  }

  /* ============================================================
     Bytes: cover art and card images
     ============================================================ */

  {
    const server = new FakeServer();
    const desk = device(server, "Desk");
    const laptop = device(server, "Laptop");
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    desk.writeBytes(".novella/cover.jpg", jpeg);
    await desk.engine.sync();
    check("binary goes to blob storage", desk.remote.blobPuts, 1);
    check("the row carries no inline text", server.files.get(".novella/cover.jpg")?.content, null);
    await laptop.engine.sync();
    check("and arrives byte for byte", [...(laptop.local.files.get(".novella/cover.jpg") ?? [])], [...jpeg]);
  }

  /* ============================================================
     Integrity: a damaged download is never written
     ============================================================ */

  {
    const server = new FakeServer();
    const desk = device(server, "Desk");
    const laptop = device(server, "Laptop");
    desk.write("Manuscript/01.md", "Whole.");
    desk.write("Manuscript/02.md", "Also whole.");
    await desk.engine.sync();

    server.corrupt.add("Manuscript/02.md");
    const r = await laptop.engine.sync();
    ok("a hash mismatch stops the round with an error", r.error !== null && r.error.includes("didn't arrive intact"));
    check("the damaged file is not written", laptop.text("Manuscript/02.md"), null);
    check("files before it in the page are kept", laptop.text("Manuscript/01.md"), "Whole.");
    check("the cursor stops before the damaged file", laptop.saved().cursor, 1);

    server.corrupt.clear();
    const again = await laptop.engine.sync();
    check("the next round succeeds", again.error, null);
    check("and brings the file whole", laptop.text("Manuscript/02.md"), "Also whole.");
  }

  /* ============================================================
     Typing while a push is in the air
     ============================================================ */

  {
    const server = new FakeServer();
    const desk = device(server, "Desk");
    desk.write("Manuscript/01.md", "First sentence.");
    desk.remote.duringPush = (change) => {
      if (change.path === "Manuscript/01.md" && change.content === "First sentence.") {
        desk.write("Manuscript/01.md", "First sentence. Second, typed during the upload.");
      }
    };
    await desk.engine.sync();
    check("the newer keystrokes are still waiting", desk.engine.pendingCount(), 1);
    desk.remote.duringPush = null;
    await desk.engine.sync();
    check("and reach the cloud on the next round", server.text("Manuscript/01.md"), "First sentence. Second, typed during the upload.");
  }

  /* ============================================================
     Unsaved editor text is flushed before a remote change lands
     ============================================================ */

  {
    const server = new FakeServer();
    const desk = device(server, "Desk");
    const laptop = device(server, "Laptop");
    desk.write("Manuscript/03.md", "Base.");
    await desk.engine.sync();
    await laptop.engine.sync();

    laptop.write("Manuscript/03.md", "Base, from the laptop.");
    await laptop.engine.sync();
    // The desk's editor has typing that never reached disk.
    desk.local.unsaved.set("Manuscript/03.md", "Base, typed at the desk but unsaved.");
    const r = await desk.engine.sync();
    check("the engine asked the editor to save first", desk.local.flushed, ["Manuscript/03.md"]);
    check("the unsaved words are kept in place", desk.text("Manuscript/03.md"), "Base, typed at the desk but unsaved.");
    check("the laptop's words are kept beside them", r.conflicts.length, 1);
  }

  /* ============================================================
     Crash between the server saying yes and the state being saved
     ============================================================ */

  {
    const server = new FakeServer();
    const first = device(server, "Desk");
    first.write("Manuscript/01.md", "Before.");
    await first.engine.sync();
    const stale = first.saved();
    first.write("Manuscript/01.md", "After.");
    await first.engine.sync();
    check("the server has the new text", server.text("Manuscript/01.md"), "After.");

    // Restart from the state as it was BEFORE that push, with the
    // local file as it is after — what a crash at the wrong moment leaves.
    const revived = device(server, "Desk", stale, first.local);
    revived.engine.markChanged("Manuscript/01.md");
    const r = await revived.engine.sync();
    check("recovering from the crash makes no conflict copy", r.conflicts.length, 0);
    check("and pushes nothing new", server.files.get("Manuscript/01.md")?.version, 2);
    check("and leaves nothing waiting", revived.engine.pendingCount(), 0);
  }

  /* ============================================================
     Rule 2: missing is not deleted
     ============================================================ */

  {
    const server = new FakeServer();
    const desk = device(server, "Desk");
    desk.write("Manuscript/01.md", "One.");
    desk.write("Manuscript/02.md", "Two.");
    desk.write("Manuscript/03.md", "Three.");
    await desk.engine.sync();

    // Gone from the folder without Novella deleting it, and one file
    // edited in Notepad while the app was closed.
    desk.local.files.delete("Manuscript/02.md");
    desk.local.files.set("Manuscript/03.md", enc("Three, edited in Notepad."));
    const scan = await desk.engine.scan();
    check("the scan finds the outside edit", scan.queued, 1);
    check("and the missing file", scan.missing, 1);
    await desk.engine.sync();
    check("the missing file is restored from the cloud", desk.text("Manuscript/02.md"), "Two.");
    ok(
      "as a plain reload, not as an edit that beat a deletion",
      desk.events.some((e) => e.type === "applied" && e.path === "Manuscript/02.md") &&
        !desk.events.some((e) => e.type === "restored"),
    );
    check("and was never deleted there", server.files.get("Manuscript/02.md")?.deleted, false);
    check("the outside edit is pushed", server.text("Manuscript/03.md"), "Three, edited in Notepad.");
  }

  /* ============================================================
     Rule 4: many deletions wait for a yes
     ============================================================ */

  {
    const server = new FakeServer();
    const desk = device(server, "Desk");
    for (let i = 0; i < 40; i++) desk.write(`Manuscript/${String(i).padStart(2, "0")}.md`, `Chapter ${i}.`);
    await desk.engine.sync();

    for (let i = 0; i < 20; i++) desk.remove(`Manuscript/${String(i).padStart(2, "0")}.md`);
    const held = await desk.engine.sync();
    check("twenty of forty deletions are held", held.heldDeletions.length, 20);
    ok("with an event for the host to ask about", desk.events.some((e) => e.type === "deletions-held"));
    check("the cloud still has them", [...server.files.values()].filter((f) => !f.deleted).length, 40);

    desk.engine.confirmDeletions();
    const done = await desk.engine.sync();
    check("after a yes they go", done.pushed, 20);
    check("the cloud has twenty left", [...server.files.values()].filter((f) => !f.deleted).length, 20);

    for (let i = 20; i < 20 + MASS_DELETE_MIN; i++) desk.remove(`Manuscript/${String(i).padStart(2, "0")}.md`);
    const tidy = await desk.engine.sync();
    check(`${MASS_DELETE_MIN} deletions pass without asking`, tidy.heldDeletions.length, 0);
    check("the confirmation did not carry over", tidy.pushed, MASS_DELETE_MIN);
  }

  /* ============================================================
     Plan limits and pages
     ============================================================ */

  {
    const server = new FakeServer();
    server.maxBytes = 10;
    const desk = device(server, "Desk");
    desk.write("Manuscript/01.md", "Short.");
    desk.write("Manuscript/02.md", "This one is far too long.");
    const r = await desk.engine.sync();
    check("a full account reports the limit", r.limit, "bytes");
    ok("with an event", desk.events.some((e) => e.type === "limit"));
    check("the refused file stays waiting on this device", desk.engine.pendingCount(), 1);
    check("and is still here, untouched", desk.text("Manuscript/02.md"), "This one is far too long.");
  }

  {
    const server = new FakeServer();
    server.pageSize = 2;
    const desk = device(server, "Desk");
    for (let i = 1; i <= 5; i++) desk.write(`Manuscript/0${i}.md`, `Chapter ${i}.`);
    await desk.engine.sync();
    const laptop = device(server, "Laptop");
    const before = server.pulls;
    const r = await laptop.engine.sync();
    check("five files arrive across pages", r.pulled, 5);
    check("in three page requests", server.pulls - before, 3);
    check("the cursor ends at the last change", laptop.saved().cursor, 5);
  }

  /* ============================================================
     A burst of "sync now" runs one round plus one
     ============================================================ */

  {
    const server = new FakeServer();
    const desk = device(server, "Desk");
    desk.write("Manuscript/01.md", "x");
    const before = server.pulls;
    const [a, b, c] = await Promise.all([desk.engine.sync(), desk.engine.sync(), desk.engine.sync()]);
    ok("concurrent calls share one result", a === b && b === c);
    check("and run exactly two rounds", server.pulls - before, 2);
  }

  /* ============================================================
     Three devices, one conflict each way, nothing lost
     ============================================================ */

  {
    const server = new FakeServer();
    const [desk, laptop, tablet] = [device(server, "Desk"), device(server, "Laptop"), device(server, "Tablet")];
    desk.write("Manuscript/01.md", "Seed.");
    await desk.engine.sync();
    await laptop.engine.sync();
    await tablet.engine.sync();

    desk.write("Manuscript/01.md", "desk words");
    laptop.write("Manuscript/01.md", "laptop words");
    tablet.write("Manuscript/01.md", "tablet words");
    for (let round = 0; round < 3; round++) {
      await desk.engine.sync();
      await laptop.engine.sync();
      await tablet.engine.sync();
    }
    for (const d of [desk, laptop, tablet]) {
      const texts = new Set([...d.local.files.values()].map((b) => dec(b)));
      for (const words of ["desk words", "laptop words", "tablet words"]) {
        ok(`${d.name} still has "${words}"`, texts.has(words));
      }
      check(`${d.name} has nothing waiting`, d.engine.pendingCount(), 0);
    }
    const names = (d: Device) => [...d.local.files.keys()].sort();
    check("all three devices hold the same files", names(desk), names(tablet));
    check("and the laptop too", names(laptop), names(tablet));
  }

  /* ============================================================
     Plans — the app's copy must match the server's
     ============================================================ */

  {
    const sql = readFileSync("supabase/migrations/20260923000000_cloud_sync.sql", "utf8");
    const rows = new Map<string, { maxProjects: number | null; maxBytes: number; ai: number }>();
    for (const m of sql.matchAll(/\('(free|plus|pro)',\s*(null|\d+),\s*(\d+),\s*(\d+)\)/g)) {
      rows.set(m[1]!, { maxProjects: m[2] === "null" ? null : Number(m[2]), maxBytes: Number(m[3]), ai: Number(m[4]) });
    }
    check("the migration defines all three tiers", [...rows.keys()].sort(), [...TIERS].sort());
    for (const tier of TIERS) {
      const row = rows.get(tier);
      const plan = PLANS[tier];
      check(`${tier}: project cap matches the server`, plan.maxProjects, row?.maxProjects);
      check(`${tier}: storage cap matches the server`, plan.maxBytes, row?.maxBytes);
      check(`${tier}: AI allowance matches the server`, plan.aiMonthlyMicroUsd, row?.ai);
    }
    const inline = sql.match(/max_inline_bytes\(\)[\s\S]*?select (\d+)/);
    ok("the client's inline cap sits under the server's", !!inline && MAX_INLINE_BYTES < Number(inline[1]));

    ok("free has no price", PLANS.free.monthlyUsd === 0 && PLANS.free.yearlyUsd === 0);
    ok("each tier costs more than the last", PLANS.free.monthlyUsd < PLANS.plus.monthlyUsd && PLANS.plus.monthlyUsd < PLANS.pro.monthlyUsd);
    ok("only Pro includes hosted AI", PLANS.free.aiMonthlyMicroUsd === 0 && PLANS.plus.aiMonthlyMicroUsd === 0 && PLANS.pro.aiMonthlyMicroUsd > 0);
    check("yearly Plus is two months free", monthsFreeOnYearly(PLANS.plus), 2);
    check("yearly Pro is two months free", monthsFreeOnYearly(PLANS.pro), 2);
    ok("free never gates the editor", PLANS.free.includes[0]!.includes("nothing held back"));

    check("bytes: small", formatBytes(512), "512 B");
    check("bytes: fractional", formatBytes(1536), "1.5 KB");
    check("bytes: the free cap", formatBytes(PLANS.free.maxBytes), "100 MB");
    check("bytes: the plus cap", formatBytes(PLANS.plus.maxBytes), "10 GB");
    check("bytes: nonsense", formatBytes(-1), "—");

    const account = parseAccount({
      tier: "pro", status: "active", current_period_end: "2026-10-23T00:00:00Z",
      max_projects: null, max_bytes: "21474836480", ai_monthly_microusd: 6000000,
      projects: 3, bytes_used: 1024, ai_used_microusd: 1500000,
    });
    ok("my_account parses, bigint-as-string included", account !== null && account.maxBytes === 21474836480);
    check("AI meter at a quarter", account && aiShareUsed(account), 0.25);
    check("no meter on a plan without hosted AI", aiShareUsed({ aiMonthlyMicroUsd: 0, aiUsedMicroUsd: 0 }), null);
    check("an unknown tier is refused, not rendered", parseAccount({ tier: "gold" }), null);
    ok("free with one synced book can't start another", !canSyncAnotherProject({ maxProjects: 1, projects: 1 }));
    ok("unlimited can", canSyncAnotherProject({ maxProjects: null, projects: 400 }));
  }

  if (failures > 0) {
    console.error(`\ntest-cloud: ${failures} of ${checks} checks failed`);
    process.exit(1);
  }
  console.log(`test-cloud: ${checks} checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
