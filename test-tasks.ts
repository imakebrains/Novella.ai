/* Assertions for task headers — the grouping layer in src/core/tasks.ts.

   Same shape as test-timers.ts: no output unless something is wrong,
   non-zero exit when it is. test-timers.ts already covers the single-line
   rewriters (edit, cut, the refusals); this file covers what sits above
   them — reading a note as sections, and inserting, renaming and removing
   the headings that make them.

   Everything here is pure string work on a body, so a check is a body in
   and a body out. The two properties worth more than any of the individual
   cases, and asserted over and over below:

     1. no rewrite ever loses a task, and
     2. every rewrite refuses (null) on an offset it can no longer identify,
        rather than editing the line that happens to be there now. */

import {
  HEADING_LINE,
  appendLooseTask,
  createHeaderWithTask,
  extractSections,
  extractTasks,
  headerLineAt,
  insertTaskUnderHeaderAt,
  removeHeaderAt,
  renameHeaderAt,
  type TaskHeader,
} from "./src/core/tasks";

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

/* ---------- fixtures ---------- */

/** A note as they all were before headers existed. */
const PLAIN = [
  "Notes on the ferry scene.",
  "",
  "- [ ] check the tide table",
  "- [x] name the dog",
].join("\n");

/** Loose tasks, then two sections, then prose. */
const GROUPED = [
  "- [ ] loose one",
  "",
  "## Act one",
  "- [ ] cut the ferry scene",
  "- [x] name the dog",
  "",
  "## Line edits",
  "- [ ] kill the adverbs",
  "",
  "Some closing prose.",
].join("\n");

const names = (body: string) => extractTasks(body).map((t) => t.text);

const shape = (body: string) =>
  extractSections(body).map((s) => [s.header?.text ?? null, s.tasks.map((t) => t.text)]);

const headerOf = (body: string, name: string): TaskHeader =>
  extractSections(body).find((s) => s.header?.text === name)!.header!;

/* ---------- reading a note as sections ---------- */

{
  check("read: no headings means one ungrouped section", shape(PLAIN), [
    [null, ["check the tide table", "name the dog"]],
  ]);
  check("read: an empty body has no sections", extractSections(""), []);
  check("read: prose alone has no sections", extractSections("Just words.\n\nMore words."), []);

  check("read: loose tasks come first, then each section in order", shape(GROUPED), [
    [null, ["loose one"]],
    ["Act one", ["cut the ferry scene", "name the dog"]],
    ["Line edits", ["kill the adverbs"]],
  ]);

  const act = headerOf(GROUPED, "Act one");
  check("read: a header remembers its level", act.level, 2);
  check("read: and where its line starts", GROUPED.slice(act.lineFrom, act.lineTo), "## Act one");
  check(
    "read: done-ness survives grouping",
    extractSections(GROUPED).map((s) => s.tasks.map((t) => t.done)),
    [[false], [false, true], [false]],
  );
  check(
    "read: a grouped task still knows its own checkbox offset",
    GROUPED.slice(headerOf(GROUPED, "Act one").lineTo + 1).startsWith("- [ ] cut"),
    true,
  );
}

{
  // The qualifying rule. Without it a manuscript's own `# Chapter Three`
  // would adopt any reminder written further down the page.
  const prosey = ["# Chapter Three", "", "The ferry came in at dusk.", "", "- [ ] check the tide"].join("\n");
  check("read: a heading with prose under it is not a header", shape(prosey), [
    [null, ["check the tide"]],
  ]);

  const blanks = ["## Act one", "", "", "- [ ] cut it"].join("\n");
  check("read: blank lines between heading and task don't disqualify it", shape(blanks), [
    ["Act one", ["cut it"]],
  ]);

  const empty = ["## Act one", "", "## Act two", "- [ ] write it"].join("\n");
  check("read: a heading with no tasks at all is not a header", shape(empty), [
    ["Act two", ["write it"]],
  ]);

  const nested = ["## Act one", "", "### Scene two", "- [ ] beat it out"].join("\n");
  check("read: the nearest qualifying heading wins", shape(nested), [["Scene two", ["beat it out"]]]);
  check("read: a deeper heading keeps its level", headerOf(nested, "Scene two").level, 3);

  const interrupted = ["## Act one", "- [ ] a", "A note to self.", "- [ ] b"].join("\n");
  check("read: prose between two boxes doesn't split the section", shape(interrupted), [
    ["Act one", ["a", "b"]],
  ]);

  const closed = ["## Act one", "- [ ] a", "## Act two", "- [ ] b"].join("\n");
  check("read: the next heading closes the section", shape(closed), [
    ["Act one", ["a"]],
    ["Act two", ["b"]],
  ]);

  const after = ["## Act one", "The prose.", "- [ ] orphan"].join("\n");
  check("read: a task under an unqualified heading is ungrouped", shape(after), [
    [null, ["orphan"]],
  ]);

  ok("read: a hash with no space is not a heading", !HEADING_LINE.test("#NoSpace"));
  ok("read: seven hashes is not a heading", !HEADING_LINE.test("####### deep"));
  ok("read: a task line is never a heading", !HEADING_LINE.test("- [ ] a task"));
}

