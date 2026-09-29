/* ============================================================
   Settings that are really records, merged one level down

   mergeSettings() in prefs.ts decides a key at a time, and for a theme
   that is exactly right. For the tracking keys it is not. Every launch
   rewrites some of them before the first pull can finish: opening a
   book calls sessions.ts rebaseline(), the calendar folds old planner
   intents in on first read. So nearly every sync sees "changed on both
   sides" for novella.sessions, and a whole-value pick would hand this
   device's copy the win and erase the other machine's writing history.

   These mergers apply mergeSettings's own rule one level down — per day,
   per entry, per sprint — the way mergers.ts does for .novella files in
   the book sync. Each one checks the shape it expects and returns null
   on anything else, so a blob reshaped by a later version falls back to
   the whole-value pick instead of being rebuilt without its new fields.

   PURE. Imports only ./prefs, so test-settingssync.ts runs it in Node.
   ============================================================ */

import { mergeSettings, type SettingsDoc } from "./prefs";

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parse(raw: string | undefined): unknown {
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** PURE. Three-way merge of id-keyed records, mergeSettings's rule per
    record: changed on one side takes that side, changed on both takes
    mine, deleted on one side and untouched on the other stays deleted.
    With an empty base it is a union where mine wins a clash. */
export function threeWayRecords<T>(base: Record<string, T>, mine: Record<string, T>, theirs: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  const ids = new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)]);
  const same = (a: T | undefined, b: T | undefined) => JSON.stringify(a) === JSON.stringify(b);
  for (const id of ids) {
    const b = base[id];
    const m = mine[id];
    const t = theirs[id];
    const value = !same(m, b) ? m : !same(t, b) ? t : b;
    if (value !== undefined) out[id] = value;
  }
  return out;
}

/** base is undefined on a first sync; returns null when any side isn't
    the shape this merger knows, and the caller keeps the whole-value pick. */
export type ValueMerger = (base: string | undefined, mine: string, theirs: string) => string | null;

/* ---- novella.sessions: { days: { [day]: DayRecord }, bestStreak } ---- */

function sessionsShape(v: unknown): { days: Obj; bestStreak: number; rest: Obj } | null {
  if (!isObj(v) || !isObj(v.days)) return null;
  for (const rec of Object.values(v.days)) if (!isObj(rec) || typeof rec.words !== "number") return null;
  const best = v.bestStreak === undefined ? 0 : v.bestStreak;
  if (typeof best !== "number") return null;
  return { days: v.days, bestStreak: best, rest: v };
}

const mergeSessions: ValueMerger = (base, mine, theirs) => {
  const m = sessionsShape(parse(mine));
  const t = sessionsShape(parse(theirs));
  const parsedBase = parse(base);
  const b = parsedBase === undefined ? { days: {} } : sessionsShape(parsedBase);
  if (!m || !t || !b) return null;
  return JSON.stringify({
    ...m.rest,
    days: threeWayRecords(b.days, m.days, t.days),
    bestStreak: Math.max(m.bestStreak, t.bestStreak),
  });
};

/* ---- novella.calendar: { v, entries: [{ id, … }], migrated } ---- */

function byId(list: unknown, extra?: (rec: Obj) => boolean): Record<string, Obj> | null {
  if (!Array.isArray(list)) return null;
  const out: Record<string, Obj> = {};
  for (const rec of list) {
    if (!isObj(rec) || typeof rec.id !== "string" || (extra && !extra(rec))) return null;
    out[rec.id] = rec;
  }
  return out;
}

/** Mine's order for what it kept, then whatever arrived from theirs. */
function inOrder(merged: Record<string, Obj>, mine: Record<string, Obj>, theirs: Record<string, Obj>): Obj[] {
  const ids = [...Object.keys(mine), ...Object.keys(theirs).filter((id) => !(id in mine))];
  return ids.filter((id) => id in merged).map((id) => merged[id]!);
}

const mergeCalendar: ValueMerger = (base, mine, theirs) => {
  const mo = parse(mine);
  const to = parse(theirs);
  const bo = parse(base);
  if (!isObj(mo) || !isObj(to) || mo.v !== to.v) return null;
  const m = byId(mo.entries);
  const t = byId(to.entries);
  const b = bo === undefined ? {} : isObj(bo) ? byId(bo.entries) : null;
  if (!m || !t || !b) return null;
  const merged = threeWayRecords(b, m, t);
  return JSON.stringify({
    ...mo,
    entries: inOrder(merged, m, t),
    ...(mo.migrated || to.migrated ? { migrated: true } : {}),
  });
};

/* ---- novella.planner: { [day]: text } ---- */

function stringRecord(v: unknown): Record<string, string> | null {
  if (!isObj(v)) return null;
  for (const x of Object.values(v)) if (typeof x !== "string") return null;
  return v as Record<string, string>;
}

const mergePlanner: ValueMerger = (base, mine, theirs) => {
  const m = stringRecord(parse(mine));
  const t = stringRecord(parse(theirs));
  const parsedBase = parse(base);
  const b = parsedBase === undefined ? {} : stringRecord(parsedBase);
  if (!m || !t || !b) return null;
  return JSON.stringify(threeWayRecords(b, m, t));
};

/* ---- novella.sprints: { history: [{ id, startedAt, … }], active } ----
   The cap mirrors HISTORY_LIMIT in src/state/sprints.ts, which is on the
   owner's unpushed list — re-check this shape when that merges. */

export const SPRINT_HISTORY_LIMIT = 50;

const mergeSprints: ValueMerger = (base, mine, theirs) => {
  const mo = parse(mine);
  const to = parse(theirs);
  const bo = parse(base);
  const sprint = (rec: Obj) => typeof rec.startedAt === "number";
  if (!isObj(mo) || !isObj(to)) return null;
  const m = byId(mo.history, sprint);
  const t = byId(to.history, sprint);
  const b = bo === undefined ? {} : isObj(bo) ? byId(bo.history, sprint) : null;
  if (!m || !t || !b) return null;
  const history = Object.values(threeWayRecords(b, m, t))
    .sort((x, y) => (y.startedAt as number) - (x.startedAt as number))
    .slice(0, SPRINT_HISTORY_LIMIT);
  // A running sprint belongs to the machine it was started on.
  return JSON.stringify({ ...mo, history, active: mo.active ?? null });
};

export const VALUE_MERGERS: Record<string, ValueMerger> = {
  "novella.sessions": mergeSessions,
  "novella.calendar": mergeCalendar,
  "novella.planner": mergePlanner,
  "novella.sprints": mergeSprints,
};

/** PURE. mergeSettings, then the record-level mergers for any key both
    sides changed differently. */
export function mergeSettingsDeep(base: SettingsDoc, mine: SettingsDoc, theirs: SettingsDoc): SettingsDoc {
  const out = mergeSettings(base, mine, theirs);
  for (const [key, merger] of Object.entries(VALUE_MERGERS)) {
    const m = mine[key];
    const t = theirs[key];
    if (m === undefined || t === undefined || m === t || m === base[key] || t === base[key]) continue;
    out[key] = merger(base[key], m, t) ?? out[key]!;
  }
  return out;
}
