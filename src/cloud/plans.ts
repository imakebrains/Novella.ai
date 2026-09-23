/* ============================================================
   Plans — the tier table the app shows

   The server has its own copy of these limits in
   supabase/migrations/*_cloud_sync.sql (plan_limits), and the server's
   copy is the one that is enforced. This file exists so the UI can say
   what a plan includes without a round trip, and test-cloud.ts parses
   the migration to prove the two never drift: an Account screen that
   promises 10 GB while the database refuses at 5 is a support ticket
   with the writer's trust attached.

   Prices are the owner's drafts (docs/CLOUD.md, "Plans"). Changing one
   here changes nothing anyone is charged — that lives in the billing
   provider's catalogue — which is why the price ids are configuration,
   not constants.

   What the paid tiers sell is convenience, never the ability to write.
   Free is the whole app. That line came from the owner in RESEARCH.md
   round 1 and is the reason no feature below gates the editor.
   ============================================================ */

export type Tier = "free" | "plus" | "pro";

export interface Plan {
  tier: Tier;
  name: string;
  /** One line under the name on the pricing card. */
  tagline: string;
  monthlyUsd: number;
  yearlyUsd: number;
  /** Books that sync to the cloud. null = unlimited. Books kept only on
      this device are never limited. */
  maxProjects: number | null;
  maxBytes: number;
  /** Hosted AI per calendar month, in millionths of a dollar of model
      cost. 0 = bring your own (local model or your own key). */
  aiMonthlyMicroUsd: number;
  /** What the pricing card lists, in order. Only things that exist. */
  includes: string[];
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const PLANS: Record<Tier, Plan> = {
  free: {
    tier: "free",
    name: "Free",
    tagline: "The whole writing app, for as long as you like.",
    monthlyUsd: 0,
    yearlyUsd: 0,
    maxProjects: 1,
    maxBytes: 100 * MB,
    aiMonthlyMicroUsd: 0,
    includes: [
      "Editor, codex, board, tasks, calendar and export — nothing held back",
      "Unlimited books on your own computer",
      "One book synced across all your devices",
      "100 MB of cloud storage",
      "AI with a free local model or your own key",
    ],
  },
  plus: {
    tier: "plus",
    name: "Plus",
    tagline: "Every book, on every computer you write on.",
    monthlyUsd: 8,
    yearlyUsd: 80,
    maxProjects: null,
    maxBytes: 10 * GB,
    aiMonthlyMicroUsd: 0,
    includes: [
      "Everything in Free",
      "Every book synced, with offline editing on each device",
      "10 GB of cloud storage",
      "AI with a free local model or your own key",
    ],
  },
  pro: {
    tier: "pro",
    name: "Pro",
    tagline: "Plus, with AI built in. No keys, no setup.",
    monthlyUsd: 18,
    yearlyUsd: 180,
    maxProjects: null,
    maxBytes: 20 * GB,
    aiMonthlyMicroUsd: 6_000_000,
    includes: [
      "Everything in Plus",
      "Built-in AI that reads your codex — nothing to install or paste",
      "A monthly AI allowance with a meter you can see",
      "20 GB of cloud storage",
    ],
  },
};

export const TIERS: Tier[] = ["free", "plus", "pro"];

export function isTier(value: unknown): value is Tier {
  return value === "free" || value === "plus" || value === "pro";
}

/** What my_account() returns, typed. Numbers arrive as JSON numbers
    from jsonb; bigint columns that could exceed 2^53 don't, in
    practice, for byte counts under a petabyte. */
export interface AccountSummary {
  tier: Tier;
  status: "active" | "trialing" | "past_due" | "paused" | "canceled";
  currentPeriodEnd: string | null;
  maxProjects: number | null;
  maxBytes: number;
  aiMonthlyMicroUsd: number;
  projects: number;
  bytesUsed: number;
  aiUsedMicroUsd: number;
}

/** PURE. Parse my_account()'s jsonb, refusing anything that isn't the
    shape we expect rather than rendering NaN on the Account screen. */
export function parseAccount(raw: unknown): AccountSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
  if (!isTier(r.tier)) return null;
  const maxBytes = num(r.max_bytes);
  const projects = num(r.projects);
  const bytesUsed = num(r.bytes_used);
  const aiMonthly = num(r.ai_monthly_microusd);
  const aiUsed = num(r.ai_used_microusd);
  if (maxBytes === null || projects === null || bytesUsed === null || aiMonthly === null || aiUsed === null) {
    return null;
  }
  const statuses = ["active", "trialing", "past_due", "paused", "canceled"] as const;
  const status = statuses.find((s) => s === r.status) ?? "active";
  return {
    tier: r.tier,
    status,
    currentPeriodEnd: typeof r.current_period_end === "string" ? r.current_period_end : null,
    maxProjects: r.max_projects === null ? null : num(r.max_projects),
    maxBytes,
    aiMonthlyMicroUsd: aiMonthly,
    projects,
    bytesUsed,
    aiUsedMicroUsd: aiUsed,
  };
}

/** PURE. Can one more book start syncing? */
export function canSyncAnotherProject(a: Pick<AccountSummary, "maxProjects" | "projects">): boolean {
  return a.maxProjects === null || a.projects < a.maxProjects;
}

/** PURE. Share of the hosted AI allowance used, 0–1, or null when the
    plan has none (so the UI hides the meter instead of showing 0/0). */
export function aiShareUsed(a: Pick<AccountSummary, "aiMonthlyMicroUsd" | "aiUsedMicroUsd">): number | null {
  if (a.aiMonthlyMicroUsd <= 0) return null;
  return Math.min(1, Math.max(0, a.aiUsedMicroUsd / a.aiMonthlyMicroUsd));
}

/** PURE. "3.2 MB of 100 MB" without a units library. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const shown = value >= 10 || Number.isInteger(value) ? Math.round(value).toString() : value.toFixed(1);
  return `${shown} ${units[unit]}`;
}

/** PURE. Yearly price as months saved — the only discount maths the
    pricing page does, kept here so the card and the tests agree. */
export function monthsFreeOnYearly(plan: Plan): number {
  if (plan.monthlyUsd <= 0) return 0;
  return Math.round((plan.monthlyUsd * 12 - plan.yearlyUsd) / plan.monthlyUsd);
}
