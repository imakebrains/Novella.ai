/* Assertions for the inspector's tab arrangement.

   Same shape as test-units.ts: no output unless something is wrong,
   non-zero exit when it is. Kept in its own file because the arrangement
   has two front doors — the drag in the pane and the chips in Settings —
   and this is the contract they both have to hold to.

   Everything here is pure. The store at the bottom of inspectorTabs.ts is
   exercised too: it runs headless because both its localStorage calls sit
   inside try/catch, and a store that agrees with the pure functions is
   exactly the thing worth proving. */

import {
  ALL_TABS,
  TABBED,
  addTab,
  cycleTab,
  hiddenTabs,
  moveTab,
  normalizePrefs,
  nudgeTab,
  removeTab,
  reorderTab,
  tabPrefs,
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

/** Prefs without the ceremony. Active defaults to the first visible tab.

    The pane is unsplit here on purpose: this file is the contract for the
    ordinary one-tool pane, and it has to keep holding now that the pane
    can be split into panels. The split arrangements are asserted in
    test-stack.ts. */
const prefsOf = (order: TabId[], hidden: TabId[] = [], active?: TabId): TabPrefs => ({
  order,
  hidden,
  active: active ?? order.find((t) => !hidden.includes(t))!,
  rows: [[TABBED]],
  rowSizes: [1],
  colSizes: [[1]],
});

/* ---------- the registry itself ---------- */

{
  check("tabs: no duplicate ids in the registry", new Set(ALL_TABS).size, ALL_TABS.length);
  ok("tabs: the registry isn't empty", ALL_TABS.length > 0);
}

/* ---------- moveTab: the array move under every drag ---------- */

{
  const strip: TabId[] = ["links", "tasks", "history", "music"];

  check("move: forward lands on the target slot", moveTab(strip, 0, 2), [
    "tasks",
    "history",
    "links",
    "music",
  ]);
  check("move: backward lands on the target slot", moveTab(strip, 3, 1), [
    "links",
    "music",
    "tasks",
    "history",
  ]);
  check("move: to the front", moveTab(strip, 2, 0), ["history", "links", "tasks", "music"]);
  check("move: to the end", moveTab(strip, 0, 3), ["tasks", "history", "music", "links"]);

  // A drag released past the edge of the strip should land at the edge.
  check("move: past the end clamps", moveTab(strip, 0, 99), moveTab(strip, 0, 3));
  check("move: before the start clamps", moveTab(strip, 2, -5), moveTab(strip, 2, 0));

  // Refusals hand back the same array so callers can skip the write.
  ok("move: onto itself is the same array", moveTab(strip, 1, 1) === strip);
  ok("move: an index that doesn't exist is refused", moveTab(strip, 9, 0) === strip);
  ok("move: a negative source is refused", moveTab(strip, -1, 0) === strip);
  ok("move: an empty strip is refused", moveTab([], 0, 0).length === 0);

  check("move: never loses or duplicates a tab", moveTab(strip, 0, 2).slice().sort(), strip.slice().sort());
  check("move: the input is untouched", strip, ["links", "tasks", "history", "music"]);
}

/* ---------- visible / hidden ---------- */

{
  const p = prefsOf(ALL_TABS.slice(), ["critique", "music"], "tasks");
  check("visible: hidden tabs are left out", visibleTabs(p).includes("critique"), false);
  check("visible: keeps the writer's order", visibleTabs(p)[0], "links");
  check("hidden: lists what the + menu offers", hiddenTabs(p), ["critique", "music"]);
  check(
    "visible + hidden account for everything",
    visibleTabs(p).length + hiddenTabs(p).length,
    ALL_TABS.length,
  );
}

/* ---------- reorderTab: dragging with hidden tabs threaded through ---------- */

{
  // "critique" is closed but still parked between links and tasks.
  const p = prefsOf(["links", "critique", "tasks", "history"], ["critique"], "links");

  const moved = reorderTab(p, "history", 0);
  check("reorder: a drag to the front reads correctly", visibleTabs(moved), [
    "history",
    "links",
    "tasks",
  ]);
  // The parking space is the point: reopen a closed tab and it comes back
  // to the neighbours it had, not to the end of the strip.
  check("reorder: hidden tabs keep their slot", moved.order[1], "critique");
  check("reorder: nothing is lost", moved.order.slice().sort(), p.order.slice().sort());

  check(
    "reorder: dropping a tab on itself changes nothing",
    reorderTab(p, "tasks", visibleTabs(p).indexOf("tasks")) === p,
    true,
  );
  check("reorder: a hidden tab can't be dragged", reorderTab(p, "critique", 0) === p, true);
  check("reorder: an index past the end clamps to the end", visibleTabs(reorderTab(p, "links", 99)), [
    "tasks",
    "history",
    "links",
  ]);

  // Reopening after a reorder drops the tab back into the slot it held —
  // second in the order, wherever the visible tabs have moved to.
  const reopened = addTab(moved, "critique");
  check("reorder: a reopened tab returns to its parked slot", visibleTabs(reopened), [
    "history",
    "critique",
    "links",
    "tasks",
  ]);
}

/* ---------- nudgeTab: the keyboard's version of the drag ---------- */

{
  const p = prefsOf(["links", "critique", "tasks", "history"], ["critique"], "links");

  check("nudge: right swaps with the next visible tab", visibleTabs(nudgeTab(p, "links", 1)), [
    "tasks",
    "links",
    "history",
  ]);
  check("nudge: left swaps with the previous", visibleTabs(nudgeTab(p, "history", -1)), [
    "links",
    "history",
    "tasks",
  ]);
  // Stopping at the ends, not wrapping: a wrap would fling a tab across the
  // whole strip on a keypress meant to move it one place.
  ok("nudge: the first tab can't go left", nudgeTab(p, "links", -1) === p);
  ok("nudge: the last tab can't go right", nudgeTab(p, "history", 1) === p);
  ok("nudge: a hidden tab can't be nudged", nudgeTab(p, "critique", 1) === p);

  // Nudging right then left is a round trip.
  check(
    "nudge: right then left returns to the start",
    visibleTabs(nudgeTab(nudgeTab(p, "links", 1), "links", -1)),
    visibleTabs(p),
  );
}

/* ---------- addTab / removeTab ---------- */

{
  const p = prefsOf(ALL_TABS.slice(), ["music"], "links");

  const added = addTab(p, "music");
  check("add: the tab comes back", visibleTabs(added).includes("music"), true);
  check("add: and opens — nobody adds a tool to ignore it", added.active, "music");
  check("add: hidden shrinks", added.hidden, []);
  // The Tools dropdown calls show() on every pick, including the tab
  // you're already on — that must not count as a change.
  ok("add: the tab you're already on is a no-op", addTab(p, "links") === p);
  check("add: a visible tab that isn't open just opens", addTab(p, "tasks").active, "tasks");
  check("add: opening a visible tab doesn't reorder", addTab(p, "tasks").order, p.order);

  const removed = removeTab(p, "links");
  check("remove: the tab goes", visibleTabs(removed).includes("links"), false);
  check("remove: it stays in the order, parked", removed.order.includes("links"), true);
  // Closing the open tab hands over to the neighbour that slid into its
  // place, not to the far left.
  check("remove: the neighbour takes over", removed.active, "critique");

  const last = prefsOf(["links", "tasks"], ["tasks"], "links");
  ok("remove: the last visible tab refuses to close", removeTab(last, "links") === last);
  ok("remove: an already-hidden tab is a no-op", removeTab(p, "music") === p);

  // Closing the tab at the end falls back to the new end.
  const end = prefsOf(["links", "tasks", "history"], [], "history");
  check("remove: closing the last one falls back left", removeTab(end, "history").active, "tasks");
  // Closing a tab you aren't looking at doesn't move you.
  check("remove: closing an inactive tab leaves you put", removeTab(end, "links").active, "history");
}

/* ---------- normalizePrefs: whatever storage hands back ---------- */

{
  const fresh = normalizePrefs(null);
  check("normalize: a first run shows everything", fresh.hidden, []);
  check("normalize: order is the full registry", fresh.order, ALL_TABS);
  check("normalize: active is the first tab", fresh.active, ALL_TABS[0]);

  // A tab added to the app after these prefs were saved appends rather than
  // vanishing — prefs never hide something the writer didn't hide.
  const older = normalizePrefs({ order: ["music", "links"] as TabId[], hidden: [], active: "music" });
  check("normalize: saved order comes first", older.order.slice(0, 2), ["music", "links"]);
  check("normalize: unsaved tabs append", older.order.length, ALL_TABS.length);
  check("normalize: nothing new is hidden", older.hidden, []);

  const junk = normalizePrefs({
    order: ["music", "not-a-tab", "music", "links"] as TabId[],
    hidden: ["also-not-a-tab"] as unknown as TabId[],
    active: "gone" as TabId,
  });
  check("normalize: unknown ids are dropped", junk.order.includes("not-a-tab" as TabId), false);
  // A duplicate id would render twice and make every index ambiguous.
  check("normalize: duplicates are dropped", new Set(junk.order).size, junk.order.length);
  check("normalize: unknown hidden ids are dropped", junk.hidden, []);
  check("normalize: an impossible active falls back to a real tab", junk.active, "music");

  // A pane with no tabs is a dead end with no way back.
  const allHidden = normalizePrefs({ order: ALL_TABS.slice(), hidden: ALL_TABS.slice(), active: "links" });
  check("normalize: never all-hidden", allHidden.hidden, []);
  ok("normalize: something is always visible", visibleTabs(allHidden).length > 0);

  // Active pointing at a closed tab would render a panel with no tab lit.
  const hiddenActive = normalizePrefs({
    order: ALL_TABS.slice(),
    hidden: ["links"] as TabId[],
    active: "links",
  });
  ok("normalize: active is never a hidden tab", visibleTabs(hiddenActive).includes(hiddenActive.active));

  // The self-heal has to be stable, or every load would rewrite storage.
  check("normalize: is idempotent", normalizePrefs(junk), junk);
}

/* ---------- wheel-cycling follows the new order ---------- */

{
  const vis = ["links", "tasks", "history"] as TabId[];
  check("cycle: wheel down steps forward", cycleTab("links", vis, 1), "tasks");
  check("cycle: wheel up steps back", cycleTab("links", vis, -1), "history");
  check("cycle: wraps at the end", cycleTab("history", vis, 1), "links");
  check("cycle: a hidden current falls to the first visible", cycleTab("music", vis, 1), "links");
  check("cycle: an empty strip is a no-op", cycleTab("links", [], 1), "links");

  // The wheel walks the arrangement, so dragging a tab reorders the wheel
  // with it — that's requirement and regression in one line.
  const p = prefsOf(["links", "tasks", "history"], [], "links");
  const dragged = reorderTab(p, "history", 0);
  check(
    "cycle: the wheel follows a reordered strip",
    cycleTab("history", visibleTabs(dragged), 1),
    "links",
  );
  check(
    "cycle: skips a tab that was closed",
    cycleTab("links", visibleTabs(removeTab(p, "tasks")), 1),
    "history",
  );
}

/* ---------- the store: one source of truth for both front doors ---------- */

/* The Settings chips call hide/show; the strip calls move/nudge/hide/show.
   If these ever stop agreeing, one of the two UIs is lying to the writer. */

{
  const start = tabPrefs.get();
  check("store: starts from normalized prefs", start.order, ALL_TABS);
  check("store: visible() matches the pure read", tabPrefs.visible(), visibleTabs(start));

  // What the Settings chip does.
  tabPrefs.hide("music");
  ok("store: hide takes the tab off the strip", !tabPrefs.visible().includes("music"));
  check("store: hide is the pure removeTab", tabPrefs.get().hidden, ["music"]);
  check("store: the + menu offers it back", tabPrefs.hidden(), ["music"]);

  // What the + menu does.
  tabPrefs.show("music");
  ok("store: show puts it back", tabPrefs.visible().includes("music"));
  check("store: and opens it", tabPrefs.get().active, "music");

  // What a drag does.
  tabPrefs.move("music", 0);
  check("store: a drag reorders the strip", tabPrefs.visible()[0], "music");
  check("store: the wheel agrees with the strip", cycleTab("music", tabPrefs.visible(), 1), "links");

  // What Alt+arrow does.
  tabPrefs.nudge("music", 1);
  check("store: a nudge moves one slot", tabPrefs.visible().slice(0, 2), ["links", "music"]);

  // Hide the tab that's open: the store must not leave the pane pointing at
  // a tab nobody can see.
  tabPrefs.hide("music");
  ok("store: closing the open tab moves the writer somewhere real", tabPrefs.visible().includes(tabPrefs.get().active));

  // A refused change must not bump the version, or React re-renders for
  // nothing on every declined drag.
  const version = tabPrefs.getVersion();
  tabPrefs.move(tabPrefs.visible()[0]!, 0);
  tabPrefs.nudge(tabPrefs.visible()[0]!, -1);
  tabPrefs.hide("music");
  check("store: refused changes don't notify", tabPrefs.getVersion(), version);

  // Subscribers hear real ones.
  let heard = 0;
  const off = tabPrefs.subscribe(() => heard++);
  tabPrefs.show("music");
  off();
  tabPrefs.hide("music");
  check("store: subscribers hear a real change once", heard, 1);
}

/* ---------- report ---------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`tab tests: ${checks} checks passed`);
