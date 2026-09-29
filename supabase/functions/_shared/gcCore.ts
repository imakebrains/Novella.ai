/* ============================================================
   Reclaiming storage — the rules, without the runtime

   Pure, like accountCore.ts, so test-gc.ts can pin them down from
   node. The gc-blobs function is plumbing around three decisions:

   1. Is this the scheduler calling? One shared secret in one header,
      compared without leaking its length through timing. No secret
      configured means nobody is let in, not everybody.
   2. Whose folders get swept? Every account that has a book or a
      subscription, once each.
   3. What goes this run? The listed keys, checked against the folder
      they must sit in, capped so one huge backlog cannot run the
      function into its time limit, and batched for the Storage API.
   ============================================================ */

import { inBatches, ownKeysOnly } from "./accountCore.ts";

export const CRON_HEADER = "x-cron-secret";

/** The most keys one run removes. Hourly runs drain a backlog in a
    few hours; a single run that tried to do it all would hit the
    function's wall-clock limit and report nothing. */
export const MAX_KEYS_PER_RUN = 2000;

/** PURE. Does the presented header open the door? Every character is
    compared even after the first mismatch, so a wrong guess costs the
    same as a near miss. Sixteen characters is the floor because a
    secret shorter than that is a typo, not a secret. */
export function cronAuthorized(presented: string | null, secret: string): boolean {
  if (!secret || secret.length < 16 || presented === null) return false;
  if (presented.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= presented.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

/** PURE. Accounts worth sweeping, each once, blanks dropped. */
export function usersToSweep(projectOwners: readonly (string | null)[], entitled: readonly (string | null)[]): string[] {
  const ids = new Set<string>();
  for (const id of [...projectOwners, ...entitled]) if (id) ids.add(id);
  return [...ids].sort();
}

export interface RemovalPlan {
  batches: string[][];
  /** Own keys left for the next run because the budget ran out. */
  deferred: number;
}

/** PURE. Which keys go now, in what batches. `budget` is what remains
    of MAX_KEYS_PER_RUN after earlier accounts in the same run. */
export function planRemoval(keys: readonly string[], userId: string, budget: number): RemovalPlan {
  const own = ownKeysOnly([...keys], userId);
  const now = own.slice(0, Math.max(0, budget));
  return { batches: inBatches(now), deferred: own.length - now.length };
}
