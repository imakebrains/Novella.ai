import { useSyncExternalStore } from "react";

/* ============================================================
   Inspector tab preferences

   Which tabs show, in what order, which one is open, and which the
   writer pinned open beneath it — the writer's arrangement, not
   ours. Close what you never use, drag the rest into the order your
   hands expect, stack the two you keep glancing between. Stored per
   user (localStorage): how a person arranges their desk isn't a fact
   about any particular book.

   The registry of what CAN be a tab lives in InspectorPane; this
   store only holds the arrangement, so adding a future tab is one
   registry entry and the prefs self-heal around it.

   Every rule about arrangement lives in the pure block below, and
   the store underneath it is a thin persist-and-notify shell. Two
   reasons for the split. First, there are now two front doors onto
   the same prefs — dragging a tab in the pane and ticking a chip in
   Settings — and they have to agree to the letter, which they only
   do if they share one implementation. Second, index arithmetic
   ("move the visible tab at 3 to 1, without disturbing the hidden
   ones threaded through the order") is exactly the sort of thing
   that goes quietly wrong, so it has to be assertable without a
   DOM. test-tabs.ts does that.
   ============================================================ */

export type TabId =
  | "links"
  | "critique"
  | "tasks"
  | "history"
  | "assistant"
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
  "continuity",
  "goals",
  "calendar",
  "music",
  "timer",
];

export interface TabPrefs {
  /** Every known tab, in the writer's order — hidden ones included, so
      re-adding a tab returns it to where it used to sit rather than to
      the end of the strip. */
  order: TabId[];
  hidden: TabId[];
  active: TabId;
  /** Tools pinned below the tabbed slot, top to bottom.

      Empty is the ordinary pane: one tool, driven by the strip. A tool in
      here has left the strip — it already has a panel, and a tool that
      appeared twice would make "which one does the tab switch?" an
      unanswerable question. */
  stack: TabId[];
  /** One fraction of the pane's height per slot, `stack.length + 1` of
      them, summing to 1. Fractions rather than pixels because the pane is
      itself resizable: a split stored in pixels would drift every time the
      window changed. */
  sizes: number[];
}

/** How many tools the pane will show at once, the tabbed one included.

    Three, and it's a judgement rather than a limit of the code: the right
    pane is a few hundred pixels wide, and a fourth panel leaves every one
    of them too short to read a list in. It lives in the pure layer so no
    UI can talk its way past it. */
export const MAX_SLOTS = 3;

/** No slot may be squeezed below this share of the pane. A panel dragged
    to nothing reads as a tool that vanished, and there'd be no handle left
    to drag it back out with. */
const MIN_SLOT = 0.12;

const KEY = "novella.inspector";

/* ============================================================
   Pure arrangement logic — no store, no DOM, no localStorage.
   ============================================================ */

/** The strip, in strip order.

    Stacked tools drop out of it: they're on screen already, in a panel of
    their own, and leaving their tab behind would offer a second way to
    open a tool that's open. Close the panel and the tab comes back. */
export function visibleTabs(prefs: TabPrefs): TabId[] {
  return prefs.order.filter((t) => !prefs.hidden.includes(t) && !prefs.stack.includes(t));
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
  // A stacked tool is already on screen. Asking for it lifts it back into
  // the tabbed slot rather than showing the same tool in two places, which
  // is the one arrangement the rest of this file assumes can't happen.
  if (prefs.stack.includes(tab)) return { ...unstackTab(prefs, tab), active: tab };
  // Already there and already open: nothing to do. Worth the line because
  // the Tools dropdown calls this on every pick, and without it choosing
  // the tab you're already on would write to storage for no reason.
  if (prefs.order.includes(tab) && !prefs.hidden.includes(tab) && prefs.active === tab) return prefs;
  const order = prefs.order.includes(tab) ? prefs.order : [...prefs.order, tab];
  return { ...prefs, order, hidden: prefs.hidden.filter((t) => t !== tab), active: tab };
}

