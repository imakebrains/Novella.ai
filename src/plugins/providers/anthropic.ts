import type { NovellaPlugin } from "../../core/plugins";
import type { StreamingAIProvider } from "../runtime";
import { CLAUDE_MODELS, acceptsTemperature } from "../../ai/models";

/* Claude, via the official Anthropic SDK.

   Not routed through the OpenAI-compatible provider — Anthropic speaks its
   own dialect (`/v1/messages`, `x-api-key` rather than a bearer token, an
   `anthropic-version` header, and a different streaming event shape). The
   SDK handles all of that, so this stays small.

   One quirk worth knowing: Opus 4.8, Opus 4.7, Sonnet 5, and Fable 5 REJECT
   `temperature` with a 400 — it isn't ignored, the request fails outright.
   The catalog in ai/models.ts records which models accept it, and the call
   below omits it for the rest. */

export const anthropicProvider: NovellaPlugin = {
  id: "provider-anthropic",
  name: "Claude (Anthropic)",
  category: "ai",
  description:
    "Opus, Sonnet, Haiku and Fable via your own Anthropic API key. Frontier prose quality.",
  settingsSchema: [
    { key: "apiKey", label: "API key", kind: "password", secret: true },
    {
      key: "model",
      label: "Model",
      kind: "select",
      options: CLAUDE_MODELS.map((m) => m.id),
    },
    { key: "temperature", label: "Temperature", kind: "number", placeholder: "1.0" },
  ],

  onEnable(ctx) {
    const modelId = () => ctx.settings.get<string>("model") || "claude-opus-4-8";
    const apiKey = () => ctx.settings.get<string>("apiKey") || "";
    const temperature = () => {
      const raw = ctx.settings.get<string | number>("temperature");
      const n = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };

    const provider: StreamingAIProvider = {
      slash: "/claude",

      async generate(req) {
        let out = "";
        await provider.generateStream(req, (chunk) => {
          out += chunk;
        });
        return out;
      },

      async generateStream(req, onChunk, signal) {
        const key = apiKey();
        if (!key) throw new Error("Add your Anthropic API key in Settings → AI.");

        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = new Anthropic({
          apiKey: key,
          // This is a desktop app using the writer's own key on their own
          // machine — the usual "don't ship your key to browsers" hazard
          // doesn't apply. The key never leaves this device except to
          // Anthropic.
          dangerouslyAllowBrowser: true,
        });

        const model = modelId();
        const temp = temperature();

        const stream = client.messages.stream(
          {
            model,
            max_tokens: req.maxTokens ?? 1024,
            system: req.system,
            messages: [{ role: "user", content: req.prompt }],
            // Only sent to models that accept it — see the note above.
            ...(temp !== undefined && acceptsTemperature(model)
              ? { temperature: temp }
              : {}),
          },
          { signal },
        );

        stream.on("text", (delta) => onChunk(delta));

        const message = await stream.finalMessage();

        // Safety classifiers can decline a request: HTTP 200, empty or
        // partial content, stop_reason "refusal". Surfacing it beats
        // returning an empty string and letting the writer wonder.
        if (message.stop_reason === "refusal") {
          throw new Error(
            "Claude declined this request. Try rephrasing, or switch to a local model for this scene.",
          );
        }

        return message.content
          .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
          .map((b) => b.text)
          .join("");
      },
    };

    ctx.registerProvider(provider);
  },
};
