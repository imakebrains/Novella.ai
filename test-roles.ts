/* Assertions for connections and per-role routing.

   Same shape as test-tour.ts and test-tabs.ts: silent unless something
   is wrong, non-zero exit when it is.

   Why this file exists. The promise the roles feature makes is not
   "there is a dropdown" — it is that a writer who says "Ollama for
   ideas, Claude for writing, ChatGPT for research" gets exactly that,
   and that when one of the three is asleep the work does not stop and
   nobody is lied to about which model answered. That promise is a set
   of ordering rules, and ordering rules are precisely what goes quietly
   wrong when a laptop is offline and a demo is not.

   Everything here runs with no network, no browser and no Ollama: the
   rules live in src/ai/roles.ts as data-in / decision-out, and the
   probe state arrives as a plain function. */

import { readFileSync } from "node:fs";

import {
  DEFAULT_ROLE,
  PROVIDER_KINDS,
  ROLES,
  connectionHealth,
  defaultDraft,
  describeChain,
  fallbackNote,
  healthLabel,
  hostOf,
  isLocalHost,
  isRoleId,
  isSuggestedRouting,
  keyPageFor,
  keyWarning,
  kindInfo,
  maskKey,
  migrateLegacy,
  newConnectionId,
  noConnectionMessage,
  normalizeRouting,
  parseConnections,
  resolveRole,
  roleDef,
  routingAfterAdding,
  suggestRouting,
  uniqueLabel,
  usable,
  validateDraft,
  type Connection,
  type Probe,
  type ProviderKind,
  type Routing,
} from "./src/ai/roles";

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
const chatgpt: Connection = {
  id: "custom",
  kind: "openai",
  label: "ChatGPT",
  model: "gpt-4o-mini",
  baseUrl: "https://api.openai.com/v1",
};
const all = [local, claude, chatgpt];

/** A probe table built from ids, so a test reads like the situation it
    describes rather than like a mock. */
function probes(state: Record<string, Partial<Probe>>): (id: string) => Probe | undefined {
  return (id) => {
    const p = state[id];
    if (!p) return undefined;
    return { hasKey: p.hasKey ?? true, reachable: p.reachable ?? null, detail: p.detail };
  };
}

/** Everything works — the happy machine. */
const allWell = probes({
  local: { hasKey: false, reachable: true },
  claude: { hasKey: true, reachable: true },
  custom: { hasKey: true, reachable: true },
});

/* ---------- the kinds, and the honesty rule ---------- */

{
  check("kinds: three of them", PROVIDER_KINDS.length, 3);

  const kinds = PROVIDER_KINDS.map((k) => k.kind);
  check("kinds: no duplicates", new Set(kinds).size, kinds.length);

  for (const info of PROVIDER_KINDS) {
    ok(`kinds: ${info.kind} has a label`, info.label.trim().length > 0);
    ok(`kinds: ${info.kind} says what it's for`, info.blurb.trim().length > 10);
    ok(`kinds: ${info.kind} says what it costs`, info.costNote.trim().length > 0);
    ok(`kinds: ${info.kind} names a default model`, info.defaultModel.trim().length > 0);
    // The connect flow is a walkthrough; a kind with nothing to say
    // there is a dead end with a nice border.
    ok(`kinds: ${info.kind} explains signing in`, info.signInNote.trim().length > 60);

    if (info.requiresKey) {
      ok(`kinds: ${info.kind} links its key page`, info.keyUrl.startsWith("https://"));
      ok(`kinds: ${info.kind} says what to look for`, info.keyLabel.trim().length > 0);
    } else {
      check(`kinds: ${info.kind} asks for no key page`, info.keyUrl, "");
    }
  }

  check("kinds: local needs no key", kindInfo("ollama").requiresKey, false);
  ok("kinds: Claude needs a key", kindInfo("anthropic").requiresKey);
  ok("kinds: ChatGPT needs a key", kindInfo("openai").requiresKey);

  /* THE HONESTY TEST. The owner asked for "connect via google account".
     No such thing exists for these APIs, and the one failure mode that
     would actually damage trust is a button implying it does. Nothing
     here may promise a sign-in inside Novella. */
  for (const info of PROVIDER_KINDS) {
    const text = `${info.blurb} ${info.signInNote} ${info.keyLabel}`.toLowerCase();
    ok(
      `honesty: ${info.kind} never offers an OAuth button`,
      !/sign in with google|continue with google|connect with google|oauth/.test(text),
    );
  }
  ok(
    "honesty: Claude's note says the key is what Novella holds",
    /api key/i.test(kindInfo("anthropic").signInNote),
  );
  ok(
    "honesty: ChatGPT's note separates a Plus subscription from API access",
    /subscription/i.test(kindInfo("openai").signInNote),
  );
  ok(
    "honesty: the local engine promises no account",
    /no account/i.test(kindInfo("ollama").signInNote),
  );

  // An unknown kind off a hand-edited store must not invent a key page
  // or a bill.
  check("kinds: junk falls back to local", kindInfo("nonsense" as ProviderKind).kind, "ollama");
}

