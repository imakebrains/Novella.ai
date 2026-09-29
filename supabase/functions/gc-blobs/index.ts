// ============================================================
// Reclaim storage — Supabase Edge Function (Deno)
//
// Removes blobs nothing points at any more, for every account, on a
// schedule (docs/CLOUD.md, "Reclaiming storage"). Which keys qualify
// is decided in SQL — unreferenced_blob_keys(), service_role only.
// This is the plumbing that walks accounts and removes them through
// the Storage API, so the bytes go with the rows.
//
// Deploy with JWT verification OFF — a scheduler has no Supabase
// session; the shared secret is the authentication:
//   supabase functions deploy gc-blobs --no-verify-jwt
//
// Secrets:
//   CRON_SECRET  what the scheduler sends in the x-cron-secret header
//
// Best effort and rerun-safe: an account whose removal fails is
// counted and skipped, never retried in the same run, and the next
// run lists the same keys again. Nothing here ever logs a key or the
// secret — counts only.
//
// Accounts are walked in id order under one per-run budget, so a big
// backlog at a low id makes later accounts wait a run or two; once it
// drains, every run reaches everyone. An account with neither a book
// nor a subscription row is not walked — its folder empties when the
// account is deleted (delete-account).
//
// The rules live in ../_shared/gcCore.ts and are tested from node.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { CRON_HEADER, MAX_KEYS_PER_RUN, cronAuthorized, planRemoval, usersToSweep } from "../_shared/gcCore.ts";

const env = (name: string) => Deno.env.get(name) ?? "";
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// PostgREST caps a request at 1000 rows; a project list past that is
// a good problem, but it must not silently skip the accounts after it.
// Ranges without an order are not stable across pages, hence .order().
const PAGE = 1000;

async function column(table: string, col: string): Promise<(string | null)[]> {
  const out: (string | null)[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from(table).select(col).order(col).range(from, from + PAGE - 1);
    if (error) throw error;
    // A column name that is not a literal defeats supabase-js's row
    // typing, which then claims every row is a parse error.
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    for (const r of rows) out.push(typeof r[col] === "string" ? (r[col] as string) : null);
    if (rows.length < PAGE) return out;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { message: "POST only." });
  if (!cronAuthorized(req.headers.get(CRON_HEADER), env("CRON_SECRET"))) return json(403, { message: "Not the scheduler." });

  let users: string[];
  try {
    users = usersToSweep(await column("projects", "owner_id"), await column("entitlements", "user_id"));
  } catch {
    return json(503, { message: "Couldn't list accounts. Nothing was removed." });
  }

  // `listed` is a lower bound: an rpc's rows are capped at PostgREST's
  // max-rows too. Whatever it leaves out is listed again next run.
  const tally = { users: 0, listed: 0, removed: 0, deferred: 0, failed: 0 };
  let budget = MAX_KEYS_PER_RUN;
  for (const userId of users) {
    if (budget <= 0) break;
    tally.users++;
    const { data, error } = await admin.rpc("unreferenced_blob_keys", { p_user: userId });
    if (error) {
      tally.failed++;
      continue;
    }
    const keys = (data ?? []) as string[];
    tally.listed += keys.length;
    const plan = planRemoval(keys, userId, budget);
    tally.deferred += plan.deferred;
    for (const batch of plan.batches) {
      const { error: removeError } = await admin.storage.from("vault").remove(batch);
      if (removeError) {
        tally.failed++;
        break;
      }
      tally.removed += batch.length;
      budget -= batch.length;
    }
  }

  console.log("gc-blobs:", JSON.stringify(tally));
  return json(200, tally);
});
