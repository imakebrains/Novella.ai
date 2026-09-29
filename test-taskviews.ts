/* Assertions for the Tasks panel's due-date views (src/core/taskViews.ts).

   Silent unless something is wrong, non-zero exit when it is. Today is
   pinned to Wednesday 2026-09-23, the same day test-taskdates.ts uses. */

import { dueSummary, orderTasks, parseSort, rowWithDue, rowsWithDue, sortByDue } from "./src/core/taskViews";
import { normalizeDueInput, parseDue } from "./src/core/taskDates";
import { appendLooseTask, extractTasks, replaceTaskTextAt, toggleTaskAt, type BodyTask } from "./src/core/tasks";

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

const TODAY = "2026-09-23";

// A task line the way extractTasks makes one; offsets don't matter to views.
const t = (text: string, done = false, i = 0): BodyTask => ({
  text,
  done,
  checkbox: i * 10,
  lineFrom: i * 10,
  lineTo: i * 10 + 9,
});
const texts = (rows: { text: string }[]) => rows.map((r) => r.text);

/* ---- rows ---- */
check("a dated row: token out, label and state in", rowWithDue(t("Revise ch 3 📅 2026-10-01"), TODAY), {
  task: t("Revise ch 3 📅 2026-10-01"),
  text: "Revise ch 3",
  due: "2026-10-01",
  state: "later",
  label: "Oct 1",
});
check("an undated row has nulls, text untouched", rowWithDue(t("Just a task"), TODAY), {
  task: t("Just a task"),
  text: "Just a task",
  due: null,
  state: null,
  label: null,
});
check("overdue label", rowWithDue(t("Send pages due:2026-09-20"), TODAY).label, "3 days overdue");
check("overdue state", rowWithDue(t("Send pages due:2026-09-20"), TODAY).state, "overdue");
check("today", rowWithDue(t("x 📅 2026-09-23"), TODAY).state, "today");
check("soon: this week gets a weekday", rowWithDue(t("x @2026-09-26"), TODAY).label, "Sat");
check("an impossible day is no date, and the text is left whole", rowWithDue(t("x 📅 2026-02-30"), TODAY).text, "x 📅 2026-02-30");
check(
  "rowsWithDue keeps the order it was given",
  texts(rowsWithDue([t("b 📅 2026-10-02", false, 0), t("a 📅 2026-10-01", false, 1)], TODAY)),
  ["b", "a"],
);

/* ---- sort ---- */
const tasks = [
  t("undated first in file", false, 0),
  t("later 📅 2026-10-02", false, 1),
  t("done but overdue 📅 2026-09-01", true, 2),
  t("soon 📅 2026-09-25", false, 3),
  t("second undated", false, 4),
  t("overdue 📅 2026-09-20", false, 5),
  t("done undated", true, 6),
];
const sorted = texts(sortByDue(rowsWithDue(tasks, TODAY)));
const openOnly = sorted.filter((_, i) => ![2, 6].includes(i));
check("dated open tasks first, nearest day first", openOnly.slice(0, 3), ["overdue", "soon", "later"]);
check("a task with no date sorts after the dated ones, keeping file order", openOnly.slice(3), [
  "undated first in file",
  "second undated",
]);
check("finished tasks keep their slots — a tick never moves a line", [sorted[2], sorted[6]], [
  "done but overdue",
  "done undated",
]);
check("the whole order", sorted, [
  "overdue",
  "soon",
  "done but overdue",
  "later",
  "undated first in file",
  "second undated",
  "done undated",
]);

const rows = rowsWithDue(tasks, TODAY);
sortByDue(rows);
check("sortByDue does not mutate its input", texts(rows)[0], "undated first in file");

check("orderTasks 'note' is the input itself", orderTasks(tasks, TODAY, "note") === tasks, true);
check(
  "orderTasks 'due' hands back the BodyTasks themselves, sorted",
  orderTasks(tasks, TODAY, "due")[0] === tasks[5],
  true,
);
check(
  "stable: equal days keep file order",
  texts(sortByDue(rowsWithDue([t("b 📅 2026-10-01", false, 0), t("a 📅 2026-10-01", false, 1)], TODAY))),
  ["b", "a"],
);
check("all done: nothing moves", orderTasks([t("b", true, 0), t("a 📅 2026-09-01", true, 1)], TODAY, "due").map((x) => x.text), [
  "b",
  "a 📅 2026-09-01",
]);

