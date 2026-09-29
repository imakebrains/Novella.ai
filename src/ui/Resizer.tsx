import { useCallback, useEffect, useRef, useState } from "react";
import { resizeDelta } from "./resizerKeys";

/* Draggable pane dividers.

   Pointer events rather than mouse events so it works with a trackpad,
   pen or touch, and setPointerCapture keeps the drag alive even when the
   cursor outruns the 4px handle — which it always does. */

const MIN = 180;
const MAX = 560;

export function usePaneWidth(key: string, initial: number) {
  const storageKey = `novella.pane.${key}`;

  const [width, setWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem(storageKey));
    return Number.isFinite(saved) && saved >= MIN && saved <= MAX ? saved : initial;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, String(width));
  }, [storageKey, width]);

  const clamp = useCallback((n: number) => Math.min(MAX, Math.max(MIN, n)), []);
  const reset = useCallback(() => setWidth(initial), [initial]);

  return { width, setWidth, clamp, reset };
}

export function Resizer({
  side,
  value,
  min = MIN,
  max = MAX,
  onResize,
  onReset,
}: {
  /** Which pane this handle belongs to — decides which way the delta runs. */
  side: "left" | "right";
  /** The pane's current width in px. Optional: without it the handle still
      resizes and Home/End still reach the limits through the caller's
      clamp — only aria-valuenow goes quiet. */
  value?: number;
  min?: number;
  max?: number;
  onResize: (delta: number) => void;
  onReset: () => void;
}) {
  // `dragging` is a ref, not state: state wouldn't be true until React
  // re-rendered, and the first pointermove events can arrive before that,
  // making the drag drop its opening frames. State is kept only for styling.
  const dragging = useRef(false);
  const [dragStyle, setDragStyle] = useState(false);
  const lastX = useRef(0);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    lastX.current = e.clientX;
    dragging.current = true;
    setDragStyle(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastX.current;
    lastX.current = e.clientX;
    // Dragging right grows a left pane and shrinks a right one.
    onResize(side === "left" ? dx : -dx);
  };

  const stop = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragging.current = false;
    setDragStyle(false);
  };

  // Keyboard resizing, because a 4px target is not an accessible control:
  // 16px per arrow, 64 with Shift, Home/End to the limits. The arithmetic
  // lives in resizerKeys.ts so test-a11y.ts can check it headless.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = resizeDelta(e.key, side, e.shiftKey, value, min, max);
    if (delta !== null) {
      e.preventDefault();
      onResize(delta);
    } else if (e.key === "Enter") {
      e.preventDefault();
      onReset();
    }
  };

  return (
    <div
      className={`resizer ${dragStyle ? "dragging" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${side} panel`}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      title="Drag to resize · arrows nudge · Home/End · double-click to reset"
    >
      <span className="resizer-grip" />
    </div>
  );
}
