/* Assertions for Novella AI as a connection — the Pro plan's built-in
   model sitting in the role router beside Local, Claude and ChatGPT.

   Silent unless something is wrong, non-zero exit when it is.

   What it pins down:
     - the kind itself, and that it asks for no key and draws no OAuth
     - health from the injected account status (signed out, not Pro,
       not known yet) — roles.ts stays import-free, so the status is
       handed in through Probe.hosted
     - where it ranks, and that a hand-set routing is never overridden
     - THE 402 PATH: a spent allowance throws the server's own sentence
       before any text arrives, the next connection answers, and the
       note the writer sees names both
     - the once-per-account seeding decision
     - the hostedAccess seam: a fake source in, the right status out,
       and no token kept or logged */

import { readFileSync } from "node:fs";
import {
  PROVIDER_KINDS,
  ROLES,
  connectionHealth,
  defaultDraft,
  fallbackNote,
  healthLabel,
  keyPageFor,
  kindInfo,
  newConnectionId,
  parseConnections,
  resolveRole,
  roleDef,
  routingAfterAdding,
  shouldSeedHostedConnection,
  suggestRouting,
  usable,
  validateDraft,
  type Connection,
  type Probe,
} from "./src/ai/roles";
import { makeHostedProvider, type HostedAccess } from "./src/cloud/hostedAi";
import {
  getHostedAccess,
  getHostedTier,
  hostedAccount,
  hostedStatus,
  noteHostedMeter,
  onHostedChange,
  refreshHostedAccount,
  setHostedAccessSource,
  type HostedAccessSource,
} from "./src/cloud/hostedAccess";
import type { AccountSummary } from "./src/cloud/plans";
import type { StreamingAIProvider } from "./src/plugins/runtime";
import { checkAllowance } from "./supabase/functions/_shared/aiCore";

let failures = 0;
let checks = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

function ok(name: string, condition: boolean): void {
  checks++;
  if (!condition) {
    failures++;
    console.error(`FAIL  ${name}`);
  }
}

/* ---------- fixtures ---------- */

const local: Connection = {
  id: "local",
  kind: "ollama",
  label: "Local (Ollama)",
  model: "llama3.1:8b",
  baseUrl: "http://localhost:11434",
};
const claude: Connection = {
  id: "claude",
  kind: "anthropic",
  label: "Claude",
  model: "claude-opus-4-8",
  baseUrl: "https://api.anthropic.com",
};
const novella: Connection = { id: "novella", kind: "novella", label: "Novella AI", model: "built-in", baseUrl: "" };

function probes(state: Record<string, Partial<Probe>>): (id: string) => Probe | undefined {
  return (id) => {
    const p = state[id];
    if (!p) return undefined;
    return { hasKey: p.hasKey ?? true, reachable: p.reachable ?? null, detail: p.detail, hosted: p.hosted };
  };
}

const PRO = { signedIn: true, tier: "pro" } as const;

/* The server's real sentences, from the function's own pure check, so
   a reworded refusal there can't leave this suite proving a stale one. */
const spentCheck = checkAllowance({ tier: "pro", aiMonthlyMicroUsd: 1_000_000, aiUsedMicroUsd: 1_000_000 });
const SPENT = spentCheck.ok ? "" : spentCheck.message;
const notProCheck = checkAllowance({ tier: "free", aiMonthlyMicroUsd: 0, aiUsedMicroUsd: 0 });

/* ---------- A. the kind ---------- */

{
  const info = kindInfo("novella");
  check("kind: Novella AI exists", info.kind, "novella");
  ok("kind: listed with the others", PROVIDER_KINDS.some((k) => k.kind === "novella"));
  check("kind: needs no key", info.requiresKey, false);
  check("kind: no key page", keyPageFor("novella"), null);
  check("kind: no key page even with an address", keyPageFor("novella", "https://abc.supabase.co"), null);
  ok("kind: says it is included with Pro", /pro/i.test(info.costNote) && /pro/i.test(info.blurb));
  ok(
    "kind: honesty — never offers an OAuth button",
    !/sign in with google|continue with google|connect with google|oauth/i.test(`${info.blurb} ${info.signInNote} ${info.keyLabel}`),
  );
  ok("kind: says the key is not on this machine", /never on this machine/i.test(info.signInNote));
  ok("kind: says what happens when the allowance is spent", /other connections answer/i.test(info.signInNote));

  check("draft: label", defaultDraft("novella", []).label, "Novella AI");
  check("draft: a second card is numbered", defaultDraft("novella", [novella]).label, "Novella AI 2");
  check("draft: no address", defaultDraft("novella", []).baseUrl, "");
  check("id: stable name", newConnectionId([], "novella"), "novella");
  check("id: a second one", newConnectionId(["novella"], "novella"), "novella-2");
  check("validate: no address needed", validateDraft({ kind: "novella", label: "N", model: "built-in", baseUrl: "" }, []), []);
  check(
    "parse: the kind survives disk",
    parseConnections([{ id: "novella", kind: "novella", label: "Novella AI" }]).map((c) => c.kind),
    ["novella"],
  );
  check("parse: a nameless card gets its short name", parseConnections([{ id: "n", kind: "novella" }])[0]?.label, "Novella AI");
}

