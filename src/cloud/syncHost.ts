/* ============================================================
   The sync host — the engine, wired into the running app

   syncEngine.ts decides; this file only connects. It hears every write
   through a wrapper on storage(), keeps the engine's state on disk
   beside the book, runs rounds when there is a reason to, puts pulled
   files in front of the writer, and tells the status line.

   It never creates the Supabase client. Whoever owns sign-in hands it
   over through provideCloudAccess() — the client carries the session,
   and on desktop the session belongs in the keychain, which only the
   sign-in module knows how to arrange. Until then the host stays off
   and the app is exactly what it was.

   Typechecked, not unit tested: it needs projects.ts, which reads
   localStorage at import. Every decision in it is a pure function
   tested in test-synchost.ts (syncSchedule, syncStatus, bindingMap,
   localFiles, syncingStorage); what is left is plumbing.
   ============================================================ */

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { rawStorage, setStorageDecorator, storage, type VaultStorage } from "../storage";
import { store } from "../state/vaultStore";
import { projectStore } from "../state/projects";
import { asSyncReload, isSyncReload } from "../state/reloadReason";
import { cloudEnabled } from "./config";
import {
  LOCAL_ONLY_DIR,
  ProjectSync,
  conflictCopyPath,
  emptySyncState,
  parseSyncState,
  type SyncEvent,
  type SyncState,
} from "./syncEngine";
import { SupabaseProjectFiles } from "./supabaseRemote";
import { describeCloudError } from "./wire";
import { syncingStorage } from "./syncingStorage";
import { localFilesFor, type EditorView } from "./localFiles";
import {
  POLL_MS,
  RELOAD_IDLE_MS,
  bindAction,
  canReloadNow,
  needsRefresh,
  staleNotePath,
  wantedTarget,
  whenToSync,
  type BindTarget,
  type SyncTrigger,
} from "./syncSchedule";
import { dispatchStatus } from "./syncStatus";
import { bindingFor, type PlainKV } from "./bindingMap";

/** Device-only, so it never travels (isSyncable drops LOCAL_ONLY_DIR). */
export const SYNC_STATE_PATH = `${LOCAL_ONLY_DIR}sync.json`;

/** How the host reaches the cloud. Supplied by the sign-in module. */
export interface CloudAccess {
  client(): Promise<SupabaseClient | null>;
  /** Fires when someone signs in or out. Without it the host listens
      to supabase-js directly. */
  onAuthChange?(fn: () => void): () => void;
}

interface Bound {
  target: BindTarget;
  client: SupabaseClient;
  userId: string;
  engine: ProjectSync;
  channel: RealtimeChannel | null;
  /** Filled by the engine during a round, drained after it. */
  events: SyncEvent[];
}

let installed = false;
let access: CloudAccess | null = null;
let authUnsub: (() => void) | null = null;
let watchedClient: SupabaseClient | null = null;
let bound: Bound | null = null;
/** What the host last bound OR tried to bind — see bindAction. */
let attempted: BindTarget | null = null;
let queue: Promise<void> = Promise.resolve();
let lastRunAt: number | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;
let reloadWanted = false;
let reloadRetry: ReturnType<typeof setTimeout> | null = null;
let lastEditAt: number | null = null;
/** Notes a pull rewrote on disk that the editor still holds the old
    text of — see staleNotePath. Emptied by every vault swap. */
const staleNotes = new Set<string>();
const bindingListeners = new Set<() => void>();

function kv(): PlainKV | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/* ---------------- wiring ---------------- */

/** Hand the host its way to the cloud. Order-free with installSyncHost:
    whichever comes second starts the binding. */
export function provideCloudAccess(a: CloudAccess): void {
  authUnsub?.();
  access = a;
  authUnsub = a.onAuthChange ? a.onAuthChange(() => void authChanged()) : null;
  if (installed) void reconcile(true);
}

export function cloudAccess(): CloudAccess | null {
  return access;
}

/** Idempotent. Called from the status line's first render, so App.tsx
    needs no effect of its own. */
