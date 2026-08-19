import { useCallback, useSyncExternalStore } from "react";
import {
  applyCustomTheme,
  customThemeById,
  customThemesVersion,
  isDarkHex,
  loadCustomThemes,
  subscribeCustomThemes,
  type CustomTheme,
} from "./customThemes";

/** The four shipped worlds, written by hand in theme.css. */
export type BuiltinTheme = "ember" | "vellum" | "nocturne" | "driftwood";

/* Writers can build their own themes now, and those carry generated ids,
   so Theme can no longer be a closed union. `string & {}` is the trick
   that keeps editor autocomplete offering the four built-ins while still
   accepting "custom-m4x9k2b" — a plain `string` would silently drop the
   suggestions everywhere Theme is used. */
export type Theme = BuiltinTheme | (string & {});

export interface ThemeInfo {
  id: Theme;
  name: string;
  blurb: string;
  dark: boolean;
  /** Swatch colours for the picker: background, surface, accent. */
  swatch: [string, string, string];
  /** True for a writer's own theme — the picker offers edit/delete. */
  custom?: boolean;
}

export const BUILTIN_THEMES: ThemeInfo[] = [
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
];

/* THEMES stays the single list every picker reads — Settings, the intro,
   the title-bar cycle. Custom themes are appended to it IN PLACE rather
   than returned from a new function, because the importers hold a
   reference to this array and replacing the binding would leave them
   showing four themes forever. */
export const THEMES: ThemeInfo[] = [...BUILTIN_THEMES];

function infoOf(t: CustomTheme): ThemeInfo {
  return {
    id: t.id,
    name: t.name,
    blurb: t.blurb || "Yours.",
    dark: isDarkHex(t.colors.bgApp),
    swatch: [t.colors.bgApp, t.colors.bgPane, t.colors.accent],
    custom: true,
  };
}

function refreshThemes(): void {
  THEMES.splice(BUILTIN_THEMES.length, THEMES.length, ...loadCustomThemes().map(infoOf));
}

function known(id: string): boolean {
  return THEMES.some((t) => t.id === id);
}

const KEY = "novella.theme";

/** No choice yet, or the chosen one is gone: follow the OS, but land on a
    real theme rather than an abstract "light mode". */
function osDefault(): Theme {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "vellum" : "ember";
}

function initial(): Theme {
  // Custom themes have to be in THEMES before the stored id is checked,
  // or a writer's own theme would look unknown on every launch.
  refreshThemes();
  const saved = localStorage.getItem(KEY);
  // Linen retired 2026-08 (a near-twin of Vellum) — anyone who had
  // chosen it lands on Vellum rather than a theme that no longer exists.
  if (saved === "linen") {
    localStorage.setItem(KEY, "vellum");
    return "vellum";
  }
  if (saved && known(saved)) return saved as Theme;
  return osDefault();
}

/* One shared store rather than per-component state.

   This was a bug: useTheme() previously held its own useState, so App and
   the Settings picker each had a private copy. Choosing a theme in
   Settings applied it to the document but left the title bar showing the
   old one, because nothing told App its value had changed. */

let current: Theme = initial();
const listeners = new Set<() => void>();

/* A custom theme is inline custom properties; a built-in is a stylesheet
   block keyed off data-theme. Every path that changes which theme is on
   screen goes through here so the two can never disagree — including
   paths outside this module (see the observer below). */
function paintVars(id: string): void {
  applyCustomTheme(customThemeById(id) ?? null);
}

function apply(theme: Theme): void {
  current = theme;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(KEY, theme);
  paintVars(theme);
  for (const l of listeners) l();
}

/* A deliberate theme change crossfades once; every other token swap —
   including first paint — stays instant. The class scopes the transition
   (see .theme-transitioning in app.css), and the editor's sacred
   no-animate rule still wins inside CodeMirror. */
let fadeTimer: ReturnType<typeof setTimeout> | null = null;
function applyWithCrossfade(theme: Theme): void {
  const root = document.documentElement;
  root.classList.add("theme-transitioning");
  apply(theme);
  if (fadeTimer) clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => root.classList.remove("theme-transitioning"), 450);
}

// Put the saved theme on the document before first paint — no crossfade.
apply(current);

/* WelcomeIntro previews a theme on hover by setting data-theme straight
   on the document — a preview, not a choice, so it deliberately doesn't
   come through setTheme. That works for the built-ins because they live
   entirely in CSS; a custom theme is inline variables the attribute can't
   reach. Watching the attribute keeps the variables in step with whoever
   set it, so no other file needs to learn that custom themes exist.
   (attributeFilter means inline style writes — including ours — don't
   re-enter this.) */
if (typeof MutationObserver !== "undefined") {
  new MutationObserver(() => {
    const shown = document.documentElement.getAttribute("data-theme");
    if (shown) paintVars(shown);
  }).observe(document.documentElement, { attributeFilter: ["data-theme"] });
}

/* Editing a custom theme has to repaint the document, and deleting the
   active one has to land somewhere real rather than on an id nothing
   matches. */
subscribeCustomThemes(() => {
  refreshThemes();
  if (!known(current)) {
    applyWithCrossfade(osDefault());
    return;
  }
  paintVars(current);
  for (const l of listeners) l();
});

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
  /* Renaming or recoloring the active custom theme changes what the title
     bar should say without changing which theme is active, so the list's
     version is a second input to this hook. */
  useSyncExternalStore(subscribeCustomThemes, customThemesVersion, customThemesVersion);

  const setTheme = useCallback((t: Theme) => applyWithCrossfade(t), []);

  /** The title-bar button steps through them — a picker lives in Settings. */
  const cycle = useCallback(() => {
    const i = THEMES.findIndex((t) => t.id === current);
    applyWithCrossfade(THEMES[(i + 1) % THEMES.length]!.id);
  }, []);

  const info = THEMES.find((t) => t.id === theme) ?? THEMES[0]!;
  return { theme, setTheme, cycle, info };
}

/** The writer's own themes, re-read whenever they change. Thin on
    purpose: everything it knows lives in customThemes.ts. */
export function useCustomThemes(): CustomTheme[] {
  useSyncExternalStore(subscribeCustomThemes, customThemesVersion, customThemesVersion);
  return loadCustomThemes();
}
