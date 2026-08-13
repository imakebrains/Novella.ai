import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  glowModeOf,
  loadPersonalization,
  personalizationVersion,
  subscribePersonalization,
} from "./personalize";

/* Ambient glow — the intro's warm radial, given a life of its own.

   Two moods: "follow" eases after the cursor like a light source held a
   beat behind the hand; "drift" wanders a slow figure-eight on its own.
   Heavy CSS blur on the orb removes gradient banding on dark surfaces
   (the visible-rings complaint). soft-light blending keeps text legible,
   pointer-events never intercept, and reduced motion means it simply
   does not exist — a stationary spotlight helps no one. */

export function AmbientGlow() {
  useSyncExternalStore(subscribePersonalization, personalizationVersion, personalizationVersion);
  const mode = glowModeOf(loadPersonalization());
  const enabled =
    mode !== "off" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const layer = useRef<HTMLDivElement>(null);
  const target = useRef({ x: window.innerWidth / 2, y: window.innerHeight * 0.4 });
  const pos = useRef({ ...target.current });

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let t = 0;
    const onMove = (e: PointerEvent) => {
      if (mode === "follow") target.current = { x: e.clientX, y: e.clientY };
    };
    const step = () => {
      if (mode === "drift") {
        // A slow Lissajous wander — organic, never a loop you can spot.
        t += 0.0016;
        target.current = {
          x: window.innerWidth * (0.5 + 0.34 * Math.sin(t)),
          y: window.innerHeight * (0.45 + 0.3 * Math.sin(t * 0.73 + 1.7)),
        };
      }
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
  }, [enabled, mode]);

  if (!enabled) return null;
  return (
    <div className="ambient-glow" aria-hidden>
      <div ref={layer} className="ambient-glow-orb" />
    </div>
  );
}
