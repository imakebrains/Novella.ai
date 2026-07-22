import type { Note } from "../core/vault";

/* ============================================================
   Scene context assembly
   The token-economy rule from the blueprint: send only the codex
   entries this scene actually references, never the whole bible.
   A 200-entry world costs the same as a 5-entry one if the scene
   only mentions five things.
   ============================================================ */

export interface SceneContext {
  system: string;
  prompt: string;
  /** Codex entries actually included, for the UI to show. */
  referenced: Note[];
  estimatedTokens: number;
}

const CHARS_PER_TOKEN = 4;

/** Only the tail of the chapter is sent — the model needs voice and
    immediate continuity, not the whole thing at full price. */
const MAX_PROSE_CHARS = 6000;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Wiki-link syntax is noise to a model. [[Wren Calloway]] → Wren Calloway. */
export function stripWikiLinks(text: string): string {
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) =>
    (alias ?? target).trim(),
  );
}

function formatEntry(n: Note): string {
  const aka = n.aliases.length ? ` (also known as: ${n.aliases.join(", ")})` : "";
  const skip = new Set(["name", "title", "type", "id", "aliases", "tags"]);
  const facts = Object.entries(n.data)
    .filter(([k]) => !skip.has(k))
    .map(([k, v]) => `- ${k}: ${stripWikiLinks(String(v))}`)
    .join("\n");

  return [
    `### ${n.title}${aka} — ${n.type}`,
    n.tags.length ? `tags: ${n.tags.join(", ")}` : "",
    facts,
    stripWikiLinks(n.body),
  ]
    .filter(Boolean)
    .join("\n");
}

/* Telling a model to "match the point of view" doesn't work — it drifts
   into first person on the next paragraph. Naming the person and tense
   explicitly does. Both are derivable from what's already in the vault. */

export type NarrativePerson = "first" | "third" | "unknown";

export function detectPerson(prose: string): NarrativePerson {
  const first = (prose.match(/\b(I|I'm|I'd|I've|me|my|mine|myself)\b/gi) ?? []).length;
  const third = (prose.match(/\b(he|she|they|him|her|his|hers|them|their)\b/gi) ?? []).length;
  if (first === 0 && third === 0) return "unknown";
  return first > third ? "first" : "third";
}

export function detectPastTense(prose: string): boolean {
  const past = (prose.match(/\b\w+ed\b|\b(was|were|had|said|felt|knew|thought|came|went|saw|took)\b/gi) ?? []).length;
  const present = (prose.match(/\b(is|are|am|says|feels|knows|thinks|comes|goes|sees|takes)\b/gi) ?? []).length;
  return past >= present;
}

/** A one-line instruction the model can't misread. */
export function povDirective(scene: Note, povName?: string): string {
  const person = detectPerson(scene.body);
  const past = detectPastTense(scene.body);
  const tense = past ? "past tense" : "present tense";

  if (person === "unknown") {
    return povName ? `Point-of-view character: ${povName}.` : "";
  }
  const personText =
    person === "first"
      ? "first person (I/me)"
      : "third person limited (he/she/they)";

  return povName
    ? `Write in ${personText}, ${tense}, from ${povName}'s point of view. Refer to ${povName} by name or by third-person pronoun — never as "I" unless the scene is already first person.`
    : `Write in ${personText}, ${tense}.`;
}

export interface BuildOptions {
  /** What the writer wants next. Defaults to continuing the scene. */
  instruction?: string;
}

export function buildSceneContext(
  scene: Note,
  referenced: Note[],
  opts: BuildOptions = {},
): SceneContext {
  // Never include the scene itself, and don't dump whole other chapters
  // into context — their titles are enough to anchor continuity.
  const entries = referenced.filter((n) => n.id !== scene.id && n.type !== "chapter");
  const otherChapters = referenced.filter((n) => n.id !== scene.id && n.type === "chapter");

  const codex = entries.map(formatEntry).join("\n\n");

  // The scene's own frontmatter names its POV character; use it rather
  // than leaving the model to infer one from the prose.
  const povRaw = scene.data.pov;
  const povName = typeof povRaw === "string" ? stripWikiLinks(povRaw).trim() : undefined;
  const directive = povDirective(scene, povName);

  const system = [
    "You are a novelist's writing partner. You continue the author's manuscript in their established voice.",
    directive,
    "Match the existing prose style. Do not summarize, explain, or comment.",
    "Write only the prose that comes next. No preamble, no headings, no meta-commentary.",
    "",
    codex ? `## World details relevant to this scene\n\n${codex}` : "",
    otherChapters.length
      ? `\n## Also referenced\n${otherChapters.map((c) => `- ${c.title}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const body = stripWikiLinks(scene.body).trim();
  const truncated = body.length > MAX_PROSE_CHARS;
  const prose = truncated ? `…${body.slice(-MAX_PROSE_CHARS)}` : body;

  const instruction = opts.instruction?.trim() || "Continue this scene.";

  const prompt = [
    `## Scene: ${scene.title}`,
    truncated ? "(earlier text omitted)" : "",
    "",
    prose,
    "",
    `---`,
    instruction,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    system,
    prompt,
    referenced: entries,
    estimatedTokens: estimateTokens(system) + estimateTokens(prompt),
  };
}