/* ---------- B. health from the injected status ---------- */

{
  check(
    "health: unknown status is untested, not a refusal",
    connectionHealth(novella, { hasKey: false, reachable: null }),
    "untested",
  );
  check("health: no probe at all", connectionHealth(novella), "untested");
  check(
    "health: signed out",
    connectionHealth(novella, { hasKey: false, reachable: null, hosted: { signedIn: false, tier: null } }),
    "needs-signin",
  );
  check(
    "health: Free needs Pro",
    connectionHealth(novella, { hasKey: false, reachable: null, hosted: { signedIn: true, tier: "free" } }),
    "needs-pro",
  );
  check(
    "health: Plus needs Pro",
    connectionHealth(novella, { hasKey: false, reachable: null, hosted: { signedIn: true, tier: "plus" } }),
    "needs-pro",
  );
  check(
    "health: signed in but the account couldn't be read",
    connectionHealth(novella, { hasKey: false, reachable: null, hosted: { signedIn: true, tier: null } }),
    "needs-pro",
  );
  check("health: Pro, untested", connectionHealth(novella, { hasKey: false, reachable: null, hosted: PRO }), "untested");
  check("health: Pro, tested", connectionHealth(novella, { hasKey: false, reachable: true, hosted: PRO }), "ready");
  check(
    "health: Pro but the servers didn't answer",
    connectionHealth(novella, { hasKey: false, reachable: false, hosted: PRO }),
    "unreachable",
  );
  // The status only means anything for the built-in kind.
  check(
    "health: other kinds ignore the account",
    connectionHealth(local, { hasKey: false, reachable: true, hosted: { signedIn: false, tier: null } }),
    "ready",
  );

  ok("health: needs-pro is not usable", !usable("needs-pro"));
  ok("health: needs-signin is not usable", !usable("needs-signin"));
  ok("health: the old states are unchanged", usable("ready") && usable("untested") && usable("unreachable") && !usable("needs-key"));
  ok("labels: needs-pro says so", /pro/i.test(healthLabel("needs-pro")));
  ok("labels: needs-signin says sign in", /sign in/i.test(healthLabel("needs-signin")));
  ok("labels: needs-signin is not 'Connected'", !/^connected/i.test(healthLabel("needs-signin")));
}

/* ---------- C. routing ---------- */

{
  check(
    "routing: a Pro writer with only Local and Novella drafts with Novella",
    suggestRouting([local, novella]).drafting,
    "novella",
  );
  check("routing: ideas still go local first", suggestRouting([local, novella]).ideas, "local");
  check("routing: quick jobs still go local first", suggestRouting([local, novella]).quick, "local");
  check("routing: research falls to Novella without ChatGPT", suggestRouting([local, novella]).research, "novella");
  check("routing: a Claude key still outranks the built-in for prose", suggestRouting([local, novella, claude]).drafting, "claude");
  check("routing: and for critique", suggestRouting([local, novella, claude]).critique, "claude");

  for (const role of ROLES) {
    ok(`roles: ${role.id} ranks the built-in kind`, roleDef(role.id).prefers.includes("novella"));
    // Second, behind whatever the job was built around.
    check(`roles: ${role.id} ranks it second`, roleDef(role.id).prefers.indexOf("novella"), 1);
  }

  check(
    "routing: adding Novella to an untouched setup hands it drafting",
    routingAfterAdding(suggestRouting([local]), [local], [local, novella]).drafting,
    "novella",
  );

  /* A table the writer set by hand. It must differ from the app's own
     guess for [local, claude] — which gives drafting to Claude — or it
     would read as untouched and be re-derived. */
  const handSet = { drafting: "local", ideas: "local", research: "local", critique: "local", quick: "local" };
  ok("routing: the hand-set fixture really isn't the suggestion", suggestRouting([local, claude]).drafting !== "local");
  check(
    "routing: a hand-set arrangement is left alone",
    routingAfterAdding(handSet, [local, claude], [local, claude, novella]).drafting,
    "local",
  );
  // A role the writer never filled considers the newcomer, ranked as usual.
  check(
    "routing: an unfilled role picks the best kind, and Claude outranks the built-in",
    routingAfterAdding({ ideas: "local" }, [local, claude], [local, claude, novella]).drafting,
    "claude",
  );
  check(
    "routing: an unfilled role with no Claude takes the built-in",
    routingAfterAdding({ ideas: "local" }, [local], [local, novella]).drafting,
    "novella",
  );

  // A Free account's card never enters the chain, and the reason says so.
  const freeProbes = probes({
    novella: { hasKey: false, reachable: null, hosted: { signedIn: true, tier: "free" } },
    claude: { hasKey: true, reachable: true },
  });
  const free = resolveRole("drafting", { drafting: "novella" }, [novella, claude], freeProbes);
  check("chain: a Free account's Novella card never enters the chain", free.chain.map((c) => c.id), ["claude"]);
  check("chain: the reason names the swap", free.reason, "Novella AI can't run right now — using Claude.");

  const signedOut = resolveRole(
    "drafting",
    { drafting: "novella" },
    [novella, local],
    probes({ novella: { hasKey: false, reachable: null, hosted: { signedIn: false, tier: null } }, local: { hasKey: false } }),
  );
  check("chain: signed out, the local engine answers", signedOut.chain.map((c) => c.id), ["local"]);
}

