/* Writer-built themes.

   The five shipped themes are whole worlds written by hand in theme.css.
   This file is the other half of the idea: a writer names five colors and
   we derive the other twenty-two, then set all twenty-seven as inline
   custom properties on <html> — exactly the trick personalize.ts already
   uses for accent. That's the whole reason no component and no stylesheet
   needs to know custom themes exist: anything reading var(--bg-pane)
   simply follows.

   Why five and not twenty-seven: asking a novelist for "border-strong"
   is asking them to do our job. Backgrounds, text and accent are the
   decisions a person actually holds an opinion about; hover states,
   muted text and entity colors are arithmetic, and arithmetic belongs in
   code.

   Everything above the STORAGE line is pure, so test-themes.ts can run it
   in Node. Nothing in this file touches localStorage or the DOM at module
   load, for the same reason — the one top-level side effect is handing
   personalize.ts a callback, which touches neither. */

import {
  loadPersonalization,
  readableOn,
  setAccentFallback,
  softOf,
} from "./personalize";

export interface CustomThemeColors {
  /** The window behind everything. */
  bgApp: string;
  /** Panes, cards, menus — every raised surface. */
  bgPane: string;
  /** The page itself, under the prose. */
  bgEditor: string;
  /** Prose and chrome text. Honored only if it can be read — see below. */
  fgPrimary: string;
  /** The one color everything points at. */
  accent: string;
}

export interface CustomTheme {
  id: string;
  name: string;
  /** Optional — a writer's note to themselves. Shown in the picker. */
  blurb: string;
  colors: CustomThemeColors;
  createdAt: number;
  updatedAt: number;
}

/** Custom ids are prefixed so any id can be classified without a lookup —
    including a stored "novella.theme" value whose theme was deleted. */
export const CUSTOM_PREFIX = "custom-";

export const NAME_MAX = 40;
export const BLURB_MAX = 120;

/** Ember's own five, used when a color can't be parsed and as the seed
    for a new theme if the document can't be read. */
export const FALLBACK_COLORS: CustomThemeColors = {
  bgApp: "#100e10",
  bgPane: "#1f1b1f",
  bgEditor: "#131113",
  fgPrimary: "#f2e9dd",
  accent: "#e8a33d",
};

/** The five questions in the order the editor asks them. Labels live with
    the model so the React side stays a renderer. */
export const COLOR_FIELDS: {
  key: keyof CustomThemeColors;
  label: string;
  hint: string;
}[] = [
  { key: "bgApp", label: "Behind everything", hint: "The window itself" },
  { key: "bgPane", label: "Panes and cards", hint: "Every raised surface" },
  { key: "bgEditor", label: "The page", hint: "Where your prose sits" },
  { key: "fgPrimary", label: "Text", hint: "Nudged if it can't be read" },
  { key: "accent", label: "Accent", hint: "Buttons, caret, highlights" },
];

/* ============================================================
   color math — pure
   ============================================================ */

const HEX6 = /^#?([0-9a-f]{6})$/i;
const HEX3 = /^#?([0-9a-f]{3})$/i;

/** "#ABC" / "aabbcc" / "#AABBCC" → "#aabbcc". null when it isn't a color.
    Accepting shorthand matters because writers paste from anywhere. */
export function normalizeHex(input: string): string | null {
  const s = (input ?? "").trim();
  const six = HEX6.exec(s);
  if (six) return `#${six[1]!.toLowerCase()}`;
  const three = HEX3.exec(s);
  if (three) {
    const t = three[1]!.toLowerCase();
    return `#${t[0]}${t[0]}${t[1]}${t[1]}${t[2]}${t[2]}`;
  }
  return null;
}