/* ---------- addresses ---------- */

{
  check("host: plain", hostOf("https://api.openai.com/v1"), "api.openai.com");
  check("host: port stripped", hostOf("http://localhost:11434"), "localhost");
  check("host: case folded", hostOf("HTTPS://API.OpenAI.COM/v1"), "api.openai.com");
  check("host: junk is empty", hostOf("not a url"), "");

  ok("local: localhost", isLocalHost("http://localhost:1234/v1"));
  ok("local: 127.0.0.1", isLocalHost("http://127.0.0.1:8080/v1"));
  ok("local: a real service is not local", !isLocalHost("https://api.groq.com/openai/v1"));
}

/* ---------- where the key comes from ---------- */

{
  check("keypage: nothing to fetch for a local engine", keyPageFor("ollama"), null);
  check("keypage: Anthropic", keyPageFor("anthropic")?.url, "https://console.anthropic.com/settings/keys");
  check(
    "keypage: OpenAI",
    keyPageFor("openai", "https://api.openai.com/v1")?.url,
    "https://platform.openai.com/api-keys",
  );
  // Sending an OpenRouter user to OpenAI's key page is the small
  // wrongness that ends in "it doesn't work".
  check(
    "keypage: OpenRouter gets its own page",
    keyPageFor("openai", "https://openrouter.ai/api/v1")?.who,
    "OpenRouter",
  );
  check("keypage: Groq", keyPageFor("openai", "https://api.groq.com/openai/v1")?.who, "Groq");
  check("keypage: DeepSeek", keyPageFor("openai", "https://api.deepseek.com/v1")?.who, "DeepSeek");
  check("keypage: LM Studio needs no key at all", keyPageFor("openai", "http://localhost:1234/v1"), null);
  // A service nobody has heard of still gets a sensible destination.
  check(
    "keypage: unknown service falls back to OpenAI's",
    keyPageFor("openai", "https://api.example.com/v1")?.who,
    "OpenAI",
  );
}

/* ---------- what a card says ---------- */

