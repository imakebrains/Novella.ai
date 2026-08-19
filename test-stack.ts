/* Assertions for the inspector's stacked panels.

   Same shape as test-tabs.ts: no output unless something is wrong,
   non-zero exit when it is. Its own file because it answers a different
   question — test-tabs proves the one-tool pane still behaves, this proves
   what happens when the writer splits it.

   The reason any of this is pure: a split is arithmetic (fractions that
   have to keep summing to 1, a floor no slot may cross, indexes that shift
   when a panel closes) wrapped around an arrangement that must never be
   able to show the same tool twice. Both are exactly the sort of thing
   that goes quietly wrong behind a pointer, and neither needs a DOM to be
   proved. */

import {
  ALL_TABS,
  MAX_SLOTS,
  activateTab,
  addTab,
  canStack,
  canStackTab,
  evenSizes,
  hiddenTabs,
  moveStack,
  normalizePrefs,
  paneSlots,
  removeTab,
  reorderTab,
  resizePane,
  resizeSlots,
  slotSizes,
  stackTab,
  tabPrefs,
  unstackTab,
  visibleTabs,
  type TabId,
  type TabPrefs,
} from "./src/ui/inspectorTabs";

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

/** Fractions don't land on round numbers, so sizes are compared with a
    tolerance rather than by string. */
function near(name: string, actual: number[], expected: number[]): void {
  checks++;
  const same =
    actual.length === expected.length && actual.every((v, i) => Math.abs(v - expected[i]!) < 1e-6);
  if (!same) {
    failures++;
    console.error(
      `FAIL  ${name}\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`,
    );
  }
}

const sums = (name: string, sizes: number[]) =>
  ok(`${name} — shares add up to the whole pane`, Math.abs(sizes.reduce((a, b) => a + b, 0) - 1) < 1e-9);

const prefsOf = (
  order: TabId[],
  opts: { hidden?: TabId[]; active?: TabId; stack?: TabId[]; sizes?: number[] } = {},
): TabPrefs => {
  const hidden = opts.hidden ?? [];
  const stack = opts.stack ?? [];
  const active = opts.active ?? order.find((t) => !hidden.includes(t) && !stack.includes(t))!;
  return { order, hidden, active, stack, sizes: opts.sizes ?? evenSizes(stack.length + 1) };
};

const base: TabId[] = ["links", "tasks", "calendar", "history", "music"];

/* ---------- slots: what the pane actually shows ---------- */

{
  const flat = prefsOf(base);
  check("slots: an unstacked pane is one slot", paneSlots(flat), ["links"]);
  near("slots: and it owns the whole height", slotSizes(flat), [1]);
  check("slots: nothing has left the strip", visibleTabs(flat), base);

  const split = stackTab(flat, "calendar");
  check("slots: the tabbed tool stays on top", paneSlots(split), ["links", "calendar"]);
  sums("slots: a fresh split", slotSizes(split));
  near("slots: a fresh split is even", slotSizes(split), [0.5, 0.5]);

  // The whole point of the request: two tools on screen at once.
  const both = stackTab(prefsOf(base, { active: "tasks" }), "calendar");
  check("slots: tasks and calendar together", paneSlots(both), ["tasks", "calendar"]);
}

/* ---------- a stacked tool leaves the strip ---------- */

{
  const p = stackTab(prefsOf(base), "calendar");

  // Two ways to open one tool would make "which panel does the tab drive?"
  // unanswerable, so the tab goes while the panel is open.
  check("stack: the tool leaves the tab strip", visibleTabs(p).includes("calendar"), false);
  check("stack: but it isn't hidden — it's busy", p.hidden, []);
  check("stack: so the + menu doesn't offer it back", hiddenTabs(p).includes("calendar"), false);
  check("stack: it keeps its parking space in the order", p.order, base);

  const back = unstackTab(p, "calendar");
  check("unstack: the tab comes back where it was", visibleTabs(back), base);
  check("unstack: the pane is one slot again", paneSlots(back), ["links"]);
  near("unstack: which takes the whole height", slotSizes(back), [1]);
  ok("unstack: a tool that isn't stacked is a no-op", unstackTab(back, "calendar") === back);
}

/* ---------- what stacking refuses ---------- */

