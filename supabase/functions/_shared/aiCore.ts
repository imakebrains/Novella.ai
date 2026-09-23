/* ============================================================
   Hosted AI — the rules, without the runtime

   The Pro plan's built-in AI runs through one Supabase function
   (supabase/functions/ai). Everything that function DECIDES lives
   here as plain TypeScript with no Deno and no network, so
   test-cloud-server.ts can pin every rule down from node:

   - what a request may contain (a system prompt, one prompt, a size
     — never raw `messages`, tools or a model we didn't list, because
     a proxy holding our key is a free Claude for anyone who can shape
     its request)
   - what a finished request cost, in millionths of a dollar
   - whether the writer has allowance left
   - which origins may call it
   - the tiny event protocol the app reads back

   The app never sees Anthropic's event stream. It sees ours: text
   chunks, then one "done" or one "error". That keeps the key, the
   upstream error bodies and the model's metadata on the server, and
   it means the app's parser is ten lines, not a copy of the SDK's.
   ============================================================ */

/** Models the proxy will call. Prices are Anthropic's first-party
    rates per million tokens (the claude-api reference, cached
    2026-06-24; confirm against the live pricing page before launch). */
export const HOSTED_MODELS = {
  "claude-opus-5": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-sonnet-5": { inputPerMTok: 2, outputPerMTok: 10 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
} as const;

export type HostedModel = keyof typeof HOSTED_MODELS;

/** The model used when the app doesn't ask for one. The owner can
    override it with the DEFAULT_MODEL function secret; docs/CLOUD.md
    has the allowance maths for each choice. */
export const DEFAULT_HOSTED_MODEL: HostedModel = "claude-opus-5";

export function isHostedModel(value: unknown): value is HostedModel {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(HOSTED_MODELS, value);
}

/** The most a single request may ask for. The app's own calls use
    1–4k; 8k leaves room for a long scene without letting one request
    eat a week of someone's allowance. */
export const MAX_OUTPUT_TOKENS = 8192;
export const MIN_OUTPUT_TOKENS = 256;
/** ~50k tokens of context — a scene plus every codex entry it names
    fits several times over. */
export const MAX_INPUT_CHARS = 200_000;

export interface HostedRequest {
  system: string;
  prompt: string;
  maxTokens: number;
  model: HostedModel;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; status: number; message: string };

/** PURE. The body the app sent, as a request we are willing to make. */
export function validateHostedRequest(raw: unknown, defaultModel: HostedModel = DEFAULT_HOSTED_MODEL): Checked<HostedRequest> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, status: 400, message: "The request wasn't understood." };
  }
  const r = raw as Record<string, unknown>;
  const allowed = new Set(["system", "prompt", "maxTokens", "model"]);
  for (const key of Object.keys(r)) {
    if (!allowed.has(key)) return { ok: false, status: 400, message: `The request carried a field this service doesn't accept: ${key.slice(0, 40)}.` };
  }
  const system = r.system === undefined ? "" : r.system;
  if (typeof system !== "string") return { ok: false, status: 400, message: "The system prompt must be text." };
  if (typeof r.prompt !== "string" || r.prompt.trim() === "") {
    return { ok: false, status: 400, message: "There was nothing to send." };
  }
  if (system.length + r.prompt.length > MAX_INPUT_CHARS) {
    return { ok: false, status: 413, message: "That's more context than the built-in AI takes in one go. Trim the scene or the codex entries it pulls in." };
  }
  const requested = r.maxTokens === undefined ? 2048 : r.maxTokens;
  if (typeof requested !== "number" || !Number.isFinite(requested)) {
    return { ok: false, status: 400, message: "The response length must be a number." };
  }
  const maxTokens = Math.round(Math.min(MAX_OUTPUT_TOKENS, Math.max(MIN_OUTPUT_TOKENS, requested)));
  const model = r.model === undefined ? defaultModel : r.model;
  if (!isHostedModel(model)) return { ok: false, status: 400, message: "That model isn't offered by the built-in AI." };
  return { ok: true, value: { system, prompt: r.prompt, maxTokens, model } };
}

export interface TokenUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** PURE. What a request cost us, in millionths of a dollar, rounded UP.

    Cache writes bill at 1.25× input and reads at 0.1× (5-minute TTL).
    A model the table doesn't know — a server-side fallback answering
    with something new — is charged at the most expensive listed rate:
    over-metering by a cent is a better failure than a free request. */
