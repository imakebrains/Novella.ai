/* ============================================================
   Model catalog

   Which models exist per service, and the per-model quirks that
   change the request shape. The important one: several current
   Anthropic models REJECT temperature/top_p/top_k with a 400 —
   they are not ignored, the request fails. A provider that sends
   temperature unconditionally simply doesn't work on them.
   ============================================================ */

export interface ModelInfo {
  id: string;
  name: string;
  blurb: string;
  /** Context window, in tokens. */
  context: number;
  /** True when temperature / top_p / top_k are rejected with a 400. */
  rejectsSampling?: boolean;
}

/* Anthropic. Model IDs are complete as written — never append a date
   suffix; `claude-opus-4-8-20260101` and friends are not real IDs. */
export const CLAUDE_MODELS: ModelInfo[] = [
  {
    id: "claude-opus-4-8",
    name: "Claude Opus 4.8",
    blurb: "The default. Best prose and long-horizon coherence.",
    context: 1_000_000,
    rejectsSampling: true,
  },
  {
    id: "claude-fable-5",
    name: "Claude Fable 5",
    blurb: "Most capable, most expensive. For the hardest work.",
    context: 1_000_000,
    rejectsSampling: true,
  },
  {
    id: "claude-opus-4-7",
    name: "Claude Opus 4.7",
    blurb: "Previous-generation Opus.",
    context: 1_000_000,
    rejectsSampling: true,
  },
  {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    blurb: "Near-Opus quality, lower cost. Good default for volume.",
    context: 1_000_000,
    rejectsSampling: true,
  },
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    blurb: "Older Opus. Accepts temperature.",
    context: 1_000_000,
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    blurb: "Older Sonnet. Accepts temperature.",
    context: 1_000_000,
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    blurb: "Fastest and cheapest. Fine for quick passes.",
    context: 200_000,
  },
];

/** Common OpenAI-family models, as a starting list. The custom provider
    also queries /v1/models live, which is authoritative for whatever
    endpoint the writer actually points at. */
export const OPENAI_MODELS: ModelInfo[] = [
  { id: "gpt-4o", name: "GPT-4o", blurb: "Balanced quality and speed.", context: 128_000 },
  { id: "gpt-4o-mini", name: "GPT-4o mini", blurb: "Cheap and quick.", context: 128_000 },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", blurb: "Older flagship.", context: 128_000 },
];

export function claudeModel(id: string): ModelInfo | undefined {
  return CLAUDE_MODELS.find((m) => m.id === id);
}

/** Does this Claude model accept a temperature parameter? */
export function acceptsTemperature(modelId: string): boolean {
  const model = claudeModel(modelId);
  // Unknown model: assume the modern behaviour and omit temperature. Sending
  // it to a model that rejects it is a hard 400; omitting it from one that
  // accepts it merely uses the default.
  return model ? !model.rejectsSampling : false;
}
