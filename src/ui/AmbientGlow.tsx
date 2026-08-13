import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  loadPersonalization,
  personalizationVersion,
  subscribePersonalization,
} from "./personalize";

/* Ambient glow — the intro's warm radial, kept on and given the mouse.

   A single accent-tinted light that drifts toward the cursor, easing the
   whole way (a light source, not a cursor decal). Opt-in from Settings →
   Appearance, off by default: it's a mood. soft-light blending keeps text
   legible on both dark and light themes, pointer-events never intercept,
   and the layer sits under every modal. Honors reduced motion by simply
   not existing — a stationary spotlight helps no one. */

export function AmbientGlow() {
  useSyncExternalStore(subscribePersonalization, personalizationVersion, personalizationVersion);
  const enabled =
    loadPersonalization().glow === true &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const layer = useRef<HTMLDivElement>(null);
  const target = useRef({ x: window.innerWidth / 2, y: window.innerHeight * 0.4 });
  const pos = useRef({ ...target.current });

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      target.current = { x: e.clientX, y: e.clientY };
    };
    const step = () => {
      // Ease at 8%/frame: far enough behind the cursor to read as light.
      pos.current.x += (target.current.x - pos.current.x) * 0.08;
      pos.current.y += (target.current.y - pos.current.y) * 0.08;
      if (layer.current) {
        layer.current.style.transform = `translate3d(${pos.current.x - 400}px, ${pos.current.y - 400}px, 0)`;
      }
      raf = requestAnimationFrame(step);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(step);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div className="ambient-glow" aria-hidden>
      <div ref={layer} className="ambient-glow-orb" />
    </div>
  );
}
