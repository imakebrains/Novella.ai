/* ============================================================
   When a sync round runs

   The decision is pure so the table in test-synchost.ts can pin it;
   the timers that act on it live in syncHost.ts. Concurrency is not
   this module's job: ProjectSync.sync() already shares the round in
   flight and queues exactly one more, so "run" here means "ask".
   ============================================================ */

import { LOCAL_ONLY_DIR, isVisiblePath, type SyncEvent } from "./syncEngine";

/** The floor under everything else. Realtime is a nudge on top; a
    dropped socket or an unapplied migration costs at most this long. */
export const POLL_MS = 60_000;
/** A burst of typing is one round, not one per autosave. */
export const DEBOUNCE_MS = 5_000;
/** Alt-tabbing back and forth must not fire a round per tab. */
export const FOCUS_GAP_MS = 10_000;

export type SyncTrigger = "bind" | "focus" | "poll" | "change" | "debounce" | "online" | "realtime";

export interface ScheduleInput {
  trigger: SyncTrigger;
  now: number;
  online: boolean;
  /** When the last round finished, or null if none has yet. */
  lastRunAt: number | null;
}

export interface ScheduleDecision {
  run: boolean;
  /** Set when the debounce timer should (re)start to fire at this time. */
  debounceAt: number | null;
}

/** PURE. Did a round change anything the running app holds in memory?

    Not only the visible book: boards, plot, music, agents, trash and
    history each cache their .novella file and re-read it only when the
    vault is replaced. A pulled boards.json left unreloaded is worse
    than stale — the next board edit writes the old layout back over it
    and pushes that on the pulled version as base, and the other
    device's change is gone with no conflict copy. So any file the
    engine wrote counts, dotfolders included. */
export function needsRefresh(events: readonly SyncEvent[]): boolean {
  return events.some(
    (e) =>
      (e.type === "applied" || e.type === "conflict" || e.type === "restored" || e.type === "merged") &&
      !e.path.startsWith(LOCAL_ONLY_DIR),
  );
}

/** How long the editor must have been still before a pull may replace
    the vault. reloadFromStorage reads the whole folder before it swaps
    the index, and a keystroke landing inside that read is dropped from
    memory (only the draft snapshot keeps it). Waiting for a pause
    narrows that window; it cannot close it — that needs a vaultStore
    swap that re-checks dirty after the read. */
export const RELOAD_IDLE_MS = 3_000;

/** PURE. May the host reload the vault now? Never with unsaved words —
    ingest clears the dirty set, and the words would go with it. */
export function canReloadNow(dirtyCount: number, lastEditAt: number | null, now: number): boolean {
  if (dirtyCount > 0) return false;
  return lastEditAt === null || now - lastEditAt >= RELOAD_IDLE_MS;
}

/** One book on this device joined to one book in the cloud. */
export interface BindTarget {
  projectId: string;
  root: string;
  cloudProjectId: string;
}

/** PURE. What the host should be bound to right now, if anything.

    Only when the vault on screen IS the active project's folder. Both
    orders happen: boot opens the folder while the project is already
    active, a switch opens the folder first and sets it active after —
    in between, the vault and the registry disagree, and binding then
    would sync one book's reports under another's name. */
export function wantedTarget(
  active: { id: string; path: string | null } | null | undefined,
  vaultRoot: string | null,
  binding: { cloudProjectId: string } | null,
): BindTarget | null {
  if (!active?.path || active.path !== vaultRoot || !binding) return null;
  return { projectId: active.id, root: active.path, cloudProjectId: binding.cloudProjectId };
}

/** PURE. `have` is what the host last bound OR tried to bind — a failed
    or signed-out attempt must not retry on every registry emit (each
    one is a session read), only when something it depends on changes. */
export function bindAction(want: BindTarget | null, have: BindTarget | null): "bind" | "stay" | "unbind" {
  if (!want) return have ? "unbind" : "stay";
  if (
    have &&
    have.projectId === want.projectId &&
    have.root === want.root &&
    have.cloudProjectId === want.cloudProjectId
  ) {
    return "stay";
  }
  return "bind";
}

/** PURE. The note a pull just rewrote under the editor, if this event
    is one. Until the vault reloads, the editor still holds the old
    text; if the writer edits that note in the meantime, the save would
    land on top of the pulled version with the pulled version as its
    base — the other device's words gone, and no conflict anywhere to
    say so. The host keeps these paths and copies the pulled text aside
    before such a save (syncHost.ts, onBeforeSave). */
export function staleNotePath(e: SyncEvent): string | null {
  const path = e.type === "applied" && !e.deleted ? e.path : e.type === "restored" ? e.path : null;
  if (path === null || !isVisiblePath(path) || !path.toLowerCase().endsWith(".md")) return null;
  return path;
}

/** PURE. */
export function whenToSync(i: ScheduleInput): ScheduleDecision {
  // Offline, a round could only fail. The "online" event itself
  // arrives with online=true, which is what picks the work back up.
  if (!i.online) return { run: false, debounceAt: null };
  switch (i.trigger) {
    case "change":
      // Every change restarts the wait — the round goes once the writer
      // pauses, not five seconds after the first keystroke of a burst.
      return { run: false, debounceAt: i.now + DEBOUNCE_MS };
    case "focus":
      return { run: i.lastRunAt === null || i.now - i.lastRunAt >= FOCUS_GAP_MS, debounceAt: null };
    default:
      return { run: true, debounceAt: null };
  }
}
