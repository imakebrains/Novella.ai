import type { NovellaPlugin } from "../../core/plugins";
import type { StreamingAIProvider } from "../runtime";

/* Any OpenAI-compatible endpoint.

   Most of the industry speaks this dialect, so one plugin covers a great
   many services and local servers:

     OpenAI       https://api.openai.com/v1
     OpenRouter   https://openrouter.ai/api/v1     (hundreds of models)
     Groq         https://api.groq.com/openai/v1
     Together     https://api.together.xyz/v1
     DeepSeek     https://api.deepseek.com/v1
     Mistral      https://api.mistral.ai/v1
     LM Studio    http://localhost:1234/v1         (local, no key)
     llama.cpp    http://localhost:8080/v1         (local, no key)

   The writer supplies base URL, key and model name, so a service that
   launches next year works without waiting for us to add it. */

export const PRESETS: { label: string; baseUrl: string; note: string }[] = [
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1", note: "gpt-4o, gpt-4o-mini" },
  { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", note: "hundreds of models, one key" },
  { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", note: "very fast, free tier" },
  { label: "Together", baseUrl: "https://api.together.xyz/v1", note: "open models" },
  { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", note: "inexpensive" },
  { label: "Mistral", baseUrl: "https://api.mistral.ai/v1", note: "European provider" },
  { label: "LM Studio (local)", baseUrl: "http://localhost:1234/v1", note: "no key needed" },
  { label: "llama.cpp (local)", baseUrl: "http://localhost:8080/v1", note: "no key needed" },
];

async function readError(res: Response): Promise<string> {
  let detail = "";
  try {
    const body = (await res.json()) as { error?: { message?: string } | string };
    detail =
      typeof body.error === "string" ? body.error : (body.error?.message ?? "");
  } catch {
    /* non-JSON body */
  }
  if (res.status === 401) return detail || "Rejected the API key (401).";
  if (res.status === 404) return detail || "Endpoint or model not found (404). Check the base URL.";
  if (res.status === 429) return detail || "Rate limited or out of credit (429).";
  return detail || `Provider returned HTTP ${res.status}`;
}

export const openAICompatibleProvider: NovellaPlugin = {
  id: "provider-openai-compatible",
  name: "Custom model (OpenAI-compatible)",
  category: "ai",
  description:
    "Connect OpenAI, OpenRouter, Groq, DeepSeek, LM Studio — anything speaking the OpenAI API. You supply the endpoint and model.",
  settingsSchema: [
    {
      key: "baseUrl",
      label: "Base URL",
      kind: "text",
      placeholder: "https://api.openai.com/v1",
    },
    { key: "apiKey", label: "API key", kind: "password", secret: true },
    { key: "model", label: "Model", kind: "text", placeholder: "gpt-4o-mini" },
    { key: "temperature", label: "Temperature", kind: "number", placeholder: "0.8" },
  ],

  onEnable(ctx) {
    const baseUrl = () =>
      (ctx.settings.get<string>("baseUrl") || "https://api.openai.com/v1").replace(/\/+$/, "");
    const model = () => ctx.settings.get<string>("model") || "gpt-4o-mini";
    const key = () => ctx.settings.get<string>("apiKey") || "";
    const temperature = () => {
      const raw = ctx.settings.get<string | number>("temperature");
      const n = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(n) && n > 0 ? n : 0.8;
    };

    const provider: StreamingAIProvider = {
      slash: "/custom",

      async generate(req) {
        let out = "";
        await provider.generateStream(req, (chunk) => {
          out += chunk;
        });
        return out;
      },

      async generateStream(req, onChunk, signal) {
        const url = baseUrl();
        const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(url);
        if (!isLocal && !url.startsWith("https://")) {
          throw new Error(
            "Refusing to send your writing and API key over plain HTTP. Use an https:// endpoint.",
          );
        }

        const headers: Record<string, string> = { "content-type": "application/json" };
        const k = key();
        if (k) headers.authorization = `Bearer ${k}`;

        const res = await fetch(`${url}/chat/completions`, {
          method: "POST",
          headers,
          signal,
          body: JSON.stringify({
            model: model(),
            stream: true,
            temperature: temperature(),
            max_tokens: req.maxTokens ?? 600,
            messages: [
              { role: "system", content: req.system },
              { role: "user", content: req.prompt },
            ],
          }),
        });

        if (!res.ok) throw new Error(await readError(res));
        if (!res.body) throw new Error("Provider sent no response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let full = "";

        // Server-sent events: "data: {json}\n\n", terminated by "data: [DONE]".
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;

            let parsed: { choices?: { delta?: { content?: string } }[]; error?: { message?: string } };
            try {
              parsed = JSON.parse(payload) as typeof parsed;
            } catch {
              continue;
            }
            if (parsed.error) throw new Error(parsed.error.message ?? "Provider error");

            const piece = parsed.choices?.[0]?.delta?.content;
            if (piece) {
              full += piece;
              onChunk(piece);
            }
          }
        }

        return full;
      },
    };

    ctx.registerProvider(provider);
  },
};

/** Ask an OpenAI-compatible endpoint what models it offers. */
export async function listRemoteModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const url = baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = {};
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${url}/models`, { headers });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { data?: { id?: string }[] };
  return (data.data ?? [])
    .map((m) => m.id)
    .filter((id): id is string => Boolean(id))
    .sort();
}
