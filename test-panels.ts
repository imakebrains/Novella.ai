/* Assertions for the board's floating tool panels.

   Same shape as test-units.ts: silent unless something is wrong, non-zero
   exit when it is.

   A planner surface lives or dies on arithmetic nobody notices until it
   is wrong: a new panel that opens exactly underneath the last one reads
   as a broken button; a panel dragged above the top edge can never be
   dragged back, because its title bar is the only handle; a z-order that
   only ever increments will, after enough sessions, be a number nobody
   wants to think about. None of that needs a DOM to check. */

import {
  addPanel,
  bringToFront,
  clamp,
  clampAll,
  HEAD_H,
  MIN_H,
  MIN_W,
  movePanel,
  normalizeZ,
  panelsKey,
  parsePanels,
  removePanel,
  resetPanelIds,
  resizePanel,
  serializePanels,
  sizeFor,
  toggleCollapse,
  topZ,
  type Panel,
} from "./src/ui/panelLayout";
import { ALL_TABS } from "./src/ui/inspectorTabs";
import { COMPACT_MAX, isCompactWidth, nextDrawer } from "./src/ui/useCompact";

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

const VW = 1400;
const VH = 900;

resetPanelIds();

/* ============================================================
   Opening panels
   ============================================================ */

let ps: Panel[] = [];
ps = addPanel(ps, "calendar", VW, VH);
check("the first panel opens", ps.length, 1);
check("it opens at the tool's own size", [ps[0]!.w, ps[0]!.h], sizeFor("calendar"));
ok("it is on top", ps[0]!.z === topZ(ps));

ps = addPanel(ps, "tasks", VW, VH);
ps = addPanel(ps, "timer", VW, VH);
check("three panels", ps.length, 3);

// The cascade is the whole point: identical positions would hide each
// new panel under the last one, which reads as the button doing nothing.
const corners = ps.map((p) => `${p.x},${p.y}`);
check("no two panels share a corner", new Set(corners).size, 3);
ok("each new panel is in front of the last", ps[2]!.z > ps[1]!.z && ps[1]!.z > ps[0]!.z);

// The same tool twice is legitimate — two months side by side.
ps = addPanel(ps, "calendar", VW, VH);
check("the same tool can open twice", ps.filter((p) => p.tool === "calendar").length, 2);
check("ids stay unique", new Set(ps.map((p) => p.id)).size, ps.length);

// A panel must fit the room it opens into, however small that room is.
const tiny = addPanel([], "calendar", 320, 300);
ok("a big tool fits a small window", tiny[0]!.w <= 320 && tiny[0]!.h <= 300);
ok("but never below the minimum", tiny[0]!.w >= MIN_W && tiny[0]!.h >= MIN_H);

/* ============================================================
   Stacking
   ============================================================ */

const first = ps[0]!.id;
const raised = bringToFront(ps, first);
ok("bringing to front actually raises it", raised.find((p) => p.id === first)!.z === topZ(raised));

// Same array back when nothing changes, so React can skip the render.
const alreadyTop = raised.find((p) => p.z === topZ(raised))!.id;
ok("raising the top panel is a no-op", bringToFront(raised, alreadyTop) === raised);

// Z must not climb forever across sessions.
const inflated = raised.map((p, i) => ({ ...p, z: 1000 + i * 37 }));
const dense = normalizeZ(inflated);
check("z values are re-seated densely", dense.map((p) => p.z).sort((a, b) => a - b), [1, 2, 3, 4]);
ok(
  "and the order is preserved",
  dense.map((p) => p.id).join() ===
    [...inflated].sort((a, b) => a.z - b.z).map((p) => p.id).join(),
);

const fewer = removePanel(raised, first);
check("closing removes one", fewer.length, raised.length - 1);
check("and leaves z dense", fewer.map((p) => p.z).sort((a, b) => a - b), [1, 2, 3]);

/* ============================================================
   Moving — the title bar must always be reachable

   This is the rule that matters. The header is the only drag handle, so
   a panel whose header leaves the viewport is a panel that can never be
   recovered without clearing storage.
   ============================================================ */

const one: Panel = { id: "a", tool: "tasks", x: 100, y: 100, w: 400, h: 400, z: 1 };

check("dragging above the top edge is stopped at it", clamp({ ...one, y: -300 }, VW, VH).y, 0);
ok("dragging below the bottom leaves the header on screen", clamp({ ...one, y: 5000 }, VW, VH).y <= VH - HEAD_H);
ok("dragging off the right leaves a grabbable strip", clamp({ ...one, x: 9999 }, VW, VH).x <= VW - 80);
ok("dragging off the left leaves a grabbable strip", clamp({ ...one, x: -9999 }, VW, VH).x >= -(one.w - 80));

// Parking a wide panel half off the edge is a legitimate thing to want.
const parked = clamp({ ...one, x: VW - 120 }, VW, VH);
check("a panel may hang off the right edge", parked.x, VW - 120);

const moved = movePanel([one], "a", 640, 320, VW, VH);
check("an ordinary move is untouched", [moved[0]!.x, moved[0]!.y], [640, 320]);

// Shrinking the window must not strand anything.
const stranded: Panel[] = [{ ...one, x: 1300, y: 850 }];
const reseated = clampAll(stranded, 600, 400);
ok("a smaller window pulls panels back into reach", reseated[0]!.x <= 600 - 80 && reseated[0]!.y <= 400 - HEAD_H);

