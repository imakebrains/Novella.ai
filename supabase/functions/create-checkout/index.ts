// ============================================================
// Start a checkout, or find the portal — Supabase Edge Function (Deno)
//
// Deploy WITH JWT verification: `npx supabase functions deploy create-checkout`.
// Secrets (npx supabase secrets set …):
//   PADDLE_API_KEY     server-side Paddle key; never leaves this function
//   PADDLE_PRICES      '{"plusMonthly":"pri_…","plusYearly":"pri_…","proMonthly":"pri_…","proYearly":"pri_…"}'
//   PADDLE_PORTAL_URL  the customer portal link for "Manage subscription"
//   PADDLE_SANDBOX=1   optional; use sandbox-api.paddle.com and test cards
//   ALLOWED_ORIGINS    shared with the ai and delete-account functions
//
// The writer's user id goes to Paddle in custom_data, and comes back on
// every subscription webhook, which is how billing-webhook knows whose
// plan changed. This function never decides a plan itself; it only
// opens the door to Paddle's page.
//
// The rules live in ../_shared/checkoutCore.ts and are tested from node.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import {
  checkoutAllowed,
  checkoutReply,
  checkoutUrlOf,
  paddleBase,
  parsePaddlePrices,
  portalReply,
  priceKeyFor,
  transactionBody,
  validateCheckoutRequest,
} from "../_shared/checkoutCore.ts";
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

const send = (status: number, body: Record<string, unknown>, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });

const reply = (status: number, message: string, origin: string | null) => send(status, { message }, origin);

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, "POST only.", origin);
  if (origin && !originAllowed(origin, allowedOrigins)) return reply(403, "Unknown origin.", origin);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (!token || userError || !userData.user) return reply(401, "Sign in again to change your plan.", origin);
  const user = userData.user;

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    // an empty or non-JSON body fails validation below
  }
  const request = validateCheckoutRequest(raw);
  if (!request.ok) return reply(request.status, request.message, origin);

  if (request.value.kind === "portal") {
    const portal = portalReply(env("PADDLE_PORTAL_URL"));
    return portal.ok ? send(200, { url: portal.value.url }, origin) : reply(portal.status, portal.message, origin);
  }

  const { data: entitlement, error: entError } = await admin
    .from("entitlements")
    .select("status, provider_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (entError) return reply(503, "Couldn't check your current plan. Nothing was charged; try again.", origin);
  const allowed = checkoutAllowed(entitlement);
  if (!allowed.ok) return reply(allowed.status, allowed.message, origin);

  const price = parsePaddlePrices(env("PADDLE_PRICES"))[priceKeyFor(request.value.tier, request.value.period)];
  if (!price) return reply(503, "That plan isn't on sale yet.", origin);

  let res: Response;
  try {
    res = await fetch(`${paddleBase(env("PADDLE_SANDBOX"))}/transactions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env("PADDLE_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify(transactionBody(price, user.id)),
    });
  } catch {
    return reply(503, "Checkout couldn't be started. Nothing was charged; try again in a minute.", origin);
  }
  if (!res.ok) {
    // The status alone: Paddle's error body can echo request details,
    // and the function log is readable by anyone on the project.
    console.error("paddle", res.status);
    return reply(503, "Checkout couldn't be started. Nothing was charged; try again in a minute.", origin);
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // an unreadable reply has no URL; checkoutReply says so
  }
  const checkout = checkoutReply(checkoutUrlOf(body));
  return checkout.ok ? send(200, { url: checkout.value.url }, origin) : reply(checkout.status, checkout.message, origin);
});