export function installSyncHost(): void {
  if (installed) return;
  installed = true;
  // A build with no cloud configured registers nothing at all.
  if (!cloudEnabled()) {
    dispatchStatus({ type: "off" });
    return;
  }

  setStorageDecorator((raw: VaultStorage) => syncingStorage(raw, () => bound?.target.root ?? null, onLocalChange));

  window.addEventListener("focus", () => schedule("focus"));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) schedule("focus");
  });
  window.addEventListener("online", () => {
    dispatchStatus({ type: "online" });
    schedule("online");
  });
  window.addEventListener("offline", () => dispatchStatus({ type: "offline" }));
  window.setInterval(() => schedule("poll"), POLL_MS);

  // Both orders of "a book is open" end here: boot opens the folder of
  // a project already active (no registry emit), a switch opens the
  // folder and then sets it active (no second vault swap).
  projectStore.subscribe(() => void reconcile(false));
  store.onVaultReplaced(() => {
    if (!isSyncReload()) void reconcile(false);
  });

  store.subscribe(() => {
    if (store.dirtyCount() > 0) lastEditAt = Date.now();
  });
  store.onAfterSave(() => {
    if (reloadWanted) void refreshVault();
  });
  store.onVaultReplaced(() => staleNotes.clear());
  store.onBeforeSave((note) => keepPulledText(note.id, note.path));

  void reconcile(false);
}

/* ---------------- binding ---------------- */

/** Serialised: two binds racing would build two engines over one outbox. */
function reconcile(force: boolean): Promise<void> {
  queue = queue.then(() => reconcileNow(force)).catch(() => {});
  return queue;
}

async function reconcileNow(force: boolean): Promise<void> {
  if (force) attempted = null;
  const active = projectStore.active();
  const local = kv();
  const binding = active && local ? bindingFor(local, active.id) : null;
  const want = wantedTarget(active, store.vaultRoot(), binding);
  const action = bindAction(want, attempted);
  if (action === "stay") return;
  teardown();
  attempted = want;
  if (action === "unbind" || !want || !binding) {
    dispatchStatus({ type: "off" });
    return;
  }
  await bindTo(want, binding.deviceName);
}

async function bindTo(want: BindTarget, deviceName: string): Promise<void> {
  const a = access;
  if (!a) {
    // Bound on this device, but nothing has supplied the cloud yet.
    dispatchStatus({ type: "off" });
    return;
  }
  try {
    const client = await a.client();
    if (!client) {
      dispatchStatus({ type: "off" });
      return;
    }
    watchAuth(client);
    const { data } = await client.auth.getSession();
    if (attempted !== want) return;
    if (!data.session) {
      dispatchStatus({ type: "signed-out" });
      return;
    }
    const raw = rawStorage();
    const state = await loadState(raw, want.root);
    const events: SyncEvent[] = [];
    const engine = new ProjectSync({
      remote: new SupabaseProjectFiles(client, data.session.user.id, want.cloudProjectId, deviceName),
      // The RAW adapter: a pulled file written through the reporting
      // wrapper would queue itself to be pushed straight back.
      local: localFilesFor(raw, want.root, editorView(want.root)),
      state,
      saveState: stateWriter(raw, want.root),
      onEvent: (e) => {
        events.push(e);
        // At once, not after the round: an autosave can land between
        // this write and the round's end.
        const stale = staleNotePath(e);
        if (stale) staleNotes.add(stale);
      },
    });
    if (attempted !== want) return;
    bound = { target: want, client, userId: data.session.user.id, engine, channel: null, events };
    dispatchStatus({ type: "bound", pending: engine.pendingCount() });
    // Whatever changed while Novella wasn't watching — or before this
    // module was installed — is found by content here.
    await engine.scan();
    if (bound?.engine !== engine) return;
    dispatchStatus({ type: "pending", count: engine.pendingCount() });
    bound.channel = subscribeRealtime(client, want.cloudProjectId);
    schedule("bind");
  } catch (err) {
    if (attempted === want) dispatchStatus({ type: "failed", problem: describeCloudError(err) });
  }
}

function teardown(): void {
  if (debounce) clearTimeout(debounce);
  debounce = null;
  const b = bound;
  bound = null;
  if (b?.channel) void b.client.removeChannel(b.channel);
}

/** A sign-in or sign-out. A bound host whose session is still the same
    user stays put — supabase-js re-announces SIGNED_IN on tab focus,
    and a rebind rescans every byte of the book. */
