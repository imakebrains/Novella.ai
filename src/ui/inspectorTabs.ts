import { useSyncExternalStore } from "react";

/* ============================================================
   Inspector tab preferences

   Which tabs show, in what order, which one is open, and how the writer
   has split the pane around it — the writer's arrangement, not ours.
   Close what you never use, drag the rest into the order your hands
   expect, pull the two you keep glancing between into panels of their
   own, side by side or one under the other. Stored per user
   (localStorage): how a person arranges their desk isn't a fact about
   any particular book.

   The registry of what CAN be a tab lives in InspectorPane; this store
   only holds the arrangement, so adding a future tab is one registry
   entry and the prefs self-heal around it.

   Every rule about arrangement lives in the pure block below, and the
   store underneath it is a thin persist-and-notify shell. Two reasons
   for the split. First, there are now several front doors onto the same
   prefs — dragging a tab in the pane, the + menu, and the chips in
   Settings — and they have to agree to the letter, which they only do if
   they share one implementation. Second, the arithmetic ("move the
   visible tab at 3 to 1 without disturbing the hidden ones threaded
   through the order"; "close the middle panel and rescale a row without
   letting any share reach zero") is exactly the sort of thing that goes
   quietly wrong, so it has to be assertable without a DOM. test-tabs.ts
   and test-stack.ts do that.
   ============================================================ */

export type TabId =
  | "links"
  | "critique"
  | "tasks"
  | "history"
  | "assistant"
  | "chat"
  | "continuity"
  | "goals"
  | "calendar"
  | "music"
  | "timer";

export const ALL_TABS: TabId[] = [
  "links",
  "critique",
  "tasks",
  "history",
  "assistant",
  "chat",
  "continuity",
  "goals",
  "calendar",
  "music",
  "timer",
];

/** The cell the tab strip drives.

    The layout stores cells rather than tools so the tool the strip has
    open is written down exactly once — in `active` — and the grid only
    remembers where its panel sits. Keeping the id in both places would
    let the two disagree, and a layout that disagrees with the strip is a
    pane showing one tool twice. */
export const TABBED = "@tabs" as const;

export type Cell = TabId | typeof TABBED;

export interface TabPrefs {
  /** Every known tab, in the writer's order — hidden ones included, so
      re-adding a tab returns it to where it used to sit rather than to
      the end of the strip. */
  order: TabId[];
  hidden: TabId[];
  active: TabId;
  /** The pane's split: rows top to bottom, each row's cells left to
      right. `[[TABBED]]` is the ordinary pane — one tool, driven by the
      strip.

      Exactly one cell is TABBED; every other cell is a tool that has left
      the strip, because a tool that appeared twice would make "which one
      does the tab switch?" an unanswerable question. Rows of cells rather
      than a free tree: it covers everything the pane can usefully be at
      this size (a column, a row, and any mix of the two) while staying
      small enough to repair and to assert. */
  rows: Cell[][];
  /** Each row's share of the pane's height, `rows.length` of them,
      summing to 1. Fractions rather than pixels because the pane is
      itself resizable: a split stored in pixels would drift every time
      the window changed. */
  rowSizes: number[];
  /** Each cell's share of its row's width — one array per row, each as
      long as its row and summing to 1. */
  colSizes: number[][];
}

/** What storage may hand back: the arrangement above, or the one-column
    format that shipped before the pane could split sideways. Both are
    read by normalizePrefs, so nobody's saved layout is stranded by the
    upgrade. */
export interface StoredPrefs extends Partial<TabPrefs> {
  /** v1: the tools pinned below the tabbed slot, top to bottom. */
  stack?: TabId[];
  /** v1: one fraction of the pane's height per slot. */
  sizes?: number[];
}

/** Where a tool being opened into a panel should land.

    `below` gives it a row of its own (the pane's original gesture);
    `left` and `right` give it a column inside an existing row. `at` and
    `row` are the drop's aim — which row to become, which row to join —
    and both default to the obvious thing, so the menu can call this with
    a side and nothing else. */
export type Where =
  | { side: "below"; at?: number }
  | { side: "left" | "right"; row?: number };

