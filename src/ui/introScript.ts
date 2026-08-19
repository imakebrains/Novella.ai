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
  | "show" // nothing to answer: a demonstration, and one way on
  | "ai" // the honest local-AI check
  | "preset" // first-project cards
  | "enter"; // returning writers: no project creation, just the door

/* ---- the demonstration windows ----

   Borrowed wholesale from the guided tour (tourSteps.ts), because the
   tour already settled every argument this raises. Small looping
   diagrams built from the app's own vocabulary rather than recorded
   from it: a capture cannot follow the accent the writer picked ninety
   seconds ago, cannot stand still for someone who asked for less
   motion, and starts lying the day a border radius changes. A diagram
   made of the same tokens as the room it describes ages with the room —
   and here it does something the tour's clips cannot: it arrives
   already wearing the choices made on the screens before it.

   THE RULE, unchanged from the tour: every clip's REST state is its
   FINISHED state, so killing the animation leaves a correct labelled
   diagram rather than an empty box. That is the whole of the
   reduced-motion path, and `still` is the caption that goes under it. */
export type IntroClipId =
  | "room" // the three panes, and where the page sits
  | "pieces" // a chapter, a codex entry, and the link between them
  | "local"; // a draft arriving from a model on this machine

export interface IntroClip {
  id: IntroClipId;
  /** One loop, in milliseconds. The same three-to-six-second window the
      tour settled on: under three and the eye cannot follow, over six
      and a loop starts feeling like a wait. Handed to CSS as one custom
      property so every keyframe in the clip runs on one clock. */
  loopMs: number;
  /** The caption under a still window. Reduced motion means no gesture
      to watch, so the diagram shows the finished arrangement and this
      line says what you are looking at. */
  still: string;
}

export const CLIP_MIN_MS = 3000;
export const CLIP_MAX_MS = 6000;

export interface IntroScreen {
  id: string;
  /** Scripted lines, streamed in order. {{name}} and {{themeAck}} are
      substituted at render time. */
  lines: string[];
  input: IntroInput;
  /** A screen earns a clip when it TEACHES something. A question whose
      own answer repaints the room (color, theme, backdrop) is already
      its own demonstration, and "what name goes on the cover" has
      nothing to show. Clips are rationed on purpose: the intro has to
      stay skippable in seconds and must not become a second tour. */
  clip?: IntroClip;
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
  /* The two showing screens sit HERE, after the room has been colored,
     themed and dressed, so the windows arrive already wearing the
     writer's choices. Put them any earlier and they would be
     demonstrating somebody else's app. */
  {
    id: "room",
    lines: [
      "Here is the room you'll be writing in.",
      "Your page in the middle, your book on the left, your tools on the right.",
    ],
    input: "show",
    clip: {
      id: "room",
      loopMs: 4600,
      still: "The workspace: your book on the left, your page in the middle, your tools on the right.",
    },
  },
  {
    id: "pieces",
    lines: [
      "Your chapters hold the writing. The codex holds the people.",
      "Write a name in double brackets and the two find each other.",
    ],
    input: "show",
    clip: {
      id: "pieces",
      loopMs: 5200,
      still: "A chapter naming someone, and the codex entry it reaches.",
    },
  },
  {
    id: "ai",
    lines: [
      "Novella can write alongside you, right on this machine. Private, offline, entirely yours.",
    ],
    input: "ai",
    clip: {
      id: "local",
      loopMs: 4800,
      still: "A line drafted inside your own machine, with nothing leaving it.",
    },
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

/** The screens a writer actually walks, in order.

    Two edits for someone who already has books, and both are selected
    by INPUT rather than by index, so adding a screen can never silently
    drop one of them:

    · the first-project pick becomes the door back in;
    · the showing screens go. They know what a chapter is. Demonstrating
      the furniture to somebody standing in it is the difference between
      an introduction and a lecture, and the tour (Hints, in the
      titlebar) is where a replay of the demonstrations lives. */
export function scriptFor(returning: boolean): IntroScreen[] {
  if (!returning) return INTRO_SCRIPT;
  return [
    ...INTRO_SCRIPT.filter((s) => s.input !== "preset" && s.input !== "show"),
    RETURNING_SCREEN,
  ];
}

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
