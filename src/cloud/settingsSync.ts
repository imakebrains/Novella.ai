/* ============================================================
   Settings that follow the writer — the sync round

   prefs.ts says which keys are the writer's rather than this machine's
   or one book's; user_settings holds them as one document per account,
   written only through put_settings(), which compare-and-swaps on the
   row's version. This file is the round that joins the two: read the
   row, merge three ways against the last document this device agreed
   with, apply what changed here, push the result. A stale base comes
   back as a conflict carrying the current row, and the round merges
   again against that — at most MAX_ATTEMPTS times, then it stops and
   waits for the next reason to sync. There is no loop inside a round.

   The base is the last SERVER document this device has taken in, not
   the last thing it pushed: after a conflict the values just applied
   from the other side must read as theirs, or the re-merge would count
   them as "mine changed" and undo a newer edit made over there.

   A first sync on a machine — no base, a different account, or a row
   that vanished — lets the account win every key both sides have, and
   keeps a copy of what it replaced (SETTINGS_REPLACED_KEY). A missing
   row never reads as "the other side deleted everything".

   Nothing that could be a credential leaves: the key must be an
   account key, its name must not look like a secret, and its value must
   not look like a pasted API key or token. A key held back for its
   value is also never overwritten or removed here, and its server copy
   is left as it was — dropping it from the document would read as a
   deletion on every other device. A key only a newer build knows is
   carried back up the same way and never applied here.

   PURE apart from the injected store and remote, so test-settingssync.ts
   runs the whole round in Node against a fake put_settings with the real
   CAS rules. Imports only ./prefs and ./settingsMergers; nothing logs.
   ============================================================ */

import { accountSnapshot, homeOf, ruleOf, settingsDiff, STORAGE_KEYS, type KeyValueStore, type SettingsDoc } from "./prefs";
import { VALUE_MERGERS, mergeSettingsDeep } from "./settingsMergers";

export const SETTINGS_SYNC_KEY = "novella.settingsSync";
export const SETTINGS_REPLACED_KEY = "novella.settingsSync.replaced";

/** put_settings refuses octet_length(p_doc::text) over this. */
export const SETTINGS_MAX_BYTES = 262_144;
export const MAX_ATTEMPTS = 3;

/* How often the host looks for local changes, and how long it waits for
   them to settle. user_settings is not in the realtime publication (only
   public.projects is), so remote changes arrive by polling. */
export const LOCAL_POLL_MS = 5_000;
export const PUSH_DEBOUNCE_MS = 4_000;
export const REMOTE_POLL_MS = 300_000;
export const FOCUS_GAP_MS = 30_000;

export interface SettingsRow {
  doc: SettingsDoc;
  version: number;
}

export type PutReply = { ok: true; version: number } | { ok: false; current: SettingsRow | null };

export interface SettingsRemote {
  read(): Promise<SettingsRow | null>;
  put(baseVersion: number, doc: SettingsDoc): Promise<PutReply>;
}

export interface SettingsLocal extends KeyValueStore {
  removeItem(key: string): void;
}

export interface SyncBase {
  userId: string;
  version: number;
  doc: SettingsDoc;
}

export interface RoundResult {
  outcome: "pushed" | "in-sync" | "too-large" | "gave-up";
  /** Every key this round wrote or removed on this device. */
  applied: string[];
  version: number;
  /** What the round left in the cloud, or tried to. */
  doc: SettingsDoc;
  /** This device's syncable settings as the round left them — the host's
      "last seen", so an edit made during the network wait still counts. */
  local: SettingsDoc;
  message?: string;
}

/* ---------------- what may travel ---------------- */

/** Names only. "session" is deliberately absent: novella.sessions is
    writing history, and the sign-in is already a device key. */
const CREDENTIAL_NAME = /key|token|secret|password/i;

export function isCredentialKey(key: string): boolean {
  return CREDENTIAL_NAME.test(key);
}

/* A key pasted into a field that isn't marked secret — a connection's
   notes, a plugin's URL — would otherwise ride along in plain JSON. */
const SK_KEY = /\bsk-[A-Za-z0-9_-]{20,}/;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ/;

