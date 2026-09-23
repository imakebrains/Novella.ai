/* ============================================================
   What follows the writer, what travels with the book, what stays

   Every piece of state Novella keeps in the browser's localStorage is
   listed here with one of three homes:

     account — follows the writer to every device (user_settings in
               the cloud): taste, routing, the writer's own schedule.
     book    — belongs to one book and should travel INSIDE it (its
               .novella folder), so the file sync carries it and a
               zipped book is still whole.
     device  — describes this machine: pane widths, which book is open
               here, crash-recovery drafts, the sign-in itself. Never
               leaves it.

   test-prefs.ts scans the source for every "novella.…" key and fails
   the gate on one this table doesn't classify — which is the point:
   the owner's unpushed work adds keys, and each one gets a home the
   moment it merges, instead of silently staying on one computer.

   Nothing here may ever hold a credential. API keys live in the OS
   keychain (CLAUDE.md), and the cloud session is device-only.
   ============================================================ */

export type Home = "account" | "book" | "device";

export interface KeyRule {
  /** Exact key, or the static prefix of a key built at runtime. */
  key: string;
  /** True when the real key is `key` followed by something dynamic
      (a project id, a vault root, a pane name). */
  prefix?: boolean;
  home: Home;
  why: string;
}

export const STORAGE_KEYS: KeyRule[] = [
  // ---- account: the writer's taste and tools ----
  { key: "novella.theme", home: "account", why: "Chosen theme." },
  { key: "novella.personalize", home: "account", why: "Accent, prose font and size, motion." },
  { key: "novella.customThemes", home: "account", why: "Themes the writer made." },
  { key: "novella.accentSwatches", home: "account", why: "Saved accent colours." },
  { key: "novella.profile", home: "account", why: "Name and byline for exports." },
  { key: "novella.roleRouting", home: "account", why: "Which connection does which job." },
  { key: "novella.connections", home: "account", why: "Connection settings. Keys are not in here; they live in the keychain." },
  { key: "novella.connection", home: "account", why: "Legacy single-connection setting." },
  { key: "novella.activeProvider", home: "account", why: "The provider picked last." },
  { key: "novella.enabledPlugins", home: "account", why: "Which plugins are on." },
  { key: "novella.plugin", home: "account", why: "Plugin settings; secret fields go to the keychain, not here." },
  { key: "novella.plugin.", prefix: true, home: "account", why: "Per-plugin settings, same rule." },
  { key: "novella.tasks.doneMode", home: "account", why: "How finished tasks show." },
  { key: "novella.welcomed", home: "account", why: "The welcome was seen; a second device shouldn't replay it." },
  { key: "novella.introSeen", home: "account", why: "Same, for the intro." },
  { key: "novella.tourSeen", home: "account", why: "Same, for the tour." },
  { key: "novella.tourOffered", home: "account", why: "Same, for the tour offer." },
  { key: "novella.motionNoticeSeen", home: "account", why: "The motion notice was dismissed." },
  // ---- account: the writer's own schedule (owner board: 3/10 until this syncs) ----
  { key: "novella.calendar", home: "account", why: "Calendar entries span books." },
  { key: "novella.calendarLabels", home: "account", why: "Custom calendar labels." },
  { key: "novella.calendarFeeds", home: "account", why: "Subscribed .ics feeds." },
  { key: "novella.planner", home: "account", why: "Planner state across books." },
  { key: "novella.sessions", home: "account", why: "Writing-session history and word counts." },
  { key: "novella.sprints", home: "account", why: "Sprint history." },
  { key: "novella.timers", home: "account", why: "Saved timers and alarms." },
  // ---- book: belongs inside the book it describes ----
  { key: "novella.chat.", prefix: true, home: "book", why: "Chat threads for one book." },
  { key: "novella.agents.", prefix: true, home: "book", why: "Agent state for one book." },
  { key: "novella.boards.", prefix: true, home: "book", why: "Custom boards for one book." },
  { key: "novella.board.panels.", prefix: true, home: "book", why: "Floating panels on one book's board." },
  { key: "novella.plot.", prefix: true, home: "book", why: "Plot grid for one book." },
  { key: "novella.music.", prefix: true, home: "book", why: "One book's music." },
  { key: "novella.history.", prefix: true, home: "book", why: "One note's history cache; the history itself is in .novella/history." },
  { key: "novella.trash.", prefix: true, home: "book", why: "One book's trash index cache; the trash itself is in .novella/trash." },
  // ---- device: about this machine, never synced ----
  { key: "novella.projects", home: "device", why: "Folders this machine has open; cloud books list from the server." },
  { key: "novella.activeProject", home: "device", why: "The book open here right now." },
  { key: "novella.activeBoard", home: "device", why: "The board open here." },
  { key: "novella.boardLayout", home: "device", why: "Board view on this screen." },
  { key: "novella.board.banner", home: "device", why: "Banner toggle on this screen." },
  { key: "novella.codex.collapsed", home: "device", why: "Collapsed sidebar groups." },
  { key: "novella.focus", home: "device", why: "Focus mode on this screen." },
  { key: "novella.inspector", home: "device", why: "Tool panel arrangement for this screen size." },
  { key: "novella.inspector.strip", home: "device", why: "Tool strip visibility." },
  { key: "novella.pane.left", home: "device", why: "Pane width in pixels." },
  { key: "novella.pane.right", home: "device", why: "Pane width in pixels." },
  { key: "novella.pane.", prefix: true, home: "device", why: "Pane widths and open states." },
  { key: "novella.toolZoom", home: "device", why: "Tool zoom for this display." },
  { key: "novella.tourStep", home: "device", why: "Where a tour paused on this machine." },
  { key: "novella.draft.", prefix: true, home: "device", why: "Crash-recovery drafts: this machine's unsaved words." },
  { key: "novella.calendar.feedsOpen", home: "device", why: "Whether the feeds list is expanded here." },
  { key: "novella.connections.seeded", home: "device", why: "First-run seeding already happened here." },
  { key: "novella.updateRepo", home: "device", why: "Update-check source for this install." },
  { key: "novella.cloud.session", home: "device", why: "The sign-in. A credential; never synced." },
];

