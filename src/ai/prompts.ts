import type { Note } from "../core/vault";
import { buildSceneContext, estimateTokens, stripWikiLinks } from "./context";

/* ============================================================
   Prompt library

   Prompts are ordinary vault notes with `type: prompt`. That means
   they're plain Markdown on disk, portable, versionable, editable in
   the editor like anything else, and their [[links]] get indexed —
   a prompt that references [[Wren Calloway]] shows up in her backlinks.
   No separate prompt database to keep in sync.
   ============================================================ */

export interface PromptVariables {
  /** The scene being written. */
  scene: string;
  /** The specific beat to expand, when drafting beat by beat. */
  beat: string;
  /** Codex entries this scene references, already formatted. */
  codex: string;
  /** Text the writer had selected, if any. */
  selection: string;
  /** Everything written so far in this scene. */
  prose: string;
  /** The writer's one-line direction for this run — what it should be about. */
  guidance: string;
}

export const VARIABLES: { key: keyof PromptVariables; blurb: string }[] = [
  { key: "scene", blurb: "Title of the current chapter or scene" },
  { key: "beat", blurb: "The plan step being expanded" },
  { key: "codex", blurb: "Referenced codex entries" },
  { key: "prose", blurb: "The scene's text so far" },
  { key: "selection", blurb: "Currently selected text" },
  { key: "guidance", blurb: "The writer's direction for this run" },
];

/** Replace {{variable}} tokens. Unknown tokens are left visible rather
    than silently blanked — a prompt with a typo should look wrong. */
export function renderTemplate(template: string, vars: Partial<PromptVariables>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, name: string) => {
    const value = vars[name as keyof PromptVariables];
    return value === undefined ? whole : value;
  });
}

/** Which variables a template actually uses — drives the UI hints. */
export function usedVariables(template: string): string[] {
  const found = new Set<string>();
  const re = /\{\{\s*(\w+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) {
    const name = m[1];
    if (name) found.add(name);
  }
  return [...found];
}

export interface BuiltPrompt {
  system: string;
  prompt: string;
  referenced: Note[];
  estimatedTokens: number;
}

/** Assemble a full request from a prompt template plus live vault state. */
export function buildFromTemplate(
  template: string,
  scene: Note,
  referenced: Note[],
  extra: { beat?: string; selection?: string; guidance?: string } = {},
): BuiltPrompt {
  // Reuse the scene-context builder so the token-economy rule (only
  // referenced codex entries) applies to custom prompts too.
  const base = buildSceneContext(scene, referenced);

  const codexBlock = base.system
    .split("## World details relevant to this scene")
    .slice(1)
    .join("")
    .trim();

  const prompt = renderTemplate(template, {
    scene: scene.title,
    beat: extra.beat ?? "",
    codex: codexBlock,
    selection: extra.selection ?? "",
    prose: stripWikiLinks(scene.body).trim(),
    guidance: extra.guidance?.trim() || "(none — writer's choice)",
  });

  return {
    system: base.system,
    prompt,
    referenced: base.referenced,
    estimatedTokens: estimateTokens(base.system) + estimateTokens(prompt),
  };
}

/* ---------- built-in prompts, seeded as vault notes ---------- */

export interface PromptSeed {
  name: string;
  description: string;
  template: string;
}

export const BUILTIN_PROMPTS: PromptSeed[] = [
  {
    name: "Extensive novel",
    description:
      "Rich long-form fiction — full paragraphs, interiority, sensory detail. The style for drafting real chapters.",
    template: `Continue "{{scene}}" in rich novelistic prose.

{{prose}}

Direction from the writer (follow it if given):
{{guidance}}

Write several full paragraphs. Stay inside the point-of-view character's head — thoughts, senses, small physical detail. Match the established voice and tense. Let moments breathe; don't rush to summary. Write only the prose.`,
  },
  {
    name: "Paragraph mode",
    description:
      "One tight paragraph and stop. For inching a scene forward without the model running away.",
    template: `Continue "{{scene}}" by exactly ONE paragraph.

{{prose}}

Direction from the writer (follow it if given):
{{guidance}}

One paragraph, 3–6 sentences, then stop. Match voice, tense, and point of view. No summary, no scene break. Write only that paragraph.`,
  },
  {
    name: "Email writer",
    description:
      "Plain, warm, professional email drafting — for query letters, newsletters, or anything that isn't the book.",
    template: `Write an email.

What it needs to say and who it's for:
{{guidance}}

Useful background, if any relates:
{{codex}}

Subject line first, then the body. Plain and warm, no corporate filler, short paragraphs, a clear ask or close. Under 200 words unless the content truly needs more.`,
  },
];

export function promptSeedToMarkdown(seed: PromptSeed): string {
  return `---
type: prompt
name: ${seed.name}
description: ${seed.description}
---
${seed.template}
`;
}
