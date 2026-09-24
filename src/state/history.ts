import { storage } from "../storage";
import { store } from "./vaultStore";
import type { Note } from "../core/vault";

/* ============================================================
   Revision history

   Autosave protects you from losing work. This protects you from
   REGRETTING it — which is a different failure and the one that
   actually bites when a model rewrites a scene you liked.

   Snapshots are taken at decision points, not on a timer: before
   the assistant touches your prose, and when work is saved. A
   keystroke-level history would be enormous and useless; what a
   writer wants back is "the version before the robot got at it".

   History lives in the vault at .novella/history/, so it travels
   with the project the same way cover art does. In the browser
   build, where there is no folder, it falls back to local storage
   and says so.
   ============================================================ */

/* Revision, MAX_REVISIONS and thin() live in core/historyThin.ts so the
   cloud sync engine can merge two devices' history files by the same
   rule, without importing this module's store. Re-exported unchanged. */
export { MAX_REVISIONS, thin, type Revision } from "../core/historyThin";
import { thin, type Revision } from "../core/historyThin";

interface NoteHistory {
  id: string;
  title: string;
  revisions: Revision[];
}

const cache = new Map<string, NoteHistory>();

function safeName(id: string): string {
  return id.replace(/[^\w.-]+/g, "_").slice(0, 120) || "note";
}

function historyPath(id: string): string {
  return `.novella/history/${safeName(id)}.json`;
}

function lsKey(id: string): string {
  return `novella.history.${safeName(id)}`;
}

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/* ---------- persistence ---------- */

async function read(id: string): Promise<NoteHistory> {
  const cached = cache.get(id);
  if (cached) return cached;

  const root = store.vaultRoot();
  let loaded: NoteHistory | null = null;

  if (root) {
    try {
      const bytes = await storage().readBytes(root, historyPath(id));
      if (bytes) loaded = JSON.parse(new TextDecoder().decode(bytes)) as NoteHistory;
    } catch {
      // Unreadable or corrupt. A broken history file must never block
      // editing, so start a fresh one rather than throwing.
    }
  } else {
    try {
      const raw = localStorage.getItem(lsKey(id));
      if (raw) loaded = JSON.parse(raw) as NoteHistory;
    } catch {
      /* same reasoning */
    }
  }

  const history = loaded ?? { id, title: "", revisions: [] };
  cache.set(id, history);
  return history;
}

async function write(history: NoteHistory): Promise<void> {
  const root = store.vaultRoot();
  const json = JSON.stringify(history);

  if (root) {
    await storage().writeBytes(root, historyPath(history.id), new TextEncoder().encode(json));
    return;
  }
  try {
    localStorage.setItem(lsKey(history.id), json);
  } catch {
    // Out of quota. History is a nice-to-have; losing it must not take
    // down the save path that protects the actual manuscript.
  }
}

/* ---------- public API ---------- */

const listeners = new Set<() => void>();
let version = 0;

export function subscribeHistory(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function historyVersion(): number {
  return version;
}
function emit(): void {
  version++;
  for (const l of listeners) l();
}

/** Record the current state of a note. No-ops when nothing changed since
    the last snapshot, so repeated saves don't pile up duplicates. */
export async function snapshot(note: Note, reason: string): Promise<void> {
  // Capture the text BEFORE the first await. Notes are live objects, so
  // reading note.body after awaiting a disk load could pick up the very
  // edit this snapshot is supposed to precede — which would make the
  // "before the AI wrote" revision identical to the after.
  const body = note.body;
  const title = note.title;

  const history = await read(note.id);
  const last = history.revisions[history.revisions.length - 1];
  if (last?.body === body) return;

  history.title = title;
  history.revisions.push({
    at: Date.now(),
    body,
    reason,
    words: countWords(body),
  });
  history.revisions = thin(history.revisions);

  cache.set(note.id, history);
  emit();
  await write(history);
}

/** Snapshot whatever is open right now. Used before the assistant writes,
    where the caller has an id but not necessarily the Note. */
export async function snapshotById(id: string, reason: string): Promise<void> {
  const note = store.vault.get(id);
  if (note) await snapshot(note, reason);
}

/** Revisions for a note, newest first. Triggers a load on first call and
    notifies subscribers when it arrives. */
export function revisionsOf(id: string): Revision[] {
  const cached = cache.get(id);
  if (!cached) {
    void read(id).then(emit);
    return [];
  }
  return [...cached.revisions].sort((a, b) => b.at - a.at);
}

/** Put a past version back into the editor.

    The current text is snapshotted first, so restoring is itself
    undoable — otherwise "look at an old draft" could destroy the new one,
    which is the exact anxiety this feature exists to remove. */
export async function restore(id: string, at: number): Promise<boolean> {
  const history = await read(id);
  const target = history.revisions.find((r) => r.at === at);
  const note = store.vault.get(id);
  if (!target || !note) return false;

  await snapshot(note, "before restoring an earlier version");
  store.setBody(id, target.body);
  emit();
  return true;
}

/** Wipe a note's history. Used by the UI's explicit "clear" action only. */
export async function clearHistory(id: string): Promise<void> {
  const root = store.vaultRoot();
  cache.set(id, { id, title: "", revisions: [] });
  emit();
  if (root) {
    try {
      await storage().remove(root, historyPath(id));
    } catch {
      /* nothing to remove */
    }
  } else {
    localStorage.removeItem(lsKey(id));
  }
}

/** Drop in-memory state. Called when the vault is swapped so one project's
    history can't surface inside another. */
export function resetHistoryCache(): void {
  cache.clear();
  emit();
}

/* Register with the vault store. Importing this module is enough to turn
   history on; nothing else has to remember to call it. */
store.onVaultReplaced(resetHistoryCache);
store.onBeforeSave((note) => snapshot(note, "saved"));