/* The panel's "Done tasks" modes run on orderTasks' output. These two
   lines are the panel's own bottom/archive rules (shownTasks in
   src/ui/TasksPanel.tsx, which can't be imported without React and the
   store) — what they prove is that the sort leaves the done-mode job
   intact whichever mode is on. */
const bottom = (xs: BodyTask[]) => [...xs.filter((x) => !x.done), ...xs.filter((x) => x.done)];
const archive = (xs: BodyTask[]) => xs.filter((x) => !x.done);
const ordered = orderTasks(tasks, TODAY, "due");
check("'Move down' still sinks finished tasks under the due order", texts(bottom(ordered)), [
  "overdue 📅 2026-09-20",
  "soon 📅 2026-09-25",
  "later 📅 2026-10-02",
  "undated first in file",
  "second undated",
  "done but overdue 📅 2026-09-01",
  "done undated",
]);
check("'Hide' still hides them", texts(archive(ordered)).length, 5);

/* ---- summary ---- */
check(
  "summary counts open overdue and today only",
  dueSummary(
    rowsWithDue(
      [
        t("late 📅 2026-09-20"),
        t("late too 📅 2026-09-22"),
        t("now 📅 2026-09-23"),
        t("done late 📅 2026-09-01", true),
        t("done now 📅 2026-09-23", true),
        t("soon 📅 2026-09-25"),
        t("undated"),
      ],
      TODAY,
    ),
  ),
  { overdue: 2, today: 1 },
);
check("empty summary", dueSummary([]), { overdue: 0, today: 0 });

/* ---- the stored preference ---- */
check("'due' is a sort", parseSort("due"), "due");
check("anything else is the default order", parseSort("bottom"), "note");
check("nothing stored is the default order", parseSort(null), "note");

/* ---- the file keeps the token ---- */
const body = "# Notes\n\n- [ ] Revise ch 3 📅 2026-10-01\n- [ ] Untimed\n";
const first = extractTasks(body)[0]!;
const ticked = toggleTaskAt(body, first.checkbox)!;
check("toggling a task keeps its date token in the file", ticked, "# Notes\n\n- [x] Revise ch 3 📅 2026-10-01\n- [ ] Untimed\n");
check("and the toggled task still parses with its date", parseDue(extractTasks(ticked)[0]!.text), {
  due: "2026-10-01",
  text: "Revise ch 3",
});
check("toggling back keeps it too", toggleTaskAt(ticked, first.checkbox), body);
check(
  "re-saving the raw text (an edit that only touches words) keeps the token",
  replaceTaskTextAt(body, first.lineFrom, normalizeDueInput("Revise ch 4 📅 2026-10-01", TODAY)),
  "# Notes\n\n- [ ] Revise ch 4 📅 2026-10-01\n- [ ] Untimed\n",
);
check(
  "an edit that types a new phrase replaces the old token rather than adding a second",
  replaceTaskTextAt(body, first.lineFrom, normalizeDueInput("Revise ch 3 📅 2026-10-01 due fri", TODAY)),
  "# Notes\n\n- [ ] Revise ch 3 📅 2026-09-25\n- [ ] Untimed\n",
);

/* ---- the entry path the panel wires: phrase in, token in the file ---- */
check(
  "a typed phrase lands in the file as the canonical token",
  appendLooseTask("- [ ] first\n", normalizeDueInput("Call the agent due fri", TODAY)),
  "- [ ] first\n- [ ] Call the agent 📅 2026-09-25\n",
);
check(
  "'due diligence' is written as typed",
  appendLooseTask("", normalizeDueInput("Do due diligence", TODAY)),
  "- [ ] Do due diligence\n",
);

if (failures > 0) {
  console.error(`\ntest-taskviews: ${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`test-taskviews: ${checks} checks passed`);
