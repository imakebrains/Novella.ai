/* Assertion tests for the calendar's pure logic.

   Same contract as test-units.ts: no output unless something is wrong,
   non-zero exit when it is. Everything here is a pure function over its
   arguments — the month grid, entry ordering, the ICS parser — so none
   of it needs a DOM, a clock, or a network. The store wrappers around
   these functions are verified in the browser instead. */

import {
  ENTRY_LABELS,
  addMonths,
  compareEntries,
  dateOf,
  dayDots,
  dayTint,
  entryColor,
  formatTime,
  groupByDay,
  isSameMonth,
  labelById,
  makeEntry,
  migrateIntents,
  monthAnchor,
  monthGrid,
  monthNames,
  normalizeTime,
  removeEntryFrom,
  sortEntries,
  upsertEntry,
  yearOptions,
  type CalendarEntry,
} from "./src/state/calendarEntries";
import {
  expandOccurrences,
  feedNameFromUrl,
  normalizeFeedUrl,
  parseIcs,
  parseIcsDateValue,
  parseRRule,
  splitLine,
  unescapeText,
  unfoldLines,
} from "./src/state/icsFeed";

let failures = 0;
let checks = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

function ok(name: string, condition: boolean): void {
  checks++;
  if (!condition) {
    failures++;
    console.error(`FAIL  ${name}`);
  }
}

const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* ---------- the month grid ---------- */

{
  const grid = monthGrid(new Date(2026, 7, 19, 12)); // August 2026
  check("grid: always 42 cells", grid.length, 42);
  check("grid: starts on a Monday", grid[0]!.getDay(), 1);
  check("grid: August 2026 starts Jul 27", key(grid[0]!), "2026-07-27");
  check("grid: August 2026 ends Sep 6", key(grid[41]!), "2026-09-06");
  ok("grid: contains the 1st", grid.some((d) => key(d) === "2026-08-01"));
  ok("grid: contains the 31st", grid.some((d) => key(d) === "2026-08-31"));

  // February 2026 starts on a Sunday — the worst case for a Monday-first
  // grid, where the leading row is a whole week of the previous month.
  const feb = monthGrid(new Date(2026, 1, 10, 12));
  check("grid: Feb 2026 starts Jan 26", key(feb[0]!), "2026-01-26");
  check("grid: Feb 2026 still 42 cells", feb.length, 42);

  // A month whose 1st IS a Monday must not grow a blank leading week.
  const jun = monthGrid(new Date(2026, 5, 15, 12));
  check("grid: Jun 2026 starts on the 1st", key(jun[0]!), "2026-06-01");
}

{
  // Stepping months from the 31st must not overflow into the month after.
  check("addMonths: Mar 31 + 1 is April", key(addMonths(new Date(2026, 2, 31, 12), 1)), "2026-04-01");
  check("addMonths: Jan 31 + 1 is February", key(addMonths(new Date(2026, 0, 31, 12), 1)), "2026-02-01");
  check("addMonths: December + 1 rolls the year", key(addMonths(new Date(2026, 11, 5, 12), 1)), "2027-01-01");
  check("addMonths: January - 1 rolls back", key(addMonths(new Date(2026, 0, 5, 12), -1)), "2025-12-01");
  check("addMonths: zero is a no-op month", key(addMonths(new Date(2026, 7, 19, 12), 0)), "2026-08-01");
  check("addMonths: +12 is a year", key(addMonths(new Date(2026, 7, 19, 12), 12)), "2027-08-01");
}

{
  check("monthAnchor: builds the 1st", key(monthAnchor(2030, 0)), "2030-01-01");
  ok("monthAnchor: sits at noon", monthAnchor(2030, 0).getHours() === 12);
  ok("isSameMonth: same", isSameMonth(new Date(2026, 7, 1, 12), new Date(2026, 7, 31, 12)));
  ok("isSameMonth: different year", !isSameMonth(new Date(2026, 7, 1, 12), new Date(2025, 7, 1, 12)));
}

{
  check("dateOf: round-trips a key", key(dateOf("2026-08-19")), "2026-08-19");
  ok("dateOf: pinned at noon", dateOf("2026-08-19").getHours() === 12);
  ok("dateOf: rejects nonsense", Number.isNaN(dateOf("nope").getTime()));
}

