/* ============================================================
   The hints library — the entries, and every rule about moving
   through them.

   It began as a six-step tour and it is still one: Next and Back walk
   the list from the top, and a writer on their first morning can hold
   the button down and be shown the room. What changed is who else it
   serves. Sixteen entries is past the size where "press Next eleven
   times" is a reasonable way to re-learn one thing, so the list is
   also a library — grouped, labelled, searchable, and jumped into by
   name from the sidebar in TourOverlay.tsx.

   Nothing here draws anything: this file holds the script, the timing
   each clip runs at, the grouping and filtering the sidebar renders,
   and the whole of the state machine (which hint, has it been seen,
   has it offered itself yet). The component is a renderer.

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

   WHY THE SHORTCUTS ARE DATA AND NOT PROSE. `keys` is the exact
   binding, written the way the app writes it, and test-tour.ts checks
   every one of them against a list of the bindings that really exist
   in App.tsx, EditorPane.tsx and Corkboard.tsx. A tutorial that
   teaches a shortcut the app doesn't have is worse than a tutorial
   that stays quiet, and "worse than nothing" is the sort of thing
   that deserves a test rather than a promise.
   ============================================================ */

export type ClipId =
  | "palette"
  | "focus"
  | "views"
  | "reorder"
  | "stack"
  | "resize"
  | "tasks"
  | "timer"
  | "board"
  | "trash"
  | "theme"
  | "backdrop"
  | "slash"
  | "wikilink"
  | "paragraph"
  | "reword"
  | "chat";

export type CategoryId = "around" | "tools" | "organising" | "yours" | "writing";

export interface HintCategory {
  id: CategoryId;
  /** The heading in the sidebar. */
  label: string;
  /** What the group is for, one line — the sidebar's tooltip, and the
      thing a search for "color" or "panel" ought to match on. */
  blurb: string;
}

/* The order here is the order of the sidebar AND the order Next walks —
   see the contiguity rule below. Getting around first, because a writer
   who can't find things can't use anything else. Writing last, keeping
   the promise the six-step tour made: the walkthrough ends on the page
   rather than on the furniture. A first-timer who wants the page
   immediately no longer has to sit through the furniture to reach it —
   that is exactly what the sidebar is for. */
export const HINT_CATEGORIES: HintCategory[] = [
  {
    id: "around",
    label: "Getting around",
    blurb: "Finding things, and getting the room out of the way",
  },
  {
    id: "tools",
    label: "Your tools",
    blurb: "The right-hand pane, arranged the way your hands expect",
  },
  {
    id: "organising",
    label: "Organising",
    blurb: "The shape of the book, and what you put away",
  },
  {
    id: "yours",
    label: "Making it yours",
    blurb: "Color, light, and what sits behind the work",
  },
  {
    id: "writing",
    label: "Writing",
    blurb: "The page itself: linking, moving, rewording",
  },
];

export interface TourStep {
  id: ClipId;
  /** Which sidebar group it belongs to. */
  category: CategoryId;
  /** The lesson, as a label. Also the sidebar's row. */
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
  /** The binding, verbatim, or null when the gesture is a pointer one.
      Never invent one: test-tour.ts checks these against the real
      handlers. */
  keys: string | null;
  /** One loop of the clip, in milliseconds. Three to six seconds: under
      three and the eye can't follow a drag, over six and a loop starts
      feeling like a wait. */
  loopMs: number;
}

/* THE CONTIGUITY RULE. Steps are listed grouped, in HINT_CATEGORIES
   order, and never interleaved. That is what makes the sidebar and the
   Next button the same list read two ways: a writer who presses Next
   walks straight down the sidebar, and a writer who clicks the sidebar
   lands where Next would have taken them. test-tour.ts enforces it,
   because the day someone slips a "Writing" entry in among the tools is
   the day the sidebar starts lying about what Next does.

   Within a group the order is still a lesson plan. Ctrl+K comes first
   because it's the one thing that makes the rest of the app feel small.
   The three arranging gestures build on each other: drag a tab along the
   strip, drag one PAST the strip (same grip, new destination), then size
   the two panels that produces. */
