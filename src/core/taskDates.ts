/* ============================================================
   Task due dates

   A task is a Markdown checklist line (tasks.ts), so a due date has to
   be text inside that line — nothing else survives a trip through
   Obsidian, Notepad or git. The canonical spelling is Obsidian Tasks'
   own, `📅 2026-10-01`, so a vault opened in Obsidian with that plugin
   shows the same dates and nothing has to be converted either way.

   Also READ, because writers type them: `due:2026-10-01`,
   `due: 2026-10-01`, `@2026-10-01`. And typed-in-the-moment phrases —
   "due tomorrow", "due fri", "due oct 3", "due 10/3" — are turned into
   the canonical ISO form ON ENTRY (normalizeDueInput), because a file
   that says "due fri" means a different day every week.

   Pure date arithmetic on calendar days: no clock (today is passed in),
   no time zones (a due date is a day, not an instant), no store.
   ============================================================ */

export const DUE_MARK = "📅";

/** A calendar day, YYYY-MM-DD. */
export type Day = string;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** PURE. Is this a real calendar day? 2026-02-30 is not. */
export function isDay(value: string): boolean {
  const m = ISO.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function toDay(date: Date): Day {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function fromDay(day: Day): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

/** PURE. `day` shifted by `n` calendar days. */
export function addDays(day: Day, n: number): Day {
  const date = fromDay(day);
  date.setUTCDate(date.getUTCDate() + n);
  return toDay(date);
}

/** PURE. Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: Day, to: Day): number {
  return Math.round((fromDay(to).getTime() - fromDay(from).getTime()) / 86_400_000);
}

/** The local calendar day of a Date — for callers turning "now" into
    the `today` every function here takes. */
export function localDay(now: Date): Day {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/* Tokens already IN a task line. Each is a whole token: preceded by
   start or whitespace, followed by end or whitespace, so an email
   address or a version number is never read as a date. */
const TOKEN = /(^|\s)(?:📅\s*|due:\s*|@)(\d{4}-\d{2}-\d{2})(?=\s|$)/u;

export interface DueParse {
  /** The due day, or null when the line has none (or an impossible one). */
  due: Day | null;
  /** The task text with the date token removed, for display. */
  text: string;
}

/** PURE. The due date written in a task's text, if any. */
export function parseDue(text: string): DueParse {
  const m = TOKEN.exec(text);
  if (!m || !isDay(m[2]!)) return { due: null, text };
  const cut = m.index + m[1]!.length;
  const rest = (text.slice(0, cut) + text.slice(m.index + m[0].length)).replace(/\s{2,}/g, " ").trim();
  return { due: m[2]!, text: rest };
}

/** PURE. The task text with its due date set to `due` (or removed when
    null), always in the canonical spelling. Other tokens are untouched. */
export function withDue(text: string, due: Day | null): string {
  const base = parseDue(text).text;
  return due ? `${base} ${DUE_MARK} ${due}`.trim() : base;
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** PURE. A phrase a writer typed after "due" as a day, or null.

    Understands: today, tomorrow, yesterday; a weekday name (the NEXT
    one — "fri" on a Friday means a week away, since "due today" exists
    for today); "next week" (+7); "in 3 days" / "in 2 weeks"; "oct 3",
    "3 oct", "october 3rd"; "10/3" in month/day order; and ISO. A month
    and day already past this year roll to next year — nobody schedules
    a task for last March. */
export function resolveDuePhrase(phrase: string, today: Day): Day | null {
  const p = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  if (!p) return null;
  if (isDay(p)) return p;
  if (p === "today") return today;
  if (p === "tomorrow" || p === "tmrw") return addDays(today, 1);
  if (p === "yesterday") return addDays(today, -1);
  if (p === "next week") return addDays(today, 7);

  const rel = /^in (\d{1,3}) (day|days|week|weeks)$/.exec(p);
  if (rel) return addDays(today, Number(rel[1]) * (rel[2]!.startsWith("week") ? 7 : 1));

  // "fri", "friday", "thurs": any prefix of the full name, three letters up.
  const wd = p.length >= 3 ? WEEKDAYS.findIndex((w) => fullWeekday(w).startsWith(p)) : -1;
  if (wd >= 0) {
    const now = fromDay(today).getUTCDay();
    const ahead = ((wd - now + 7) % 7) || 7;
    return addDays(today, ahead);
  }

  const year = Number(today.slice(0, 4));
  const pick = (month: number, day: number): Day | null => {
    const candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!isDay(candidate)) {
      const next = `${year + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return isDay(next) ? next : null;
    }
    return candidate < today ? `${year + 1}${candidate.slice(4)}` : candidate;
  };

  const md = /^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?$/.exec(p) ?? null;
  const dm = /^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)\.?$/.exec(p) ?? null;
  const named = md ? { mon: md[1]!, day: Number(md[2]) } : dm ? { mon: dm[2]!, day: Number(dm[1]) } : null;
  if (named) {
    const month = MONTHS.findIndex((m) => named.mon.startsWith(m));
    if (month >= 0 && named.mon.length >= 3) return pick(month + 1, named.day);
    return null;
  }

  const slash = /^(\d{1,2})\/(\d{1,2})$/.exec(p);
  if (slash) return pick(Number(slash[1]), Number(slash[2]));

  return null;
}

function fullWeekday(short: string): string {
  return ({ sun: "sunday", mon: "monday", tue: "tuesday", wed: "wednesday", thu: "thursday", fri: "friday", sat: "saturday" } as Record<string, string>)[short]!;
}

/** PURE. Rewrite a trailing "due <phrase>" in freshly typed task text
    into the canonical token. Text with no recognisable phrase comes
    back unchanged — "due diligence" is not a date. */
export function normalizeDueInput(text: string, today: Day): string {
  const m = /(^|\s)due:?\s+(.+)$/i.exec(text);
  if (!m) return text;
  // The whole tail must be the date: "due fri" is a date, "due fri
  // after the edit" is a sentence that happens to contain one.
  const day = resolveDuePhrase(m[2]!, today);
  if (!day) return text;
  return withDue(text.slice(0, m.index + m[1]!.length).trimEnd(), day);
}

export type DueState = "overdue" | "today" | "soon" | "later";

/** PURE. How urgent a due day is. "Soon" is the next six days, the
    window a weekly planner looks at. */
export function dueState(due: Day, today: Day): DueState {
  const d = daysBetween(today, due);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 6) return "soon";
  return "later";
}

/** PURE. The short label a task row shows. Words for the near days,
    weekday names for this week, a date after that. */
export function dueLabel(due: Day, today: Day): string {
  const d = daysBetween(today, due);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  if (d < -1) return `${-d} days overdue`;
  const date = fromDay(due);
  if (d <= 6) return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getUTCDay()]!;
  const label = `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getUTCMonth()]} ${date.getUTCDate()}`;
  return due.slice(0, 4) === today.slice(0, 4) ? label : `${label}, ${due.slice(0, 4)}`;
}

/** PURE. Order for a task list: dated tasks first by day, undated after,
    each group keeping its original order. */
export function compareDue(a: Day | null, b: Day | null): number {
  if (a && b) return a < b ? -1 : a > b ? 1 : 0;
  if (a) return -1;
  if (b) return 1;
  return 0;
}