{
  const years = yearOptions(2026, 2, 3);
  check("yearOptions: window around the anchor", years, [2024, 2025, 2026, 2027, 2028, 2029]);
  check("yearOptions: default span is 41 years", yearOptions(2026).length, 41);
  check("yearOptions: default is centered", yearOptions(2026)[20], 2026);
}

{
  check("monthNames: twelve of them", monthNames().length, 12);
  ok("monthNames: does not depend on today", monthNames()[0] === monthNames()[0]);
}

/* ---------- times ---------- */

{
  check("time: bare hour", normalizeTime("9"), "09:00");
  check("time: packed", normalizeTime("930"), "09:30");
  check("time: packed four digits", normalizeTime("1230"), "12:30");
  check("time: colon form", normalizeTime("21:05"), "21:05");
  check("time: sloppy colon minutes", normalizeTime("9:5"), "09:05");
  check("time: pm", normalizeTime("9:30pm"), "21:30");
  check("time: pm with space", normalizeTime("9 pm"), "21:00");
  check("time: dotted meridiem", normalizeTime("7 p.m."), "19:00");
  check("time: noon stays noon", normalizeTime("12pm"), "12:00");
  check("time: midnight wraps to zero", normalizeTime("12am"), "00:00");
  check("time: empty is no time", normalizeTime("   "), undefined);
  check("time: words are not a time", normalizeTime("morning"), undefined);
  check("time: 25:00 is not a time", normalizeTime("25:00"), undefined);
  check("time: 9:75 is not a time", normalizeTime("9:75"), undefined);
  check("time: 13pm is not a time", normalizeTime("13pm"), undefined);

  check("formatTime: passes through junk", formatTime("nope"), "nope");
  ok("formatTime: renders something for 09:00", formatTime("09:00").length > 0);
}

/* ---------- entries ---------- */

const mk = (id: string, day: string, text: string, created: number, time?: string, label?: string) =>
  makeEntry(id, day, text, created, { ...(time ? { time } : {}), ...(label ? { label } : {}) });

{
  const a = mk("a", "2026-08-19", "Coffee", 100, "07:00");
  const b = mk("b", "2026-08-19", "Draft ch 4", 200, "09:30");
  const c = mk("c", "2026-08-19", "Read", 50);
  const d = mk("d", "2026-08-19", "Walk", 300);

  check(
    "entries: timed first in clock order, then untimed by when written",
    sortEntries([d, b, c, a]).map((e) => e.id),
    ["a", "b", "c", "d"],
  );
  check("entries: sortEntries does not mutate", [d, b, c, a].map((e) => e.id), ["d", "b", "c", "a"]);
  ok("entries: compare is symmetric", compareEntries(a, b) === -compareEntries(b, a));
  check("entries: identical entries tie at zero", compareEntries(a, a), 0);
}

{
  const list: CalendarEntry[] = [
    mk("a", "2026-08-19", "One", 100),
    mk("b", "2026-08-20", "Two", 200),
    mk("c", "2026-08-19", "Three", 300, "08:00"),
  ];
  const grouped = groupByDay(list);
  check("group: two days", Object.keys(grouped).sort(), ["2026-08-19", "2026-08-20"]);
  check("group: sorted inside a day", grouped["2026-08-19"]!.map((e) => e.id), ["c", "a"]);
  check("group: singleton day", grouped["2026-08-20"]!.length, 1);
  check("group: empty in, empty out", groupByDay([]), {});
}

{
  const draft = ENTRY_LABELS[0]!;
  const revise = ENTRY_LABELS[1]!;

  check("labels: lookup by id", labelById(draft.id)!.name, draft.name);
  check("labels: unknown id is undefined", labelById("nope"), undefined);
  check("labels: no id is undefined", labelById(undefined), undefined);
  check("labels: ids are unique", new Set(ENTRY_LABELS.map((l) => l.id)).size, ENTRY_LABELS.length);
  check("labels: colors are unique", new Set(ENTRY_LABELS.map((l) => l.color)).size, ENTRY_LABELS.length);

  const plain = mk("a", "2026-08-19", "One", 100);
  const labelled = mk("b", "2026-08-19", "Two", 200, undefined, draft.id);
  check("entryColor: unlabeled is null", entryColor(plain), null);
  check("entryColor: labeled is its hue", entryColor(labelled), draft.color);

  // The tint follows the day's FIRST entry in reading order, not the
  // first one that happens to be in the array.
  check("tint: nothing labeled means no tint", dayTint([plain]), null);
  check("tint: takes the first labeled entry in order", dayTint([plain, labelled]), draft.color);
  check(
    "tint: a timed labeled entry wins over an earlier-written one",
    dayTint([mk("x", "2026-08-19", "late", 10, undefined, revise.id), mk("y", "2026-08-19", "early", 20, "06:00", draft.id)]),
    draft.color,
  );
  check("tint: empty day", dayTint([]), null);

  check("dots: one per distinct label", dayDots([labelled, mk("c", "2026-08-19", "Three", 300, undefined, draft.id)]), [
    draft.color,
  ]);
  check("dots: unlabeled contributes a null dot", dayDots([plain, labelled]), [null, draft.color]);
  check(
    "dots: capped at three",
    dayDots(ENTRY_LABELS.map((l, i) => mk(`e${i}`, "2026-08-19", l.name, i, undefined, l.id))).length,
    3,
  );
  check("dots: honours a custom cap", dayDots([plain, labelled], 1), [null]);
  check("dots: empty day has none", dayDots([]), []);
}