export const TOUR_STEPS: TourStep[] = [
  /* ---------- Getting around ---------- */
  {
    id: "palette",
    category: "around",
    title: "Everything, one key away",
    body: "Ctrl+K opens the command palette. Type a few letters and it narrows to the chapter, note or command you meant. Enter runs it.",
    still: "The palette, filtered to a single result.",
    where: "Anywhere in the app",
    keys: "Ctrl+K",
    loopMs: 5200,
  },
  {
    id: "focus",
    category: "around",
    title: "Just the page",
    body: "Ctrl+Shift+F is focus mode: everything that isn't your words — codex, tools, titlebar — clears out, and the page widens into the room they left. Esc brings it all back.",
    still: "Focus mode: the panes gone, the page widened.",
    where: "Anywhere in the app",
    keys: "Ctrl+Shift+F",
    loopMs: 4600,
  },
  {
    id: "views",
    category: "around",
    title: "Three shapes of one book",
    body: "Write and Board are two views of the same manuscript, not two documents. On the Board, Cards, Grid and Table are three shapes of the same chapters — reorder in any of them and the other two already agree.",
    still: "The Board in Table view; the same chapters, listed.",
    where: "The titlebar, and the Board's header",
    keys: null,
    loopMs: 5200,
  },

  /* ---------- Your tools ---------- */
  {
    id: "reorder",
    category: "tools",
    title: "Your tools, in your order",
    body: "Drag a tab along the tool strip to put it where your hand expects it. The strip is a preference, not a layout — it's remembered, and you can close what you never use.",
    still: "Calendar dragged to the front of the strip.",
    where: "The Tools pane, on the right",
    keys: null,
    loopMs: 4400,
  },
  {
    id: "stack",
    category: "tools",
    title: "Two tools open at once",
    body: "Drag a tab down past the strip and it stops being a tab: it opens as its own panel underneath. Tasks and the calendar stacked and both open, instead of a switch between them.",
    still: "Tasks above, Calendar pinned open below it.",
    where: "The Tools pane, on the right",
    keys: null,
    loopMs: 5600,
  },
  {
    id: "resize",
    category: "tools",
    title: "Give a panel more room",
    body: "Every divider drags, so every panel can be resized — between two stacked panels, and between the panes either side of your page. Double-click a divider to even the split up again.",
    still: "The divider pulled down; the top panel taller.",
    where: "Between any two panels",
    keys: null,
    loopMs: 4200,
  },
  {
    id: "tasks",
    category: "tools",
    title: "Every to-do, one list",
    body: "A \"- [ ]\" line written anywhere in the project turns up in the Tasks panel. Tick it there and the note itself changes, because the panel is a lens over your prose rather than a second copy of it.",
    still: "One task ticked in the panel — and in the note behind it.",
    where: "The Tools pane, Tasks tab",
    keys: null,
    loopMs: 4800,
  },
  {
    id: "timer",
    category: "tools",
    title: "A clock that keeps running",
    body: "The Timer tab holds a countdown and an alarm, and they run independently — a 25-minute sprint going while three o'clock is still set. Both live outside the panel, so switching tabs or closing the pane never stops the clock.",
    still: "A countdown running, the alarm still set beneath it.",
    where: "The Tools pane, Timer tab",
    keys: null,
    loopMs: 5400,
  },

  /* ---------- Organising ---------- */
  {
    id: "board",
    category: "organising",
    title: "Move the story around",
    body: "On the Board, drag a card to reorder your chapters. The manuscript follows — the board isn't a picture of the book, it's the book. With a card focused, ← and → nudge it one slot without a drag.",
    still: "Chapter Three dragged into the opening slot.",
    where: "Board, in the titlebar",
    keys: "← / →",
    loopMs: 4800,
  },
  {
    id: "trash",
    category: "organising",
    title: "Nothing leaves in a hurry",
    body: "Right-click any note to archive or delete it. Either way it goes to the trash keeping its place, and Restore puts it back exactly where it was. The retention window tells you how long that offer stands.",
    still: "The chapter in the trash, with days left and a way back.",
    where: "Right-click a note, anywhere",
    keys: null,
    loopMs: 5200,
  },

  /* ---------- Making it yours ---------- */
  {
    id: "theme",
    category: "yours",
    title: "The room, in your colors",
    body: "The dot in the titlebar cycles the shipped themes. To build one of your own, name five colors — window, panes, page, text, accent — and the other twenty-two are derived from them.",
    still: "Five colors picked; the room already wearing them.",
    where: "Settings → Appearance",
    keys: null,
    loopMs: 4400,
  },
  {
    id: "backdrop",
    category: "yours",
    title: "A picture behind the work",
    body: "Set a photograph behind the panes — one of the bundled scenes, or your own image. A dim control decides how much of it comes through, so the backdrop stays scenery and the page stays readable.",
    still: "A backdrop behind the panes, dimmed to taste.",
    where: "Settings → Appearance",
    keys: null,
    loopMs: 4600,
  },

  /* ---------- Writing ---------- */
  {
    id: "slash",
    category: "writing",
    title: "Type / for the insert menu",
    body: "On an otherwise empty line, / opens the insert menu: a task checkbox, a scene break, a heading, a plan step, a link, or a brand-new character created and linked on the spot. A slash mid-sentence is left alone.",
    still: "The insert menu open, and the task line it left behind.",
    where: "The editor, on a blank line",
    keys: "/",
    loopMs: 5400,
  },
  {
    id: "wikilink",
    category: "writing",
    title: "Link to anyone in the codex",
    body: "Type [[ and the codex offers itself — characters, places, anything you've written down. The link runs both ways: the entry you named grows a Backlinks list of every chapter that mentions it.",
    still: "A link to Elowen, and the backlink it created.",
    where: "The editor, anywhere in a line",
    keys: "[[",
    loopMs: 5600,
  },
  {
    id: "paragraph",
    category: "writing",
    title: "Move a paragraph, whole",
    body: "Alt with an arrow lifts the paragraph the cursor is in and drops it a slot up or down, intact. No selecting, no cutting, no rebuilding the ending you were pleased with.",
    still: "The paragraph moved up a slot, the cursor still in it.",
    where: "The editor, on any paragraph",
    keys: "Alt+↑ / Alt+↓",
    loopMs: 4200,
  },
  {
    id: "reword",
    category: "writing",
    title: "Ask for another take",
    body: "Select a line and the Reword chip appears beside it. Pick a voice — Tighten, More vivid, Raise tension, Softer, Plainer — and the new sentence replaces the old one in place. Ctrl+Z puts it back.",
    still: "One sentence, tightened.",
    where: "The editor, on any selection",
    keys: null,
    loopMs: 6000,
  },
  {
    id: "chat",
    category: "writing",
    title: "Talk it through",
    body: "The Chat tool holds a conversation about the book, not a single question. It reads the scene you have open and only the codex entries that scene refers to — and it shows you which ones before you send, so you always know what it was told. Answers stream in; Insert drops one at the cursor, and nothing arrives in the manuscript unless you put it there.",
    still: "A question, the entries it carried, and the answer waiting to be inserted.",
    where: "The inspector, Chat tab",
    keys: null,
    loopMs: 5800,
  },
];

