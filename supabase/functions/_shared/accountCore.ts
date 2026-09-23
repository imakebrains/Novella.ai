/* ============================================================
   Leaving — the rules for deleting an account

   Pure, like aiCore.ts and billingCore.ts, so test-cloud-server.ts can
   pin them down from node. The delete-account function is plumbing
   around these three decisions:

   1. Did the writer really mean it? They type their account email;
      the request carries it. A stray click, a replayed request or a
      page that tricks a signed-in browser into posting can't produce
      that string.
   2. Would deleting leave a subscription charging a card? Then refuse,
      with the way out. Cancelling on the writer's behalf needs the
      billing provider's API and its own confirmation; silently leaving
      the charge running would be the worst outcome of all.
   3. Which stored files go, in what batches? Everything under the
      writer's own folder, in batches the Storage API accepts.
   ============================================================ */

export interface DeletionInput {
  /** The signed-in account's email, from the verified session. */
  accountEmail: string | null;
  /** What the writer typed to confirm. */
  typed: unknown;
  /** The account's entitlement row, if any. */
  entitlement: { status: string; provider_subscription_id: string | null } | null;
}

export type DeletionCheck = { ok: true } | { ok: false; status: number; message: string };

const LIVE = new Set(["active", "trialing", "past_due", "paused"]);

/** PURE. May this account be deleted right now? */
export function checkDeletion(input: DeletionInput): DeletionCheck {
  const email = (input.accountEmail ?? "").trim().toLowerCase();
  const typed = typeof input.typed === "string" ? input.typed.trim().toLowerCase() : "";
  if (!email) {
    return { ok: false, status: 400, message: "This account has no email to confirm with. Contact support to delete it." };
  }
  if (typed !== email) {
    return { ok: false, status: 400, message: "Type your account email exactly to confirm. Nothing was deleted." };
  }
  const e = input.entitlement;
  if (e && e.provider_subscription_id && LIVE.has(e.status)) {
    return {
      ok: false,
      status: 409,
      message: "Your subscription is still active. Cancel it from Manage subscription first, so you aren't charged for an account that no longer exists. Nothing was deleted.",
    };
  }
  return { ok: true };
}

/** PURE. Storage keys in batches of `size`. The Storage API's remove
    takes a list; a bounded one keeps each request small enough to
    retry on its own if the connection drops halfway through. */
export function inBatches<T>(items: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** PURE. Every key must sit inside the account's own folder. The list
    comes from our own SQL, so this is belt and braces — but it is the
    last thing between a bug and deleting someone else's cover art. */
export function ownKeysOnly(keys: string[], userId: string): string[] {
  const prefix = `${userId}/`;
  return keys.filter((k) => k.startsWith(prefix) && !k.includes("..") && k.length > prefix.length);
}
