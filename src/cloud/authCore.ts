/* ============================================================
   The Account screen's pure half

   Everything the sign-in form and the Account tab decide without a
   network: who the signed-in user is, which sentence an auth failure
   becomes, what a function's reply means, which plan buttons to offer.
   No imports on purpose, so test-account.ts proves it from node without
   supabase-js, React or a window.

   One rule runs through the error handling: a raw server or library
   message is never put on screen. Auth errors can quote tokens, and a
   writer who mistyped an email deserves a sentence about the email,
   not a stack of GoTrue jargon.
   ============================================================ */

export interface CloudUser {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

function httpsOrUndefined(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  try {
    return new URL(s).protocol === "https:" ? s : undefined;
  } catch {
    return undefined;
  }
}

/** PURE. A supabase-js User, reduced to what the app shows.

    No email means no user as far as this screen is concerned: deleting
    the account is confirmed by typing the email (accountCore.ts), so an
    account without one could sign in but never leave. Every sign-in
    path Novella offers (Google, emailed code) carries an email. */
export function cloudUserFrom(raw: unknown): CloudUser | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const email = str(r.email);
  if (!id || !email) return null;
  const meta = r.user_metadata && typeof r.user_metadata === "object" ? (r.user_metadata as Record<string, unknown>) : {};
  const user: CloudUser = { id, email };
  // Google fills full_name and avatar_url; some identity links only
  // carry the OpenID spellings, name and picture.
  const name = str(meta.full_name) ?? str(meta.name);
  if (name) user.name = name;
  const avatarUrl = httpsOrUndefined(meta.avatar_url) ?? httpsOrUndefined(meta.picture);
  if (avatarUrl) user.avatarUrl = avatarUrl;
  return user;
}

/** PURE. The letter in the avatar circle. The picture itself is not
    shown: both content security policies (vite.config.ts and
    tauri.conf.json) allow images only from the app itself, so a Google
    avatar would be a broken image. Array.from so a name starting with
    an emoji or a non-BMP letter isn't cut in half. */
export function initialOf(user: Pick<CloudUser, "email" | "name">): string {
  const first = Array.from((user.name ?? user.email).trim())[0] ?? "?";
  return first.toUpperCase();
}

/** PURE. The sentence a failed sign-in step shows. Never the raw
    message — see the header. Order matters: the email-address check
    runs before the code check, because GoTrue calls a malformed address
    "invalid" too, and "your code didn't match" before any code was sent
    would be a lie. */
export function friendlyAuthError(err: unknown): string {
  const message = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err ?? "");
  const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
  const text = `${code} ${message}`;
  if (/Failed to fetch|NetworkError|Load failed|fetch failed|ECONNREFUSED|ETIMEDOUT/i.test(text)) {
    return "Couldn't reach the cloud. Check the connection and try again.";
  }
  if (/rate.?limit|too many/i.test(text)) {
    return "Too many codes requested. Wait a minute and try again.";
  }
  if (/email_address_invalid|invalid format|validate email|invalid email|email address.*invalid/i.test(text)) {
    return "That doesn't look like an email address. Check it and try again.";
  }
  if (/signups? (not allowed|disabled)|signup_disabled/i.test(text)) {
    return "New accounts are closed right now.";
  }
  if (/otp_expired|otp_disabled|token has expired|token.*invalid|invalid.*(otp|token|code)/i.test(text)) {
    return "That code didn't match or has expired. Ask for a new one.";
  }
  return "Sign-in didn't work. Try again in a moment.";
}

/** PURE. The form's email, as the server compares it. */
export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

/** PURE. Good enough to be worth sending a code to. The server has
    the final word; this only keeps an obvious typo from costing one of
    the few codes an hour the mailer allows. */
export function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/** PURE. Codes get pasted as "123 456" or "123-456"; the server wants
    the digits alone. */
export function normalizeCode(s: string): string {
  return s.replace(/\D/g, "");
}

/** PURE. The download-everything file, dated in the writer's own day
    rather than UTC's — "the zip I made today" should say today. */
export function archiveFilename(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `novella-everything-${y}-${m}-${d}.zip`;
}

export type FunctionReply = { ok: true; body: Record<string, unknown> } | { ok: false; message: string };

/** PURE. What one of our own edge functions said. Their error bodies
    are `{ message }`, written as sentences for the writer (see
    delete-account and create-checkout), so those are shown verbatim —
    unless they are long enough to be something else, like an HTML error
    page from a gateway, in which case the caller's fallback is. */
export function readFunctionReply(status: number, body: unknown, fallback: string): FunctionReply {
  const obj = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (status >= 200 && status < 300 && obj) return { ok: true, body: obj };
  const message = obj && typeof obj.message === "string" && obj.message.trim() && obj.message.length < 400 ? obj.message : fallback;
  return { ok: false, message };
}

/** PURE. The URL a checkout or portal reply hands back, or the
    sentence to show instead. https only: this URL is opened in the
    writer's browser to take a card number. */
export function handoffUrl(reply: FunctionReply, fallback: string): { ok: true; url: string } | { ok: false; message: string } {
  if (!reply.ok) return reply;
  const url = httpsOrUndefined(reply.body.url);
  return url ? { ok: true, url } : { ok: false, message: fallback };
}

export type PlanChoice = "upgrade-plus" | "upgrade-pro" | "manage";

/** PURE. Which plan buttons the Account tab offers.

    A paid writer is never offered a second checkout: a new Paddle
    transaction is a second subscription, nothing cancels the first,
    and billingCore.decideWrite would then track only the newer one —
    the old card charge would keep running where the app can't see it.
    Changing plan while subscribed goes through Paddle's own portal,
    which prorates. The server refuses the same case (checkoutCore's
    checkoutAllowed); this keeps the button from being offered at all. */
export function planChoices(account: { tier: "free" | "plus" | "pro"; status: string }): PlanChoice[] {
  if (account.tier === "free" || account.status === "canceled") return ["upgrade-plus", "upgrade-pro"];
  return ["manage"];
}

/** PURE. 0–1 of a limit, clamped, for a meter's width. */
export function shareOf(used: number, max: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(1, Math.max(0, used / max));
}
