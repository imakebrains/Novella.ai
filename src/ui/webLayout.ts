/* Geometry for the relationship web.

   Split out of RelationshipWeb.tsx so the crowding rule can be tested in
   Node without dragging React, the vault and localStorage along with it —
   the same reason diff.ts lives apart from HistoryPanel.

   The rule this file exists to enforce: labels must never collide. The
   first version put every entry on one circle, which looked fine on the
   demo world and fell apart at 44 entries with a quarter of the names
   overlapping. Rather than cap the map or shrink text until it's unreadable,
   the CANVAS grows with the cast: density stays constant, and a big bible
   simply draws a bigger map that the view scales to fit. */

/** Longest name drawn before it's clipped with an ellipsis. Without a cap,
    one operatic character name sets the spacing for the entire map. */
export const LABEL_MAX_CHARS = 16;
/** Font size the labels render at, in canvas units. */
export const LABEL_FONT = 13;

/** Arc one label needs before neighbours touch.

    Derived, not guessed: a clipped label is at most LABEL_MAX_CHARS + 1
    glyphs, and this font averages ~0.55em per glyph. The first version hard
    coded 92, which was narrower than the names it had to draw — the test
    passed and the screen still overlapped. Exported so the test measures
    the same box the renderer draws. */
export const ARC_PER_LABEL = Math.ceil((LABEL_MAX_CHARS + 1) * LABEL_FONT * 0.55) + 12;

/** Clip a name to the drawn width. The full name stays in the tooltip. */
export function clipLabel(text: string): string {
  return text.length > LABEL_MAX_CHARS ? `${text.slice(0, LABEL_MAX_CHARS - 1)}…` : text;
}
/** How much tighter each ring is than the one outside it. */
const RING_STEP = 0.74;
/** Rings deep enough to stay legible; more than this and the middle is mush. */
const MAX_RINGS = 4;
/** Never smaller than this, so a three-character bible isn't a dot. */
const MIN_OUTER = 320;
/** Room outside the outer ring for labels and the odd long name. */
const MARGIN = 78;

/** Comfortable label count for one ring at the minimum size. */
const PER_RING = 24;
/** Slack over the exact fit, so rounding can't tip two labels into contact. */
const HEADROOM = 1.12;

/** Combined capacity multiplier of `n` rings: 1 + .74 + .74² … */
function ringSum(n: number): number {
  let total = 0;
  for (let i = 0; i < n; i++) total += Math.pow(RING_STEP, i);
  return total;
}

/** How many rings this cast wants. Decided from the count ALONE, before any
    radius — the first attempt sized the canvas for four rings and then drew
    three, which is exactly how 80 entries ended up overlapping. */
function ringCountFor(count: number): number {
  return Math.max(1, Math.min(MAX_RINGS, Math.ceil(count / PER_RING)));
}

export interface Placed {
  x: number;
  y: number;
  ring: number;
  /** Labels alternate above/below within a ring so neighbours interleave
      instead of butting heads. */
  below: boolean;
}

/** Radius the outermost ring needs to seat `count` labels across all rings
    without crowding. */
function outerRadius(count: number): number {
  const needed =
    (HEADROOM * count * ARC_PER_LABEL) / (2 * Math.PI * ringSum(ringCountFor(count)));
  return Math.max(MIN_OUTER, needed);
}

/** The square canvas this many entries needs. Grows with the cast so the
    label budget is always met; the SVG scales it down to the pane. */
export function webCanvasSize(count: number): number {
  return Math.round((outerRadius(count) + MARGIN) * 2);
}

/** Place `count` nodes across concentric rings, no two labels colliding.
    Pure geometry — no store, no DOM. */
export function ringPositions(count: number): Placed[] {
  if (count <= 0) return [];

  const size = webCanvasSize(count);
  const center = size / 2;
  const outer = outerRadius(count);

  // Same ring count the radius was sized for — these two must agree.
  const rings = Array.from({ length: ringCountFor(count) }, (_, i) =>
    outer * Math.pow(RING_STEP, i),
  );

  // Share out by circumference, so every ring is equally dense.
  const weights = rings.map((r) => r);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const share = weights.map((w) => Math.round((w / totalWeight) * count));
  let drift = count - share.reduce((s, n) => s + n, 0);
  for (let i = 0; drift !== 0; i = (i + 1) % share.length) {
    const step = drift > 0 ? 1 : -1;
    if (share[i]! + step >= 0) {
      share[i] = share[i]! + step;
      drift -= step;
    }
  }

  const out: Placed[] = [];
  rings.forEach((radius, ri) => {
    const n = share[ri] ?? 0;
    for (let i = 0; i < n; i++) {
      // Offset alternate rings by half a step so rings don't line up
      // radially and stack their labels on one another.
      const angle = ((i + (ri % 2 ? 0.5 : 0)) / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
      out.push({
        x: center + Math.cos(angle) * radius,
        y: center + Math.sin(angle) * radius,
        ring: ri,
        below: i % 2 === 0,
      });
    }
  });
  return out.slice(0, count);
}
