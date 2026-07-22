import { useCallback, useSyncExternalStore } from "react";

export type Theme = "ember" | "vellum" | "nocturne" | "driftwood" | "linen";

export interface ThemeInfo {
  id: Theme;
  name: string;
  blurb: string;
  dark: boolean;
  /** Swatch colours for the picker: background, surface, accent. */
  swatch: [string, string, string];
}

export const THEMES: ThemeInfo[] = [
  {
    id: "ember",
    name: "Ember",
    blurb: "Near-black and candlelight gold. Low light, still burning.",
    dark: true,
    swatch: ["#100e10", "#1f1b1f", "#e8a33d"],
  },
  {
    id: "vellum",
    name: "Vellum",
    blurb: "Parchment and bronze. Pressed flowers and old maps.",
    dark: false,
    swatch: ["#e9e0cd", "#faf5e9", "#a9502f"],
  },
  {
    id: "nocturne",
    name: "Nocturne",
    blurb: "Deep water and moonlight. Something below the surface.",
    dark: true,
    swatch: ["#0f151c", "#1b2733", "#f2a6b8"],
  },
  {
    id: "driftwood",
    name: "Driftwood",
    blurb: "Warm concrete and coffee. Soft, modern, unfussy.",
    dark: true,
    swatch: ["#262220", "#38322e", "#d9a68c"],
  },
  {
    id: "linen",
    name: "Linen",
    blurb: "Morning light and washed cotton. Quiet and uncluttered.",
    dark: false,
    swatch: ["#f3e6df", "#fffaf6", "#b5563a"],
  },
];

const KEY = "novella.theme";
const VALID = new Set<string>(THEMES.map((t) => t.id));

function initial(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved && VALID.has(saved)) return saved as Theme;
  // No choice yet: follow the OS, but land on a real theme rather than
  // an abstract "light mode".
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "vellum"
    : "ember";
}

/* One shared store rather than per-component state.

   This was a bug: useTheme() previously held its own useState, so App and
   the Settings picker each had a private copy. Choosing a theme in
   Settings applied it to the document but left the title bar showing the
   old one, because nothing told App its value had changed. */

let current: Theme = initial();
const listeners = new Set<() => void>();

function apply(theme: Theme): void {
  current = theme;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(KEY, theme);
  for (const l of listeners) l();
}

// Put the saved theme on the document before first paint.
apply(current);

const themeStore = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  get: (): Theme => current,
};

export function useTheme(): {
  theme: Theme;
  setTheme: (t: Theme) => void;
  cycle: () => void;
  info: ThemeInfo;
} {
  const theme = useSyncExternalStore(themeStore.subscribe, themeStore.get, themeStore.get);

  const setTheme = useCallback((t: Theme) => apply(t), []);

  /** The title-bar button steps through them — a picker lives in Settings. */
  const cycle = useCallback(() => {
    const i = THEMES.findIndex((t) => t.id === current);
    apply(THEMES[(i + 1) % THEMES.length]!.id);
  }, []);

  const info = THEMES.find((t) => t.id === theme) ?? THEMES[0]!;
  return { theme, setTheme, cycle, info };
}