/* ---------- D. the 402 path ---------- */

/* A copy of the fallback loop in src/ai/generate.ts (the chain walk,
   firstFailure, the `streamed` guard, whyFailed's truncation). Copied
   rather than imported because generate.ts pulls in the plugin host,
   React and storage; if that loop changes, this copy must change with
   it. What is real here is everything either side of it: the hosted
   provider, the server's sentence, and roles' chain and note. */
function whyFailed(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > 90 ? `${message.slice(0, 87)}…` : message;
}

async function runChain(
  chain: Connection[],
  providerFor: (c: Connection) => StreamingAIProvider,
  onChunk: (text: string) => void,
): Promise<{ text: string; note: string | null; errors: string[] }> {
  let streamed = false;
  const watched = (text: string) => {
    streamed = true;
    onChunk(text);
  };
  let firstFailure: { conn: Connection; why: string } | null = null;
  const errors: string[] = [];
  let lastError: unknown;
  for (const conn of chain) {
    try {
      const text = await providerFor(conn).generateStream({ system: "s", prompt: "p" }, watched);
      return { text, note: firstFailure ? fallbackNote(firstFailure.conn, conn, firstFailure.why) : null, errors };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      lastError = err;
      firstFailure ??= { conn, why: whyFailed(err) };
      if (streamed) throw err;
    }
  }
  throw lastError;
}

function stubProvider(text: string): StreamingAIProvider {
  return {
    slash: "/stub",
    async generate() {
      return text;
    },
    async generateStream(_req, onChunk) {
      onChunk(text);
      return text;
    },
  };
}

const ACCESS: HostedAccess = { url: "https://abc.supabase.co", anonKey: "pub", token: "jwt" };