{
  const p = prefsOf(base);

  const one = stackTab(p, "tasks");
  ok("stack: the tool already on show can't be stacked under itself", stackTab(p, "links") === p);
  ok("stack: the same tool twice is refused", stackTab(one, "tasks") === one);
  ok("stack: an unknown tool is refused", stackTab(p, "not-a-tool" as TabId) === p);

  // The cap is a judgement about a narrow pane, and it's enforced here so
  // no menu or drop zone can talk its way past it.
  const two = stackTab(one, "calendar");
  check("stack: the cap is three slots", paneSlots(two).length, MAX_SLOTS);
  ok("stack: a fourth slot is refused", stackTab(two, "history") === two);
  ok("stack: canStack agrees with the refusal", canStack(two) === false);
  ok("stack: and says yes while there's room", canStack(one));

  // The drop zone and the menu item both ask this before they offer
  // themselves, so it has to answer for every refusal above — it's the
  // same rule, not a second copy of it.
  ok("stack: the offer is refused at the cap", canStackTab(two, "history") === false);
  ok("stack: the offer is refused for the tool on show", canStackTab(p, "links") === false);
  ok("stack: the offer is refused for a tool already in a panel", canStackTab(one, "tasks") === false);
  ok("stack: the offer stands for anything else", canStackTab(p, "calendar"));
  for (const t of ALL_TABS) {
    ok(
      `stack: the offer matches what stacking does (${t})`,
      canStackTab(two, t) === (stackTab(two, t) !== two),
    );
  }
  sums("stack: three slots", slotSizes(two));
  near("stack: three slots divide evenly", slotSizes(two), [1 / 3, 1 / 3, 1 / 3]);
}

/* ---------- stacking a closed tool, and closing a stacked one ---------- */

{
  const p = prefsOf(base, { hidden: ["calendar"] });
  check("stack: a closed tool can be opened straight into a panel", paneSlots(stackTab(p, "calendar")), [
    "links",
    "calendar",
  ]);
  check("stack: opening it that way un-hides it", stackTab(p, "calendar").hidden, []);

  // The Settings chip is the visibility authority, and it only knows how to
  // hide. Unticking a stacked tool has to close its panel too, or the chip
  // would look broken while the tool sat there.
  const stacked = stackTab(prefsOf(base), "calendar");
  const off = removeTab(stacked, "calendar");
  check("hide: unticking a stacked tool closes its panel", paneSlots(off), ["links"]);
  check("hide: and switches the tool off", off.hidden, ["calendar"]);
  check("hide: so it isn't on the strip either", visibleTabs(off).includes("calendar"), false);
  check("hide: the + menu offers it back", hiddenTabs(off), ["calendar"]);
  near("hide: the pane reclaims the height", slotSizes(off), [1]);

  // Adding it back from the + menu returns it to the strip, open.
  const again = addTab(off, "calendar");
  check("add: a hidden tool comes back as a tab", visibleTabs(again).includes("calendar"), true);
  check("add: and opens", again.active, "calendar");
}

/* ---------- the tabbed slot and the stack can't hold the same tool ---------- */

{
  const p = stackTab(prefsOf(base), "calendar");

  // Nothing in the UI can reach this — the strip and the Tools menu both
  // list visibleTabs — but the invariant is what everything else assumes.
  const lifted = addTab(p, "calendar");
  check("add: asking for a stacked tool lifts it out of its panel", lifted.stack, []);
  check("add: and makes it the tabbed one", lifted.active, "calendar");
  check("add: never both at once", paneSlots(lifted), ["calendar"]);

  const off = prefsOf(base, { hidden: ["music"] });
  ok("activate: a stacked tool can't be made the tabbed one behind its own back", activateTab(p, "calendar") === p);
  ok("activate: a hidden tool can't be activated either", activateTab(off, "music") === off);
  check("activate: an ordinary tab opens", activateTab(p, "tasks").active, "tasks");
  ok("activate: the tab already open is a no-op", activateTab(p, "links") === p);
}

/* ---------- switching tabs doesn't disturb the panels ---------- */