/** How long after the intro closes before the tour offers itself. Long
    enough that the writer sees their own workspace first — arriving in
    the same frame as the reveal would read as another gate, not an
    offer. */
export const AUTO_OFFER_MS = 900;

/* ============================================================
   The library — grouping and filtering.

   Pure, and index-carrying. Every function that hands a step back hands
   its index back with it, because the sidebar's only job is to turn a
   click into goToStep(state, index) and an id-to-index lookup scattered
   through the component is how a filtered list ends up jumping to the
   wrong hint.
   ============================================================ */

export interface HintHit {
  step: TourStep;
  /** Position in TOUR_STEPS — what Next and Back count in, always,
      filtered or not. */
  index: number;
}

export interface HintGroup {
  category: HintCategory;
  items: HintHit[];
}

export function categoryOf(id: CategoryId): HintCategory | undefined {
  return HINT_CATEGORIES.find((c) => c.id === id);
}

export function categoryLabel(id: CategoryId): string {
  return categoryOf(id)?.label ?? "";
}

/** -1 for an id that isn't in the list. Callers can hold an id that
    outlived a change to the library — an old deep link, a stale test —
    and a lookup that throws would take the panel down with it. */
export function indexOfHint(id: ClipId): number {
  return TOUR_STEPS.findIndex((s) => s.id === id);
}