{
  const base = [mk("a", "2026-08-19", "One", 100)];
  const added = upsertEntry(base, mk("b", "2026-08-19", "Two", 200));
  check("upsert: appends a new id", added.map((e) => e.id), ["a", "b"]);
  check("upsert: leaves the original alone", base.length, 1);

  const edited = upsertEntry(added, mk("a", "2026-08-19", "One, revised", 100));
  check("upsert: replaces in place", edited.map((e) => e.text), ["One, revised", "Two"]);
  check("upsert: does not grow on replace", edited.length, 2);

  check("remove: drops the id", removeEntryFrom(edited, "a").map((e) => e.id), ["b"]);
  check("remove: unknown id is a no-op", removeEntryFrom(edited, "zzz").length, 2);
}

{
  check("makeEntry: omits an empty time", Object.hasOwn(mk("a", "2026-08-19", "x", 1), "time"), false);
  check("makeEntry: omits an empty label", Object.hasOwn(mk("a", "2026-08-19", "x", 1), "label"), false);
  check("makeEntry: keeps a real time", mk("a", "2026-08-19", "x", 1, "08:00").time, "08:00");
}

/* ---------- migrating the old one-line intents ---------- */

{
  const intents = {
    "2026-08-19": "Draft the lighthouse scene",
    "2026-08-20": "   ",
    "2026-08-21": "Revise chapter 2",
  };
  let n = 0;
  const idFor = () => `m${n++}`;

  const migrated = migrateIntents(intents, [], idFor, 1000);
  check("migrate: blank intents are dropped", migrated.length, 2);
  check("migrate: text survives", migrated[0]!.text, "Draft the lighthouse scene");
  check("migrate: day survives", migrated[0]!.day, "2026-08-19");
  check("migrate: oldest day first", migrated.map((e) => e.day), ["2026-08-19", "2026-08-21"]);

  // Re-running must not duplicate a day that already carries entries.
  n = 0;
  const again = migrateIntents(intents, migrated, idFor, 2000);
  check("migrate: idempotent over days already held", again.length, 2);

  // A day with entries the writer made themselves is left alone.
  n = 0;
  const held = [mk("own", "2026-08-19", "Mine", 5)];
  const mixed = migrateIntents(intents, held, idFor, 2000);
  check("migrate: never overwrites a day with entries", mixed.length, 2);
  check("migrate: keeps the writer's own", mixed[0]!.text, "Mine");
  check("migrate: still brings the untouched day", mixed[1]!.day, "2026-08-21");

  check("migrate: nothing to migrate", migrateIntents({}, [], idFor, 1).length, 0);
}

/* ---------- ICS: line grammar ---------- */

{
  check("unfold: joins a continuation", unfoldLines("SUMMARY:Long\r\n  tail").join("|"), "SUMMARY:Long tail");
  check("unfold: tab continuation too", unfoldLines("A:one\n\ttwo").join("|"), "A:onetwo");
  check("unfold: bare LF works", unfoldLines("A:1\nB:2").join("|"), "A:1|B:2");
  check("unfold: CR only works", unfoldLines("A:1\rB:2").join("|"), "A:1|B:2");
  check("unfold: blank lines vanish", unfoldLines("A:1\n\n\nB:2").length, 2);
  check("unfold: leading continuation with no line to join is dropped", unfoldLines(" orphan").length, 0);
}

