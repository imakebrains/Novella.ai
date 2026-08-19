/* ============================================================
   Subscribed calendars, by ICS URL

   Google, Apple and Outlook all publish a calendar as an .ics file
   at a public or secret URL. That URL is the whole credential — no
   OAuth app, no client secret, no consent screen, nothing the owner
   has to register anywhere. So that is the integration this app
   ships: paste the URL, we read it, we show it read-only.

   HONESTLY, WHAT THIS IS NOT: two-way Google sync. Creating or
   editing events in the writer's Google account needs the Calendar
   API, which needs an OAuth client id and secret registered to the
   owner's Google Cloud project, plus a consent screen review for a
   distributed desktop app. None of that exists, so none of it is
   pretended at. Nothing in this file talks to Google's API; it reads
   a text file over HTTP and parses it.

   Everything above the NETWORK EDGE divider is pure and covered by
   test-calendar.ts. This file deliberately imports nothing — a
   parser that drags a store, a clock or the DOM in behind it stops
   being testable, and ICS is exactly the kind of format where the
   edge cases only surface under test.
   ============================================================ */

export interface IcsRule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  count?: number;
  /** Inclusive last day, YYYY-MM-DD. */
  until?: string;
}

export interface IcsEvent {
  uid: string;
  summary: string;
  /** Local calendar day of the start, YYYY-MM-DD. */
  day: string;
  /** "HH:MM" wall time, absent on an all-day event. */
  time?: string;
  endDay?: string;
  endTime?: string;
  allDay: boolean;
  /** A trivial repeat we can walk forward ourselves. */
  rule?: IcsRule;
  /** The event repeats in a way this parser will not guess at (BYDAY,
      BYSETPOS, exceptions…). We show the first occurrence and say so,
      rather than inventing dates that aren't in the real calendar. */
  recurrenceSkipped?: boolean;
}

export interface IcsOccurrence {
  uid: string;
  summary: string;
  day: string;
  time?: string;
  allDay: boolean;
  recurrenceSkipped?: boolean;
}

export interface IcsCalendar {
  /** X-WR-CALNAME when the publisher set one — the name the writer
      recognises ("Work", "Family") rather than a URL. */
  name: string | null;
  events: IcsEvent[];
}

/* ---------- URL shapes ---------- */

/** webcal: is a Windows/Apple convention for "subscribe to this", not a
    real scheme — the bytes are served over https. Swapping it is the
    difference between a pasted Apple/Outlook link working and failing. */
export function normalizeFeedUrl(raw: string): string {
  const url = raw.trim();
  if (/^webcal:\/\//i.test(url)) return url.replace(/^webcal:\/\//i, "https://");
  return url;
}

/** A short name for a feed we couldn't get X-WR-CALNAME from. */
export function feedNameFromUrl(raw: string): string {
  try {
    return new URL(normalizeFeedUrl(raw)).hostname.replace(/^www\./, "");
  } catch {
    return "Subscribed calendar";
  }
}

/* ---------- line grammar (RFC 5545 §3.1) ---------- */

/** ICS wraps long lines at 75 octets and continues them with a leading
    space or tab. Unfold before anything else or a long SUMMARY arrives
    chopped in half. Line endings are CRLF by spec and LF in the wild. */
export function unfoldLines(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    const folded = raw.startsWith(" ") || raw.startsWith("\t");
    const last = out.length - 1;
    const prev = out[last];
    if (folded && prev !== undefined) out[last] = prev + raw.slice(1);
    else if (!folded && raw.length > 0) out.push(raw);
  }
  return out;
}

export interface IcsLine {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Split "DTSTART;TZID=Europe/Oslo:20260819T090000" into its three parts.
    The first colon ends the name+params — later colons are value text. */
export function splitLine(line: string): IcsLine | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = head.split(";");
  const name = (parts[0] ?? "").trim().toUpperCase();
  if (!name) return null;
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name, params, value };
}

/** TEXT values escape comma, semicolon, backslash and newline. */
export function unescapeText(v: string): string {
  return v.replace(/\\([nN;,\\])/g, (_, ch: string) =>
    ch === "n" || ch === "N" ? "\n" : ch,
  );
}

/* ---------- dates ---------- */

export interface IcsMoment {
  day: string;
  time?: string;
  allDay: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const asDay = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Parse a DATE ("20260819") or DATE-TIME ("20260819T090000", optionally
    with a trailing Z for UTC).