{
  check("health: a cloud account with no key", connectionHealth(claude, { hasKey: false, reachable: null }), "needs-key");
  check("health: keyed but untried", connectionHealth(claude, { hasKey: true, reachable: null }), "untested");
  check("health: tested and good", connectionHealth(claude, { hasKey: true, reachable: true }), "ready");
  check("health: tested and silent", connectionHealth(claude, { hasKey: true, reachable: false }), "unreachable");
  // Ollama has no key to be missing — it is either there or it isn't.
  check("health: local without a key is not 'needs-key'", connectionHealth(local, { hasKey: false, reachable: null }), "untested");
  check("health: local, running", connectionHealth(local, { hasKey: false, reachable: true }), "ready");
  check("health: local, not running", connectionHealth(local, { hasKey: false, reachable: false }), "unreachable");
  check("health: nothing known yet", connectionHealth(local), "untested");

  // The three states the owner asked to see, in the words he asked for.
  check("label: connected", healthLabel("ready"), "Connected");
  check("label: not connected", healthLabel("needs-key"), "Not connected");
  check("label: can't reach it", healthLabel("unreachable"), "Can't reach it");
  ok("label: untested says so rather than claiming proof", /not tested/i.test(healthLabel("untested")));

  ok("usable: ready", usable("ready"));
  ok("usable: untested — an untried key is still worth trying", usable("untested"));
  ok("usable: unreachable, because daemons come back", usable("unreachable"));
  ok("usable: never one with no key", !usable("needs-key"));
}

/* ---------- the role list ---------- */

{
  check("roles: five", ROLES.length, 5);
  const ids = ROLES.map((r) => r.id);
  check("roles: no id twice", new Set(ids).size, ids.length);
  ok("roles: drafting exists", ids.includes("drafting"));
  ok("roles: ideas exists", ids.includes("ideas"));
  ok("roles: research exists", ids.includes("research"));
  ok("roles: critique exists", ids.includes("critique"));
  ok("roles: quick exists", ids.includes("quick"));

  for (const role of ROLES) {
    ok(`roles: ${role.id} has a label`, role.label.trim().length > 0);
    ok(`roles: ${role.id} explains itself in a writer's terms`, role.blurb.trim().length > 20);
    // Every kind must appear in every ranking, or a writer with only one
    // sort of connection would find a role that can never be filled.
    check(`roles: ${role.id} ranks every kind`, new Set(role.prefers).size, 3);
  }

  check("roles: the default is drafting", DEFAULT_ROLE, "drafting");
  ok("roles: the default is a real role", isRoleId(DEFAULT_ROLE));
  ok("roles: junk is not a role", !isRoleId("wibble"));
  ok("roles: an object is not a role", !isRoleId({ id: "drafting" }));
  check("roles: lookup", roleDef("ideas").label, "Ideas & brainstorming");

  // The opinion behind the defaults: prose goes to the best model,
  // scratch work goes to the free one.
  check("roles: drafting reaches for the best prose first", roleDef("drafting").prefers[0], "anthropic");
  check("roles: ideas reach for the free one first", roleDef("ideas").prefers[0], "ollama");
  check("roles: research reaches for the one with a browser-shaped mind", roleDef("research").prefers[0], "openai");
  check("roles: quick jobs go local first", roleDef("quick").prefers[0], "ollama");
}

/* ---------- routing tables ---------- */

{
  const messy = { drafting: "claude", ideas: "local", nonsense: "claude", research: "deleted-one" };
  const clean = normalizeRouting(messy, all);
  check("routing: keeps the real assignments", clean.drafting, "claude");
  check("routing: and the other real one", clean.ideas, "local");
  ok("routing: drops a key that isn't a role", !("nonsense" in clean));
  // A deleted connection must not strand a role — this is the line
  // between "it fell back" and "nothing happens when I press it".
  ok("routing: drops a pointer to a deleted connection", clean.research === undefined);

  check("routing: junk in, empty out", normalizeRouting("nonsense", all), {});
  check("routing: null in, empty out", normalizeRouting(null, all), {});

  const suggested = suggestRouting(all);
  check("suggest: drafting → Claude", suggested.drafting, "claude");
  check("suggest: ideas → local", suggested.ideas, "local");
  check("suggest: research → ChatGPT", suggested.research, "custom");
  check("suggest: critique → Claude", suggested.critique, "claude");
  check("suggest: quick → local", suggested.quick, "local");

  // One connection: every job goes to it, and no job is left blank.
  const only = suggestRouting([local]);
  check("suggest: one connection takes every job", Object.keys(only).length, ROLES.length);
  ok("suggest: and that job is the one connection", Object.values(only).every((v) => v === "local"));

  check("suggest: nothing connected, nothing assigned", suggestRouting([]), {});
}