/** How many tools the pane will show at once, the tabbed one included.

    Three, and it's a judgement rather than a limit of the code: the right
    pane is a few hundred pixels wide, and now that panels can sit side by
    side a fourth would leave some of them narrower than the lists inside
    them. It lives in the pure layer so no UI can talk its way past it. */
export const MAX_SLOTS = 3;

/** No row may be squeezed below this share of the pane's height. A panel
    dragged to nothing reads as a tool that vanished, and there'd be no
    handle left to drag it back out with. */
const MIN_ROW = 0.12;

/** Columns get a bigger floor than rows. A panel 12% of the way across a
    280px pane is 34px — not a narrow panel, an unreadable one — whereas
    12% of the height is still a line or two of a list. */
const MIN_COL = 0.2;

const KEY = "novella.inspector";

/* ============================================================
   Pure arrangement logic — no store, no DOM, no localStorage.
   ============================================================ */

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(n, hi));

/** The strip, in strip order.

    Tools with panels drop out of it: they're on screen already, in a
    panel of their own, and leaving their tab behind would offer a second
    way to open a tool that's open. Close the panel and the tab comes
    back. */
export function visibleTabs(prefs: TabPrefs): TabId[] {
  return prefs.order.filter((t) => !prefs.hidden.includes(t) && !isPanel(prefs, t));
}

/** What the + menu offers, in the order they'd come back to. */
export function hiddenTabs(prefs: TabPrefs): TabId[] {
  return prefs.order.filter((t) => prefs.hidden.includes(t));
}

/** Move one entry of a list to another index.

    `to` is the index the entry should end up at once it has been lifted
    out, which is what a drag means: drop it *on* that slot. Indexes past
    either end clamp rather than throw — a drag ending off the edge of the
    strip should land at the edge, not fail. A move that changes nothing
    returns the original array, so callers can skip a needless write. */
export function moveTab(order: TabId[], from: number, to: number): TabId[] {
  if (from < 0 || from >= order.length || order.length === 0) return order;
  const target = Math.max(0, Math.min(to, order.length - 1));
  if (target === from) return order;
  const next = [...order];
  next.splice(target, 0, next.splice(from, 1)[0]!);
  return next;
}

/** Rewrite `order` so its visible entries read as `nextVisible`, leaving
    hidden tabs pinned exactly where they were.

    Dragging happens among visible tabs, but the stored order interleaves
    hidden ones. Rebuilding by walking the old order and refilling only the
    visible slots keeps a closed tab's parking space intact — reopen it and
    it comes back to the same neighbours, which is the whole reason hidden
    tabs stay in `order` at all. */
function threadHidden(prefs: TabPrefs, nextVisible: TabId[]): TabId[] {
  const hidden = new Set(prefs.hidden);
  let i = 0;
  return prefs.order.map((t) => (hidden.has(t) ? t : (nextVisible[i++] ?? t)));
}

/** Drop `tab` at a position in the visible strip. */
export function reorderTab(prefs: TabPrefs, tab: TabId, toVisibleIndex: number): TabPrefs {
  const visible = visibleTabs(prefs);
  const from = visible.indexOf(tab);
  if (from < 0) return prefs;
  const next = moveTab(visible, from, toVisibleIndex);
  if (next === visible) return prefs;
  return { ...prefs, order: threadHidden(prefs, next) };
}

/** Nudge a tab one slot along the strip — the keyboard's version of the
    drag, and the reason dragging isn't the only way to reorder. It stops
    at the ends rather than wrapping: a wrap would move a tab across the
    whole strip on a keypress meant to move it one place. */
export function nudgeTab(prefs: TabPrefs, tab: TabId, dir: -1 | 1): TabPrefs {
  const at = visibleTabs(prefs).indexOf(tab);
  if (at < 0) return prefs;
  return reorderTab(prefs, tab, at + dir);
}

/** Put a tab back in the strip and open it — nobody adds a tool they
    didn't want to look at. */
