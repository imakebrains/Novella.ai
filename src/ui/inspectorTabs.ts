import { useSyncExternalStore } from "react";

/* ============================================================
   Inspector tab preferences

   Which tabs show, in what order, and which one is open — the
   writer's arrangement, not ours. Close what you never use, drag
   the rest into the order your hands expect. Stored per user
   (localStorage): how a person arranges their desk isn't a fact
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
  | "music";

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
];

export interface TabPrefs {
  /** Every known tab, in the writer's order — hidden ones included, so
      re-adding a tab returns it to where it used to sit rather than to
      the end of the strip. */
  order: TabId[];
  hidden: TabId[];
  active: TabId;
}

const KEY = "novella.inspector";

/* ============================================================
   Pure arrangement logic — no store, no DOM, no localStorage.
   ============================================================ */

/** The strip, in strip order. */
export function visibleTabs(prefs: TabPrefs): TabId[] {
  return prefs.order.filter((t) => !prefs.hidden.includes(t));
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
  // Already there and already open: nothing to do. Worth the line because
  // the Tools dropdown calls this on every pick, and without it choosing
  // the tab you're already on would write to storage for no reason.
  if (prefs.order.includes(tab) && !prefs.hidden.includes(tab) && prefs.active === tab) return prefs;
  const order = prefs.order.includes(tab) ? prefs.order : [...prefs.order, tab];
  return { order, hidden: prefs.hidden.filter((t) => t !== tab), active: tab };
}

/** Take a tab out of the strip.

    The last visible tab refuses to go: a pane with no tabs is a dead end
    with no way back. When the open tab is the one closing, the neighbour
    that slides into its place takes over — jumping to the far left would
    lose the writer's place for no reason. */
export function removeTab(prefs: TabPrefs, tab: TabId): TabPrefs {
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
  const hidden = (raw?.hidden ?? []).filter(
    (t): t is TabId => known.has(t as TabId) && order.includes(t as TabId),
  );
  const visible = order.filter((t) => !hidden.includes(t));
  // Never all-hidden; the pane with no tabs is a dead end.
  if (visible.length === 0) return { order, hidden: [], active: order[0]! };
  const active = raw?.active && visible.includes(raw.active) ? raw.active : visible[0]!;
  return { order, hidden, active };
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

  setActive(tab: TabId): void {
    persist({ ...prefs, active: tab });
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