/* ---------- linking a second account ---------- */

{
  /* The dead end this replaces: a writer links Claude, the card says
     Connected, and nothing they do goes anywhere near it. */
  const localOnly = [local];
  const defaults = suggestRouting(localOnly);
  ok("adding: an untouched arrangement is recognised", isSuggestedRouting(defaults, localOnly));

  const afterClaude = routingAfterAdding(defaults, localOnly, [local, claude]);
  check("adding: Claude takes the drafting job", afterClaude.drafting, "claude");
  check("adding: and the critique job", afterClaude.critique, "claude");
  check("adding: while ideas stay on the free one", afterClaude.ideas, "local");
  check("adding: and so do quick jobs", afterClaude.quick, "local");

  // The owner's arrangement, reached by linking two accounts and
  // touching nothing: Ollama for ideas, Claude for writing, ChatGPT for
  // research.
  const afterBoth = routingAfterAdding(afterClaude, [local, claude], all);
  check("adding: research lands on ChatGPT", afterBoth.research, "custom");
  check("adding: drafting stays with Claude", afterBoth.drafting, "claude");
  check("adding: ideas stay local", afterBoth.ideas, "local");

  // A hand-set arrangement is never rearranged behind their back.
  const handSet: Routing = { drafting: "local", ideas: "local", research: "local", critique: "local", quick: "local" };
  ok("adding: a hand-set arrangement is not a guess", !isSuggestedRouting(handSet, [local, claude]));
  const afterHandSet = routingAfterAdding(handSet, [local, claude], all);
  check("adding: their drafting choice survives", afterHandSet.drafting, "local");
  check("adding: and their research choice too", afterHandSet.research, "local");

  // Roles they never filled do consider the newcomer.
  const partial: Routing = { drafting: "local" };
  const afterPartial = routingAfterAdding(partial, [local], [local, claude]);
  check("adding: an untouched role takes the newcomer", afterPartial.critique, "claude");
  check("adding: the filled one is left alone", afterPartial.drafting, "local");
}

/* ---------- resolution: who actually answers ---------- */

