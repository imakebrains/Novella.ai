/* Assertion tests for the accessibility arithmetic: the dialog focus trap
   and the pane separators' keys.

   Silent unless something is wrong, non-zero exit when it is. Only the
   pure halves live here — focusableIn, Modal and Resizer need a real DOM
   and are verified in the browser. This file must never import Modal.tsx:
   React and `document` at import time would break the headless run. */

import {
  FOCUSABLE_SELECTOR,
  isTabbable,
  nextFocus,
  oneStopPerRadioGroup,
  topOf,
  trapKey,
  type FocusCandidate,
} from "./src/ui/focusTrap";
import { RESIZE_STEP, RESIZE_STEP_BIG, resizeDelta } from "./src/ui/resizerKeys";

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

/* ---------- nextFocus ---------- */

const list = ["a", "b", "c"];
check("trap: Tab from the middle moves forward", nextFocus(list, "b", false), "c");
check("trap: Tab from the last wraps to the first", nextFocus(list, "c", false), "a");
check("trap: Shift+Tab from the first wraps to the last", nextFocus(list, "a", true), "c");
check("trap: Shift+Tab from the middle moves back", nextFocus(list, "b", true), "a");
check("trap: focus on the shell (not in list) goes to the first", nextFocus(list, "shell", false), "a");
check("trap: Shift+Tab from the shell goes to the last", nextFocus(list, "shell", true), "c");
check("trap: null current (focus fell to body) goes to the first", nextFocus(list, null, false), "a");
check("trap: undefined current goes to the last backwards", nextFocus(list, undefined, true), "c");
check("trap: a single element cycles to itself", nextFocus(["only"], "only", false), "only");
check("trap: a single element cycles to itself backwards", nextFocus(["only"], "only", true), "only");
check("trap: an empty list yields nothing", nextFocus([], "x", false), null);
check("trap: an empty list yields nothing backwards", nextFocus([], null, true), null);
{
  // Forty Tabs — the audit's number — never leave the list.
  let at: string | null = "b";
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    at = nextFocus(list, at, false);
    if (at) seen.add(at);
  }
  ok("trap: forty Tabs visit only the dialog's own controls", [...seen].every((s) => list.includes(s)));
  check("trap: forty Tabs from b land on c", at, "c");
}

/* ---------- isTabbable ---------- */

const fake = (
  over: Partial<Omit<FocusCandidate, "getAttribute">> & { attrs?: Record<string, string> } = {},
): FocusCandidate => ({
  hidden: over.hidden ?? false,
  disabled: over.disabled,
  getAttribute: (n: string) => over.attrs?.[n] ?? null,
});

ok("trap: a plain button is tabbable", isTabbable(fake()));
ok("trap: hidden elements are skipped", !isTabbable(fake({ hidden: true })));
ok("trap: disabled controls are skipped", !isTabbable(fake({ disabled: true })));
ok("trap: tabindex -1 is skipped", !isTabbable(fake({ attrs: { tabindex: "-1" } })));
ok("trap: tabindex 0 is kept", isTabbable(fake({ attrs: { tabindex: "0" } })));
ok("trap: type=hidden inputs are skipped", !isTabbable(fake({ attrs: { type: "hidden" } })));
ok("trap: aria-hidden elements are skipped", !isTabbable(fake({ attrs: { "aria-hidden": "true" } })));
ok(
  "trap: the selector reaches buttons, inputs and tabindex",
  ["button", "input", "[tabindex]", "select", "textarea", "a[href]"].every((s) =>
    FOCUSABLE_SELECTOR.includes(s),
  ),
);
ok("trap: the selector never lists a negative tabindex literally", !FOCUSABLE_SELECTOR.includes("-1"));

/* ---------- radio groups ---------- */

{
  type Item = { id: string; group?: string; checked?: boolean };
  const radio = (i: Item) => (i.group ? { group: i.group, checked: !!i.checked } : null);
  const ids = (items: Item[]) => oneStopPerRadioGroup(items, radio).map((i) => i.id);
  const formats: Item[] = [
    { id: "title" },
    { id: "docx", group: "fmt" },
    { id: "epub", group: "fmt", checked: true },
    { id: "md", group: "fmt" },
    { id: "export" },
  ];
  check("radios: a group is one stop, the checked one", ids(formats), ["title", "epub", "export"]);
  check(
    "radios: with nothing checked the first one stands in",
    ids(formats.map((f) => ({ ...f, checked: false }))),
    ["title", "docx", "export"],
  );
  check(
    "radios: separate groups keep a stop each",
    ids([{ id: "a1", group: "a" }, { id: "b1", group: "b", checked: true }, { id: "b2", group: "b" }]),
    ["a1", "b1"],
  );
  check("radios: a list with no radios is untouched", ids([{ id: "x" }, { id: "y" }]), ["x", "y"]);
}

