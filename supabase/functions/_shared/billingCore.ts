/* ============================================================
   Billing — the rules, without the runtime

   Paddle (merchant of record: it collects and files sales tax and
   VAT everywhere, which a one-person company otherwise can't) tells
   us about subscriptions by webhook. This file turns one webhook into
   one entitlement row, and decides whether to believe it at all.

   Pure and Deno-free, like aiCore.ts, so test-cloud-server.ts can
   prove the signature check rejects what it must and the mapping
   lands every Paddle status on the right plan.

   Field names follow Paddle Billing's webhook payloads
   (developer.paddle.com, "Webhooks" and "Subscription" entity) as
   understood when this was written. They have NOT yet been checked
   against a live sandbox delivery — docs/CLOUD.md lists that as the
   first thing to do once the owner creates the Paddle account. The
   parser refuses anything unexpected rather than guessing, so a
   mismatch shows up as a logged rejection, never as a wrong plan.
   ============================================================ */

/** Mirrors Tier in src/cloud/plans.ts. Declared here rather than
    imported because a deployed function can only bundle files under
    supabase/functions; test-cloud-server.ts checks the two agree. */
export type Tier = "free" | "plus" | "pro";

/** A webhook older than this is refused even with a valid signature,
    so a captured delivery can't be replayed later. Generous enough
    for clock skew and Paddle's own retries, which re-sign. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export interface SignatureHeader {
  ts: number;
  h1: string[];
}

/** PURE. `ts=1671552777;h1=abc…` (h1 may repeat during secret rotation). */
export function parseSignatureHeader(header: string | null): SignatureHeader | null {
  if (!header) return null;
  let ts: number | null = null;
  const h1: string[] = [];
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "ts" && /^\d{1,12}$/.test(value)) ts = Number(value);
    if (key === "h1" && /^[0-9a-f]{64}$/i.test(value)) h1.push(value.toLowerCase());
  }
  return ts === null || h1.length === 0 ? null : { ts, h1 };
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  let hex = "";
  for (const b of sig) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/** Compare without leaking where the first difference is. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Is this delivery really from Paddle, and recent?

    The signed message is `${ts}:${rawBody}` — the RAW body, byte for
    byte. Parsing and re-serialising the JSON first would change the
    bytes and fail every check, which is why the handler reads the
    body as text before anything else touches it. */
export async function verifySignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds: number,
): Promise<boolean> {
  if (!secret) return false;
  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;
  if (Math.abs(nowSeconds - parsed.ts) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = await hmacHex(secret, `${parsed.ts}:${rawBody}`);
  return parsed.h1.some((h) => constantTimeEqual(h, expected));
}

/** The entitlements row one webhook produces. */
export interface EntitlementUpdate {
  subscriptionId: string;
  customerId: string | null;
  /** From checkout custom_data. Only trusted on the FIRST event for a
      subscription; after that the row found by subscription id wins,
      so a later event can't move a paid plan to someone else. */
  userId: string | null;
  tier: Tier;
  status: "active" | "trialing" | "past_due" | "paused" | "canceled";
  currentPeriodEnd: string | null;
  occurredAt: string;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HANDLED = new Set([
  "subscription.created",
  "subscription.activated",
  "subscription.updated",
  "subscription.trialing",
  "subscription.past_due",
  "subscription.paused",
  "subscription.resumed",
  "subscription.canceled",
]);

/** PURE. A price id → tier map from the PRICE_TIERS secret, e.g.
    {"pri_01plusmonthly":"plus","pri_01proyearly":"pro"}. */
export function parsePriceTiers(json: string): Map<string, Tier> {
  const out = new Map<string, Tier>();
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return out;
  }
  if (!raw || typeof raw !== "object") return out;
  for (const [price, tier] of Object.entries(raw as Record<string, unknown>)) {
    if (tier === "plus" || tier === "pro") out.set(price, tier);
  }
  return out;
}

/** PURE. One Paddle webhook body → an entitlement update, or the
    reason it was ignored. "Ignored" is not an error: Paddle sends many
    event types we don't act on, and those are acknowledged with 200. */
export function entitlementFromEvent(raw: unknown, priceTiers: Map<string, Tier>): Parsed<EntitlementUpdate> {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not an object" };
  const e = raw as Record<string, unknown>;
  const type = e.event_type;
  if (typeof type !== "string" || !HANDLED.has(type)) return { ok: false, reason: `ignored event ${String(type)}` };
  if (typeof e.occurred_at !== "string" || Number.isNaN(Date.parse(e.occurred_at))) {
    return { ok: false, reason: "no occurred_at" };
  }
  const d = e.data as Record<string, unknown> | undefined;
  if (!d || typeof d !== "object") return { ok: false, reason: "no data" };
  if (typeof d.id !== "string" || !d.id) return { ok: false, reason: "no subscription id" };

  const statuses = ["active", "trialing", "past_due", "paused", "canceled"] as const;
  const status = statuses.find((s) => s === d.status);
  if (!status) return { ok: false, reason: `unknown status ${String(d.status)}` };

  // The highest tier among the subscription's items. A writer on Pro
  // with an add-on is still Pro; an unknown price never grants anything.
  let tier: Tier | null = null;
  const items = Array.isArray(d.items) ? d.items : [];
  for (const item of items) {
    const priceId = (item as { price?: { id?: unknown } })?.price?.id;
    const t = typeof priceId === "string" ? priceTiers.get(priceId) : undefined;
    if (t === "pro" || (t === "plus" && tier !== "pro")) tier = t;
  }
  if (!tier) return { ok: false, reason: "no known price on the subscription" };

  const custom = d.custom_data as Record<string, unknown> | null | undefined;
  const userId = custom && typeof custom.user_id === "string" && UUID.test(custom.user_id) ? custom.user_id.toLowerCase() : null;
  const period = d.current_billing_period as { ends_at?: unknown } | null | undefined;
  const endsAt = period && typeof period.ends_at === "string" && !Number.isNaN(Date.parse(period.ends_at)) ? period.ends_at : null;

  return {
    ok: true,
    value: {
      subscriptionId: d.id,
      customerId: typeof d.customer_id === "string" ? d.customer_id : null,
      userId,
      tier,
      status,
      currentPeriodEnd: endsAt,
      occurredAt: e.occurred_at,
    },
  };
}

/** The account's current row, as far as the decision below needs it. */
export interface CurrentEntitlement {
  subscriptionId: string | null;
  status: EntitlementUpdate["status"];
  updatedAt: string | null;
}

export type WriteDecision = "apply" | "stale" | "superseded";

const LIVE = new Set(["active", "trialing", "past_due"]);

/** PURE. Should this event overwrite the account's row?

    Two ways an honest event can still be wrong to apply:

    - STALE: Paddle doesn't promise delivery order. A retried "active"
      from last week must not undo yesterday's "canceled".
    - SUPERSEDED: the writer switched plans, so their row now tracks a
      NEWER subscription. When the old one's "canceled" arrives, it is
      about a subscription they no longer rely on, and applying it
      would downgrade someone who is paying. A different subscription
      only takes over the row when it is itself live. */
export function decideWrite(current: CurrentEntitlement | null, update: EntitlementUpdate): WriteDecision {
  if (!current) return "apply";
  if (current.subscriptionId && current.subscriptionId !== update.subscriptionId) {
    if (LIVE.has(current.status) && !LIVE.has(update.status)) return "superseded";
    return "apply";
  }
  if (current.updatedAt && Date.parse(update.occurredAt) < Date.parse(current.updatedAt)) return "stale";
  return "apply";
}
