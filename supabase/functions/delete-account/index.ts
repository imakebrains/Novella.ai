// ============================================================
// Delete my account — Supabase Edge Function (Deno)
//
// Removes the writer's stored files, then their sign-in, which
// cascades to every row of theirs (supabase/migrations). Their books
// on their own devices are untouched: this deletes the cloud copy and
// the account, never the folder on the desk.
//
// Order matters. Files first, account second: if the run dies between
// the two, the writer can simply try again. The other order would leave
// files with no account able to reach or delete them.
//
// The rules live in ../_shared/accountCore.ts and are tested from node.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { checkDeletion, inBatches, ownKeysOnly } from "../_shared/accountCore.ts";
import { originAllowed } from "../_shared/aiCore.ts";

const env = (name: string) => Deno.env.get(name) ?? "";
const allowedOrigins = env("ALLOWED_ORIGINS").split(",");
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

function cors(origin: string | null): Record<string, string> {
  if (!originAllowed(origin, allowedOrigins)) return {};
  return {
    "Access-Control-Allow-Origin": origin!,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

const reply = (status: number, message: string, origin: string | null) =>
  new Response(JSON.stringify({ message }), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, "POST only.", origin);
  if (origin && !originAllowed(origin, allowedOrigins)) return reply(403, "Unknown origin.", origin);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (!token || userError || !userData.user) return reply(401, "Sign in again to delete your account.", origin);
  const user = userData.user;

  let body: { confirm?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // an empty body fails the confirmation below
  }

  const { data: entitlement, error: entError } = await admin
    .from("entitlements")
    .select("status, provider_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (entError) return reply(503, "Couldn't check your subscription. Nothing was deleted; try again.", origin);

  const check = checkDeletion({ accountEmail: user.email ?? null, typed: body.confirm, entitlement });
  if (!check.ok) return reply(check.status, check.message, origin);

  const { data: keys, error: keysError } = await admin.rpc("account_blob_keys", { p_user: user.id });
  if (keysError) return reply(503, "Couldn't list your stored files. Nothing was deleted; try again.", origin);

  for (const batch of inBatches(ownKeysOnly((keys ?? []) as string[], user.id))) {
    const { error } = await admin.storage.from("vault").remove(batch);
    if (error) return reply(503, "Some stored files couldn't be removed. Your account still exists; try again.", origin);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return reply(503, "Your files were removed but the account wasn't. Try again to finish.", origin);

  return reply(200, "Your account and everything stored with it have been deleted.", origin);
});
