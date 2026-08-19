/* Assertions for the inspector's split pane.

   Same shape as test-tabs.ts: no output unless something is wrong,
   non-zero exit when it is. Its own file because it answers a different
   question — test-tabs proves the one-tool pane still behaves, this proves
   what happens when the writer splits it, downward or sideways.

   The reason any of this is pure: a split is arithmetic (fractions that
   have to keep summing to 1, floors no row or column may cross, indexes
   that shift when a panel closes and takes its row with it) wrapped
   around an arrangement that must never be able to show the same tool
   twice. Both are exactly the sort of thing that goes quietly wrong
   behind a pointer, and neither needs a DOM to be proved. */

import {
  ALL_TABS,
  MAX_SLOTS,
  TABBED,
  activateTab,
  addTab,
  canMovePanelTo,
  canSplit,
  canSplitTab,
  closePanel,
  colShares,
  evenPane,
  evenSizes,
  hiddenTabs,
  isPanel,
  movePanel,
  movePanelTo,
  normalizePrefs,
  paneRows,
  paneSlots,
  panelTools,
  removeTab,
  reorderTab,
  resizeCols,
  resizeRows,
  resizeSlots,
  rowShares,
  slotCount,
  splitTab,
  tabPrefs,
  visibleTabs,
  type Cell,
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
  ok(`${name} — shares add up to the whole`, Math.abs(sizes.reduce((a, b) => a + b, 0) - 1) < 1e-9);

const prefsOf = (
  order: TabId[],
  opts: {
    hidden?: TabId[];
    active?: TabId;
    rows?: Cell[][];
    rowSizes?: number[];
    colSizes?: number[][];
  } = {},
): TabPrefs => {
  const hidden = opts.hidden ?? [];
  const rows = opts.rows ?? [[TABBED]];
  const taken = rows.flat();
  const active =
    opts.active ?? order.find((t) => !hidden.includes(t) && !taken.includes(t))!;
  return {
    order,
    hidden,
    active,
    rows,
    rowSizes: opts.rowSizes ?? evenSizes(rows.length),
    colSizes: opts.colSizes ?? rows.map((row) => evenSizes(row.length)),
  };
};

const base: TabId[] = ["links", "tasks", "calendar", "history", "music"];

/* ---------- slots: what the pane actually shows ---------- */

{
  const flat = prefsOf(base);
  check("slots: an unsplit pane is one slot", paneSlots(flat), ["links"]);
  check("slots: one row, one cell", paneRows(flat), [["links"]]);
  near("slots: and it owns the whole height", rowShares(flat), [1]);
  near("slots: and the whole width", colShares(flat, 0), [1]);
  check("slots: nothing has left the strip", visibleTabs(flat), base);

  const split = splitTab(flat, "calendar");
  check("slots: the tabbed tool stays on top", paneSlots(split), ["links", "calendar"]);
  check("slots: a bottom drop is a second row", paneRows(split), [["links"], ["calendar"]]);
  sums("slots: a fresh split", rowShares(split));
  near("slots: a fresh split is even", rowShares(split), [0.5, 0.5]);

  // The whole point of the request: two tools on screen at once.
  const both = splitTab(prefsOf(base, { active: "tasks" }), "calendar");
  check("slots: tasks and calendar together", paneSlots(both), ["tasks", "calendar"]);
}

/* ---------- sideways: the same gesture, aimed at an edge ---------- */

{
  const flat = prefsOf(base);

  const right = splitTab(flat, "calendar", { side: "right" });
  check("beside: a right drop is a second column", paneRows(right), [["links", "calendar"]]);
  check("beside: still one row", right.rows.length, 1);
  near("beside: which still owns the whole height", rowShares(right), [1]);
  near("beside: the columns divide evenly", colShares(right, 0), [0.5, 0.5]);
  sums("beside: a fresh column split", colShares(right, 0));
  check("beside: the tool left the strip, same as below", visibleTabs(right).includes("calendar"), false);
  check("beside: and isn't hidden — it's busy", right.hidden, []);

  const left = splitTab(flat, "calendar", { side: "left" });
  check("beside: a left drop lands left of the tools", paneRows(left), [["calendar", "links"]]);
  near("beside: and still divides evenly", colShares(left, 0), [0.5, 0.5]);

  // Tasks beside the calendar, which is the arrangement the request
  // described in so many words.
  const pair = splitTab(prefsOf(base, { active: "tasks" }), "calendar", { side: "right" });
  check("beside: tasks beside calendar", paneRows(pair), [["tasks", "calendar"]]);

  const three = splitTab(right, "tasks", { side: "right" });
  check("beside: a third column", paneRows(three), [["links", "calendar", "tasks"]]);
  near("beside: three columns divide evenly", colShares(three, 0), [1 / 3, 1 / 3, 1 / 3]);
  ok("beside: and that's the cap", canSplit(three) === false);

  // A column and a row in the same pane — the shape the owner asked for
  // in the same breath as the side drop.
  const mixed = splitTab(splitTab(flat, "calendar"), "tasks", { side: "right", row: 1 });
  check("mixed: a row of two under a row of one", paneRows(mixed), [
    ["links"],
    ["calendar", "tasks"],
  ]);
  near("mixed: the rows keep their split", rowShares(mixed), [0.5, 0.5]);
  near("mixed: the wide row divides evenly", colShares(mixed, 1), [0.5, 0.5]);
  near("mixed: the single row is still one column", colShares(mixed, 0), [1]);
  check("mixed: every slot counts toward the cap", slotCount(mixed), MAX_SLOTS);

  // Aiming at a row that isn't there lands on the nearest one rather than
  // failing: a drop is an aim, not an assertion.
  check(
    "mixed: a row index past the end clamps",
    paneRows(splitTab(splitTab(flat, "calendar"), "tasks", { side: "right", row: 99 })),
    [["links"], ["calendar", "tasks"]],
  );
  check(
    "mixed: with no row named, a side drop joins the tabbed row",
    paneRows(splitTab(splitTab(flat, "calendar"), "tasks", { side: "right" })),
    [["links", "tasks"], ["calendar"]],
  );
}

/* ---------- a tool in a panel leaves the strip ---------- */

{
  const p = splitTab(prefsOf(base), "calendar");

  // Two ways to open one tool would make "which panel does the tab drive?"
  // unanswerable, so the tab goes while the panel is open.
  check("split: the tool leaves the tab strip", visibleTabs(p).includes("calendar"), false);
  check("split: but it isn't hidden — it's busy", p.hidden, []);
  check("split: so the + menu doesn't offer it back", hiddenTabs(p).includes("calendar"), false);
  check("split: it keeps its parking space in the order", p.order, base);
  ok("split: and it reads as a panel", isPanel(p, "calendar"));
  check("split: the panel list is what's left the strip", panelTools(p), ["calendar"]);

  const back = closePanel(p, "calendar");
  check("close: the tab comes back where it was", visibleTabs(back), base);
  check("close: the pane is one slot again", paneSlots(back), ["links"]);
  near("close: which takes the whole height", rowShares(back), [1]);
  ok("close: a tool that has no panel is a no-op", closePanel(back, "calendar") === back);

  // Closing a column leaves the row it was in rather than the whole row.
  const beside = splitTab(prefsOf(base), "calendar", { side: "right" });
  const alone = closePanel(beside, "calendar");
  check("close: closing a column leaves one column", paneRows(alone), [["links"]]);
  near("close: which takes the whole width", colShares(alone, 0), [1]);
}

/* ---------- what splitting refuses ---------- */

{
  const p = prefsOf(base);

  const one = splitTab(p, "tasks");
  ok("split: the tool already on show can't be split out of itself", splitTab(p, "links") === p);
  ok("split: the same tool twice is refused", splitTab(one, "tasks") === one);
  ok("split: an unknown tool is refused", splitTab(p, "not-a-tool" as TabId) === p);
  ok("split: sideways refuses for the same reasons", splitTab(p, "links", { side: "left" }) === p);

  // The cap is a judgement about a narrow pane, and it's enforced here so
  // no menu or band can talk its way past it.
  const two = splitTab(one, "calendar");
  check("split: the cap is three slots", paneSlots(two).length, MAX_SLOTS);
  ok("split: a fourth slot is refused", splitTab(two, "history") === two);
  ok("split: a fourth column is refused too", splitTab(two, "history", { side: "right" }) === two);
  ok("split: canSplit agrees with the refusal", canSplit(two) === false);
  ok("split: and says yes while there's room", canSplit(one));

  // The bands and the menu items both ask this before they offer
  // themselves, so it has to answer for every refusal above — it's the
  // same rule, not a second copy of it.
  ok("split: the offer is refused at the cap", canSplitTab(two, "history") === false);
  ok("split: the offer is refused for the tool on show", canSplitTab(p, "links") === false);
  ok("split: the offer is refused for a tool already in a panel", canSplitTab(one, "tasks") === false);
  ok("split: the offer stands for anything else", canSplitTab(p, "calendar"));
  for (const t of ALL_TABS) {
    ok(
      `split: the offer matches what splitting does (${t})`,
      canSplitTab(two, t) === (splitTab(two, t) !== two),
    );
    // Which side you aim at can't change the answer: every refusal is
    // about the tool and the cap, never the direction.
    ok(
      `split: the sides refuse in step with below (${t})`,
      canSplitTab(two, t) === (splitTab(two, t, { side: "left" }) !== two),
    );
  }
  sums("split: three rows", rowShares(two));
  near("split: three rows divide evenly", rowShares(two), [1 / 3, 1 / 3, 1 / 3]);
}

/* ---------- splitting out a closed tool, and closing a panel ---------- */

{
  const p = prefsOf(base, { hidden: ["calendar"] });
  check("split: a closed tool can be opened straight into a panel", paneSlots(splitTab(p, "calendar")), [
    "links",
    "calendar",
  ]);
  check("split: opening it that way un-hides it", splitTab(p, "calendar").hidden, []);
  check("split: sideways un-hides too", splitTab(p, "calendar", { side: "left" }).hidden, []);

  // The Settings chip is the visibility authority, and it only knows how to
  // hide. Unticking a tool in a panel has to close that panel too, or the
  // chip would look broken while the tool sat there.
  const open = splitTab(prefsOf(base), "calendar");
  const off = removeTab(open, "calendar");
  check("hide: unticking a tool in a panel closes it", paneSlots(off), ["links"]);
  check("hide: and switches the tool off", off.hidden, ["calendar"]);
  check("hide: so it isn't on the strip either", visibleTabs(off).includes("calendar"), false);
  check("hide: the + menu offers it back", hiddenTabs(off), ["calendar"]);
  near("hide: the pane reclaims the height", rowShares(off), [1]);

  // The same, for a panel that was beside rather than below.
  const aside = removeTab(splitTab(prefsOf(base), "calendar", { side: "right" }), "calendar");
  check("hide: unticking a column closes it too", paneRows(aside), [["links"]]);
  check("hide: and switches it off", aside.hidden, ["calendar"]);

  // Adding it back from the + menu returns it to the strip, open.
  const again = addTab(off, "calendar");
  check("add: a hidden tool comes back as a tab", visibleTabs(again).includes("calendar"), true);
  check("add: and opens", again.active, "calendar");
}

/* ---------- the tabbed cell and the panels can't hold the same tool ---------- */

{
  const p = splitTab(prefsOf(base), "calendar");

  // Nothing in the UI can reach this — the strip and the Tools menu both
  // list visibleTabs — but the invariant is what everything else assumes.
  const lifted = addTab(p, "calendar");
  check("add: asking for a tool in a panel lifts it out", panelTools(lifted), []);
  check("add: and makes it the tabbed one", lifted.active, "calendar");
  check("add: never both at once", paneSlots(lifted), ["calendar"]);

  const off = prefsOf(base, { hidden: ["music"] });
  ok("activate: a tool in a panel can't be made the tabbed one behind its own back", activateTab(p, "calendar") === p);
  ok("activate: a hidden tool can't be activated either", activateTab(off, "music") === off);
  check("activate: an ordinary tab opens", activateTab(p, "tasks").active, "tasks");
  ok("activate: the tab already open is a no-op", activateTab(p, "links") === p);
}

/* ---------- switching tabs doesn't disturb the panels ---------- */

{
  const p = splitTab(prefsOf(base, { active: "tasks" }), "calendar");
  const switched = activateTab(p, "history");

  check("switch: the tabbed cell changes", paneSlots(switched), ["history", "calendar"]);
  check("switch: the panel below is untouched", panelTools(switched), ["calendar"]);
  near("switch: and keeps its share", rowShares(switched), rowShares(p));
  // The tool that was in the tabbed cell goes back to being an ordinary tab.
  check("switch: the old tool is still on the strip", visibleTabs(switched).includes("tasks"), true);

  // The same holds when the split is sideways: the strip drives one cell,
  // wherever in the grid that cell happens to sit.
  const sideways = activateTab(splitTab(prefsOf(base, { active: "tasks" }), "calendar", { side: "left" }), "music");
  check("switch: a side split follows the strip too", paneRows(sideways), [["calendar", "music"]]);

  // Reordering the strip is orthogonal to the split.
  const dragged = reorderTab(switched, "music", 0);
  check("switch: a strip reorder leaves the panels alone", panelTools(dragged), ["calendar"]);
  check("switch: and the reorder still lands", visibleTabs(dragged)[0], "music");
}

/* ---------- ordering the panels ---------- */

{
  const p = splitTab(splitTab(prefsOf(base), "tasks"), "calendar");
  check("order: split in the order they were opened", paneSlots(p), ["links", "tasks", "calendar"]);

  // Sizes travel with the panel, so a panel you sized stays the size you
  // made it when it changes places.
  const sized = { ...p, rowSizes: [0.5, 0.2, 0.3] };
  const swapped = movePanel(sized, "calendar", -1);
  check("order: the panels trade places", paneSlots(swapped), ["links", "calendar", "tasks"]);
  near("order: and their heights go with them", rowShares(swapped), [0.5, 0.3, 0.2]);
  sums("order: after a swap", rowShares(swapped));

  // The ends stop rather than wrapping, and the tabbed cell belongs to the
  // strip.
  ok("order: the first panel can't climb into the tabbed cell", movePanel(p, "tasks", -1) === p);
  ok("order: the last panel can't go further", movePanel(p, "calendar", 1) === p);
  ok("order: a tool without a panel can't be moved", movePanel(p, "music", 1) === p);

  // Two columns of one row swap their widths the same way.
  const row = splitTab(splitTab(prefsOf(base), "tasks", { side: "right" }), "calendar", {
    side: "right",
  });
  const wide = { ...row, colSizes: [[0.5, 0.2, 0.3]] };
  const shuffled = movePanel(wide, "calendar", -1);
  check("order: columns trade places", paneRows(shuffled), [["links", "calendar", "tasks"]]);
  near("order: and their widths go with them", colShares(shuffled, 0), [0.5, 0.3, 0.2]);

  // A swap between a column and a row of its own has no shared dimension
  // to carry, so the positions keep their sizes and only the tools move.
  const mixed = splitTab(splitTab(prefsOf(base), "tasks", { side: "right" }), "calendar");
  const crossed = movePanel(mixed, "tasks", 1);
  check("order: a panel can cross from a column to a row", paneRows(crossed), [
    ["links", "calendar"],
    ["tasks"],
  ]);
  near("order: and the geometry stays put", rowShares(crossed), rowShares(mixed));

  // Dropping between two panels rather than under them.
  const between = splitTab(splitTab(prefsOf(base), "calendar"), "tasks", { side: "below", at: 1 });
  check("order: a tool can be dropped above another panel", paneSlots(between), [
    "links",
    "tasks",
    "calendar",
  ]);
  const clamped = splitTab(splitTab(prefsOf(base), "calendar"), "tasks", { side: "below", at: 99 });
  check("order: a position past the end lands at the end", paneSlots(clamped), [
    "links",
    "calendar",
    "tasks",
  ]);
}

/* ---------- re-docking a panel without closing it ---------- */

{
  const p = splitTab(prefsOf(base), "calendar");

  const beside = movePanelTo(p, "calendar", { side: "right" });
  check("dock: a panel below can be sent beside", paneRows(beside), [["links", "calendar"]]);
  near("dock: and the new columns divide evenly", colShares(beside, 0), [0.5, 0.5]);

  const back = movePanelTo(beside, "calendar", { side: "below" });
  check("dock: and sent back to a row of its own", paneRows(back), [["links"], ["calendar"]]);

  // A move that would put the panel back where it started is refused, so
  // it costs no write.
  ok("dock: a move that changes nothing is refused", movePanelTo(p, "calendar", { side: "below" }) === p);
  ok("dock: the menu agrees", canMovePanelTo(p, "calendar", { side: "below" }) === false);
  ok("dock: and offers the move that would change something", canMovePanelTo(p, "calendar", { side: "right" }));
  ok("dock: a tool without a panel can't be docked", movePanelTo(p, "music", { side: "right" }) === p);
  ok("dock: nor can the tabbed tool", movePanelTo(p, "links", { side: "right" }) === p);

  // Re-docking never loses the tool or doubles it.
  const shuffled = movePanelTo(splitTab(p, "tasks"), "tasks", { side: "right" });
  check("dock: three slots survive a re-dock", slotCount(shuffled), 3);
  ok("dock: and no tool is in two of them", new Set(paneSlots(shuffled)).size === 3);
}

/* ---------- closing the middle panel ---------- */

{
  const p = {
    ...splitTab(splitTab(prefsOf(base), "tasks"), "calendar"),
    rowSizes: [0.5, 0.2, 0.3],
  };
  const closed = closePanel(p, "tasks");

  check("close: the right panel goes", paneSlots(closed), ["links", "calendar"]);
  // Back between links and history, where its tab was before it was
  // pulled out — not appended to the end of the strip.
  check("close: its tool returns to the strip in its old place", visibleTabs(closed), [
    "links",
    "tasks",
    "history",
    "music",
  ]);
  check("close: the panel still open keeps its tab off the strip", visibleTabs(closed).includes("calendar"), false);
  sums("close: after the middle panel goes", rowShares(closed));
  // 0.5 and 0.3 rescale to keep their proportion rather than resetting.
  near("close: the survivors keep their proportions", rowShares(closed), [0.625, 0.375]);
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
  ok("resize: an unsplit pane has nothing to resize", resizeSlots([1], 0, 0.2).length === 1);

  // Columns are the same arithmetic with a wider floor: a panel 12% across
  // a 280px pane is unreadable in a way that 12% of its height isn't.
  ok("resize: a column can't be squeezed past its floor", resizeSlots(sizes, 0, 5, 0.2)[1]! >= 0.2 - 1e-9);

  // And at the level of prefs, so a refused drag costs no write.
  const p = splitTab(prefsOf(base), "calendar");
  ok("resize: a nil drag leaves prefs alone", resizeRows(p, 0, 0) === p);
  near("resize: a real drag lands", rowShares(resizeRows(p, 0, 0.25)), [0.75, 0.25]);
  near("resize: a drag past the floor stops at it", rowShares(resizeRows(p, 0, 9)), [0.88, 0.12]);
  sums("resize: past the floor", rowShares(resizeRows(p, 0, 9)));

  // The vertical divider inside a row.
  const beside = splitTab(prefsOf(base), "calendar", { side: "right" });
  near("resize: a column drag lands", colShares(resizeCols(beside, 0, 0, 0.2), 0), [0.7, 0.3]);
  near("resize: and stops at the column floor", colShares(resizeCols(beside, 0, 0, 9), 0), [0.8, 0.2]);
  sums("resize: the row still divides the whole width", colShares(resizeCols(beside, 0, 0, 9), 0));
  ok("resize: a row that doesn't exist is refused", resizeCols(beside, 4, 0, 0.2) === beside);
  ok("resize: a nil column drag is refused", resizeCols(beside, 0, 0, 0) === beside);
  ok("resize: a row with one column has no divider", resizeCols(p, 0, 0, 0.2) === p);
  near("resize: dragging a column leaves the rows alone", rowShares(resizeCols(beside, 0, 0, 0.2)), [1]);

  // Evening up resets both dimensions at once, and an even pane declines.
  const uneven = resizeCols(resizeRows(splitTab(beside, "tasks"), 0, 0.2), 0, 0, 0.15);
  const even = evenPane(uneven);
  near("even: the rows come back to even", rowShares(even), [0.5, 0.5]);
  near("even: and so do the columns", colShares(even, 0), [0.5, 0.5]);
  ok("even: an even pane is left alone", evenPane(even) === even);
}

/* ---------- sizes repaired on the way in ---------- */

{
  const three = evenSizes(3);
  near("sizes: even means even", three, [1 / 3, 1 / 3, 1 / 3]);
  sums("sizes: even", three);

  const p = prefsOf(base, { rows: [[TABBED], ["calendar"]] });

  // Whatever storage hands over, the renderer gets fractions it can use:
  // never a NaN, never a zero, never the wrong count.
  near("sizes: garbage falls back to even", rowShares({ ...p, rowSizes: [NaN, 0] }), [0.5, 0.5]);
  near("sizes: a missing entry takes an even share", rowShares({ ...p, rowSizes: [1] }), [2 / 3, 1 / 3]);
  near("sizes: too many are dropped", rowShares({ ...p, rowSizes: [0.5, 0.25, 0.25] }), [2 / 3, 1 / 3]);
  near("sizes: unnormalized entries are scaled", rowShares({ ...p, rowSizes: [3, 1] }), [0.75, 0.25]);
  sums("sizes: after scaling", rowShares({ ...p, rowSizes: [3, 1] }));

  const starved = rowShares({ ...p, rowSizes: [0.999, 0.001] });
  ok("sizes: a starved row is lifted to the floor", starved[1]! >= 0.12 - 1e-9);
  sums("sizes: after lifting a starved row", starved);
  ok("sizes: lifting one row doesn't starve the other", starved[0]! >= 0.12 - 1e-9);

  // Repair has to be stable or every read would drift.
  near("sizes: repair is idempotent", rowShares({ ...p, rowSizes: starved }), starved);

  // Columns are repaired the same way, against their own floor.
  const wide = prefsOf(base, { rows: [[TABBED, "calendar"]] });
  near("sizes: a starved column is lifted further", colShares({ ...wide, colSizes: [[0.99, 0.01]] }, 0), [
    0.8, 0.2,
  ]);
  near("sizes: a row that isn't there has no columns", colShares(wide, 5), []);
}

/* ---------- normalizePrefs: whatever storage hands back ---------- */

{
  const fresh = normalizePrefs(null);
  check("normalize: a first run has nothing split out", fresh.rows, [[TABBED]]);
  near("normalize: one row, whole pane", fresh.rowSizes, [1]);
  check("normalize: and one column in it", fresh.colSizes, [[1]]);

  // Prefs saved before any of this existed must open, not explode.
  const older = normalizePrefs({ order: ALL_TABS.slice(), hidden: [], active: "tasks" });
  check("normalize: prefs from before splitting still load", older.rows, [[TABBED]]);
  near("normalize: and get a size", older.rowSizes, [1]);

  const junk = normalizePrefs({
    order: ALL_TABS.slice(),
    hidden: ["music"] as TabId[],
    active: "links",
    rows: [
      [TABBED, "calendar"],
      ["not-a-tool", "calendar", "music", "links", "tasks"],
      ["history"],
    ] as Cell[][],
    rowSizes: [1, 1, 1],
    colSizes: [[1, 1]],
  });
  check("normalize: unknown tools are dropped", paneSlots(junk).includes("not-a-tool" as TabId), false);
  check("normalize: duplicates are dropped", new Set(paneSlots(junk)).size, paneSlots(junk).length);
  check("normalize: the tabbed tool can't also be a panel", panelTools(junk).includes("links"), false);
  check("normalize: a tool switched off in Settings can't be a panel", panelTools(junk).includes("music"), false);
  check("normalize: the cap holds against storage too", slotCount(junk), MAX_SLOTS);
  check("normalize: what survives, in shape", junk.rows, [[TABBED, "calendar"], ["tasks"]]);
  check("normalize: emptied rows are dropped", junk.rows.length, 2);
  check("normalize: sizes match the row count", junk.rowSizes.length, junk.rows.length);
  check("normalize: every row gets its columns", junk.colSizes.map((c) => c.length), [2, 1]);
  sums("normalize: repaired rows", junk.rowSizes);
  sums("normalize: repaired columns", junk.colSizes[0]!);
  check("normalize: is idempotent", normalizePrefs(junk), junk);

  // A saved active that also appears in the grid: the tabbed cell wins,
  // because it's the one the strip is pointing at.
  const doubled = normalizePrefs({
    order: ALL_TABS.slice(),
    hidden: [],
    active: "tasks",
    rows: [[TABBED], ["tasks"]] as Cell[][],
  });
  check("normalize: the tabbed tool is never doubled into a panel", doubled.rows, [[TABBED]]);
  ok("normalize: every slot is a different tool", new Set(paneSlots(junk)).size === paneSlots(junk).length);

  // A layout that lost its tabbed cell (or grew a second one) still has to
  // render: the strip must have exactly one cell to drive.
  const noTabbed = normalizePrefs({
    order: ALL_TABS.slice(),
    hidden: [],
    active: "links",
    rows: [["calendar"], ["tasks"]] as Cell[][],
  });
  check("normalize: a missing tabbed cell is put back", noTabbed.rows, [
    [TABBED, "calendar"],
    ["tasks"],
  ]);
  const twoTabbed = normalizePrefs({
    order: ALL_TABS.slice(),
    hidden: [],
    active: "links",
    rows: [[TABBED], [TABBED, "calendar"]] as Cell[][],
  });
  check("normalize: a second tabbed cell is dropped", twoTabbed.rows, [[TABBED], ["calendar"]]);
  const empties = normalizePrefs({
    order: ALL_TABS.slice(),
    hidden: [],
    active: "links",
    rows: [[], [], []] as Cell[][],
  });
  check("normalize: a layout of empty rows falls back to the plain pane", empties.rows, [[TABBED]]);

  // The tabbed cell is kept back from the cap, so a saved layout that
  // filled every slot with panels still leaves the strip something.
  const greedy = normalizePrefs({
    order: ALL_TABS.slice(),
    hidden: [],
    active: "links",
    rows: [["calendar", "tasks", "history", "music"]] as Cell[][],
  });
  check("normalize: the cap keeps a slot for the strip", greedy.rows, [
    [TABBED, "calendar", "tasks"],
  ]);
  check("normalize: which is still the cap", slotCount(greedy), MAX_SLOTS);

  // An all-hidden repair still has to leave the grid coherent.
  const rescued = normalizePrefs({
    order: ALL_TABS.slice(),
    hidden: ALL_TABS.slice(),
    active: "links",
    rows: [[TABBED], ["tasks"]] as Cell[][],
  });
  check("normalize: the all-hidden rescue keeps the panel", panelTools(rescued), ["tasks"]);
  ok("normalize: and something is visible", visibleTabs(rescued).length > 0);
  ok("normalize: the rescued pane doesn't show a tool twice", new Set(paneSlots(rescued)).size === paneSlots(rescued).length);
}

/* ---------- migration: layouts saved by the one-column version ---------- */

/* The pane used to be a single column: `stack` listed the tools pinned
   under the tabbed one and `sizes` gave each slot its share of the
   height. Nobody's arrangement should be thrown away by an upgrade, so
   that reads as one cell per row — which is the same picture. */

{
  const v1 = normalizePrefs({
    order: ALL_TABS.slice(),
    hidden: [],
    active: "links",
    stack: ["calendar", "tasks"] as TabId[],
    sizes: [0.5, 0.3, 0.2],
  });
  check("migrate: a stack becomes a column of rows", v1.rows, [[TABBED], ["calendar"], ["tasks"]]);
  check("migrate: the same tools, in the same order", paneSlots(v1), ["links", "calendar", "tasks"]);
  near("migrate: and the same split", v1.rowSizes, [0.5, 0.3, 0.2]);
  check("migrate: every row is one column wide", v1.colSizes, [[1], [1], [1]]);
  sums("migrate: the heights still add up", v1.rowSizes);
  check("migrate: is idempotent from there on", normalizePrefs(v1), v1);
  check("migrate: the migrated tools are off the strip", visibleTabs(v1).includes("calendar"), false);

  // A v1 stack is validated by the same rules as a saved grid.
  const dirty = normalizePrefs({
    order: ALL_TABS.slice(),
    hidden: ["music"] as TabId[],
    active: "links",
    stack: ["calendar", "not-a-tool", "calendar", "links", "music", "tasks", "history"] as TabId[],
    sizes: [1, 1, 1, 1, 1],
  });
  check("migrate: what survives a dirty stack", dirty.rows, [[TABBED], ["calendar"], ["tasks"]]);
  check("migrate: the cap holds through migration", slotCount(dirty), MAX_SLOTS);
  sums("migrate: repaired sizes", dirty.rowSizes);

  // A v1 pane that was never split is just the plain pane.
  const flat = normalizePrefs({
    order: ALL_TABS.slice(),
    hidden: [],
    active: "tasks",
    stack: [] as TabId[],
    sizes: [1],
  });
  check("migrate: an unsplit v1 pane stays unsplit", flat.rows, [[TABBED]]);
  check("migrate: with the tool it was left on", paneSlots(flat), ["tasks"]);

  // Once migrated, the layout can be split sideways like any other.
  check("migrate: and it can then be split sideways", paneRows(splitTab(flat, "calendar", { side: "right" })), [
    ["tasks", "calendar"],
  ]);

  // A saved grid wins over any v1 keys left lying beside it: the newer
  // shape is the one the app wrote last.
  const both = normalizePrefs({
    order: ALL_TABS.slice(),
    hidden: [],
    active: "links",
    rows: [[TABBED, "calendar"]] as Cell[][],
    stack: ["tasks"] as TabId[],
    sizes: [0.5, 0.5],
  });
  check("migrate: a saved grid beats leftover v1 keys", both.rows, [[TABBED, "calendar"]]);
}

/* ---------- the store: the same rules, persisted ---------- */

{
  // The store starts from whatever ran before it in this process; put it
  // somewhere known first.
  for (const t of ALL_TABS) tabPrefs.show(t);
  tabPrefs.setActive("links");
  for (const t of tabPrefs.panels()) tabPrefs.closePanel(t);

  check("store: begins unsplit", tabPrefs.slots(), ["links"]);

  tabPrefs.split("calendar");
  check("store: a drop splits the pane", tabPrefs.slots(), ["links", "calendar"]);
  check("store: the tool leaves the strip", tabPrefs.visible().includes("calendar"), false);
  near("store: an even split", tabPrefs.rowShares(), [0.5, 0.5]);

  tabPrefs.resizeRows(0, 0.2);
  near("store: the divider moved", tabPrefs.rowShares(), [0.7, 0.3]);
  tabPrefs.evenSlots();
  near("store: and evens up again", tabPrefs.rowShares(), [0.5, 0.5]);

  tabPrefs.split("tasks");
  check("store: a third slot", tabPrefs.slots(), ["links", "calendar", "tasks"]);
  tabPrefs.movePanel("tasks", -1);
  check("store: panels reorder", tabPrefs.slots(), ["links", "tasks", "calendar"]);

  // Switching tabs leaves the panels where they are.
  tabPrefs.setActive("history");
  check("store: the strip drives one cell only", tabPrefs.slots(), ["history", "tasks", "calendar"]);

  tabPrefs.closePanel("tasks");
  check("store: closing a panel returns its tool", tabPrefs.visible().includes("tasks"), true);
  check("store: and shrinks the pane to two", tabPrefs.slots().length, 2);
  sums("store: after a close", tabPrefs.rowShares());
  near("store: the survivors rebalance", tabPrefs.rowShares(), [0.5, 0.5]);

  // Sideways, through the store.
  tabPrefs.movePanelTo("calendar", { side: "right" });
  check("store: a panel can be re-docked beside", tabPrefs.rows(), [["history", "calendar"]]);
  near("store: the new columns are even", tabPrefs.colShares(0), [0.5, 0.5]);
  tabPrefs.resizeCols(0, 0, 0.2);
  near("store: a column divider moves", tabPrefs.colShares(0), [0.7, 0.3]);
  tabPrefs.evenSlots();
  near("store: and evens up", tabPrefs.colShares(0), [0.5, 0.5]);
  tabPrefs.split("tasks", { side: "left" });
  check("store: a side drop lands", tabPrefs.rows(), [["tasks", "history", "calendar"]]);
  near("store: three columns divide evenly", tabPrefs.colShares(0), [1 / 3, 1 / 3, 1 / 3]);

  // Refused changes must not notify, or React re-renders for nothing on
  // every declined drop and every drag that hits the floor.
  const version = tabPrefs.getVersion();
  tabPrefs.split("calendar"); // already in a panel
  tabPrefs.split("history"); // the tabbed tool
  tabPrefs.split("music"); // past the cap
  tabPrefs.split("music", { side: "left" }); // past the cap, sideways
  tabPrefs.closePanel("music"); // has no panel
  tabPrefs.movePanel("calendar", 1); // already last
  tabPrefs.movePanelTo("calendar", { side: "right" }); // already there
  tabPrefs.resizeCols(0, 0, 0); // a nil drag
  tabPrefs.resizeRows(0, 0.2); // there is only one row
  tabPrefs.evenSlots(); // already even, per the check above
  tabPrefs.setActive("history"); // already open
  tabPrefs.setActive("calendar"); // in a panel, so not a tab
  check("store: refused changes don't notify", tabPrefs.getVersion(), version);

  // The pane can never be left showing one tool in two places, whatever
  // order the front doors are used in.
  tabPrefs.closePanel("tasks");
  tabPrefs.closePanel("calendar");
  tabPrefs.setActive("links");
  tabPrefs.split("music", { side: "right" });
  tabPrefs.hide("music");
  ok("store: hiding a tool in a panel closes it", !tabPrefs.slots().includes("music"));
  ok("store: and takes it off the strip", !tabPrefs.visible().includes("music"));
  tabPrefs.show("music");
  ok("store: showing it again puts it back as a tab", tabPrefs.visible().includes("music"));
  const slots = tabPrefs.slots();
  ok("store: no tool is ever in two slots", new Set(slots).size === slots.length);
  sums("store: sizes stay whole throughout", tabPrefs.rowShares());
}

/* ---------- report ---------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`split tests: ${checks} checks passed`);
