/* ============================================================
   The settings sync host — the round, wired into the running app

   settingsSync.ts decides; this file only connects. It starts when the
   writer signs in, stops when they sign out (keeping the base and every
   local setting), and runs a round when there is a reason to: sign-in,
   a local change that has settled, focus after a quiet spell, coming
   back online, and a slow timer, because user_settings is not in the
   realtime publication.

   Local changes are found by polling, not by wrapping
   Storage.prototype.setItem. A wrapper would be a global monkeypatch in
   the path of supabase-js's own session writes (the credential split in
   sessionStorage.ts) and of recordProgress on every autosave; it would
   see writes that change nothing, miss other tabs, and double-wrap under
   HMR. The poll touches no writer and costs one pass over at most 256 KB
   every five seconds while the window is visible.

   A failed round is not retried by the poll: "last seen" moves to the
   snapshot the round tried to push, so only a new local change or a
   remote trigger (focus, online, the slow timer) tries again. Anything
   else would send one failing request every few seconds for as long as
   the writer is offline.

   It never creates the Supabase client and asks for one only while
   signed in, so a writer who never signs in downloads none of it.

   Typechecked, not unit tested — the same stance as syncHost.ts. Every
   decision is in settingsSync.ts and tested in test-settingssync.ts.
   ============================================================ */

import { useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionState } from "./auth";
import { cloudEnabled } from "./config";
import { accountSnapshot } from "./prefs";
import { describeCloudError, type CloudErrorKind } from "./wire";
import { supabaseSettings } from "./settingsRemote";
import { runRefreshers } from "./settingsRefresh";
import {
  FOCUS_GAP_MS,
  LOCAL_POLL_MS,
  PUSH_DEBOUNCE_MS,
  REMOTE_POLL_MS,
  reloadNeeded,
  stableJson,
  syncSettingsRound,
  syncable,
} from "./settingsSync";

export interface SettingsAccess {
  client(): Promise<SupabaseClient | null>;
  session(): SessionState;
  onAuthChange(fn: () => void): () => void;
}

/* ---------------- what the banner reads ---------------- */

export interface SettingsSyncStatus {
  state: "idle" | "ok" | "too-large" | "error";
  message?: string;
  kind?: CloudErrorKind;
  /** A key the running app can't re-read was applied. */
  reloadHint: boolean;
  /** The too-large message the writer already closed; the same one
      doesn't come back on every round. */
  dismissed?: string;
}

let status: SettingsSyncStatus = { state: "idle", reloadHint: false };
const listeners = new Set<() => void>();

function setStatus(next: Partial<SettingsSyncStatus>): void {
  status = { ...status, ...next };
  for (const l of listeners) l();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useSettingsSync(): SettingsSyncStatus {
  return useSyncExternalStore(subscribe, () => status, () => status);
}

export function dismissSettingsNotice(): void {
  setStatus({ reloadHint: false, dismissed: status.state === "too-large" ? status.message : status.dismissed });
}

/* ---------------- the loop ---------------- */

let installed = false;
let access: SettingsAccess | null = null;
let userId: string | null = null;
let lastSeen: string | null = null;
let lastRound = 0;
let inFlight: Promise<void> | null = null;
let again = false;
let localTimer: number | null = null;
let remoteTimer: number | null = null;
let debounce: number | null = null;

function fingerprint(): string {
  return stableJson(syncable(accountSnapshot(localStorage)));
}

async function runRound(): Promise<void> {
  const id = userId;
  if (!id || !access) return;
  const before = fingerprint();
  lastRound = Date.now();
  try {
    const client = await access.client();
    if (!client || userId !== id) return;
    const result = await syncSettingsRound({
      remote: supabaseSettings(client),
      local: localStorage,
      userId: id,
      onApplied: runRefreshers,
    });
    lastSeen = stableJson(result.local);
    const reloadHint = status.reloadHint || reloadNeeded(result.applied);
    if (result.outcome === "too-large") setStatus({ state: "too-large", message: result.message, kind: undefined, reloadHint });
    else setStatus({ state: "ok", message: undefined, kind: undefined, reloadHint });
  } catch (err) {
    lastSeen = before;
    setStatus({ state: "error", message: undefined, kind: describeCloudError(err).kind });
  }
}

/* One round at a time; a trigger during one asks for exactly one more. */
function requestRound(): void {
  if (!userId) return;
  if (inFlight) {
    again = true;
    return;
  }
  inFlight = (async () => {
    do {
      again = false;
      await runRound();
    } while (again && userId);
  })().finally(() => {
    inFlight = null;
  });
}

function pollLocal(): void {
  if (!userId || document.hidden) return;
  const now = fingerprint();
  if (now === lastSeen) return;
  lastSeen = now;
  if (debounce !== null) window.clearTimeout(debounce);
  debounce = window.setTimeout(() => {
    debounce = null;
    requestRound();
  }, PUSH_DEBOUNCE_MS);
}

function start(id: string): void {
  userId = id;
  // The sign-in round below covers what is here now; the poll only
  // needs to notice what changes after it.
  lastSeen = fingerprint();
  if (localTimer === null) localTimer = window.setInterval(pollLocal, LOCAL_POLL_MS);
  if (remoteTimer === null)
    remoteTimer = window.setInterval(() => {
      if (!document.hidden) requestRound();
    }, REMOTE_POLL_MS);
  requestRound();
}

function stop(): void {
  userId = null;
  lastSeen = null;
  for (const t of [localTimer, remoteTimer]) if (t !== null) window.clearInterval(t);
  if (debounce !== null) window.clearTimeout(debounce);
  localTimer = remoteTimer = debounce = null;
  setStatus({ state: "idle", message: undefined, kind: undefined });
}

function onFocus(): void {
  if (!userId) return;
  pollLocal();
  if (Date.now() - lastRound >= FOCUS_GAP_MS) requestRound();
}

export function installSettingsSync(a: SettingsAccess): void {
  if (installed || typeof window === "undefined" || !cloudEnabled()) return;
  installed = true;
  access = a;

  const onAuth = () => {
    const s = a.session();
    if (s.status === "signed-in") {
      if (s.user.id !== userId) start(s.user.id);
    } else if (userId !== null) {
      stop();
    }
  };
  a.onAuthChange(onAuth);
  // A session published before this ran would otherwise never start it.
  onAuth();

  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) onFocus();
  });
  window.addEventListener("online", () => requestRound());
}
