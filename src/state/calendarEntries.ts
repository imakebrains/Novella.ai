import { useSyncExternalStore } from "react";
import { dayKey } from "./sessions";
import { plannerStore } from "./planner";
import {
  fetchIcs,
  feedNameFromUrl,
  normalizeFeedUrl,
  parseIcs,
  type IcsEvent,
} from "./icsFeed";

/* ============================================================
   The calendar's own data

   A day holds a LIST, not a line. "Today's intention" was one
   textarea, which forced a writer with three things on a Tuesday to
   cram them into one sentence or keep them somewhere else — and
   somewhere else is where planning goes to die.

   Like the planner intents this grew out of, entries are the
   WRITER'S schedule, not the book's: they belong to the person, not
   to any one manuscript, so they live in localStorage rather than
   inside a vault folder. Open a different novel and your Tuesday is
   still your Tuesday.

   All the date arithmetic lives here as pure functions with `now`
   passed in, so the month grid — the easy thing to get subtly wrong
   around DST and month ends — is testable without faking a clock.
   ============================================================ */

export interface EntryLabel {
  id: string;
  name: string;
  color: string;
}

/* The plot board's hues, named. Muted enough to tint a day cell
   without shouting over five themes. Entries store the label's ID
   rather than its hex, so restyling the palette later reskins every
   existing entry instead of freezing today's colors into storage. */
export const ENTRY_LABELS: EntryLabel[] = [
  { id: "draft", name: "Draft", color: "#c8794e" },
  { id: "revise", name: "Revise", color: "#6f8faf" },
  { id: "research", name: "Research", color: "#8a9a5b" },
  { id: "deadline", name: "Deadline", color: "#b0687f" },
  { id: "admin", name: "Admin", color: "#9a7bb0" },
  { id: "rest", name: "Rest", color: "#4f9a94" },
];

export interface CalendarEntry {
  id: string;
  /** Local calendar day, YYYY-MM-DD — the same key sessions uses. */
  day: string;
  text: string;
  /** "HH:MM" wall time. Absent means "sometime this day". */
  time?: string;
  /** An ENTRY_LABELS id, or absent for unlabeled. */
  label?: string;
  /** Epoch ms. Ordering untimed entries by when they were written keeps
      a day's list from reshuffling itself under the writer's cursor. */
  created: number;
}

export function labelById(id: string | undefined): EntryLabel | undefined {
  if (!id) return undefined;
  return ENTRY_LABELS.find((l) => l.id === id);
}

export function entryColor(entry: CalendarEntry): string | null {
  return labelById(entry.label)?.color ?? null;
}

/* ---------- date maths (pure) ---------- */

/** Parse a YYYY-MM-DD key back to a Date pinned at local noon. Noon,
    not midnight, so adding days can never trip over a DST boundary
    into the previous date. */
export function dateOf(day: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return new Date(NaN);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
}

/** The 6×7 grid for the month containing `anchor`, starting on the
    Monday on or before the 1st. Always 42 cells: a fixed shape means
    the grid never changes height between months, so the day panel
    below it doesn't jump when you page through the year. */
export function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/** Move the anchor by whole months, landing on the 1st.

    Landing on the 1st is the whole point: stepping from the 31st of
    March by one month would otherwise overflow into May. */
export function addMonths(anchor: Date, delta: number): Date {
  const next = new Date(anchor);
  next.setDate(1);
  next.setMonth(next.getMonth() + delta);
  next.setHours(12, 0, 0, 0);
  return next;
}

