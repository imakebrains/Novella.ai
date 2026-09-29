/* Assertions for the Account screen and the checkout function behind
   it. Same shape as the other suites: silent unless something is
   wrong, non-zero exit when it is.

   Three boundaries:

   • SIGN-IN. What a supabase-js user becomes on screen, and which
     sentence each auth failure turns into — never the raw message,
     and never "your code didn't match" for a mistyped email.
   • CHECKOUT. What create-checkout accepts, what it sends Paddle,
     what it hands back, and that a writer with a live subscription is
     never sold a second one.
   • THE ONE CLIENT. auth.ts is the only creator of the Supabase
     client, because the first caller decides whether the refresh token
     goes to the keychain or to localStorage. A scan fails the suite if
     anything else starts calling cloudClient(). */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  archiveFilename,
  cloudUserFrom,
  friendlyAuthError,
  handoffUrl,
  initialOf,
  looksLikeEmail,
  normalizeCode,
  normalizeEmail,
  planChoices,
  readFunctionReply,
  shareOf,
} from "./src/cloud/authCore";
import { callFunction, requestHandoff } from "./src/cloud/functions";
import {
  checkoutAllowed,
  checkoutReply,
  checkoutUrlOf,
  paddleBase,
  parsePaddlePrices,
  portalReply,
  priceKeyFor,
  transactionBody,
  validateCheckoutRequest,
} from "./supabase/functions/_shared/checkoutCore";
import { checkDeletion } from "./supabase/functions/_shared/accountCore";
import { TIERS } from "./src/cloud/plans";

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

async function rejectsWith(name: string, run: () => Promise<unknown>, needle: string): Promise<void> {
  checks++;
  try {
    await run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes(needle)) return;
    failures++;
    console.error(`FAIL  ${name}\n        threw "${message}", wanted it to mention "${needle}"`);
    return;
  }
  failures++;
  console.error(`FAIL  ${name} (did not throw)`);
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

