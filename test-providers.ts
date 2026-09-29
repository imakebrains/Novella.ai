/* Assertions for the two providers that talk to anything other than
   Anthropic — Ollama and every OpenAI-compatible endpoint — and for the
   fallback chain in ai/generate.ts that sits on top of them.

   Same shape as test-plugins.ts: silent unless something is wrong,
   non-zero exit when it is.

   Nothing here opens a socket. globalThis.fetch is swapped for a fake
   that hands back canned Response objects, which is enough to prove the
   things a writer actually feels: a reply arriving in pieces is stitched
   back in order, a frame the network cut in half is not dropped, Stop
   really stops, an HTTP error becomes a sentence rather than a stack
   trace, and a key never travels over plain HTTP to a host that merely
   starts with the word "localhost".

   ai/generate.ts pulls in the connections store, which wants localStorage
   and React's useSyncExternalStore at module load. A Map stands in for
   localStorage — the same trick test-plugins.ts uses — and the React
   import is inert outside a component. The store caches its list on the
   first read, so the generate.ts section below starts from an empty
   store and grows it through addConnection() rather than re-seeding
   storage, which would be ignored. */

import { isLocalHost, noConnectionMessage, fallbackNote } from "./src/ai/roles";
import { pluginHost } from "./src/plugins/runtime";
import type { NovellaPlugin } from "./src/core/plugins";
import {
  DEFAULT_MODEL,
  listOllamaModels,
  makeOllamaProvider,
  ollamaReachable,
} from "./src/plugins/providers/ollama";
import {
  PRESETS,
  listRemoteModels,
  makeOpenAICompatibleProvider,
} from "./src/plugins/providers/openaiCompatible";

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

/** The error a promise rejects with, or a failed check when it resolves. */
async function rejects(name: string, run: () => Promise<unknown>): Promise<unknown> {
  checks++;
  try {
    await run();
  } catch (err) {
    return err;
  }
  failures++;
  console.error(`FAIL  ${name}\n        expected a rejection, it resolved`);
  return undefined;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function nameOf(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

/* ---------------- a localStorage, since the stores persist ---------------- */

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

/* ---------------- the fake network ---------------- */

interface FetchCall {
  url: string;
  init: RequestInit;
}

const realFetch = globalThis.fetch;
const calls: FetchCall[] = [];

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

/** Every request from here on is answered by `handler` and logged. */
function fakeFetch(handler: Handler): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    // A real fetch handed an already-fired signal never opens the socket.
    if (init.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    return handler(url, init);
  }) as typeof fetch;
}

function lastCall(): FetchCall {
  const last = calls[calls.length - 1];
  if (!last) throw new Error("no fetch was made");
  return last;
}

function bodyOf(call: FetchCall): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>;
}

function headersOf(call: FetchCall): Record<string, string> {
  return (call.init.headers ?? {}) as Record<string, string>;
}

function json(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), { status });
}

/** A body that arrives in exactly these pieces, in this order. Pass the
    request's signal to get a body that behaves like a real one under
    cancellation: the pending read rejects with AbortError instead of
    quietly reporting done. Such a body never closes on its own, which is
    what holds the provider mid-read for the cancellation checks. */
function streamOf(pieces: string[], signal?: AbortSignal | null): ReadableStream<Uint8Array> {
  const queue = [...pieces];
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      signal?.addEventListener("abort", () => {
        try {
          controller.error(new DOMException("The operation was aborted.", "AbortError"));
        } catch {
          /* already closed or errored */
        }
      });
    },
    pull(controller) {
      const next = queue.shift();
      if (next !== undefined) {
        controller.enqueue(encoder.encode(next));
        return;
      }
      if (!signal) {
        controller.close();
        return;
      }
      return new Promise<void>(() => {});
    },
  });
}

function streamed(pieces: string[], signal?: AbortSignal | null): Response {
  return new Response(streamOf(pieces, signal), { status: 200 });
}

/** Errors the body part-way, the way a dropped connection does — undici
    surfaces that as a TypeError, not an HTTP status. */
function streamThenDrop(pieces: string[]): Response {
  const queue = [...pieces];
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = queue.shift();
      if (next !== undefined) controller.enqueue(encoder.encode(next));
      else controller.error(new TypeError("terminated"));
    },
  });
  return new Response(body, { status: 200 });
}

const req = { system: "You are a novelist.", prompt: "Continue the scene." };