{
  const routing: Routing = { drafting: "claude", ideas: "local", research: "custom" };

  check("resolve: the assignment wins", resolveRole("ideas", routing, all, allWell).chain[0]?.id, "local");
  check("resolve: drafting", resolveRole("drafting", routing, all, allWell).chain[0]?.id, "claude");
  check("resolve: research", resolveRole("research", routing, all, allWell).chain[0]?.id, "custom");

  // An unassigned role follows drafting, because that is the one the
  // writer definitely set up on purpose.
  check("resolve: an unassigned role follows drafting", resolveRole("critique", routing, all, allWell).chain[0]?.id, "claude");

  const full = resolveRole("ideas", routing, all, allWell);
  check("resolve: everything gets a turn", full.chain.length, 3);
  check("resolve: nobody appears twice", new Set(full.chain.map((c) => c.id)).size, full.chain.length);
  check("resolve: after the choice comes drafting's pick", full.chain[1]?.id, "claude");

  // A connection with no key cannot answer, so it must never be tried:
  // "connect it" is the fix, and a failed request would hide that.
  const claudeKeyless = probes({
    local: { hasKey: false, reachable: true },
    claude: { hasKey: false },
    custom: { hasKey: true, reachable: true },
  });
  const noKey = resolveRole("drafting", routing, all, claudeKeyless);
  ok("resolve: a keyless connection never enters the chain", !noKey.chain.some((c) => c.id === "claude"));
  check("resolve: and something else takes the job", noKey.chain[0]?.id, "custom");
  ok("resolve: the reason names the substitution", noKey.reason.includes("Claude"));

  // A stale failure demotes but does not banish — the daemon may be up
  // again by now, and a writer should not have to re-test to be allowed
  // to try.
  const localDown = probes({
    local: { hasKey: false, reachable: false },
    claude: { hasKey: true, reachable: true },
    custom: { hasKey: true, reachable: true },
  });
  const ideasWhileDown = resolveRole("ideas", routing, all, localDown);
  check("resolve: the assignment is still tried first", ideasWhileDown.chain[0]?.id, "local");
  check("resolve: with a live fallback behind it", ideasWhileDown.chain[1]?.id, "claude");

  // With nothing assigned at all, the role's own preference decides.
  const bare = resolveRole("quick", {}, all, allWell);
  check("resolve: no assignment, quick jobs go local", bare.chain[0]?.id, "local");
  const bareDraft = resolveRole("drafting", {}, all, allWell);
  check("resolve: no assignment, drafting goes to Claude", bareDraft.chain[0]?.id, "claude");

  // Health outranks nothing but preference — a ready ChatGPT beats an
  // untested one of the preferred kind only when the kind ties.
  const claudeUntested = probes({
    local: { hasKey: false, reachable: true },
    claude: { hasKey: true, reachable: null },
    custom: { hasKey: true, reachable: true },
  });
  check(
    "resolve: preference still leads over a fresher test",
    resolveRole("drafting", {}, all, claudeUntested).chain[0]?.id,
    "claude",
  );

  check("resolve: nothing connected, nothing to try", resolveRole("drafting", {}, [], allWell).chain.length, 0);
  check("resolve: one connection, one link", resolveRole("drafting", {}, [local], allWell).chain.length, 1);

  // Ordering must be stable: the same inputs must not reshuffle the
  // list a writer is reading.
  const twice = [resolveRole("critique", {}, all, allWell), resolveRole("critique", {}, all, allWell)];
  check(
    "resolve: the order is stable",
    twice[0]?.chain.map((c) => c.id),
    twice[1]?.chain.map((c) => c.id),
  );
}

/* ---------- what a person is told ---------- */

{
  // Nothing is assigned to drafting here, so after the writer's own
  // choice the ideas ranking decides — the cheap one, then the middle
  // one, then the expensive one.
  const resolved = resolveRole("ideas", { ideas: "local" }, all, allWell);
  check("describe: the order reads as a sentence", describeChain(resolved), "Local (Ollama), then ChatGPT, then Claude");
  check("describe: nothing at all", describeChain({ role: "ideas", chain: [], reason: "" }), "nothing available");

  const fresh = noConnectionMessage([]);
  ok("message: a fresh install is told where to go", fresh.includes("Settings"));
  ok("message: and that the free one exists", /ollama|local/i.test(fresh));

  const keyless = noConnectionMessage([claude, chatgpt]);
  ok("message: names the connection waiting for a key", keyless.includes("Claude"));
  ok("message: and reassures about the manuscript", /untouched/i.test(keyless));

  const note = fallbackNote(claude, local, "it didn't answer");
  ok("fallback: names who failed", note.includes("Claude"));
  ok("fallback: names who covered", note.includes("Local (Ollama)"));
  ok("fallback: says why", note.includes("didn't answer"));
}

/* ---------- editing a connection ---------- */

