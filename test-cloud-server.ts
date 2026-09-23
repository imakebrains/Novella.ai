/* Assertions for the cloud's edges — everything between the app and
   the servers that isn't the sync engine itself (that is test-cloud.ts).

   Same shape as the other suites: silent unless something is wrong,
   non-zero exit when it is.

   Four boundaries, each one a place where a mistake costs money,
   privacy or a writer's session:

   • WIRE. Database rows into engine shapes. Strict on purpose: a row
     with a missing version must throw, because `undefined >= 3` is
     false and would read as "the cloud is newer".
   • HOSTED AI. What the proxy accepts (only what the app sends, never
     raw messages or tools — it holds the owner's key), what a call
     costs, when the allowance says no, and the event stream back.
   • BILLING. A forged or replayed webhook must be refused, every
     Paddle status must land on the right plan, and a writer who
     switched subscriptions must not be downgraded by the old one's
     cancellation arriving late.
   • SESSION STORAGE. The refresh token goes to the keychain and only
     there; a missing half reads as signed out. */

import { PLANS, TIERS, type Tier as AppTier } from "./src/cloud/plans";
import { parseCloudConfig } from "./src/cloud/config";
import { blobKeyFor, describeCloudError, pageOf, parsePushResult, pushArgs, rowToRemoteFile } from "./src/cloud/wire";
import { splitSessionStorage, type PlainStore, type SecretStore } from "./src/cloud/sessionStorage";
import { makeHostedProvider } from "./src/cloud/hostedAi";
import {
  DEFAULT_HOSTED_MODEL,
  HOSTED_MODELS,
  HostedEventParser,
  MAX_INPUT_CHARS,
  MAX_OUTPUT_TOKENS,
  MIN_OUTPUT_TOKENS,
  checkAllowance,
  costMicroUsd,
  encodeEvent,
  estimateOutputTokens,
  originAllowed,
  validateHostedRequest,
} from "./supabase/functions/_shared/aiCore";
import {
  SIGNATURE_TOLERANCE_SECONDS,
  decideWrite,
  entitlementFromEvent,
  parsePriceTiers,
  parseSignatureHeader,
  verifySignature,
  type EntitlementUpdate,
  type Tier as BillingTier,
} from "./supabase/functions/_shared/billingCore";

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

function throws(name: string, fn: () => unknown): void {
  checks++;
  try {
    fn();
  } catch {
    return;
  }
  failures++;
  console.error(`FAIL  ${name} (did not throw)`);
}

