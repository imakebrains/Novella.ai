/* ============================================================
   The cloud, concretely: Supabase behind the engine's interfaces

   Thin by intent. Every decision about what a row means lives in
   wire.ts and every decision about what to do with it lives in
   syncEngine.ts; this file only knows which Supabase call carries
   which request. If the backend ever changes, this is the file that
   gets rewritten and nothing else moves.

   supabase-js is imported lazily. The cloud is optional and most
   first loads will be signed out, so it has no business in the entry
   chunk (docs/AUDIT.md, item 1).
   ============================================================ */

import type { SupabaseClient } from "@supabase/supabase-js";
import { cloudConfig } from "./config";
import { plainSessionStorage, splitSessionStorage, type SecretStore, type SessionStore } from "./sessionStorage";
import { parseAccount, type AccountSummary } from "./plans";
import type { PullPage, PushChange, PushResult, RemoteFiles } from "./syncEngine";
import { FILE_COLUMNS, PULL_PAGE_SIZE, blobKeyFor, pageOf, parsePushResult, pushArgs } from "./wire";

let clientPromise: Promise<SupabaseClient | null> | null = null;

/** The one client for this window, or null when the cloud is off.

    `secrets` is the OS keychain on desktop; without it (a plain
    browser) the session lives where supabase-js puts it by default. */
export function cloudClient(secrets?: SecretStore): Promise<SupabaseClient | null> {
  clientPromise ??= (async () => {
    const config = cloudConfig();
    if (!config) return null;
    const { createClient } = await import("@supabase/supabase-js");
    const plain = globalThis.localStorage;
    const storage: SessionStore | undefined = plain
      ? secrets
        ? splitSessionStorage(secrets, plain)
        : plainSessionStorage(plain)
      : undefined;
    return createClient(config.url, config.anonKey, {
      auth: {
        // PKCE, because the desktop app completes sign-in by handing a
        // code back from the system browser, and the implicit flow's
        // tokens-in-the-URL would pass through the OS's URL handler.
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage,
        storageKey: "novella.cloud.session",
      },
    });
  })();
  return clientPromise;
}

/** A synced project as the account lists it. */
export interface CloudProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export async function listProjects(client: SupabaseClient): Promise<CloudProject[]> {
  const { data, error } = await client
    .from("projects")
    .select("id,name,created_at,updated_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));
}

/** Create a synced project. The id is chosen here so a retry after a
    dropped response can't create the book twice. */
export async function createProject(client: SupabaseClient, name: string, id = crypto.randomUUID()): Promise<CloudProject> {
  const columns = "id,name,created_at,updated_at";
  const inserted = await client
    .from("projects")
    .insert({ id, name: name.slice(0, 200) || "Untitled" })
    .select(columns)
    .single();
  // 23505: this id already exists, i.e. an earlier attempt landed and
  // only its response was lost. Hand back what is there.
  const row =
    inserted.error?.code === "23505"
      ? await client.from("projects").select(columns).eq("id", id).single()
      : inserted;
  if (row.error) throw row.error;
  return { id, name: String(row.data.name), createdAt: String(row.data.created_at), updatedAt: String(row.data.updated_at) };
}

export async function myAccount(client: SupabaseClient): Promise<AccountSummary | null> {
  const { data, error } = await client.rpc("my_account");
  if (error) throw error;
  return parseAccount(data);
}

/** One project's files, as the sync engine sees the cloud. */
export class SupabaseProjectFiles implements RemoteFiles {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
    private readonly projectId: string,
    private readonly device: string,
  ) {}

  async pull(sinceSeq: number): Promise<PullPage> {
    const { data, error } = await this.client
      .from("project_files")
      .select(FILE_COLUMNS)
      .eq("project_id", this.projectId)
      .gt("seq", sinceSeq)
      .order("seq", { ascending: true })
      .limit(PULL_PAGE_SIZE + 1);
    if (error) throw error;
    return pageOf(data ?? []);
  }

  async push(change: PushChange): Promise<PushResult> {
    const { data, error } = await this.client.rpc("push_file", pushArgs(this.projectId, change, this.device));
    if (error) throw error;
    return parsePushResult(data);
  }

  async putBlob(sha256: string, bytes: Uint8Array): Promise<string> {
    const key = blobKeyFor(this.userId, this.projectId, sha256);
    const { error } = await this.client.storage.from("vault").upload(key, bytes, {
      contentType: "application/octet-stream",
      upsert: false,
    });
    // Content-addressed: the same bytes already being there is success.
    if (error && error.statusCode !== "409" && !/already exists|duplicate/i.test(error.message)) throw error;
    return key;
  }

  async getBlob(key: string): Promise<Uint8Array> {
    const { data, error } = await this.client.storage.from("vault").download(key);
    if (error) throw error;
    return new Uint8Array(await data.arrayBuffer());
  }
}
