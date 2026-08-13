import { stripWikiLinks } from "../ai/context";

/* ============================================================
   Reword — the pure half.

   Select prose, pick a voice, get a replacement. Everything here
   is testable without CodeMirror or a provider: the styles, the
   prompt that keeps models from editorializing, and the cleaner
   that undoes the wrapping they editorialize with anyway.
   ============================================================ */

export interface RewordStyle {
  id: string;
  label: string;
  /** One-line instruction handed to the model. */
  instruction: string;
}

/* Few and opinionated. A dropdown of twenty knobs is a settings
   panel; five voices you can feel the difference between is a tool. */
export const REWORD_STYLES: RewordStyle[] = [
  {
    id: "tighten",
    label: "Tighten",
    instruction:
      "Rewrite this more concisely. Cut filler, hedges, and redundancy. Keep every fact and image; lose nothing but the slack.",
  },
  {
    id: "vivid",
    label: "More vivid",
    instruction:
      "Rewrite this with stronger, more sensory language. Concrete nouns, active verbs. Do not add new events or facts — sharpen what is already there.",
  },
  {
    id: "tension",
    label: "Raise tension",
    instruction:
      "Rewrite this so it carries more tension. Shorter sentences where it matters, sharper word choices, a sense of something withheld. Same events, same facts.",
  },
  {
    id: "softer",
    label: "Softer",
    instruction:
      "Rewrite this with a gentler, more lyrical register. Smooth the rhythm, ease the pacing. Same events, same facts.",
  },
  {
    id: "simplify",
    label: "Plainer",
    instruction:
      "Rewrite this in plainer language a tired reader follows effortlessly. Shorter words, cleaner sentences. Keep the meaning exactly.",
  },
];

export interface RewordRequest {
  system: string;
  prompt: string;
}

/** Build the generate() request for one reword run. `before`/`after`
    give the model the surrounding prose for voice-matching only. */
export function buildRewordRequest(
  instruction: string,
  selection: string,
  before: string,
  after: string,
): RewordRequest {
  const context =
    before.trim() || after.trim()
      ? `\n\nFor voice and continuity only — do not rewrite or repeat it:\n${
          before.trim() ? `[before]: …${stripWikiLinks(before).trim()}\n` : ""
        }${after.trim() ? `[after]: ${stripWikiLinks(after).trim()}…\n` : ""}`
      : "";

  return {
    system:
      "You rewrite passages of fiction on request. Reply with ONLY the rewritten passage — no preamble, no quotation marks around it, no explanation, no markdown fences. Match the manuscript's tense and point of view. Preserve paragraph breaks. Preserve any [[wiki links]] exactly as written. If the passage is a sentence fragment, return a fragment that fits the same slot — do not add terminal punctuation or complete the surrounding sentence.",
    prompt: `${instruction}${context}\n\nPassage to rewrite:\n${selection}`,
  };
}

/* Models wrap answers even when told not to: quotes, fences,
   "Here's the rewritten passage:". The cleaner strips the wrapping
   without ever touching interior text. */
export function cleanReword(raw: string): string {
  let text = raw.trim();

  // Markdown fence around the whole reply.
  const fence = text.match(/^```[a-z]*\n([\s\S]*?)\n?```$/);
  if (fence?.[1] !== undefined) text = fence[1].trim();

  // A one-line preamble ending in a colon, followed by the actual text.
  const lines = text.split("\n");
  const first = lines[0] ?? "";
  if (lines.length > 1 && /^[^.!?]{0,80}:$/.test(first.trim()) && /rewrit|revis|here|version/i.test(first)) {
    text = lines.slice(1).join("\n").trim();
  }

  // Matched quotes around the entire reply — only when both ends agree.
  const pairs: [string, string][] = [['"', '"'], ["“", "”"], ["'", "'"]];
  for (const [open, close] of pairs) {
    if (text.startsWith(open) && text.endsWith(close) && text.length > 2) {
      const inner = text.slice(1, -1);
      // Don't strip if the quote closes early — that's dialogue, not wrapping.
      if (!inner.includes(close)) text = inner;
      break;
    }
  }

  return text;
}

/** Selection sanity: enough text to reword, small enough to be one
    thought. Word-count bounds, not characters — prose logic. */
export function rewordable(selection: string): boolean {
  const words = selection.trim().split(/\s+/).filter(Boolean).length;
  return words >= 2 && words <= 600;
}