{
  const p = stackTab(prefsOf(base, { active: "tasks" }), "calendar");
  const switched = activateTab(p, "history");

  check("switch: the tabbed slot changes", paneSlots(switched), ["history", "calendar"]);
  check("switch: the panel below is untouched", switched.stack, ["calendar"]);
  near("switch: and keeps its share", slotSizes(switched), slotSizes(p));
  // The tool that was in the tabbed slot goes back to being an ordinary tab.
  check("switch: the old tool is still on the strip", visibleTabs(switched).includes("tasks"), true);

  // Reordering the strip is orthogonal to the split.
  const dragged = reorderTab(switched, "music", 0);
  check("switch: a strip reorder leaves the stack alone", dragged.stack, ["calendar"]);
  check("switch: and the reorder still lands", visibleTabs(dragged)[0], "music");
}

/* ---------- ordering the panels ---------- */

{
  const p = stackTab(stackTab(prefsOf(base), "tasks"), "calendar");
  check("order: stacked in the order they were opened", paneSlots(p), ["links", "tasks", "calendar"]);

  // Sizes travel with the panel, so a panel you sized stays the size you
  // made it when it changes places.
  const sized = { ...p, sizes: [0.5, 0.2, 0.3] };
  const swapped = moveStack(sized, "calendar", -1);
  check("order: the panels trade places", paneSlots(swapped), ["links", "calendar", "tasks"]);
  near("order: and their heights go with them", slotSizes(swapped), [0.5, 0.3, 0.2]);
  sums("order: after a swap", slotSizes(swapped));

  // The ends stop rather than wrapping, and slot 0 belongs to the strip.
  ok("order: the top panel can't climb into the tabbed slot", moveStack(p, "tasks", -1) === p);
  ok("order: the bottom panel can't go further down", moveStack(p, "calendar", 1) === p);
  ok("order: a tool that isn't stacked can't be moved", moveStack(p, "music", 1) === p);

  // Dropping between two panels rather than under them.
  const between = stackTab(stackTab(prefsOf(base), "calendar"), "tasks", 0);
  check("order: a tool can be dropped above another panel", paneSlots(between), [
    "links",
    "tasks",
    "calendar",
  ]);
  const clamped = stackTab(stackTab(prefsOf(base), "calendar"), "tasks", 99);
  check("order: a position past the end lands at the end", paneSlots(clamped), [
    "links",
    "calendar",
    "tasks",
  ]);
}

/* ---------- closing the middle panel ---------- */

{
  const p = { ...stackTab(stackTab(prefsOf(base), "tasks"), "calendar"), sizes: [0.5, 0.2, 0.3] };
  const closed = unstackTab(p, "tasks");

  check("close: the right panel goes", paneSlots(closed), ["links", "calendar"]);
  // Back between links and history, where its tab was before it was
  // pinned — not appended to the end of the strip.
  check("close: its tool returns to the strip in its old place", visibleTabs(closed), [
    "links",
    "tasks",
    "history",
    "music",
  ]);
  check("close: the panel still open keeps its tab off the strip", visibleTabs(closed).includes("calendar"), false);
  sums("close: after the middle panel goes", slotSizes(closed));
  // 0.5 and 0.3 rescale to keep their proportion rather than resetting.
  near("close: the survivors keep their proportions", slotSizes(closed), [0.625, 0.375]);
}

/* ---------- the split ratio ---------- */

{
  const sizes = [0.5, 0.5];

  near("resize: dragging down grows the upper panel", resizeSlots(sizes, 0, 0.2), [0.7, 0.3]);
  near("resize: dragging up grows the lower one", resizeSlots(sizes, 0, -0.2), [0.3, 0.7]);
  sums("resize: after a drag", resizeSlots(sizes, 0, 0.2));

  // A panel dragged to nothing looks like a tool that vanished, with no
  // handle left to drag it back out with.
  const squashed = resizeSlots(sizes, 0, 5);
  ok("resize: the lower panel never disappears", squashed[1]! >= 0.12 - 1e-9);
  ok("resize: the upper panel never disappears", resizeSlots(sizes, 0, -5)[0]! >= 0.12 - 1e-9);
  sums("resize: at the floor", squashed);

  // Only the two panels either side of the handle move.
  const three = [0.4, 0.3, 0.3];
  near("resize: the untouched panel doesn't move", resizeSlots(three, 1, 0.1), [0.4, 0.4, 0.2]);
  near("resize: the lower divider only touches the lower pair", resizeSlots(three, 0, 0.1), [
    0.5, 0.2, 0.3,
  ]);

  ok("resize: a divider that doesn't exist is refused", resizeSlots(sizes, 5, 0.1) === sizes);
  ok("resize: a negative divider is refused", resizeSlots(sizes, -1, 0.1) === sizes);
  ok("resize: there is no divider under the last slot", resizeSlots(sizes, 1, 0.1) === sizes);
  ok("resize: a nil drag is the same array", resizeSlots(sizes, 0, 0) === sizes);
  ok("resize: an unstacked pane has nothing to resize", resizeSlots([1], 0, 0.2).length === 1);

  // And at the level of prefs, so a refused drag costs no write.
  const p = stackTab(prefsOf(base), "calendar");
  ok("resize: a nil drag leaves prefs alone", resizePane(p, 0, 0) === p);
  near("resize: a real drag lands", slotSizes(resizePane(p, 0, 0.25)), [0.75, 0.25]);
  near("resize: a drag past the floor stops at it", slotSizes(resizePane(p, 0, 9)), [0.88, 0.12]);
  sums("resize: past the floor", slotSizes(resizePane(p, 0, 9)));
}