async function main(): Promise<void> {
  /* ================================================================
     Ollama
     ================================================================ */

  {
    // NDJSON, one object per line — and the second object arrives split
    // across two network chunks, which is the case that matters.
    fakeFetch(() =>
      streamed(
        [
          '{"response":"Once "}\n',
          '{"resp',
          'onse":"upon"}\n{"response":" a time"}\n',
          '\n   \nnot json at all\n',
          '{"done":true}\n',
        ],
        null,
      ),
    );
    const provider = makeOllamaProvider(() => ({ host: "http://engine.test:11434/", model: "m" }));

    const chunks: string[] = [];
    const full = await provider.generateStream({ ...req, maxTokens: 42 }, (t) => chunks.push(t));
    check("ollama: chunks arrive in order, split line intact", chunks, ["Once ", "upon", " a time"]);
    check("ollama: the resolved string is the concatenated stream", full, chunks.join(""));

    const call = lastCall();
    check("ollama: trailing slash on the host is stripped", call.url, "http://engine.test:11434/api/generate");
    check("ollama: POST", call.init.method, "POST");
    const body = bodyOf(call);
    check("ollama: model, prompts and streaming go on the wire", [body.model, body.system, body.prompt, body.stream], ["m", req.system, req.prompt, true]);
    check("ollama: maxTokens becomes num_predict", (body.options as Record<string, unknown>).num_predict, 42);
    ok("ollama: no signal means none is forwarded", call.init.signal === undefined);

    const again = await provider.generate(req);
    check("ollama: generate() is the stream, collected", again, "Once upon a time");
    check("ollama: num_predict defaults to 600", (bodyOf(lastCall()).options as Record<string, unknown>).num_predict, 600);
  }

  {
    // The wire always carries a temperature: the writer's own when it is a
    // usable number, 0.8 otherwise. (The Anthropic provider omits it for
    // models that reject it; Ollama has no such model.)
    fakeFetch(() => streamed(['{"response":"x"}\n'], null));
    const temp = async (temperature: number | undefined, model = "m"): Promise<unknown> => {
      await makeOllamaProvider(() => ({ model, temperature })).generate(req);
      return bodyOf(lastCall());
    };
    check("ollama: configured temperature is sent as given", ((await temp(0.3)) as { options: { temperature: number } }).options.temperature, 0.3);
    check("ollama: unset falls back to 0.8", ((await temp(undefined)) as { options: { temperature: number } }).options.temperature, 0.8);
    check("ollama: zero falls back to 0.8", ((await temp(0)) as { options: { temperature: number } }).options.temperature, 0.8);
    check("ollama: NaN falls back to 0.8", ((await temp(Number.NaN)) as { options: { temperature: number } }).options.temperature, 0.8);
    check("ollama: an empty model name means the default model", ((await temp(undefined, "")) as { model: string }).model, DEFAULT_MODEL);
    check("ollama: no host means the local daemon", lastCall().url, "http://localhost:11434/api/generate");
  }

  {
    const provider = makeOllamaProvider(() => ({ model: "zzz" }));

    fakeFetch(() => json(404, { error: "model 'zzz' not found" }));
    let err = await rejects("ollama: 404 rejects", () => provider.generate(req));
    check("ollama: a missing model says how to get it", messageOf(err), "model 'zzz' not found. Pull it first: ollama pull <model>");

    fakeFetch(() => json(404, { error: "no such route" }));
    err = await rejects("ollama: other 404 rejects", () => provider.generate(req));
    check("ollama: a 404 that isn't a missing model keeps the daemon's words", messageOf(err), "no such route");

    fakeFetch(() => new Response("<html>bad gateway</html>", { status: 502 }));
    err = await rejects("ollama: non-JSON error body rejects", () => provider.generate(req));
    check("ollama: a bodyless failure names the status", messageOf(err), "Ollama returned HTTP 502");

    fakeFetch(() => new Response(null, { status: 200 }));
    err = await rejects("ollama: empty 200 rejects", () => provider.generate(req));
    check("ollama: no body is said plainly", messageOf(err), "Ollama sent no response body");

    // An error object mid-stream: what was streamed stays streamed, the
    // rest is a rejection with Ollama's own sentence.
    fakeFetch(() => streamed(['{"response":"half"}\n', '{"error":"out of memory"}\n'], null));
    const got: string[] = [];
    err = await rejects("ollama: mid-stream error rejects", () => provider.generateStream(req, (t) => got.push(t)));
    check("ollama: the mid-stream error is the daemon's message", messageOf(err), "out of memory");
    check("ollama: chunks before the error were delivered", got, ["half"]);

    // The provider does not translate network failures — generate.ts owns
    // that sentence, and is checked below. It must pass the TypeError up
    // untouched so generate.ts can recognise it.
    fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    err = await rejects("ollama: network failure rejects", () => provider.generate(req));
    ok("ollama: a network failure stays a TypeError for generate.ts", err instanceof TypeError);
  }

  {
    // Cancellation. The fake body errors its pending read when the signal
    // fires, which is what a real fetch does.
    const provider = makeOllamaProvider(() => ({ model: "m" }));
    fakeFetch((_url, init) => streamed(['{"response":"one"}\n', '{"response":"two"}\n'], init.signal));

    const controller = new AbortController();
    const got: string[] = [];
    const err = await rejects("ollama: abort mid-stream rejects", () =>
      provider.generateStream(
        req,
        (t) => {
          got.push(t);
          controller.abort();
        },
        controller.signal,
      ),
    );
    check("ollama: the rejection is an AbortError", nameOf(err), "AbortError");
    check("ollama: nothing arrives after Stop", got, ["one"]);
    ok("ollama: the signal is handed to fetch", lastCall().init.signal === controller.signal);

    const early = new AbortController();
    early.abort();
    const before = calls.length;
    const err2 = await rejects("ollama: an already-aborted signal rejects", () =>
      provider.generateStream(req, () => ok("ollama: no chunk after an early abort", false), early.signal),
    );
    check("ollama: early abort is an AbortError too", nameOf(err2), "AbortError");
    check("ollama: early abort still went through fetch, which refused it", calls.length - before, 1);
  }

  {
    fakeFetch(() => json(200, { models: [{ name: "llama3.1:8b", size: 42 }, { name: "phi3", size: 7 }] }));
    check(
      "ollama list: names and sizes come through",
      await listOllamaModels(undefined, "http://engine.test:11434/"),
      [{ name: "llama3.1:8b", sizeBytes: 42 }, { name: "phi3", sizeBytes: 7 }],
    );
    check("ollama list: asks /api/tags on the given host", lastCall().url, "http://engine.test:11434/api/tags");

    fakeFetch(() => json(200, {}));
    check("ollama list: no models key means nothing pulled", await listOllamaModels(), []);
    check("ollama list: no host means the local daemon", lastCall().url, "http://localhost:11434/api/tags");

    fakeFetch(() => new Response("", { status: 500 }));
    const err = await rejects("ollama list: HTTP failure rejects", () => listOllamaModels());
    check("ollama list: the failure names the status", messageOf(err), "Ollama returned 500 listing models");

    fakeFetch(() => json(200, { models: [] }));
    check("ollama reachable: a 200 is yes", await ollamaReachable(), true);
    fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    check("ollama reachable: a network failure is no, not a throw", await ollamaReachable(), false);
  }

  /* ================================================================
     OpenAI-compatible
     ================================================================ */

  {
    // Server-sent events. One frame is cut mid-JSON, one right after
    // "data:", one uses CRLF, and a comment line and a role-only delta
    // are mixed in — all of which real gateways do.
    fakeFetch(() =>
      streamed(
        [
          ': keepalive\n\n',
          'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"Once "}}]}\n\n',
          'data: {"choices":[{"delta":{"co',
          'ntent":"upon"}}]}\n\ndata:',
          ' {"choices":[{"delta":{"content":" a "}}]}\r\n\r\n',
          'data: {"choices":[{"delta":{"content":"time"}}]}\n\n',
          'data: {"choices":[]}\n\n',
          'data: [DONE]\n\n',
        ],
        null,
      ),
    );
    const provider = makeOpenAICompatibleProvider(() => ({ baseUrl: "https://gateway.test/v1/", apiKey: "sk-test", model: "m" }));

    const chunks: string[] = [];
    const full = await provider.generateStream({ ...req, maxTokens: 42 }, (t) => chunks.push(t));
    check("openai: frames arrive in order, split frames intact", chunks, ["Once ", "upon", " a ", "time"]);
    check("openai: the resolved string is the concatenated stream", full, chunks.join(""));

    const call = lastCall();
    check("openai: trailing slash on the base URL is stripped", call.url, "https://gateway.test/v1/chat/completions");
    check("openai: POST", call.init.method, "POST");
    check("openai: the key travels as a bearer token", headersOf(call).authorization, "Bearer sk-test");
    const body = bodyOf(call);
    check("openai: model, streaming and max_tokens go on the wire", [body.model, body.stream, body.max_tokens], ["m", true, 42]);
    check(
      "openai: system and user messages in that order",
      body.messages,
      [
        { role: "system", content: req.system },
        { role: "user", content: req.prompt },
      ],
    );

    check("openai: generate() is the stream, collected", await provider.generate(req), "Once upon a time");
    check("openai: max_tokens defaults to 600", bodyOf(lastCall()).max_tokens, 600);
  }

  {
    fakeFetch(() => streamed(['data: {"choices":[{"delta":{"content":"x"}}]}\n\n', 'data: [DONE]\n\n'], null));
    const temp = async (temperature: number | undefined, apiKey = "k", model = "m"): Promise<FetchCall> => {
      await makeOpenAICompatibleProvider(() => ({ baseUrl: "https://gateway.test/v1", apiKey, model, temperature })).generate(req);
      return lastCall();
    };
    check("openai: configured temperature is sent as given", bodyOf(await temp(0.3)).temperature, 0.3);
    check("openai: unset falls back to 0.8", bodyOf(await temp(undefined)).temperature, 0.8);
    check("openai: zero falls back to 0.8", bodyOf(await temp(0)).temperature, 0.8);
    check("openai: NaN falls back to 0.8", bodyOf(await temp(Number.NaN)).temperature, 0.8);
    ok("openai: no key means no authorization header at all", !("authorization" in headersOf(await temp(0.5, ""))));
    check("openai: an empty model name means gpt-4o-mini", bodyOf(await temp(0.5, "k", "")).model, "gpt-4o-mini");
  }

  {
    // The https guard. A key and a chapter over plain HTTP is the one
    // mistake this provider must refuse to make, and it must refuse
    // BEFORE fetch — a refused request that was already sent is no refusal.
    fakeFetch(() => streamed(['data: [DONE]\n\n'], null));
    const attempt = async (baseUrl: string): Promise<string | null> => {
      const before = calls.length;
      try {
        await makeOpenAICompatibleProvider(() => ({ baseUrl, apiKey: "k", model: "m" })).generate(req);
        return null;
      } catch (err) {
        ok(`openai guard: ${baseUrl} was refused before any request`, calls.length === before);
        return messageOf(err);
      }
    };
    ok("openai guard: plain http to the internet is refused", (await attempt("http://api.example.com/v1"))?.startsWith("Refusing to send your writing") === true);
    check("openai guard: https is fine", await attempt("https://api.example.com/v1"), null);
    check("openai guard: localhost over http is fine", await attempt("http://localhost:1234/v1"), null);
    check("openai guard: 127.0.0.1 over http is fine", await attempt("http://127.0.0.1:8080/v1"), null);
    // The two below are the bug this suite found: a prefix match took
    // "localhost.evil.com" for local. The host has to BE localhost.
    ok("openai guard: a host that merely starts with localhost is not local", (await attempt("http://localhost.evil.com/v1")) !== null);
    ok("openai guard: a host that merely starts with 127.0.0.1 is not local", (await attempt("http://127.0.0.1.evil.com/v1")) !== null);

    for (const preset of PRESETS) {
      ok(`openai guard: preset ${preset.label} passes its own guard`, isLocalHost(preset.baseUrl) || preset.baseUrl.startsWith("https://"));
    }
  }

  {
    const provider = makeOpenAICompatibleProvider(() => ({ baseUrl: "https://gateway.test/v1", apiKey: "k", model: "m" }));
    const failing = async (name: string, res: () => Response): Promise<string> => {
      fakeFetch(res);
      return messageOf(await rejects(name, () => provider.generate(req)));
    };
    check("openai: 401 with a message keeps the service's words", await failing("401 rejects", () => json(401, { error: { message: "Invalid key" } })), "Invalid key");
    check("openai: bare 401 is a sentence", await failing("bare 401 rejects", () => new Response("", { status: 401 })), "Rejected the API key (401).");
    check("openai: a string-shaped error is read too", await failing("string error rejects", () => json(400, { error: "bad request shape" })), "bad request shape");
    check("openai: bare 404 points at the base URL", await failing("404 rejects", () => json(404, {})), "Endpoint or model not found (404). Check the base URL.");
    check("openai: 429 with an HTML body is a sentence", await failing("429 rejects", () => new Response("<html>", { status: 429 })), "Rate limited or out of credit (429).");
    check("openai: anything else names the status", await failing("502 rejects", () => new Response("", { status: 502 })), "Provider returned HTTP 502");
    check("openai: no body is said plainly", await failing("empty 200 rejects", () => new Response(null, { status: 200 })), "Provider sent no response body");
    check(
      "openai: an error frame mid-stream carries its message",
      await failing("mid-stream error rejects", () => streamed(['data: {"choices":[{"delta":{"content":"x"}}]}\n\n', 'data: {"error":{"message":"quota exceeded"}}\n\n'], null)),
      "quota exceeded",
    );
    check(
      "openai: an error frame without a message still rejects",
      await failing("bare error frame rejects", () => streamed(['data: {"error":{}}\n\n'], null)),
      "Provider error",
    );

    fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    const err = await rejects("openai: network failure rejects", () => provider.generate(req));
    ok("openai: a network failure stays a TypeError for generate.ts", err instanceof TypeError);
  }

  {
    const provider = makeOpenAICompatibleProvider(() => ({ baseUrl: "https://gateway.test/v1", apiKey: "k", model: "m" }));
    fakeFetch((_url, init) => streamed(['data: {"choices":[{"delta":{"content":"one"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"two"}}]}\n\n'], init.signal));

    const controller = new AbortController();
    const got: string[] = [];
    const err = await rejects("openai: abort mid-stream rejects", () =>
      provider.generateStream(
        req,
        (t) => {
          got.push(t);
          controller.abort();
        },
        controller.signal,
      ),
    );
    check("openai: the rejection is an AbortError", nameOf(err), "AbortError");
    check("openai: nothing arrives after Stop", got, ["one"]);
    ok("openai: the signal is handed to fetch", lastCall().init.signal === controller.signal);

    const early = new AbortController();
    early.abort();
    const err2 = await rejects("openai: an already-aborted signal rejects", () =>
      provider.generateStream(req, () => ok("openai: no chunk after an early abort", false), early.signal),
    );
    check("openai: early abort is an AbortError too", nameOf(err2), "AbortError");
  }

  {
    fakeFetch(() => json(200, { data: [{ id: "b-model" }, { id: "a-model" }, { object: "model" }] }));
    check("openai list: ids come back sorted, entries without one dropped", await listRemoteModels("https://gateway.test/v1/", "k"), ["a-model", "b-model"]);
    check("openai list: asks /models, slash stripped", lastCall().url, "https://gateway.test/v1/models");
    check("openai list: bearer token sent", headersOf(lastCall()).authorization, "Bearer k");

    fakeFetch(() => json(200, {}));
    check("openai list: no data key means an empty list", await listRemoteModels("http://localhost:1234/v1", ""), []);
    ok("openai list: no key, no header", !("authorization" in headersOf(lastCall())));

    fakeFetch(() => json(401, { error: { message: "no such key" } }));
    const err = await rejects("openai list: HTTP failure rejects", () => listRemoteModels("https://gateway.test/v1", "k"));
    check("openai list: the failure is the same humanised sentence", messageOf(err), "no such key");
  }

  /* ================================================================
     ai/generate.ts — the fallback chain
     ================================================================ */

  // Loaded here rather than at the top so the sections above stand on
  // their own if this module ever grows a dependency Node can't carry.
  const generateModule = await import("./src/ai/generate");
  const connectionsModule = await import("./src/plugins/providers/connections");
  const { generate, NoProviderError, ProviderUnreachableError, providerAvailable, whoAnswers } = generateModule;
  const { addConnection, probeOf, setRole, testConnection } = connectionsModule;

  // The store reads localStorage once and caches. Start it empty and
  // already seeded, so the legacy-migration path stays out of the way.
  store.set("novella.connections", "[]");
  store.set("novella.connections.seeded", "1");

  {
    fakeFetch(() => json(200, {}));
    check("generate: nothing connected means nothing available", providerAvailable(), false);
    const err = await rejects("generate: nothing connected rejects", () => generate(req));
    ok("generate: it is a NoProviderError", err instanceof NoProviderError);
    check("generate: with the sentence roles.ts writes for an empty store", messageOf(err), noConnectionMessage([]));
  }

  {
    // No connections but a plugin provider: the floor under the new path.
    let mode: "ok" | "network" = "ok";
    const legacy: NovellaPlugin = {
      id: "test-legacy-provider",
      name: "Test legacy provider",
      category: "ai",
      description: "",
      onEnable(ctx) {
        ctx.registerProvider({
          slash: "/local",
          async generate() {
            if (mode === "network") throw new TypeError("fetch failed");
            return "from the plugin";
          },
        });
      },
    };
    pluginHost.register(legacy);
    await pluginHost.enable(legacy.id);

    check("generate: a plugin provider counts as available", providerAvailable(), true);
    const got: string[] = [];
    check("generate: the plugin answers when no connection exists", await generate(req, (t) => got.push(t)), "from the plugin");
    check("generate: a non-streaming provider's answer is delivered whole, once", got, ["from the plugin"]);

    mode = "network";
    const err = await rejects("generate: legacy network failure rejects", () => generate(req));
    ok("generate: ...as a ProviderUnreachableError", err instanceof ProviderUnreachableError);
    check(
      "generate: the unreachable sentence for the legacy local provider",
      messageOf(err),
      "Can't reach your local AI. If it's a local model, make sure Ollama is running, then try again. Your writing is untouched.",
    );

    pluginHost.disable(legacy.id);
    check("generate: nothing available again once the plugin is off", providerAvailable(), false);
  }

  // Two local engines on different hosts, so the chain needs no keys and
  // the fake can tell them apart by URL.
  const engineA = addConnection({ kind: "ollama", label: "Engine A", model: "m", baseUrl: "http://a.test:11434" });
  const engineB = addConnection({ kind: "ollama", label: "Engine B", model: "m", baseUrl: "http://b.test:11434" });
  setRole("drafting", engineA.id);
  check("generate: the chain is A then B", whoAnswers().chain.map((c) => c.label), ["Engine A", "Engine B"]);

  const ollamaLine = (text: string): string => `${JSON.stringify({ response: text })}\n`;
  const countTo = (host: string, from: number): number => calls.slice(from).filter((c) => c.url.startsWith(host)).length;

  /** Route by host: what A does, what B does. */
  function engines(a: Handler, b: Handler): void {
    fakeFetch((url, init) => (url.startsWith("http://a.test") ? a(url, init) : b(url, init)));
  }

  {
    engines(
      () => new Response("", { status: 500 }),
      () => streamed([ollamaLine("hel"), ollamaLine("lo")], null),
    );
    let note = "";
    const got: string[] = [];
    const text = await generate({ ...req, onFallback: (n) => (note = n) }, (t) => got.push(t));
    check("fallback: B answers when A fails before streaming", text, "hello");
    check("fallback: the chunks are B's", got, ["hel", "lo"]);
    check("fallback: the writer is told, in roles.ts's words", note, fallbackNote(engineA, engineB, "Ollama returned HTTP 500"));
    check("fallback: A's failure is remembered on its probe", [probeOf(engineA.id).reachable, probeOf(engineA.id).detail], [false, "Ollama returned HTTP 500"]);
    check("fallback: B's success is remembered too", probeOf(engineB.id).reachable, true);
  }

  {
    engines(
      () => {
        throw new TypeError("fetch failed");
      },
      () => streamed([ollamaLine("ok")], null),
    );
    let note = "";
    check("fallback: B answers when A is down", await generate({ ...req, onFallback: (n) => (note = n) }), "ok");
    check("fallback: a network failure is phrased as not answering", note, `Engine A couldn't answer (it didn't answer) — Engine B did instead.`);
  }

  {
    const long = "x".repeat(120);
    engines(
      () => json(400, { error: long }),
      () => streamed([ollamaLine("ok")], null),
    );
    let note = "";
    await generate({ ...req, onFallback: (n) => (note = n) });
    check("fallback: a long reason is cut to fit the sentence", note, fallbackNote(engineA, engineB, `${"x".repeat(87)}…`));
  }

  {
    // Once a chunk has reached the editor there is no swapping engines:
    // half a paragraph from one model and the rest from another is not
    // a rescue.
    const from = calls.length;
    engines(
      () => streamed([ollamaLine("half"), '{"error":"out of memory"}\n'], null),
      () => streamed([ollamaLine("never")], null),
    );
    let noted = false;
    const got: string[] = [];
    const err = await rejects("mid-stream: a failure after text has streamed rejects", () =>
      generate({ ...req, onFallback: () => (noted = true) }, (t) => got.push(t)),
    );
    check("mid-stream: the error is the engine's own message", messageOf(err), "out of memory");
    check("mid-stream: what streamed stayed streamed", got, ["half"]);
    check("mid-stream: B was never asked", countTo("http://b.test", from), 0);
    check("mid-stream: no fallback note", noted, false);
  }

  {
    const from = calls.length;
    engines(
      () => streamThenDrop([ollamaLine("half")]),
      () => streamed([ollamaLine("never")], null),
    );
    const err = await rejects("mid-stream: a dropped connection rejects", () => generate(req, () => {}));
    ok("mid-stream: ...as a ProviderUnreachableError naming the engine that dropped", err instanceof ProviderUnreachableError && messageOf(err).startsWith("Can't reach Engine A."));
    check("mid-stream: B was never asked after a drop either", countTo("http://b.test", from), 0);
  }

  {
    engines(
      () => {
        throw new TypeError("fetch failed");
      },
      () => {
        throw new TypeError("fetch failed");
      },
    );
    let noted = false;
    const err = await rejects("all down: rejects", () => generate({ ...req, onFallback: () => (noted = true) }));
    ok("all down: a ProviderUnreachableError", err instanceof ProviderUnreachableError);
    check("all down: names the last engine tried", messageOf(err), "Can't reach Engine B. If it's a local model, make sure Ollama is running, then try again. Your writing is untouched.");
    check("all down: no fallback note, since nothing answered", noted, false);

    engines(
      () => new Response("", { status: 500 }),
      () => new Response("", { status: 503 }),
    );
    const err2 = await rejects("all failing: rejects", () => generate(req));
    check("all failing: the last HTTP error is passed through as it was", messageOf(err2), "Ollama returned HTTP 503");
  }

  {
    const from = calls.length;
    engines(
      (_url, init) => streamed([ollamaLine("one"), ollamaLine("two")], init.signal),
      () => streamed([ollamaLine("never")], null),
    );
    const controller = new AbortController();
    let noted = false;
    const err = await rejects("stop: aborting rejects", () =>
      generate({ ...req, onFallback: () => (noted = true) }, () => controller.abort(), controller.signal),
    );
    check("stop: the rejection is the AbortError itself", nameOf(err), "AbortError");
    check("stop: B is not tried after the writer pressed Stop", countTo("http://b.test", from), 0);
    check("stop: no fallback note", noted, false);
  }

  {
    // Test connection — the sentence on the Connections card when a
    // service can't be reached, one for local engines, one for the rest.
    fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    const local = await testConnection(engineA);
    check("test connection: a local engine that isn't running says so", [local.ok, local.detail], [false, "Nothing answered on this machine. Ollama isn't running — start it, or install it from Local AI below."]);
    const cloud = await testConnection({ id: "cloud", kind: "openai", label: "Cloud", model: "m", baseUrl: "https://cloud.test/v1" });
    check("test connection: a cloud service names its address", [cloud.ok, cloud.detail], [false, "Couldn't reach https://cloud.test/v1. Check the address and your internet connection."]);

    fakeFetch(() => json(200, { models: [] }));
    const empty = await testConnection(engineA);
    check("test connection: a running daemon with nothing pulled is not a pass", [empty.ok, empty.detail.startsWith("Ollama is running but has no models")], [false, true]);

    fakeFetch(() => json(200, { models: [{ name: "a", size: 1 }, { name: "b", size: 2 }] }));
    const good = await testConnection(engineA);
    check("test connection: a model list is proof", [good.ok, good.detail, good.models], [true, "Connected · 2 models available", ["a", "b"]]);
    check("test connection: the probe remembers", probeOf(engineA.id).reachable, true);

    fakeFetch(() => json(200, { data: [{ id: "only" }] }));
    const one = await testConnection({ id: "cloud", kind: "openai", label: "Cloud", model: "m", baseUrl: "http://localhost:1234/v1" });
    check("test connection: one model, singular", one.detail, "Connected · 1 model available");
  }

  /* ---------------- the real network comes back ---------------- */

  globalThis.fetch = realFetch;
  ok("the real fetch is restored", globalThis.fetch === realFetch);

  if (failures > 0) {
    console.error(`\n${failures} of ${checks} checks failed.`);
    process.exit(1);
  }
  console.log(`test-providers: ${checks} checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