    A trailing Z is converted to the writer's local time, because the
    calendar grid is their local days. A TZID parameter is NOT honoured:
    resolving "Europe/Oslo" to an offset needs a timezone database this
    app doesn't carry, so the wall time is taken as written. For a feed
    published in the writer's own zone — overwhelmingly the common case —
    that is exactly right; for a foreign zone it is off by the offset,
    which is why the UI marks subscribed events as the feed's word, not
    ours. Returns null on anything malformed rather than guessing. */
export function parseIcsDateValue(value: string): IcsMoment | null {
  const v = value.trim();

  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly) {
    const y = Number(dateOnly[1]);
    const m = Number(dateOnly[2]);
    const d = Number(dateOnly[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return { day: asDay(y, m, d), allDay: true };
  }

  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!dateTime) return null;
  const y = Number(dateTime[1]);
  const mo = Number(dateTime[2]);
  const d = Number(dateTime[3]);
  const h = Number(dateTime[4]);
  const mi = Number(dateTime[5]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;

  if (dateTime[7]) {
    const local = new Date(Date.UTC(y, mo - 1, d, h, mi, Number(dateTime[6] ?? 0)));
    return {
      day: asDay(local.getFullYear(), local.getMonth() + 1, local.getDate()),
      time: `${pad(local.getHours())}:${pad(local.getMinutes())}`,
      allDay: false,
    };
  }
  return { day: asDay(y, mo, d), time: `${pad(h)}:${pad(mi)}`, allDay: false };
}

/* ---------- recurrence ---------- */

/** Parts that make a rule more than we will honestly reproduce. */
const HARD_RRULE_PARTS = [
  "BYDAY", "BYMONTH", "BYMONTHDAY", "BYYEARDAY", "BYWEEKNO",
  "BYSETPOS", "BYHOUR", "BYMINUTE", "BYSECOND",
];

/** Read an RRULE, or return null when it is beyond us.

    "Trivial" means: repeat every N days/weeks/months/years from the start
    date, optionally bounded by COUNT or UNTIL. The moment a rule reaches
    for BYDAY ("every Mon/Wed/Fri") or BYSETPOS ("last Friday") we hand
    back null, and the caller shows the first occurrence flagged instead
    of scattering wrong dates across the writer's month. */
export function parseRRule(value: string): IcsRule | null {
  const parts: Record<string, string> = {};
  for (const chunk of value.split(";")) {
    const eq = chunk.indexOf("=");
    if (eq > 0) parts[chunk.slice(0, eq).trim().toUpperCase()] = chunk.slice(eq + 1).trim();
  }
  for (const hard of HARD_RRULE_PARTS) if (parts[hard]) return null;

  const freq = (parts.FREQ ?? "").toUpperCase();
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") return null;

  const interval = parts.INTERVAL ? Number.parseInt(parts.INTERVAL, 10) : 1;
  if (!Number.isFinite(interval) || interval < 1) return null;

  const rule: IcsRule = { freq, interval };

  if (parts.COUNT) {
    const count = Number.parseInt(parts.COUNT, 10);
    if (!Number.isFinite(count) || count < 1) return null;
    rule.count = count;
  }
  if (parts.UNTIL) {
    const until = parseIcsDateValue(parts.UNTIL);
    if (!until) return null;
    rule.until = until.day;
  }
  return rule;
}

/* ---------- the parse ---------- */

/** Pull VEVENTs out of an ICS document.

    Anything that isn't DTSTART / DTEND / SUMMARY / UID / RRULE is
    ignored on purpose: attendees, alarms, attachments and free/busy
    have no place on a writer's month grid, and half-reading them would
    only invite the question of why they don't work. */
export function parseIcs(text: string): IcsCalendar {
  const events: IcsEvent[] = [];
  let name: string | null = null;

  let inEvent = false;
  let current: Partial<IcsEvent> & { start?: IcsMoment; end?: IcsMoment } = {};
  let fallbackUid = 0;

  for (const raw of unfoldLines(text)) {
    const line = splitLine(raw);
    if (!line) continue;

    if (line.name === "BEGIN" && line.value.toUpperCase() === "VEVENT") {
      inEvent = true;
      current = {};
      continue;
    }

    if (line.name === "END" && line.value.toUpperCase() === "VEVENT") {
      const start = current.start;
      // No start, no place on a calendar. Drop it rather than pick a day.
      if (inEvent && start) {
        const event: IcsEvent = {
          uid: current.uid ?? `ics-${++fallbackUid}`,
          summary: current.summary?.trim() || "(untitled event)",
          day: start.day,
          allDay: start.allDay,
        };
        if (start.time) event.time = start.time;
        if (current.end) {
          event.endDay = current.end.day;
          if (current.end.time) event.endTime = current.end.time;
        }
        if (current.rule) event.rule = current.rule;
        if (current.recurrenceSkipped) event.recurrenceSkipped = true;
        events.push(event);
      }
      inEvent = false;
      current = {};
      continue;
    }

    if (!inEvent) {
      if (line.name === "X-WR-CALNAME") name = unescapeText(line.value).trim() || null;
      continue;
    }

    switch (line.name) {
      case "UID":
        current.uid = line.value.trim();
        break;
      case "SUMMARY":
        current.summary = unescapeText(line.value);
        break;
      case "DTSTART": {
        const m = parseIcsDateValue(line.value);
        if (m) current.start = m;
        break;
      }
      case "DTEND": {
        const m = parseIcsDateValue(line.value);
        if (m) current.end = m;
        break;
      }
      case "RRULE": {
        const rule = parseRRule(line.value);
        if (rule) current.rule = rule;
        else current.recurrenceSkipped = true;
        break;
      }
      // RECURRENCE-ID means "this one instance was moved" — a rewrite of
      // a repeat we may not even be expanding. Refusing the whole rule is
      // the only answer that can't be silently wrong.
      case "RECURRENCE-ID":
      case "EXDATE":
        current.recurrenceSkipped = true;
        current.rule = undefined;
        break;
    }
  }

  return { name, events };
}

/* ---------- expansion over a window ---------- */

function dayToParts(day: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Walking days through a Date pinned at noon means a DST jump can never
    push a date onto the wrong side of midnight. */
function shiftDays(day: string, n: number): string {
  const parts = dayToParts(day);
  if (!parts) return day;
  const d = new Date(parts[0], parts[1] - 1, parts[2], 12);
  d.setDate(d.getDate() + n);
  return asDay(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/* A daily event running since 2010 needs thousands of steps just to reach
   this month, so the guard is generous — the work is integer arithmetic,
   and the point is only that a malformed feed can't spin forever. */
const MAX_STEPS = 10_000;

/**
 * Every occurrence of every event falling in [fromDay, toDay] inclusive.
 *
 * Pure over its inputs: the window is passed in, never read off a clock,
 * so a month's worth of expansion is testable without faking today.
 */
export function expandOccurrences(
  events: IcsEvent[],
  fromDay: string,
  toDay: string,
): IcsOccurrence[] {
  const out: IcsOccurrence[] = [];

  for (const event of events) {
    const emit = (day: string) => {
      const occ: IcsOccurrence = {
        uid: event.uid,
        summary: event.summary,
        day,
        allDay: event.allDay,
      };
      if (event.time) occ.time = event.time;
      if (event.recurrenceSkipped) occ.recurrenceSkipped = true;
      out.push(occ);
    };

    if (!event.rule) {
      if (event.day >= fromDay && event.day <= toDay) emit(event.day);
      continue;
    }

    const rule = event.rule;
    const parts = dayToParts(event.day);
    if (!parts) continue;
    const [y0, m0, d0] = parts;

    let emitted = 0;
    for (let step = 0; step < MAX_STEPS; step++) {
      if (rule.count !== undefined && emitted >= rule.count) break;

      let day: string;
      if (rule.freq === "DAILY") {
        day = shiftDays(event.day, step * rule.interval);
      } else if (rule.freq === "WEEKLY") {
        day = shiftDays(event.day, step * rule.interval * 7);
      } else {
        // Month/year steps can land on a date that doesn't exist (the 31st
        // of a 30-day month, Feb 29 in a common year). RFC 5545 skips those
        // rather than sliding them, and a skipped date isn't an occurrence,
        // so it doesn't count toward COUNT either.
        const months = rule.freq === "MONTHLY" ? step * rule.interval : 0;
        const years = rule.freq === "YEARLY" ? step * rule.interval : 0;
        const probe = new Date(y0 + years, m0 - 1 + months, d0, 12);
        if (probe.getDate() !== d0) continue;
        day = asDay(probe.getFullYear(), probe.getMonth() + 1, probe.getDate());
      }

      if (rule.until && day > rule.until) break;
      if (day > toDay) break;
      emitted++;
      if (day >= fromDay) emit(day);
    }
  }

  return out;
}

/* ============================================================
   NETWORK EDGE — the one impure function in this file
   ============================================================ */

/** Fetch an ICS document. Throws with a message meant to be shown to the
    writer verbatim, because "failed to fetch" on its own tells them
    nothing about which of the three likely causes they hit.

    The awkward one is CORS: a browser or webview will refuse to hand us a
    response from a host that doesn't opt in, and several calendar
    providers don't. That refusal is indistinguishable from being offline
    at the JavaScript level, so the message names both, and the UI offers
    pasting the downloaded .ics file instead — which always works. */
export async function fetchIcs(url: string): Promise<string> {
  const target = normalizeFeedUrl(url);
  if (!/^https?:\/\//i.test(target)) {
    throw new Error("That doesn't look like a calendar address — it should start with https:// or webcal://");
  }

  let res: Response;
  try {
    res = await fetch(target, { headers: { Accept: "text/calendar, text/plain" } });
  } catch {
    throw new Error(
      "Couldn't reach that address. Either you're offline, or the calendar's host refuses cross-origin reads — download the .ics file and paste it below instead.",
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error("That calendar isn't public — use its secret ICS address, not the sharing page.");
  }
  if (res.status === 404) throw new Error("Nothing at that address (404). Check the link.");
  if (!res.ok) throw new Error(`The calendar's host answered ${res.status}.`);

  const text = await res.text();
  if (!/BEGIN:VCALENDAR/i.test(text)) {
    throw new Error("That address returned a web page, not a calendar file. Look for the link ending in .ics.");
  }
  return text;
}