export function addTab(prefs: TabPrefs, tab: TabId): TabPrefs {
  if (!ALL_TABS.includes(tab)) return prefs;
  // A tool with a panel is already on screen. Asking for it lifts it back
  // into the tabbed slot rather than showing the same tool in two places,
  // which is the one arrangement the rest of this file assumes can't
  // happen.
  if (isPanel(prefs, tab)) return { ...closePanel(prefs, tab), active: tab };
  // Already there and already open: nothing to do. Worth the line because
  // the Tools dropdown calls this on every pick, and without it choosing
  // the tab you're already on would write to storage for no reason.
  if (prefs.order.includes(tab) && !prefs.hidden.includes(tab) && prefs.active === tab) return prefs;
  const order = prefs.order.includes(tab) ? prefs.order : [...prefs.order, tab];
  return { ...prefs, order, hidden: prefs.hidden.filter((t) => t !== tab), active: tab };
}

/** Open a tab, refusing anything that isn't on the strip.

    The wheel and the arrow keys both walk `visibleTabs`, so they can't
    produce a bad id on their own — but `active` pointing at a hidden tool
    or one that already has a panel would render a cell no tab lights up
    for, and that's a dead end worth making impossible rather than
    unlikely. */
export function activateTab(prefs: TabPrefs, tab: TabId): TabPrefs {
  if (prefs.active === tab) return prefs;
  if (!visibleTabs(prefs).includes(tab)) return prefs;
  return { ...prefs, active: tab };
}

/** Take a tab out of the strip.

    The last visible tab refuses to go: a pane with no tabs is a dead end
    with no way back. When the open tab is the one closing, the neighbour
    that slides into its place takes over — jumping to the far left would
    lose the writer's place for no reason. */
export function removeTab(prefs: TabPrefs, tab: TabId): TabPrefs {
  // A tool in a panel has no tab to close, but the Settings chip still has
  // to be able to switch it off — otherwise unticking it would look broken
  // while the tool sat there in its panel. Hiding one closes its panel on
  // the way out.
  if (isPanel(prefs, tab)) {
    const freed = closePanel(prefs, tab);
    return { ...freed, hidden: [...freed.hidden, tab] };
  }
  const visible = visibleTabs(prefs);
  const at = visible.indexOf(tab);
  if (at < 0 || visible.length <= 1) return prefs;
  const left = visible.filter((t) => t !== tab);
  return {
    ...prefs,
    hidden: [...prefs.hidden, tab],
    active: prefs.active === tab ? left[Math.min(at, left.length - 1)]! : prefs.active,
  };
}

/** Wheel over the Tools button steps through the visible tools — a
    premium loose-change interaction: scroll to peek, click to open.
    Pure so the direction math is testable. */
export function cycleTab(current: TabId, visible: TabId[], dir: 1 | -1): TabId {
  if (visible.length === 0) return current;
  const at = visible.indexOf(current);
  if (at === -1) return visible[0]!;
  return visible[(at + dir + visible.length) % visible.length]!;
}

/* ============================================================
   Splitting — more than one tool on screen at once.

   The pane is a small grid: rows of cells, one of them the cell the tab
   strip drives. A tool dragged out of the strip and dropped on the band
   at the bottom becomes a row of its own; dropped on the band down either
   side it becomes a column inside a row, beside what's already there. Two
   tools the writer keeps glancing between (tasks and the calendar, the
   request that started this) stop being a switch and become a layout.

   Everything the grid needs is a value — which cells, in which rows, and
   what share each takes of its row and of the pane — so the whole
   arrangement persists together and every rule about what may become what
   is assertable without a pane to drag.

   All of it stays *inside* the inspector: the pane the Tools button shows
   and hides is one pane that splits internally, never a set of panes
   bolted onto the workspace. Turn Tools off and every panel goes with it.
   ============================================================ */

/** Which cell holds `cell`, or null. */
function cellAt(rows: Cell[][], cell: Cell): { r: number; c: number } | null {
  for (let r = 0; r < rows.length; r++) {
    const c = rows[r]!.indexOf(cell);
    if (c >= 0) return { r, c };
  }
  return null;
}

/** The row the tab strip's own cell sits in. */
export function tabbedRow(prefs: TabPrefs): number {
  return cellAt(prefs.rows, TABBED)?.r ?? 0;
}

