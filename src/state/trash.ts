import { useSyncExternalStore } from "react";
import { storage } from "../storage";
import { store } from "./vaultStore";
import { boardStore } from "./boards";
import { parseNote, serializeNote, type Note } from "../core/vault";

/* ============================================================
   Trash — archive, delete, and a retention window

   A writer deletes a scene at 2am and wants it back at 10am. That
   is the whole feature. So nothing here destroys a file except two
   events the writer can point at: the retention window running out,
   or them emptying the trash on purpose.

   Layout inside the vault, next to history and cover art:

     .novella/trash/index.json        the manifest + the chosen window
     .novella/trash/items/<id>.md     the note, byte for byte

   The manifest is the source of truth for what is IN the trash. The
   payload is a plain Markdown file with its frontmatter intact, so a
   writer who never opens this panel can still find their scene with a
   file browser — and restore is just "parse it and put it back".

   Payloads are written with writeBytes, not write. On disk that is the
   same UTF-8 file either way, but only writeBytes/readBytes round-trip
   on all three adapters: the IndexedDB and memory adapters store text
   written via write() in a slot readBytes never looks at.

   Expiry is evaluated lazily — when a vault opens and when the panel
   opens. No timers: a background interval that deletes manuscripts is
   a bad thing to have running in an app people leave open for days,
   and a writer who never opens the app never loses anything to it.

   Everything that decides WHAT has expired is pure and takes `now` as
   an argument. The clock is read once, at the edge, in the store.
   ============================================================ */

/** 7 days, 30 days, or "keep until I empty it". */
export type RetentionChoice = 7 | 30 | "keep";

export const RETENTION_CHOICES: RetentionChoice[] = [7, 30, "keep"];

/** 30 days, not 7: the window only matters when someone comes back for
    something, and "I deleted that last month" is the common case. */
export const DEFAULT_RETENTION: RetentionChoice = 30;

/** Archive and delete land in the same place and expire the same way.
    The word is kept because it is what the writer chose, and "Archived"
    reading back as "Deleted" would feel like the app lost the plot. */
export type TrashReason = "deleted" | "archived";

export interface TrashEntry {
  /** Unique per trash event, and the name of the payload file. */
  entryId: string;
  /** The note's vault id, so restore can spot a live note wearing it. */
  noteId: string;
  title: string;
  /** Where it came from. Restore aims here first. */
  path: string;
  type: string;
  /** Epoch ms. The clock the retention window counts from. */
  trashedAt: number;
  reason: TrashReason;
  words: number;
  /** Boards the note was pinned to, so restore puts the cards back. */
  boards: string[];
  /** Payload held inline, used only when there is no folder to write to
      (the bundled demo world). A real project keeps it in its own file. */
  raw?: string;
}

interface TrashIndex {
  version: 1;
  retention: RetentionChoice;
  entries: TrashEntry[];
}

export type TrashOutcome<T> = { ok: true; value: T } | { ok: false; error: string };

const DIR = ".novella/trash";
const INDEX_PATH = `${DIR}/index.json`;
const DAY = 86_400_000;
const HOUR = 3_600_000;

const itemPath = (entryId: string): string => `${DIR}/items/${entryId}.md`;

/* ============================================================
   Pure retention maths

   No Date.now() below this line and above the store — `now` is always
   passed in. That is what makes "what expires tomorrow?" answerable in
   a test instead of only in an hour's time.
   ============================================================ */

/** Read a retention value that came off disk, which could be anything. */
export function normalizeRetention(value: unknown): RetentionChoice {
  if (value === 7 || value === 30) return value;
  if (value === "keep") return "keep";
  return DEFAULT_RETENTION;
}

/** When this entry is due to be destroyed, or null if never. */
export function expiryOf(trashedAt: number, retention: RetentionChoice): number | null {
  return retention === "keep" ? null : trashedAt + retention * DAY;
}

/** Expiry is inclusive of the moment itself: at exactly the boundary the
    entry is done. Anything else leaves a millisecond of ambiguity that
    only ever shows up as a flickering "0 days left". */
export function isExpired(
  entry: { trashedAt: number },
  retention: RetentionChoice,
  now: number,
): boolean {
  const due = expiryOf(entry.trashedAt, retention);
  return due !== null && now >= due;
}

