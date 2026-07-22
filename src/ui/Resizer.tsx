import { useCallback, useEffect, useRef, useState } from "react";

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
  onResize,
  onReset,
}: {
  /** Which pane this handle belongs to — decides which way the delta runs. */
  side: "left" | "right";
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

  // Keyboard resizing, because a 4px target is not an accessible control.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 40 : 12;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onResize(side === "left" ? -step : step);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onResize(side === "left" ? step : -step);
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
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      title="Drag to resize · double-click to reset"
    >
      <span className="resizer-grip" />
    </div>
  );
}
