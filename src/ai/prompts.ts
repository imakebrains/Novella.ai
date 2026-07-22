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
}

export const VARIABLES: { key: keyof PromptVariables; blurb: string }[] = [
  { key: "scene", blurb: "Title of the current chapter or scene" },
  { key: "beat", blurb: "The beat being expanded" },
  { key: "codex", blurb: "Referenced codex entries" },
  { key: "prose", blurb: "The scene's text so far" },
  { key: "selection", blurb: "Currently selected text" },
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
  extra: { beat?: string; selection?: string } = {},
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
    name: "Expand beat",
    description: "Turn a single beat into finished prose.",
    template: `Write the next passage of "{{scene}}".

What must happen in this passage:
{{beat}}

What came before:
{{prose}}

Write only the prose. Match the established voice, tense and point of view. Do not restate the beat or summarise.`,
  },
  {
    name: "Continue scene",
    description: "Keep writing from where the prose stops.",
    template: `Continue "{{scene}}" from exactly where it stops.

{{prose}}

Write only what comes next.`,
  },
  {
    name: "Rewrite selection",
    description: "Tighten or re-angle the selected passage.",
    template: `Rewrite this passage from "{{scene}}", keeping its meaning and voice but making it sharper:

{{selection}}

Return only the rewritten passage.`,
  },
  {
    name: "Describe setting",
    description: "Ground the scene in physical detail.",
    template: `Write a short, sensory description of the setting for "{{scene}}".

Relevant world details:
{{codex}}

Two or three sentences. Concrete detail over adjectives. Filter it through the point-of-view character's mood.`,
  },
  {
    name: "Dialogue pass",
    description: "Draft an exchange between the characters present.",
    template: `Write a dialogue exchange for "{{scene}}".

Characters and world details:
{{codex}}

What has happened so far:
{{prose}}

Give each character a distinct voice. Favour subtext over exposition. Minimal dialogue tags.`,
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
