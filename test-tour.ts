/* Assertions for the hints library.

   Same shape as test-tabs.ts and test-stack.ts: no output unless
   something is wrong, non-zero exit when it is.

   Why any of this is worth a file. The tour makes exactly one promise
   that a person would notice being broken — it offers itself once and
   then never on its own again — and that promise is a statement about
   what survives a reload. Proving it by hand means installing the app,
   finishing the intro, quitting mid-tour and relaunching; proving it
   here means running a value through a Map. The rest is the sort of
   index arithmetic (clamping, ends that stop rather than wrap, a
   bookmark that means two different things after a skip and after a
   finish) that goes quietly wrong behind a pointer.

   Since the tour became a library there are two more things worth
   holding down, and both of them are things a reader would be misled by
   rather than merely inconvenienced by:

     THE BINDINGS. Every `keys` string is checked against the list of
     shortcuts that actually exist in App.tsx, EditorPane.tsx and
     Corkboard.tsx. A tutorial that teaches Ctrl+Shift+P for a thing
     bound to Ctrl+Shift+F is worse than a tutorial that says nothing,
     and nothing in a hand-written step list stops that drift.

     THE CONTIGUITY RULE. The sidebar groups the steps and the Next
     button walks them; those are the same list read two ways, and they
     only agree while the steps stay grouped in category order. Slip one
     Writing hint in among the tools and the sidebar starts lying about
     where Next goes.

   No DOM, no localStorage: readTourState and writeTourState take their
   accessors, so the round-trip is exercised against a Map here and
   against the browser in the app. */

import {
  AUTO_OFFER_MS,
  HINT_CATEGORIES,
  KEY_OFFERED,
  KEY_SEEN,
  KEY_STEP,
  TOUR_START,
  TOUR_STEPS,
  allHints,
  categoryLabel,
  categoryOf,
  currentStep,
  filterHints,
  finishTour,
  goToHint,
  goToStep,
  groupHints,
  hintGroups,
  indexOfHint,
  isFirstStep,
  isLastStep,
  markOffered,
  nextStep,
  normalizeTourState,
  prevStep,
  progressLabel,
  readTourState,
  replayTour,
  shouldAutoOffer,
  skipTour,
  stepAt,
  stepCount,
  stepsInCategory,
  writeTourState,
  type CategoryId,
  type ClipId,
  type TourState,
} from "./src/ui/tourSteps";

/* The last hint in the library, whatever it currently is. The
   index-and-jump checks want "the end of the list", not one particular
   step — naming one meant adding a hint broke tests that were only ever
   about the arithmetic. */
const LAST_HINT = TOUR_STEPS[TOUR_STEPS.length - 1]!.id;

let failures = 0;
let checks = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

function ok(name: string, condition: boolean): void {
  checks++;
  if (!condition) {
    failures++;
    console.error(`FAIL  ${name}`);
  }
}

/** A localStorage stand-in. Two closures rather than an object because
    that is exactly the surface the state functions ask for. */
function fakeStore(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    get: (key: string): string | null => map.get(key) ?? null,
    set: (key: string, value: string): void => {
      map.set(key, value);
    },
  };
}

/* ---------- the step list ---------- */