/* ---------- headerLineAt: the same refusals taskLineAt makes ---------- */

{
  const act = headerOf(GROUPED, "Act one");
  check("headerLineAt: reads the heading", headerLineAt(GROUPED, act.lineFrom)?.text, "Act one");
  check("headerLineAt: and its level", headerLineAt(GROUPED, act.lineFrom)?.level, 2);
  check(
    "headerLineAt: the right expectation passes",
    headerLineAt(GROUPED, act.lineFrom, "Act one")?.text,
    "Act one",
  );

  check("headerLineAt: a task line is not a heading", headerLineAt(GROUPED, 0), null);
  check("headerLineAt: an offset mid-line is refused", headerLineAt(GROUPED, act.lineFrom + 3), null);
  check("headerLineAt: past the end is refused", headerLineAt(GROUPED, GROUPED.length + 5), null);
  check("headerLineAt: a negative offset is refused", headerLineAt(GROUPED, -1), null);
  check(
    "headerLineAt: a wrong expectation is refused",
    headerLineAt(GROUPED, act.lineFrom, "Act two"),
    null,
  );
}

/* ---------- adding under a header ---------- */

{
  const act = headerOf(GROUPED, "Act one");
  const next = insertTaskUnderHeaderAt(GROUPED, act.lineFrom, "Act one", "find the keeper")!;
  check("add: the section grows", shape(next), [
    [null, ["loose one"]],
    ["Act one", ["cut the ferry scene", "name the dog", "find the keeper"]],
    ["Line edits", ["kill the adverbs"]],
  ]);
  check("add: it lands under the section's last task, not the note's", next.split("\n")[5], "- [ ] find the keeper");
  ok("add: the prose below survives", next.endsWith("\nSome closing prose."));
  check("add: nothing else moved", extractTasks(next).length, extractTasks(GROUPED).length + 1);

  const first = insertTaskUnderHeaderAt(GROUPED, headerOf(GROUPED, "Line edits").lineFrom, "Line edits", "check the em dashes")!;
  check(
    "add: the last section takes it before the closing prose",
    shape(first).map(([h]) => h),
    [null, "Act one", "Line edits"],
  );
  ok("add: still ends in prose", first.endsWith("\nSome closing prose."));

  // A stale offset must refuse rather than rewrite whatever is there now.
  check("add: a wrong expectation is refused", insertTaskUnderHeaderAt(GROUPED, act.lineFrom, "Act two", "x"), null);
  check("add: a task-line offset is refused", insertTaskUnderHeaderAt(GROUPED, 0, "Act one", "x"), null);
  check("add: empty text is refused", insertTaskUnderHeaderAt(GROUPED, act.lineFrom, "Act one", "   "), null);
  const pasted = insertTaskUnderHeaderAt(GROUPED, act.lineFrom, "Act one", "one\ntwo  three")!;
  check("add: a pasted paragraph flattens to one task", extractTasks(pasted).length, 5);
  check("add: and keeps its words", extractTasks(pasted)[3]!.text, "one two three");

  // A heading with nothing under it yet: the task goes directly beneath,
  // which is exactly what turns the heading into a header.
  const bare = "## Act one\n\nSome prose.";
  const filled = insertTaskUnderHeaderAt(bare, 0, "Act one", "cut it")!;
  check("add: a bare heading takes the task straight underneath", filled, "## Act one\n- [ ] cut it\n\nSome prose.");
  check("add: and becomes a header", shape(filled), [["Act one", ["cut it"]]]);

  // The writer's list shape is theirs, not ours.
  const starred = "## Sub\n  * [ ] indented";
  check("add: the indent and bullet are borrowed", insertTaskUnderHeaderAt(starred, 0, "Sub", "second")!.split("\n")[2], "  * [ ] second");
  const ordered = "## Sub\n1. [ ] first";
  check("add: an ordered marker falls back to a dash", insertTaskUnderHeaderAt(ordered, 0, "Sub", "second")!.split("\n")[2], "- [ ] second");
}