{
  const draft = defaultDraft("anthropic", []);
  check("draft: named for the service", draft.label, "Claude");
  check("draft: with a model already chosen", draft.model, kindInfo("anthropic").defaultModel);
  check("draft: a second one doesn't collide", defaultDraft("anthropic", [claude]).label, "Claude 2");

  check("label: free name is kept", uniqueLabel("Groq", ["Claude"]), "Groq");
  check("label: taken name gets a number", uniqueLabel("Claude", ["Claude"]), "Claude 2");
  check("label: and keeps counting", uniqueLabel("Claude", ["Claude", "Claude 2"]), "Claude 3");
  check("label: blank gets something", uniqueLabel("   ", []), "Connection");

  check("id: the historical name first", newConnectionId([], "anthropic"), "claude");
  check("id: local", newConnectionId([], "ollama"), "local");
  check("id: openai keeps its old name", newConnectionId([], "openai"), "custom");
  ok("id: a second account gets a fresh id", newConnectionId(["claude"], "anthropic") !== "claude");
  ok("id: and never collides", !["claude", "claude-2"].includes(newConnectionId(["claude", "claude-2"], "anthropic")));

  check("validate: a good one has no complaints", validateDraft({ kind: "openai", label: "Groq", model: "llama-3.3-70b-versatile", baseUrl: "https://api.groq.com/openai/v1" }, []), []);
  ok("validate: an unnamed connection is caught", validateDraft({ kind: "openai", label: " ", model: "m", baseUrl: "https://x.com/v1" }, []).length > 0);
  ok(
    "validate: a duplicate name is caught",
    validateDraft({ kind: "anthropic", label: "claude", model: "m", baseUrl: "" }, [claude]).length > 0,
  );
  ok("validate: a missing model is caught", validateDraft({ kind: "anthropic", label: "C", model: "", baseUrl: "" }, []).length > 0);
  ok("validate: Anthropic needs no address", validateDraft({ kind: "anthropic", label: "C", model: "m", baseUrl: "" }, []).length === 0);
  ok("validate: a missing address is caught", validateDraft({ kind: "openai", label: "X", model: "m", baseUrl: "" }, []).length > 0);
  ok("validate: nonsense for an address is caught", validateDraft({ kind: "openai", label: "X", model: "m", baseUrl: "api.openai.com" }, []).length > 0);
  // Plain HTTP to the internet would put the key and the manuscript on
  // the wire. The provider refuses it too; saying so here means the
  // writer learns it before they trust a chapter to it.
  ok(
    "validate: plain http to a public service is refused",
    validateDraft({ kind: "openai", label: "X", model: "m", baseUrl: "http://api.openai.com/v1" }, []).length > 0,
  );
  check(
    "validate: but http to your own machine is fine",
    validateDraft({ kind: "openai", label: "X", model: "m", baseUrl: "http://localhost:1234/v1" }, []),
    [],
  );
}

/* ---------- pasted keys ---------- */

{
  check("key: nothing pasted, nothing said", keyWarning("anthropic", ""), null);
  check("key: a real Anthropic key passes", keyWarning("anthropic", "sk-ant-api03-abcdef"), null);
  ok("key: an OpenAI key in the Claude box is caught", (keyWarning("anthropic", "sk-proj-abcdef") ?? "").length > 0);
  ok("key: an Anthropic key in the ChatGPT box is caught", (keyWarning("openai", "sk-ant-api03-abc") ?? "").includes("Anthropic"));
  check("key: an OpenAI key passes", keyWarning("openai", "sk-proj-abcdef"), null);
  check("key: a Groq key passes", keyWarning("openai", "gsk_abcdefgh"), null);
  ok("key: a pasted sentence is caught", (keyWarning("openai", "my key is sk-123") ?? "").length > 0);

  // Masking exists so a saved key can be acknowledged without being
  // shown. It must never hand back the whole thing.
  const secret = "sk-ant-api03-0123456789abcdef";
  const masked = maskKey(secret);
  ok("mask: doesn't leak the key", !masked.includes("0123456789"));
  ok("mask: is recognisable", masked.startsWith("sk-ant"));
  check("mask: nothing to mask", maskKey(""), "");
  check("mask: a short string gives nothing away", maskKey("abc"), "••••");
}

/* ---------- upgrading someone who already had this working ---------- */

