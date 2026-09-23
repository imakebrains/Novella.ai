/* ============================================================
   "Novella AI" — the Pro plan's built-in model, as a provider

   The same StreamingAIProvider shape as the Ollama and Claude
   connections, so it can sit in the Connections list and be picked
   per role like any other. The difference is where the key lives:
   nowhere near this device. The request goes to the `ai` function
   with the writer's session token, and the function holds the key,
   checks the plan and meters the call (supabase/functions/ai).

   The protocol back is the small one in supabase/functions/_shared/
   aiCore.ts — shared, not duplicated, so the parser here and the
   encoder there cannot drift apart.

   When the allowance runs out the function answers 402 with a
   sentence; that sentence becomes the thrown error, and the role
   router's existing fallback ("the next connection answers, and the
   app says so") takes over. Nothing new is needed for that path.
   ============================================================ */

import type { StreamingAIProvider } from "../plugins/runtime";
import { HostedEventParser } from "../../supabase/functions/_shared/aiCore";

export interface HostedAccess {
  /** The Supabase project URL. */
  url: string;
  /** The publishable key — Supabase's gateway wants it alongside the
      session token. Public by design; see cloud/config.ts. */
  anonKey: string;
  /** The signed-in writer's current access token. */
  token: string;
}

export interface MeterReading {
  usedMicroUsd: number;
  allowanceMicroUsd: number;
}

export interface HostedProviderOptions {
  /** Current credentials, or null when signed out. Called per request
      so a refreshed token is always the one sent. */
  access: () => Promise<HostedAccess | null>;
  /** Told the new meter reading after every finished answer. */
  onMeter?: (reading: MeterReading) => void;
  /** Injected in tests; the global fetch otherwise. */
  fetchImpl?: typeof fetch;
  slash?: string;
}

export function makeHostedProvider(opts: HostedProviderOptions): StreamingAIProvider {
  const doFetch = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  const provider: StreamingAIProvider = {
    slash: opts.slash ?? "/novella",

    async generate(req) {
      let out = "";
      await provider.generateStream(req, (chunk) => {
        out += chunk;
      });
      return out;
    },

    async generateStream(req, onChunk, signal) {
      const access = await opts.access();
      if (!access) throw new Error("Sign in to use Novella AI.");

      let res: Response;
      try {
        res = await doFetch(`${access.url}/functions/v1/ai`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${access.token}`,
            apikey: access.anonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ system: req.system, prompt: req.prompt, maxTokens: req.maxTokens }),
          signal,
        });
      } catch (err) {
        if (signal?.aborted) throw err;
        throw new Error("Novella AI couldn't be reached. Check the connection, or use a local model for now.");
      }

      if (!res.ok || !res.body) {
        let message = "Novella AI couldn't answer that.";
        try {
          const body = (await res.json()) as { message?: unknown };
          if (typeof body.message === "string" && body.message.length < 400) message = body.message;
        } catch {
          // keep the generic sentence
        }
        throw new Error(message);
      }

      const parser = new HostedEventParser();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let out = "";
      for (;;) {
        const { done, value } = await reader.read();
        const events = parser.push(done ? decoder.decode() : decoder.decode(value, { stream: true }));
        for (const event of events) {
          if (event.type === "text") {
            out += event.text;
            onChunk(event.text);
          } else if (event.type === "error") {
            throw new Error(event.message);
          } else {
            opts.onMeter?.({ usedMicroUsd: event.usedMicroUsd, allowanceMicroUsd: event.allowanceMicroUsd });
            return out;
          }
        }
        if (done) break;
      }
      // The stream closed without a verdict: a dropped connection
      // mid-answer. Say so rather than hand back half a paragraph as
      // if it were the whole thing.
      throw new Error("Novella AI's answer was cut off partway. Try again to get the whole thing.");
    },
  };

  return provider;
}
