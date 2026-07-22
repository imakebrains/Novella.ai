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

export async function generate(
  req: GenerateRequest,
  onChunk?: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const provider = resolveProvider();
  if (!provider) throw new NoProviderError();

  if (onChunk && isStreaming(provider)) {
    return provider.generateStream(req, onChunk, signal);
  }
  const text = await provider.generate(req);
  onChunk?.(text);
  return text;
}

export function providerAvailable(): boolean {
  return resolveProvider() !== undefined;
}