export function looksLikeCredential(value: string): boolean {
  return SK_KEY.test(value) || JWT.test(value);
}

/** Only account keys, never a credential by name or by value. Every
    document entering or leaving the round goes through here. */
export function syncable(doc: SettingsDoc): SettingsDoc {
  const out: SettingsDoc = {};
  for (const [key, value] of Object.entries(doc)) {
    if (homeOf(key) === "account" && !isCredentialKey(key) && !looksLikeCredential(value)) out[key] = value;
  }
  return out;
}

/* A key a NEWER build classified as account and uploaded, which this
   build has no rule for. It is never applied here, but it goes back up
   as it came: dropping it would read on the newer device as "deleted
   over there" and remove the writer's setting from that machine too. */
function unclassified(doc: SettingsDoc): SettingsDoc {
  const out: SettingsDoc = {};
  for (const [key, value] of Object.entries(doc)) {
    if (/^novella\./.test(key) && homeOf(key) === null && !isCredentialKey(key) && !looksLikeCredential(value)) out[key] = value;
  }
  return out;
}

/** Account keys this device has but syncable() dropped for their VALUE.
    The round treats them as untouched on this side. */
function heldBack(raw: SettingsDoc, clean: SettingsDoc): string[] {
  return Object.keys(raw).filter((k) => !(k in clean) && homeOf(k) === "account" && !isCredentialKey(k));
}

/* ---------------- the wire ---------------- */

export function parseSettingsDoc(raw: unknown): SettingsDoc {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: SettingsDoc = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
  return { ...unclassified(out), ...syncable(out) };
}

export function parseSettingsRow(raw: unknown): SettingsRow | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") throw new Error("bad settings reply");
  const r = raw as { doc?: unknown; version?: unknown };
  const version = Number(r.version);
  if (!Number.isFinite(version)) throw new Error("bad settings reply");
  return { doc: parseSettingsDoc(r.doc), version };
}

/** put_settings answers {ok, version} or {ok:false, reason:'conflict',
    current:{doc, version}|null}; bigint may arrive as a string. */
export function parsePutReply(raw: unknown): PutReply {
  if (typeof raw === "object" && raw !== null) {
    const r = raw as { ok?: unknown; version?: unknown; reason?: unknown; current?: unknown };
    if (r.ok === true) {
      const version = Number(r.version);
      if (Number.isFinite(version)) return { ok: true, version };
    } else if (r.ok === false && r.reason === "conflict") {
      return { ok: false, current: parseSettingsRow(r.current) };
    }
  }
  throw new Error("bad settings reply");
}

/* ---------------- size ---------------- */

/** What octet_length(p_doc::text) will say. jsonb prints ": " and ", "
    between entries where JSON.stringify prints ":" and ",". */
export function docBytes(doc: SettingsDoc): number {
  const n = Object.keys(doc).length;
  return new TextEncoder().encode(JSON.stringify(doc)).length + (n > 0 ? 2 * n - 1 : 0);
}

export function oversize(doc: SettingsDoc): { bytes: number; largest: string[] } | null {
  const bytes = docBytes(doc);
  if (bytes <= SETTINGS_MAX_BYTES) return null;
  return { bytes, largest: largestKeys(doc) };
}

function largestKeys(doc: SettingsDoc): string[] {
  return Object.entries(doc)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3)
    .map(([k]) => k);
}

/** Key order is whatever the store or the server happened to use, so
    equality and change detection compare this instead. */
export function stableJson(doc: SettingsDoc): string {
  return JSON.stringify(Object.keys(doc).sort().map((k) => [k, doc[k]]));
}

/* ---------------- the base ---------------- */