{
  const line = splitLine("DTSTART;TZID=Europe/Oslo;VALUE=DATE-TIME:20260819T090000")!;
  check("splitLine: name", line.name, "DTSTART");
  check("splitLine: params", line.params, { TZID: "Europe/Oslo", VALUE: "DATE-TIME" });
  check("splitLine: value", line.value, "20260819T090000");

  // A URL value is full of colons; only the first one counts.
  check("splitLine: value keeps later colons", splitLine("URL:https://x.test/a")!.value, "https://x.test/a");
  check("splitLine: quoted param is unquoted", splitLine('X;A="b;c":v')!.params.A, "b");
  check("splitLine: no colon is not a line", splitLine("GARBAGE"), null);
  check("splitLine: empty name is not a line", splitLine(":value"), null);
  check("splitLine: name is upper-cased", splitLine("summary:hi")!.name, "SUMMARY");
}

{
  check("unescape: comma", unescapeText("Tea\\, then work"), "Tea, then work");
  check("unescape: semicolon", unescapeText("a\\;b"), "a;b");
  check("unescape: newline", unescapeText("a\\nb"), "a\nb");
  check("unescape: capital N newline", unescapeText("a\\Nb"), "a\nb");
  check("unescape: backslash", unescapeText("a\\\\b"), "a\\b");
  check("unescape: leaves plain text alone", unescapeText("plain"), "plain");
}

/* ---------- ICS: dates ---------- */

{
  check("ics date: all-day", parseIcsDateValue("20260819"), { day: "2026-08-19", allDay: true });
  check("ics date: floating local time", parseIcsDateValue("20260819T093000"), {
    day: "2026-08-19",
    time: "09:30",
    allDay: false,
  });
  check("ics date: seconds are optional", parseIcsDateValue("20260819T0930")!.time, "09:30");
  check("ics date: midnight", parseIcsDateValue("20260819T000000")!.time, "00:00");
  check("ics date: garbage is null", parseIcsDateValue("not-a-date"), null);
  check("ics date: month 13 is null", parseIcsDateValue("20261301"), null);
  check("ics date: hour 24 is null", parseIcsDateValue("20260819T240000"), null);
  check("ics date: empty is null", parseIcsDateValue(""), null);
  check("ics date: whitespace is trimmed", parseIcsDateValue("  20260819  ")!.day, "2026-08-19");

  // A UTC value must land on the machine's local day. Computed here the
  // long way round so the assertion is independent of the parser.
  const utc = new Date(Date.UTC(2026, 7, 19, 12, 0, 0));
  const parsed = parseIcsDateValue("20260819T120000Z")!;
  check("ics date: Z converts to local day", parsed.day, key(utc));
  check(
    "ics date: Z converts to local time",
    parsed.time,
    `${String(utc.getHours()).padStart(2, "0")}:${String(utc.getMinutes()).padStart(2, "0")}`,
  );
}

/* ---------- ICS: recurrence rules we will and won't honour ---------- */

{
  check("rrule: plain daily", parseRRule("FREQ=DAILY"), { freq: "DAILY", interval: 1 });
  check("rrule: interval", parseRRule("FREQ=WEEKLY;INTERVAL=2"), { freq: "WEEKLY", interval: 2 });
  check("rrule: count", parseRRule("FREQ=DAILY;COUNT=3"), { freq: "DAILY", interval: 1, count: 3 });
  check("rrule: until becomes a day", parseRRule("FREQ=DAILY;UNTIL=20261231T235959Z")!.until !== undefined, true);
  check("rrule: lower case is fine", parseRRule("freq=monthly")!.freq, "MONTHLY");

  // The refusals. Each of these is a rule we could half-implement and get
  // visibly wrong on somebody's real calendar, so we don't implement it.
  check("rrule: BYDAY is refused", parseRRule("FREQ=WEEKLY;BYDAY=MO,WE,FR"), null);
  check("rrule: BYSETPOS is refused", parseRRule("FREQ=MONTHLY;BYSETPOS=-1;BYDAY=FR"), null);
  check("rrule: BYMONTHDAY is refused", parseRRule("FREQ=MONTHLY;BYMONTHDAY=15"), null);
  check("rrule: sub-daily frequency is refused", parseRRule("FREQ=HOURLY"), null);
  check("rrule: missing FREQ is refused", parseRRule("COUNT=5"), null);
  check("rrule: zero interval is refused", parseRRule("FREQ=DAILY;INTERVAL=0"), null);
  check("rrule: unparseable UNTIL is refused", parseRRule("FREQ=DAILY;UNTIL=soon"), null);
  check("rrule: empty is refused", parseRRule(""), null);
}

