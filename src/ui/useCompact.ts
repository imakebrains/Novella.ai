import { useEffect, useState } from "react";

/* One pane, or three.

   The workspace is a three-column grid whose track list is built as an
   INLINE style in App.tsx, which means no stylesheet can override it. At
   375px it asks for 268 + 9 + 9 + 340 = 626px of fixed track, so the
   editor's `minmax(0, 1fr)` resolves to zero and the writer gets a
   titlebar and nothing else. Even dragging both panes to their 180px
   minimum still needs 378px.

   So the fix cannot be CSS. Below the breakpoint the grid has to stop
   being a grid, and that decision has to be made in JavaScript, next to
   the code that writes the track list.

   899px, not 768: the breakpoint already in app.css is 900px, and having
   two breakpoints a hundred pixels apart is how a layout ends up broken
   in a band nobody tests. */

export const COMPACT_MAX = 899;

/** Pure, so the breakpoint can be asserted without a window. */
export function isCompactWidth(px: number): boolean {
  return px <= COMPACT_MAX;
}

export const COMPACT_QUERY = `(max-width: ${COMPACT_MAX}px)`;

/**
 * True when the window is too narrow for three columns.
 *
 * Reads matchMedia rather than a resize listener: the browser already
 * knows the answer and only tells us when it changes, instead of once per
 * frame during a drag.
 */
export function useCompact(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(COMPACT_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(COMPACT_QUERY);
    const read = () => setCompact(mq.matches);

    mq.addEventListener("change", read);
    // Belt as well as braces. A `change` event is the right signal and is
    // what fires for a real resize or rotation, but it was observed not to
    // arrive when the viewport was changed programmatically — the app then
    // sat in the wrong layout while both matchMedia and the stylesheet had
    // already switched. `resize` costs one boolean read and closes that
    // gap; setCompact with an unchanged value is a no-op in React, so the
    // duplicate signal never causes a duplicate render.
    window.addEventListener("resize", read);

    // And once now: the window can have been resized between the initial
    // state and this effect running — a real case on a phone that rotates
    // during load.
    read();

    return () => {
      mq.removeEventListener("change", read);
      window.removeEventListener("resize", read);
    };
  }, []);

  return compact;
}

/** Which pane is showing as a drawer, when compact. */
export type Drawer = "codex" | "tools" | null;

/**
 * What the drawer should be after a request to show `want`.
 *
 * Pure because the rule is not obvious and is worth asserting: asking for
 * the pane that is already open closes it (the titlebar button is a
 * toggle in both layouts), and asking for the other one swaps straight to
 * it rather than closing and making the writer tap twice.
 */
export function nextDrawer(current: Drawer, want: Exclude<Drawer, null>): Drawer {
  return current === want ? null : want;
}