/* ---------- adding with no header ---------- */

{
  const next = appendLooseTask(PLAIN, "read the log")!;
  check("loose: a headerless note appends at the end", next, `${PLAIN}\n- [ ] read the log`);
  // The line follows the last task, not the last byte: a file that ended
  // with a newline still does and one that didn't still doesn't. Adding a
  // task is not an excuse to reformat somebody's note.
  check("loose: a trailing newline is preserved", appendLooseTask(`${PLAIN}\n`, "read the log")!, `${PLAIN}\n- [ ] read the log\n`);
  check("loose: a note with no tasks yet starts the list", appendLooseTask("Notes.", "a")!, "Notes.\n- [ ] a\n");
  check("loose: an empty body starts the list", appendLooseTask("", "first")!, "- [ ] first\n");
  check("loose: a body already ending in a newline doesn't gain a blank", appendLooseTask("Notes.\n", "a")!, "Notes.\n- [ ] a\n");
  check("loose: empty text is refused", appendLooseTask(PLAIN, "  "), null);

  const grouped = appendLooseTask(GROUPED, "another loose one")!;
  check("loose: it joins the ungrouped run", shape(grouped), [
    [null, ["loose one", "another loose one"]],
    ["Act one", ["cut the ferry scene", "name the dog"]],
    ["Line edits", ["kill the adverbs"]],
  ]);

  // The trap this avoids: appending at the end of a note that ends in a
  // section would silently file the task under that section.
  const onlyGroups = "## Act one\n- [ ] cut the ferry scene\n";
  const ahead = appendLooseTask(onlyGroups, "unfiled")!;
  check("loose: with no loose run it goes in front of the first header", ahead, "- [ ] unfiled\n\n## Act one\n- [ ] cut the ferry scene\n");
  check("loose: and reads as ungrouped", shape(ahead), [
    [null, ["unfiled"]],
    ["Act one", ["cut the ferry scene"]],
  ]);
}

/* ---------- creating a header ---------- */

{
  const next = createHeaderWithTask(PLAIN, "Line edits", "kill the adverbs")!;
  check("new: the heading and its first task arrive together", next, `${PLAIN}\n\n## Line edits\n- [ ] kill the adverbs\n`);
  check("new: and read as a section", shape(next), [
    [null, ["check the tide table", "name the dog"]],
    ["Line edits", ["kill the adverbs"]],
  ]);
  check("new: nothing already in the note moved", names(next).slice(0, 2), names(PLAIN));

  check("new: an empty note gets no leading blank", createHeaderWithTask("", "Act one", "start")!, "## Act one\n- [ ] start\n");
  check("new: a body ending in a blank line doesn't gain another", createHeaderWithTask("Notes.\n\n", "A", "b")!, "Notes.\n\n## A\n- [ ] b\n");

  check("new: an unnamed header is refused", createHeaderWithTask(PLAIN, "   ", "a"), null);
  check("new: a header with no first task is refused", createHeaderWithTask(PLAIN, "Act one", " "), null);

  // A heading whose tasks were all deleted still has its line in the note.
  // Writing a second one would split one group in two.
  const reused = createHeaderWithTask(GROUPED, "Act one", "third thing")!;
  check("new: an existing heading is reused, not duplicated", shape(reused), [
    [null, ["loose one"]],
    ["Act one", ["cut the ferry scene", "name the dog", "third thing"]],
    ["Line edits", ["kill the adverbs"]],
  ]);
  check("new: reuse ignores case", shape(createHeaderWithTask(GROUPED, "act ONE", "third")!).length, 3);
  const orphan = "## Act one\n\nSome prose.";
  check("new: a heading left behind by its tasks is adopted", createHeaderWithTask(orphan, "Act one", "back")!, "## Act one\n- [ ] back\n\nSome prose.");
}

/* ---------- renaming a header ---------- */