{
  ok("steps: there are some", TOUR_STEPS.length > 0);
  check("steps: stepCount agrees with the list", stepCount(), TOUR_STEPS.length);

  // A library, not a slideshow — but a library nobody finishes is a
  // slideshow nobody finished either. Twelve to sixteen was the brief.
  ok("steps: the library is 12-20 hints", TOUR_STEPS.length >= 12 && TOUR_STEPS.length <= 20);

  const ids = TOUR_STEPS.map((s) => s.id);
  check("steps: no id appears twice", new Set(ids).size, ids.length);

  // The gestures the tour was commissioned to cover. A clip quietly
  // dropped from the list is the failure this catches.
  const required: ClipId[] = [
    "stack",
    "reorder",
    "palette",
    "reword",
    "board",
    "resize",
    "focus",
    "views",
    "tasks",
    "timer",
    "trash",
    "theme",
    "backdrop",
    "slash",
    "wikilink",
    "paragraph",
  ];
  for (const id of required) {
    ok(`steps: covers ${id}`, ids.includes(id));
  }

  for (const step of TOUR_STEPS) {
    ok(`steps: ${step.id} has a title`, step.title.trim().length > 0);
    ok(`steps: ${step.id} has a body`, step.body.trim().length > 0);
    // The still caption is what a reduced-motion writer reads instead of
    // watching. An empty one is the empty box we promised never to show.
    ok(`steps: ${step.id} has a still caption`, step.still.trim().length > 0);
    ok(`steps: ${step.id} says where it lives`, step.where.trim().length > 0);
    // Under three seconds the eye can't follow a drag; over six a loop
    // stops reading as a demonstration and starts reading as a wait.
    ok(`steps: ${step.id} loops in 3-6s`, step.loopMs >= 3000 && step.loopMs <= 6000);
    // The body has to teach on its own — it is what a screen reader gets,
    // because the diagram beside it is decorative.
    ok(`steps: ${step.id} body is a real sentence`, step.body.trim().length > 40);
  }

  // The teaching order is deliberate: the strip drag comes before the
  // drag past the strip, because the second is the first with a new
  // destination and reads as nonsense on its own.
  ok("steps: reorder is taught before stacking", ids.indexOf("reorder") < ids.indexOf("stack"));
  // Resizing a split means nothing until there is a split.
  ok("steps: stacking is taught before resizing", ids.indexOf("stack") < ids.indexOf("resize"));
  // Ctrl+K first: it is the one thing that makes the rest feel small.
  check("steps: the palette opens the library", ids[0], "palette");
  // The walkthrough ends on writing, not on furniture. Asserted by
  // category, not by name: adding a writing hint at the end is exactly the
  // change this rule is meant to allow.
  check(
    "steps: the last hint is a writing one",
    TOUR_STEPS[TOUR_STEPS.length - 1]?.category,
    "writing",
  );

  ok("steps: the auto-offer waits a beat", AUTO_OFFER_MS > 0 && AUTO_OFFER_MS < 4000);
}

/* ---------- the bindings are real ---------- */

{
  /* Every shortcut the app actually registers, verbatim:
       App.tsx            Ctrl+K, Ctrl+S, Ctrl+Shift+F, Esc
       EditorPane.tsx     Alt+ArrowUp / Alt+ArrowDown, "/" on a blank
                          line (SLASH_TRIGGER), "[[" (wikiLinkSource),
                          Ctrl+Z via CodeMirror's historyKeymap
       Corkboard.tsx      Left / Right on a focused card
     Adding a hint whose `keys` isn't on this list means either the
     shortcut is invented or this list is out of date — and either way
     somebody has to go and look. */
  const REAL_BINDINGS = new Set([
    "Ctrl+K",
    "Ctrl+S",
    "Ctrl+Shift+F",
    "Ctrl+Z",
    "Esc",
    "Alt+↑ / Alt+↓",
    "/",
    "[[",
    "← / →",
  ]);

  for (const step of TOUR_STEPS) {
    if (step.keys === null) continue;
    ok(`keys: ${step.id} teaches a binding that exists`, REAL_BINDINGS.has(step.keys));
    ok(`keys: ${step.id} is not blank`, step.keys.trim().length > 0);
  }

  // Spot-checked by hand against the handlers, one per source file, so a
  // wholesale rename of the allowlist above can't pass unnoticed.
  const keysOf = (id: ClipId) => TOUR_STEPS.find((s) => s.id === id)?.keys ?? null;
  check("keys: the palette is Ctrl+K", keysOf("palette"), "Ctrl+K");
  check("keys: focus mode is Ctrl+Shift+F", keysOf("focus"), "Ctrl+Shift+F");
  check("keys: paragraphs move on Alt+arrows", keysOf("paragraph"), "Alt+↑ / Alt+↓");
  check("keys: the insert menu is a slash", keysOf("slash"), "/");
  check("keys: a codex link is two brackets", keysOf("wikilink"), "[[");
  check("keys: a focused card nudges on arrows", keysOf("board"), "← / →");

  // A pointer gesture must not pretend to be a shortcut. Dragging a tab
  // has no binding, and inventing one for the sidebar's right-hand
  // column is exactly the drift this whole block exists to stop.
  check("keys: dragging a tab has no shortcut", keysOf("reorder"), null);
  check("keys: dragging a divider has no shortcut", keysOf("resize"), null);

  // Ctrl+Z is real, but it belongs in the sentence rather than in the
  // column: it undoes a reword, it doesn't perform one.
  check("keys: reword has no binding of its own", keysOf("reword"), null);
  ok(
    "keys: but the reword copy still names the undo",
    (TOUR_STEPS.find((s) => s.id === "reword")?.body ?? "").includes("Ctrl+Z"),
  );
}

/* ---------- categories ---------- */

