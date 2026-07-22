import type { NovellaPlugin } from "../../core/plugins";
import type { StreamingAIProvider } from "../runtime";

/* Ollama, streaming.

   core/plugins.ts ships an `ollamaProvider` already, kept there as the
   reference implementation. This one is what the app actually loads,
   for two reasons the reference version can't cover:

     1. Streaming. AIProvider.generate resolves once with the whole
        string. Watching prose arrive word by word is most of the value
        of a writing assistant, so this adds generateStream().
     2. Errors. The reference version does `(data.response || "").trim()`,
        which turns "model not found" into an empty string — the user
        sees nothing happen and has no idea why. This surfaces the real
        message.

   Same NovellaPlugin interface, so the plugin system is unchanged. */

const HOST = "http://localhost:11434";

export interface OllamaModel {
  name: string;
  sizeBytes: number;
}

/** Ask the local daemon what's installed. Empty list = nothing pulled yet. */
export async function listOllamaModels(signal?: AbortSignal): Promise<OllamaModel[]> {
  const res = await fetch(`${HOST}/api/tags`, { signal });
  if (!res.ok) throw new Error(`Ollama returned ${res.status} listing models`);
  const data = (await res.json()) as { models?: { name: string; size: number }[] };
  return (data.models ?? []).map((m) => ({ name: m.name, sizeBytes: m.size }));
}

export async function ollamaReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${HOST}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

export interface PullProgress {
  status: string;
  /** 0–1, or null while Ollama is still resolving the manifest. */
  fraction: number | null;
  receivedBytes: number;
  totalBytes: number;
}

/** Download a model through Ollama's own API, reporting progress.
 *
 *  This is what makes the one-install rule true for the model: no terminal,
 *  no `ollama pull`, no leaving the app. Ollama streams NDJSON progress
 *  which maps directly onto a progress bar. */
export async function pullOllamaModel(
  model: string,
  onProgress: (p: PullProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${HOST}/api/pull`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({ model, stream: true }),
  });

  if (!res.ok) throw new Error(await readError(res));
  if (!res.body) throw new Error("Ollama sent no response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: { status?: string; error?: string; total?: number; completed?: number };
      try {
        parsed = JSON.parse(trimmed) as typeof parsed;
      } catch {
        continue;
      }
      if (parsed.error) throw new Error(parsed.error);

      const total = parsed.total ?? 0;
      const completed = parsed.completed ?? 0;
      onProgress({
        status: parsed.status ?? "working",
        fraction: total > 0 ? completed / total : null,
        receivedBytes: completed,
        totalBytes: total,
      });
    }
  }
}

/** The model Novella installs by default. Chosen for prose quality at a
    size most machines can actually run. */
export const DEFAULT_MODEL = "llama3.1:8b";
export const DEFAULT_MODEL_GB = 4.9;

/** Pull the real error text out of an Ollama failure response. */
async function readError(res: Response): Promise<string> {
  let detail = "";
  try {
    const body = (await res.json()) as { error?: string };
    detail = body.error ?? "";
  } catch {
    /* non-JSON body */
  }
  if (res.status === 404 && detail.includes("not found")) {
    return `${detail}. Pull it first: ollama pull <model>`;
  }
  return detail || `Ollama returned HTTP ${res.status}`;
}

export const ollamaStreamingProvider: NovellaPlugin = {
  id: "provider-ollama-streaming",
  name: "Local model (Ollama)",
  category: "ai",
  description: "Free, unlimited, offline drafting on your own machine. Streams as it writes.",
  settingsSchema: [
    { key: "model", label: "Model", kind: "text", placeholder: "llama3.1:8b" },
    { key: "temperature", label: "Temperature", kind: "number", placeholder: "0.8" },
  ],

  onEnable(ctx) {
    const modelName = (): string => ctx.settings.get<string>("model") || "llama3.1:8b";
    const temperature = (): number => {
      const raw = ctx.settings.get<string | number>("temperature");
      const n = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(n) && n > 0 ? n : 0.8;
    };

    const provider: StreamingAIProvider = {
      slash: "/local",

      async generate(req) {
        let out = "";
        await provider.generateStream(req, (chunk) => {
          out += chunk;
        });
        return out;
      },

      async generateStream(req, onChunk, signal) {
        const res = await fetch(`${HOST}/api/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal,
          body: JSON.stringify({
            model: modelName(),
            system: req.system,
            prompt: req.prompt,
            stream: true,
            options: {
              temperature: temperature(),
              num_predict: req.maxTokens ?? 600,
            },
          }),
        });

        if (!res.ok) throw new Error(await readError(res));
        if (!res.body) throw new Error("Ollama sent no response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let full = "";

        // Ollama streams NDJSON: one JSON object per line.
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let parsed: { response?: string; error?: string; done?: boolean };
            try {
              parsed = JSON.parse(trimmed) as typeof parsed;
            } catch {
              continue; // partial line, picked up next round
            }
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.response) {
              full += parsed.response;
              onChunk(parsed.response);
            }
          }
        }

        return full;
      },

      estimateCost(req) {
        // Local inference costs nothing but time.
        return { tokens: Math.ceil((req.system.length + req.prompt.length) / 4), usd: 0 };
      },
    };

    ctx.registerProvider(provider);
  },
};
