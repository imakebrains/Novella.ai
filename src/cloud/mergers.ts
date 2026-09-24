/* ============================================================
   Merging the two files that hold a writer's recoverable words

   When the same file changed on two devices between syncs, the engine
   keeps a visible chapter's two versions side by side and lets the
   writer choose. For files under .novella/ there is no sentence to
   show a writer, so the device that syncs second keeps its version and
   the other's is replaced — fine for a board layout, wrong for two
   files:

     .novella/history/<note>.json   snapshots taken before the assistant
                                    touched the prose, and on saves
     .novella/trash/index.json      the manifest of what can be restored

   Losing either side of those is losing something the writer may want
   back. Both are lists keyed by something unique (a snapshot's
   millisecond, a trash entry's id), so the union of the two sides is
   exactly right, and it is what these mergers produce. Anything that
   isn't a list of that shape comes back null, and the engine falls
   back to its ordinary rule rather than write a guess.

   Pure: bytes in, bytes out, no store, no clock unless one is passed.
   ============================================================ */

import { thin, type Revision } from "../core/historyThin";

export interface FileMerger {
  /** Does this merger own the path? */
  matches(path: string): boolean;
  /** Both sides' bytes; the merged bytes, or null when the file isn't
      the shape this merger understands. */
  merge(mine: Uint8Array, theirs: Uint8Array): Uint8Array | null;
}

const dec = new TextDecoder();
const enc = new TextEncoder();

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(dec.decode(bytes));
  } catch {
    return undefined;
  }
}

/* ---------- history ---------- */

interface NoteHistoryFile {
  id: string;
  title: string;
  revisions: Revision[];
}

function isHistoryFile(v: unknown): v is NoteHistoryFile {
  if (!v || typeof v !== "object") return false;
  const h = v as Partial<NoteHistoryFile>;
  return typeof h.id === "string" && Array.isArray(h.revisions);
}

function isRevision(v: unknown): v is Revision {
  if (!v || typeof v !== "object") return false;
  const r = v as Partial<Revision>;
  return typeof r.at === "number" && Number.isFinite(r.at) && typeof r.body === "string";
}

/** PURE. Union of both sides' snapshots by their millisecond, thinned
    the way the app thins a single device's history. On the same
    millisecond this device's copy wins, which can only differ by the
    reason text. Title follows this device. */
export function mergeHistory(mine: unknown, theirs: unknown, now = Date.now()): NoteHistoryFile | null {
  if (!isHistoryFile(mine) || !isHistoryFile(theirs)) return null;
  if (mine.id !== theirs.id) return null;
  const byAt = new Map<number, Revision>();
  for (const r of theirs.revisions) if (isRevision(r)) byAt.set(r.at, r);
  for (const r of mine.revisions) if (isRevision(r)) byAt.set(r.at, r);
  const revisions = thin([...byAt.values()].sort((a, b) => a.at - b.at), now);
  return { id: mine.id, title: mine.title || theirs.title, revisions };
}

export function historyMerger(now: () => number = Date.now): FileMerger {
  return {
    matches: (path) => /^\.novella\/history\/[^/]+\.json$/.test(path),
    merge(mine, theirs) {
      const merged = mergeHistory(parseJson(mine), parseJson(theirs), now());
      return merged ? enc.encode(JSON.stringify(merged)) : null;
    },
  };
}

/* ---------- trash ---------- */

interface TrashIndexFile {
  version: 1;
  retention: unknown;
  entries: { entryId: string; trashedAt: number }[];
}

function isTrashIndex(v: unknown): v is TrashIndexFile {
  if (!v || typeof v !== "object") return false;
  return Array.isArray((v as Partial<TrashIndexFile>).entries);
}

/** PURE. Union of both manifests' entries by entry id; this device's
    retention window. An entry purged on one device and still listed on
    the other comes back — its payload file may already be gone, which
    the trash panel already treats as "nothing to restore". A trash can
    that shows one thing too many beats one that silently lost a scene.
    Expiry is by trashedAt and lazy, so a returned entry still leaves on
    its original schedule. */
export function mergeTrashIndex(mine: unknown, theirs: unknown): TrashIndexFile | null {
  if (!isTrashIndex(mine) || !isTrashIndex(theirs)) return null;
  const byId = new Map<string, { entryId: string; trashedAt: number }>();
  const take = (e: unknown) => {
    if (!e || typeof e !== "object") return;
    const t = e as { entryId?: unknown; trashedAt?: unknown };
    if (typeof t.entryId !== "string" || typeof t.trashedAt !== "number") return;
    byId.set(t.entryId, e as { entryId: string; trashedAt: number });
  };
  theirs.entries.forEach(take);
  mine.entries.forEach(take);
  const entries = [...byId.values()].sort((a, b) => b.trashedAt - a.trashedAt);
  return { version: 1, retention: mine.retention ?? theirs.retention, entries };
}

export const trashIndexMerger: FileMerger = {
  matches: (path) => path === ".novella/trash/index.json",
  merge(mine, theirs) {
    const merged = mergeTrashIndex(parseJson(mine), parseJson(theirs));
    return merged ? enc.encode(JSON.stringify(merged)) : null;
  },
};

/** What the engine uses unless a host says otherwise. */
export function defaultMergers(now: () => number = Date.now): FileMerger[] {
  return [historyMerger(now), trashIndexMerger];
}
