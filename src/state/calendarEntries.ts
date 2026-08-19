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
   existing entry instead of freezing today's colors into storage —
   and so does a writer renaming or recoloring one of these six. */
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
  /** A label id — one of the six above, or one of the writer's own. */
  label?: string;
  /** Epoch ms. Ordering untimed entries by when they were written keeps
      a day's list from reshuffling itself under the writer's cursor. */
  created: number;
}

/* ============================================================
   The label book — six shipped, the rest the writer's

   Six was never going to be right for everyone. A novelist who works
   in POVs, or in beats, or in "waiting on the editor" has a vocabulary
   we can't guess at, so the shipped six became a FLOOR rather than a
   fence: rename them, recolor them, archive the ones you don't use,
   add your own.

   The book stores PATCHES, not a replacement list. A record whose id
   matches a built-in layers a name, a color or an archived flag over
   the shipped one; a record with a fresh id is a label of the writer's
   own. Two things follow from that shape, and they are the whole
   reason for it:

     - an EMPTY book resolves to exactly the six we always shipped, so
       a writer upgrading into this feature sees no change at all;
     - un-editing a built-in means deleting a record rather than
       remembering what our own default used to be, so retuning the
       shipped palette still reaches everyone who never touched it.

   Everything down to the STORAGE line is pure over its arguments.
   ============================================================ */

/** Long enough for "First-pass revision", short enough to sit in a
    menu row without wrapping. */
export const LABEL_NAME_MAX = 24;

/** The ceiling on the whole book, the six built-ins included. This is a
    color code read at a glance across 42 day cells: past a couple of
    dozen hues nobody can tell one dot from another, and the picker
    stops being a menu and becomes a scroll. */
export const MAX_LABELS = 24;

/** The writer's own ids carry a prefix, so any id can be classified
    without a lookup — including one left behind in an entry. */
export const CUSTOM_LABEL_PREFIX = "lbl";

export interface StoredLabel {
  id: string;
  /** Both absent on a built-in patch that only archives. */
  name?: string;
  color?: string;
  archived?: boolean;
  /** Epoch ms. Orders the writer's own labels beneath the built-ins. */
  created?: number;
}

export interface LabelBook {
  v: 1;
  labels: StoredLabel[];
}

/** A label as everything downstream sees it: the shipped six with any
    patch applied, then the writer's own in the order they made them. */
export interface ResolvedLabel extends EntryLabel {
  builtin: boolean;
  /** Archived labels are not offered for new entries but still
      RESOLVE, which is the whole mechanism keeping old entries
      rendering exactly as they did. */
  archived: boolean;
  /** A built-in the writer has renamed or recolored — the only state
      in which "Reset" is worth offering. */
  edited: boolean;
}

export function emptyLabelBook(): LabelBook {
  return { v: 1, labels: [] };
}

const LABEL_HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

/** "#ABC" / "aabbcc" / "#AABBCC" → "#aabbcc"; null when it isn't a
    color at all. Shorthand is accepted because writers paste hexes
    from wherever they found them.

    Six lines restated rather than imported from customThemes: that
    module is ui and this one is state, and reaching upward to validate
    a string would drag the theme engine — DOM writes included — into
    every test that touches a calendar. */
export function normalizeLabelHex(input: string): string | null {
  const m = LABEL_HEX.exec((input ?? "").trim());
  if (!m) return null;
  const hex = m[1]!.toLowerCase();
  if (hex.length === 6) return `#${hex}`;
  return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
}

export function isBuiltinLabelId(id: string): boolean {
  return ENTRY_LABELS.some((l) => l.id === id);
}

let labelSeq = 0;

/** Clock and counter injected so the id scheme is testable, and
    prefixed so a writer's label can never collide with a built-in. */
export function makeLabelId(now = Date.now(), n = labelSeq++): string {
  return `${CUSTOM_LABEL_PREFIX}${now.toString(36)}${n.toString(36)}`;
}

/** Built-ins first and in their shipped order, then the writer's own
    oldest first. Order is fixed rather than alphabetical because the
    picker is muscle memory: Draft is the top item forever. */