/* ---------- ICS: whole documents ---------- */

const SAMPLE = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "X-WR-CALNAME:Drew's Deadlines",
  "BEGIN:VEVENT",
  "UID:one@test",
  "DTSTART:20260819T090000",
  "DTEND:20260819T100000",
  "SUMMARY:Editor call",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:two@test",
  "DTSTART;VALUE=DATE:20260821",
  "SUMMARY:Manuscript due\\, final",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:three@test",
  "DTSTART:20260801T080000",
  "RRULE:FREQ=WEEKLY;INTERVAL=1",
  "SUMMARY:Writing group",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:four@test",
  "DTSTART:20260803T170000",
  "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR",
  "SUMMARY:School run",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

{
  const cal = parseIcs(SAMPLE);
  check("parse: calendar name", cal.name, "Drew's Deadlines");
  check("parse: four events", cal.events.length, 4);

  const one = cal.events[0]!;
  check("parse: timed start", { day: one.day, time: one.time, allDay: one.allDay }, {
    day: "2026-08-19",
    time: "09:00",
    allDay: false,
  });
  check("parse: end kept", one.endTime, "10:00");
  check("parse: uid kept", one.uid, "one@test");

  const two = cal.events[1]!;
  check("parse: all-day event", two.allDay, true);
  check("parse: escaped comma in summary", two.summary, "Manuscript due, final");
  check("parse: all-day has no time", two.time, undefined);

  check("parse: trivial rule is kept", cal.events[2]!.rule, { freq: "WEEKLY", interval: 1 });
  check("parse: hard rule is refused", cal.events[3]!.rule, undefined);
  check("parse: hard rule is flagged", cal.events[3]!.recurrenceSkipped, true);
}

{
  // The things a feed throws at a parser that must not throw back.
  check("parse: empty document", parseIcs("").events.length, 0);
  check("parse: no calendar name", parseIcs("BEGIN:VCALENDAR\r\nEND:VCALENDAR").name, null);
  check(
    "parse: event with no DTSTART is dropped",
    parseIcs("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Nowhere\r\nEND:VEVENT\r\nEND:VCALENDAR").events.length,
    0,
  );
  check(
    "parse: event with no SUMMARY gets a placeholder",
    parseIcs("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20260819\r\nEND:VEVENT\r\nEND:VCALENDAR").events[0]!.summary,
    "(untitled event)",
  );
  check(
    "parse: folded summary is rejoined",
    parseIcs(
      "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20260819\r\nSUMMARY:A very long title that\r\n  keeps going\r\nEND:VEVENT\r\nEND:VCALENDAR",
    ).events[0]!.summary,
    "A very long title that keeps going",
  );
  check(
    "parse: EXDATE forces a refusal even on a trivial rule",
    parseIcs(
      "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20260801\r\nRRULE:FREQ=DAILY\r\nEXDATE:20260805\r\nSUMMARY:Gappy\r\nEND:VEVENT\r\nEND:VCALENDAR",
    ).events[0]!.rule,
    undefined,
  );
}

/* ---------- ICS: expanding a window ---------- */

{
  const events = parseIcs(SAMPLE).events;

  const aug = expandOccurrences(events, "2026-08-01", "2026-08-31");
  const byUid = (uid: string) => aug.filter((o) => o.uid === uid).map((o) => o.day);

  check("expand: one-off inside the window", byUid("one@test"), ["2026-08-19"]);
  check("expand: all-day one-off", byUid("two@test"), ["2026-08-21"]);
  check("expand: weekly walks the month", byUid("three@test"), [
    "2026-08-01",
    "2026-08-08",
    "2026-08-15",
    "2026-08-22",
    "2026-08-29",
  ]);
  check("expand: refused rule shows once", byUid("four@test"), ["2026-08-03"]);
  ok("expand: refused rule stays flagged", aug.find((o) => o.uid === "four@test")!.recurrenceSkipped === true);
  ok("expand: carries the summary through", aug.some((o) => o.summary === "Editor call"));

  const sep = expandOccurrences(events, "2026-09-01", "2026-09-30");
  check("expand: window excludes the one-offs", sep.filter((o) => o.uid === "one@test").length, 0);
  check("expand: recurrence keeps going into September", sep.filter((o) => o.uid === "three@test").length, 4);

  check("expand: nothing in an empty window", expandOccurrences(events, "2020-01-01", "2020-01-31").length, 0);
  check("expand: no events at all", expandOccurrences([], "2026-08-01", "2026-08-31").length, 0);
}