{
  const catIds = HINT_CATEGORIES.map((c) => c.id);
  check("categories: no id appears twice", new Set(catIds).size, catIds.length);

  for (const cat of HINT_CATEGORIES) {
    ok(`categories: ${cat.id} has a label`, cat.label.trim().length > 0);
    ok(`categories: ${cat.id} has a blurb`, cat.blurb.trim().length > 0);
    // A heading with nothing under it is a dead end in the sidebar.
    ok(`categories: ${cat.id} has at least one hint`, stepsInCategory(cat.id).length > 0);
  }

  for (const step of TOUR_STEPS) {
    ok(`categories: ${step.id} belongs to a real one`, catIds.includes(step.category));
  }

  check("categories: lookup by id", categoryOf("writing")?.label, "Writing");
  check("categories: label by id", categoryLabel("around"), "Getting around");
  check("categories: an unknown id has no label", categoryLabel("nope" as CategoryId), "");

  // THE CONTIGUITY RULE. Walking the sidebar top to bottom has to be the
  // same journey as pressing Next from the first hint to the last.
  const flattened = hintGroups().flatMap((g) => g.items.map((i) => i.index));
  check(
    "categories: the sidebar order is the Next order",
    flattened,
    TOUR_STEPS.map((_, i) => i),
  );

  // Which is only true while each category's hints are one unbroken run.
  const seen = new Set<CategoryId>();
  let previous: CategoryId | null = null;
  let contiguous = true;
  for (const step of TOUR_STEPS) {
    if (step.category !== previous) {
      if (seen.has(step.category)) contiguous = false;
      seen.add(step.category);
      previous = step.category;
    }
  }
  ok("categories: no category is interleaved with another", contiguous);
}

/* ---------- the library: lookup, grouping, filtering ---------- */

{
  check("hints: allHints carries every step", allHints().length, TOUR_STEPS.length);
  check("hints: allHints carries the indexes", allHints()[3]?.index, 3);
  check("hints: allHints is in list order", allHints()[0]?.step.id, TOUR_STEPS[0]!.id);

  check("hints: indexOfHint finds one", indexOfHint(LAST_HINT), TOUR_STEPS.length - 1);
  // An id can outlive a change to the library — an old link, a stale
  // test — and a lookup that throws would take the panel with it.
  check("hints: indexOfHint refuses to guess", indexOfHint("nonsense" as ClipId), -1);

  const start: TourState = { ...TOUR_START };
  check("hints: goToHint jumps by name", goToHint(start, LAST_HINT).step, TOUR_STEPS.length - 1);
  ok("hints: an unknown id changes nothing at all", goToHint(start, "nope" as ClipId) === start);
  ok("hints: a jump to where you are costs nothing", goToHint(start, "palette") === start);

  // Grouping.
  const groups = hintGroups();
  check("groups: one per category", groups.length, HINT_CATEGORIES.length);
  check(
    "groups: every hint lands in exactly one",
    groups.reduce((n, g) => n + g.items.length, 0),
    TOUR_STEPS.length,
  );
  check("groups: the first is the first category", groups[0]?.category.id, HINT_CATEGORIES[0]!.id);
  check("groups: an empty one is dropped", groupHints([]).length, 0);

  // Filtering.
  check("filter: an empty query is the whole list", filterHints("").length, TOUR_STEPS.length);
  check("filter: whitespace is still empty", filterHints("   ").length, TOUR_STEPS.length);

  const idsOf = (q: string) => filterHints(q).map((h) => h.step.id);
  ok("filter: finds a hint by its title", idsOf("reword").includes("reword"));
  ok("filter: is case-insensitive", idsOf("REWORD").includes("reword"));
  ok("filter: reads the body too", idsOf("backlinks").includes("wikilink"));
  ok("filter: reads where it lives", idsOf("settings").includes("backdrop"));
  ok("filter: reads the category", idsOf("organising").includes("trash"));

  // The queries the search field was actually added for.
  ok("filter: a bare modifier lists the bound hints", idsOf("ctrl").length >= 2);
  ok("filter: nobody types the plus", idsOf("ctrl shift").includes("focus"));
  check("filter: ctrl+shift is only focus mode", idsOf("ctrl shift"), ["focus"]);
  // A lone letter is asked of the bindings only. Against prose it would
  // match "back", "block", "checkbox" and hand back half the library.
  check("filter: a single letter reads the bindings", idsOf("ctrl k"), ["palette"]);
  // A slash is a binding you can search for. It also brings the two
  // either/or bindings ("← / →") with it, which is the slash they are
  // written with — a small, honest cost of spelling pairs out.
  ok("filter: punctuation is a binding you can search for", idsOf("/").includes("slash"));
  check("filter: and so are two brackets", idsOf("[["), ["wikilink"]);

  // Every term has to land, in any order.
  ok("filter: terms are ANDed", idsOf("trash restore").includes("trash"));
  check("filter: order of terms is irrelevant", idsOf("restore trash"), idsOf("trash restore"));
  check("filter: a miss is a miss", filterHints("xyzzy").length, 0);
  check("filter: and a miss has no groups", hintGroups("xyzzy").length, 0);

  // A filtered sidebar still hands back true indexes, or clicking a
  // searched-for hint would jump to the wrong clip.
  const hit = filterHints("reword")[0]!;
  check("filter: indexes survive filtering", TOUR_STEPS[hit.index]!.id, hit.step.id);
}

