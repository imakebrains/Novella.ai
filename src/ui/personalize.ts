/* Per-user looks: accent color, prose font, prose size.

   Themes pick a whole mood; these tune it. Overrides are inline CSS
   variables on <html>, so they win over every theme without touching
   theme.css, and clearing them falls straight back to the theme.
   Stored in localStorage — this is taste, not book data, so it stays
   with the machine rather than the project. */

export interface Personalization {
  /** Hex like "#e8a33d". Absent = the theme's own accent. */
  accent?: string;
  proseFont?: "serif" | "sans" | "mono";
  /** Editor prose size in px. Absent = the theme default (17). */
  proseSize?: number;
}

const KEY = "novella.personalize";

const FONT_STACKS: Record<NonNullable<Personalization["proseFont"]>, string> = {
  serif: `"Iowan Old Style", "Palatino Linotype", Georgia, serif`,
  sans: `ui-sans-serif, system-ui, "Segoe UI", -apple-system, sans-serif`,
  mono: `ui-monospace, "Cascadia Code", "Consolas", monospace`,
};

export function loadPersonalization(): Personalization {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Personalization;
  } catch {
    return {};
  }
}

export function savePersonalization(p: Personalization): void {
  localStorage.setItem(KEY, JSON.stringify(p));
  applyPersonalization(p);
}

export function resetPersonalization(): void {
  localStorage.removeItem(KEY);
  applyPersonalization({});
}

/** Black or white, whichever reads on the given hex background. */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#131113";
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // Perceived luminance (ITU-R BT.709-ish, good enough for a button).
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 140 ? "#131113" : "#f5f0ea";
}

/** Soft wash version of the accent for backgrounds. */
function softOf(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "rgb(128 128 128 / 0.12)";
  const n = parseInt(m[1]!, 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / 0.13)`;
}

export function applyPersonalization(p: Personalization): void {
  const root = document.documentElement.style;
  if (p.accent && /^#?[0-9a-f]{6}$/i.test(p.accent.trim())) {
    const hex = p.accent.startsWith("#") ? p.accent : `#${p.accent}`;
    root.setProperty("--accent", hex);
    root.setProperty("--accent-soft", softOf(hex));
    root.setProperty("--accent-fg", readableOn(hex));
  } else {
    root.removeProperty("--accent");
    root.removeProperty("--accent-soft");
    root.removeProperty("--accent-fg");
  }

  if (p.proseFont && p.proseFont !== "serif") {
    root.setProperty("--font-prose", FONT_STACKS[p.proseFont]);
  } else {
    root.removeProperty("--font-prose");
  }

  if (typeof p.proseSize === "number" && p.proseSize >= 14 && p.proseSize <= 24) {
    root.setProperty("--text-prose", `${p.proseSize / 16}rem`);
  } else {
    root.removeProperty("--text-prose");
  }
}

/** Call once at boot so saved taste applies before first paint matters. */
export function bootPersonalization(): void {
  applyPersonalization(loadPersonalization());
}