function channels(hex: string): [number, number, number] {
  const n = parseInt((normalizeHex(hex) ?? "#000000").slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function toHex(r: number, g: number, b: number): string {
  const n = (clamp255(r) << 16) | (clamp255(g) << 8) | clamp255(b);
  return `#${n.toString(16).padStart(6, "0")}`;
}

/** Blend two colors in sRGB. t=0 is all `a`, t=1 is all `b`.
    Not gamma-correct, and deliberately so: it matches how the shipped
    themes were eyeballed, which is the look we're deriving toward. */
export function mixHex(a: string, b: string, t: number): string {
  const k = Math.max(0, Math.min(1, t));
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return toHex(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminanceOf(hex: string): number {
  const [r, g, b] = channels(hex);
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Plain sRGB channel distance — the right question for "are these two
    surfaces the same color", which contrast ratio answers badly at both
    ends of the range. */
export function channelDistance(a: string, b: string): number {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb);
}

/** WCAG contrast, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = luminanceOf(a);
  const lb = luminanceOf(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Does this theme want light shadows and dark text, or the reverse? */
export function isDarkHex(hex: string): boolean {
  return luminanceOf(hex) < 0.22;
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const rgb: [number, number, number] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  return toHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255);
}

/* ---- contrast safety ----

   The rule: a writer may choose any color, but nothing they choose is
   allowed to make their own words unreadable. readableOn() (personalize.ts)
   already answers "black or white on this?" for accent buttons; these two
   build on it so the same judgement governs every derived text token. */

/* The only two colors readableOn() ever returns — the app's near-black
   and near-white ink. Read off it rather than restated, so retuning them
   there retunes them here. */
const INK_DARK = readableOn("#ffffff");
const INK_LIGHT = readableOn("#000000");

/** readableOn(), corrected where it is provably wrong.

    readableOn judges by perceived luminance, which is the right call for
    a button label and costs nothing on the greys and browns the shipped
    themes use. On a saturated page it can misfire: #ff44ff reads as dark
    to that formula, so it picks the light ink and lands at a ratio of
    2.4 — unreadable. Here we take its answer unless the other ink
    measurably reads better, which puts a floor of about 4.0 under every
    background a writer can pick. */
export function bestOn(bg: string): string {
  const first = readableOn(bg);
  const other = first === INK_LIGHT ? INK_DARK : INK_LIGHT;
  return contrastRatio(other, bg) > contrastRatio(first, bg) ? other : first;
}

/** `fg` if it clears `min` against `bg`, otherwise the readable extreme. */
export function safeForeground(fg: string, bg: string, min = 4.5): string {
  return contrastRatio(fg, bg) >= min ? (normalizeHex(fg) ?? bestOn(bg)) : bestOn(bg);
}

/** Walk a derived color back toward readability until it clears `min`.
    Used for secondary/muted text and links, where flipping straight to
    black or white would throw away the writer's hue for no reason.

    Some backgrounds — a flat mid-grey being the classic — simply cannot
    carry a 4.5 ratio with either ink. In that case we stop compromising
    and take the most readable color available, so the guarantee this
    function makes is exact: never worse than the better ink. */
export function atLeast(fg: string, bg: string, min: number): string {
  const target = bestOn(bg);
  let out = normalizeHex(fg) ?? target;
  for (let i = 0; i < 6 && contrastRatio(out, bg) < min; i++) {
    out = mixHex(out, target, 0.35);
  }
  return contrastRatio(out, bg) < contrastRatio(target, bg) && contrastRatio(out, bg) < min
    ? target
    : out;
}

/* ---- entity colors ----
   The codex tints notes by kind, and every shipped theme keeps the same
   hue for each kind while moving lightness with the theme. Anchors read
   off the shipped palettes so a custom theme's codex feels like family;
   character always equals the accent, as it does in all five. */
const TYPE_ANCHORS: { name: string; hue: number; sat: number }[] = [
  { name: "location", hue: 107, sat: 0.24 },
  { name: "lore", hue: 278, sat: 0.3 },
  { name: "faction", hue: 20, sat: 0.56 },
  { name: "object", hue: 44, sat: 0.55 },
  { name: "chapter", hue: 341, sat: 0.45 },
  { name: "note", hue: 30, sat: 0.12 },
  { name: "prompt", hue: 208, sat: 0.28 },
];

/* ============================================================
   derivation — the twenty-two we work out ourselves
   ============================================================ */

/** Every token a theme.css block defines, as inline-style values.

    The list is exhaustive on purpose. A custom theme sets data-theme to
    an id no stylesheet matches, so the bare `:root` block (Ember) is what
    shows through underneath — any token we forgot here would silently be
    Ember's. Twenty-seven in, twenty-seven out. */
export function themeCssVars(colors: CustomThemeColors): Record<string, string> {
  const bgApp = normalizeHex(colors.bgApp) ?? FALLBACK_COLORS.bgApp;
  const raised = normalizeHex(colors.bgPane) ?? FALLBACK_COLORS.bgPane;
  const editor = normalizeHex(colors.bgEditor) ?? FALLBACK_COLORS.bgEditor;
  const accent = normalizeHex(colors.accent) ?? FALLBACK_COLORS.accent;
  const wanted = normalizeHex(colors.fgPrimary) ?? bestOn(bgApp);

  /* Text: the page wins. If the writer's text color can be read on both
     the page and the panes it stands; otherwise we fall back to whatever
     reads on the page, because prose is the thing you cannot afford to
     lose. Panes get the looser 4.0 — they carry labels, not chapters. */
  const fg =
    contrastRatio(wanted, editor) >= 4.5 && contrastRatio(wanted, raised) >= 4.0
      ? wanted
      : bestOn(editor);

  const dark = isDarkHex(bgApp);

  /* Panes sit between the window and the raised surface — the ratio the
     five shipped themes already use (Vellum: e9e0cd → f2ead9 → faf5e9). */
  const pane = mixHex(bgApp, raised, 0.6);

  /* Hover, active and borders all step toward the text rather than toward
     white — the one rule that works in a dark theme and a parchment one
     alike. The steps are bigger in light themes because they have to be:
     the same absolute shift that reads as a clear lift on near-black is
     invisible near white, which is exactly why Ember's hover is +8 and
     Vellum's is -24. These ratios are read off the shipped five. */
  const step = (base: string, darkT: number, lightT: number): string =>
    mixHex(base, fg, dark ? darkT : lightT);

  const hover = step(raised, 0.05, 0.11);
  const active = step(raised, 0.1, 0.17);

  const border = step(pane, 0.07, 0.15);
  const borderStrong = step(pane, 0.16, 0.26);

  const secondary = atLeast(mixHex(fg, pane, 0.3), pane, 4.0);
  const muted = atLeast(mixHex(fg, pane, 0.53), pane, 3.0);

  /* A link is the accent pulled a fifth of the way toward the text — how
     Ember gets #efb75f from #e8a33d and Vellum #8c4227 from #a9502f. */
  const link = atLeast(mixHex(accent, fg, 0.2), editor, 3.5);

  const lightness = dark ? 0.64 : 0.42;
  const types: Record<string, string> = { "--type-character": accent };
  for (const t of TYPE_ANCHORS) {
    types[`--type-${t.name}`] = hslToHex(t.hue, t.sat, lightness);
  }

  return {
    "--bg-app": bgApp,
    "--bg-pane": pane,
    "--bg-editor": editor,
    "--bg-raised": raised,
    "--bg-hover": hover,
    "--bg-active": active,

    "--fg-primary": fg,
    "--fg-secondary": secondary,
    "--fg-muted": muted,

    "--border": border,
    "--border-strong": borderStrong,

    "--accent": accent,
    "--accent-soft": softOf(accent),
    "--accent-fg": readableOn(accent),
    "--link": link,

    "--danger": hslToHex(2, 0.55, dark ? 0.58 : 0.44),
    "--success": hslToHex(96, 0.24, dark ? 0.58 : 0.4),

    /* Shadow sets are shared by brightness and already defined in
       theme.css's :root — point at them rather than restating them. */
    "--shadow-sm": dark ? "var(--shadow-dark-sm)" : "var(--shadow-light-sm)",
    "--shadow": dark ? "var(--shadow-dark)" : "var(--shadow-light)",
    "--shadow-lg": dark ? "var(--shadow-dark-lg)" : "var(--shadow-light-lg)",

    ...types,
  };
}

/** Names only — what has to be cleared when a built-in theme takes over. */
export const THEME_VAR_NAMES: string[] = Object.keys(themeCssVars(FALLBACK_COLORS));

/* ============================================================
   validation
   ============================================================ */

/** Hard problems: an empty list means the theme can be saved. */
export function validateTheme(draft: {
  name: string;
  blurb: string;
  colors: CustomThemeColors;
}): string[] {
  const problems: string[] = [];
  const name = (draft.name ?? "").trim();
  if (name.length === 0) problems.push("Give the theme a name.");
  if (name.length > NAME_MAX) problems.push(`Names stop at ${NAME_MAX} characters.`);
  if ((draft.blurb ?? "").trim().length > BLURB_MAX) {
    problems.push(`The description stops at ${BLURB_MAX} characters.`);
  }
  for (const field of COLOR_FIELDS) {
    if (!normalizeHex(draft.colors?.[field.key] ?? "")) {
      problems.push(`"${field.label}" isn't a color.`);
    }
  }
  return problems;
}

/** Soft problems: the theme saves anyway, but we say what we changed.
    Silently correcting a writer's color without telling them is how you
    make an app feel broken. */
export function contrastWarnings(colors: CustomThemeColors): string[] {
  const notes: string[] = [];
  const editor = normalizeHex(colors.bgEditor);
  const fg = normalizeHex(colors.fgPrimary);
  const accent = normalizeHex(colors.accent);
  const app = normalizeHex(colors.bgApp);
  if (editor && fg && contrastRatio(fg, editor) < 4.5) {
    notes.push("That text color can't be read on that page — it'll be adjusted until it can.");
  }
  /* Channel distance, not contrast ratio: two near-blacks are plainly
     different to the eye and nearly identical to the ratio, and Ember
     itself (#100e10 window, #131113 page) would fail a ratio test. */
  if (editor && app && channelDistance(app, editor) < 6) {
    notes.push("The page and the window are the same color, so the page won't read as a page.");
  }
  if (accent && editor && contrastRatio(accent, editor) < 2) {
    notes.push("The accent all but vanishes on the page. Links and the caret will be hard to spot.");
  }
  return notes;
}

/* ============================================================
   identity
   ============================================================ */

/** Injectable clock and randomness so the id scheme is testable. */
export function makeThemeId(now = Date.now(), rand = Math.random()): string {
  const stamp = now.toString(36);
  const salt = Math.floor(rand * 46_656)
    .toString(36)
    .padStart(3, "0");
  return `${CUSTOM_PREFIX}${stamp}${salt}`;
}

export function isCustomThemeId(id: string): boolean {
  return typeof id === "string" && id.startsWith(CUSTOM_PREFIX);
}

/** "Midnight" → "Midnight (copy)" → "Midnight (copy 2)". */
export function uniqueName(base: string, taken: string[]): string {
  const used = new Set(taken.map((n) => n.trim().toLowerCase()));
  if (!used.has(base.trim().toLowerCase())) return base;
  let candidate = `${base} (copy)`;
  let n = 2;
  while (used.has(candidate.trim().toLowerCase())) {
    candidate = `${base} (copy ${n})`;
    n++;
  }
  return candidate.slice(0, NAME_MAX);
}

export function makeCustomTheme(
  name: string,
  colors: CustomThemeColors,
  blurb = "",
  now = Date.now(),
  id = makeThemeId(now),
): CustomTheme {
  return { id, name, blurb, colors: { ...colors }, createdAt: now, updatedAt: now };
}

export function duplicateOf(
  theme: CustomTheme,
  taken: string[],
  now = Date.now(),
  id = makeThemeId(now),
): CustomTheme {
  return {
    ...theme,
    id,
    name: uniqueName(theme.name, taken),
    colors: { ...theme.colors },
    createdAt: now,
    updatedAt: now,
  };
}

/** localStorage is hand-editable and survives app versions, so anything
    coming back out of it is a stranger until proven otherwise. */
export function sanitizeTheme(raw: unknown): CustomTheme | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r["id"] === "string" ? r["id"] : "";
  const name = typeof r["name"] === "string" ? r["name"].slice(0, NAME_MAX) : "";
  if (!isCustomThemeId(id) || name.trim().length === 0) return null;

  const rawColors = (r["colors"] ?? {}) as Record<string, unknown>;
  const colors = {} as CustomThemeColors;
  for (const field of COLOR_FIELDS) {
    const value = rawColors[field.key];
    const hex = typeof value === "string" ? normalizeHex(value) : null;
    if (!hex) return null;
    colors[field.key] = hex;
  }

  const createdAt = typeof r["createdAt"] === "number" ? r["createdAt"] : 0;
  return {
    id,
    name,
    blurb: typeof r["blurb"] === "string" ? r["blurb"].slice(0, BLURB_MAX) : "",
    colors,
    createdAt,
    updatedAt: typeof r["updatedAt"] === "number" ? r["updatedAt"] : createdAt,
  };
}

/** Newest-first is wrong here: a theme list is a shelf, and shelves are
    alphabetical so the same theme is in the same place every time. */
export function sortThemes(themes: CustomTheme[]): CustomTheme[] {
  return [...themes].sort((a, b) => a.name.localeCompare(b.name));
}

/* ============================================================
   STORAGE — everything below here touches localStorage or the DOM
   ============================================================ */

const THEMES_KEY = "novella.customThemes";
const SWATCH_KEY = "novella.accentSwatches";

/** Parsed once and kept: the list is read on every render of the picker. */
let cache: CustomTheme[] | null = null;
let version = 0;
const listeners = new Set<() => void>();

function readList(): CustomTheme[] {
  try {
    const raw = JSON.parse(localStorage.getItem(THEMES_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return sortThemes(raw.map(sanitizeTheme).filter((t): t is CustomTheme => t !== null));
  } catch {
    return [];
  }
}

function writeList(themes: CustomTheme[]): void {
  // Sanitize on the way IN as well as out: readList already drops junk,
  // but sorting an unsanitized object throws before it can ever be
  // repaired, which would take the theme picker down with it.
  cache = sortThemes(themes.map(sanitizeTheme).filter((t): t is CustomTheme => t !== null));
  try {
    localStorage.setItem(THEMES_KEY, JSON.stringify(cache));
  } catch {
    /* Quota or a locked-down webview: the themes still work this session. */
  }
  version++;
  for (const l of listeners) l();
}

export function loadCustomThemes(): CustomTheme[] {
  if (!cache) cache = readList();
  return cache;
}

export function customThemeById(id: string): CustomTheme | undefined {
  if (!isCustomThemeId(id)) return undefined;
  return loadCustomThemes().find((t) => t.id === id);
}

export function saveCustomTheme(theme: CustomTheme): void {
  const rest = loadCustomThemes().filter((t) => t.id !== theme.id);
  writeList([...rest, { ...theme, updatedAt: Date.now() }]);
}

export function deleteCustomTheme(id: string): void {
  writeList(loadCustomThemes().filter((t) => t.id !== id));
}

export function subscribeCustomThemes(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Snapshot for useSyncExternalStore — a number, so React can compare it. */
export function customThemesVersion(): number {
  return version;
}

/* ---- applying ---- */

/** The custom theme currently painted on the document, if any. Kept so
    the accent fallback below knows what to restore. */
let active: CustomTheme | null = null;

/** Paint a custom theme, or clear back to the stylesheet's own tokens.
    Inline properties on <html> beat every rule in theme.css, which is
    what makes an id no stylesheet has ever heard of work at all. */
export function applyCustomTheme(theme: CustomTheme | null): void {
  const root = document.documentElement.style;
  active = theme;
  if (!theme) {
    for (const name of THEME_VAR_NAMES) root.removeProperty(name);
    return;
  }
  const vars = themeCssVars(theme.colors);
  for (const name of THEME_VAR_NAMES) {
    const value = vars[name];
    if (value) root.setProperty(name, value);
  }
  /* Accent is the one token both layers own. The writer's own accent
     choice is the more specific statement — they picked it after the
     theme — so it goes back on top. */
  applyAccentOverride();
}

function applyAccentOverride(): void {
  const chosen = loadPersonalization().accent;
  const hex = chosen ? normalizeHex(chosen) : null;
  if (!hex) return;
  const root = document.documentElement.style;
  root.setProperty("--accent", hex);
  root.setProperty("--accent-soft", softOf(hex));
  root.setProperty("--accent-fg", readableOn(hex));
}

/* Clearing the accent override used to mean "fall back to the
   stylesheet", and for the five built-ins it still does. A custom theme
   has no stylesheet to fall back to, so personalize.ts asks us what the
   accent should be instead of leaving the document on Ember's gold.
   Registering here (rather than importing upward) keeps personalize.ts
   the lower layer with no knowledge of this file. */
setAccentFallback(() => {
  if (!active) return;
  const vars = themeCssVars(active.colors);
  const root = document.documentElement.style;
  for (const name of ["--accent", "--accent-soft", "--accent-fg"]) {
    const value = vars[name];
    if (value) root.setProperty(name, value);
  }
});

/** The colors currently on screen, for seeding a new theme from whatever
    the writer is already looking at. Reading the live custom properties
    means this works for built-ins and custom themes alike. */
export function currentThemeColors(): CustomThemeColors {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string): string =>
    normalizeHex(styles.getPropertyValue(name)) ?? fallback;
  return {
    bgApp: read("--bg-app", FALLBACK_COLORS.bgApp),
    bgPane: read("--bg-raised", FALLBACK_COLORS.bgPane),
    bgEditor: read("--bg-editor", FALLBACK_COLORS.bgEditor),
    fgPrimary: read("--fg-primary", FALLBACK_COLORS.fgPrimary),
    accent: read("--accent", FALLBACK_COLORS.accent),
  };
}

/* ============================================================
   saved accent swatches
   ============================================================ */

/** A writer who mixes the exact green of their cover shouldn't have to
    find it again next month. Same storage rationale as personalize.ts:
    taste lives with the machine, not with the book. */
export const MAX_SAVED_SWATCHES = 12;

export function loadSavedSwatches(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SWATCH_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return dedupeSwatches(raw.filter((v): v is string => typeof v === "string"));
  } catch {
    return [];
  }
}

/** Pure: normalize, drop anything unparseable, keep first occurrence. */
export function dedupeSwatches(list: string[]): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const hex = normalizeHex(raw);
    if (hex && !out.includes(hex)) out.push(hex);
  }
  return out.slice(0, MAX_SAVED_SWATCHES);
}

/** Pure half of saving, so the ordering rule is testable: newest first,
    because the color you just mixed is the one you'll reach for next. */
export function withSwatch(list: string[], hex: string): string[] {
  const normalized = normalizeHex(hex);
  if (!normalized) return dedupeSwatches(list);
  return dedupeSwatches([normalized, ...list]);
}

export function withoutSwatch(list: string[], hex: string): string[] {
  const normalized = normalizeHex(hex);
  return dedupeSwatches(list).filter((h) => h !== normalized);
}

function writeSwatches(list: string[]): string[] {
  try {
    localStorage.setItem(SWATCH_KEY, JSON.stringify(list));
  } catch {
    /* Same as themes: a failed write costs persistence, not the session. */
  }
  return list;
}

export function saveSwatch(hex: string): string[] {
  return writeSwatches(withSwatch(loadSavedSwatches(), hex));
}

export function removeSwatch(hex: string): string[] {
  return writeSwatches(withoutSwatch(loadSavedSwatches(), hex));
}
