/* ============================================================
   The wire — database rows in, engine shapes out

   Every place the app meets the cloud's JSON goes through here, and
   nothing here imports the Supabase client. That split is what lets
   one set of functions be exercised three ways: by test-cloud.ts, by
   the contract test that drives the real push_file() in Postgres
   (supabase/tests), and by supabaseRemote.ts in the running app.

   Parsing is strict. A row missing a field is a thrown error, not a
   RemoteFile with `undefined` in it — the engine compares versions
   and hashes to decide whether to overwrite a writer's chapter, and
   `undefined >= 3` is false in a way that would read as "newer".
   ============================================================ */

import type { PushChange, PushResult, RemoteFile } from "./syncEngine";

/** Rows per pull request. A few hundred chapters come down in one or
    two round trips; a first sync of a huge vault streams in pages. */
export const PULL_PAGE_SIZE = 500;

/** The columns a pull selects. owner_id stays behind — the client
    already knows who it is. */
export const FILE_COLUMNS = "path,version,seq,sha256,size,deleted,content,blob_key,device";

export class WireError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WireError";
  }
}

/** Postgres bigint arrives from PostgREST as a JSON number and from
    node-postgres as a string. Accept both, refuse anything else. */
function int(value: unknown, field: string): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isSafeInteger(n)) {
    throw new WireError(`The cloud sent a file row with a bad ${field}.`);
  }
  return n;
}

function str(value: unknown, field: string): string {
  if (typeof value !== "string") throw new WireError(`The cloud sent a file row with a bad ${field}.`);
  return value;
}

function strOrNull(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return str(value, field);
}

/** PURE. One project_files row as the engine's RemoteFile. */
export function rowToRemoteFile(raw: unknown): RemoteFile {
  if (!raw || typeof raw !== "object") throw new WireError("The cloud sent a file row that isn't an object.");
  const r = raw as Record<string, unknown>;
  if (typeof r.deleted !== "boolean") throw new WireError("The cloud sent a file row with a bad deleted flag.");
  return {
    path: str(r.path, "path"),
    version: int(r.version, "version"),
    seq: int(r.seq, "seq"),
    sha256: str(r.sha256, "sha256"),
    size: int(r.size, "size"),
    deleted: r.deleted,
    content: strOrNull(r.content, "content"),
    blobKey: strOrNull(r.blob_key, "blob_key"),
    device: strOrNull(r.device, "device"),
  };
}

/** PURE. push_file()'s jsonb reply as the engine's PushResult. */
export function parsePushResult(raw: unknown): PushResult {
  if (!raw || typeof raw !== "object") throw new WireError("The cloud's reply to a save wasn't understood.");
  const r = raw as Record<string, unknown>;
  if (r.ok === true) return { ok: true, version: int(r.version, "version"), seq: int(r.seq, "seq") };
  if (r.reason === "conflict") {
    return { ok: false, reason: "conflict", current: r.current == null ? null : rowToRemoteFile(r.current) };
  }
  if (r.reason === "limit" && (r.limit === "projects" || r.limit === "bytes")) {
    return { ok: false, reason: "limit", limit: r.limit };
  }
  throw new WireError("The cloud's reply to a save wasn't understood.");
}

/** PURE. The named arguments push_file() takes, from an engine change. */
export function pushArgs(projectId: string, change: PushChange, device: string) {
  return {
    p_project: projectId,
    p_path: change.path,
    p_base_version: change.baseVersion,
    p_sha256: change.sha256,
    p_deleted: change.deleted,
    p_content: change.content,
    p_blob_key: change.blobKey,
    p_device: device,
  };
}

/** PURE. Where a blob lives in the vault bucket. push_file() refuses
    any other shape, so this is the one place it is spelled. */
export function blobKeyFor(userId: string, projectId: string, sha256: string): string {
  return `${userId}/${projectId}/${sha256}`;
}

/** PURE. A page of rows plus the "is there more" answer, given that
    the query asked for one row beyond the page size. */
export function pageOf(rows: unknown[], pageSize = PULL_PAGE_SIZE): { files: RemoteFile[]; more: boolean } {
  const more = rows.length > pageSize;
  return { files: rows.slice(0, pageSize).map(rowToRemoteFile), more };
}

/* ------------------------------------------------------------
   Errors a writer might see

   push_file() raises with a short machine code as its message
   ("plan_limit:projects", "not_found"). These turn the codes into a
   sentence, and never pass a raw server message through to the
   screen — it could carry anything.
   ------------------------------------------------------------ */

export type CloudErrorKind = "offline" | "signed-out" | "not-found" | "limit" | "rejected" | "unknown";

export interface CloudProblem {
  kind: CloudErrorKind;
  message: string;
}

/** PURE. A thrown error, or a Supabase error object, as a writer-facing
    problem. `offline` is the only kind the scheduler retries quietly. */
export function describeCloudError(err: unknown): CloudProblem {
  const message = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err);
  const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
  if (/Failed to fetch|NetworkError|Load failed|fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(message)) {
    return { kind: "offline", message: "Offline — your changes are saved on this device and will sync when you reconnect." };
  }
  if (code === "28000" || /not_signed_in|JWT expired|invalid JWT|refresh token/i.test(message)) {
    return { kind: "signed-out", message: "Your sign-in expired. Sign in again to keep syncing — nothing on this device is lost." };
  }
  if (code === "P0002" || /not_found/.test(message)) {
    return { kind: "not-found", message: "This book is no longer in your cloud account. It is still on this device." };
  }
  if (/plan_limit:projects/.test(message)) {
    return { kind: "limit", message: "Your plan syncs one book. Upgrade to sync more — every book stays on this device either way." };
  }
  if (/bad_request|check constraint/.test(message)) {
    return { kind: "rejected", message: "The cloud refused one change as malformed. It is kept on this device." };
  }
  return { kind: "unknown", message: "Sync hit a problem it didn't recognise. Your work is saved on this device." };
}
