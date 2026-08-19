/* Assertions for the guided tour.

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

   No DOM, no localStorage: readTourState and writeTourState take their
   accessors, so the round-trip is exercised against a Map here and
   against the browser in the app. */

import {
  AUTO_OFFER_MS,
  KEY_OFFERED,
  KEY_SEEN,
  KEY_STEP,
  TOUR_START,
  TOUR_STEPS,
  currentStep,
  finishTour,
  goToStep,
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
  writeTourState,
  type ClipId,
  type TourState,
} from "./src/ui/tourSteps";

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

  const ids = TOUR_STEPS.map((s) => s.id);
  check("steps: no id appears twice", new Set(ids).size, ids.length);

  // The gestures the tour was commissioned to cover. A clip quietly
  // dropped from the list is the failure this catches.
  const required: ClipId[] = ["stack", "reorder", "palette", "reword", "board", "resize"];
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
  // The tour ends on writing, not on furniture.
  check("steps: reword lands last", ids[ids.length - 1], "reword");

  ok("steps: the auto-offer waits a beat", AUTO_OFFER_MS > 0 && AUTO_OFFER_MS < 4000);
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

  // The progress dots are buttons, so any index can arrive.
  check("goToStep: clamps a wild index", goToStep(first, 99).step, TOUR_STEPS.length - 1);
  check("goToStep: clamps a negative one", goToStep(last, -3).step, 0);
  ok("goToStep: a move to where you are costs nothing", goToStep(first, 0) === first);

  check("progress: reads as a count", progressLabel(first), `1 of ${TOUR_STEPS.length}`);
  check("progress: at the end", progressLabel(last), `${TOUR_STEPS.length} of ${TOUR_STEPS.length}`);

  // Neither moving nor jumping may mark the tour seen — only leaving it.
  ok("next: does not mark it seen", !nextStep(first).seen);
  ok("goToStep: does not mark it seen", !goToStep(first, 2).seen);
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

/* ---------- report ---------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`tour tests: ${checks} checks passed`);