async function authChanged(): Promise<void> {
  const b = bound;
  if (b) {
    try {
      const { data } = await b.client.auth.getSession();
      if (data.session?.user.id === b.userId) return;
    } catch {
      // unreadable session: fall through and let the rebind decide
    }
  }
  await reconcile(true);
}

function watchAuth(client: SupabaseClient): void {
  if (access?.onAuthChange || watchedClient === client) return;
  watchedClient = client;
  client.auth.onAuthStateChange((event) => {
    if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
    // supabase-js holds a lock while these callbacks run; an auth call
    // made synchronously inside one waits on itself.
    setTimeout(() => void authChanged(), 0);
  });
}

/** Realtime is a nudge, never the transport: push_file bumps the
    project row's seq, the UPDATE arrives here, a round pulls. The poll,
    focus and online triggers all stay, so a dropped socket — or a
    Supabase project without migration 20260924000000 applied — costs
    at most one POLL_MS. Our own pushes nudge us too; that round finds
    only rows it already has and pulls nothing. */
function subscribeRealtime(client: SupabaseClient, cloudProjectId: string): RealtimeChannel {
  return client
    .channel(`project:${cloudProjectId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "projects", filter: `id=eq.${cloudProjectId}` },
      () => schedule("realtime"),
    )
    .subscribe();
}

/* ---------------- the local side ---------------- */

function onLocalChange(kind: "write" | "remove", path: string): void {
  const b = bound;
  if (!b) return;
  if (kind === "remove") b.engine.markRemoved(path);
  else b.engine.markChanged(path);
  dispatchStatus({ type: "pending", count: b.engine.pendingCount() });
  schedule("change");
}

function editorView(root: string): EditorView {
  return {
    noteIdAt: (path) => (store.vaultRoot() === root ? store.vault.all().find((n) => n.path === path)?.id : undefined),
    isDirty: (id) => store.isDirty(id),
    flush: () => store.saveAll(),
  };
}

/** Before the editor saves a note a pull rewrote underneath it: put the
    pulled text beside it as a conflict copy, then let the save write the
    writer's version in place. Rule 1 of the engine, applied at the one
    moment the engine cannot see — the pulled text is never silently
    overwritten, and the writer gets the question in the Conflicts panel.

    Browser only. On desktop the pull went through writeBytes, which
    leaves the don't-clobber baseline behind, so guardWrite has already
    stopped this save and asked — and hooks don't run for a blocked save. */
async function keepPulledText(noteId: string, path: string): Promise<void> {
  const b = bound;
  if (!b || !staleNotes.has(path) || store.vaultRoot() !== b.target.root) return;
  staleNotes.delete(path);
  const raw = rawStorage();
  if (raw.kind === "tauri") return;
  const theirs = await localFilesFor(raw, b.target.root, null).read(path);
  if (!theirs || new TextDecoder().decode(theirs) === store.fileContents(noteId)) return;
  const taken = [...store.vault.all().map((n) => n.path), ...store.conflictCopies().map((f) => f.file.path)];
  const copy = conflictCopyPath(path, "Cloud", new Date(), taken);
  // Through the reporting wrapper, so the copy syncs like any file the
  // writer made; the next reload flags it for the Conflicts panel.
  await localFilesFor(storage(), b.target.root, null).write(copy, theirs);
}

async function loadState(raw: VaultStorage, root: string): Promise<SyncState> {
  try {
    const bytes = await raw.readBytes(root, SYNC_STATE_PATH);
    if (!bytes) return emptySyncState();
    // parseSyncState turns junk into a fresh state: one full re-download,
    // never a wrong base version.
    return parseSyncState(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return emptySyncState();
  }
}

/** The engine saves its state after every markChanged. One write in
    flight at a time, always of the newest state, so a burst of saves is
    two writes and never lands out of order. A failed write is dropped:
    the next bind's scan re-finds any change by content. */
function stateWriter(raw: VaultStorage, root: string): (s: SyncState) => Promise<void> {
  let latest: string | null = null;
  let loop: Promise<void> | null = null;
  const enc = new TextEncoder();
  return (s) => {
    latest = JSON.stringify(s);
    loop ??= (async () => {
      try {
        while (latest !== null) {
          const next = latest;
          latest = null;
          try {
            await raw.writeBytes(root, SYNC_STATE_PATH, enc.encode(next));
          } catch {
            /* see above */
          }
        }
      } finally {
        loop = null;
      }
    })();
    return loop;
  };
}

/* ---------------- rounds ---------------- */

function schedule(trigger: SyncTrigger): void {
  if (!bound) return;
  const now = Date.now();
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const d = whenToSync({ trigger, now, online, lastRunAt });
  if (d.debounceAt !== null) {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      schedule("debounce");
    }, d.debounceAt - now);
  }
  if (d.run) void run();
}

async function run(): Promise<void> {
  const b = bound;
  if (!b) return;
  dispatchStatus({ type: "started" });
  try {
    // Concurrent calls share the engine's round in flight; the first
    // caller back drains the events, the rest find none.
    const result = await b.engine.sync();
    if (bound !== b) return;
    lastRunAt = Date.now();
    const events = b.events.splice(0);
    dispatchStatus({ type: "finished", result, pending: b.engine.pendingCount(), at: lastRunAt });
    // Keyed off events, not result.pulled: pulled also counts rows that
    // settled with the same bytes already here, and reloading for those
    // would swap the vault under the writer for nothing.
    if (needsRefresh(events)) await refreshVault();
  } catch (err) {
    if (bound === b) dispatchStatus({ type: "failed", problem: describeCloudError(err) });
  }
}

/** Put what a round wrote in front of the writer.

    The sequence, and why each step:
    1. Only if the vault on screen is still the bound book.
    2. saveAll. Any path the round pulled that was dirty was already
       flushed by the engine (take → isDirty → flush) BEFORE it chose
       between apply and conflict copy, so the writer's words are on
       disk and, if they differed, the cloud's version sits beside them
       as a conflict copy. This save is the net for notes it didn't
       touch: ingest clears the dirty set, and unsaved words would go
       with it. A note the round rewrote and the writer edited AFTER
       the engine looked goes through keepPulledText first, so this
       save cannot bury the pulled version either.
    3. Still dirty (a note held by a pending disk-conflict dialog), or
       an edit within RELOAD_IDLE_MS: wait. The next save, or a timer,
       comes back here.
    4. reloadFromStorage, marked as a sync reload so the "When Novella
       opens" agents don't take it for a launch. ingest rebuilds every
       onVaultReplaced cache — boards, plot, trash, history, agents,
       music — so a pulled .novella file is what the next local write
       builds on, not a stale copy that would overwrite it. It also
       rebuilds the flagged list, so a conflict copy the engine wrote
       lands in conflictCopies() and ConflictHost shows it.
    5. ingest resets the open note to the first chapter; put the writer
       back where they were. */
async function refreshVault(): Promise<void> {
  const b = bound;
  if (!b || store.vaultRoot() !== b.target.root) return;
  await store.saveAll();
  if (!canReloadNow(store.dirtyCount(), lastEditAt, Date.now())) {
    reloadWanted = true;
    if (!reloadRetry) {
      reloadRetry = setTimeout(() => {
        reloadRetry = null;
        if (reloadWanted) void refreshVault();
      }, RELOAD_IDLE_MS);
    }
    return;
  }
  reloadWanted = false;
  const prev = store.activeIdOrUndefined();
  await asSyncReload(() => store.reloadFromStorage());
  if (prev && store.vault.get(prev)) store.open(prev);
}

/* ---------------- for the UI ---------------- */

export function syncNow(): void {
  schedule("bind");
}

/** After the writer's yes to a held mass delete (engine rule 4). */
export function confirmHeldDeletions(): void {
  bound?.engine.confirmDeletions();
  schedule("bind");
}

export function currentlyBound(): { projectId: string; cloudProjectId: string } | null {
  return bound ? { projectId: bound.target.projectId, cloudProjectId: bound.target.cloudProjectId } : null;
}

/** The binding map changed (projectBinding.ts). The target carries the
    cloud id, so binding, unbinding or re-pointing the active book all
    read as a different target; anything else stays put. */
export function bindingsChanged(): Promise<void> {
  for (const l of bindingListeners) l();
  return reconcile(false);
}

export function subscribeBindings(fn: () => void): () => void {
  bindingListeners.add(fn);
  return () => {
    bindingListeners.delete(fn);
  };
}
