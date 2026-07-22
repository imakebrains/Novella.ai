import { useSyncExternalStore } from "react";
import { store } from "./vaultStore";

/* ============================================================
   Writing sessions, goals and streaks

   Every review of every competitor names the same beloved feature:
   a daily word goal, a visible streak, and a count of words written
   today. It is motivational, not analytical — the number going up is
   the point.

   What counts is NET words added to the manuscript, measured against
   a baseline taken when the day's first edit lands. Net, not gross,
   so a day spent cutting 2,000 words of flab isn't punished as zero
   progress — deletion is work too, and a tool that only rewards
   padding is training the wrong habit. The number is allowed to go
   negative on a heavy editing day, and that's honest.

   History is a map of day -> words, kept locally. Losing it loses a
   streak, never a manuscript, so it lives in local storage like the
   rest of the app's preferences.
   ============================================================ */

export interface DayRecord {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  /** Net words added that day. May be negative on an editing day. */
  words: number;
  /** Manuscript word count at the day's first recorded edit. */
  baseline: number;
}

interface SessionState {
  days: Record<string, DayRecord>;
  /** Best streak ever reached, so a broken streak still leaves a record
      of the peak to beat. */
  bestStreak: number;
}

const KEY = "novella.sessions";

/** Local calendar day. Deliberately not UTC — a writer's "today" is their
    day, and a midnight-UTC rollover would reset the counter mid-evening
    for anyone west of London. */
export function dayKey(at = new Date()): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, "0");
  const d = String(at.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function read(): SessionState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SessionState>;
      return { days: parsed.days ?? {}, bestStreak: parsed.bestStreak ?? 0 };
    }
  } catch {
    /* fall through to empty */
  }
  return { days: {}, bestStreak: 0 };
}

let state: SessionState = read();
const listeners = new Set<() => void>();
let version = 0;

function persist(): void {
  version++;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // History is a nice-to-have; never let it interfere with writing.
  }
  for (const l of listeners) l();
}

/** Total words across every chapter and scene — the manuscript, not the
    codex. Matches what the titlebar counts. */
export function manuscriptWordCount(): number {
  let total = 0;
  for (const note of [...store.vault.byType("chapter"), ...store.vault.byType("scene")]) {
    const t = note.body.trim();
    if (t) total += t.split(/\s+/).length;
  }
  return total;
}

/** Record where the manuscript stands now, attributing any change to today.

    Idempotent within a day: the baseline is set once, on the first call of
    the day, and every later call just updates the delta from it. Called on
    a light debounce while editing. */
export function recordProgress(count = manuscriptWordCount()): void {
  const key = dayKey();
  const existing = state.days[key];

  if (!existing) {
    // First edit today. Baseline is where we start; words begins at 0.
    // A brand-new day inherits no words — only growth from here counts.
    state.days = { ...state.days, [key]: { day: key, words: 0, baseline: count } };
  } else {
    const words = count - existing.baseline;
    if (words === existing.words) return; // nothing changed
    state.days = { ...state.days, [key]: { ...existing, words } };
  }

  const streak = currentStreak();
  if (streak > state.bestStreak) state.bestStreak = streak;
  persist();
}

/** Re-anchor today's baseline to the current manuscript size WITHOUT
    crediting the change as writing.

    Loading the seed world, opening a project, or importing a manuscript all
    change the word count by thousands in an instant — but nobody typed those
    words today, and counting them would hand out a fake streak. This is
    called whenever the whole vault is swapped. Any words genuinely typed
    earlier today are banked and preserved across the swap. */
export function rebaseline(count = manuscriptWordCount()): void {
  const key = dayKey();
  const banked = state.days[key]?.words ?? 0;
  state.days = { ...state.days, [key]: { day: key, words: banked, baseline: count - banked } };
  persist();
}

/** Words written today (net). */
export function wordsToday(): number {
  return state.days[dayKey()]?.words ?? 0;
}

/** Net words recorded on any calendar day, zero when nothing was. The
    calendar reads this for any month, not just a recent window. */
export function wordsOn(day: string): number {
  return state.days[day]?.words ?? 0;
}

/** A day counts toward a streak if net words met the goal. With no goal
    set, any positive progress counts — the streak still means "I wrote". */
function dayMetGoal(record: DayRecord | undefined, goal: number): boolean {
  if (!record) return false;
  return goal > 0 ? record.words >= goal : record.words > 0;
}

/** Consecutive days up to today (or yesterday) meeting the goal.

    Today not yet met does NOT break the streak — the day isn't over. It
    only breaks once a whole day passes with the goal unmet.

    Pure over its inputs (`days`, `goal`, `now`) so the date-walking, which
    is the easy thing to get wrong, can be tested without faking a clock. */
export function computeStreak(
  days: Record<string, DayRecord>,
  goal: number,
  now = new Date(),
): number {
  let streak = 0;
  const cursor = new Date(now);

  // If today isn't met yet, start counting from yesterday so an unfinished
  // today doesn't read as a broken streak.
  if (!dayMetGoal(days[dayKey(cursor)], goal)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  for (;;) {
    if (dayMetGoal(days[dayKey(cursor)], goal)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export function currentStreak(goal = 0): number {
  return computeStreak(state.days, goal);
}

export function bestStreak(): number {
  return state.bestStreak;
}

/** The last `n` days, oldest first, for a sparkline. Missing days are zero. */
export function recentDays(n = 30): DayRecord[] {
  const out: DayRecord[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - (n - 1));
  for (let i = 0; i < n; i++) {
    const key = dayKey(cursor);
    out.push(state.days[key] ?? { day: key, words: 0, baseline: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Wipe history. Behind an explicit confirm in the UI. */
export function resetSessions(): void {
  state = { days: {}, bestStreak: 0 };
  persist();
}

export function subscribeSessions(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function sessionsVersion(): number {
  return version;
}

export function useSessions(): number {
  return useSyncExternalStore(subscribeSessions, sessionsVersion, sessionsVersion);
}

/* Swapping the whole vault (seed, open folder, import) is a load, not a
   writing session — re-anchor so those words aren't counted as today's. */
store.onVaultReplaced(() => rebaseline());
