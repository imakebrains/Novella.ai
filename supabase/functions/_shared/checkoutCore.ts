/* ============================================================
   Checkout — the rules, without the runtime

   The create-checkout function turns "I want Plus, yearly" into a
   Paddle-hosted checkout page, with the writer's user id riding along
   in custom_data so the webhook (billingCore.ts) can tell whose
   subscription it is. It also hands out the customer-portal link for
   "Manage subscription".

   Pure and Deno-free, like billingCore.ts and accountCore.ts, so
   test-account.ts can pin it down from node.

   Field names follow Paddle Billing's "Create a transaction" API
   (developer.paddle.com: POST /transactions with items[].price_id and
   custom_data; the response's data.checkout.url) as understood when
   this was written. They have NOT yet been checked against a live
   sandbox — the same standing caveat billingCore.ts carries, and the
   same defence: anything unexpected becomes a sentence and a 503,
   never a half-built checkout.
   ============================================================ */

/** Mirrors Tier in src/cloud/plans.ts, minus free, which is not for
    sale. Declared here rather than imported because a deployed function
    can only bundle files under supabase/functions. */
export type Tier = "plus" | "pro";
export type Period = "monthly" | "yearly";
export type PriceKey = "plusMonthly" | "plusYearly" | "proMonthly" | "proYearly";

export type Parsed<T> = { ok: true; value: T } | { ok: false; status: number; message: string };

export type CheckoutRequest = { kind: "checkout"; tier: Tier; period: Period } | { kind: "portal" };

const PRICE_KEYS: PriceKey[] = ["plusMonthly", "plusYearly", "proMonthly", "proYearly"];

/** PURE. The PADDLE_PRICES secret: which Paddle price sells which
    plan and period. Anything that isn't a Paddle price id is dropped
    rather than sent to Paddle, so a typo shows up as "not on sale yet"
    instead of as a Paddle error the writer can't act on. */
export function parsePaddlePrices(json: string): Partial<Record<PriceKey, string>> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Partial<Record<PriceKey, string>> = {};
  for (const key of PRICE_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "string" && /^pri_[A-Za-z0-9]+$/.test(v)) out[key] = v;
  }
  return out;
}

const NOT_UNDERSTOOD: Parsed<never> = { ok: false, status: 400, message: "The request wasn't understood." };

/** PURE. The app sends one of two shapes; anything else is refused. */
export function validateCheckoutRequest(raw: unknown): Parsed<CheckoutRequest> {
  if (!raw || typeof raw !== "object") return NOT_UNDERSTOOD;
  const r = raw as Record<string, unknown>;
  if (r.kind === "portal") return { ok: true, value: { kind: "portal" } };
  if (r.kind !== "checkout") return NOT_UNDERSTOOD;
  if (r.tier !== "plus" && r.tier !== "pro") return NOT_UNDERSTOOD;
  if (r.period !== "monthly" && r.period !== "yearly") return NOT_UNDERSTOOD;
  return { ok: true, value: { kind: "checkout", tier: r.tier, period: r.period } };
}

/** PURE. */
export function priceKeyFor(tier: Tier, period: Period): PriceKey {
  return `${tier}${period === "monthly" ? "Monthly" : "Yearly"}` as PriceKey;
}

/** PURE. PADDLE_SANDBOX set means test cards and the sandbox API. */
export function paddleBase(sandboxFlag: string): string {
  return /^(1|true|yes)$/i.test(sandboxFlag.trim()) ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
}

/** PURE. The POST /transactions body. custom_data.user_id is what the
    webhook reads to find the account; without it a payment would land
    on nobody. */
export function transactionBody(priceId: string, userId: string): { items: { price_id: string; quantity: 1 }[]; custom_data: { user_id: string } } {
  return { items: [{ price_id: priceId, quantity: 1 }], custom_data: { user_id: userId } };
}

function httpsUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

/** PURE. The hosted checkout page from Paddle's reply. Paddle returns
    null here until the account has a default payment link (Paddle →
    Checkout → Checkout settings), which is an owner setup step, not a
    writer's problem. */
export function checkoutUrlOf(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const data = (raw as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const checkout = (data as { checkout?: unknown }).checkout;
  if (!checkout || typeof checkout !== "object") return null;
  return httpsUrl((checkout as { url?: unknown }).url);
}

/** PURE. */
export function checkoutReply(url: string | null): Parsed<{ url: string }> {
  if (!url) return { ok: false, status: 503, message: "Checkout isn't available yet — the payment link is not configured." };
  return { ok: true, value: { url } };
}

/** PURE. */
export function portalReply(url: string): Parsed<{ url: string }> {
  const u = httpsUrl(url.trim());
  if (!u) return { ok: false, status: 503, message: "Subscription management isn't set up yet." };
  return { ok: true, value: { url: u } };
}

/** Same set accountCore.ts uses to refuse a deletion: a subscription
    in any of these states can still charge a card. */
const LIVE = new Set(["active", "trialing", "past_due", "paused"]);

/** PURE. May this account start a NEW checkout?

    Not while a subscription is live. A second transaction is a second
    subscription; nothing would cancel the first, and once the new one
    took over the account's single entitlements row, billingCore's
    decideWrite would treat the old one's events as superseded — the
    first card charge would keep running where the app can't see it.
    Plan changes go through the portal, which prorates instead. */
export function checkoutAllowed(entitlement: { status: string; provider_subscription_id: string | null } | null): Parsed<null> {
  if (entitlement && entitlement.provider_subscription_id && LIVE.has(entitlement.status)) {
    return {
      ok: false,
      status: 409,
      message: "You already have a subscription. Change or cancel it from Manage subscription first, so you're never charged twice.",
    };
  }
  return { ok: true, value: null };
}