/* ============================================================
   Sizing
   ============================================================ */

check("resize applies", resizePanel([one], "a", 700, 500)[0]!.w, 700);
check("resize cannot go below the minimum width", resizePanel([one], "a", 10, 500)[0]!.w, MIN_W);
check("resize cannot go below the minimum height", resizePanel([one], "a", 700, 10)[0]!.h, MIN_H);
check("a negative drag cannot invert a panel", resizePanel([one], "a", -400, -400)[0]!.w, MIN_W);

const folded = toggleCollapse([one], "a");
ok("folding sets the flag", folded[0]!.collapsed === true);
check("folding remembers the size", [folded[0]!.w, folded[0]!.h], [one.w, one.h]);
ok("unfolding clears it", toggleCollapse(folded, "a")[0]!.collapsed === false);

/* ============================================================
   Storage — never trust a byte of it

   localStorage is editable, survives version changes, and is exactly
   where a half-written value lives. A bad layout should cost the layout,
   never the board.
   ============================================================ */

check("nothing stored is no panels", parsePanels(null), []);
check("empty string is no panels", parsePanels(""), []);
check("unparseable JSON is no panels", parsePanels("{oh no"), []);
check("a JSON object that isn't a list is no panels", parsePanels('{"a":1}'), []);
check("a list of junk is no panels", parsePanels('[1,2,"three"]'), []);

check(
  "a panel naming a tool that no longer exists is dropped",
  parsePanels('[{"id":"x","tool":"telepathy","x":0,"y":0,"w":300,"h":300,"z":1}]'),
  [],
);

const nan = parsePanels('[{"id":"x","tool":"tasks","x":null,"y":"nope","w":300,"h":300,"z":1}]');
check("a bad coordinate falls back rather than rendering NaN", [nan[0]!.x, nan[0]!.y], [16, 16]);
ok("all coordinates are finite", nan.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));

const undersized = parsePanels('[{"id":"x","tool":"tasks","x":0,"y":0,"w":4,"h":4,"z":1}]');
ok("a stored size below the minimum is raised", undersized[0]!.w >= MIN_W && undersized[0]!.h >= MIN_H);

const dupes = parsePanels(
  '[{"id":"x","tool":"tasks","x":0,"y":0,"w":300,"h":300,"z":1},{"id":"x","tool":"goals","x":9,"y":9,"w":300,"h":300,"z":2}]',
);
check("a duplicate id is dropped, first wins", dupes.length, 1);
check("and it is the first one", dupes[0]!.tool, "tasks");

// The round trip is the promise: an arrangement is still there next week.
const trip = parsePanels(serializePanels(ps));
check("a saved arrangement comes back whole", trip.length, ps.length);
check(
  "with the same tools in the same places",
  trip.map((p) => `${p.tool}@${p.x},${p.y}`),
  ps.map((p) => `${p.tool}@${p.x},${p.y}`),
);

const withFold = parsePanels(serializePanels(toggleCollapse(ps, ps[0]!.id)));
ok("a folded panel comes back folded", withFold.some((p) => p.collapsed === true));

/* ============================================================
   Every tool can go on the board
   ============================================================ */

for (const tool of ALL_TABS) {
  const [w, h] = sizeFor(tool);
  ok(`${tool} has a usable opening size`, w >= MIN_W && h >= MIN_H);
  const made = addPanel([], tool, VW, VH);
  ok(`${tool} can be put on the board`, made.length === 1 && made[0]!.tool === tool);
}

/* ============================================================
   Per project
   ============================================================ */

ok("two projects get two keys", panelsKey("C:/Books/One") !== panelsKey("C:/Books/Two"));
check("the same project is stable", panelsKey("C:/Books/One"), panelsKey("C:/Books/One"));
ok("no project still has a key", panelsKey(null).length > 0);

/* ============================================================
   The compact breakpoint

   Below this the three-column grid cannot fit: at 375px its fixed tracks
   ask for 626px and the editor resolves to ZERO pixels wide. The track
   list is built as an inline style, so no stylesheet can rescue it and
   the decision has to be made here.
   ============================================================ */

ok("a phone is compact", isCompactWidth(375));
ok("a small tablet is compact", isCompactWidth(768));
ok("the breakpoint itself is compact", isCompactWidth(COMPACT_MAX));
ok("one pixel wider is not", !isCompactWidth(COMPACT_MAX + 1));
ok("a laptop is not compact", !isCompactWidth(1280));

// It must agree with the 900px query already in app.css. Two breakpoints
// a hundred pixels apart is how a layout breaks in a band nobody tests.
check("the breakpoint matches the stylesheet's", COMPACT_MAX, 899);

// Tapping the open pane's button closes it — the titlebar button is a
// toggle in both layouts.
check("tapping the open drawer closes it", nextDrawer("codex", "codex"), null);
check("tapping the other one swaps straight to it", nextDrawer("codex", "tools"), "tools");
check("tapping from closed opens", nextDrawer(null, "tools"), "tools");
// Swapping rather than closing matters: the alternative costs two taps
// to get from one pane to the other.
ok("swapping never passes through closed", nextDrawer("tools", "codex") !== null);

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`board panel tests: ${checks} checks passed`);
