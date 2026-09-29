/* ============================================================
   The sync status line — what the writer is told

   The same honesty rule as the autosave line beside it: never "synced"
   while anything is still only on this device, and never a raw server
   message (describeCloudError turns every failure into a sentence).
   The reducer is pure so test-synchost.ts can walk it; the store and
   hook underneath are the smallest thing React can subscribe to.
   ============================================================ */

import { useSyncExternalStore } from "react";
import { describeCloudError, type CloudProblem } from "./wire";
import type { SyncResult } from "./syncEngine";

export type SyncStateKind = "off" | "signed-out" | "synced" | "syncing" | "offline" | "waiting" | "error";

export interface SyncStatus {
  state: SyncStateKind;
  /** Changes on this device the cloud hasn't accepted yet. */
  pending: number;
  lastSyncedAt: number | null;
  /** The longer sentence behind the short text — a tooltip, never a toast. */
  message: string | null;
  /** A mass delete waiting for the writer's yes (engine rule 4). */
  heldDeletions: string[];
}

export const INITIAL_STATUS: SyncStatus = { state: "off", pending: 0, lastSyncedAt: null, message: null, heldDeletions: [] };

export type StatusAction =
  | { type: "off" }
  | { type: "signed-out" }
  | { type: "bound"; pending: number }
  | { type: "pending"; count: number }
  | { type: "started" }
  | { type: "finished"; result: SyncResult; pending: number; at: number }
  | { type: "online" }
  | { type: "offline" }
  | { type: "failed"; problem: CloudProblem };

const OFFLINE_MESSAGE = describeCloudError(new TypeError("Failed to fetch")).message;
const BYTES_MESSAGE = "Your cloud storage is full. Changes are kept on this device.";

/** A problem as a status. Only "offline" is quiet — it heals itself. */
function fromProblem(prev: SyncStatus, problem: CloudProblem, pending: number): SyncStatus {
  const state: SyncStateKind =
    problem.kind === "offline" ? "offline" : problem.kind === "signed-out" ? "signed-out" : "error";
  return { ...prev, state, pending, message: problem.message, heldDeletions: [] };
}

/** PURE. */
export function reduceStatus(prev: SyncStatus, a: StatusAction): SyncStatus {
  // Nothing bound: a straggling round or a network event from a torn-
  // down binding must not light the line back up.
  const idle = prev.state === "off" || prev.state === "signed-out";
  switch (a.type) {
    case "off":
    case "signed-out":
      return { ...INITIAL_STATUS, state: a.type };
    case "bound":
      return {
        ...prev,
        state: a.pending > 0 ? "waiting" : "synced",
        pending: a.pending,
        message: null,
        heldDeletions: [],
      };
    case "failed":
      return fromProblem(prev, a.problem, prev.pending);
    case "pending": {
      if (idle) return prev;
      const next = { ...prev, pending: a.count };
      if ((prev.state === "synced" || prev.state === "waiting") && prev.heldDeletions.length === 0) {
        next.state = a.count > 0 ? "waiting" : "synced";
      }
      return next;
    }
    case "started":
      return idle ? prev : { ...prev, state: "syncing", message: null };
    case "offline":
      return idle ? prev : { ...prev, state: "offline", message: OFFLINE_MESSAGE };
    case "online":
      return prev.state === "offline" ? { ...prev, state: "waiting", message: null } : prev;
    case "finished": {
      if (idle) return prev;
      const r = a.result;
      if (r.error !== null) return fromProblem(prev, describeCloudError(new Error(r.error)), a.pending);
      if (r.limit === "projects") {
        return { ...prev, state: "error", pending: a.pending, message: describeCloudError(new Error("plan_limit:projects")).message, heldDeletions: [] };
      }
      if (r.limit === "bytes") {
        return { ...prev, state: "error", pending: a.pending, message: BYTES_MESSAGE, heldDeletions: [] };
      }
      if (r.heldDeletions.length > 0) {
        const n = r.heldDeletions.length;
        return {
          ...prev,
          state: "waiting",
          pending: a.pending,
          heldDeletions: [...r.heldDeletions],
          message: `${n} deletions are waiting for your OK — see Settings → Account.`,
        };
      }
      return {
        ...prev,
        state: a.pending > 0 ? "waiting" : "synced",
        pending: a.pending,
        lastSyncedAt: a.at,
        message: null,
        heldDeletions: [],
      };
    }
  }
}

/** PURE. The short word or two in the titlebar; null hides the line. */
export function statusText(s: SyncStatus): string | null {
  switch (s.state) {
    case "off":
      return null;
    case "signed-out":
      return "sign in to sync";
    case "syncing":
      return "syncing…";
    case "synced":
      return "synced";
    case "waiting":
      return s.heldDeletions.length > 0 ? `${s.heldDeletions.length} deletions need your OK` : `${s.pending} waiting`;
    case "offline":
      return s.pending > 0 ? `${s.pending} waiting — offline` : "offline";
    case "error":
      return "sync paused";
  }
}

/** PURE. The tooltip: the whole sentence when there is one, else when. */
export function statusTip(s: SyncStatus): string | undefined {
  if (s.message) return s.message;
  if (s.lastSyncedAt !== null) return `Last synced ${new Date(s.lastSyncedAt).toLocaleTimeString()}`;
  return undefined;
}

/* ---------------- the store ---------------- */

let current: SyncStatus = INITIAL_STATUS;
const listeners = new Set<() => void>();

export function dispatchStatus(a: StatusAction): void {
  const next = reduceStatus(current, a);
  if (next === current) return;
  current = next;
  for (const l of listeners) l();
}

export function getSyncStatus(): SyncStatus {
  return current;
}

export function subscribeSyncStatus(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
}
