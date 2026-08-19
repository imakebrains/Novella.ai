/* ============================================================
   Roles, connections, and what happens when one is missing.

   The pure half of "Ollama for ideas, Claude for writing, ChatGPT
   for research". Nothing here touches the network, localStorage,
   React or the plugin host — it is data in, decision out, so the
   rules a writer will actually feel (which model answers, what
   happens when the chosen one is asleep, what the card says) can
   be proved in test-roles.ts without a machine that has Ollama
   running on it.

   The impure half — where keys live, how a connection is tested,
   how a provider is built — is plugins/providers/connections.ts.

   One thing stated plainly here because the UI repeats it: there
   is no "sign in with Google" for AI providers. Anthropic and
   OpenAI hand out API keys; the account behind the key may well
   be a Google login on their website, but what Novella holds is a
   key. Ollama needs no account at all. Anything that looked like
   an OAuth button in this app would be a drawing of one.
   ============================================================ */

/* ---------------- what kinds of thing can be connected ---------------- */

export type ProviderKind = "ollama" | "anthropic" | "openai";

export interface ProviderKindInfo {
  kind: ProviderKind;
  /** What the card calls it. */
  label: string;
  /** One line: what this is good at, in a writer's terms. */
  blurb: string;
  /** Whether a key is required before it can answer at all. */
  requiresKey: boolean;
  /** The exact page where the key is issued. Empty when none is needed. */
  keyUrl: string;
  /** What the writer is looking for on that page. */
  keyLabel: string;
  /** The truth about signing in, said out loud in the connect flow. */
  signInNote: string;
  /** What it costs, honestly. */
  costNote: string;
  defaultModel: string;
  defaultBaseUrl: string;
  /** Rough shape of a valid key, used for a warning — never to block. */
  keyPrefix: string;
}

export const PROVIDER_KINDS: ProviderKindInfo[] = [
  {
    kind: "ollama",
    label: "Local models (Ollama)",
    blurb: "Runs on this machine. Offline, private, unlimited.",
    requiresKey: false,
    keyUrl: "",
    keyLabel: "",
    signInNote:
      "No account, no key, no sign-in of any kind. Ollama is a small program that runs on this computer; Novella talks to it over localhost. If it isn't installed yet, the Local AI section below installs it for you.",
    costNote: "Free. Costs electricity and time, nothing else.",
    defaultModel: "llama3.1:8b",
    defaultBaseUrl: "http://localhost:11434",
    keyPrefix: "",
  },
  {
    kind: "anthropic",
    label: "Claude (Anthropic)",
    blurb: "Best prose and long-horizon coherence. Costs per word.",
    requiresKey: true,
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyLabel: "API key (starts with sk-ant-)",
    signInNote:
      "Anthropic gives Novella access through an API key, not a sign-in. Open the console — use whatever login your Anthropic account already has, Google included — press Create Key, and paste it below. The key stays on this machine and is sent only to Anthropic.",
    costNote: "Billed by Anthropic per word, against your own account.",
    defaultModel: "claude-opus-4-8",
    defaultBaseUrl: "https://api.anthropic.com",
    keyPrefix: "sk-ant-",
  },
  {
    kind: "openai",
    label: "ChatGPT & anything OpenAI-compatible",
    blurb: "OpenAI, OpenRouter, Groq, DeepSeek, LM Studio — one shape, many services.",
    requiresKey: true,
    keyUrl: "https://platform.openai.com/api-keys",
    keyLabel: "API key (starts with sk-)",
    signInNote:
      "A ChatGPT Plus subscription is not the same thing as API access — they are separate products with separate bills. Open the API keys page, sign in the way your account works (Google included), press Create new secret key, and paste it below.",
    costNote: "Billed by whichever service you point this at.",
    defaultModel: "gpt-4o-mini",
    defaultBaseUrl: "https://api.openai.com/v1",
    keyPrefix: "sk-",
  },
];