{
  // A writer who never touched AI settings: local only, every job on it,
  // nothing invented and no empty screen.
  const fresh = migrateLegacy({
    activeSlash: "/local",
    ollamaEnabled: true,
    anthropicEnabled: false,
    anthropicHasKey: false,
    customEnabled: false,
    customHasKey: false,
  });
  check("migrate: one connection", fresh.connections.length, 1);
  check("migrate: and it's the local one", fresh.connections[0]?.id, "local");
  check("migrate: every job assigned", Object.keys(fresh.routing).length, ROLES.length);

  // Local is seeded even when the plugin was off: it needs no key, and
  // it is the reason the app works on a plane.
  const nothingOn = migrateLegacy({
    activeSlash: "/local",
    ollamaEnabled: false,
    anthropicEnabled: false,
    anthropicHasKey: false,
    customEnabled: false,
    customHasKey: false,
  });
  check("migrate: local is always there", nothingOn.connections[0]?.id, "local");

  // Someone mid-project with Claude selected keeps writing with Claude.
  const withClaude = migrateLegacy({
    activeSlash: "/claude",
    ollamaEnabled: true,
    ollamaModel: "mistral:7b",
    anthropicEnabled: true,
    anthropicModel: "claude-sonnet-5",
    anthropicHasKey: true,
    customEnabled: false,
    customHasKey: false,
  });
  check("migrate: two connections", withClaude.connections.length, 2);
  check("migrate: the model they chose survives", withClaude.connections[0]?.model, "mistral:7b");
  check("migrate: Claude's model survives too", withClaude.connections[1]?.model, "claude-sonnet-5");
  check("migrate: and Claude keeps writing the book", withClaude.routing.drafting, "claude");
  check("migrate: while ideas go to the free one", withClaude.routing.ideas, "local");

  // A key typed but the plugin never switched on still counts as a
  // connection — the writer clearly meant it.
  const keyedButOff = migrateLegacy({
    activeSlash: "/local",
    ollamaEnabled: true,
    anthropicEnabled: false,
    anthropicHasKey: true,
    customEnabled: false,
    customHasKey: false,
  });
  ok("migrate: a typed key means a connection", keyedButOff.connections.some((c) => c.id === "claude"));

  const withCustom = migrateLegacy({
    activeSlash: "/custom",
    ollamaEnabled: true,
    anthropicEnabled: false,
    anthropicHasKey: false,
    customEnabled: true,
    customBaseUrl: "https://openrouter.ai/api/v1",
    customModel: "anthropic/claude-3.5-sonnet",
    customHasKey: true,
  });
  check("migrate: the endpoint survives", withCustom.connections[1]?.baseUrl, "https://openrouter.ai/api/v1");
  check("migrate: and it keeps drafting", withCustom.routing.drafting, "custom");

  // A selection pointing at something that was never set up must not
  // route drafting into a hole.
  const stale = migrateLegacy({
    activeSlash: "/claude",
    ollamaEnabled: true,
    anthropicEnabled: false,
    anthropicHasKey: false,
    customEnabled: false,
    customHasKey: false,
  });
  check("migrate: a stale selection is ignored", stale.routing.drafting, "local");
}

/* ---------- reading back a store that may be nonsense ---------- */

{
  check("parse: junk", parseConnections("nope"), []);
  check("parse: null", parseConnections(null), []);
  check("parse: an empty list", parseConnections([]), []);

  const parsed = parseConnections([
    { id: "a", kind: "ollama", label: "Mine", model: "llama3.1:8b" },
    { id: "b", kind: "wibble", label: "Bad kind" },
    { id: "a", kind: "anthropic", label: "Duplicate id" },
    null,
    "string",
    { kind: "anthropic", label: "No id" },
    { id: "c", kind: "anthropic" },
  ]);
  check("parse: keeps the good ones", parsed.map((c) => c.id), ["a", "c"]);
  check("parse: fills a missing label", parsed[1]?.label, "Claude");
  check("parse: fills a missing model", parsed[1]?.model, kindInfo("anthropic").defaultModel);
  check("parse: fills a missing address", parsed[1]?.baseUrl, kindInfo("anthropic").defaultBaseUrl);
}

/* ---------- the arrangement the owner actually asked for ---------- */