/** Split a trash list into what must go and what stays. The kept list
    holds its input order — the caller decides how to sort for display. */
export function partitionExpired<T extends { trashedAt: number }>(
  entries: T[],
  retention: RetentionChoice,
  now: number,
): { expired: T[]; kept: T[] } {
  const expired: T[] = [];
  const kept: T[] = [];
  for (const entry of entries) {
    if (isExpired(entry, retention, now)) expired.push(entry);
    else kept.push(entry);
  }
  return { expired, kept };
}

/** How long this entry has left, in a writer's words rather than a
    countdown.

    Rounds DOWN, deliberately. This is a deadline attached to something
    being destroyed, and the safe direction to be wrong in is early: "2
    days left" with two days and twenty hours on the clock costs nothing,
    while "3 days left" with two days and one hour costs a chapter. */
export function remainingLabel(
  entry: { trashedAt: number },
  retention: RetentionChoice,
  now: number,
): string {
  const due = expiryOf(entry.trashedAt, retention);
  if (due === null) return "Kept until you empty the trash";
  const left = due - now;
  if (left <= 0) return "Due to be removed";
  if (left < HOUR) return "Less than an hour left";
  if (left < DAY) {
    const hours = Math.floor(left / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} left`;
  }
  const days = Math.floor(left / DAY);
  return `${days} day${days === 1 ? "" : "s"} left`;
}

/** The retention window as a setting label. */
export function retentionLabel(retention: RetentionChoice): string {
  return retention === "keep" ? "Keep until I empty it" : `${retention} days`;
}

/** The same window as a promise made in a toast, mid-sentence. */
export function retentionPromise(retention: RetentionChoice): string {
  return retention === "keep"
    ? "kept in the trash until you empty it"
    : `kept in the trash for ${retention} days`;
}

/** Newest first — the thing just deleted is the thing being looked for. */
export function sortNewestFirst<T extends { trashedAt: number }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => b.trashedAt - a.trashedAt);
}

/** A path nothing else has claimed.

    Restore aims at the original path, but a month is long enough for a
    new note to have taken it. Refusing to restore would be the wrong
    answer — the writer wants their words back, not a lecture — so the
    returned note lands beside the occupant instead of over it. */
export function uniquePath(desired: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(desired)) return desired;

  const dot = desired.lastIndexOf(".");
  const slash = desired.lastIndexOf("/");
  const hasExt = dot > slash;
  const stem = hasExt ? desired.slice(0, dot) : desired;
  const ext = hasExt ? desired.slice(dot) : "";

  const first = `${stem} (restored)${ext}`;
  if (!used.has(first)) return first;
  for (let i = 2; ; i++) {
    const candidate = `${stem} (restored ${i})${ext}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** An id nothing else has claimed. The vault indexes notes BY id, so
    restoring one whose id is already live would evict the live note from
    the index — losing the note that wasn't deleted. */
export function uniqueId(desired: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(desired)) return desired;
  for (let i = 2; ; i++) {
    const candidate = `${desired}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
}

function safeName(id: string): string {
  return id.replace(/[^\w.-]+/g, "_").slice(0, 80) || "note";
}

/** Names the payload file. Deterministic in its inputs so a test can
    predict it; the timestamp makes collisions need the same note twice
    in the same millisecond, and `taken` covers even that. */
export function entryIdFor(noteId: string, trashedAt: number, taken: Iterable<string>): string {
  return uniqueId(`${safeName(noteId)}-${trashedAt}`, taken);
}

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Rebuild a manifest from whatever JSON.parse handed back. A corrupt or
    half-written index must degrade to "the trash looks empty", never to a
    crash on the path that also deletes files. */
export function coerceIndex(value: unknown): TrashIndex {
  const raw = (value ?? {}) as Partial<TrashIndex>;
  const list = Array.isArray(raw.entries) ? raw.entries : [];
  const entries: TrashEntry[] = [];
  for (const item of list) {
    const e = item as Partial<TrashEntry>;
    if (typeof e.entryId !== "string" || typeof e.path !== "string") continue;
    if (typeof e.trashedAt !== "number" || !Number.isFinite(e.trashedAt)) continue;
    entries.push({
      entryId: e.entryId,
      noteId: typeof e.noteId === "string" ? e.noteId : e.entryId,
      title: typeof e.title === "string" ? e.title : e.path,
      path: e.path,
      type: typeof e.type === "string" ? e.type : "note",
      trashedAt: e.trashedAt,
      reason: e.reason === "archived" ? "archived" : "deleted",
      words: typeof e.words === "number" ? e.words : 0,
      boards: Array.isArray(e.boards) ? e.boards.filter((b) => typeof b === "string") : [],
      ...(typeof e.raw === "string" ? { raw: e.raw } : {}),
    });
  }
  return { version: 1, retention: normalizeRetention(raw.retention), entries };
}

/* ============================================================
   The store — the only place that reads a clock or touches disk
   ============================================================ */

const listeners = new Set<() => void>();
let version = 0;
let cached: TrashIndex | null = null;
let loaded = false;
let loadPromise: Promise<void> | null = null;

function emit(): void {
  version++;
  for (const l of listeners) l();
}

function blankIndex(): TrashIndex {
  return { version: 1, retention: DEFAULT_RETENTION, entries: [] };
}

function lsKey(root: string | null): string {
  return `novella.trash.${root ?? "memory"}`;
}

async function load(): Promise<void> {
  const root = store.vaultRoot();
  let next = blankIndex();

  if (root) {
    try {
      const bytes = await storage().readBytes(root, INDEX_PATH);
      if (bytes) next = coerceIndex(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
      // No manifest yet, or an unreadable one. Either way the payload
      // files stay on disk untouched — an empty manifest loses the
      // listing, never the words.
    }
  } else {
    try {
      const rawText = localStorage.getItem(lsKey(root));
      if (rawText) next = coerceIndex(JSON.parse(rawText));
    } catch {
      /* same reasoning */
    }
  }

  cached = next;
  loaded = true;
  emit();
}

function ensureLoaded(): Promise<void> {
  if (loaded) return Promise.resolve();
  loadPromise ??= load().finally(() => {
    loadPromise = null;
  });
  return loadPromise;
}

/** Write the manifest.

    On a real project this is allowed to throw: a caller about to take a
    note out of the vault has to know whether the record of it survived.

    With no folder open — the bundled demo world — it cannot fail, and
    must not. The vault there is memory-only too, so the in-memory
    manifest is already exactly as durable as the note it describes;
    localStorage is a bonus that lets it outlive a reload where it can. */
async function persist(): Promise<void> {
  const root = store.vaultRoot();
  const json = JSON.stringify(cached ?? blankIndex());
  if (root) {
    await storage().writeBytes(root, INDEX_PATH, new TextEncoder().encode(json));
    return;
  }
  try {
    localStorage.setItem(lsKey(root), json);
  } catch {
    /* private browsing, quota, or no localStorage at all */
  }
}

async function writePayload(entry: TrashEntry, raw: string): Promise<void> {
  const root = store.vaultRoot();
  if (!root) {
    entry.raw = raw;
    return;
  }
  await storage().writeBytes(root, itemPath(entry.entryId), new TextEncoder().encode(raw));
}

async function readPayload(entry: TrashEntry): Promise<string | null> {
  if (typeof entry.raw === "string") return entry.raw;
  const root = store.vaultRoot();
  if (!root) return null;
  try {
    const bytes = await storage().readBytes(root, itemPath(entry.entryId));
    return bytes ? new TextDecoder().decode(bytes) : null;
  } catch {
    return null;
  }
}

async function dropPayload(entry: TrashEntry): Promise<void> {
  const root = store.vaultRoot();
  if (!root) return;
  try {
    await storage().remove(root, itemPath(entry.entryId));
  } catch {
    // A payload that refuses to be removed is a stale file, not lost
    // work. The manifest is what the panel believes.
  }
}

/** Loose files left directly in .novella/trash by earlier versions of the
    app, which copied deleted notes there without a manifest. They are
    never auto-expired — nothing knows when they were made — but "empty
    the trash" should mean the folder is empty. */
async function sweepLoose(): Promise<void> {
  const root = store.vaultRoot();
  if (!root) return;
  try {
    for (const file of await storage().listFiles(root)) {
      if (!file.path.startsWith(`${DIR}/`)) continue;
      if (file.path === INDEX_PATH) continue;
      if (file.path.startsWith(`${DIR}/items/`)) continue;
      await storage().remove(root, file.path);
    }
  } catch {
    /* best effort — the indexed entries are already gone by here */
  }
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export const trashStore = {
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  getVersion(): number {
    return version;
  },

  /** What the panel lists, newest first. Triggers a load on first read. */
  entries(): TrashEntry[] {
    if (!loaded) {
      void ensureLoaded();
      return [];
    }
    return sortNewestFirst(cached?.entries ?? []);
  },

  retention(): RetentionChoice {
    return cached?.retention ?? DEFAULT_RETENTION;
  },

  isLoaded(): boolean {
    return loaded;
  },

  /** Change the window. Shortening it can expire things immediately, so
      the sweep runs straight after — the writer sees the consequence of
      the choice they just made, rather than at some later launch. */
  async setRetention(retention: RetentionChoice): Promise<void> {
    await ensureLoaded();
    const index = cached ?? blankIndex();
    if (index.retention === retention) return;
    cached = { ...index, retention };
    emit();
    try {
      await persist();
    } catch {
      /* the setting is a preference; failing to store it is survivable */
    }
    await trashStore.sweep();
  },

  /** Move a note into the trash.

      Order is the whole safety argument. The copy is written and the
      manifest committed BEFORE the note leaves the vault, so a storage
      failure aborts with the note still in place. Nothing is ever both
      gone from the vault and absent from the trash. */
  async moveToTrash(noteId: string, reason: TrashReason): Promise<TrashOutcome<TrashEntry>> {
    await ensureLoaded();
    const note = store.vault.get(noteId);
    if (!note) return { ok: false, error: "That note is no longer here." };

    const index = cached ?? blankIndex();
    const trashedAt = Date.now();
    const entry: TrashEntry = {
      entryId: entryIdFor(note.id, trashedAt, index.entries.map((e) => e.entryId)),
      noteId: note.id,
      title: note.title,
      path: note.path,
      type: String(note.type),
      trashedAt,
      reason,
      words: countWords(note.body),
      boards: boardStore
        .all()
        .filter((b) => b.noteIds.includes(noteId))
        .map((b) => b.id),
    };

    const raw = serializeNote(note);
    try {
      await writePayload(entry, raw);
    } catch (err) {
      return { ok: false, error: `Could not put that in the trash, so it was left alone. ${message(err)}` };
    }

    const before = cached;
    cached = { ...index, entries: [...index.entries, entry] };
    try {
      await persist();
    } catch (err) {
      cached = before;
      void dropPayload(entry);
      return { ok: false, error: `Could not put that in the trash, so it was left alone. ${message(err)}` };
    }

    // Durable. Only now does the note leave the vault. deleteNote also
    // keeps its own loose copy under .novella/trash — redundant with
    // ours, and harmless: one more place the words survive.
    await store.deleteNote(noteId);
    for (const boardId of entry.boards) boardStore.removeNote(boardId, noteId);
    emit();
    return { ok: true, value: entry };
  },

  /** Put a note back where it came from.

      The entry is only dropped once the note has actually reached disk.
      A restore that half-works leaves the copy in the trash, so the
      writer can simply try again. */
  async restore(entryId: string): Promise<TrashOutcome<string>> {
    await ensureLoaded();
    const index = cached ?? blankIndex();
    const entry = index.entries.find((e) => e.entryId === entryId);
    if (!entry) return { ok: false, error: "That item is no longer in the trash." };

    const raw = await readPayload(entry);
    if (raw === null) {
      return { ok: false, error: `The copy of “${entry.title}” could not be read.` };
    }

    // Collisions are settled against the live index rather than the
    // filesystem: it is the one view every adapter agrees on, and it is
    // also what would actually be clobbered.
    const live = store.vault.all();
    const path = uniquePath(entry.path, live.map((n) => n.path));

    let note: Note;
    try {
      note = parseNote(path, raw);
    } catch (err) {
      return { ok: false, error: `That copy could not be read back. ${message(err)}` };
    }
    const id = uniqueId(note.id, live.map((n) => n.id));
    if (id !== note.id) {
      note.id = id;
      note.data.id = id;
    }

    const restored = store.createNoteAtPath(path, serializeNote(note));
    await store.saveAll();
    // saveAll swallows its errors into store.error(); a note still marked
    // dirty is the honest signal that the write did not land.
    if (store.isDirty(restored.id)) {
      return {
        ok: false,
        error: store.error() ?? "Could not write that note back. It is still in the trash.",
      };
    }

    for (const boardId of entry.boards) boardStore.addNote(boardId, restored.id);

    cached = { ...index, entries: index.entries.filter((e) => e.entryId !== entryId) };
    void dropPayload(entry);
    try {
      await persist();
    } catch {
      /* the note is back; a stale manifest line is cosmetic */
    }
    emit();
    return { ok: true, value: restored.id };
  },

  /** Destroy one item for good. */
  async purge(entryId: string): Promise<void> {
    await ensureLoaded();
    const index = cached ?? blankIndex();
    const entry = index.entries.find((e) => e.entryId === entryId);
    if (!entry) return;
    cached = { ...index, entries: index.entries.filter((e) => e.entryId !== entryId) };
    emit();
    await dropPayload(entry);
    try {
      await persist();
    } catch {
      /* the payload is gone; the manifest catches up next write */
    }
  },

  /** Empty the trash, loose legacy copies included. The only path in this
      module that destroys something the retention window hasn't. */
  async empty(): Promise<void> {
    await ensureLoaded();
    const index = cached ?? blankIndex();
    cached = { ...index, entries: [] };
    emit();
    for (const entry of index.entries) await dropPayload(entry);
    try {
      await persist();
    } catch {
      /* payloads are already gone */
    }
    await sweepLoose();
  },

  /** Expire whatever the window says is done, and report how many went.
      Called when a vault opens and when the panel opens — never on a
      timer. `now` is injectable so the sweep itself is testable. */
  async sweep(now: number = Date.now()): Promise<number> {
    await ensureLoaded();
    const index = cached ?? blankIndex();
    const { expired, kept } = partitionExpired(index.entries, index.retention, now);
    if (expired.length === 0) return 0;

    cached = { ...index, entries: kept };
    emit();
    for (const entry of expired) await dropPayload(entry);
    try {
      await persist();
    } catch {
      /* the files are gone; the manifest catches up next write */
    }
    return expired.length;
  },

  /** Forget this project's trash so another project's never shows in it. */
  reset(): void {
    cached = null;
    loaded = false;
    loadPromise = null;
    emit();
  },
};

/* Opening a project is the app's real "start": the vault root it needs
   is set by then. Sweeping here covers every launch and every switch,
   with no timer anywhere. */
store.onVaultReplaced(() => {
  trashStore.reset();
  void trashStore.sweep();
});

export function useTrash(): { entries: TrashEntry[]; retention: RetentionChoice } {
  useSyncExternalStore(trashStore.subscribe, trashStore.getVersion, trashStore.getVersion);
  return { entries: trashStore.entries(), retention: trashStore.retention() };
}

/* ============================================================
   Whether the panel is showing

   This lives with the feature rather than in the component so that a
   delete which REFUSES — storage full, folder gone — has somewhere to
   say so. deleteNote.ts is state, not UI; it can open the panel and
   hand it the message without reaching up a layer.
   ============================================================ */

let panelOpen = false;
let panelError: string | null = null;
let panelVersion = 0;
const panelListeners = new Set<() => void>();

function emitPanel(): void {
  panelVersion++;
  for (const l of panelListeners) l();
}

/** Show the trash. An optional message is shown above the list — used
    when something went wrong and the writer needs to see the state of
    their note rather than a toast that vanishes in eight seconds. */
export function openTrashPanel(error?: string | null): void {
  panelOpen = true;
  panelError = error ?? null;
  emitPanel();
}

export function closeTrashPanel(): void {
  panelOpen = false;
  panelError = null;
  emitPanel();
}

export function subscribeTrashPanel(fn: () => void): () => void {
  panelListeners.add(fn);
  return () => {
    panelListeners.delete(fn);
  };
}

export function trashPanelVersion(): number {
  return panelVersion;
}

export function isTrashPanelOpen(): boolean {
  return panelOpen;
}

export function trashPanelError(): string | null {
  return panelError;
}

export function useTrashPanel(): { open: boolean; error: string | null } {
  useSyncExternalStore(subscribeTrashPanel, trashPanelVersion, trashPanelVersion);
  return { open: panelOpen, error: panelError };
}