export function costMicroUsd(model: string, usage: TokenUsage): number {
  const price = isHostedModel(model) ? HOSTED_MODELS[model] : mostExpensive();
  const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  // $/MTok is exactly µ$/token, which is why there is no scaling here.
  const micro =
    n(usage.input_tokens) * price.inputPerMTok +
    n(usage.cache_creation_input_tokens) * price.inputPerMTok * 1.25 +
    n(usage.cache_read_input_tokens) * price.inputPerMTok * 0.1 +
    n(usage.output_tokens) * price.outputPerMTok;
  return Math.ceil(micro);
}

function mostExpensive(): { inputPerMTok: number; outputPerMTok: number } {
  return Object.values(HOSTED_MODELS).reduce((a, b) => (b.outputPerMTok > a.outputPerMTok ? b : a));
}

/** PURE. Output tokens for a stream cut off before the final usage
    arrived — the writer pressed Stop. Anthropic bills what was
    generated, which is roughly what was streamed; four characters a
    token is the usual English-prose ratio, rounded up. */
export function estimateOutputTokens(streamedChars: number): number {
  return Math.ceil(Math.max(0, streamedChars) / 4);
}

export interface Allowance {
  tier: string;
  aiMonthlyMicroUsd: number;
  aiUsedMicroUsd: number;
}

/** PURE. May this writer start a request right now?

    Checked before, charged after. A request that starts with a cent
    left is allowed to finish and may take the meter slightly past the
    line; refusing mid-sentence would be worse than the overshoot,
    which MAX_OUTPUT_TOKENS bounds. */
export function checkAllowance(a: Allowance): Checked<{ remainingMicroUsd: number }> {
  if (a.aiMonthlyMicroUsd <= 0) {
    return { ok: false, status: 403, message: "Built-in AI is part of Pro. Your own connections in Settings still work on every plan." };
  }
  const remaining = a.aiMonthlyMicroUsd - a.aiUsedMicroUsd;
  if (remaining <= 0) {
    return {
      ok: false,
      status: 402,
      message: "This month's built-in AI allowance is used up. It resets on the 1st; until then your own connections still answer.",
    };
  }
  return { ok: true, value: { remainingMicroUsd: remaining } };
}

/** PURE. Is this browser origin one of ours? `allowed` is the
    ALLOWED_ORIGINS secret split on commas. No wildcard support, on
    purpose — a pattern is one typo from matching an attacker's page. */
export function originAllowed(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  return allowed.some((a) => a.trim() !== "" && a.trim() === origin);
}

/* ------------------------------------------------------------
   The event protocol back to the app

   Server-sent events, one JSON object per `data:` line:
     {"type":"text","text":"…"}                  any number
     {"type":"done","stopReason":"…","usedMicroUsd":n,"allowanceMicroUsd":n}
     {"type":"error","message":"…"}              instead of done
   ------------------------------------------------------------ */

export type HostedEvent =
  | { type: "text"; text: string }
  | { type: "done"; stopReason: string | null; usedMicroUsd: number; allowanceMicroUsd: number }
  | { type: "error"; message: string };

export function encodeEvent(event: HostedEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Parses the stream incrementally. Feed it chunks as they arrive;
    it returns every complete event and keeps the partial tail. */
export class HostedEventParser {
  private buffer = "";

  push(chunk: string): HostedEvent[] {
    this.buffer += chunk;
    const out: HostedEvent[] = [];
    let cut: number;
    while ((cut = this.buffer.indexOf("\n\n")) >= 0) {
      const frame = this.buffer.slice(0, cut);
      this.buffer = this.buffer.slice(cut + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const event = parseEvent(line.slice(5).trim());
        if (event) out.push(event);
      }
    }
    return out;
  }
}

function parseEvent(json: string): HostedEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.type === "text" && typeof r.text === "string") return { type: "text", text: r.text };
  if (r.type === "error" && typeof r.message === "string") return { type: "error", message: r.message };
  if (r.type === "done" && typeof r.usedMicroUsd === "number" && typeof r.allowanceMicroUsd === "number") {
    return {
      type: "done",
      stopReason: typeof r.stopReason === "string" ? r.stopReason : null,
      usedMicroUsd: r.usedMicroUsd,
      allowanceMicroUsd: r.allowanceMicroUsd,
    };
  }
  return null;
}