/* ---------- trapKey ---------- */

const key = (k: string, mods: Partial<{ shift: boolean; ctrl: boolean; alt: boolean; meta: boolean; ime: boolean }> = {}) => ({
  key: k,
  shiftKey: !!mods.shift,
  ctrlKey: !!mods.ctrl,
  altKey: !!mods.alt,
  metaKey: !!mods.meta,
  isComposing: !!mods.ime,
});

check("keys: Escape closes", trapKey(key("Escape")), "close");
check("keys: Tab moves forward", trapKey(key("Tab")), "forward");
check("keys: Shift+Tab moves back", trapKey(key("Tab", { shift: true })), "back");
check("keys: Ctrl+Tab belongs to the browser", trapKey(key("Tab", { ctrl: true })), null);
check("keys: Alt+Tab belongs to the OS", trapKey(key("Tab", { alt: true })), null);
check("keys: Cmd+Tab belongs to the OS", trapKey(key("Tab", { meta: true })), null);
check("keys: Escape mid-composition belongs to the IME", trapKey(key("Escape", { ime: true })), null);
check("keys: ordinary typing passes through", trapKey(key("a")), null);
check("keys: Enter passes through", trapKey(key("Enter")), null);

/* ---------- topOf ---------- */

check("layers: nothing open, no top", topOf([]), null);
check("layers: one open is the top", topOf([{ order: 3 }])?.order, 3);
check(
  "layers: the last opened wins even when it registered first",
  topOf([{ order: 5, id: "child" }, { order: 4, id: "parent" }])?.id,
  "child",
);
check(
  "layers: closing the top hands Escape to the one beneath",
  topOf([{ order: 1, id: "projects" }, { order: 2, id: "preview" }].filter((l) => l.id !== "preview"))?.id,
  "projects",
);

/* ---------- resizeDelta ---------- */

check("resizer: ArrowRight grows a left pane by one step", resizeDelta("ArrowRight", "left", false, 300, 180, 560), 16);
check("resizer: ArrowLeft shrinks a left pane", resizeDelta("ArrowLeft", "left", false, 300, 180, 560), -16);
check("resizer: ArrowRight shrinks a right pane", resizeDelta("ArrowRight", "right", false, 300, 180, 560), -16);
check("resizer: ArrowLeft grows a right pane", resizeDelta("ArrowLeft", "right", false, 300, 180, 560), 16);
check("resizer: Shift takes the big step", resizeDelta("ArrowRight", "left", true, 300, 180, 560), RESIZE_STEP_BIG);
check("resizer: the step is 16px", RESIZE_STEP, 16);
check("resizer: Home lands on the minimum", resizeDelta("Home", "left", false, 300, 180, 560), -120);
check("resizer: End lands on the maximum", resizeDelta("End", "right", false, 300, 180, 560), 260);
check("resizer: Home at the minimum is a no-op", resizeDelta("Home", "left", false, 180, 180, 560), 0);
check("resizer: Home without a known width overshoots for the clamp", resizeDelta("Home", "left", false, undefined, 180, 560), -380);
check("resizer: End without a known width overshoots for the clamp", resizeDelta("End", "left", false, undefined, 180, 560), 380);
check("resizer: Enter is not a resize", resizeDelta("Enter", "left", false, 300, 180, 560), null);
check("resizer: unrelated keys are ignored", resizeDelta("a", "left", false, 300, 180, 560), null);
check("resizer: vertical arrows are ignored on a vertical separator", resizeDelta("ArrowUp", "left", false, 300, 180, 560), null);
{
  // App.tsx applies the delta as clamp(width + d); Home and End must land
  // exactly on the limits from anywhere, known width or not.
  const clamp = (n: number) => Math.min(560, Math.max(180, n));
  for (const w of [180, 268, 340, 560]) {
    for (const v of [w, undefined]) {
      check(`resizer: Home from ${w} (${v === undefined ? "unknown" : "known"}) is 180`, clamp(w + resizeDelta("Home", "left", false, v, 180, 560)!), 180);
      check(`resizer: End from ${w} (${v === undefined ? "unknown" : "known"}) is 560`, clamp(w + resizeDelta("End", "right", false, v, 180, 560)!), 560);
    }
  }
}

/* ---------- report ---------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`a11y tests: ${checks} checks passed`);
