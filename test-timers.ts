/* Assertions for the timer/alarm arithmetic and for task-line rewriting.

   Same shape as test-units.ts and test-tabs.ts: no output unless something
   is wrong, non-zero exit when it is.

   Two subjects, one file, because both are the same kind of risk — code
   that edits something the writer can't afford to lose (a running clock,
   a line of their manuscript) and that a browser makes awkward to poke at.
   Everything asserted here is pure: `now` is passed in, never read, so
   these run identically at any hour in any timezone.

   The store at the bottom of timers.ts is exercised too. It runs headless:
   its localStorage call sits inside try/catch and the ticker is guarded on
   `window`, so importing it from node is a supported path, not a fluke. */

import {
  MINUTE,
  alarmLeft,
  armAlarm,
  clampMinuteOfDay,
  countdownLeft,
  disarmAlarm,
  dismissAlarm,
  dismissCountdown,
  formatClockTime,
  formatGap,
  formatTimer,
  isAlarmArmed,
  isCountdownRunning,
  nextAlarmAt,
  parseClockTime,
  pauseCountdown,
  resetCountdown,
  startCountdown,
  subscribeTimers,
  tickAlarm,
  tickCountdown,
  timerPause,
  timerReset,
  timerSetMinutes,
  timerStart,
  timersState,
  withAlarmTime,
  withCountdownDuration,
  type AlarmState,
  type CountdownState,
} from "./src/state/timers";
import {
  extractTasks,
  removeTaskLineAt,
  replaceTaskTextAt,
  taskLineAt,
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

/** A stopped countdown of `min` minutes, ready to start. */
const dial = (min: number): CountdownState => ({
  durationMs: min * MINUTE,
  restMs: min * MINUTE,
  endsAt: null,
  rangAt: null,
});

const alarmAt = (minuteOfDay: number): AlarmState => ({
  minuteOfDay,
  dueAt: null,
  rangAt: null,
});

/** A local wall-clock instant. Built from local parts on both sides of
    every alarm assertion, so no test depends on the machine's timezone. */
const at = (y: number, mo: number, d: number, h: number, mi: number): number =>
  new Date(y, mo, d, h, mi, 0, 0).getTime();

const T0 = 1_700_000_000_000; // an arbitrary "now" for countdown work

/* ---------- formatting ---------- */

{
  check("format: a fresh 25 reads 25:00, not 24:59", formatTimer(25 * MINUTE), "25:00");
  check("format: sub-second rounds up", formatTimer(1), "0:01");
  check("format: zero", formatTimer(0), "0:00");
  check("format: negative can't print a minus", formatTimer(-5000), "0:00");
  check("format: under a minute", formatTimer(9_000), "0:09");
  check("format: an hour pads the minutes", formatTimer(60 * MINUTE), "1:00:00");
  check("format: past an hour", formatTimer(90 * MINUTE + 5_000), "1:30:05");

  check("format: clock time pads both halves", formatClockTime(7 * 60 + 5), "07:05");
  check("format: midnight", formatClockTime(0), "00:00");
  check("format: last minute of the day", formatClockTime(1439), "23:59");
  check("format: out-of-range minutes clamp", formatClockTime(5000), "23:59");

  check("format: gap under a minute", formatGap(20_000), "under a minute");
  check("format: gap in minutes", formatGap(9 * MINUTE), "9 min");
  check("format: gap on the hour", formatGap(120 * MINUTE), "2 hr");
  check("format: gap with both", formatGap(95 * MINUTE), "1 hr 35 min");
}

/* ---------- parsing what a person types ---------- */

{
  check("parse: 24-hour", parseClockTime("19:05"), 19 * 60 + 5);
  check("parse: padded", parseClockTime("07:30"), 7 * 60 + 30);
  check("parse: unpadded", parseClockTime("7:30"), 7 * 60 + 30);
  check("parse: bare hour", parseClockTime("9"), 9 * 60);
  check("parse: pm", parseClockTime("7:30pm"), 19 * 60 + 30);
  check("parse: pm with a space", parseClockTime("7:30 pm"), 19 * 60 + 30);
  check("parse: p.m. with dots", parseClockTime("7:30 p.m."), 19 * 60 + 30);
  check("parse: 12am is midnight", parseClockTime("12:00am"), 0);
  check("parse: 12pm is noon", parseClockTime("12:00pm"), 12 * 60);
  check("parse: surrounding space", parseClockTime("  8:15  "), 8 * 60 + 15);

  // Refusals matter more than the successes: an unreadable field must not
  // quietly become midnight.
  check("parse: nonsense is null", parseClockTime("later"), null);
  check("parse: empty is null", parseClockTime(""), null);
  check("parse: hour out of range", parseClockTime("25:00"), null);
  check("parse: minute out of range", parseClockTime("10:75"), null);
  check("parse: 13pm is not a time", parseClockTime("13:00pm"), null);
  check("parse: 0pm is not a time", parseClockTime("0pm"), null);

  check("clamp: below zero", clampMinuteOfDay(-10), 0);
  check("clamp: above the day", clampMinuteOfDay(9999), 1439);
  check("clamp: NaN falls to midnight", clampMinuteOfDay(Number.NaN), 0);
}

/* ---------- the countdown ---------- */

{
  const stopped = dial(25);
  check("countdown: a stopped dial reports its whole length", countdownLeft(stopped, T0), 25 * MINUTE);
  ok("countdown: a dial isn't running", !isCountdownRunning(stopped));

  const running = startCountdown(stopped, T0);
  ok("countdown: start runs it", isCountdownRunning(running));
  check("countdown: the deadline is now plus the length", running.endsAt, T0 + 25 * MINUTE);
  check("countdown: a minute in", countdownLeft(running, T0 + MINUTE), 24 * MINUTE);
  check("countdown: never counts past zero", countdownLeft(running, T0 + 99 * MINUTE), 0);

  // Absolute deadlines, not decremented counters: a tab that was asleep
  // for ten minutes settles up on its next look at the clock.
  check("countdown: a slept-through gap settles correctly", countdownLeft(running, T0 + 10 * MINUTE), 15 * MINUTE);

  ok("countdown: starting a running clock changes nothing", startCountdown(running, T0 + 5) === running);

  const paused = pauseCountdown(running, T0 + 10 * MINUTE);
  ok("countdown: pause stops it", !isCountdownRunning(paused));
  check("countdown: pause keeps what was left", paused.restMs, 15 * MINUTE);
  check("countdown: a pause holds still", countdownLeft(paused, T0 + 40 * MINUTE), 15 * MINUTE);
  ok("countdown: pausing a stopped clock changes nothing", pauseCountdown(paused, T0) === paused);

  const resumed = startCountdown(paused, T0 + 40 * MINUTE);
  check("countdown: resume picks up where it stopped", resumed.endsAt, T0 + 55 * MINUTE);
  check("countdown: resume keeps the dial for later", resumed.durationMs, 25 * MINUTE);

  const reset = resetCountdown(resumed);
  ok("countdown: reset stops it", !isCountdownRunning(reset));
  check("countdown: reset returns to the dial", reset.restMs, 25 * MINUTE);
  ok("countdown: resetting an untouched dial changes nothing", resetCountdown(reset) === reset);
}

{
  // Firing.
  const running = startCountdown(dial(5), T0);
  ok("tick: quiet before the deadline", tickCountdown(running, T0 + 4 * MINUTE) === running);
  ok("tick: quiet one millisecond early", tickCountdown(running, T0 + 5 * MINUTE - 1) === running);

  const rang = tickCountdown(running, T0 + 5 * MINUTE);
  ok("tick: fires on the deadline", rang !== running);
  check("tick: records when it rang", rang.rangAt, T0 + 5 * MINUTE);
  ok("tick: a finished countdown stops running", !isCountdownRunning(rang));
  check("tick: nothing left", countdownLeft(rang, T0 + 5 * MINUTE), 0);

  // It must not ring twice for one deadline — the store's "did anything
  // change" test is identity, so a second tick has to return the same object.
  ok("tick: rings once, not every pass after", tickCountdown(rang, T0 + 9 * MINUTE) === rang);

  const dismissed = dismissCountdown(rang);
  check("dismiss: clears the finished state", dismissed.rangAt, null);
  check("dismiss: reloads the dial", dismissed.restMs, 5 * MINUTE);
  ok("dismiss: nothing to dismiss changes nothing", dismissCountdown(dismissed) === dismissed);

  // Start on a finished timer means "again", not "refuse".
  const again = startCountdown(rang, T0 + 9 * MINUTE);
  check("countdown: starting a finished timer runs the full length", again.endsAt, T0 + 9 * MINUTE + 5 * MINUTE);
  check("countdown: starting a finished timer clears the ring", again.rangAt, null);
}

{
  // The dial.
  const running = startCountdown(dial(25), T0);
  const retimed = withCountdownDuration(running, 10 * MINUTE);
  ok("dial: changing the length stops the clock", !isCountdownRunning(retimed));
  check("dial: the new length is both the dial and what's left", [retimed.durationMs, retimed.restMs], [10 * MINUTE, 10 * MINUTE]);
  ok("dial: a sub-second timer is refused", withCountdownDuration(retimed, 400) === retimed);
  ok("dial: a negative timer is refused", withCountdownDuration(retimed, -5000) === retimed);
  check("dial: fractional milliseconds round", withCountdownDuration(retimed, 60_000.4).durationMs, 60_000);
}

/* ---------- the alarm ---------- */

{
  // Later today.
  check(
    "alarm: later today is today",
    nextAlarmAt(10 * 60, at(2026, 0, 15, 9, 30)),
    at(2026, 0, 15, 10, 0),
  );
  // Already gone: tomorrow.
  check(
    "alarm: a time already past is tomorrow",
    nextAlarmAt(9 * 60, at(2026, 0, 15, 9, 30)),
    at(2026, 0, 16, 9, 0),
  );
  // Exactly now counts as gone — otherwise it would fire instantly on arm.
  check(
    "alarm: setting it for right now means tomorrow",
    nextAlarmAt(9 * 60 + 30, at(2026, 0, 15, 9, 30)),
    at(2026, 0, 16, 9, 30),
  );
  check(
    "alarm: rolls over a month end",
    nextAlarmAt(60, at(2026, 0, 31, 23, 0)),
    at(2026, 1, 1, 1, 0),
  );
  check(
    "alarm: rolls over a year end",
    nextAlarmAt(6 * 60, at(2026, 11, 31, 22, 0)),
    at(2027, 0, 1, 6, 0),
  );
  check("alarm: midnight tonight", nextAlarmAt(0, at(2026, 0, 15, 23, 30)), at(2026, 0, 16, 0, 0));
}

{
  const now = at(2026, 0, 15, 9, 0);
  const a = alarmAt(10 * 60);
  ok("alarm: a set time isn't armed on its own", !isAlarmArmed(a));
  check("alarm: nothing left when disarmed", alarmLeft(a, now), 0);

  const armed = armAlarm(a, now);
  ok("alarm: arm arms it", isAlarmArmed(armed));
  check("alarm: an hour to go", alarmLeft(armed, now), 60 * MINUTE);
  check("alarm: never counts past zero", alarmLeft(armed, at(2026, 0, 15, 11, 0)), 0);

  ok("alarm: quiet before it's due", tickAlarm(armed, at(2026, 0, 15, 9, 59)) === armed);
  const rang = tickAlarm(armed, at(2026, 0, 15, 10, 0));
  ok("alarm: fires when due", rang !== armed);
  check("alarm: records when it rang", rang.rangAt, at(2026, 0, 15, 10, 0));
  ok("alarm: firing disarms it — one shot, not a habit", !isAlarmArmed(rang));
  ok("alarm: rings once, not every pass after", tickAlarm(rang, at(2026, 0, 15, 12, 0)) === rang);

  const dismissed = dismissAlarm(rang);
  check("alarm: dismiss clears the finished state", dismissed.rangAt, null);
  check("alarm: dismiss keeps the time for next time", dismissed.minuteOfDay, 10 * 60);
  ok("alarm: nothing to dismiss changes nothing", dismissAlarm(dismissed) === dismissed);

  const off = disarmAlarm(armed);
  ok("alarm: disarm disarms", !isAlarmArmed(off));
  ok("alarm: disarming a disarmed alarm changes nothing", disarmAlarm(off) === off);
}

{
  // Moving the time.
  const now = at(2026, 0, 15, 9, 0);
  const armed = armAlarm(alarmAt(10 * 60), now);
  const moved = withAlarmTime(armed, 11 * 60, now);
  check("alarm: moving an armed alarm re-aims it", moved.dueAt, at(2026, 0, 15, 11, 0));
  ok("alarm: moving an armed alarm leaves it armed", isAlarmArmed(moved));

  const idle = withAlarmTime(alarmAt(10 * 60), 11 * 60, now);
  check("alarm: moving a disarmed alarm leaves it disarmed", idle.dueAt, null);
  check("alarm: the new time sticks", idle.minuteOfDay, 11 * 60);

  ok("alarm: moving it to where it already is changes nothing", withAlarmTime(moved, 11 * 60, now) === moved);
  check("alarm: out-of-range times clamp", withAlarmTime(alarmAt(0), 5000, now).minuteOfDay, 1439);
}

/* ---------- the store ---------- */

{
  timerReset();
  timerSetMinutes(10);
  check("store: the dial takes minutes", timersState().countdown.durationMs, 10 * MINUTE);

  let heard = 0;
  const off = subscribeTimers(() => heard++);
  timerStart();
  ok("store: start runs the clock", isCountdownRunning(timersState().countdown));
  timerPause();
  ok("store: pause stops it", !isCountdownRunning(timersState().countdown));
  const rest = timersState().countdown.restMs;
  ok("store: a paused clock kept a sane remainder", rest > 0 && rest <= 10 * MINUTE);
  check("store: subscribers heard both changes", heard, 2);

  // A refused change must not notify, or React re-renders for nothing.
  timerPause();
  check("store: a refused change is silent", heard, 2);
  off();

  timerReset();
  check("store: reset returns to the dial", timersState().countdown.restMs, 10 * MINUTE);
}

/* ============================================================
   Task lines — the panel's edit, archive and delete all land here
   ============================================================ */

const NOTE = [
  "Before the list.",
  "",
  "- [ ] find the lighthouse",
  "  * [x] name the dog",
  "3. [ ] cut the ferry scene",
  "",
  "After the list.",
].join("\n");

const taskAt = (body: string, i: number) => extractTasks(body)[i]!;

{
  const tasks = extractTasks(NOTE);
  check("tasks: three lines found", tasks.length, 3);

  const line = taskLineAt(NOTE, tasks[0]!.lineFrom);
  check("line: text", line?.text, "find the lighthouse");
  check("line: prefix keeps the marker and its space", line?.prefix, "- ");
  check("line: an open box", line?.box, " ");

  const indented = taskLineAt(NOTE, tasks[1]!.lineFrom);
  check("line: indent belongs to the prefix", indented?.prefix, "  * ");
  check("line: a ticked box", indented?.box, "x");

  check("line: an ordered marker survives", taskLineAt(NOTE, tasks[2]!.lineFrom)?.prefix, "3. ");

  // Refusals: the body can change under a rendered list, and guessing
  // would rewrite prose.
  check("line: prose is not a task", taskLineAt(NOTE, 0), null);
  check("line: an offset mid-line is refused", taskLineAt(NOTE, tasks[0]!.lineFrom + 2), null);
  check("line: an offset past the end is refused", taskLineAt(NOTE, NOTE.length + 5), null);
  check("line: a wrong expectation is refused", taskLineAt(NOTE, tasks[0]!.lineFrom, "something else"), null);
  check("line: the right expectation passes", taskLineAt(NOTE, tasks[0]!.lineFrom, "find the lighthouse")?.text, "find the lighthouse");
}

{
  // Editing.
  const next = replaceTaskTextAt(NOTE, taskAt(NOTE, 0).lineFrom, "find the lighthouse keeper")!;
  check("edit: the text changes", extractTasks(next)[0]!.text, "find the lighthouse keeper");
  check("edit: the other tasks don't", extractTasks(next).length, 3);
  ok("edit: the prose around it is untouched", next.startsWith("Before the list.\n\n") && next.endsWith("After the list."));

  const ticked = replaceTaskTextAt(NOTE, taskAt(NOTE, 1).lineFrom, "name the cat")!;
  check("edit: a done task stays done", extractTasks(ticked)[1]!.done, true);
  check("edit: the indent survives", ticked.includes("  * [x] name the cat"), true);
  check("edit: an ordered marker survives", replaceTaskTextAt(NOTE, taskAt(NOTE, 2).lineFrom, "keep it")!.includes("3. [ ] keep it"), true);

  // A task is one line by definition; pasting a paragraph must not split
  // it into prose the panel can no longer see.
  const pasted = replaceTaskTextAt(NOTE, taskAt(NOTE, 0).lineFrom, "one\ntwo   three\n")!;
  check("edit: newlines flatten", extractTasks(pasted)[0]!.text, "one two three");
  check("edit: still three tasks", extractTasks(pasted).length, 3);

  const emptied = replaceTaskTextAt(NOTE, taskAt(NOTE, 0).lineFrom, "   ")!;
  check("edit: emptying leaves a real checkbox", extractTasks(emptied)[0]!.text, "");
  check("edit: and no trailing space", emptied.split("\n")[2], "- [ ]");

  ok("edit: writing the same text is a no-op", replaceTaskTextAt(NOTE, taskAt(NOTE, 0).lineFrom, "find the lighthouse") === NOTE);
  check("edit: a stale offset is refused", replaceTaskTextAt(NOTE, 0, "nope"), null);
}

{
  // Deleting.
  const cut = removeTaskLineAt(NOTE, taskAt(NOTE, 0).lineFrom, "find the lighthouse")!;
  check("cut: the task is gone", extractTasks(cut).length, 2);
  check("cut: exactly one line goes", cut.split("\n").length, NOTE.split("\n").length - 1);
  ok("cut: the prose survives", cut.startsWith("Before the list.\n\n") && cut.endsWith("After the list."));

  const middle = removeTaskLineAt(NOTE, taskAt(NOTE, 1).lineFrom)!;
  check("cut: a middle task", extractTasks(middle).map((t) => t.text), ["find the lighthouse", "cut the ferry scene"]);

  check("cut: a wrong expectation refuses", removeTaskLineAt(NOTE, taskAt(NOTE, 0).lineFrom, "moved on"), null);
  check("cut: prose is refused", removeTaskLineAt(NOTE, 0), null);

  // The last line of a body has no newline of its own, so it takes the
  // one in front of it rather than leaving a dangling blank.
  const trailing = "Notes.\n- [ ] last thing";
  check("cut: the final line takes the newline before it", removeTaskLineAt(trailing, 7), "Notes.");
  check("cut: a lone task line empties the body", removeTaskLineAt("- [ ] only", 0), "");

  // Cutting every task, one at a time, re-reading offsets each pass —
  // exactly what the panel does.
  let body = NOTE;
  for (let i = 0; i < 3; i++) {
    const t = extractTasks(body)[0]!;
    body = removeTaskLineAt(body, t.lineFrom, t.text)!;
  }
  check("cut: everything, one at a time", extractTasks(body).length, 0);
  check("cut: leaves the prose intact", body, "Before the list.\n\n\nAfter the list.");
}

/* ---------- report ---------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`timer + task-line tests: ${checks} checks passed`);
