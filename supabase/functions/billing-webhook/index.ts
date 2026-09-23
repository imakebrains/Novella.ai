// ============================================================
// Billing webhook — Supabase Edge Function (Deno)
//
// Paddle calls this when a subscription starts, renews, lapses or
// ends. It is the ONLY writer of public.entitlements, and it writes
// with the service-role key because clients hold no write grant on
// that table at all (supabase/migrations, "Entitlements").
//
// Deploy with JWT verification OFF — Paddle has no Supabase session;
// the HMAC signature is the authentication:
//   supabase functions deploy billing-webhook --no-verify-jwt
//
// Secrets:
//   PADDLE_WEBHOOK_SECRET  the notification destination's secret key
//   PRICE_TIERS            {"pri_…":"plus","pri_…":"pro", …}
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { decideWrite, entitlementFromEvent, parsePriceTiers, verifySignature } from "../_shared/billingCore.ts";

const env = (name: string) => Deno.env.get(name) ?? "";
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const priceTiers = parsePriceTiers(env("PRICE_TIERS"));

const reply = (status: number, text: string) => new Response(text, { status });

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, "POST only");

  // Raw text first: the signature covers these exact bytes.
  const raw = await req.text();
  const genuine = await verifySignature(raw, req.headers.get("Paddle-Signature"), env("PADDLE_WEBHOOK_SECRET"), Math.floor(Date.now() / 1000));
  if (!genuine) return reply(401, "bad signature");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400, "bad json");
  }

  const parsed = entitlementFromEvent(body, priceTiers);
  // Events we don't act on still get a 200, or Paddle retries them
  // for days. The reason is logged for the owner, never returned.
  if (!parsed.ok) {
    console.log("billing: ignored", parsed.reason);
    return reply(200, "ignored");
  }
  const update = parsed.value;

  // Which account? A subscription we already know keeps its owner;
  // only a brand-new one is placed by the checkout's custom_data.
  const bySubscription = await admin
    .from("entitlements")
    .select("user_id")
    .eq("provider_subscription_id", update.subscriptionId)
    .maybeSingle();
  if (bySubscription.error) return reply(500, "lookup failed");

  const userId = bySubscription.data?.user_id ?? update.userId;
  if (!userId) {
    console.log("billing: subscription with no account", update.subscriptionId);
    return reply(200, "no account");
  }

  const current = await admin
    .from("entitlements")
    .select("provider_subscription_id, status, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (current.error) return reply(500, "lookup failed");

  const decision = decideWrite(
    current.data
      ? { subscriptionId: current.data.provider_subscription_id, status: current.data.status, updatedAt: current.data.updated_at }
      : null,
    update,
  );
  if (decision !== "apply") {
    console.log("billing:", decision, update.subscriptionId);
    return reply(200, decision);
  }

  const { error } = await admin.from("entitlements").upsert(
    {
      user_id: userId,
      tier: update.tier,
      status: update.status,
      current_period_end: update.currentPeriodEnd,
      provider: "paddle",
      provider_customer_id: update.customerId,
      provider_subscription_id: update.subscriptionId,
      updated_at: update.occurredAt,
    },
    { onConflict: "user_id" },
  );
  // A 500 makes Paddle retry, which is what we want for a write that
  // didn't land.
  if (error) return reply(500, "write failed");
  return reply(200, "ok");
});
