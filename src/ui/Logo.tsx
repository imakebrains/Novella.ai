import { useEffect, useRef, useState } from "react";
import markLight from "../assets/logo-mark-light.png?inline";
import markDark from "../assets/logo-mark-dark.png?inline";
import { reducedMotion } from "./personalize";
import { useTheme } from "./useTheme";

/* The Novella mark: two gates standing open, a path running between them.

   Two files, never a tinted one. The brand blue is beautiful on a
   press sheet and illegible on half of the five themes, so chrome uses
   the plain cream mark on dark grounds and the charcoal mark on light
   ones. `info.dark` is the same flag the theme picker sorts by, and
   custom themes derive it from their own background, so a writer's
   invented theme gets the right mark without registering anything.

   The animation is the logo's own story: the gates start shut, swing
   apart, and the path draws itself upward between them. It is built by
   clipping ONE image three ways rather than by redrawing the artwork,
   so it can never drift from the real mark. The boundaries are measured
   from the artwork's alpha: gates occupy the outer quarters, the path
   the middle half. */

const GATE = 25; // percent of the mark each gate leaf occupies

export function Logo({
  size = 22,
  animate = false,
  className = "",
}: {
  size?: number;
  /** Play the gates-opening sequence once on mount. */
  animate?: boolean;
  className?: string;
}) {
  const { info } = useTheme();
  const src = info.dark ? markLight : markDark;

  // Reduced motion gets the finished mark, not a frozen half-open gate.
  const [playing, setPlaying] = useState(() => animate && !reducedMotion());
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!playing) return;
    timer.current = window.setTimeout(() => setPlaying(false), 1600);
    return () => window.clearTimeout(timer.current);
  }, [playing]);

  if (!playing) {
    return (
      <img
        src={src}
        className={`logo-mark ${className}`}
        style={{ height: size }}
        alt=""
        aria-hidden
        draggable={false}
      />
    );
  }

  const layer = (part: "gate-left" | "path" | "gate-right") => (
    <span
      className={`logo-part logo-${part}`}
      style={{ backgroundImage: `url(${src})` }}
    />
  );

  return (
    <span
      className={`logo-mark logo-opening ${className}`}
      style={{ height: size, width: size, ["--gate" as string]: `${GATE}%` }}
      aria-hidden
    >
      {layer("gate-left")}
      {layer("path")}
      {layer("gate-right")}
    </span>
  );
}