/** Every tool with a panel of its own, in reading order. */
export function panelTools(prefs: TabPrefs): TabId[] {
  const out: TabId[] = [];
  for (const row of prefs.rows) for (const cell of row) if (cell !== TABBED) out.push(cell);
  return out;
}

/** Has this tool left the strip for a panel? */
export function isPanel(prefs: TabPrefs, tab: TabId): boolean {
  return prefs.rows.some((row) => row.includes(tab));
}

/** The pane as the renderer wants it: rows of tools, the tabbed cell
    resolved to whatever the strip has open. */
export function paneRows(prefs: TabPrefs): TabId[][] {
  return prefs.rows.map((row) => row.map((cell) => (cell === TABBED ? prefs.active : cell)));
}

/** Every tool on screen, in reading order. Length 1 is the ordinary
    pane. */
export function paneSlots(prefs: TabPrefs): TabId[] {
  return paneRows(prefs).flat();
}

export function slotCount(prefs: TabPrefs): number {
  return prefs.rows.reduce((n, row) => n + row.length, 0);
}

/** Each row's share of the pane's height, repaired on the way out so the
    renderer can never be handed a zero, a NaN or the wrong count. */
export function rowShares(prefs: TabPrefs): number[] {
  return normalizeSizes(prefs.rowSizes, prefs.rows.length, MIN_ROW);
}

/** Each cell's share of one row's width, repaired the same way. */
export function colShares(prefs: TabPrefs, row: number): number[] {
  return normalizeSizes(prefs.colSizes?.[row], prefs.rows[row]?.length ?? 0, MIN_COL);
}

function allColShares(prefs: TabPrefs): number[][] {
  return prefs.rows.map((_, r) => colShares(prefs, r));
}

export function canSplit(prefs: TabPrefs): boolean {
  return slotCount(prefs) < MAX_SLOTS;
}

/** Would opening this tool in a panel actually do anything?

    Asked by the drop bands before they offer themselves and by the menu
    items before they enable: a target that refuses the drop is worse than
    no target at all. It's the mutator run in advance rather than a second
    copy of its conditions, because a predicate that drifts from the rule
    it guards is the bug this is here to prevent. The answer doesn't
    depend on which side you aim at — every refusal is about the tool and
    the cap, not the direction. */
export function canSplitTab(prefs: TabPrefs, tab: TabId): boolean {
  return splitTab(prefs, tab) !== prefs;
}

/** Even shares — what a fresh split, and a reset, look like. */
export function evenSizes(count: number): number[] {
  const n = Math.max(1, count);
  return Array.from({ length: n }, () => 1 / n);
}

/** Whatever storage (or a cell that just appeared) hands over, turned into
    `count` positive fractions that sum to 1 with none under the floor. */
function normalizeSizes(
  raw: readonly number[] | undefined,
  count: number,
  floorWanted: number = MIN_ROW,
): number[] {
  if (count <= 0) return [];
  // The floor bends for absurd counts rather than making the sum
  // impossible; MAX_SLOTS means it never actually has to.
  const floor = Math.min(floorWanted, 1 / count);
  const even = 1 / count;
  const vals = Array.from({ length: count }, (_, i) => {
    const v = Number(raw?.[i]);
    // A missing entry is a cell that just opened: an even share is the only
    // fair guess, and rescaling below shrinks its neighbours to make room.
    return Number.isFinite(v) && v > 0 ? v : even;
  });
  const sum = vals.reduce((a, b) => a + b, 0);
  // Already a valid split: dividing by a sum that is 1 to within float
  // noise would perturb every entry, and a repair that changes what it
  // reads rewrites storage on every load and drifts a little each time.
  const share = Math.abs(sum - 1) < 1e-9 ? vals : vals.map((v) => v / sum);
  const lifted = share.map((v) => Math.max(floor, v));
  const over = lifted.reduce((a, b) => a + b, 0) - 1;
  if (over <= 1e-9) return lifted;
  // Cells above the floor hand the overshoot back in proportion to how far
  // above it they sit, so lifting one cell can't push another under. That
  // it always balances follows from count * floor <= 1.
  const slack = lifted.reduce((a, v) => a + (v - floor), 0);
  if (slack <= 0) return evenSizes(count);
  return lifted.map((v) => v - over * ((v - floor) / slack));
}

