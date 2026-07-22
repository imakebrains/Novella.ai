/* ============================================================
   Default cover art

   A new project deserves a face before its writer finds one. This
   draws an abstract banner — layered dune-shapes in hues seeded by
   the project's name, so "Ashcroft Hollow" always gets the same
   dusk and "River Test" always gets its own — as a small inline
   SVG data URL. No network, no assets, a few hundred bytes.

   It's filler by design: the moment a real cover is set, it's
   gone. Deterministic so project lists look stable, not random.
   ============================================================ */

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A tiny seeded PRNG (mulberry32) — Math.random would give a different
    banner every render. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An abstract SVG banner for a project name, as a data URL. */
export function defaultBanner(name: string): string {
  const rand = rng(hash(name.trim().toLowerCase() || "untitled"));
  const hue = Math.floor(rand() * 360);
  const hue2 = (hue + 25 + Math.floor(rand() * 40)) % 360;

  // Three layered "dunes" — cubic curves across the frame, deepening in
  // tone, plus a low haze sun. Reads as landscape-ish at a glance without
  // depicting anything in particular.
  const dune = (y: number, wobble: number, light: number, alpha: number): string => {
    const c1 = 240 + Math.floor(rand() * 160) - 80;
    const y1 = y + Math.floor(rand() * wobble) - wobble / 2;
    const c2 = 720 + Math.floor(rand() * 160) - 80;
    const y2 = y + Math.floor(rand() * wobble) - wobble / 2;
    return `<path d="M0 ${y} C ${c1} ${y1}, ${c2} ${y2}, 960 ${y} L 960 400 L 0 400 Z" fill="hsl(${hue2} 42% ${light}%)" opacity="${alpha}"/>`;
  };

  const sunX = 120 + Math.floor(rand() * 720);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 400">` +
    `<rect width="960" height="400" fill="hsl(${hue} 38% 24%)"/>` +
    `<circle cx="${sunX}" cy="${90 + Math.floor(rand() * 60)}" r="${46 + Math.floor(rand() * 30)}" fill="hsl(${hue} 62% 62%)" opacity="0.5"/>` +
    dune(190, 90, 34, 0.85) +
    dune(255, 70, 27, 0.9) +
    dune(320, 50, 19, 0.95) +
    `</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