/** PURE. Where does this key belong? Exact rules win over prefixes;
    among prefixes the longest wins, so "novella.pane.left" is never
    mistaken for a dynamic "novella.pane.<name>". */
export function homeOf(key: string, rules: KeyRule[] = STORAGE_KEYS): Home | null {
  const exact = rules.find((r) => !r.prefix && r.key === key);
  if (exact) return exact.home;
  let best: KeyRule | null = null;
  for (const r of rules) {
    if (r.prefix && key.startsWith(r.key) && key.length > r.key.length && (!best || r.key.length > best.key.length)) best = r;
  }
  return best ? best.home : null;
}

/** The subset of Web Storage these helpers need. */
export interface KeyValueStore {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type SettingsDoc = Record<string, string>;

/** PURE-ish (reads only). Every account-scoped value in this store. */
export function accountSnapshot(store: KeyValueStore): SettingsDoc {
  const out: SettingsDoc = {};
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key || homeOf(key) !== "account") continue;
    const value = store.getItem(key);
    if (value !== null) out[key] = value;
  }
  return out;
}

/** PURE. Three-way merge of settings documents, key by key.

    `base` is what this device last synced. A key changed on only one
    side takes that side's value; a key changed on both sides takes
    `mine` — the device doing the sync is the one the writer is looking
    at, the same rule the file sync uses for .novella config. A key
    deleted on one side and untouched on the other stays deleted. Keys
    that aren't account-scoped are dropped, so a stray device key in an
    old cloud document can never be written onto this machine. */
export function mergeSettings(base: SettingsDoc, mine: SettingsDoc, theirs: SettingsDoc): SettingsDoc {
  const out: SettingsDoc = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)]);
  for (const key of keys) {
    if (homeOf(key) !== "account") continue;
    const b = base[key];
    const m = mine[key];
    const t = theirs[key];
    const mineChanged = m !== b;
    const theirsChanged = t !== b;
    const value = mineChanged ? m : theirsChanged ? t : b;
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** PURE. What applying `next` to this device changes: keys to write and
    keys to remove, account-scoped only. Returned rather than applied so
    the caller can batch the writes and tell the app what reloaded. */
export function settingsDiff(current: SettingsDoc, next: SettingsDoc): { set: SettingsDoc; remove: string[] } {
  const set: SettingsDoc = {};
  const remove: string[] = [];
  for (const [key, value] of Object.entries(next)) {
    if (homeOf(key) === "account" && current[key] !== value) set[key] = value;
  }
  for (const key of Object.keys(current)) {
    if (homeOf(key) === "account" && !(key in next)) remove.push(key);
  }
  return { set, remove };
}
