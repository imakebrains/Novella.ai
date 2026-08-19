/* ============================================================
   The guided tour — the steps, and every rule about moving through them.

   The tour is six little looping diagrams, each demonstrating one
   gesture. Nothing here draws anything: this file holds the script,
   the timing each clip runs at, and the whole of the state machine
   (which step, has it been seen, has it offered itself yet). The
   component is a renderer.

   Two reasons for the split. First, "offers itself exactly once and
   then never again" is a promise about persistence, and a promise you
   can't assert is a promise you'll break — test-tour.ts holds us to it
   without a DOM. Second, the clips are timed from `loopMs`: the value
   is handed to CSS as one custom property per clip and every keyframe
   in that clip runs at it, so retiming a demonstration is a number in
   this file rather than a hunt through a stylesheet.

   WHY DIAGRAMS AND NOT A RECORDING. A screen capture of the app is a
   photograph of one afternoon: it goes stale the moment a border
   changes, and it can't be re-themed, re-colored, or slowed down for
   someone who asked for less motion. These clips are built from the
   app's own tokens, so they age with it — and under reduced motion
   they still have something true to show, because every clip's REST
   state is its finished state (see TourOverlay.tsx).
   ============================================================ */

export type ClipId = "palette" | "reorder" | "stack" | "resize" | "board" | "reword";

export interface TourStep {
  id: ClipId;
  /** The lesson, as a label. */
  title: string;
  /** What the gesture is, in words — this is what a screen reader gets,
      so it has to teach on its own without the picture. */
  body: string;
  /** The caption under a still clip. Reduced motion means no gesture to
      watch, so the diagram shows the finished arrangement and this line
      says what you're looking at. */
  still: string;
  /** Where in the app the writer will find this. */
  where: string;
  /** One loop of the clip, in milliseconds. Three to six seconds: under
      three and the eye can't follow a drag, over six and a loop starts
      feeling like a wait. */
  loopMs: number;
}

/* The order is a lesson plan, not the order these were built in.

   Ctrl+K comes first because it's the one thing that makes the rest of
   the app feel small — a writer who knows it is never lost. Then the
   three arranging gestures in the order they build on each other: drag
   a tab along the strip, drag one PAST the strip (same grip, new
   destination), then size the two panels that produces. Then the board.
   Reword goes last on purpose: the tour should end on writing rather
   than on furniture. */
export const TOUR_STEPS: TourStep[] = [
  {
    id: "palette",
    title: "Everything, one key away",
    body: "Ctrl+K opens the command palette. Type a few letters and it narrows to the chapter, note or command you meant. Enter runs it.",
    still: "The palette, filtered to a single result.",
    where: "Anywhere in the app",
    loopMs: 5200,
  },
  {
    id: "reorder",
    title: "Your tools, in your order",
    body: "Drag a tab along the tool strip to put it where your hand expects it. The strip is a preference, not a layout — it's remembered, and you can close what you never use.",
    still: "Calendar dragged to the front of the strip.",
    where: "The Tools pane, on the right",
    loopMs: 4400,
  },
  {
    id: "stack",
    title: "Two tools open at once",
    body: "Drag a tab down past the strip and it stops being a tab: it opens as its own panel underneath. Tasks and the calendar together, instead of a switch between them.",
    still: "Tasks above, Calendar pinned open below it.",
    where: "The Tools pane, on the right",
    loopMs: 5600,
  },
  {
    id: "resize",
    title: "Give a panel more room",
    body: "Every divider drags — between two stacked panels, and between the panes either side of your page. Double-click a divider to even the split up again.",
    still: "The divider pulled down; the top panel taller.",
    where: "Between any two panels",
    loopMs: 4200,
  },
  {
    id: "board",
    title: "Move the story around",
    body: "On the Board, drag a card to reorder your chapters. The manuscript follows — the board isn't a picture of the book, it's the book.",
    still: "Chapter Three dragged into the opening slot.",
    where: "Board, in the titlebar",
    loopMs: 4800,
  },
  {
    id: "reword",
    title: "Ask for another take",
    body: "Select a line and the Reword chip appears beside it. Pick a voice — tighter, more vivid, more tense — and the new sentence replaces the old one. Ctrl+Z puts it back.",
    still: "One sentence, tightened.",
    where: "The editor, on any selection",
    loopMs: 6000,
  },
];

/** How long after the intro closes before the tour offers itself. Long
    enough that the writer sees their own workspace first — arriving in
    the same frame as the reveal would read as another gate, not an
    offer. */
export const AUTO_OFFER_MS = 900;

/* ============================================================
   State — pure transitions, no storage, no DOM.
   ============================================================ */

export interface TourState {
  /** Where the writer is, or would resume. Always a valid index. */
  step: number;
  /** Skipped or finished. Once true the tour never offers itself again;
      only the Hints button and Settings open it. */
  seen: boolean;
  /** The auto-offer has fired. Separate from `seen` because a writer who
      closes the app mid-tour has neither finished nor skipped, and
      re-offering on next launch is exactly the nagging we promised not
      to do. */
  offered: boolean;
}