async function the402Path(): Promise<void> {
  ok("402: the server really answers 402 for a spent allowance", !spentCheck.ok && spentCheck.status === 402);
  ok("402: and its sentence is the allowance one", /allowance is used up/.test(SPENT));

  const resolved = resolveRole(
    "drafting",
    { drafting: "novella" },
    [novella, claude],
    probes({ novella: { hasKey: false, reachable: true, hosted: PRO }, claude: { hasKey: true, reachable: true } }),
  );
  check("402: Novella first, Claude behind it", resolved.chain.map((c) => c.id), ["novella", "claude"]);
  check("402: chosen because the writer chose it", resolved.reason, "Drafting is set to Novella AI.");

  const spent = makeHostedProvider({
    access: async () => ACCESS,
    fetchImpl: (async () => new Response(JSON.stringify({ message: SPENT }), { status: 402 })) as unknown as typeof fetch,
  });
  const chunks: string[] = [];
  const result = await runChain(resolved.chain, (c) => (c.kind === "novella" ? spent : stubProvider("prose")), (t) =>
    chunks.push(t),
  );

  check("402: the first connection throws the server's sentence", result.errors[0], SPENT);
  check("402: the chain answers from the next connection", result.text, "prose");
  check("402: only the answer reached the editor", chunks, ["prose"]);
  const note = result.note ?? "";
  ok("402: the note names Novella AI", note.startsWith("Novella AI couldn't answer ("));
  ok("402: and Claude", note.endsWith("— Claude did instead."));
  ok("402: the note carries the allowance sentence, even truncated", note.includes("allowance is used up"));
  ok("402: the long sentence was truncated the way generate.ts does it", note.includes("…)"));
  check("402: fallbackNote wording, untruncated", fallbackNote(novella, claude, SPENT), `Novella AI couldn't answer (${SPENT}) — Claude did instead.`);

  // The no-chunk guarantee generate.ts's `streamed` guard depends on: a
  // refusal arrives before any text, so the swap is allowed.
  let onChunkCalls = 0;
  let threw = "";
  try {
    await spent.generateStream({ system: "", prompt: "p" }, () => onChunkCalls++);
  } catch (err) {
    threw = err instanceof Error ? err.message : String(err);
  }
  check("402: nothing streamed before the refusal", onChunkCalls, 0);
  check("402: the thrown message is exactly the server's", threw, SPENT);

  // Not Pro: the server's 403 falls through the same way.
  const notPro = makeHostedProvider({
    access: async () => ACCESS,
    fetchImpl: (async () =>
      new Response(JSON.stringify({ message: notProCheck.ok ? "" : notProCheck.message }), { status: 403 })) as unknown as typeof fetch,
  });
  const viaLocal = await runChain([novella, local], (c) => (c.kind === "novella" ? notPro : stubProvider("idea")), () => {});
  check("403: the local engine answers", viaLocal.text, "idea");
  ok("403: the note says Pro", /part of Pro/.test(viaLocal.note ?? ""));

  // Signed out with the provider built anyway: no request is sent.
  let fetched = 0;
  const noSession = makeHostedProvider({
    access: async () => null,
    fetchImpl: (async () => {
      fetched++;
      return new Response("{}");
    }) as unknown as typeof fetch,
  });
  const viaClaude = await runChain([novella, claude], (c) => (c.kind === "novella" ? noSession : stubProvider("prose")), () => {});
  check("signed out: nothing was sent", fetched, 0);
  ok("signed out: the note says sign in", /Sign in to use Novella AI/.test(viaClaude.note ?? ""));
}

/* ---------- E. seeding, the pure decision ---------- */

{
  ok("seed: a signed-in Pro account gets the card", shouldSeedHostedConnection(PRO, [local], false));
  ok("seed: never twice", !shouldSeedHostedConnection(PRO, [local, novella], false));
  ok(
    "seed: a renamed card still counts",
    !shouldSeedHostedConnection(PRO, [local, { ...novella, label: "House model" }], false),
  );
  ok("seed: the flag wins even when the card is gone (they deleted it)", !shouldSeedHostedConnection(PRO, [local], true));
  ok("seed: not for Plus", !shouldSeedHostedConnection({ signedIn: true, tier: "plus" }, [], false));
  ok("seed: not for Free", !shouldSeedHostedConnection({ signedIn: true, tier: "free" }, [], false));
  ok("seed: not when the plan couldn't be read", !shouldSeedHostedConnection({ signedIn: true, tier: null }, [], false));
  ok("seed: not signed out", !shouldSeedHostedConnection({ signedIn: false, tier: null }, [], false));
  ok("seed: not before the status is known", !shouldSeedHostedConnection(undefined, [], false));

  // What the seeded card looks like: the draft ensureHostedConnection adds.
  const draft = defaultDraft("novella", [local]);
  check("seed: the card it would add", [draft.kind, draft.label, draft.model], ["novella", "Novella AI", "built-in"]);
  check("seed: and it validates", validateDraft(draft, [local]), []);
}

/* ---------- F. the hostedAccess seam ---------- */

function account(tier: "free" | "plus" | "pro"): AccountSummary {
  return {
    tier,
    status: "active",
    currentPeriodEnd: null,
    maxProjects: null,
    maxBytes: 1,
    aiMonthlyMicroUsd: tier === "pro" ? 5_000_000 : 0,
    projects: 0,
    bytesUsed: 0,
    aiUsedMicroUsd: 0,
  };
}

