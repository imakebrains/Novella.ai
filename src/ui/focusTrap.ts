/* The arithmetic behind every dialog's focus trap.

   Kept apart from Modal.tsx so test-a11y.ts can run it headless: nothing
   here touches `document` at import time, and everything but focusableIn
   works on plain values. */

/* Everything that can take focus natively, plus anything given a
   tabindex. Negative tabindex is filtered by isTabbable rather than in
   the selector, so `[tabindex]` can stay one simple clause. */
export const FOCUSABLE_SELECTOR =
  'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable="true"]';

export type FocusCandidate = {
  hidden: boolean;
  disabled?: boolean;
  getAttribute(name: string): string | null;
};

/* Reads the tabindex attribute, not the `tabIndex` property: browsers
   disagree about the property on contenteditable and summary, but an
   explicit negative attribute means "not in the tab order" everywhere. */
export function isTabbable(el: FocusCandidate): boolean {
  if (el.hidden || el.disabled) return false;
  const index = el.getAttribute("tabindex");
  if (index !== null && Number(index) < 0) return false;
  if (el.getAttribute("type") === "hidden") return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  return true;
}

/* The layout check lives here and not in isTabbable because it is the one
   test that needs a real DOM — a display:none subtree (a collapsed
   section, ImportModal's hidden file input) has no client rects. */
export function focusableIn(root: ParentNode): HTMLElement[] {
  const all = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => isTabbable(el) && el.getClientRects().length > 0,
  );
  return oneStopPerRadioGroup(all, (el) =>
    el instanceof HTMLInputElement && el.type === "radio" && el.name
      ? { group: el.name, checked: el.checked }
      : null,
  );
}

/* A native radio group is one Tab stop — the checked button, or the first
   when none is — and the arrows move within it. Export's format list is
   one; without this the trap would walk all five formats one Tab at a time
   where the browser, untrapped, would not. */
export function oneStopPerRadioGroup<T>(
  list: readonly T[],
  radio: (item: T) => { group: string; checked: boolean } | null,
): T[] {
  const keep = new Map<string, T>();
  for (const item of list) {
    const r = radio(item);
    if (!r) continue;
    if (!keep.has(r.group) || r.checked) keep.set(r.group, item);
  }
  return list.filter((item) => {
    const r = radio(item);
    return !r || keep.get(r.group) === item;
  });
}

/* Where Tab goes next, wrapping at both ends. Focus that is not in the
   list — the dialog shell itself, or <body> after a focused button was
   disabled or unmounted — enters from the matching end. Generic so the
   tests can use strings. */
export function nextFocus<T>(list: readonly T[], current: T | null | undefined, shift: boolean): T | null {
  const n = list.length;
  if (n === 0) return null;
  const i = current == null ? -1 : list.indexOf(current);
  if (i < 0) return (shift ? list[n - 1] : list[0]) ?? null;
  return (shift ? list[(i - 1 + n) % n] : list[(i + 1) % n]) ?? null;
}

export type TrapAction = "close" | "forward" | "back";

type KeyLike = {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
};

/* Which keys a dialog owns. Escape mid-composition belongs to the IME
   (it cancels the candidate window, not the dialog), and Ctrl/Alt/Meta+Tab
   are the browser's and the OS's, never ours. */
export function trapKey(e: KeyLike): TrapAction | null {
  if (e.isComposing) return null;
  if (e.key === "Escape") return "close";
  if (e.key !== "Tab" || e.ctrlKey || e.altKey || e.metaKey) return null;
  return e.shiftKey ? "back" : "forward";
}

/* The topmost open dialog is the one opened last, by render order rather
   than by the order effects happen to run: React runs a child's effects
   before its parent's, so a dialog inside a dialog would otherwise
   register first and lose Escape to the one underneath it. */
export function topOf<L extends { order: number }>(layers: readonly L[]): L | null {
  let top: L | null = null;
  for (const layer of layers) if (!top || layer.order > top.order) top = layer;
  return top;
}