/** Move the divider between slot `divider` and the next one along.

    `delta` is a fraction of the whole run, positive to grow the earlier
    slot. Only the two either side move: spreading the delta further would
    shift panels the writer isn't touching. An impossible or nil drag hands
    back the same array so a resize that changes nothing costs nothing.
    Dimension-agnostic on purpose — rows and columns are the same
    arithmetic, and one implementation can't drift from itself. */
export function resizeSlots(
  sizes: number[],
  divider: number,
  delta: number,
  floorWanted: number = MIN_ROW,
): number[] {
  if (divider < 0 || divider + 1 >= sizes.length) return sizes;
  const floor = Math.min(floorWanted, 1 / sizes.length);
  const first = sizes[divider]!;
  const second = sizes[divider + 1]!;
  const d = Math.max(floor - first, Math.min(delta, second - floor));
  if (Math.abs(d) < 1e-6) return sizes;
  const next = [...sizes];
  next[divider] = first + d;
  next[divider + 1] = second - d;
  return next;
}

/** Drag a horizontal divider: the row above grows, the one below gives. */
export function resizeRows(prefs: TabPrefs, divider: number, delta: number): TabPrefs {
  const sizes = rowShares(prefs);
  const next = resizeSlots(sizes, divider, delta, MIN_ROW);
  return next === sizes ? prefs : { ...prefs, rowSizes: next };
}

/** Drag a vertical divider inside one row: the cell to its left grows. */
export function resizeCols(prefs: TabPrefs, row: number, divider: number, delta: number): TabPrefs {
  if (row < 0 || row >= prefs.rows.length) return prefs;
  const sizes = colShares(prefs, row);
  const next = resizeSlots(sizes, divider, delta, MIN_COL);
  if (next === sizes) return prefs;
  const colSizes = allColShares(prefs);
  colSizes[row] = next;
  return { ...prefs, colSizes };
}

/** Back to equal shares everywhere — the divider's double-click and
    Enter. Already even hands back the same prefs, so an even pane costs
    no write. */
export function evenPane(prefs: TabPrefs): TabPrefs {
  const rowSizes = evenSizes(prefs.rows.length);
  const colSizes = prefs.rows.map((row) => evenSizes(row.length));
  const same = (a: number[], b: number[]) =>
    a.length === b.length && a.every((v, i) => Math.abs(v - b[i]!) < 1e-6);
  if (same(rowSizes, rowShares(prefs)) && colSizes.every((c, r) => same(c, colShares(prefs, r)))) {
    return prefs;
  }
  return { ...prefs, rowSizes, colSizes };
}

/** Open a tool in a panel of its own.

    `where` is the drop: a row of its own at the bottom (the default, and
    what the bottom band means), or a column at the left or right edge of
    an existing row — by default the row the tab strip drives, which is
    what the side bands mean when the pane hasn't been split yet. A closed
    tool can be opened straight into a panel from the + menu, so this
    un-hides on the way in.

    Refusals: an unknown tool, the tool already in the tabbed cell (it's on
    screen), one that already has a panel, and anything past the cap. */
export function splitTab(prefs: TabPrefs, tab: TabId, where: Where = { side: "below" }): TabPrefs {
  if (!ALL_TABS.includes(tab)) return prefs;
  if (tab === prefs.active || isPanel(prefs, tab)) return prefs;
  if (!canSplit(prefs)) return prefs;

  const rows = prefs.rows.map((row) => row.slice());
  const rowSizes = rowShares(prefs);
  const colSizes = allColShares(prefs);
  const hidden = prefs.hidden.filter((t) => t !== tab);

  if (where.side === "below" || rows.length === 0) {
    const at = clamp(
      where.side === "below" ? (where.at ?? rows.length) : rows.length,
      0,
      rows.length,
    );
    rows.splice(at, 0, [tab]);
    colSizes.splice(at, 0, [1]);
    // The new row should end up with an equal share while the rows already
    // open keep their proportions to each other. Against a set that sums
    // to 1, the value that normalises to 1/(n+1) is 1/n.
    rowSizes.splice(at, 0, 1 / Math.max(1, rowSizes.length));
    return {
      ...prefs,
      hidden,
      rows,
      rowSizes: normalizeSizes(rowSizes, rows.length, MIN_ROW),
      colSizes,
    };
  }

  const r = clamp(where.row ?? tabbedRow(prefs), 0, rows.length - 1);
  const row = rows[r];
  const cols = colSizes[r];
  if (!row || !cols) return prefs;
  const at = where.side === "left" ? 0 : row.length;
  row.splice(at, 0, tab);
  cols.splice(at, 0, 1 / Math.max(1, cols.length));
  colSizes[r] = normalizeSizes(cols, row.length, MIN_COL);
  return { ...prefs, hidden, rows, rowSizes, colSizes };
}