{
  const act = headerOf(GROUPED, "Act one");
  const next = renameHeaderAt(GROUPED, act.lineFrom, "Act one", "Act two")!;
  check("rename: the label changes", shape(next), [
    [null, ["loose one"]],
    ["Act two", ["cut the ferry scene", "name the dog"]],
    ["Line edits", ["kill the adverbs"]],
  ]);
  check("rename: no task is orphaned", names(next), names(GROUPED));
  check("rename: the level is kept", headerOf(next, "Act two").level, 2);

  const deep = "### Scene two\n- [ ] beat it out";
  check("rename: a deeper heading keeps its hashes", renameHeaderAt(deep, 0, "Scene two", "Scene three")!.split("\n")[0], "### Scene three");

  ok("rename: writing the same name is a no-op", renameHeaderAt(GROUPED, act.lineFrom, "Act one", "Act one") === GROUPED);
  check("rename: newlines flatten", renameHeaderAt(GROUPED, act.lineFrom, "Act one", "Act\ntwo")!.split("\n")[2], "## Act two");

  // An empty heading is not a heading: saving `## ` would cut every task
  // under it loose from the group in the same keystroke.
  check("rename: an empty name is refused", renameHeaderAt(GROUPED, act.lineFrom, "Act one", "   "), null);
  check("rename: a wrong expectation is refused", renameHeaderAt(GROUPED, act.lineFrom, "Act two", "Act three"), null);
  check("rename: a task-line offset is refused", renameHeaderAt(GROUPED, 0, "Act one", "Act three"), null);
}

/* ---------- removing a header ---------- */

{
  // The whole point: a header is a label. Removing it un-groups tasks and
  // deletes none of them.
  const act = headerOf(GROUPED, "Act one");
  const next = removeHeaderAt(GROUPED, act.lineFrom, "Act one")!;
  check("remove: every task survives", names(next), names(GROUPED));
  check("remove: its tasks fall back to ungrouped", shape(next), [
    [null, ["loose one", "cut the ferry scene", "name the dog"]],
    ["Line edits", ["kill the adverbs"]],
  ]);
  check("remove: exactly one line goes", next.split("\n").length, GROUPED.split("\n").length - 1);
  ok("remove: the prose survives", next.endsWith("\nSome closing prose."));

  // Removing an inner header merges its tasks into the section above,
  // because that is what the file now says.
  const inner = removeHeaderAt(GROUPED, headerOf(GROUPED, "Line edits").lineFrom, "Line edits")!;
  check("remove: an inner header merges upward", shape(inner), [
    [null, ["loose one"]],
    ["Act one", ["cut the ferry scene", "name the dog", "kill the adverbs"]],
  ]);
  check("remove: and still loses nothing", names(inner), names(GROUPED));

  const trailing = "- [ ] a\n## Trailing";
  check("remove: a final heading takes the newline in front of it", removeHeaderAt(trailing, 8, "Trailing"), "- [ ] a");
  check("remove: a lone heading empties the body", removeHeaderAt("## Only", 0, "Only"), "");

  check("remove: a wrong expectation is refused", removeHeaderAt(GROUPED, act.lineFrom, "Act two"), null);
  check("remove: a task-line offset is refused", removeHeaderAt(GROUPED, 0, "Act one"), null);
  check("remove: past the end is refused", removeHeaderAt(GROUPED, GROUPED.length + 2, "Act one"), null);
}

/* ---------- the panel's actual flow, end to end ---------- */

{
  // Start from a note that has never seen a header, then do what the panel
  // does: capture a loose task, make a header, fill it, rename it, drop it.
  let body = "";
  body = appendLooseTask(body, "read the log")!;
  body = createHeaderWithTask(body, "Act one", "cut the ferry scene")!;
  body = insertTaskUnderHeaderAt(body, headerOf(body, "Act one").lineFrom, "Act one", "name the dog")!;
  body = appendLooseTask(body, "email the agent")!;
  check("flow: the note reads as the panel drew it", shape(body), [
    [null, ["read the log", "email the agent"]],
    ["Act one", ["cut the ferry scene", "name the dog"]],
  ]);

  const parsed = extractSections(body);
  check("flow: every offset still points at its own line", parsed.every((s) => s.tasks.every((t) => body.slice(t.lineFrom, t.lineTo).includes(t.text))), true);
  check("flow: and every header does too", headerLineAt(body, headerOf(body, "Act one").lineFrom)?.text, "Act one");

  body = renameHeaderAt(body, headerOf(body, "Act one").lineFrom, "Act one", "Act one — revised")!;
  check("flow: renaming kept the group", shape(body), [
    [null, ["read the log", "email the agent"]],
    ["Act one — revised", ["cut the ferry scene", "name the dog"]],
  ]);

  const before = names(body);
  body = removeHeaderAt(body, headerOf(body, "Act one — revised").lineFrom, "Act one — revised")!;
  check("flow: dropping the header kept all four tasks", names(body).sort(), before.sort());
  check("flow: and left one ungrouped list", shape(body).length, 1);

  // A body that has been through all of that still round-trips: parse,
  // rewrite from the parsed offsets, parse again, same list.
  const again = appendLooseTask(body, "one more")!;
  check("flow: it still takes another task", extractTasks(again).length, 5);
}

/* ---------- report ---------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`task header tests: ${checks} checks passed`);
