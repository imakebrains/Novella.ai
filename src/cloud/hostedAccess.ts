/* ============================================================
   Who may use Novella AI, right now — the small seam

   Two callers need to know about the writer's Novella account and
   neither should know where that knowledge comes from:

     - hostedAi.ts needs a fresh session token on every request, and
       asks through getHostedAccess(). The token is handed straight to
       that request; nothing here keeps it.
     - ai/roles.ts decides health and routing synchronously and may
       import nothing, so it is handed a HostedStatus ({ signedIn,
       tier }) through Probe.hosted. hostedStatus() is that answer,
       cached from the last refreshHostedAccount().

   WHY THE DEFAULT SOURCE KNOWS NOTHING. The session belongs to the
   auth store (src/cloud/auth.ts, built as its own item), and it has to
   be the only module that creates the Supabase client: supabaseRemote
   keeps whatever secret store its FIRST caller passed, so a first call
   from here without the keychain would put the refresh token in plain
   browser storage for the rest of the run. So this file never creates
   the client. Until the auth store calls setHostedAccessSource(), the
   answer is "signed out" — which is also the truth, because without it
   there is no way to sign in.

   The mount, once auth.ts exists — a few lines wherever it boots:

     setHostedAccessSource({
       signedIn: () => authStore.getSnapshot().status === "signed-in",
       getHostedAccess: hostedAccess,
       readAccount: async () => { const c = await appClient(); return c ? myAccount(c) : null; },
       onChange: (fn) => authStore.subscribe(fn),
     });

   `signedIn` is there so a signed-out writer never pays for loading
   supabase-js just to be told they are signed out.
   ============================================================ */

import type { HostedAccess, MeterReading } from "./hostedAi";
import type { AccountSummary, Tier } from "./plans";
import type { HostedStatus, HostedTier } from "../ai/roles";

/* roles.ts duplicates Tier because it may not import it. If the two
   ever drift, this line stops compiling rather than a plan quietly
   reading as "not Pro". */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const tiersAgree: Same<Tier, HostedTier> = true;
void tiersAgree;

export interface HostedAccessSource {
  /** Cheap and synchronous. When present and false, nothing else is
      asked — no client is loaded to confirm what is already known. */
  signedIn?(): boolean;
  /** Credentials for one request, or null when signed out. */
  getHostedAccess(): Promise<HostedAccess | null>;
  /** The my_account() summary: tier, allowance, meter. */
  readAccount(): Promise<AccountSummary | null>;
  /** Sign-in, sign-out, account switch. Returns an unsubscribe. */
  onChange?(fn: () => void): () => void;
}

const signedOutSource: HostedAccessSource = {
  signedIn: () => false,
  getHostedAccess: async () => null,
  readAccount: async () => null,
};

let source: HostedAccessSource = signedOutSource;
let account: AccountSummary | null = null;
let status: HostedStatus | undefined;

const listeners = new Set<() => void>();
let unhook: (() => void) | null = null;

function fire(): void {
  for (const l of listeners) l();
}

function hook(): void {
  unhook?.();
  unhook = null;
  if (listeners.size > 0 && source.onChange) unhook = source.onChange(fire);
}

/** Point the seam at the real session. Everything cached from the old
    source is dropped, and listeners are told, so the Connections list
    re-reads the account instead of trusting a stale "signed out". */
export function setHostedAccessSource(next: HostedAccessSource): void {
  source = next;
  account = null;
  status = undefined;
  hook();
  fire();
}

/** For hostedAi's access(). Asked per request so a refreshed token is
    the one sent. */
export async function getHostedAccess(): Promise<HostedAccess | null> {
  if (source.signedIn && !source.signedIn()) return null;
  return source.getHostedAccess();
}

/** undefined until the first refresh lands — roles treats that as
    "untested", and the server's own refusal is the backstop. */
export function hostedStatus(): HostedStatus | undefined {
  return status;
}

export function getHostedTier(): Tier | null {
  return status?.signedIn ? status.tier : null;
}

/** The last account summary read, meter included. For a meter on
    screen; never a reason to skip the server's own check. */
export function hostedAccount(): AccountSummary | null {
  return account;
}

/** Re-read who is signed in and on what plan. Never throws: this runs
    from ready(), and being offline must not stop a local model from
    answering. */
export async function refreshHostedAccount(): Promise<HostedStatus | undefined> {
  const from = source;
  let signedIn: boolean;
  try {
    signedIn = (!from.signedIn || from.signedIn()) && (await from.getHostedAccess()) !== null;
  } catch {
    return status;
  }
  // A source swapped mid-flight has already reset the cache; writing
  // this answer over it would resurrect the old account.
  if (from !== source) return status;

  if (!signedIn) {
    account = null;
    status = { signedIn: false, tier: null };
    return status;
  }

  try {
    const read = await from.readAccount();
    if (from !== source) return status;
    if (read) account = read;
  } catch {
    // Offline or the RPC failed: keep the last known plan rather than
    // flash "Needs Pro" at someone who paid for it.
  }
  status = { signedIn: true, tier: account?.tier ?? null };
  return status;
}

/** hostedAi reports the meter after every finished answer. Kept here
    rather than re-read, so a meter on screen moves without a round
    trip — and not announced to listeners, which would re-read the
    account after every paragraph. */
export function noteHostedMeter(reading: MeterReading): void {
  if (!account) return;
  account = { ...account, aiUsedMicroUsd: reading.usedMicroUsd, aiMonthlyMicroUsd: reading.allowanceMicroUsd };
}

export function onHostedChange(fn: () => void): () => void {
  listeners.add(fn);
  if (!unhook) hook();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      unhook?.();
      unhook = null;
    }
  };
}