/** Close a panel. The tool returns to the tab strip rather than vanishing
    — it was never hidden, only busy. A row emptied by the close goes with
    it, and what's left rescales to keep the proportions it had. */
export function closePanel(prefs: TabPrefs, tab: TabId): TabPrefs {
  const at = cellAt(prefs.rows, tab);
  if (!at) return prefs;
  const rows = prefs.rows.map((row) => row.slice());
  const colSizes = allColShares(prefs);
  let rowSizes = rowShares(prefs);

  rows[at.r]!.splice(at.c, 1);
  colSizes[at.r]!.splice(at.c, 1);
  if (rows[at.r]!.length === 0) {
    rows.splice(at.r, 1);
    colSizes.splice(at.r, 1);
    rowSizes.splice(at.r, 1);
    rowSizes = normalizeSizes(rowSizes, rows.length, MIN_ROW);
  } else {
    colSizes[at.r] = normalizeSizes(colSizes[at.r], rows[at.r]!.length, MIN_COL);
  }
  return { ...prefs, rows, rowSizes, colSizes };
}

/** Are two layouts the same shape? Used to decline a move that would put
    a panel back exactly where it started. */
function sameRows(a: Cell[][], b: Cell[][]): boolean {
  return (
    a.length === b.length &&
    a.every((row, r) => row.length === b[r]!.length && row.every((cell, c) => cell === b[r]![c]))
  );
}

/** Swap a panel with the one before or after it in reading order — the
    panels trade places, so the pane rearranges without anything having to
    be closed and reopened.

    It stops at the ends rather than wrapping, and it never trades with the
    tabbed cell: that one belongs to the strip, and a tool arriving there
    would have to evict whatever the strip has open.

    Sizes follow the tool where following it means anything — two cells in
    one row swap their widths, two rows of one cell each swap their heights
    — so a panel you sized stays the size you made it. A swap that crosses
    between a row and a column has no shared dimension to carry, and there
    the positions keep their sizes. */
export function movePanel(prefs: TabPrefs, tab: TabId, dir: -1 | 1): TabPrefs {
  const coords: { r: number; c: number }[] = [];
  prefs.rows.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell !== TABBED) coords.push({ r, c });
    }),
  );
  const i = coords.findIndex(({ r, c }) => prefs.rows[r]![c] === tab);
  if (i < 0) return prefs;
  const j = i + dir;
  if (j < 0 || j >= coords.length) return prefs;
  const a = coords[i]!;
  const b = coords[j]!;

  const rows = prefs.rows.map((row) => row.slice());
  rows[a.r]![a.c] = prefs.rows[b.r]![b.c]!;
  rows[b.r]![b.c] = prefs.rows[a.r]![a.c]!;

  if (a.r === b.r) {
    const colSizes = allColShares(prefs);
    const row = colSizes[a.r]!;
    [row[a.c], row[b.c]] = [row[b.c]!, row[a.c]!];
    return { ...prefs, rows, colSizes };
  }
  if (prefs.rows[a.r]!.length === 1 && prefs.rows[b.r]!.length === 1) {
    const rowSizes = rowShares(prefs);
    [rowSizes[a.r], rowSizes[b.r]] = [rowSizes[b.r]!, rowSizes[a.r]!];
    return { ...prefs, rows, rowSizes };
  }
  return { ...prefs, rows };
}

