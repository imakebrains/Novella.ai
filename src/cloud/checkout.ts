/* ============================================================
   Upgrade and Manage subscription, from the writer's side

   Both ask the create-checkout function for a Paddle page and send
   the writer there. Paddle takes the card, not Novella; the plan
   changes when Paddle's webhook reaches billing-webhook, never because
   this page said so.
   ============================================================ */

import { hostedAccess } from "./auth";
import { requestHandoff } from "./functions";
import type { Period, Tier } from "../../supabase/functions/_shared/checkoutCore";

async function access() {
  const a = await hostedAccess();
  if (!a) throw new Error("Sign in first.");
  return a;
}

export async function startCheckout(tier: Tier, period: Period): Promise<string> {
  return requestHandoff(await access(), { kind: "checkout", tier, period }, "Checkout couldn't be started. Nothing was charged; try again in a minute.");
}

export async function manageSubscriptionUrl(): Promise<string> {
  return requestHandoff(await access(), { kind: "portal" }, "Subscription management couldn't be opened. Try again in a minute.");
}

/** Hand a URL to the browser. Returns nothing because it can't know:
    with "noopener" window.open always returns null, and under Tauri
    there is no opener plugin, so whether this reaches the system
    browser on desktop is unverified. The Account tab always shows the
    link and a Copy button beside it for exactly that reason. */
export function openExternal(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