export function resolveLabels(book: LabelBook): ResolvedLabel[] {
  const rows = Array.isArray(book.labels) ? book.labels : [];
  const patch = new Map<string, StoredLabel>();
  for (const rec of rows) if (rec && typeof rec.id === "string") patch.set(rec.id, rec);

  const out: ResolvedLabel[] = ENTRY_LABELS.map((base) => {
    const rec = patch.get(base.id);
    const name = (rec?.name ?? "").trim() || base.name;
    const color = normalizeLabelHex(rec?.color ?? "") ?? base.color;
    return {
      id: base.id,
      name,
      color,
      builtin: true,
      archived: rec?.archived === true,
      edited: name !== base.name || color !== base.color,
    };
  });

  const own = rows
    .filter((rec) => rec && typeof rec.id === "string" && !isBuiltinLabelId(rec.id))
    // A label of the writer's own is nothing without a name and a hue,
    // so a half-written record is dropped rather than rendered blank.
    .filter((rec) => (rec.name ?? "").trim().length > 0 && normalizeLabelHex(rec.color ?? "") !== null)
    .sort((a, b) => (a.created ?? 0) - (b.created ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const rec of own) {
    out.push({
      id: rec.id,
      name: (rec.name ?? "").trim(),
      color: normalizeLabelHex(rec.color ?? "")!,
      builtin: false,
      archived: rec.archived === true,
      edited: false,
    });
  }
  return out;
}

/** What the picker offers for a new entry. */
export function offeredLabels(labels: ResolvedLabel[]): ResolvedLabel[] {
  return labels.filter((l) => !l.archived);
}

/** What the picker offers for an entry that already has a label:
    everything on offer, plus the one this row is wearing even if it's
    archived. Hiding the label a row visibly carries would read as the
    app having quietly lost it. */
export function labelChoices(labels: ResolvedLabel[], current?: string): ResolvedLabel[] {
  return labels.filter((l) => !l.archived || l.id === current);
}

/** Hard problems with a draft. An empty list means it can be saved.
    The cap is only checked when CREATING: a writer already at the
    ceiling must still be able to rename what they have. */
export function validateLabel(
  draft: { name: string; color: string },
  labels: ResolvedLabel[],
  id?: string,
): string[] {
  const problems: string[] = [];
  const name = (draft.name ?? "").trim();
  if (name.length === 0) problems.push("Give the label a name.");
  if (name.length > LABEL_NAME_MAX) {
    problems.push(`Label names stop at ${LABEL_NAME_MAX} characters.`);
  }
  if (!normalizeLabelHex(draft.color ?? "")) problems.push("That isn't a color.");
  // Two labels with one name is a color code you can't read back.
  if (name && labels.some((l) => l.id !== id && l.name.trim().toLowerCase() === name.toLowerCase())) {
    problems.push("You already have a label with that name.");
  }
  if (!id && labels.length >= MAX_LABELS) {
    problems.push(`${MAX_LABELS} labels is as many as a month grid can stay readable with.`);
  }
  return problems;
}

/** Upsert or drop one record by id. Every operation below goes through
    here, which is why none of them can leave two records for one label. */
function withLabelRecord(
  book: LabelBook,
  id: string,
  change: (rec: StoredLabel | undefined) => StoredLabel | null,
): LabelBook {
  const next = change(book.labels.find((r) => r.id === id));
  const rest = book.labels.filter((r) => r.id !== id);
  return { v: 1, labels: next ? [...rest, next] : rest };
}

/** Add a label of the writer's own. Refuses rather than storing junk —
    run validateLabel first when you want to say why. */
export function addLabel(
  book: LabelBook,
  draft: { name: string; color: string },
  id = makeLabelId(),
  created = Date.now(),
): LabelBook {
  const name = (draft.name ?? "").trim().slice(0, LABEL_NAME_MAX);
  const color = normalizeLabelHex(draft.color ?? "");
  if (!name || !color) return book;
  if (isBuiltinLabelId(id) || book.labels.some((r) => r.id === id)) return book;
  if (resolveLabels(book).length >= MAX_LABELS) return book;
  return { v: 1, labels: [...book.labels, { id, name, color, created }] };
}

/** Rename and/or recolor — built-ins included.

    Built-ins are patched rather than replaced, and a patch that ends up
    saying nothing is thrown away: rename Draft back to "Draft" and the
    record disappears, putting the label back under our palette. */
export function editLabel(
  book: LabelBook,
  id: string,
  patch: { name?: string; color?: string },
): LabelBook {
  const shipped = ENTRY_LABELS.find((l) => l.id === id);
  return withLabelRecord(book, id, (rec) => {
    if (!rec && !shipped) return null;
    const name =
      patch.name !== undefined
        ? patch.name.trim().slice(0, LABEL_NAME_MAX)
        : ((rec?.name ?? "").trim() || (shipped?.name ?? ""));
    const color =
      (patch.color !== undefined ? normalizeLabelHex(patch.color) : null) ??
      normalizeLabelHex(rec?.color ?? "") ??
      shipped?.color ??
      null;
    // An unnamed or uncolored edit is a refusal, not a wipe.
    if (!name || !color) return rec ?? null;
    const archived = rec?.archived === true;
    if (shipped && name === shipped.name && color === shipped.color && !archived) return null;
    const next: StoredLabel = { id, name, color };
    if (archived) next.archived = true;
    if (rec?.created !== undefined) next.created = rec.created;
    return next;
  });
}

/** Archive, or bring back.

    THE RULE: archiving touches the book and never the entries. The
    label stops being offered for new entries; every entry already
    wearing it keeps its name and its hue, because an archived label
    still resolves. That is the difference between retiring a word from
    your vocabulary and going back through the diary to cross it out. */
export function setLabelArchived(book: LabelBook, id: string, archived: boolean): LabelBook {
  const shipped = ENTRY_LABELS.find((l) => l.id === id);
  return withLabelRecord(book, id, (rec) => {
    if (!rec && !shipped) return null;
    if (archived) return { ...(rec ?? { id }), id, archived: true };
    if (!rec) return null;
    // Un-archiving a built-in whose record existed only to archive it
    // leaves no record at all, which is the un-edited state.
    const next: StoredLabel = { id };
    if (rec.name) next.name = rec.name;
    if (rec.color) next.color = rec.color;
    if (rec.created !== undefined) next.created = rec.created;
    if (!next.name && !next.color) return null;
    return next;
  });
}

/** Put a built-in back the way it shipped — name, color, unarchived. A
    no-op on a label of the writer's own, which has no default to
    return to and would just vanish. */
export function resetLabel(book: LabelBook, id: string): LabelBook {
  if (!isBuiltinLabelId(id)) return book;
  return { v: 1, labels: book.labels.filter((r) => r.id !== id) };
}

/** Delete a label of the writer's own.

    Built-in ids are compiled into the app, so "deleting" one would only
    have it reappear on the next launch — an archive that lies about
    itself. The manager offers Archive there instead, and this refuses.

    Deleting does not by itself clean up the entries; see
    clearLabelFrom, which the store always runs in the same breath. */
export function deleteLabel(book: LabelBook, id: string): LabelBook {
  if (isBuiltinLabelId(id)) return book;
  if (!book.labels.some((r) => r.id === id)) return book;
  return { v: 1, labels: book.labels.filter((r) => r.id !== id) };
}

/** Take one label off every entry wearing it. Returns the SAME array
    when nothing did, so a caller can skip a write and a repaint. */
export function clearLabelFrom(entries: CalendarEntry[], id: string): CalendarEntry[] {
  if (!entries.some((e) => e.label === id)) return entries;
  return entries.map((e) => {
    if (e.label !== id) return e;
    const next: CalendarEntry = { ...e };
    delete next.label;
    return next;
  });
}

/** How many entries wear this label. The number the manager shows
    before it lets anybody delete anything. */
export function countLabelUse(entries: CalendarEntry[], id: string): number {
  return entries.filter((e) => e.label === id).length;
}

/** The backstop for an id nothing can resolve — a book hand-edited in
    devtools, or a label deleted in another tab while this one held
    stale entries. Such an entry already renders as unlabeled; this
    makes the storage agree with the screen, so the ghost can't come
    back to life if that id is ever reused. */
export function pruneMissingLabels(
  entries: CalendarEntry[],
  labels: EntryLabel[],
): CalendarEntry[] {
  const known = new Set(labels.map((l) => l.id));
  if (!entries.some((e) => e.label !== undefined && !known.has(e.label))) return entries;
  return entries.map((e) => {
    if (e.label === undefined || known.has(e.label)) return e;
    const next: CalendarEntry = { ...e };
    delete next.label;
    return next;
  });
}

/** localStorage is hand-editable and outlives app versions, so what
    comes back out of it is a stranger until proven otherwise. */
export function sanitizeLabelBook(raw: unknown): LabelBook {
  const rows = raw && typeof raw === "object" ? (raw as { labels?: unknown }).labels : null;
  if (!Array.isArray(rows)) return emptyLabelBook();

  const seen = new Set<string>();
  const out: StoredLabel[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r["id"] === "string" ? r["id"] : "";
    if (!id || seen.has(id)) continue;

    const name = typeof r["name"] === "string" ? r["name"].trim().slice(0, LABEL_NAME_MAX) : "";
    const color = typeof r["color"] === "string" ? normalizeLabelHex(r["color"]) : null;
    const builtin = isBuiltinLabelId(id);
    if (!builtin && (!name || !color)) continue;

    const rec: StoredLabel = { id };
    if (name) rec.name = name;
    if (color) rec.color = color;
    if (r["archived"] === true) rec.archived = true;
    rec.created = typeof r["created"] === "number" ? r["created"] : 0;
    // A built-in record that patches nothing is noise.
    if (builtin && !rec.name && !rec.color && !rec.archived) continue;

    seen.add(id);
    out.push(rec);
  }
  return { v: 1, labels: out };
}

/* ---------- resolving one entry's label (pure over a list) ---------- */

export function findLabel<T extends EntryLabel>(labels: T[], id: string | undefined): T | undefined {
  if (!id) return undefined;
  return labels.find((l) => l.id === id);
}

export function labelColor(labels: EntryLabel[], id: string | undefined): string | null {
  return findLabel(labels, id)?.color ?? null;
}

/* The four callers below take no label list. They read the writer's
   live book instead, so a rename or a recolor repaints the grid, the
   dots and the day panel without anything threading a palette through
   six components. The list-taking versions above are what the tests
   drive. */

export function labelById(id: string | undefined): ResolvedLabel | undefined {
  return findLabel(currentLabels(), id);
}

export function entryColor(entry: CalendarEntry): string | null {
  return labelColor(currentLabels(), entry.label);
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
export function tintOf(labels: EntryLabel[], entries: CalendarEntry[]): string | null {
  for (const e of sortEntries(entries)) {
    const color = labelColor(labels, e.label);
    if (color) return color;
  }
  return null;
}

/** Up to `max` distinct dots for a day. `null` stands for an unlabeled
    entry — the caller paints those in the theme's accent, so "has
    something planned" reads even with no labels in use at all. */
export function dotsOf(labels: EntryLabel[], entries: CalendarEntry[], max = 3): (string | null)[] {
  const seen: (string | null)[] = [];
  for (const e of sortEntries(entries)) {
    const color = labelColor(labels, e.label);
    if (!seen.some((s) => s === color)) seen.push(color);
    if (seen.length >= max) break;
  }
  return seen;
}

export function dayTint(entries: CalendarEntry[]): string | null {
  return tintOf(currentLabels(), entries);
}

export function dayDots(entries: CalendarEntry[], max = 3): (string | null)[] {
  return dotsOf(currentLabels(), entries, max);
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
const LABELS_KEY = "novella.calendarLabels";

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
  const loaded = readEntries().entries;
  // One sweep for label ids nothing resolves, so an entry can never be
  // left pointing at a label that isn't there. Returns the same array
  // when there's nothing to fix, which is the ordinary case.
  entries = pruneMissingLabels(loaded, currentLabels());
  if (entries !== loaded) writeEntries({ v: 1, entries, migrated: true });
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
   Storage — the label book

   Its own key beside the entries rather than inside them. Labels are
   the writer's vocabulary and entries are their diary: a corrupt diary
   shouldn't cost them the vocabulary, and a book we fail to parse
   shouldn't take a year of planning with it.
   ============================================================ */

let labelBook: LabelBook = emptyLabelBook();
let resolvedLabels: ResolvedLabel[] = resolveLabels(labelBook);
let labelsReady = false;

function ensureLabels(): void {
  if (labelsReady) return;
  labelsReady = true;
  try {
    const raw = localStorage.getItem(LABELS_KEY);
    labelBook = raw ? sanitizeLabelBook(JSON.parse(raw)) : emptyLabelBook();
  } catch {
    /* No key yet, bad JSON, or no localStorage at all (a unit test in
       Node): the six shipped labels are a perfectly good place to be. */
    labelBook = emptyLabelBook();
  }
  resolvedLabels = resolveLabels(labelBook);
}

/** The labels as everything on screen sees them, archived included.
    Resolved once per write rather than per render — the month grid
    asks 42 times a paint. */
export function currentLabels(): ResolvedLabel[] {
  ensureLabels();
  return resolvedLabels;
}

function persistLabels(next: LabelBook): void {
  labelBook = next;
  resolvedLabels = resolveLabels(next);
  try {
    localStorage.setItem(LABELS_KEY, JSON.stringify(next));
  } catch {
    /* Same bargain as everything else on this tab: best effort. */
  }
  emit();
}

export const labelStore = {
  /** Everything, archived included — what RENDERS. */
  all(): ResolvedLabel[] {
    return currentLabels();
  },

  /** What the picker offers for a new entry. */
  offered(): ResolvedLabel[] {
    return offeredLabels(currentLabels());
  },

  byId(id: string | undefined): ResolvedLabel | undefined {
    return findLabel(currentLabels(), id);
  },

  useCount(id: string): number {
    ensureLoaded();
    return countLabelUse(entries, id);
  },

  /** Returns the new label, or null when the book refused it (the cap,
      or a name and color that never made it past validateLabel). */
  add(name: string, color: string): ResolvedLabel | null {
    ensureLabels();
    const id = makeLabelId();
    const next = addLabel(labelBook, { name, color }, id);
    if (next === labelBook) return null;
    persistLabels(next);
    return findLabel(resolvedLabels, id) ?? null;
  },

  edit(id: string, patch: { name?: string; color?: string }): void {
    ensureLabels();
    persistLabels(editLabel(labelBook, id, patch));
  },

  archive(id: string): void {
    ensureLabels();
    persistLabels(setLabelArchived(labelBook, id, true));
  },

  restore(id: string): void {
    ensureLabels();
    persistLabels(setLabelArchived(labelBook, id, false));
  },

  reset(id: string): void {
    ensureLabels();
    persistLabels(resetLabel(labelBook, id));
  },

  /** Delete a label of the writer's own AND take it off every entry
      that wore it, in one step. The two halves are never apart: an
      entry pointing at a label that no longer exists is precisely the
      state this feature is not allowed to create. */
  remove(id: string): void {
    ensureLabels();
    ensureLoaded();
    const next = deleteLabel(labelBook, id);
    if (next === labelBook) return;
    const cleared = clearLabelFrom(entries, id);
    if (cleared !== entries) {
      entries = cleared;
      writeEntries({ v: 1, entries, migrated: true });
    }
    persistLabels(next);
  },

  /** Take a label off every entry without retiring the label itself —
      the way back for a writer who color-coded a month by mistake. */
  unlabelAll(id: string): void {
    ensureLoaded();
    const cleared = clearLabelFrom(entries, id);
    if (cleared === entries) return;
    entries = cleared;
    persist();
  },
};

/** Labels ride the entries' version counter: a rename has to repaint
    the grid, the dots and the day panel, and all three read that. */
export function useCalendarLabels(): number {
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