/* ---------- sizes repaired on the way in ---------- */

{
  const three = evenSizes(3);
  near("sizes: even means even", three, [1 / 3, 1 / 3, 1 / 3]);
  sums("sizes: even", three);

  const p = prefsOf(base, { stack: ["calendar"] });

  // Whatever storage hands over, the renderer gets fractions it can use:
  // never a NaN, never a zero, never the wrong count.
  near("sizes: garbage falls back to even", slotSizes({ ...p, sizes: [NaN, 0] }), [0.5, 0.5]);
  near("sizes: a missing entry takes an even share", slotSizes({ ...p, sizes: [1] }), [2 / 3, 1 / 3]);
  near("sizes: too many are dropped", slotSizes({ ...p, sizes: [0.5, 0.25, 0.25] }), [2 / 3, 1 / 3]);
  near("sizes: unnormalized entries are scaled", slotSizes({ ...p, sizes: [3, 1] }), [0.75, 0.25]);
  sums("sizes: after scaling", slotSizes({ ...p, sizes: [3, 1] }));

  const starved = slotSizes({ ...p, sizes: [0.999, 0.001] });
  ok("sizes: a starved slot is lifted to the floor", starved[1]! >= 0.12 - 1e-9);
  sums("sizes: after lifting a starved slot", starved);
  ok("sizes: lifting one slot doesn't starve the other", starved[0]! >= 0.12 - 1e-9);

  // Repair has to be stable or every read would drift.
  near("sizes: repair is idempotent", slotSizes({ ...p, sizes: starved }), starved);
}

/* ---------- normalizePrefs: whatever storage hands back ---------- */

{
  const fresh = normalizePrefs(null);
  check("normalize: a first run has nothing stacked", fresh.stack, []);
  near("normalize: one slot, whole pane", fresh.sizes, [1]);

  // Prefs saved before stacking existed must open, not explode.
  const older = normalizePrefs({ order: ALL_TABS.slice(), hidden: [], active: "tasks" });
  check("normalize: prefs from before stacking still load", older.stack, []);
  near("normalize: and get a size", older.sizes, [1]);

  const junk = normalizePrefs({
    order: ALL_TABS.slice(),
    hidden: ["music"] as TabId[],
    active: "links",
    stack: ["calendar", "not-a-tool", "calendar", "links", "music", "tasks", "history"] as TabId[],
    sizes: [1, 1, 1, 1, 1],
  });
  check("normalize: unknown tools are dropped from the stack", junk.stack.includes("not-a-tool" as TabId), false);
  check("normalize: duplicates are dropped", new Set(junk.stack).size, junk.stack.length);
  check("normalize: the tabbed tool can't also be a panel", junk.stack.includes("links"), false);
  check("normalize: a tool switched off in Settings can't be a panel", junk.stack.includes("music"), false);
  check("normalize: the cap holds against storage too", junk.stack.length, MAX_SLOTS - 1);
  check("normalize: what survives, in order", junk.stack, ["calendar", "tasks"]);
  check("normalize: sizes match the slot count", junk.sizes.length, junk.stack.length + 1);
  sums("normalize: repaired sizes", junk.sizes);
  check("normalize: is idempotent", normalizePrefs(junk), junk);

  // A saved active that's also in the saved stack: the tabbed slot wins,
  // because it's the one the strip is pointing at.
  const doubled = normalizePrefs({
    order: ALL_TABS.slice(),
    hidden: [],
    active: "tasks",
    stack: ["tasks"] as TabId[],
  });
  check("normalize: the tabbed tool is never doubled into a panel", doubled.stack, []);
  ok("normalize: every slot is a different tool", new Set(paneSlots(junk)).size === paneSlots(junk).length);

  // An all-hidden repair still has to leave the stack coherent.
  const rescued = normalizePrefs({
    order: ALL_TABS.slice(),
    hidden: ALL_TABS.slice(),
    active: "links",
    stack: ["tasks"] as TabId[],
  });
  check("normalize: the all-hidden rescue keeps the panel", rescued.stack, ["tasks"]);
  ok("normalize: and something is visible", visibleTabs(rescued).length > 0);
  ok("normalize: the rescued pane doesn't show a tool twice", new Set(paneSlots(rescued)).size === paneSlots(rescued).length);
}