/* ---------- indexing ---------- */

{
  check("stepAt: clamps below", stepAt(-4).id, TOUR_STEPS[0]!.id);
  check("stepAt: clamps above", stepAt(999).id, TOUR_STEPS[TOUR_STEPS.length - 1]!.id);
  check("stepAt: truncates a fraction", stepAt(1.8).id, TOUR_STEPS[1]!.id);
  // NaN is what Number("") and a hand-mangled key both produce; the panel
  // has to render something rather than nothing.
  check("stepAt: survives NaN", stepAt(NaN).id, TOUR_STEPS[0]!.id);

  check("currentStep: reads the state's index", currentStep({ ...TOUR_START, step: 2 }).id, TOUR_STEPS[2]!.id);
}

/* ---------- moving through it ---------- */

{
  const first: TourState = { step: 0, seen: false, offered: false };
  const last: TourState = { step: TOUR_STEPS.length - 1, seen: false, offered: false };

  ok("first step knows it is first", isFirstStep(first));
  ok("first step is not last", !isLastStep(first));
  ok("last step knows it is last", isLastStep(last));

  check("next: moves one", nextStep(first).step, 1);
  check("prev: moves one back", prevStep({ ...first, step: 3 }).step, 2);

  // Both ends stop rather than wrap. Wrapping would turn Next on the last
  // clip into "start over", which is not what a button labelled Done does.
  check("next: stops at the end", nextStep(last).step, last.step);
  check("prev: stops at the start", prevStep(first).step, 0);
  ok("next at the end changes nothing at all", nextStep(last) === last);
  ok("prev at the start changes nothing at all", prevStep(first) === first);

  // The sidebar rows are buttons, so any index can arrive.
  check("goToStep: clamps a wild index", goToStep(first, 99).step, TOUR_STEPS.length - 1);
  check("goToStep: clamps a negative one", goToStep(last, -3).step, 0);
  ok("goToStep: a move to where you are costs nothing", goToStep(first, 0) === first);

  check("progress: reads as a count", progressLabel(first), `1 of ${TOUR_STEPS.length}`);
  check("progress: at the end", progressLabel(last), `${TOUR_STEPS.length} of ${TOUR_STEPS.length}`);

  // Neither moving nor jumping may mark the tour seen — only leaving it.
  ok("next: does not mark it seen", !nextStep(first).seen);
  ok("goToStep: does not mark it seen", !goToStep(first, 2).seen);
  ok("goToHint: does not mark it seen", !goToHint(first, "trash").seen);
}

/* ---------- skip, finish, replay ---------- */

{
  const midway: TourState = { step: 3, seen: false, offered: true };

  const skipped = skipTour(midway);
  ok("skip: marks it seen", skipped.seen);
  ok("skip: marks it offered", skipped.offered);
  // The bookmark is the whole reason the step is persisted: someone who
  // bailed at the fourth clip and later presses Hints wants the fourth.
  check("skip: keeps the bookmark", skipped.step, 3);

  const finished = finishTour(midway);
  ok("finish: marks it seen", finished.seen);
  ok("finish: marks it offered", finished.offered);
  // Nothing left to resume, so a replay should be a replay.
  check("finish: clears the bookmark", finished.step, 0);

  check("replay after a skip resumes where it stopped", replayTour(skipped).step, 3);
  check("replay after a finish starts over", replayTour(finished).step, 0);
  ok("replay: it has still been seen", replayTour(skipped).seen);
  ok("replay: counts as offered", replayTour({ ...TOUR_START }).offered);

  ok("markOffered: is idempotent", markOffered(skipped) === skipped);
  ok("markOffered: sets the flag", markOffered(TOUR_START).offered);
  ok("markOffered: leaves seen alone", !markOffered(TOUR_START).seen);
}

/* ---------- the one promise: offered once, ever ---------- */