async function theSeam(): Promise<void> {
  // Before anything is plugged in: signed out, which is the truth on a
  // build with no auth store.
  check("seam: nothing known before the first look", hostedStatus(), undefined);
  check("seam: the default source is signed out", await refreshHostedAccount(), { signedIn: false, tier: null });
  check("seam: no credentials by default", await getHostedAccess(), null);
  check("seam: no tier by default", getHostedTier(), null);

  let signedIn = true;
  let tier: "free" | "plus" | "pro" = "pro";
  let accessCalls = 0;
  let accountFails = false;
  let changed: (() => void) | null = null;
  let unhooked = 0;
  const source: HostedAccessSource = {
    signedIn: () => signedIn,
    getHostedAccess: async () => {
      accessCalls++;
      return signedIn ? ACCESS : null;
    },
    readAccount: async () => {
      if (accountFails) throw new Error("offline");
      return account(tier);
    },
    onChange: (fn) => {
      changed = fn;
      return () => {
        unhooked++;
        changed = null;
      };
    },
  };

  let heard = 0;
  const stop = onHostedChange(() => heard++);
  setHostedAccessSource(source);
  ok("seam: plugging a source in tells the listeners", heard === 1);
  check("seam: the cache is reset on plug-in", hostedStatus(), undefined);
  check("seam: a Pro account reads as Pro", await refreshHostedAccount(), PRO);
  check("seam: the tier getter agrees", getHostedTier(), "pro");
  check("seam: credentials pass through", (await getHostedAccess())?.token, "jwt");

  accountFails = true;
  check("seam: offline keeps the last known plan", await refreshHostedAccount(), PRO);
  accountFails = false;

  tier = "plus";
  check("seam: a downgrade shows on the next look", (await refreshHostedAccount())?.tier, "plus");
  tier = "pro";
  await refreshHostedAccount();

  noteHostedMeter({ usedMicroUsd: 1_234, allowanceMicroUsd: 5_000_000 });
  check("seam: the meter moves without a round trip", hostedAccount()?.aiUsedMicroUsd, 1_234);
  ok("seam: and without waking the listeners", heard === 1);

  (changed as (() => void) | null)?.();
  ok("seam: an auth change reaches the listeners", heard === 2);

  signedIn = false;
  const before = accessCalls;
  check("seam: signing out reads as signed out", await refreshHostedAccount(), { signedIn: false, tier: null });
  check("seam: without asking for credentials", accessCalls, before);
  check("seam: the account is forgotten", hostedAccount(), null);
  check("seam: a signed-out request gets no credentials", await getHostedAccess(), null);
  check("seam: and no tier", getHostedTier(), null);

  // A source swapped while a refresh is in flight must not have the old
  // answer written over the new one's blank slate.
  signedIn = true;
  let release: () => void = () => {};
  const slow: HostedAccessSource = {
    getHostedAccess: () => new Promise((resolve) => (release = () => resolve(ACCESS))),
    readAccount: async () => account("pro"),
  };
  setHostedAccessSource(slow);
  const inFlight = refreshHostedAccount();
  setHostedAccessSource({ getHostedAccess: async () => null, readAccount: async () => null });
  release();
  await inFlight;
  check("seam: a stale refresh doesn't resurrect the old account", hostedStatus(), undefined);

  stop();
  ok("seam: the last listener leaving unhooks the source", unhooked >= 1);

  // The real provider, fed by the seam: the token goes in the header of
  // the one request and nowhere else.
  setHostedAccessSource(source);
  let auth = "";
  const provider = makeHostedProvider({
    access: getHostedAccess,
    fetchImpl: (async (_url: string, init: RequestInit) => {
      auth = String((init.headers as Record<string, string>).Authorization);
      return new Response(JSON.stringify({ message: SPENT }), { status: 402 });
    }) as unknown as typeof fetch,
  });
  try {
    await provider.generate({ system: "", prompt: "p" });
  } catch {
    // the 402 is the point of the section above; here only the header matters
  }
  check("seam: the token rides in the request's header", auth, "Bearer jwt");

  /* Source guards. The comments name the storage this file avoids, so
     scan the code, not the prose — except for the client-creation
     guard, which test-account.ts runs over the raw text. */
  const raw = readFileSync(new URL("./src/cloud/hostedAccess.ts", import.meta.url), "utf8");
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  ok("hostedAccess: never logs", !/\bconsole\s*\.\s*(log|warn|error|info|debug)\b/.test(code));
  ok("hostedAccess: never touches browser storage directly", !/\b(localStorage|sessionStorage)\b/.test(code));
  ok("hostedAccess: the token is not cached in a module variable", !/^(let|const|var)\s+\w*token/im.test(code));
  ok("hostedAccess: never creates the Supabase client itself", !/cloudClient\(/.test(raw));
  ok("hostedAccess: no runtime imports, so it loads without a browser", !/^import\s+(?!type\b)/m.test(code));

  const conns = readFileSync(new URL("./src/plugins/providers/connections.ts", import.meta.url), "utf8");
  ok("connections: never creates the Supabase client itself", !/cloudClient\(/.test(conns));
}

/* ---------- run ---------- */

await the402Path();
await theSeam();

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`novellaai tests: ${checks} checks passed`);