/* ---------- the store: the same rules, persisted ---------- */

{
  // The store starts from whatever ran before it in this process; put it
  // somewhere known first.
  for (const t of ALL_TABS) tabPrefs.show(t);
  tabPrefs.setActive("links");
  for (const t of tabPrefs.get().stack.slice()) tabPrefs.unstack(t);

  check("store: begins unstacked", tabPrefs.slots(), ["links"]);

  tabPrefs.stack("calendar");
  check("store: a drop splits the pane", tabPrefs.slots(), ["links", "calendar"]);
  check("store: the tool leaves the strip", tabPrefs.visible().includes("calendar"), false);
  near("store: an even split", tabPrefs.sizes(), [0.5, 0.5]);

  tabPrefs.resize(0, 0.2);
  near("store: the divider moved", tabPrefs.sizes(), [0.7, 0.3]);
  tabPrefs.evenSlots();
  near("store: and evens up again", tabPrefs.sizes(), [0.5, 0.5]);

  tabPrefs.stack("tasks");
  check("store: a third slot", tabPrefs.slots(), ["links", "calendar", "tasks"]);
  tabPrefs.moveStacked("tasks", -1);
  check("store: panels reorder", tabPrefs.slots(), ["links", "tasks", "calendar"]);

  // Switching tabs leaves the panels where they are.
  tabPrefs.setActive("history");
  check("store: the strip drives the top slot only", tabPrefs.slots(), ["history", "tasks", "calendar"]);

  tabPrefs.unstack("tasks");
  check("store: closing a panel returns its tool", tabPrefs.visible().includes("tasks"), true);
  check("store: and shrinks the pane to two", tabPrefs.slots().length, 2);
  sums("store: after a close", tabPrefs.sizes());
  near("store: the survivors rebalance", tabPrefs.sizes(), [0.5, 0.5]);

  // Refused changes must not notify, or React re-renders for nothing on
  // every declined drop and every drag that hits the floor.
  const version = tabPrefs.getVersion();
  tabPrefs.stack("calendar"); // already stacked
  tabPrefs.stack("history"); // the tabbed tool
  tabPrefs.unstack("music"); // not stacked
  tabPrefs.moveStacked("calendar", 1); // already at the bottom
  tabPrefs.resize(0, 0); // a nil drag
  tabPrefs.evenSlots(); // already even, per the check above
  tabPrefs.setActive("history"); // already open
  tabPrefs.setActive("calendar"); // stacked, so not a tab
  check("store: refused changes don't notify", tabPrefs.getVersion(), version);

  // The pane can never be left showing one tool in two places, whatever
  // order the two front doors are used in.
  tabPrefs.setActive("links");
  tabPrefs.stack("music");
  tabPrefs.hide("music");
  ok("store: hiding a stacked tool closes its panel", !tabPrefs.slots().includes("music"));
  ok("store: and takes it off the strip", !tabPrefs.visible().includes("music"));
  tabPrefs.show("music");
  ok("store: showing it again puts it back as a tab", tabPrefs.visible().includes("music"));
  const slots = tabPrefs.slots();
  ok("store: no tool is ever in two slots", new Set(slots).size === slots.length);
  sums("store: sizes stay whole throughout", tabPrefs.sizes());
}

/* ---------- report ---------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`stack tests: ${checks} checks passed`);