{
  ok("offer: waits for the intro", !shouldAutoOffer(TOUR_START, false));
  ok("offer: fires once the intro is done", shouldAutoOffer(TOUR_START, true));
  ok("offer: never after a skip", !shouldAutoOffer(skipTour(TOUR_START), true));
  ok("offer: never after a finish", !shouldAutoOffer(finishTour(TOUR_START), true));
  ok("offer: never twice", !shouldAutoOffer(markOffered(TOUR_START), true));
  // A writer who has seen it but somehow lost the offered flag still must
  // not be greeted with it — seen is the stronger claim of the two.
  ok(
    "offer: seen alone is enough to refuse",
    !shouldAutoOffer({ step: 0, seen: true, offered: false }, true),
  );
}

/* ---------- persistence ---------- */

{
  const store = fakeStore();
  check("read: a fresh install starts at the beginning", readTourState(store.get), TOUR_START);

  writeTourState({ step: 2, seen: false, offered: true }, store.set);
  check("write/read: round-trips", readTourState(store.get), {
    step: 2,
    seen: false,
    offered: true,
  });
  check("write: the step is legible in storage", store.map.get(KEY_STEP), "2");
  check("write: seen is a flag", store.map.get(KEY_SEEN), "0");
  check("write: offered is a flag", store.map.get(KEY_OFFERED), "1");

  writeTourState(skipTour({ step: 2, seen: false, offered: true }), store.set);
  check("write: skipping is recorded", store.map.get(KEY_SEEN), "1");

  // Hand-edited or half-written keys must resolve to something the panel
  // can render rather than to a blank.
  const junk = fakeStore({ [KEY_STEP]: "nonsense", [KEY_SEEN]: "yes", [KEY_OFFERED]: "" });
  check("read: junk falls back to the start", readTourState(junk.get), TOUR_START);

  const overshoot = fakeStore({ [KEY_STEP]: "9001", [KEY_SEEN]: "1", [KEY_OFFERED]: "1" });
  check("read: a step past the end clamps", readTourState(overshoot.get).step, TOUR_STEPS.length - 1);

  check("normalize: null is the start", normalizeTourState(null), TOUR_START);
  check("normalize: undefined is the start", normalizeTourState(undefined), TOUR_START);
  check("normalize: a negative step clamps", normalizeTourState({ step: -5 }).step, 0);
  ok("normalize: only a true is true", !normalizeTourState({ seen: undefined }).seen);
}

/* ---------- the scenarios a person would actually hit ---------- */

{
  // First launch: intro finishes, the tour offers itself, the writer
  // quits at the third clip without answering either way.
  const store = fakeStore();
  let state = readTourState(store.get);
  ok("scenario: it offers on the first launch after the intro", shouldAutoOffer(state, true));
  state = markOffered(state);
  state = nextStep(nextStep(state));
  writeTourState(state, store.set);

  // Relaunch. Nothing was skipped and nothing was finished — and it must
  // still not open on its own. This is the whole point of `offered`.
  const relaunched = readTourState(store.get);
  ok("scenario: and never offers again, even unfinished", !shouldAutoOffer(relaunched, true));
  check("scenario: the bookmark survived the quit", relaunched.step, 2);

  // Hints, in the titlebar: resumes at the third clip, and the writer
  // sees it through this time.
  let reopened = replayTour(relaunched);
  check("scenario: Hints resumes where they stopped", reopened.step, 2);
  while (!isLastStep(reopened)) reopened = nextStep(reopened);
  reopened = finishTour(reopened);
  writeTourState(reopened, store.set);

  const after = readTourState(store.get);
  ok("scenario: finished is seen", after.seen);
  ok("scenario: still no unsolicited offer", !shouldAutoOffer(after, true));
  check("scenario: a later replay starts from the top", replayTour(after).step, 0);
}

{
  // Six weeks later. The writer isn't taking a tour, they're looking one
  // thing up: what was the key for focus mode. Type "focus", click the
  // one row that comes back, land on that clip — without the bookmark
  // pretending they resumed a walkthrough they never started.
  const settled: TourState = { step: 0, seen: true, offered: true };
  const hits = filterHints("focus");
  ok("scenario: the search finds it", hits.some((h) => h.step.id === "focus"));

  const jumped = goToStep(settled, indexOfHint("focus"));
  check("scenario: clicking the row lands on it", currentStep(jumped).id, "focus");
  check("scenario: and the shortcut it reads is the real one", currentStep(jumped).keys, "Ctrl+Shift+F");
  ok("scenario: looking something up is not un-seeing the tour", jumped.seen);
  // Filtering the sidebar must not move the writer. Only a click does.
  check("scenario: a search on its own changes no state", goToStep(jumped, jumped.step), jumped);
}

/* ---------- report ---------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`tour tests: ${checks} checks passed`);