export function readBase(local: SettingsLocal, userId: string): SyncBase | null {
  try {
    const raw = local.getItem(SETTINGS_SYNC_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SyncBase>;
    if (parsed.userId !== userId || typeof parsed.version !== "number") return null;
    return { userId, version: parsed.version, doc: parseSettingsDoc(parsed.doc) };
  } catch {
    return null;
  }
}

/* A full store costs the base, and the next round then runs as a first
   sync — the account wins, and what it replaced is stashed. */
export function writeBase(local: SettingsLocal, base: SyncBase | null): void {
  try {
    if (base) local.setItem(SETTINGS_SYNC_KEY, JSON.stringify(base));
    else local.removeItem(SETTINGS_SYNC_KEY);
  } catch {
    /* see above */
  }
}

/* ---------------- merging ---------------- */

/** First sync on this machine for this account: the account wins every
    key both sides hold, except the record-shaped ones, which are unioned.
    Keys only this device has are kept and uploaded. */
export function firstSyncMerge(mine: SettingsDoc, theirs: SettingsDoc): { merged: SettingsDoc; replaced: SettingsDoc } {
  const merged: SettingsDoc = { ...mine, ...theirs };
  const replaced: SettingsDoc = {};
  for (const key of Object.keys(mine)) {
    const m = mine[key]!;
    const t = theirs[key];
    if (t === undefined || t === m) continue;
    const union = VALUE_MERGERS[key]?.(undefined, m, t) ?? null;
    if (union !== null) merged[key] = union;
    else replaced[key] = m;
  }
  return { merged, replaced };
}

/* ---------------- the round ---------------- */

export interface RoundDeps {
  remote: SettingsRemote;
  local: SettingsLocal;
  userId: string;
  now?: () => number;
  /** Called synchronously with the keys each attempt wrote, BEFORE the
      push is awaited. Stores that cache in memory must re-read here: an
      autosave during the network wait would otherwise write the stale
      copy straight back over what was just applied. */
  onApplied?: (keys: string[]) => void;
}

function tooLarge(bytes: number, largest: string[]): string {
  const kb = Math.ceil(bytes / 1024);
  return `Settings are ${kb} KB; the cloud keeps 256 KB. Largest: ${largest.join(", ")}.`;
}

export async function syncSettingsRound(deps: RoundDeps): Promise<RoundResult> {
  const { remote, local, userId } = deps;
  const now = deps.now ?? Date.now;
  let base = readBase(local, userId);
  let row = await remote.read();
  const applied = new Set<string>();
  let stash: SettingsDoc = {};
  let merged: SettingsDoc = {};
  let seen: SettingsDoc = {};
  let version = row?.version ?? 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Read after the await, so read → merge → apply has no gap in it.
    const raw = accountSnapshot(local);
    const mine = syncable(raw);
    const held = heldBack(raw, mine);
    // Filtered again here, not only in the parser: a document written by
    // an older build, or a remote that skipped parseSettingsRow, must not
    // get a device key or a credential onto this machine.
    const theirs = syncable(row?.doc ?? {});
    const carried = unclassified(row?.doc ?? {});
    version = row?.version ?? 0;

    if (row === null || base === null) {
      const first = firstSyncMerge(mine, theirs);
      merged = first.merged;
      // A later attempt sees the values already applied; the first one
      // saw this device's own, and those are what the stash is for.
      const fresh = Object.keys(first.replaced).filter((k) => !(k in stash));
      if (fresh.length > 0) {
        stash = { ...first.replaced, ...stash };
        try {
          local.setItem(SETTINGS_REPLACED_KEY, JSON.stringify({ userId, at: now(), values: stash }));
        } catch {
          /* best effort: the values themselves are applied either way */
        }
      }
    } else {
      merged = mergeSettingsDeep(base.doc, mine, theirs);
    }
    for (const k of held) {
      if (k in theirs) merged[k] = theirs[k]!;
      else delete merged[k];
    }
    // settingsDiff() writes account keys only, so these never land here.
    Object.assign(merged, carried);

    const { set, remove } = settingsDiff(mine, merged);
    const wrote: string[] = [];
    for (const [k, v] of Object.entries(set)) {
      if (held.includes(k)) continue;
      try {
        local.setItem(k, v);
        wrote.push(k);
      } catch {
        /* quota: this key stays as it was here and syncs next round */
      }
    }
    for (const k of remove) {
      try {
        local.removeItem(k);
        wrote.push(k);
      } catch {
        /* same */
      }
    }
    for (const k of wrote) applied.add(k);
    // Taken from the store, not from `merged`: a write the quota refused
    // must not look like a fresh local change on every poll. Taken before
    // the refreshers, so a store that normalises what it re-reads gets
    // its version pushed on the next round rather than never.
    seen = syncable(accountSnapshot(local));
    if (wrote.length > 0 && deps.onApplied) {
      try {
        deps.onApplied(wrote);
      } catch {
        /* a store that failed to refresh is the host's problem, not the merge's */
      }
    }

    base = row ? { userId, version, doc: theirs } : null;
    writeBase(local, base);

    const done = (outcome: RoundResult["outcome"], extra: Partial<RoundResult> = {}): RoundResult => ({
      outcome,
      applied: [...applied],
      version,
      doc: merged,
      local: seen,
      ...extra,
    });

    const cloud = { ...carried, ...theirs };
    if (row !== null && stableJson(merged) === stableJson(cloud)) return done("in-sync", { doc: cloud });
    if (row === null && Object.keys(merged).length === 0) return done("in-sync");

    const big = oversize(merged);
    if (big) return done("too-large", { message: tooLarge(big.bytes, big.largest) });

    let reply: PutReply;
    try {
      reply = await remote.put(version, merged);
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err);
      if (/settings_too_large/.test(message)) return done("too-large", { message: tooLarge(docBytes(merged), largestKeys(merged)) });
      throw err;
    }
    if (reply.ok) {
      version = reply.version;
      base = { userId, version, doc: merged };
      writeBase(local, base);
      return done("pushed", { version });
    }
    row = reply.current;
  }

  return {
    outcome: "gave-up",
    applied: [...applied],
    version,
    doc: merged,
    local: seen,
  };
}