{
  /* "Ollama I want to use for ideas, claude for writing, chat gpt for
     research and copyright check" — set up exactly that, then break it
     the way a real day breaks it. */
  const routing: Routing = {
    ideas: "local",
    drafting: "claude",
    research: "custom",
    critique: "custom",
    quick: "local",
  };

  check("owner: ideas go to Ollama", resolveRole("ideas", routing, all, allWell).chain[0]?.label, "Local (Ollama)");
  check("owner: writing goes to Claude", resolveRole("drafting", routing, all, allWell).chain[0]?.label, "Claude");
  check("owner: research goes to ChatGPT", resolveRole("research", routing, all, allWell).chain[0]?.label, "ChatGPT");
  check("owner: the copyright read goes to ChatGPT", resolveRole("critique", routing, all, allWell).chain[0]?.label, "ChatGPT");

  // He closes the laptop lid; Ollama stops answering. Ideas must still
  // work, and the app must be able to say who stepped in.
  const laptopSlept = probes({
    local: { hasKey: false, reachable: false },
    claude: { hasKey: true, reachable: true },
    custom: { hasKey: true, reachable: true },
  });
  const ideas = resolveRole("ideas", routing, all, laptopSlept);
  ok("owner: ideas still have somewhere to go", ideas.chain.length > 1);
  check("owner: and the stand-in is his drafting model", ideas.chain[1]?.id, "claude");

  // The Anthropic bill runs out mid-chapter: the key is still there, so
  // it is still tried first, but drafting does not stop.
  const claudeBroke = probes({
    local: { hasKey: false, reachable: true },
    claude: { hasKey: true, reachable: false, detail: "Rate limited or out of credit (429)." },
    custom: { hasKey: true, reachable: true },
  });
  const drafting = resolveRole("drafting", routing, all, claudeBroke);
  ok("owner: drafting has a fallback when the credit runs out", drafting.chain.length > 1);
  ok("owner: and it isn't a dead end", drafting.chain.slice(1).some((c) => c.id === "custom" || c.id === "local"));

  // He removes ChatGPT entirely. Research must not point at a ghost.
  const withoutChatGPT = [local, claude];
  const afterRemoval = normalizeRouting(routing, withoutChatGPT);
  ok("owner: removing a connection clears its jobs", afterRemoval.research === undefined);
  const research = resolveRole("research", afterRemoval, withoutChatGPT, allWell);
  ok("owner: and research still answers", research.chain.length > 0);
  check("owner: falling to what he drafts with", research.chain[0]?.id, "claude");

  // Everything unplugged. No crash, no cryptic error — a sentence with
  // a next step in it.
  const nothing = resolveRole("drafting", {}, [], allWell);
  check("owner: nothing connected means nothing to try", nothing.chain.length, 0);
  ok("owner: and the message tells him what to press", noConnectionMessage([]).includes("Connections"));
}

/* ---------- the purity rule ---------- */

{
  /* roles.ts earns its keep by being testable with no machine attached.
     A stray import of the plugin host or a fetch would end that quietly,
     so it is checked rather than trusted. */
  const raw = readFileSync(new URL("./src/ai/roles.ts", import.meta.url), "utf8");
  // Comments describe the impure world without touching it, and one of
  // the key pages genuinely lives at console.anthropic.com — so scan the
  // code, not the prose.
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  ok("pure: no network", !/\bfetch\s*\(/.test(source));
  ok("pure: no localStorage", !/\blocalStorage\b/.test(source));
  ok("pure: no window", !/\bwindow\s*\./.test(source));
  ok("pure: no document", !/\bdocument\s*\./.test(source));
  ok("pure: no imports at all", !/^\s*import\s/m.test(source));
  // Keys must never be written to a log, here or anywhere near here.
  ok("pure: nothing is logged", !/\bconsole\s*\.\s*(log|warn|error|info|debug)\b/.test(source));
}

/* ---------- report ---------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`roles tests: ${checks} checks passed`);
