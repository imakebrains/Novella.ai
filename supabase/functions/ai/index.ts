// ============================================================
// Hosted AI for Pro — Supabase Edge Function (Deno)
//
// The one place Novella's own Anthropic key is used. It never leaves
// this function: the app sends a prompt with the writer's session
// token, and gets back text chunks in the small protocol defined in
// ../_shared/aiCore.ts. Every rule — what a request may contain,
// what it costs, whether there is allowance left — lives in that
// file and is tested from node; this file is the plumbing.
//
// Secrets (set with `supabase secrets set`, never committed):
//   ANTHROPIC_API_KEY   the owner's key, billed to the owner
//   ALLOWED_ORIGINS     comma-separated app origins
//   DEFAULT_MODEL       optional; one of HOSTED_MODELS
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
// provided to every function by the platform.
// ============================================================

import Anthropic from "npm:@anthropic-ai/sdk@0.112.4";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import {
  DEFAULT_HOSTED_MODEL,
  checkAllowance,
  costMicroUsd,
  encodeEvent,
  estimateOutputTokens,
  isHostedModel,
  originAllowed,
  validateHostedRequest,
  type HostedEvent,
  type TokenUsage,
} from "../_shared/aiCore.ts";

const env = (name: string) => Deno.env.get(name) ?? "";
const allowedOrigins = env("ALLOWED_ORIGINS").split(",");
const defaultModel = isHostedModel(env("DEFAULT_MODEL")) ? (env("DEFAULT_MODEL") as typeof DEFAULT_HOSTED_MODEL) : DEFAULT_HOSTED_MODEL;
const anthropic = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

function cors(origin: string | null): Record<string, string> {
  if (!originAllowed(origin, allowedOrigins)) return {};
  return {
    "Access-Control-Allow-Origin": origin!,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function refuse(status: number, message: string, origin: string | null): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return refuse(405, "POST only.", origin);
  // Browsers always send Origin on a cross-origin POST. Requests with
  // none (curl, a script) are allowed through to the auth check — the
  // session token is the real gate; CORS only protects browsers.
  if (origin && !originAllowed(origin, allowedOrigins)) return refuse(403, "Unknown origin.", origin);

  // ---- who is asking ----
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return refuse(401, "Sign in to use the built-in AI.", origin);
  const asUser = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await asUser.auth.getUser(token);
  if (userError || !userData.user) return refuse(401, "Your sign-in expired. Sign in again.", origin);
  const userId = userData.user.id;

  // ---- what they asked for ----
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return refuse(400, "The request wasn't understood.", origin);
  }
  const checked = validateHostedRequest(body, defaultModel);
  if (!checked.ok) return refuse(checked.status, checked.message, origin);
  const request = checked.value;

  // ---- whether they can afford it ----
  // my_account() runs as the writer, so it can only ever report on them.
  const { data: account, error: accountError } = await asUser.rpc("my_account");
  if (accountError || !account) return refuse(503, "Couldn't check your plan just now. Try again in a moment.", origin);
  const allowance = {
    tier: String(account.tier),
    aiMonthlyMicroUsd: Number(account.ai_monthly_microusd),
    aiUsedMicroUsd: Number(account.ai_used_microusd),
  };
  const afford = checkAllowance(allowance);
  if (!afford.ok) return refuse(afford.status, afford.message, origin);

  // ---- the call ----
  const encoder = new TextEncoder();
  const upstream = new AbortController();
  req.signal.addEventListener("abort", () => upstream.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: HostedEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          // The writer went away; the finally block still meters.
        }
      };

      let inputTokens = 0;
      let streamedChars = 0;
      let charged = false;
      const charge = async (model: string, usage: TokenUsage) => {
        if (charged) return 0;
        charged = true;
        const micro = costMicroUsd(model, usage);
        await admin.rpc("record_ai_usage", {
          p_user: userId,
          p_microusd: micro,
          p_input_tokens: usage.input_tokens ?? 0,
          p_output_tokens: usage.output_tokens ?? 0,
        });
        return micro;
      };

      try {
        // On Opus 5 a safety-classifier decline is re-run server-side
        // on the model Anthropic recommends for that category, instead
        // of leaving the writer with nothing. `fallbacks: "default"` is
        // the documented form; SDK 0.112.4 only types the older
        // array-of-models form, hence the cast through unknown.
        const fallback =
          request.model === "claude-opus-5"
            ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }
            : {};
        const params = {
          model: request.model,
          max_tokens: request.maxTokens,
          ...(request.system ? { system: request.system } : {}),
          messages: [{ role: "user" as const, content: request.prompt }],
          ...fallback,
        } as unknown as Parameters<typeof anthropic.beta.messages.stream>[0];
        const messageStream = anthropic.beta.messages.stream(params, { signal: upstream.signal });

        messageStream.on("streamEvent", (event) => {
          if (event.type === "message_start") inputTokens = event.message.usage.input_tokens ?? 0;
        });
        messageStream.on("text", (text) => {
          streamedChars += text.length;
          send({ type: "text", text });
        });

        const message = await messageStream.finalMessage();
        // Top-level usage covers the attempt that produced this
        // message, billed at that model's rate (response.model).
        const used = await charge(message.model, message.usage as TokenUsage);
        if (message.stop_reason === "refusal") {
          send({ type: "error", message: "Claude declined this request. Try rephrasing, or use a local model for this scene." });
        } else {
          send({
            type: "done",
            stopReason: message.stop_reason ?? null,
            usedMicroUsd: allowance.aiUsedMicroUsd + used,
            allowanceMicroUsd: allowance.aiMonthlyMicroUsd,
          });
        }
      } catch (err) {
        if (err instanceof Anthropic.APIUserAbortError) {
          // Stopped by the writer: charge what was generated.
          await charge(request.model, { input_tokens: inputTokens, output_tokens: estimateOutputTokens(streamedChars) });
        } else if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
          send({ type: "error", message: "The built-in AI is busy right now. Try again in a minute — nothing was charged." });
        } else if (err instanceof Anthropic.APIError) {
          console.error("anthropic", err.status, err.name);
          send({ type: "error", message: "The built-in AI couldn't answer that. Nothing was charged." });
        } else {
          console.error("ai function", err instanceof Error ? err.name : "unknown");
          send({ type: "error", message: "Something went wrong on our side. Nothing was charged." });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // already closed by an abort
        }
      }
    },
    cancel() {
      upstream.abort();
    },
  });

  return new Response(stream, {
    headers: {
      ...cors(origin),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
    },
  });
});