/* ============================================================
   How the running app hears about an applied key

   Keyed by the STORAGE_KEYS rule, so test-settingssync fails the gate on
   an account key that hasn't chosen one:
     refresher    — the store caches in memory and writes the whole blob
                    back; settingsRefresh.ts re-reads it the moment the
                    key is applied.
     read-through — read from storage at every use; nothing to refresh.
     quiet        — read at mount or boot, and only written on a new
                    deliberate choice, so a stale copy can't clobber.
     reload       — can't be refreshed from here; the banner asks for a
                    reload.
   ============================================================ */

export type Refresh = "refresher" | "read-through" | "quiet" | "reload";

export const REFRESH: Record<string, Refresh> = {
  "novella.theme": "refresher",
  "novella.personalize": "refresher",
  "novella.customThemes": "refresher",
  "novella.profile": "refresher",
  "novella.roleRouting": "refresher",
  "novella.connections": "refresher",
  "novella.calendar": "refresher",
  "novella.calendarLabels": "refresher",
  "novella.calendarFeeds": "refresher",
  "novella.planner": "refresher",
  "novella.sessions": "refresher",
  "novella.timers": "refresher",
  "novella.accentSwatches": "read-through",
  "novella.connection": "read-through",
  "novella.connections.hostedSeeded": "read-through",
  "novella.activeProvider": "read-through",
  "novella.plugin": "read-through",
  "novella.plugin.": "read-through",
  "novella.tasks.doneMode": "quiet",
  "novella.tasks.sort": "quiet",
  "novella.welcomed": "quiet",
  "novella.introSeen": "quiet",
  "novella.tourSeen": "quiet",
  "novella.tourOffered": "quiet",
  "novella.motionNoticeSeen": "quiet",
  // pluginHost caches which plugins are active, and turning one on or
  // off runs its activation code — not something to do behind the
  // writer's back.
  "novella.enabledPlugins": "reload",
  // sprints.ts is owner-modified; it gets its reload hook when that merges.
  "novella.sprints": "reload",
};

/** The rule key an applied storage key refreshes under. */
export function refreshRuleOf(key: string): string | null {
  return ruleOf(key, STORAGE_KEYS)?.key ?? null;
}

export function reloadNeeded(applied: string[]): boolean {
  return applied.some((k) => {
    const rule = refreshRuleOf(k);
    return rule !== null && REFRESH[rule] === "reload";
  });
}
