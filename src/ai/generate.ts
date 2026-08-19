import { pluginHost, isStreaming } from "../plugins/runtime";
import type { AIProvider } from "../core/plugins";
import {
  DEFAULT_ROLE,
  fallbackNote,
  noConnectionMessage,
  resolveRole,
  type Connection,
  type Resolved,
  type RoleId,
} from "./roles";
import {
  connections,
  noteResult,
  probeOf,
  providerForConnection,
  ready,
  routing,
} from "../plugins/providers/connections";

/* One place where generation actually happens, so the Assistant panel and
   the beats drafter can't drift apart in how they call providers, stream,
   or report failure.

   It is now also the one place that knows about ROLES. A caller says what
   kind of job this is — drafting, ideas, research, critique, a quick fix —
   and the writer's own routing decides which connection answers. Callers
   that say nothing get Drafting, which is exactly what they got before
   roles existed, so nothing needed changing on the day this landed.

   When the chosen connection can't answer, the next one in the chain
   tries, and the caller is told in a sentence rather than left wondering
   why the prose sounds different. The one case where we refuse to fall
   back: text has already streamed into the editor. Half a paragraph from
   Claude followed by a whole one from Ollama is not a rescue, it's a mess
   in someone's manuscript. */

export interface GenerateRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
  /** What kind of job this is. Omitted means drafting — see roles.ts. */
  role?: RoleId;
  /** Called only when a fallback actually fired, with a sentence fit to
      show a writer. Substitutions are forgivable; silent ones are not. */
  onFallback?: (note: string) => void;
}

const ACTIVE_KEY = "novella.activeProvider";

export class NoProviderError extends Error {
  constructor(message = "No AI provider is active. Turn one on in Settings → Connections.") {
    super(message);
    this.name = "NoProviderError";
  }
}

/** Which registered provider generation should use, by slash command.
    The pre-roles switch. Still read by the dev console and still
    honoured as a last resort when no connections exist at all. */
export function activeProviderSlash(): string {
  return localStorage.getItem(ACTIVE_KEY) || "/local";
}

export function setActiveProvider(slash: string): void {
  localStorage.setItem(ACTIVE_KEY, slash);
}

/** The old path: a provider registered by an enabled plugin. Kept as a
    floor under the new one — if the connections store were ever empty or
    unreadable, the app still writes. */
function legacyProvider(): AIProvider | undefined {
  const chosen = pluginHost.provider(activeProviderSlash());
  if (chosen) return chosen;
  return pluginHost.providers()[0]?.provider;
}

/* Network failures arrive as a bare TypeError whose message is the
   browser's "Failed to fetch" — true, useless, and alarming. Every
   generation path funnels through here, so this is the one place that
   can turn it into something a writer can act on. */
export class ProviderUnreachableError extends Error {
  constructor(name: string) {
    super(
      `Can't reach ${name}. If it's a local model, make sure Ollama is running, then try again. Your writing is untouched.`,
    );
    this.name = "ProviderUnreachableError";
  }
}

function isNetworkError(err: unknown): boolean {
  return (
    err instanceof TypeError ||
    (err instanceof Error && /fetch|network|ECONNREFUSED|load failed/i.test(err.message))
  );
}

function humanize(err: unknown, name: string): never {
  // A fetch that never reached a server throws TypeError, not an HTTP error.
  if (isNetworkError(err)) throw new ProviderUnreachableError(name);
  throw err;
}

function isAbort(err: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (err instanceof Error && err.name === "AbortError");
}

/** One short phrase naming what went wrong, for the fallback sentence. */
function whyFailed(err: unknown): string {
  if (isNetworkError(err)) return "it didn't answer";
  const message = err instanceof Error ? err.message : String(err);
  return message.length > 90 ? `${message.slice(0, 87)}…` : message;
}

async function runOne(
  provider: AIProvider,
  req: GenerateRequest,
  onChunk?: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  // Only the three fields a provider knows about — role and onFallback
  // are this module's business.
  const payload = { system: req.system, prompt: req.prompt, maxTokens: req.maxTokens };

  if (onChunk && isStreaming(provider)) {
    return await provider.generateStream(payload, onChunk, signal);
  }
  const text = await provider.generate(payload);
  onChunk?.(text);
  return text;
}

export async function generate(
  req: GenerateRequest,
  onChunk?: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const role = req.role ?? DEFAULT_ROLE;

  // Keys come back from the OS keychain asynchronously; asking for them
  // before that lands would report a connected account as keyless.
  await ready();

  const list = connections();
  const resolved = resolveRole(role, routing(), list, probeOf);

  if (resolved.chain.length === 0) {
    const legacy = legacyProvider();
    if (!legacy) throw new NoProviderError(noConnectionMessage(list));
    const name = legacy.slash === "/local" ? "your local AI" : legacy.slash;
    try {
      return await runOne(legacy, req, onChunk, signal);
    } catch (err) {
      if (isAbort(err, signal)) throw err;
      humanize(err, name);
    }
  }

  /* Once a single chunk has reached the editor, this run is committed to
     the provider that sent it. */
  let streamed = false;
  const watched = onChunk
    ? (text: string) => {
        streamed = true;
        onChunk(text);
      }
    : undefined;

  let firstFailure: { conn: Connection; why: string } | null = null;
  let lastError: unknown;
  let lastName = "your AI";

  for (const conn of resolved.chain) {
    lastName = conn.label;
    try {
      const text = await runOne(providerForConnection(conn), req, watched, signal);
      noteResult(conn.id, true);
      if (firstFailure) {
        req.onFallback?.(fallbackNote(firstFailure.conn, conn, firstFailure.why));
      }
      return text;
    } catch (err) {
      if (isAbort(err, signal)) throw err;
      noteResult(conn.id, false, err instanceof Error ? err.message : String(err));
      lastError = err;
      firstFailure ??= { conn, why: whyFailed(err) };
      if (streamed) humanize(err, conn.label); // mid-stream: no silent swap
    }
  }

  humanize(lastError, lastName);
}

/** Is there anything at all that could answer? Used to grey out buttons
    rather than let someone press one and meet an error. */
export function providerAvailable(): boolean {
  const list = connections();
  if (resolveRole(DEFAULT_ROLE, routing(), list, probeOf).chain.length > 0) return true;
  return legacyProvider() !== undefined;
}

/** Who answers this role right now, and in what order. For Settings and
    for anything that wants to say so before a writer presses the button. */
export function whoAnswers(role: RoleId = DEFAULT_ROLE): Resolved {
  return resolveRole(role, routing(), connections(), probeOf);
}