/** Re-dock a panel: lift it out and put it back somewhere else.

    The keyboard and menu route to what a second drag would do — take the
    panel beside the tools, or give it a row of its own — expressed as the
    two moves that already exist rather than as a third set of rules.
    `where` is aimed at the layout as it stands once the panel is out,
    which is why the menu passes a side and lets the defaults do the rest.
    A move that lands the panel back where it started is refused, so it
    costs no write. */
export function movePanelTo(prefs: TabPrefs, tab: TabId, where: Where): TabPrefs {
  if (!isPanel(prefs, tab)) return prefs;
  const next = splitTab(closePanel(prefs, tab), tab, where);
  return sameRows(next.rows, prefs.rows) ? prefs : next;
}

/** Would re-docking this panel change anything? The menu asks before it
    enables, for the same reason canSplitTab exists. */
export function canMovePanelTo(prefs: TabPrefs, tab: TabId, where: Where): boolean {
  return movePanelTo(prefs, tab, where) !== prefs;
}

/** Repair whatever came out of storage into prefs the UI can trust —
    including prefs written by the version that only stacked downward. */
export function normalizePrefs(raw: StoredPrefs | null): TabPrefs {
  const known = new Set(ALL_TABS);
  const order: TabId[] = [];
  for (const t of raw?.order ?? []) {
    // Unknown ids (a tab we removed) and duplicates (a bad write) are
    // dropped rather than trusted — an id appearing twice would make the
    // strip render two of it and every index calculation ambiguous.
    if (known.has(t as TabId) && !order.includes(t as TabId)) order.push(t as TabId);
  }
  // Tabs added to the app after prefs were saved append at the end rather
  // than vanishing — prefs never hide something the user didn't hide.
  for (const t of ALL_TABS) if (!order.includes(t)) order.push(t);
  let hidden = (raw?.hidden ?? []).filter(
    (t): t is TabId => known.has(t as TabId) && order.includes(t as TabId),
  );
  let visible = order.filter((t) => !hidden.includes(t));
  // Never all-hidden; the pane with no tabs is a dead end.
  if (visible.length === 0) {
    hidden = [];
    visible = order.slice();
  }
  const active = raw?.active && visible.includes(raw.active) ? raw.active : visible[0]!;

  // Prefs written before the pane could split sideways held a single
  // column: the tabbed slot with tools pinned beneath it. Read as one cell
  // per row that is exactly the same picture, so an upgrade opens the
  // layout the writer left rather than resetting it.
  const saved = Array.isArray(raw?.rows) ? raw.rows : null;
  const migrating = saved === null;
  const candidate: Cell[][] = saved
    ? saved.map((row) => (Array.isArray(row) ? row.slice() : []))
    : [[TABBED], ...(Array.isArray(raw?.stack) ? raw.stack : []).map((t): Cell[] => [t as Cell])];

  const rows: Cell[][] = [];
  const seen = new Set<TabId>();
  let tabbed = false;
  let tools = 0;
  for (const rawRow of candidate) {
    const row: Cell[] = [];
    for (const cell of rawRow) {
      if (cell === TABBED) {
        // One strip, one cell for it to drive.
        if (tabbed) continue;
        tabbed = true;
        row.push(TABBED);
        continue;
      }
      const id = cell as TabId;
      // Every rejection here is an arrangement the UI can't render: a tool
      // that no longer exists, the same tool twice, the tabbed tool doubled
      // into a panel, or a tool the writer switched off in Settings (the
      // chip is the authority on that).
      if (!known.has(id) || id === active || hidden.includes(id) || seen.has(id)) continue;
      // One slot is always kept back for the tabbed cell, wherever in the
      // saved layout it turns up: a cap reached before it appeared would
      // leave the strip with nothing to drive.
      if (tools >= MAX_SLOTS - 1) continue;
      seen.add(id);
      tools++;
      row.push(id);
    }
    if (row.length > 0) rows.push(row);
  }
  if (!tabbed) {
    if (rows.length === 0) rows.push([TABBED]);
    else rows[0]!.unshift(TABBED);
  }

  return {
    order,
    hidden,
    active,
    rows,
    // v1's `sizes` were one per slot down a single column, which is one per
    // row of the migrated layout — the same numbers, still meaning height.
    rowSizes: normalizeSizes(migrating ? raw?.sizes : raw?.rowSizes, rows.length, MIN_ROW),
    colSizes: rows.map((row, r) => normalizeSizes(raw?.colSizes?.[r], row.length, MIN_COL)),
  };
}