/** Open a tab, refusing anything that isn't on the strip.

    The wheel and the arrow keys both walk `visibleTabs`, so they can't
    produce a bad id on their own — but `active` pointing at a hidden or
    stacked tool would render a panel no tab lights up for, and that's a
    dead end worth making impossible rather than unlikely. */
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
  // A stacked tool has no tab to close, but the Settings chip still has to
  // be able to switch it off — otherwise unticking it would look broken
  // while the tool sat there in its panel. Hiding one closes its slot on
  // the way out.
  if (prefs.stack.includes(tab)) {
    const freed = unstackTab(prefs, tab);
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
   Stacking — more than one tool on screen at once.

   The pane is a column of slots. Slot 0 is the one the tab strip drives;
   everything after it is a tool the writer pinned open, with its own small
   header. Two tools the writer keeps glancing between (tasks and the
   calendar, the request that started this) stop being a switch and become
   a layout.

   `stack` holds the pinned tools and `sizes` their share of the height, so
   the whole arrangement is a value: the split ratio, the order and the
   membership all persist together, and every rule about what may become
   what is assertable without a pane to drag.
   ============================================================ */

/** The pane's slots, top to bottom. Length 1 is the ordinary pane. */
export function paneSlots(prefs: TabPrefs): TabId[] {
  return [prefs.active, ...prefs.stack];
}

/** Each slot's share of the pane's height, repaired on the way out so the
    renderer can never be handed a zero, a NaN or the wrong count. */
export function slotSizes(prefs: TabPrefs): number[] {
  return normalizeSizes(prefs.sizes, prefs.stack.length + 1);
}

export function canStack(prefs: TabPrefs): boolean {
  return prefs.stack.length + 1 < MAX_SLOTS;
}

/** Would stacking this tool actually do anything?

    Asked by the drop zone before it offers itself and by the menu item
    before it enables: a target that refuses the drop is worse than no
    target at all. It's the mutator run in advance rather than a second
    copy of its conditions, because a predicate that drifts from the rule
    it guards is the bug this is here to prevent. */
export function canStackTab(prefs: TabPrefs, tab: TabId): boolean {
  return stackTab(prefs, tab) !== prefs;
}

/** Even shares — what a fresh split, and a reset, look like. */
export function evenSizes(count: number): number[] {
  const n = Math.max(1, count);
  return Array.from({ length: n }, () => 1 / n);
}

/** Whatever storage (or a slot that just appeared) hands over, turned into
    `count` positive fractions that sum to 1 with none under the floor. */
function normalizeSizes(raw: readonly number[] | undefined, count: number): number[] {
  if (count <= 0) return [];
  // The floor bends for absurd counts rather than making the sum
  // impossible; MAX_SLOTS means it never actually has to.
  const floor = Math.min(MIN_SLOT, 1 / count);
  const even = 1 / count;
  const vals = Array.from({ length: count }, (_, i) => {
    const v = Number(raw?.[i]);
    // A missing entry is a slot that just opened: an even share is the only
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
  // Slots above the floor hand the overshoot back in proportion to how far
  // above it they sit, so lifting one slot can't push another under. That
  // it always balances follows from count * floor <= 1.
  const slack = lifted.reduce((a, v) => a + (v - floor), 0);
  if (slack <= 0) return evenSizes(count);
  return lifted.map((v) => v - over * ((v - floor) / slack));
}

/** Move the divider between slot `divider` and the one below it.

    `delta` is a fraction of the pane, positive to grow the upper slot.
    Only the two slots either side move: spreading the delta further would
    shift panels the writer isn't touching. An impossible or nil drag hands
    back the same array so a resize that changes nothing costs nothing. */
export function resizeSlots(sizes: number[], divider: number, delta: number): number[] {
  if (divider < 0 || divider + 1 >= sizes.length) return sizes;
  const floor = Math.min(MIN_SLOT, 1 / sizes.length);
  const above = sizes[divider]!;
  const below = sizes[divider + 1]!;
  const d = Math.max(floor - above, Math.min(delta, below - floor));
  if (Math.abs(d) < 1e-6) return sizes;
  const next = [...sizes];
  next[divider] = above + d;
  next[divider + 1] = below - d;
  return next;
}

/** Same drag, at the level of prefs. */
export function resizePane(prefs: TabPrefs, divider: number, delta: number): TabPrefs {
  const sizes = slotSizes(prefs);
  const next = resizeSlots(sizes, divider, delta);
  return next === sizes ? prefs : { ...prefs, sizes: next };
}

/** Pin a tool open in its own slot.

    `at` is a position within the stack, so a tool can be dropped between
    two panels as well as under them; it defaults to the bottom, which is
    what a drag onto the drop zone means. A closed tool can be stacked
    straight from the + menu, so this un-hides on the way in.

    Refusals: an unknown tool, the tool already in the tabbed slot (it's on
    screen), one already stacked, and anything past the cap. */
export function stackTab(prefs: TabPrefs, tab: TabId, at?: number): TabPrefs {
  if (!ALL_TABS.includes(tab)) return prefs;
  if (tab === prefs.active || prefs.stack.includes(tab)) return prefs;
  if (!canStack(prefs)) return prefs;
  const idx = Math.max(0, Math.min(at ?? prefs.stack.length, prefs.stack.length));
  const stack = [...prefs.stack];
  stack.splice(idx, 0, tab);
  const sizes = slotSizes(prefs);
  // The new panel should end up with an equal share while the panels
  // already open keep their proportions to each other. Against a set that
  // sums to 1, the value that normalises to 1/(n+1) is 1/n.
  const share = 1 / sizes.length;
  sizes.splice(idx + 1, 0, share);
  return {
    ...prefs,
    hidden: prefs.hidden.filter((t) => t !== tab),
    stack,
    sizes: normalizeSizes(sizes, stack.length + 1),
  };
}

/** Close a slot. The tool returns to the tab strip rather than vanishing —
    it was never hidden, only busy. */
export function unstackTab(prefs: TabPrefs, tab: TabId): TabPrefs {
  const at = prefs.stack.indexOf(tab);
  if (at < 0) return prefs;
  const sizes = slotSizes(prefs).filter((_, i) => i !== at + 1);
  return {
    ...prefs,
    stack: prefs.stack.filter((t) => t !== tab),
    sizes: normalizeSizes(sizes, prefs.stack.length),
  };
}

/** Swap a stacked tool with its neighbour, height and all — the panels
    trade places, so a panel you sized stays the size you made it.

    It stops at the ends rather than wrapping or promoting into the tabbed
    slot: slot 0 belongs to the strip, and a tool arriving there would have
    to evict whatever the strip has open. */
export function moveStack(prefs: TabPrefs, tab: TabId, dir: -1 | 1): TabPrefs {
  const at = prefs.stack.indexOf(tab);
  if (at < 0) return prefs;
  const to = at + dir;
  if (to < 0 || to >= prefs.stack.length) return prefs;
  const stack = [...prefs.stack];
  [stack[at], stack[to]] = [stack[to]!, stack[at]!];
  const sizes = slotSizes(prefs);
  [sizes[at + 1], sizes[to + 1]] = [sizes[to + 1]!, sizes[at + 1]!];
  return { ...prefs, stack, sizes };
}

/** Repair whatever came out of storage into prefs the UI can trust. */
export function normalizePrefs(raw: Partial<TabPrefs> | null): TabPrefs {
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

  const stack: TabId[] = [];
  for (const t of raw?.stack ?? []) {
    const id = t as TabId;
    // Every rejection here is an arrangement the UI can't render: a tool
    // that no longer exists, the same tool twice, the tabbed tool doubled
    // into a panel, a tool the writer switched off in Settings (the chip is
    // the authority on that), or one slot past the cap.
    if (!known.has(id) || id === active || hidden.includes(id) || stack.includes(id)) continue;
    if (stack.length + 1 >= MAX_SLOTS) break;
    stack.push(id);
  }
  return { order, hidden, active, stack, sizes: normalizeSizes(raw?.sizes, stack.length + 1) };
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

  /** The pane's slots, top to bottom, and their shares of its height. */
  slots(): TabId[] {
    return paneSlots(prefs);
  },

  sizes(): number[] {
    return slotSizes(prefs);
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

  /** Pin a tool open in its own slot — the drop, and the menu item. */
  stack(tab: TabId, at?: number): void {
    persist(stackTab(prefs, tab, at));
  },

  /** Close a slot; the tool goes back to the strip. */
  unstack(tab: TabId): void {
    persist(unstackTab(prefs, tab));
  },

  /** Swap a stacked panel with its neighbour. */
  moveStacked(tab: TabId, dir: -1 | 1): void {
    persist(moveStack(prefs, tab, dir));
  },

  /** Drag the divider under slot `divider` by a fraction of the pane. */
  resize(divider: number, delta: number): void {
    persist(resizePane(prefs, divider, delta));
  },

  /** Back to equal shares — the divider's double-click and Enter. */
  evenSlots(): void {
    const now = slotSizes(prefs);
    const next = evenSizes(now.length);
    // Already even: skip the write, the same way the pure functions decline
    // a move that changes nothing.
    if (next.every((v, i) => Math.abs(v - now[i]!) < 1e-6)) return;
    persist({ ...prefs, sizes: next });
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
