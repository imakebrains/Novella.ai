import { pluginHost, isStreaming } from "../plugins/runtime";

/* One place where generation actually happens, so the Assistant panel and
   the beats drafter can't drift apart in how they call providers, stream,
   or report failure. */

export interface GenerateRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
}

const ACTIVE_KEY = "novella.activeProvider";

export class NoProviderError extends Error {
  constructor(message = "No AI provider is active. Turn one on in Settings → AI.") {
    super(message);
    this.name = "NoProviderError";
  }
}

/** Which registered provider generation should use, by slash command. */
export function activeProviderSlash(): string {
  return localStorage.getItem(ACTIVE_KEY) || "/local";
}

export function setActiveProvider(slash: string): void {
  localStorage.setItem(ACTIVE_KEY, slash);
}

/** The chosen provider, falling back to whatever is registered so the app
    still works if the selected one was disabled. */
function resolveProvider() {
  const chosen = pluginHost.provider(activeProviderSlash());
  if (chosen) return chosen;
  const any = pluginHost.providers()[0];
  return any?.provider;
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

function humanize(err: unknown, name: string): never {
  // A fetch that never reached a server throws TypeError, not an HTTP error.
  if (err instanceof TypeError || (err instanceof Error && /fetch|network|ECONNREFUSED/i.test(err.message))) {
    throw new ProviderUnreachableError(name);
  }
  throw err;
}

export async function generate(
  req: GenerateRequest,
  onChunk?: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const provider = resolveProvider();
  if (!provider) throw new NoProviderError();
  const name = provider.slash === "/local" ? "your local AI" : provider.slash;

  try {
    if (onChunk && isStreaming(provider)) {
      return await provider.generateStream(req, onChunk, signal);
    }
    const text = await provider.generate(req);
    onChunk?.(text);
    return text;
  } catch (err) {
    // A deliberate abort is not a failure — let it through untranslated.
    if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) throw err;
    humanize(err, name);
  }
}

export function providerAvailable(): boolean {
  return resolveProvider() !== undefined;
}