export function kindInfo(kind: ProviderKind): ProviderKindInfo {
  const found = PROVIDER_KINDS.find((k) => k.kind === kind);
  // Unknown kinds can only come from a hand-edited store; treat them as
  // local so nothing is invented about keys or billing.
  return found ?? (PROVIDER_KINDS[0] as ProviderKindInfo);
}

/* The key page differs per service behind the OpenAI-compatible shape.
   Sending someone to platform.openai.com when they typed an OpenRouter
   URL is the kind of small wrongness that ends in "it doesn't work". */
const KEY_PAGES: { host: RegExp; url: string; who: string }[] = [
  { host: /(^|\.)openai\.com$/i, url: "https://platform.openai.com/api-keys", who: "OpenAI" },
  { host: /(^|\.)openrouter\.ai$/i, url: "https://openrouter.ai/keys", who: "OpenRouter" },
  { host: /(^|\.)groq\.com$/i, url: "https://console.groq.com/keys", who: "Groq" },
  { host: /(^|\.)together\.xyz$/i, url: "https://api.together.ai/settings/api-keys", who: "Together" },
  { host: /(^|\.)together\.ai$/i, url: "https://api.together.ai/settings/api-keys", who: "Together" },
  { host: /(^|\.)deepseek\.com$/i, url: "https://platform.deepseek.com/api_keys", who: "DeepSeek" },
  { host: /(^|\.)mistral\.ai$/i, url: "https://console.mistral.ai/api-keys", who: "Mistral" },
];

