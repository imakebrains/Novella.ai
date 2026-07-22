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
   ============================================================ */

export type TabId =
  | "links"
  | "critique"
  | "tasks"
  | "history"
  | "assistant"
  | "goals"
  | "calendar"
  | "music";

export const ALL_TABS: TabId[] = [
  "links",
  "critique",
  "tasks",
  "history",
  "assistant",
  "goals",
  "calendar",
  "music",
];

interface TabPrefs {
  order: TabId[];
  hidden: TabId[];
  active: TabId;
}

const KEY = "novella.inspector";

function normalize(raw: Partial<TabPrefs> | null): TabPrefs {
  const known = new Set(ALL_TABS);
  const order = (raw?.order ?? []).filter((t): t is TabId => known.has(t as TabId));
  // Tabs added to the app after prefs were saved append at the end rather
  // than vanishing — prefs never hide something the user didn't hide.
  for (const t of ALL_TABS) if (!order.includes(t)) order.push(t);
  const hidden = (raw?.hidden ?? []).filter((t): t is TabId => known.has(t as TabId));
  const visible = order.filter((t) => !hidden.includes(t));
  // Never all-hidden; the pane with no tabs is a dead end.
  if (visible.length === 0) return { order, hidden: [], active: order[0]! };
  const active = raw?.active && visible.includes(raw.active) ? raw.active : visible[0]!;
  return { order, hidden, active };
}

function read(): TabPrefs {
  try {
    return normalize(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return normalize(null);
  }
}

let prefs = read();
const listeners = new Set<() => void>();
let version = 0;

function persist(next: TabPrefs): void {
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
    return prefs.order.filter((t) => !prefs.hidden.includes(t));
  },

  setActive(tab: TabId): void {
    persist({ ...prefs, active: tab });
  },

  /** Hide a tab. The last visible tab refuses to close. */
  hide(tab: TabId): void {
    const visible = this.visible();
    if (visible.length <= 1) return;
    const hidden = [...prefs.hidden, tab];
    const nextVisible = prefs.order.filter((t) => !hidden.includes(t));
    persist({
      ...prefs,
      hidden,
      active: prefs.active === tab ? (nextVisible[0] ?? prefs.active) : prefs.active,
    });
  },

  show(tab: TabId): void {
    persist({ ...prefs, hidden: prefs.hidden.filter((t) => t !== tab), active: tab });
  },

  /** Move a visible tab to sit at another visible tab's position. */
  moveBefore(tab: TabId, target: TabId): void {
    if (tab === target) return;
    const order = prefs.order.filter((t) => t !== tab);
    const at = order.indexOf(target);
    if (at < 0) return;
    order.splice(at, 0, tab);
    persist({ ...prefs, order });
  },
};

export function useTabPrefs(): TabPrefs {
  useSyncExternalStore(tabPrefs.subscribe, tabPrefs.getVersion, tabPrefs.getVersion);
  return tabPrefs.get();
}
