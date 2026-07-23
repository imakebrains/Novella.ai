import { useEffect, useState, type RefObject } from "react";

/* Tells a component whether its scroller has more content off each
   horizontal edge, so it can draw a fade — a chart that scrolls with no
   hint reads as "that's all of it", which at 60 chapters is a lie. */

export function useScrollEdges(
  ref: RefObject<HTMLElement | null>,
  /** Anything that changes the content's width — pass e.g. row count. */
  contentKey?: unknown,
): { left: boolean; right: boolean } {
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const left = el.scrollLeft > 8;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 8;
      setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
    // contentKey is exactly the "content changed size" signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, contentKey]);

  return edges;
}