/** Host of a URL without needing the URL class to be lenient about junk. */
export function hostOf(url: string): string {
  const match = url.trim().match(/^[a-z]+:\/\/([^/:?#]+)/i);
  return match?.[1]?.toLowerCase() ?? "";
}

export function isLocalHost(url: string): boolean {
  const host = hostOf(url);
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "[::1]";
}

/** Where this connection's key is issued, or null when none is needed. */
export function keyPageFor(
  kind: ProviderKind,
  baseUrl = "",
): { url: string; who: string } | null {
  if (kind === "ollama") return null;
  if (kind === "anthropic") return { url: kindInfo("anthropic").keyUrl, who: "Anthropic" };
  if (isLocalHost(baseUrl)) return null; // LM Studio, llama.cpp — no key, no page
  const host = hostOf(baseUrl);
  const hit = KEY_PAGES.find((p) => p.host.test(host));
  return hit ? { url: hit.url, who: hit.who } : { url: kindInfo("openai").keyUrl, who: "OpenAI" };
}

/* ---------------- a connection ---------------- */

/** One linked account or local engine. Serializable and secret-free:
    the key itself lives in the OS keychain, never in this record and
    never in a file Novella writes. */
export interface Connection {
  id: string;
  kind: ProviderKind;
  /** The writer's name for it — "Claude (work)", "Groq". Renameable. */
  label: string;
  model: string;
  /** Endpoint. Optional; the kind's default is used when absent. */
  baseUrl?: string;
}

/** What we know about a connection right now, from the store and the
    last live test. `reachable: null` means nobody has checked. */
export interface Probe {
  hasKey: boolean;
  reachable: boolean | null;
  /** The real message from the last failed test, for the card. */
  detail?: string;
  checkedAt?: number;
}

export type Health = "ready" | "untested" | "needs-key" | "unreachable";

export function connectionHealth(conn: Connection, probe?: Probe): Health {
  if (kindInfo(conn.kind).requiresKey && !probe?.hasKey) return "needs-key";
  if (probe?.reachable === false) return "unreachable";
  if (probe?.reachable === true) return "ready";
  return "untested";
}

/** The words on the card. The owner asked for three states in plain
    English; "untested" is the fourth because pretending an untried key
    is proven would be the same lie in a smaller font. */
export function healthLabel(health: Health): string {
  switch (health) {
    case "ready":
      return "Connected";
    case "untested":
      return "Connected · not tested yet";
    case "needs-key":
      return "Not connected";
    case "unreachable":
      return "Can't reach it";
  }
}

/** Can this connection plausibly answer a request? A key it doesn't have
    is fatal; a failed probe from ten minutes ago is not — laptops sleep,
    daemons restart, and refusing to retry would strand a writer. */
export function usable(health: Health): boolean {
  return health !== "needs-key";
}

/* ---------------- roles ---------------- */

/* Five, because five is the number a writer can hold in their head and
   still tell apart. Each one is a job someone would describe out loud,
   not a temperature preset:

     Drafting   prose that lands in the manuscript — the expensive one
     Ideas      what could happen next, cheap and plentiful
     Research   questions about the world outside the book
     Critique   reading back what's written: notes, continuity, checks
     Quick      one-line jobs: reword, rename, tighten a sentence

   The owner's own example maps onto it exactly: Ollama for Ideas,
   Claude for Drafting, ChatGPT for Research. "Copyright check" lands in
   Critique — it is a reading job, not a writing one. */

export type RoleId = "drafting" | "ideas" | "research" | "critique" | "quick";

export interface RoleDef {
  id: RoleId;
  label: string;
  blurb: string;
  /** Which kind suits this job when nobody has said otherwise. Order
      matters — it is the auto-assignment and the fallback ranking. */
  prefers: ProviderKind[];
}

export const ROLES: RoleDef[] = [
  {
    id: "drafting",
    label: "Drafting",
    blurb: "Prose that goes in the book. Worth the best model you have.",
    prefers: ["anthropic", "openai", "ollama"],
  },
  {
    id: "ideas",
    label: "Ideas & brainstorming",
    blurb: "What happens next, twenty ways. Cheap and plentiful beats perfect.",
    prefers: ["ollama", "openai", "anthropic"],
  },
  {
    id: "research",
    label: "Research",
    blurb: "Questions about the world outside your book.",
    prefers: ["openai", "anthropic", "ollama"],
  },
  {
    id: "critique",
    label: "Critique & editing",
    blurb: "Reading back what you wrote — notes, continuity, checks.",
    prefers: ["anthropic", "openai", "ollama"],
  },
  {
    id: "quick",
    label: "Quick tasks",
    blurb: "Reword a line, name a thing. Speed matters more than depth.",
    prefers: ["ollama", "openai", "anthropic"],
  },
];

/** Callers that pass no role get this one — the old behaviour, named. */
export const DEFAULT_ROLE: RoleId = "drafting";

export function roleDef(id: RoleId): RoleDef {
  return ROLES.find((r) => r.id === id) ?? (ROLES[0] as RoleDef);
}

export function isRoleId(value: unknown): value is RoleId {
  return typeof value === "string" && ROLES.some((r) => r.id === value);
}

/** Role → connection id. A role with no entry follows Drafting, which
    is why a writer who never opens this screen still gets sane answers. */
export type Routing = Partial<Record<RoleId, string>>;

/** Drop assignments pointing at connections that no longer exist, and
    anything that isn't a role. Called on every read of the store, so a
    deleted connection can never strand a role. */
export function normalizeRouting(raw: unknown, connections: Connection[]): Routing {
  const out: Routing = {};
  if (!raw || typeof raw !== "object") return out;
  const ids = new Set(connections.map((c) => c.id));
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isRoleId(key)) continue;
    if (typeof value !== "string" || !ids.has(value)) continue;
    out[key] = value;
  }
  return out;
}

/** A first guess at who does what, from the connections that exist.
    Used when a writer adds their first cloud account: the app proposes
    the arrangement they would have picked, and they can override every
    line of it. */
export function suggestRouting(connections: Connection[]): Routing {
  const out: Routing = {};
  for (const role of ROLES) {
    const pick = role.prefers
      .map((kind) => connections.find((c) => c.kind === kind))
      .find((c): c is Connection => Boolean(c));
    if (pick) out[role.id] = pick.id;
  }
  return out;
}

/** Is this arrangement still the app's own guess, or did the writer
    make it? Only a guess may be revised behind their back. */
export function isSuggestedRouting(current: Routing, connections: Connection[]): boolean {
  const suggested = suggestRouting(connections);
  for (const role of ROLES) {
    if (current[role.id] !== suggested[role.id]) return false;
  }
  return true;
}

/** The routing after a new connection is linked.

    An untouched arrangement is re-derived, so linking Claude actually
    gives Claude the drafting job — a new card that changes nothing is
    the dead end this whole screen exists to remove. An arrangement the
    writer set by hand is left exactly as they left it, and only the
    roles they never filled consider the newcomer. */
export function routingAfterAdding(
  current: Routing,
  before: Connection[],
  after: Connection[],
): Routing {
  if (isSuggestedRouting(current, before)) return suggestRouting(after);
  return { ...suggestRouting(after), ...current };
}

export function assignedConnection(
  role: RoleId,
  routing: Routing,
  connections: Connection[],
): Connection | undefined {
  const id = routing[role];
  return id ? connections.find((c) => c.id === id) : undefined;
}

/* ---------------- resolution ---------------- */

export interface Resolved {
  role: RoleId;
  /** Everything worth trying, best first. Empty means nothing can run. */
  chain: Connection[];
  /** Why the first one was chosen — plain enough to show a person. */
  reason: string;
}

/* The order, and the reasoning behind each step:

     1. What the writer assigned to this role. Their word, first.
     2. What they assigned to Drafting — their main horse, and the one
        they've certainly set up.
     3. Everything else, ranked by what this role prefers, then by
        health, then by the order they were added.

   A connection missing its key never enters the chain: it cannot
   possibly answer. A connection that failed its last test does enter,
   last — the daemon may well be up again by now. */
export function resolveRole(
  role: RoleId,
  routing: Routing,
  connections: Connection[],
  probeOf: (id: string) => Probe | undefined = () => undefined,
): Resolved {
  const healthy = (c: Connection): Health => connectionHealth(c, probeOf(c.id));
  const eligible = connections.filter((c) => usable(healthy(c)));

  const chain: Connection[] = [];
  const push = (c: Connection | undefined): void => {
    if (c && eligible.includes(c) && !chain.includes(c)) chain.push(c);
  };

  const assigned = assignedConnection(role, routing, connections);
  push(assigned);
  if (role !== DEFAULT_ROLE) push(assignedConnection(DEFAULT_ROLE, routing, connections));

  const prefers = roleDef(role).prefers;
  const rank = (c: Connection): number => {
    const byKind = prefers.indexOf(c.kind);
    const kindScore = (byKind === -1 ? prefers.length : byKind) * 10;
    const h = healthy(c);
    const healthScore = h === "ready" ? 0 : h === "untested" ? 1 : 5;
    return kindScore + healthScore;
  };
  const rest = eligible
    .filter((c) => !chain.includes(c))
    .map((c, i) => ({ c, i }))
    // Stable: rank first, original order breaks ties, so the list a
    // writer sees never reshuffles for no reason.
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map((x) => x.c);
  for (const c of rest) push(c);

  const first = chain[0];
  let reason: string;
  if (!first) {
    reason = "Nothing is connected that could answer.";
  } else if (assigned && first === assigned) {
    reason = `${roleDef(role).label} is set to ${first.label}.`;
  } else if (assigned) {
    reason = `${assigned.label} can't run right now — using ${first.label}.`;
  } else {
    reason = `No choice made for ${roleDef(role).label.toLowerCase()} — using ${first.label}.`;
  }

  return { role, chain, reason };
}

/** "Claude, then Ollama" — the fallback order in one line, for the card. */
export function describeChain(resolved: Resolved): string {
  if (resolved.chain.length === 0) return "nothing available";
  return resolved.chain.map((c) => c.label).join(", then ");
}

/** What to tell a writer when nothing at all can run. Never a stack
    trace, always the next thing to press. */
export function noConnectionMessage(connections: Connection[]): string {
  if (connections.length === 0) {
    return "No AI is connected yet. Settings → Connections adds one — the local option (Ollama) is free, needs no account, and works offline.";
  }
  const missing = connections
    .filter((c) => kindInfo(c.kind).requiresKey)
    .map((c) => c.label);
  if (missing.length > 0) {
    return `${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} waiting for an API key. Settings → Connections, then paste it in. Your writing is untouched.`;
  }
  return "No connection can answer right now. Settings → Connections shows which one is unhappy. Your writing is untouched.";
}

/** The sentence shown when a fallback actually fired. Writers forgive a
    substitution; they do not forgive a silent one. */
export function fallbackNote(from: Connection, to: Connection, why: string): string {
  return `${from.label} couldn't answer (${why.replace(/\s+/g, " ").trim()}) — ${to.label} did instead.`;
}

/* ---------------- editing a connection ---------------- */

export interface ConnectionDraft {
  kind: ProviderKind;
  label: string;
  model: string;
  baseUrl: string;
}

export function defaultDraft(kind: ProviderKind, existing: Connection[] = []): ConnectionDraft {
  const info = kindInfo(kind);
  return {
    kind,
    label: uniqueLabel(shortName(kind), existing.map((c) => c.label)),
    model: info.defaultModel,
    baseUrl: info.defaultBaseUrl,
  };
}

function shortName(kind: ProviderKind): string {
  return kind === "ollama" ? "Local" : kind === "anthropic" ? "Claude" : "ChatGPT";
}

/** "Claude", then "Claude 2" — a second account of the same service is
    the normal case here, not an edge one. */
export function uniqueLabel(base: string, taken: string[]): string {
  const trimmed = base.trim() || "Connection";
  if (!taken.includes(trimmed)) return trimmed;
  for (let n = 2; n < 500; n++) {
    const candidate = `${trimmed} ${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${trimmed} ${Date.now()}`;
}

/** Ids are stable and never shown. The three seeded ones keep their
    historical names so an upgrade doesn't orphan anyone's settings. */
export function newConnectionId(taken: string[], kind: ProviderKind, seed = 0): string {
  const base = kind === "ollama" ? "local" : kind === "anthropic" ? "claude" : "custom";
  if (!taken.includes(base)) return base;
  for (let n = seed + 2; n < 10_000; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}-${taken.length + 1}`;
}

/** Problems worth blocking a save for, in the words a writer would use.
    Everything else is a warning — see keyWarning. */
export function validateDraft(
  draft: ConnectionDraft,
  others: Connection[],
): string[] {
  const problems: string[] = [];
  if (!draft.label.trim()) problems.push("Give it a name so you can tell it apart later.");
  if (others.some((c) => c.label.trim().toLowerCase() === draft.label.trim().toLowerCase())) {
    problems.push("Another connection already has that name.");
  }
  if (!draft.model.trim()) problems.push("Pick a model — Test connection lists what this account offers.");
  const url = draft.baseUrl.trim();
  if (draft.kind !== "anthropic") {
    if (!url) problems.push("An address is needed, like https://api.openai.com/v1.");
    else if (!/^https?:\/\//i.test(url)) problems.push("The address has to start with http:// or https://.");
    else if (draft.kind === "openai" && !isLocalHost(url) && !/^https:\/\//i.test(url)) {
      // The provider refuses this at call time too; saying so here means
      // the writer finds out before they trust it with a chapter.
      problems.push("Only https:// for a service on the internet — your key and your book travel over that line.");
    }
  }
  return problems;
}

/** A pasted key that obviously belongs to a different service. Warned
    about, never blocked: prefixes change, and being wrong about that
    should cost a sentence, not a working setup. */
export function keyWarning(kind: ProviderKind, key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  if (/\s/.test(trimmed)) return "That has a space in it — keys don't. Check the paste.";
  const prefix = kindInfo(kind).keyPrefix;
  if (kind === "anthropic" && !trimmed.startsWith(prefix)) {
    return "Anthropic keys start with sk-ant-. This looks like a key for something else.";
  }
  if (kind === "openai" && trimmed.startsWith("sk-ant-")) {
    return "That's an Anthropic key. Connect it as Claude instead.";
  }
  if (kind === "openai" && !trimmed.startsWith("sk-") && !trimmed.startsWith("gsk_")) {
    return "Most OpenAI-compatible keys start with sk-. Worth a second look before you rely on it.";
  }
  return null;
}

/** For display only. The full key is never rendered, never logged, and
    never leaves the keychain except in the request to its own provider. */
export function maskKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "••••";
  return `${trimmed.slice(0, 6)}••••${trimmed.slice(-4)}`;
}

/* ---------------- upgrading an existing setup ---------------- */

/** What the old world looked like: three plugins, one active slash. */
export interface LegacySetup {
  activeSlash: string;
  ollamaEnabled: boolean;
  ollamaModel?: string;
  anthropicEnabled: boolean;
  anthropicModel?: string;
  anthropicHasKey: boolean;
  customEnabled: boolean;
  customBaseUrl?: string;
  customModel?: string;
  customHasKey: boolean;
}

/** Turn a pre-roles install into connections plus a routing table.
    Run once, when no connections file exists.

    Ollama is always seeded even when the plugin was off: it needs no
    key, it is the reason the app works offline, and a writer arriving
    at this screen for the first time should find something already
    there rather than an empty box. */
export function migrateLegacy(legacy: LegacySetup): {
  connections: Connection[];
  routing: Routing;
} {
  const connections: Connection[] = [
    {
      id: "local",
      kind: "ollama",
      label: "Local (Ollama)",
      model: legacy.ollamaModel?.trim() || kindInfo("ollama").defaultModel,
      baseUrl: kindInfo("ollama").defaultBaseUrl,
    },
  ];

  if (legacy.anthropicEnabled || legacy.anthropicHasKey) {
    connections.push({
      id: "claude",
      kind: "anthropic",
      label: "Claude",
      model: legacy.anthropicModel?.trim() || kindInfo("anthropic").defaultModel,
      baseUrl: kindInfo("anthropic").defaultBaseUrl,
    });
  }

  if (legacy.customEnabled || legacy.customHasKey || legacy.customBaseUrl) {
    connections.push({
      id: "custom",
      kind: "openai",
      label: "ChatGPT & compatible",
      model: legacy.customModel?.trim() || kindInfo("openai").defaultModel,
      baseUrl: legacy.customBaseUrl?.trim() || kindInfo("openai").defaultBaseUrl,
    });
  }

  const routing = suggestRouting(connections);

  // Whatever they had selected keeps writing the book — the one setting
  // they definitely chose on purpose.
  const bySlash: Record<string, string> = { "/local": "local", "/claude": "claude", "/custom": "custom" };
  const wasActive = bySlash[legacy.activeSlash];
  if (wasActive && connections.some((c) => c.id === wasActive)) {
    routing.drafting = wasActive;
  }

  return { connections, routing };
}

/** Guard for anything read back off disk. A hand-edited or half-written
    store must not take the app down. */
export function parseConnections(raw: unknown): Connection[] {
  if (!Array.isArray(raw)) return [];
  const out: Connection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const id = typeof c.id === "string" ? c.id : "";
    const kind = c.kind;
    if (!id || (kind !== "ollama" && kind !== "anthropic" && kind !== "openai")) continue;
    if (out.some((existing) => existing.id === id)) continue;
    out.push({
      id,
      kind,
      label: typeof c.label === "string" && c.label.trim() ? c.label : shortName(kind),
      model: typeof c.model === "string" ? c.model : kindInfo(kind).defaultModel,
      baseUrl: typeof c.baseUrl === "string" ? c.baseUrl : kindInfo(kind).defaultBaseUrl,
    });
  }
  return out;
}