/** Jump by name rather than by number. An unknown id changes nothing and
    hands the same object back, so a bad jump costs no re-render. */
export function goToHint(state: TourState, id: ClipId): TourState {
  const at = indexOfHint(id);
  return at < 0 ? state : goToStep(state, at);
}

export function allHints(): HintHit[] {
  return TOUR_STEPS.map((step, index) => ({ step, index }));
}

export function stepsInCategory(id: CategoryId): HintHit[] {
  return allHints().filter((h) => h.step.category === id);
}

/* What a search reads. Split in two, and the split is the whole trick.

   The prose half is the obvious one — title, body, and the two fields
   that earn the search box its place. `where` means "settings" finds the
   two hints that live there without knowing what they're called; the
   category label and blurb mean a writer who thinks in rooms rather than
   in features ("color", "tools") still lands somewhere.

   The keys half is separate because of one query: "ctrl k". Search a
   single letter against prose and you match "back", "block", "checkbox"
   — the letter K is in half the English language, and the writer gets
   the whole library back. So a one-character term is asked of the
   bindings only, which is the only place a lone letter ever means
   something. It also makes "/" and "[[" work as queries in their own
   right, which is exactly how the writer thinks of them. */
function haystacks(step: TourStep): { prose: string; keys: string } {
  const cat = categoryOf(step.category);
  return {
    prose: [step.title, step.body, step.where, cat?.label ?? "", cat?.blurb ?? ""]
      .join(" ")
      .toLowerCase(),
    /* The plus stripped as well as kept: nobody types it. */
    keys: `${step.keys ?? ""} ${(step.keys ?? "").replace(/\+/g, " ")}`.toLowerCase(),
  };
}

/** Every term has to land somewhere, in any order — "trash restore"
    finds the trash hint, and so does "restore trash". Substring rather
    than word-start, because "link" must find "Backlinks" and a writer
    hunting for a half-remembered feature is guessing at the stem. */
export function filterHints(query: string): HintHit[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return allHints();
  return allHints().filter(({ step }) => {
    const { prose, keys } = haystacks(step);
    return terms.every((t) => keys.includes(t) || (t.length > 1 && prose.includes(t)));
  });
}

/** The sidebar's shape: categories in HINT_CATEGORIES order, each with
    the hits that belong to it. Empty groups are dropped — a heading with
    nothing under it is a dead end during a search, and can't happen at
    all when the query is blank (test-tour.ts holds every category to
    having at least one hint). */
export function groupHints(hits: HintHit[]): HintGroup[] {
  return HINT_CATEGORIES.map((category) => ({
    category,
    items: hits.filter((h) => h.step.category === category.id),
  })).filter((g) => g.items.length > 0);
}

/** What the sidebar renders, in one call. */
export function hintGroups(query = ""): HintGroup[] {
  return groupHints(filterHints(query));
}

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

/** "3 of 16" — said out loud rather than only drawn, because a sidebar
    tells you where you are and nothing about how much is left. */
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

/** The sidebar rows are buttons, so any index can arrive here. A move
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