async function hmac(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function main(): Promise<void> {
  /* ============================================================
     Config
     ============================================================ */

  check("no config, no cloud", parseCloudConfig(undefined, undefined), null);
  check("blank values, no cloud", parseCloudConfig("  ", "key"), null);
  check("plain http to a real host is refused", parseCloudConfig("http://abc.supabase.co", "key"), null);
  check("http to localhost is fine (supabase start)", parseCloudConfig("http://localhost:54321", "k"), { url: "http://localhost:54321", anonKey: "k" });
  check("a trailing path is trimmed to the origin", parseCloudConfig("https://abc.supabase.co/", " k "), { url: "https://abc.supabase.co", anonKey: "k" });
  check("garbage is refused", parseCloudConfig("not a url", "k"), null);

  /* ============================================================
     Wire
     ============================================================ */

  {
    const row = { path: "a.md", version: 3, seq: "41", sha256: "ab", size: 2, deleted: false, content: "hi", blob_key: null, device: "Desk", owner_id: "x" };
    check("a row parses, bigint-as-string included", rowToRemoteFile(row), {
      path: "a.md", version: 3, seq: 41, sha256: "ab", size: 2, deleted: false, content: "hi", blobKey: null, device: "Desk",
    });
    throws("a row with no version throws", () => rowToRemoteFile({ ...row, version: undefined }));
    throws("a row with a fractional seq throws", () => rowToRemoteFile({ ...row, seq: 1.5 }));
    throws("a row with a string deleted flag throws", () => rowToRemoteFile({ ...row, deleted: "false" }));
    throws("a non-object throws", () => rowToRemoteFile(null));

    check("push ok", parsePushResult({ ok: true, version: 2, seq: 9 }), { ok: true, version: 2, seq: 9 });
    check("push conflict with no current row", parsePushResult({ ok: false, reason: "conflict", current: null }), { ok: false, reason: "conflict", current: null });
    check("push conflict carries the row", (parsePushResult({ ok: false, reason: "conflict", current: row }) as { current: { version: number } }).current.version, 3);
    check("push limit", parsePushResult({ ok: false, reason: "limit", limit: "bytes" }), { ok: false, reason: "limit", limit: "bytes" });
    throws("an unknown limit throws", () => parsePushResult({ ok: false, reason: "limit", limit: "everything" }));
    throws("an unknown reply throws", () => parsePushResult({ ok: "yes" }));

    check("push args name every parameter push_file takes", Object.keys(pushArgs("p", { path: "a.md", baseVersion: 1, sha256: "s", deleted: false, content: "x", blobKey: null }, "Desk")), [
      "p_project", "p_path", "p_base_version", "p_sha256", "p_deleted", "p_content", "p_blob_key", "p_device",
    ]);
    check("blob keys are owner/project/hash", blobKeyFor("u", "p", "abc"), "u/p/abc");

    const rows = Array.from({ length: 3 }, (_, i) => ({ ...row, seq: i + 1 }));
    check("a full page plus one means more", pageOf(rows, 2).more, true);
    check("and returns only the page", pageOf(rows, 2).files.length, 2);
    check("a short page means done", pageOf(rows, 5).more, false);

    check("fetch failure reads as offline", describeCloudError(new TypeError("Failed to fetch")).kind, "offline");
    check("expired JWT reads as signed out", describeCloudError({ message: "JWT expired", code: "PGRST301" }).kind, "signed-out");
    check("not_found reads as not found", describeCloudError({ message: "not_found", code: "P0002" }).kind, "not-found");
    check("the plan limit reads as a limit", describeCloudError({ message: "plan_limit:projects", code: "P0001" }).kind, "limit");
    const odd = describeCloudError({ message: "relation \"secret_table\" does not exist" });
    ok("an unrecognised server message is never shown raw", !odd.message.includes("secret_table"));
  }

  /* ============================================================
     Hosted AI: what the proxy accepts
     ============================================================ */

  {
    const good = validateHostedRequest({ system: "You are an editor.", prompt: "Tighten this.", maxTokens: 1024 });
    check("a normal request passes", good, { ok: true, value: { system: "You are an editor.", prompt: "Tighten this.", maxTokens: 1024, model: DEFAULT_HOSTED_MODEL } });
    check("the default model is the owner's configured one", (validateHostedRequest({ prompt: "x" }, "claude-haiku-4-5") as { value: { model: string } }).value.model, "claude-haiku-4-5");
    check("raw messages are refused", validateHostedRequest({ prompt: "x", messages: [] }).ok, false);
    check("tools are refused", validateHostedRequest({ prompt: "x", tools: [{ name: "bash" }] }).ok, false);
    check("an unlisted model is refused", validateHostedRequest({ prompt: "x", model: "claude-fable-5-1" }).ok, false);
    check("an empty prompt is refused", validateHostedRequest({ prompt: "   " }).ok, false);
    check("an array body is refused", validateHostedRequest([]).ok, false);
    const huge = validateHostedRequest({ prompt: "x".repeat(MAX_INPUT_CHARS + 1) });
    check("oversized context is refused with 413", huge.ok ? 0 : huge.status, 413);
    check("max tokens is clamped down", (validateHostedRequest({ prompt: "x", maxTokens: 1e9 }) as { value: { maxTokens: number } }).value.maxTokens, MAX_OUTPUT_TOKENS);
    check("and up", (validateHostedRequest({ prompt: "x", maxTokens: 1 }) as { value: { maxTokens: number } }).value.maxTokens, MIN_OUTPUT_TOKENS);
    check("a non-numeric length is refused", validateHostedRequest({ prompt: "x", maxTokens: "lots" }).ok, false);
  }

  /* ============================================================
     Hosted AI: cost and allowance
     ============================================================ */

  {
    // The heavy request from docs/CLOUD.md: 6k in, 800 out.
    check("a long request on Opus 5 costs 5 cents", costMicroUsd("claude-opus-5", { input_tokens: 6000, output_tokens: 800 }), 50_000);
    check("on Sonnet 5, 2 cents", costMicroUsd("claude-sonnet-5", { input_tokens: 6000, output_tokens: 800 }), 20_000);
    check("on Haiku 4.5, 1 cent", costMicroUsd("claude-haiku-4-5", { input_tokens: 6000, output_tokens: 800 }), 10_000);
    check("cache reads are a tenth", costMicroUsd("claude-sonnet-5", { cache_read_input_tokens: 10_000 }), 2_000);
    check("cache writes are a quarter more", costMicroUsd("claude-sonnet-5", { cache_creation_input_tokens: 1000 }), 2_500);
    check("an unknown model is charged at the dearest listed rate", costMicroUsd("claude-something-new", { output_tokens: 1000 }), 25_000);
    check("nulls and negatives cost nothing", costMicroUsd("claude-opus-5", { input_tokens: null, output_tokens: -5 }), 0);
    check("fractions round up, never down", costMicroUsd("claude-haiku-4-5", { cache_read_input_tokens: 1 }), 1);
    check("a stopped stream is estimated from what streamed", estimateOutputTokens(401), 101);

    const pro = PLANS.pro.aiMonthlyMicroUsd;
    check("Pro's allowance buys 120 long Opus requests", Math.floor(pro / 50_000), 120);
    check("free has no hosted AI", checkAllowance({ tier: "free", aiMonthlyMicroUsd: 0, aiUsedMicroUsd: 0 }).ok, false);
    const spent = checkAllowance({ tier: "pro", aiMonthlyMicroUsd: pro, aiUsedMicroUsd: pro });
    check("a spent allowance says 402", spent.ok ? 0 : spent.status, 402);
    ok("and points at the writer's own connections", !spent.ok && spent.message.includes("own connections"));
    check("one cent left still starts a request", checkAllowance({ tier: "pro", aiMonthlyMicroUsd: pro, aiUsedMicroUsd: pro - 10_000 }).ok, true);

    ok("every hosted model has a price", Object.values(HOSTED_MODELS).every((p) => p.inputPerMTok > 0 && p.outputPerMTok > p.inputPerMTok));
    check("origins: exact match only", originAllowed("https://app.novella.ai", ["https://app.novella.ai", "tauri://localhost"]), true);
    check("origins: no prefix tricks", originAllowed("https://app.novella.ai.evil.com", ["https://app.novella.ai"]), false);
    check("origins: none sent is not a match", originAllowed(null, ["https://app.novella.ai"]), false);
    check("origins: an empty allow-list entry matches nothing", originAllowed("", [""]), false);
  }

  /* ============================================================
     Hosted AI: the stream back, and the app's provider
     ============================================================ */

  {
    const wire =
      encodeEvent({ type: "text", text: "It was " }) +
      encodeEvent({ type: "text", text: "a dark night." }) +
      encodeEvent({ type: "done", stopReason: "end_turn", usedMicroUsd: 70_000, allowanceMicroUsd: 6_000_000 });
    const parser = new HostedEventParser();
    const events = [];
    // Split at awkward places, including mid-JSON and mid-"\n\n".
    for (let i = 0; i < wire.length; i += 7) events.push(...parser.push(wire.slice(i, i + 7)));
    check("events survive arbitrary chunking", events.map((e) => e.type), ["text", "text", "done"]);
    check("text arrives intact", events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join(""), "It was a dark night.");
    check("junk lines are skipped, not thrown", new HostedEventParser().push("data: {nope\n\ndata: {\"type\":\"mystery\"}\n\n"), []);

    const streamOf = (text: string, status = 200) =>
      new Response(
        new ReadableStream({
          start(c) {
            const bytes = new TextEncoder().encode(text);
            for (let i = 0; i < bytes.length; i += 5) c.enqueue(bytes.slice(i, i + 5));
            c.close();
          },
        }),
        { status, headers: { "Content-Type": "text/event-stream" } },
      );

    let sent: { url: string; init: RequestInit } | null = null;
    const meters: number[] = [];
    const provider = makeHostedProvider({
      access: async () => ({ url: "https://abc.supabase.co", anonKey: "pub", token: "jwt" }),
      onMeter: (m) => meters.push(m.usedMicroUsd),
      fetchImpl: (async (url: string, init: RequestInit) => {
        sent = { url, init };
        return streamOf(wire);
      }) as unknown as typeof fetch,
    });
    const chunks: string[] = [];
    const answer = await provider.generateStream({ system: "s", prompt: "p", maxTokens: 900 }, (c) => chunks.push(c));
    check("the provider returns the whole answer", answer, "It was a dark night.");
    check("and streams it in pieces", chunks.length, 2);
    check("the meter is reported", meters, [70_000]);
    check("it calls the ai function", sent!.url, "https://abc.supabase.co/functions/v1/ai");
    check("with the session token", (sent!.init.headers as Record<string, string>).Authorization, "Bearer jwt");
    check("and only the fields the proxy accepts", Object.keys(JSON.parse(String(sent!.init.body))), ["system", "prompt", "maxTokens"]);

    const failing = (res: Response) =>
      makeHostedProvider({
        access: async () => ({ url: "https://abc.supabase.co", anonKey: "pub", token: "jwt" }),
        fetchImpl: (async () => res) as unknown as typeof fetch,
      });
    const errorOf = async (p: ReturnType<typeof makeHostedProvider>) => {
      try {
        await p.generateStream({ system: "", prompt: "p" }, () => {});
        return "no error";
      } catch (err) {
        return (err as Error).message;
      }
    };
    check(
      "a 402 surfaces the server's sentence",
      await errorOf(failing(new Response(JSON.stringify({ message: "This month's built-in AI allowance is used up." }), { status: 402 }))),
      "This month's built-in AI allowance is used up.",
    );
    check(
      "an error event mid-stream is thrown",
      await errorOf(failing(streamOf(encodeEvent({ type: "text", text: "Half" }) + encodeEvent({ type: "error", message: "Claude declined this request." })))),
      "Claude declined this request.",
    );
    ok(
      "a stream that just stops is reported as cut off, not returned as complete",
      (await errorOf(failing(streamOf(encodeEvent({ type: "text", text: "Half a sen" }))))).includes("cut off"),
    );
    ok(
      "signed out asks the writer to sign in",
      (await errorOf(makeHostedProvider({ access: async () => null, fetchImpl: (async () => new Response("")) as unknown as typeof fetch }))).includes("Sign in"),
    );
  }

  /* ============================================================
     Billing: believing a webhook
     ============================================================ */

  {
    const secret = "pdl_ntfset_test_secret";
    const body = '{"event_type":"subscription.created","occurred_at":"2026-09-23T10:00:00Z"}';
    const now = 1_790_000_000;
    const h1 = await hmac(secret, `${now}:${body}`);
    const header = `ts=${now};h1=${h1}`;

    ok("a genuine delivery verifies", await verifySignature(body, header, secret, now));
    ok("a one-byte change to the body fails", !(await verifySignature(body.replace("created", "creaTed"), header, secret, now)));
    ok("re-serialised JSON fails (the raw bytes are what's signed)", !(await verifySignature(JSON.stringify(JSON.parse(body), null, 1), header, secret, now)));
    ok("the wrong secret fails", !(await verifySignature(body, header, "other", now)));
    ok("no secret configured fails closed", !(await verifySignature(body, header, "", now)));
    ok("a replay past the tolerance fails", !(await verifySignature(body, header, secret, now + SIGNATURE_TOLERANCE_SECONDS + 1)));
    ok("inside the tolerance passes", await verifySignature(body, header, secret, now + SIGNATURE_TOLERANCE_SECONDS));
    ok("a rotated secret's second h1 is accepted", await verifySignature(body, `ts=${now};h1=${"0".repeat(64)};h1=${h1}`, secret, now));
    ok("no header fails", !(await verifySignature(body, null, secret, now)));
    check("a header with no h1 is unparseable", parseSignatureHeader(`ts=${now}`), null);
    check("a malformed h1 is ignored", parseSignatureHeader(`ts=${now};h1=zz`), null);
  }

  /* ============================================================
     Billing: what a webhook means
     ============================================================ */

  {
    const prices = parsePriceTiers('{"pri_plus_m":"plus","pri_plus_y":"plus","pri_pro_m":"pro","pri_bogus":"gold"}');
    check("price map keeps paid tiers only", [...prices.values()].sort(), ["plus", "plus", "pro"]);
    check("a bad PRICE_TIERS secret grants nothing", parsePriceTiers("{oops").size, 0);

    const user = "0f6e3b8a-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
    const event = (type: string, status: string, priceId: string, extra: Record<string, unknown> = {}) => ({
      event_type: type,
      occurred_at: "2026-09-23T10:00:00Z",
      data: {
        id: "sub_01",
        status,
        customer_id: "ctm_01",
        items: [{ price: { id: priceId } }],
        custom_data: { user_id: user },
        current_billing_period: { starts_at: "2026-09-23T10:00:00Z", ends_at: "2026-10-23T10:00:00Z" },
        ...extra,
      },
    });

    const created = entitlementFromEvent(event("subscription.created", "active", "pri_pro_m"), prices);
    check("a new Pro subscription", created.ok && created.value, {
      subscriptionId: "sub_01", customerId: "ctm_01", userId: user, tier: "pro", status: "active",
      currentPeriodEnd: "2026-10-23T10:00:00Z", occurredAt: "2026-09-23T10:00:00Z",
    });
    for (const status of ["trialing", "past_due", "paused", "canceled"]) {
      const r = entitlementFromEvent(event("subscription.updated", status, "pri_plus_m"), prices);
      check(`status ${status} is carried through`, r.ok && r.value.status, status);
    }
    const both = entitlementFromEvent(event("subscription.updated", "active", "pri_plus_m", { items: [{ price: { id: "pri_plus_m" } }, { price: { id: "pri_pro_m" } }] }), prices);
    check("the highest tier among the items wins", both.ok && both.value.tier, "pro");
    check("an unknown price grants nothing", entitlementFromEvent(event("subscription.created", "active", "pri_nope"), prices).ok, false);
    check("an unknown status is refused, not guessed", entitlementFromEvent(event("subscription.updated", "exploded", "pri_pro_m"), prices).ok, false);
    check("events we don't handle are ignored", entitlementFromEvent({ ...event("transaction.completed", "active", "pri_pro_m") }, prices).ok, false);
    const badUser = entitlementFromEvent(event("subscription.created", "active", "pri_pro_m", { custom_data: { user_id: "'; drop table" } }), prices);
    check("a non-UUID user id is dropped", badUser.ok && badUser.value.userId, null);

    const base = (created as { value: EntitlementUpdate }).value;
    const at = (iso: string, over: Partial<EntitlementUpdate> = {}): EntitlementUpdate => ({ ...base, occurredAt: iso, ...over });
    check("first event for an account applies", decideWrite(null, base), "apply");
    check(
      "a newer event applies",
      decideWrite({ subscriptionId: "sub_01", status: "active", updatedAt: "2026-09-23T10:00:00Z" }, at("2026-09-24T00:00:00Z", { status: "canceled" })),
      "apply",
    );
    check(
      "an older event arriving late is stale",
      decideWrite({ subscriptionId: "sub_01", status: "canceled", updatedAt: "2026-09-24T00:00:00Z" }, at("2026-09-23T10:00:00Z", { status: "active" })),
      "stale",
    );
    check(
      "an old subscription's cancellation can't downgrade a live new one",
      decideWrite({ subscriptionId: "sub_02", status: "active", updatedAt: "2026-09-20T00:00:00Z" }, at("2026-09-25T00:00:00Z", { subscriptionId: "sub_01", status: "canceled" })),
      "superseded",
    );
    check(
      "a new live subscription takes over the row",
      decideWrite({ subscriptionId: "sub_01", status: "canceled", updatedAt: "2026-09-20T00:00:00Z" }, at("2026-09-25T00:00:00Z", { subscriptionId: "sub_02", status: "active" })),
      "apply",
    );

    const billingTiers: BillingTier[] = ["free", "plus", "pro"];
    const appTiers: AppTier[] = [...TIERS];
    check("billing's Tier mirrors the app's", billingTiers, appTiers);
  }

  /* ============================================================
     Session storage: the refresh token lives in the keychain only
     ============================================================ */

  {
    const secrets = new Map<string, string>();
    const plain = new Map<string, string>();
    const secretStore: SecretStore = {
      get: async (n) => secrets.get(n) ?? null,
      set: async (n, v) => void secrets.set(n, v),
      remove: async (n) => void secrets.delete(n),
    };
    const plainStore: PlainStore = {
      getItem: (k) => plain.get(k) ?? null,
      setItem: (k, v) => void plain.set(k, v),
      removeItem: (k) => void plain.delete(k),
    };
    const store = splitSessionStorage(secretStore, plainStore);
    const session = { access_token: "a.b.c", refresh_token: "r3fr3sh", user: { id: "u", user_metadata: { avatar_url: "x".repeat(3000) } } };

    await store.setItem("novella.cloud.session", JSON.stringify(session));
    ok("the refresh token is not in plain storage", !(plain.get("novella.cloud.session") ?? "").includes("r3fr3sh"));
    check("it is in the keychain", secrets.get("cloud-session:novella.cloud.session"), "r3fr3sh");
    ok("the keychain half stays small even with a big profile", (secrets.get("cloud-session:novella.cloud.session") ?? "").length < 2560);
    const back = JSON.parse((await store.getItem("novella.cloud.session")) ?? "null");
    check("reading reassembles the refresh token", back?.refresh_token, session.refresh_token);
    check("and the access token", back?.access_token, session.access_token);
    check("and the profile", back?.user, session.user);
    check("with nothing extra", Object.keys(back ?? {}).sort(), Object.keys(session).sort());

    secrets.clear();
    check("a missing keychain half reads as signed out", await store.getItem("novella.cloud.session"), null);

    plain.set("novella.cloud.session", JSON.stringify(session));
    check("a legacy plain session with a token in it is not trusted", await store.getItem("novella.cloud.session"), null);
    check("and is wiped", plain.has("novella.cloud.session"), false);

    await store.setItem("novella.cloud.session-code-verifier", "verifier123");
    check("non-session values pass through untouched", await store.getItem("novella.cloud.session-code-verifier"), "verifier123");
    await store.setItem("novella.cloud.session-user", '{"id":"u"}');
    check("non-session JSON passes through too", await store.getItem("novella.cloud.session-user"), '{"id":"u"}');
    check("(stored plain, as supabase-js expects)", plain.get("novella.cloud.session-code-verifier"), "verifier123");

    await store.setItem("novella.cloud.session", JSON.stringify(session));
    await store.removeItem("novella.cloud.session");
    ok("sign-out clears both halves", !plain.has("novella.cloud.session") && secrets.size === 0);
  }

  if (failures > 0) {
    console.error(`\ntest-cloud-server: ${failures} of ${checks} checks failed`);
    process.exit(1);
  }
  console.log(`test-cloud-server: ${checks} checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