export const TOUR_START: TourState = { step: 0, seen: false, offered: false };

export function stepCount(): number {
  return TOUR_STEPS.length;
}

/** The step at an index, clamped. Callers hold an index that can outlive
    a change to the list, and a tour that renders nothing is worse than
    one that renders the nearest step. */
export function stepAt(index: number): TourStep {
  const at = Math.max(0, Math.min(Math.trunc(index) || 0, TOUR_STEPS.length - 1));
  return TOUR_STEPS[at]!;
}

export function currentStep(state: TourState): TourStep {
  return stepAt(state.step);
}

export function isFirstStep(state: TourState): boolean {
  return state.step <= 0;
}

export function isLastStep(state: TourState): boolean {
  return state.step >= TOUR_STEPS.length - 1;
}

/** "3 of 6" — said out loud rather than only drawn, because a row of
    dots tells you where you are and nothing about how much is left. */
export function progressLabel(state: TourState): string {
  return `${Math.min(state.step + 1, TOUR_STEPS.length)} of ${TOUR_STEPS.length}`;
}

/** Both ends stop rather than wrap. Next on the last step is not "start
    over"; the button says Done there and calls finishTour. */
export function nextStep(state: TourState): TourState {
  return goToStep(state, state.step + 1);
}

export function prevStep(state: TourState): TourState {
  return goToStep(state, state.step - 1);
}

/** The progress dots are buttons, so any index can arrive here. A move
    that changes nothing hands back the same object, so a needless write
    and re-render both cost nothing. */
export function goToStep(state: TourState, index: number): TourState {
  const at = Math.max(0, Math.min(Math.trunc(index) || 0, TOUR_STEPS.length - 1));
  return at === state.step ? state : { ...state, step: at };
}

/* Skip and finish are the same promise — never offer again — and differ
   only in where they leave the bookmark.

   Skipping keeps the step: someone who bailed at the third clip and
   later presses Hints wants the third clip, not the first. Finishing
   resets it: there is nothing left to resume, so a replay should be a
   replay. That difference is the entire reason the step is persisted at
   all rather than being state that dies with the panel. */
export function skipTour(state: TourState): TourState {
  return { ...state, seen: true, offered: true };
}

export function finishTour(state: TourState): TourState {
  return { ...state, step: 0, seen: true, offered: true };
}

/** Reopening by hand. `seen` stays true — it has been seen — and the
    step is whatever the rule above left behind. */
export function replayTour(state: TourState): TourState {
  return { ...state, offered: true };
}

export function markOffered(state: TourState): TourState {
  return state.offered ? state : { ...state, offered: true };
}

/** Should the tour open on its own right now?

    Three conditions and all of them are refusals: not before the intro
    has finished (two full-screen welcomes in a row is a hazing), not if
    it has been seen, not if it has already offered. */
export function shouldAutoOffer(state: TourState, introDone: boolean): boolean {
  return introDone && !state.seen && !state.offered;
}

/* ============================================================
   Persistence.

   Flat keys beside novella.introSeen rather than one JSON blob: App.tsx
   already reads and writes the intro's flags by hand, and a
   novella.tourSeen that can be read at a glance in devtools belongs in
   that family.

   The read and the write take their accessors as arguments so the
   round-trip is provable in Node, where there is no localStorage at
   all. The two wrappers underneath are the only lines in this file that
   know a browser exists.
   ============================================================ */

export const KEY_SEEN = "novella.tourSeen";
export const KEY_STEP = "novella.tourStep";
export const KEY_OFFERED = "novella.tourOffered";

/** Whatever came out of storage, turned into state the UI can trust. A
    hand-edited key, a step from a version with more clips, a half-written
    pair: all of them resolve to something renderable rather than to a
    blank panel. */
export function normalizeTourState(raw: Partial<TourState> | null | undefined): TourState {
  const step = Number(raw?.step);
  return {
    step: Number.isFinite(step) ? Math.max(0, Math.min(Math.trunc(step), TOUR_STEPS.length - 1)) : 0,
    seen: raw?.seen === true,
    offered: raw?.offered === true,
  };
}

export function readTourState(get: (key: string) => string | null): TourState {
  return normalizeTourState({
    step: Number(get(KEY_STEP) ?? 0),
    seen: get(KEY_SEEN) === "1",
    offered: get(KEY_OFFERED) === "1",
  });
}

export function writeTourState(
  state: TourState,
  set: (key: string, value: string) => void,
): void {
  const clean = normalizeTourState(state);
  set(KEY_STEP, String(clean.step));
  set(KEY_SEEN, clean.seen ? "1" : "0");
  set(KEY_OFFERED, clean.offered ? "1" : "0");
}

function browserGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function browserSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* A tour is a nicety. A writer in private mode still gets the tour;
       they just get offered it again next time, which is the harmless
       end of this failure. */
  }
}

export function loadTourState(): TourState {
  return readTourState(browserGet);
}

export function saveTourState(state: TourState): void {
  writeTourState(state, browserSet);
}
