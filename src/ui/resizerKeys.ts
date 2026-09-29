/* Keyboard arithmetic for the pane separators, apart from Resizer.tsx so
   it can be tested headless. Returns a width delta, the same currency the
   pointer drag already hands to onResize, so the caller's clamp stays the
   single authority on the limits. */

export const RESIZE_STEP = 16;
export const RESIZE_STEP_BIG = 64;

export function resizeDelta(
  key: string,
  side: "left" | "right",
  shift: boolean,
  value: number | undefined,
  min: number,
  max: number,
): number | null {
  const step = shift ? RESIZE_STEP_BIG : RESIZE_STEP;
  // Same direction rule as the drag: rightwards grows a left pane and
  // shrinks a right one.
  if (key === "ArrowRight") return side === "left" ? step : -step;
  if (key === "ArrowLeft") return side === "left" ? -step : step;
  // Without a known width, overshoot by the whole range and let the clamp
  // land it — still exactly min or max.
  if (key === "Home") return value === undefined ? -(max - min) : min - value;
  if (key === "End") return value === undefined ? max - min : max - value;
  return null;
}
