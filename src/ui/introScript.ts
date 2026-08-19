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
      "Every great book began as a blank page and someone who refused to leave it empty.",
      "Yours starts tonight.",
    ],
    input: "begin",
  },
  {
    id: "pen-name",
    lines: ["First, the name that will sit on the cover."],
    input: "name",
  },
  {
    id: "color",
    lines: ["Good to meet you, {{name}}.", "Pick your color. The whole room will follow it."],
    input: "color",
  },
  {
    id: "theme",
    lines: [
      "There it is. Yours now, everywhere you look.",
      "What kind of story is calling to you?",
    ],
    input: "theme",
  },
  {
    id: "backdrop",
    lines: [
      "{{themeAck}}",
      "Now set the scene. Choose a view for behind your page, or bring your own.",
    ],
    input: "backdrop",
  },
  {
    id: "ai",
    lines: [
      "Novella can write alongside you, right on this machine. Private, offline, entirely yours.",
    ],
    input: "ai",
  },
  {
    id: "project",
    lines: ["The stage is set, {{name}}.", "Let's open your first book."],
    input: "preset",
  },
];

/** The final screen swaps for writers who already have books: no
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

/* ---- timing (§3, rebuilt round 13) ----
   Lines arrive whole — one thought, one elegant entrance — the way a
   keynote presents, not the way a terminal types. Word streaming read
   as either jittery or sluggish depending on the clock; whole-line
   flow is instantly readable at any speed. */
export const ENTRANCE_MS = 560;
export const LINE_GAP_MS = 240;
export const INPUT_DELAY_MS = 500;

/** The cat's minimum hold at the finale — long enough to land as a
    moment, short enough to stay a joke. Real work runs inside it. */
export const FINALE_MS = 5500;

/** The boot: the cat opens the show. Long enough to read one absurd
    gerund and smile, short enough that nobody reaches for Skip. A tap
    cuts it instantly — the impatience ladder starts here. */
export const BOOT_MS = 2400;

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

/** How long a line's entrance takes. Every line costs one entrance —
    length changes reading time, not arrival time. */
export function lineDurationMs(line: string): number {
  return wordsOf(line).length === 0 ? 0 : ENTRANCE_MS;
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