{
  const daily = parseIcs(
    "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:d\r\nDTSTART:20260819\r\nRRULE:FREQ=DAILY;COUNT=3\r\nSUMMARY:Pages\r\nEND:VEVENT\r\nEND:VCALENDAR",
  ).events;
  check(
    "expand: COUNT stops it",
    expandOccurrences(daily, "2026-08-01", "2026-12-31").map((o) => o.day),
    ["2026-08-19", "2026-08-20", "2026-08-21"],
  );

  const until = parseIcs(
    "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:u\r\nDTSTART:20260819\r\nRRULE:FREQ=DAILY;UNTIL=20260821\r\nSUMMARY:Pages\r\nEND:VEVENT\r\nEND:VCALENDAR",
  ).events;
  check(
    "expand: UNTIL is inclusive",
    expandOccurrences(until, "2026-08-01", "2026-12-31").map((o) => o.day),
    ["2026-08-19", "2026-08-20", "2026-08-21"],
  );

  const every3 = parseIcs(
    "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:i\r\nDTSTART:20260801\r\nRRULE:FREQ=DAILY;INTERVAL=3\r\nSUMMARY:Every third\r\nEND:VEVENT\r\nEND:VCALENDAR",
  ).events;
  check(
    "expand: interval is honoured",
    expandOccurrences(every3, "2026-08-01", "2026-08-10").map((o) => o.day),
    ["2026-08-01", "2026-08-04", "2026-08-07", "2026-08-10"],
  );

  // The 31st does not exist in most months. RFC 5545 skips those dates
  // rather than sliding them onto the 1st of the next month.
  const monthly31 = parseIcs(
    "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:m\r\nDTSTART:20260131\r\nRRULE:FREQ=MONTHLY\r\nSUMMARY:Invoice\r\nEND:VEVENT\r\nEND:VCALENDAR",
  ).events;
  check(
    "expand: monthly skips months with no 31st",
    expandOccurrences(monthly31, "2026-01-01", "2026-06-30").map((o) => o.day),
    ["2026-01-31", "2026-03-31", "2026-05-31"],
  );

  // Feb 29 exists in 2028 and 2032, not in 2029/2030/2031.
  const leap = parseIcs(
    "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:l\r\nDTSTART:20280229\r\nRRULE:FREQ=YEARLY\r\nSUMMARY:Leap\r\nEND:VEVENT\r\nEND:VCALENDAR",
  ).events;
  check(
    "expand: yearly skips non-leap Februaries",
    expandOccurrences(leap, "2028-01-01", "2032-12-31").map((o) => o.day),
    ["2028-02-29", "2032-02-29"],
  );

  // A recurrence that started years ago must still reach the window.
  const old = parseIcs(
    "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:o\r\nDTSTART:20100104\r\nRRULE:FREQ=WEEKLY\r\nSUMMARY:Standing\r\nEND:VEVENT\r\nEND:VCALENDAR",
  ).events;
  check(
    "expand: a 16-year-old weekly still lands this month",
    expandOccurrences(old, "2026-08-01", "2026-08-31").map((o) => o.day),
    ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"],
  );
}

/* ---------- feed URLs ---------- */

{
  check("url: webcal becomes https", normalizeFeedUrl("webcal://p.test/x.ics"), "https://p.test/x.ics");
  check("url: WEBCAL too", normalizeFeedUrl("WEBCAL://p.test/x.ics"), "https://p.test/x.ics");
  check("url: https is untouched", normalizeFeedUrl(" https://p.test/x.ics "), "https://p.test/x.ics");
  check("url: http is untouched", normalizeFeedUrl("http://p.test/x.ics"), "http://p.test/x.ics");

  check("url: name from host", feedNameFromUrl("https://calendar.google.com/calendar/ical/x/basic.ics"), "calendar.google.com");
  check("url: www is dropped", feedNameFromUrl("https://www.example.test/a.ics"), "example.test");
  check("url: webcal names resolve too", feedNameFromUrl("webcal://p.test/x.ics"), "p.test");
  check("url: nonsense gets a fallback name", feedNameFromUrl("not a url"), "Subscribed calendar");
}

if (failures > 0) {
  console.error(`\n${failures} of ${checks} calendar checks failed.`);
  process.exit(1);
}
console.log(`${checks} calendar checks passed.`);