async function main(): Promise<void> {
  /* ============================================================
     Sign-in
     ============================================================ */

  check(
    "a Google user keeps name and avatar",
    cloudUserFrom({ id: "u1", email: "Wren@x.io", user_metadata: { full_name: "Wren", avatar_url: "https://a.example/b.png" } }),
    { id: "u1", email: "Wren@x.io", name: "Wren", avatarUrl: "https://a.example/b.png" },
  );
  check(
    "the OpenID spellings (name, picture) work too",
    cloudUserFrom({ id: "u1", email: "w@x.io", user_metadata: { name: "Wren R", picture: "https://p.example/1.jpg" } }),
    { id: "u1", email: "w@x.io", name: "Wren R", avatarUrl: "https://p.example/1.jpg" },
  );
  check(
    "a plain-http avatar is dropped",
    cloudUserFrom({ id: "u1", email: "w@x.io", user_metadata: { avatar_url: "http://a.example/b.png" } }),
    { id: "u1", email: "w@x.io" },
  );
  check("no email, no user — such an account could never confirm its own deletion", cloudUserFrom({ id: "u1" }), null);
  check("no id, no user", cloudUserFrom({ email: "w@x.io" }), null);
  check("a non-object is not a user", cloudUserFrom("u1"), null);
  check("no session user is not a user", cloudUserFrom(undefined), null);

  check("initial from the name", initialOf({ email: "w@x.io", name: "wren" }), "W");
  check("initial from the email when there is no name", initialOf({ email: "ash@x.io" }), "A");
  check("an astral first letter stays whole", initialOf({ email: "x@x.io", name: "\u{1D4D0}lice" }), "\u{1D4D0}");

  check("emails compare trimmed and lowercased", normalizeEmail("  Wren@Example.com "), "wren@example.com");
  ok("an ordinary address looks like one", looksLikeEmail("wren@example.com"));
  ok("a bare user@ does not", !looksLikeEmail("wren@"));
  ok("a space inside does not", !looksLikeEmail("a b@c.d"));
  ok("no dot in the domain does not", !looksLikeEmail("wren@localhost"));

  check("a code pasted with a space", normalizeCode("123 456"), "123456");
  check("a code pasted with dashes", normalizeCode("12-34-56"), "123456");
  check("letters are not a code", normalizeCode("abc"), "");

  const expired = friendlyAuthError({ message: "Token has expired or is invalid" });
  ok("an expired code says the code didn't match", expired.includes("didn't match"));
  ok("otp_expired by code alone says the same", friendlyAuthError({ code: "otp_expired", message: "" }).includes("didn't match"));
  ok("the send limit says wait", friendlyAuthError({ message: "over_email_send_rate_limit" }).includes("Too many"));
  ok("a network failure says so", friendlyAuthError(new TypeError("Failed to fetch")).includes("reach the cloud"));
  const badEmail = friendlyAuthError({ message: "Unable to validate email address: invalid format" });
  ok("a malformed email is about the email", badEmail.includes("email address"));
  ok("…and never about a code that was never sent", !/code/i.test(badEmail));
  ok("GoTrue's email_address_invalid code is about the email too", !/code/i.test(friendlyAuthError({ code: "email_address_invalid", message: "Email address is invalid" })));
  ok("closed signups say so", friendlyAuthError({ message: "Signups not allowed for otp" }).includes("closed"));
  check("a long raw message is never echoed", friendlyAuthError({ message: "x".repeat(500) }), "Sign-in didn't work. Try again in a moment.");
  ok("a token in a message is never echoed", !friendlyAuthError({ message: "bad access_token eyJhbGciOi" }).includes("eyJ"));
  ok("even a short unknown message is not echoed", !friendlyAuthError({ message: "weird thing" }).includes("weird"));
  ok("undefined doesn't throw", typeof friendlyAuthError(undefined) === "string");

  check("the zip is dated in the writer's own day", archiveFilename(new Date(2026, 8, 24, 23, 30)), "novella-everything-2026-09-24.zip");
  check("single-digit months and days are padded", archiveFilename(new Date(2027, 0, 5, 9)), "novella-everything-2027-01-05.zip");

  ok("a 2xx object is ok", readFunctionReply(200, { url: "https://p" }, "f").ok);
  check(
    "a refusal shows the server's own sentence",
    readFunctionReply(409, { message: "Your subscription is still active. Cancel it first." }, "f"),
    { ok: false, message: "Your subscription is still active. Cancel it first." },
  );
  check("an HTML error page falls back", readFunctionReply(500, "<html>", "fallback"), { ok: false, message: "fallback" });
  check("an overlong message falls back", readFunctionReply(400, { message: "x".repeat(500) }, "fallback"), { ok: false, message: "fallback" });
  check("a 200 with no body falls back", readFunctionReply(200, null, "fallback"), { ok: false, message: "fallback" });

  check("an https handoff passes", handoffUrl({ ok: true, body: { url: "https://buy.paddle.com/x" } }, "f"), { ok: true, url: "https://buy.paddle.com/x" });
  check("an http handoff is refused", handoffUrl({ ok: true, body: { url: "http://evil.example" } }, "f"), { ok: false, message: "f" });
  check("a javascript: handoff is refused", handoffUrl({ ok: true, body: { url: "javascript:alert(1)" } }, "f"), { ok: false, message: "f" });
  check("a refusal passes through", handoffUrl({ ok: false, message: "No." }, "f"), { ok: false, message: "No." });

  check("free is offered both upgrades", planChoices({ tier: "free", status: "active" }), ["upgrade-plus", "upgrade-pro"]);
  check("plus is offered the portal, never a second checkout", planChoices({ tier: "plus", status: "active" }), ["manage"]);
  check("pro is offered the portal", planChoices({ tier: "pro", status: "past_due" }), ["manage"]);
  check("a canceled plan can buy again", planChoices({ tier: "plus", status: "canceled" }), ["upgrade-plus", "upgrade-pro"]);

  check("share of a limit", shareOf(50, 200), 0.25);
  check("share clamps above", shareOf(300, 200), 1);
  check("share of a zero limit is empty, not NaN", shareOf(5, 0), 0);

  /* ============================================================
     Checkout
     ============================================================ */

  check(
    "price ids: numbers and unknown keys dropped",
    parsePaddlePrices('{"plusMonthly":"pri_01a","proYearly":"pri_02b","proMonthly":42,"junk":"pri_x","plusYearly":"price_1"}'),
    { plusMonthly: "pri_01a", proYearly: "pri_02b" },
  );
  check("price ids: bad JSON is none", parsePaddlePrices("not json"), {});
  check("price ids: an array is none", parsePaddlePrices('["pri_1"]'), {});

  check(
    "a checkout request",
    validateCheckoutRequest({ kind: "checkout", tier: "plus", period: "yearly" }),
    { ok: true, value: { kind: "checkout", tier: "plus", period: "yearly" } },
  );
  const refused = (raw: unknown) => {
    const r = validateCheckoutRequest(raw);
    return r.ok ? 0 : r.status;
  };
  check("free is not for sale", refused({ kind: "checkout", tier: "free", period: "monthly" }), 400);
  check("weekly is not a period", refused({ kind: "checkout", tier: "pro", period: "weekly" }), 400);
  check("a portal request", validateCheckoutRequest({ kind: "portal" }), { ok: true, value: { kind: "portal" } });
  check("null is refused", refused(null), 400);
  check("an unknown kind is refused", refused({ kind: "refund" }), 400);

  check("pro monthly", priceKeyFor("pro", "monthly"), "proMonthly");
  check("plus yearly", priceKeyFor("plus", "yearly"), "plusYearly");
  check("the paid tiers are the app's paid tiers", TIERS.filter((t) => t !== "free"), ["plus", "pro"]);

  check("sandbox on 1", paddleBase("1"), "https://sandbox-api.paddle.com");
  check("sandbox on TRUE with spaces", paddleBase(" TRUE "), "https://sandbox-api.paddle.com");
  check("live when unset", paddleBase(""), "https://api.paddle.com");
  check("live on 0", paddleBase("0"), "https://api.paddle.com");

  check(
    "the transaction carries the user id for the webhook",
    transactionBody("pri_01a", "u-1"),
    { items: [{ price_id: "pri_01a", quantity: 1 }], custom_data: { user_id: "u-1" } },
  );

  check("checkout url from Paddle's reply", checkoutUrlOf({ data: { checkout: { url: "https://buy.paddle.com/x" } } }), "https://buy.paddle.com/x");
  check("no default payment link is no url", checkoutUrlOf({ data: { checkout: { url: null } } }), null);
  check("an http url is no url", checkoutUrlOf({ data: { checkout: { url: "http://evil" } } }), null);
  check("nothing is no url", checkoutUrlOf(undefined), null);

  const noLink = checkoutReply(null);
  ok("no payment link is a 503 that says so", !noLink.ok && noLink.status === 503 && noLink.message.includes("payment link"));
  const noPortal = portalReply("");
  ok("no portal url is a 503", !noPortal.ok && noPortal.status === 503);
  check("a portal url passes", portalReply(" https://customer-portal.paddle.com/cpl_1 "), { ok: true, value: { url: "https://customer-portal.paddle.com/cpl_1" } });

  const twice = checkoutAllowed({ status: "active", provider_subscription_id: "sub_1" });
  ok("a live subscription can't buy a second one", !twice.ok && twice.status === 409 && twice.message.includes("Manage subscription"));
  ok("no entitlement can buy", checkoutAllowed(null).ok);
  ok("a canceled subscription can buy again", checkoutAllowed({ status: "canceled", provider_subscription_id: "sub_1" }).ok);
  ok("a row with no subscription can buy", checkoutAllowed({ status: "active", provider_subscription_id: null }).ok);
  // The two refusals — "don't delete while charging" and "don't sell
  // twice" — must agree on what counts as still charging.
  for (const status of ["active", "trialing", "past_due", "paused", "canceled"]) {
    const entitlement = { status, provider_subscription_id: "sub_1" };
    const deletionBlocked = (() => {
      const r = checkDeletion({ accountEmail: "w@x.io", typed: "w@x.io", entitlement });
      return !r.ok && r.status === 409;
    })();
    ok(`"${status}" is live to both checkout and deletion, or to neither`, deletionBlocked === !checkoutAllowed(entitlement).ok);
  }

  /* ============================================================
     The client side of our functions
     ============================================================ */

  const access = { url: "https://p.supabase.co", anonKey: "anon", token: "t" };
  {
    let seen: { url: string; init: RequestInit } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ url: "https://customer-portal.paddle.com/x" }), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await callFunction(access, "create-checkout", { kind: "portal" }, fakeFetch);
    const s = seen as { url: string; init: RequestInit } | null;
    check("the function url", s?.url, "https://p.supabase.co/functions/v1/create-checkout");
    check("POST", s?.init.method, "POST");
    const headers = (s?.init.headers ?? {}) as Record<string, string>;
    check("the session token goes as Bearer", headers.Authorization, "Bearer t");
    check("the publishable key goes as apikey", headers.apikey, "anon");
    check("the body round-trips", JSON.parse(String(s?.init.body)), { kind: "portal" });
    check("the reply is parsed", res, { status: 200, body: { url: "https://customer-portal.paddle.com/x" } });
  }
  await rejectsWith(
    "a network failure is a sentence, not a TypeError",
    () => callFunction(access, "create-checkout", {}, (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch),
    "reach the cloud",
  );
  {
    const html = await callFunction(access, "delete-account", {}, (async () => new Response("<html>bad gateway</html>", { status: 502 })) as unknown as typeof fetch);
    check("a non-JSON reply keeps its status and no body", html, { status: 502, body: null });
  }
  await rejectsWith(
    "a 503 from the function becomes exactly its sentence",
    () => requestHandoff(access, { kind: "checkout", tier: "pro", period: "monthly" }, "fallback", (async () =>
      new Response(JSON.stringify({ message: "That plan isn't on sale yet." }), { status: 503 })) as unknown as typeof fetch),
    "That plan isn't on sale yet.",
  );
  await rejectsWith(
    "a 200 whose url isn't https is refused with the fallback",
    () => requestHandoff(access, { kind: "portal" }, "fallback sentence", (async () =>
      new Response(JSON.stringify({ url: "http://evil.example" }), { status: 200 })) as unknown as typeof fetch),
    "fallback sentence",
  );
  check(
    "a good checkout hands back its url",
    await requestHandoff(access, { kind: "portal" }, "f", (async () =>
      new Response(JSON.stringify({ url: "https://buy.paddle.com/t" }), { status: 200 })) as unknown as typeof fetch),
    "https://buy.paddle.com/t",
  );

  /* ============================================================
     The one client
     ============================================================ */

  const callers = sourceFiles("src")
    .filter((f) => /cloudClient\(/.test(readFileSync(f, "utf8")))
    .map((f) => f.replace(/\\/g, "/"))
    .sort();
  check(
    "only auth.ts creates the Supabase client (the keychain half depends on it)",
    callers,
    ["src/cloud/auth.ts", "src/cloud/supabaseRemote.ts"],
  );

  // The sync host and the Novella AI connection each wait for a seam to
  // be filled; nothing fails loudly if the one call that fills both goes
  // missing in a merge — sync just never starts and Novella AI reads as
  // signed out forever.
  const mainSource = readFileSync("src/main.tsx", "utf8");
  check("main.tsx hands the sign-in to sync and Novella AI", /^wireCloud\(\);$/m.test(mainSource), true);
  check("the Account tab shows cloud books", /<CloudBooksSection \/>/.test(readFileSync("src/cloud/AccountTab.tsx", "utf8")), true);

  if (failures > 0) {
    console.error(`\ntest-account: ${failures} of ${checks} checks failed`);
    process.exit(1);
  }
  console.log(`test-account: ${checks} checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
