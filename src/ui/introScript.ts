/* The welcome script — pure data and timing, no DOM.

   The intro is a narrator, not a chatbot (docs/DESIGN-INTRO.md §3):
   scripted lines set in display type, streaming word by word at a
   constant pace. Everything an intro screen needs to know lives here so
   the component stays a renderer and this file stays testable. */

export type IntroInput =
  | "begin" // one button
  | "name" // the only free-text field
  | "color" // swatch chips
  | "theme" // genre chips, hover previews live
  | "backdrop" // the scene carousel — presets, upload, or none
  | "ai" // the honest local-AI check
  | "preset" // first-project cards
  | "enter"; // returning writers: no project creation, just the door

export interface IntroScreen {
  id: string;
  /** Scripted lines, streamed in order. {{name}} and {{themeAck}} are
      substituted at render time. */
  lines: string[];
  input: IntroInput;
}

/* Copy rules (§3, §5): short declarative fragments, contractions, second
   person, no exclamation marks, no "we're excited", warmth from
   specificity. Verb-first buttons. */
export const INTRO_SCRIPT: IntroScreen[] = [
  {
    id: "cold-open",
    lines: [
      "Every book starts the same way. An empty page, and someone stubborn enough to fill it.",
      "Let's set up yours.",
    ],
    input: "begin",
  },
  {
    id: "pen-name",
    lines: ["First — what name goes on the title page?"],
    input: "name",
  },
  {
    id: "color",
    lines: ["Good to meet you, {{name}}.", "Pick a color you'd want on the spine."],
    input: "color",
  },
  {
    id: "theme",
    lines: [
      "There it is. That's yours now — the whole app follows it.",
      "What kind of story is pulling at you?",
    ],
    input: "theme",
  },
  {
    id: "backdrop",
    lines: [
      "{{themeAck}}",
      "Some writers like a view behind the page. Pick one, bring your own — or keep it bare.",
    ],
    input: "backdrop",
  },
  {
    id: "ai",
    lines: [
      "One more thing. Novella can write alongside you with a local AI — if you have one.",
    ],
    input: "ai",
  },
  {
    id: "project",
    lines: ["Last question. What are we opening tonight?"],
    input: "preset",
  },
];

/** The final screen swaps for writers who already have books — no
    project creation, no wizardry, just the door back in. */
export const RETURNING_SCREEN: IntroScreen = {
  id: "returning",
  lines: ["{{themeAck}}", "Your books are right where you left them."],
  input: "enter",
};

/* Eight spine colors. Curated, not a color wheel: each one already
   passes the readableOn() contrast math in both directions. */
export const INTRO_SWATCHES = [
  "#e8a33d", // ember gold
  "#c65f4a", // brick
  "#d4788f", // rose
  "#8b5cf6", // violet
  "#4a7fb5", // ink blue
  "#3f9b8e", // teal
  "#6f8f52", // moss
  "#b08a5a", // tobacco
];

/* ---- timing (§3) ----
   Constant-rate word streaming: never bursty, never jittered. The fade
   is long and overlapping — several words are mid-arrival at once, so
   lines flow in instead of popping (owner feedback, 2026-08-18). */
export const WORD_MS = 35;
export const WORD_FADE_MS = 380;
export const LINE_GAP_MS = 300;
export const INPUT_DELAY_MS = 500;

/* ---- the loading cat's vocabulary ----
   Whimsy with a straight face: absurd gerunds under a giggling cat
   while the REAL steps report honestly beside it. Rotation is pure so
   it can be tested; the last entry admits the truth. */
export const INTRO_GERUNDS = [
  "Promulgating",
  "Onionizing",
  "Percolating",
  "Foreshadowing",
  "Inkwelling",
  "Sharpening pencils",
  "Binding the spine",
  "Loading, honestly",
];

export function gerundAt(tick: number): string {
  const i = ((tick % INTRO_GERUNDS.length) + INTRO_GERUNDS.length) % INTRO_GERUNDS.length;
  return INTRO_GERUNDS[i]!;
}

export function wordsOf(line: string): string[] {
  return line.split(/\s+/).filter(Boolean);
}

/** How long a line takes to finish streaming, fade tail included. */
export function lineDurationMs(line: string): number {
  const n = wordsOf(line).length;
  if (n === 0) return 0;
  return (n - 1) * WORD_MS + WORD_FADE_MS;
}

/** No headline ever orphans its last word (§4.6). */
export function glueOrphans(line: string): string {
  const at = line.lastIndexOf(" ");
  if (at <= 0) return line;
  return `${line.slice(0, at)} ${line.slice(at + 1)}`;
}

export function substitute(
  line: string,
  vars: { name?: string; themeAck?: string },
): string {
  return line
    .replaceAll("{{name}}", vars.name?.trim() || "friend")
    .replaceAll("{{themeAck}}", vars.themeAck ?? "Good choice.");
}

/* ---- the impatience ladder (§3) ----
   One pure transition covers it: first tap completes the streaming line,
   the next jumps the whole screen. Nothing is ever gated on an animation
   finishing. */
export interface LineState {
  /** Index of the line currently streaming or last completed. */
  lineIdx: number;
  /** True once that line is fully visible. */
  lineComplete: boolean;
}

export function tapAdvance(state: LineState, totalLines: number): LineState {
  if (!state.lineComplete) {
    return { lineIdx: state.lineIdx, lineComplete: true };
  }
  if (state.lineIdx < totalLines - 1) {
    return { lineIdx: totalLines - 1, lineComplete: true };
  }
  return state; // input already showing — taps do nothing
}

/** The timer's own step: a finished line hands off to the next. */
export function lineFinished(state: LineState, totalLines: number): LineState {
  if (!state.lineComplete) return { ...state, lineComplete: true };
  if (state.lineIdx < totalLines - 1) {
    return { lineIdx: state.lineIdx + 1, lineComplete: false };
  }
  return state;
}

/** Inputs appear only once the last line has landed. */
export function inputReady(state: LineState, totalLines: number): boolean {
  return state.lineComplete && state.lineIdx >= totalLines - 1;
}
