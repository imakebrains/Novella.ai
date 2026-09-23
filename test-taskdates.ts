/* Assertions for task due dates (src/core/taskDates.ts).

   Silent unless something is wrong, non-zero exit when it is. Today is
   pinned to Wednesday 2026-09-23 so every relative phrase has one
   right answer. */

import {
  addDays,
  compareDue,
  daysBetween,
  dueLabel,
  dueState,
  isDay,
  normalizeDueInput,
  parseDue,
  resolveDuePhrase,
  withDue,
} from "./src/core/taskDates";

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

const TODAY = "2026-09-23"; // a Wednesday

check("a real day", isDay("2026-02-28"), true);
check("not a real day", isDay("2026-02-30"), false);
check("leap day", isDay("2028-02-29"), true);
check("add across a month", addDays("2026-09-29", 3), "2026-10-02");
check("add across a year", addDays("2026-12-30", 5), "2027-01-04");
check("days between, backwards", daysBetween("2026-09-23", "2026-09-20"), -3);

check("Obsidian's token", parseDue("Revise ch 3 📅 2026-10-01"), { due: "2026-10-01", text: "Revise ch 3" });
check("due: token", parseDue("Send to Ana due:2026-10-02 please"), { due: "2026-10-02", text: "Send to Ana please" });
check("due: with a space", parseDue("x due: 2026-10-02"), { due: "2026-10-02", text: "x" });
check("@ token", parseDue("@2026-11-11 Pitch"), { due: "2026-11-11", text: "Pitch" });
check("an email is not a date", parseDue("mail me@2026-10-01.dev"), { due: null, text: "mail me@2026-10-01.dev" });
check("an impossible date is ignored", parseDue("x 📅 2026-13-01"), { due: null, text: "x 📅 2026-13-01" });
check("no date", parseDue("Just a task"), { due: null, text: "Just a task" });

check("set a due date in the canonical form", withDue("Revise due:2026-10-01", "2026-10-05"), "Revise 📅 2026-10-05");
check("clear it", withDue("Revise 📅 2026-10-05", null), "Revise");

const phrases: [string, string | null][] = [
  ["today", "2026-09-23"],
  ["tomorrow", "2026-09-24"],
  ["fri", "2026-09-25"],
  ["friday", "2026-09-25"],
  ["thurs", "2026-09-24"],
  ["wed", "2026-09-30"], // "wednesday" on a Wednesday means next week
  ["next week", "2026-09-30"],
  ["in 3 days", "2026-09-26"],
  ["in 2 weeks", "2026-10-07"],
  ["oct 3", "2026-10-03"],
  ["october 3rd", "2026-10-03"],
  ["3 oct", "2026-10-03"],
  ["mar 1", "2027-03-01"], // already past this year
  ["10/3", "2026-10-03"],
  ["2026-12-01", "2026-12-01"],
  ["feb 30", null],
  ["tu", null],
  ["diligence", null],
  ["", null],
];
for (const [phrase, day] of phrases) check(`"${phrase}"`, resolveDuePhrase(phrase, TODAY), day);

check("typed 'due fri' becomes a date", normalizeDueInput("Call the agent due fri", TODAY), "Call the agent 📅 2026-09-25");
check("typed 'due: oct 3' too", normalizeDueInput("Draft query due: oct 3", TODAY), "Draft query 📅 2026-10-03");
check("'due diligence' is not a date", normalizeDueInput("Do due diligence", TODAY), "Do due diligence");
check("a sentence after the date is left alone", normalizeDueInput("due fri after the edit", TODAY), "due fri after the edit");

check("overdue", dueState("2026-09-20", TODAY), "overdue");
check("today", dueState(TODAY, TODAY), "today");
check("soon", dueState("2026-09-29", TODAY), "soon");
check("later", dueState("2026-09-30", TODAY), "later");
check("label: today", dueLabel(TODAY, TODAY), "Today");
check("label: tomorrow", dueLabel("2026-09-24", TODAY), "Tomorrow");
check("label: this week", dueLabel("2026-09-26", TODAY), "Sat");
check("label: overdue", dueLabel("2026-09-20", TODAY), "3 days overdue");
check("label: later this year", dueLabel("2026-11-02", TODAY), "Nov 2");
check("label: next year", dueLabel("2027-01-05", TODAY), "Jan 5, 2027");

const order = [null, "2026-10-02", null, "2026-09-25"].map((d, i) => ({ d, i }));
order.sort((a, b) => compareDue(a.d, b.d));
check("dated first by day, undated after in their order", order.map((o) => o.i), [3, 1, 0, 2]);

if (failures > 0) {
  console.error(`\ntest-taskdates: ${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`test-taskdates: ${checks} checks passed`);