/* ============================================================
   The store — persistence and notification, nothing else.
   ============================================================ */

function read(): TabPrefs {
  try {
    return normalizePrefs(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return normalizePrefs(null);
  }
}

let prefs = read();
const listeners = new Set<() => void>();
let version = 0;

function persist(next: TabPrefs): void {
  // The pure functions hand back the same object when they decline a
  // change (dragging a tab onto itself, closing the last one). Bailing
  // here means a refused move costs nothing — no write, no re-render.
  if (next === prefs) return;
  prefs = next;
  version++;
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* arrangement is a nicety */
  }
  for (const l of listeners) l();
}

export const tabPrefs = {
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  getVersion(): number {
    return version;
  },

  get(): TabPrefs {
    return prefs;
  },

  visible(): TabId[] {
    return visibleTabs(prefs);
  },

  hidden(): TabId[] {
    return hiddenTabs(prefs);
  },

  /** The pane's grid, rows of tools, tabbed cell resolved. */
  rows(): TabId[][] {
    return paneRows(prefs);
  },

  /** Every tool on screen, in reading order. */
  slots(): TabId[] {
    return paneSlots(prefs);
  },

  /** Every tool with a panel of its own. */
  panels(): TabId[] {
    return panelTools(prefs);
  },

  rowShares(): number[] {
    return rowShares(prefs);
  },

  colShares(row: number): number[] {
    return colShares(prefs, row);
  },

  setActive(tab: TabId): void {
    persist(activateTab(prefs, tab));
  },

  /** Hide a tab. The last visible tab refuses to close. */
  hide(tab: TabId): void {
    persist(removeTab(prefs, tab));
  },

  show(tab: TabId): void {
    persist(addTab(prefs, tab));
  },

  /** Drop a dragged tab at a position in the visible strip. */
  move(tab: TabId, toVisibleIndex: number): void {
    persist(reorderTab(prefs, tab, toVisibleIndex));
  },

  /** One slot left or right — the keyboard route to the same result. */
  nudge(tab: TabId, dir: -1 | 1): void {
    persist(nudgeTab(prefs, tab, dir));
  },

  /** Open a tool in a panel — the drop, and the menu items. */
  split(tab: TabId, where?: Where): void {
    persist(splitTab(prefs, tab, where));
  },

  /** Close a panel; the tool goes back to the strip. */
  closePanel(tab: TabId): void {
    persist(closePanel(prefs, tab));
  },

  /** Swap a panel with its neighbour in reading order. */
  movePanel(tab: TabId, dir: -1 | 1): void {
    persist(movePanel(prefs, tab, dir));
  },

  /** Send a panel somewhere else in the grid without closing it. */
  movePanelTo(tab: TabId, where: Where): void {
    persist(movePanelTo(prefs, tab, where));
  },

  /** Drag the horizontal divider under row `divider`. */
  resizeRows(divider: number, delta: number): void {
    persist(resizeRows(prefs, divider, delta));
  },

  /** Drag the vertical divider inside `row`, right of cell `divider`. */
  resizeCols(row: number, divider: number, delta: number): void {
    persist(resizeCols(prefs, row, divider, delta));
  },

  /** Back to equal shares — the divider's double-click and Enter. */
  evenSlots(): void {
    persist(evenPane(prefs));
  },

  /** Move a visible tab to sit at another visible tab's position. */
  moveBefore(tab: TabId, target: TabId): void {
    const at = visibleTabs(prefs).indexOf(target);
    // A target that isn't on the strip has no position to take; clamping
    // to the front instead would silently move the tab somewhere nobody
    // asked for.
    if (at < 0) return;
    persist(reorderTab(prefs, tab, at));
  },
};

export function useTabPrefs(): TabPrefs {
  useSyncExternalStore(tabPrefs.subscribe, tabPrefs.getVersion, tabPrefs.getVersion);
  return tabPrefs.get();
}