/** The 1st of a given month, at noon. What the picker hands back. */
export function monthAnchor(year: number, month: number): Date {
  return new Date(year, month, 1, 12);
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Month names in the writer's locale, January first. Built off a
    fixed year so it never depends on today. */
export function monthNames(style: "long" | "short" = "long", locale?: string): string[] {
  return Array.from({ length: 12 }, (_, m) =>
    new Date(2021, m, 1, 12).toLocaleDateString(locale, { month: style }),
  );
}

/** The years the picker offers, oldest first. A window rather than an
    infinite scroller: a writer plans in a few years either side, and
    "scroll to 1987" is a worse experience than a short honest list. */
export function yearOptions(center: number, back = 20, forward = 20): number[] {
  return Array.from({ length: back + forward + 1 }, (_, i) => center - back + i);
}

/** "09:00" → "9:00 AM" (or 09:00, per locale). Pure: a fixed date. */
export function formatTime(time: string, locale?: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const d = new Date(2021, 0, 1, Number(m[1]), Number(m[2]));
  return d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

/** Read whatever the writer typed into a time field as "HH:MM", or
    undefined when it isn't a time at all.

    Deliberately forgiving — "9", "930", "9:30pm" and "21:30" all mean
    something obvious, and rejecting them to enforce a format is the
    kind of pedantry that makes people stop using the field. */
export function normalizeTime(raw: string): string | undefined {
  const t = raw.trim().toLowerCase().replace(/\./g, "");
  if (!t) return undefined;

  let h: number;
  let min: number;
  let meridiem: string | undefined;

  const colon = /^(\d{1,2}):(\d{1,2})\s*(am|pm)?$/.exec(t);
  const bare = /^(\d{1,2})\s*(am|pm)?$/.exec(t);
  const packed = /^(\d{3,4})$/.exec(t);

  if (colon) {
    h = Number(colon[1]);
    min = Number(colon[2]);
    meridiem = colon[3];
  } else if (bare) {
    h = Number(bare[1]);
    min = 0;
    meridiem = bare[2];
  } else if (packed) {
    const digits = packed[1] ?? "";
    h = Number(digits.slice(0, digits.length - 2));
    min = Number(digits.slice(-2));
  } else {
    return undefined;
  }

  if (meridiem) {
    if (h < 1 || h > 12) return undefined;
    if (meridiem === "pm" && h !== 12) h += 12;
    if (meridiem === "am" && h === 12) h = 0;
  }
  if (h > 23 || min > 59) return undefined;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Timed entries first and in clock order, then untimed in the order
    they were written. A day reads top to bottom the way it happens. */
export function compareEntries(a: CalendarEntry, b: CalendarEntry): number {
  if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1;
  if (a.time && !b.time) return -1;
  if (!a.time && b.time) return 1;
  if (a.created !== b.created) return a.created - b.created;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortEntries(list: CalendarEntry[]): CalendarEntry[] {
  return [...list].sort(compareEntries);
}

/** Entries bucketed by day and sorted within each — one pass, so the
    month grid can look up 42 days without re-filtering the list 42
    times. */
export function groupByDay(list: CalendarEntry[]): Record<string, CalendarEntry[]> {
  const out: Record<string, CalendarEntry[]> = {};
  for (const e of list) (out[e.day] ??= []).push(e);
  for (const day of Object.keys(out)) out[day] = sortEntries(out[day] ?? []);
  return out;
}

/** The wash of color a day cell gets: the first labeled entry's hue,
    or null when the day has content but nothing labeled (which still
    earns a mark, just the neutral one). */
export function dayTint(entries: CalendarEntry[]): string | null {
  for (const e of sortEntries(entries)) {
    const color = entryColor(e);
    if (color) return color;
  }
  return null;
}

/** Up to `max` distinct dots for a day. `null` stands for an unlabeled
    entry — the caller paints those in the theme's accent, so "has
    something planned" reads even with no labels in use at all. */
export function dayDots(entries: CalendarEntry[], max = 3): (string | null)[] {
  const seen: (string | null)[] = [];
  for (const e of sortEntries(entries)) {
    const color = entryColor(e);
    if (!seen.some((s) => s === color)) seen.push(color);
    if (seen.length >= max) break;
  }
  return seen;
}

export function makeEntry(
  id: string,
  day: string,
  text: string,
  created: number,
  extra: { time?: string; label?: string } = {},
): CalendarEntry {
  const entry: CalendarEntry = { id, day, text, created };
  if (extra.time) entry.time = extra.time;
  if (extra.label) entry.label = extra.label;
  return entry;
}

export function upsertEntry(list: CalendarEntry[], entry: CalendarEntry): CalendarEntry[] {
  const i = list.findIndex((e) => e.id === entry.id);
  if (i < 0) return [...list, entry];
  const next = [...list];
  next[i] = entry;
  return next;
}

export function removeEntryFrom(list: CalendarEntry[], id: string): CalendarEntry[] {
  return list.filter((e) => e.id !== id);
}

/** Fold the old one-line-per-day intents into entries.

    Nobody's plan gets thrown away because the data model grew a list.
    Skips any day that already has entries, so a re-run can't duplicate.
    `idFor` is injected so this stays pure and testable. */
export function migrateIntents(
  intents: Record<string, string>,
  existing: CalendarEntry[],
  idFor: (day: string) => string,
  created: number,
): CalendarEntry[] {
  const taken = new Set(existing.map((e) => e.day));
  const added: CalendarEntry[] = [];
  for (const day of Object.keys(intents).sort()) {
    const text = (intents[day] ?? "").trim();
    if (!text || taken.has(day)) continue;
    added.push(makeEntry(idFor(day), day, text, created));
  }
  return [...existing, ...added];
}

/* ============================================================
   Storage — the writer's own entries
   ============================================================ */

const ENTRIES_KEY = "novella.calendar";
const FEEDS_KEY = "novella.calendarFeeds";

interface StoredEntries {
  v: 1;
  entries: CalendarEntry[];
  /** Set once the old planner intents have been folded in, so the
      migration can't run twice and re-add a line the writer deleted. */
  migrated?: boolean;
}

let seq = 0;
function newId(prefix: string): string {
  // Timestamp plus a counter: unique across a session without needing a
  // uuid dependency, and readable when you're staring at localStorage.
  return `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;
}

function readEntries(): StoredEntries {
  let state: StoredEntries = { v: 1, entries: [] };
  try {
    const raw = localStorage.getItem(ENTRIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredEntries>;
      state = {
        v: 1,
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        ...(parsed.migrated ? { migrated: true } : {}),
      };
    }
  } catch {
    /* A corrupt blob loses planning, never a manuscript. Start clean. */
  }

  if (!state.migrated) {
    const now = Date.now();
    state = {
      v: 1,
      migrated: true,
      entries: migrateIntents(plannerStore.all(), state.entries, () => newId("e"), now),
    };
    writeEntries(state);
  }
  return state;
}

function writeEntries(state: StoredEntries): void {
  try {
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(state));
  } catch {
    /* Planning is best-effort; never let storage failure block writing. */
  }
}

let entries: CalendarEntry[] = [];
let entriesReady = false;
const listeners = new Set<() => void>();
let version = 0;

function ensureLoaded(): void {
  // Lazy so importing this module (a unit test, a tree-shaken build)
  // never touches localStorage until something actually asks for data.
  if (entriesReady) return;
  entriesReady = true;
  entries = readEntries().entries;
}

function emit(): void {
  version++;
  for (const l of listeners) l();
}

function persist(): void {
  writeEntries({ v: 1, entries, migrated: true });
  emit();
}

export const calendarStore = {
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  getVersion(): number {
    return version;
  },

  all(): CalendarEntry[] {
    ensureLoaded();
    return entries;
  },

  /** One day's entries, in reading order. */
  on(day: string): CalendarEntry[] {
    ensureLoaded();
    return sortEntries(entries.filter((e) => e.day === day));
  },

  byDay(): Record<string, CalendarEntry[]> {
    ensureLoaded();
    return groupByDay(entries);
  },

  add(day: string, text = "", extra: { time?: string; label?: string } = {}): CalendarEntry {
    ensureLoaded();
    const entry = makeEntry(newId("e"), day, text, Date.now(), extra);
    entries = upsertEntry(entries, entry);
    persist();
    return entry;
  },

  update(id: string, patch: { text?: string; time?: string | null; label?: string | null }): void {
    ensureLoaded();
    const existing = entries.find((e) => e.id === id);
    if (!existing) return;
    const next: CalendarEntry = { ...existing };
    if (patch.text !== undefined) next.text = patch.text;
    if (patch.time !== undefined) {
      if (patch.time) next.time = patch.time;
      else delete next.time;
    }
    if (patch.label !== undefined) {
      if (patch.label) next.label = patch.label;
      else delete next.label;
    }
    entries = upsertEntry(entries, next);
    persist();
  },

  remove(id: string): void {
    ensureLoaded();
    entries = removeEntryFrom(entries, id);
    persist();
  },
};

export function useCalendarEntries(): number {
  return useSyncExternalStore(calendarStore.subscribe, calendarStore.getVersion, calendarStore.getVersion);
}

/* ============================================================
   Storage — subscribed ICS calendars

   Parsed events are cached beside the URL on purpose. This app is
   local-first: a calendar you subscribed to last night should still
   be on the grid this morning on a train with no signal. Refresh is
   a button, not a background poller — nothing here phones out unless
   the writer asks it to.
   ============================================================ */

export interface CalendarFeed {
  id: string;
  url: string;
  name: string;
  lastFetched: number | null;
  /** The last failure, kept so the UI can say what went wrong instead
      of silently showing a stale calendar. */
  lastError: string | null;
  events: IcsEvent[];
}

let feeds: CalendarFeed[] = [];
let feedsReady = false;

function ensureFeeds(): void {
  if (feedsReady) return;
  feedsReady = true;
  try {
    const raw = localStorage.getItem(FEEDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) feeds = parsed as CalendarFeed[];
    }
  } catch {
    feeds = [];
  }
}

function persistFeeds(): void {
  try {
    localStorage.setItem(FEEDS_KEY, JSON.stringify(feeds));
  } catch {
    /* best-effort, same as everything else on this tab */
  }
  emit();
}

function replaceFeed(id: string, patch: Partial<CalendarFeed>): void {
  feeds = feeds.map((f) => (f.id === id ? { ...f, ...patch } : f));
  persistFeeds();
}

export const feedStore = {
  list(): CalendarFeed[] {
    ensureFeeds();
    return feeds;
  },

  /** Register a URL. Does not fetch — the caller refreshes, so a typo
      surfaces as one visible error on one visible row. */
  add(url: string): CalendarFeed {
    ensureFeeds();
    const feed: CalendarFeed = {
      id: newId("f"),
      url: normalizeFeedUrl(url),
      name: feedNameFromUrl(url),
      lastFetched: null,
      lastError: null,
      events: [],
    };
    feeds = [...feeds, feed];
    persistFeeds();
    return feed;
  },

  remove(id: string): void {
    ensureFeeds();
    feeds = feeds.filter((f) => f.id !== id);
    persistFeeds();
  },

  /** Re-read one feed. Resolves either way; the outcome is on the feed
      record so the UI reads it from one place. */
  async refresh(id: string): Promise<void> {
    ensureFeeds();
    const feed = feeds.find((f) => f.id === id);
    if (!feed) return;
    try {
      const text = await fetchIcs(feed.url);
      feedStore.acceptText(id, text);
    } catch (err) {
      replaceFeed(id, {
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  },

  /** Take ICS text we already have — a fetch result, or a file the
      writer pasted because their provider blocks cross-origin reads. */
  acceptText(id: string, text: string): void {
    ensureFeeds();
    const feed = feeds.find((f) => f.id === id);
    if (!feed) return;
    try {
      const parsed = parseIcs(text);
      replaceFeed(id, {
        name: parsed.name ?? feed.name,
        events: parsed.events,
        lastFetched: Date.now(),
        lastError: null,
      });
    } catch {
      replaceFeed(id, { lastError: "That file didn't parse as a calendar." });
    }
  },

  async refreshAll(): Promise<void> {
    ensureFeeds();
    await Promise.all(feeds.map((f) => feedStore.refresh(f.id)));
  },
};

/** Feeds and entries share a version counter, because the tab that
    reads one always reads the other. */
export function useCalendarFeeds(): number {
  return useSyncExternalStore(calendarStore.subscribe, calendarStore.getVersion, calendarStore.getVersion);
}

/** Today's key, for callers that shouldn't have to know sessions owns it. */
export function todayKey(now = new Date()): string {
  return dayKey(now);
}
