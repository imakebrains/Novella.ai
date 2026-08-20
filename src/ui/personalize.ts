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
  /** Line spacing in the editor. Absent = 1.75. */
  leading?: number;
  /** How wide the page of text runs. Absent = "standard". */
  measure?: "narrow" | "standard" | "wide";
  /** Rounded is the theme default; sharp squares everything off. */
  corners?: "rounded" | "sharp";
  /** Ambient glow: a soft accent light that follows the cursor. Off by
      default — it's a mood, not a requirement. */
  glow?: boolean;
  /** "follow" tracks the cursor; "drift" wanders on its own. The old
      boolean `glow` reads as "follow" — see glowModeOf(). */
  glowMode?: "off" | "follow" | "drift";
  /** A backdrop image (data URL, downscaled at upload). Surfaces go
      frosted-glass over it — see .has-backdrop in app.css. */
  bgImage?: string;
  /** Motion: "auto" follows the OS reduced-motion flag, "full" plays
      everything regardless, "minimal" strips it regardless. Windows
      machines tuned for gaming often have OS animations off, which was
      silently flattening the whole app for those writers. */
  motion?: "auto" | "full" | "minimal";
  /** Motion blur: the soft focus scenes and titles pass THROUGH as they
      move. Absent = on. Deliberately not the same switch as the frosted
      glass on surfaces, which is a static look rather than a movement,
      and which people tend to want kept. */
  motionBlur?: boolean;
  /** Schema version of the STORED blob, stamped by migrate(). Absent
      means it predates any migration. */
  v?: number;
}

/** Bump when a stored value needs moving. See migrate(). */
const SCHEMA = 2;

/** Effective motion mode, OS flag included — pure given its inputs. */
export function motionModeOf(p: Personalization): "auto" | "full" | "minimal" {
  return p.motion === "full" || p.motion === "minimal" ? p.motion : "auto";
}

/** True when the OS asks for stillness but the app is playing motion —
    the one case where we owe the writer an explanation. */
export function overridingReducedMotion(): boolean {
  return (
    motionModeOf(loadPersonalization()) === "full" &&
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Should animation be suppressed right now? */
export function reducedMotion(): boolean {
  const mode = motionModeOf(loadPersonalization());
  if (mode === "full") return false;
  if (mode === "minimal") return true;
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** One place decides what the glow does, old flag included. */
export function glowModeOf(p: Personalization): "off" | "follow" | "drift" {
  if (p.glowMode) return p.glowMode;
  return p.glow === true ? "follow" : "off";
}

const KEY = "novella.personalize";

const FONT_STACKS: Record<NonNullable<Personalization["proseFont"]>, string> = {
  serif: `"Iowan Old Style", "Palatino Linotype", Georgia, serif`,
  sans: `ui-sans-serif, system-ui, "Segoe UI", -apple-system, sans-serif`,
  mono: `ui-monospace, "Cascadia Code", "Consolas", monospace`,
};

/* The shipped look (owner-tuned, 2026-08): book serif at 14px with
   1.4 spacing on a standard page. Every field is still the writer's to
   change; these are the values a fresh install wakes up with. */
export const DEFAULTS: Personalization = {
  proseFont: "serif",
  proseSize: 14,
  leading: 1.4,
  measure: "standard",
  corners: "rounded",
  /* Animations play by default.

     "auto" (follow the OS) was the old default and it silently flattened
     the app for a large group of Windows writers: the OS "animation
     effects" toggle is a general visual-effects/performance switch that
     is off on countless machines whose owners never asked for stillness,
     and when it is off the webview reports prefers-reduced-motion and
     every transition in the app is stripped. People who genuinely need
     reduced motion still get it in one click — Settings → Appearance →
     Motion → Follow system — and when the OS asks for reduce while we
     are playing full, the app says so out loud (see App.tsx). */
  motion: "full",
};

/**
 * Move stored values that a change of default cannot reach.
 *
 * Pure: it never writes. Every read comes back migrated, and the next
 * savePersonalization carries the stamp to disk — so nothing has to
 * happen at boot, and a read is still just a read.
 *
 * The motion case is why this exists. "auto" was the old default and it
 * was written into everyone's storage explicitly, so `{...DEFAULTS,
 * ...stored}` merges the new default straight underneath it: the app
 * kept following the OS for every writer who had ever opened it before,
 * and on a machine with Windows animation effects off that means every
 * animation in the app is stripped — including the tour clips, which
 * then look broken rather than still.
 *
 * The stamp is what makes this safe to do once. A writer who chooses
 * Follow system AFTER this ships saves with v === SCHEMA, and is never
 * second-guessed again.
 */
function migrate(stored: Personalization): Personalization {
  const p: Personalization = { ...DEFAULTS, ...stored };
  if ((stored.v ?? 0) < 2 && (stored.motion ?? "auto") === "auto") p.motion = "full";
  p.v = SCHEMA;
  return p;
}

export function loadPersonalization(): Personalization {
  try {
    return migrate(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Personalization);
  } catch {
    return { ...DEFAULTS, v: SCHEMA };
  }
}

/** Is motion blur on? Absent means yes — it is the app's normal look. */
export function motionBlurOn(p: Personalization = loadPersonalization()): boolean {
  return p.motionBlur !== false;
}

const listeners = new Set<() => void>();
let version = 0;
export function subscribePersonalization(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function personalizationVersion(): number {
  return version;
}

export function savePersonalization(p: Personalization): void {
  localStorage.setItem(KEY, JSON.stringify(p));
  applyPersonalization(p);
  version++;
  for (const l of listeners) l();
}

export function resetPersonalization(): void {
  localStorage.removeItem(KEY);
  // Reset lands on the shipped defaults, not the raw theme values —
  // loadPersonalization() now merges DEFAULTS under whatever is stored.
  applyPersonalization(loadPersonalization());
  version++;
  for (const l of listeners) l();
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

/** Soft wash version of the accent for backgrounds.
    Exported so custom themes (customThemes.ts) derive --accent-soft the
    same way rather than inventing a second, slightly different wash. */
export function softOf(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "rgb(128 128 128 / 0.12)";
  const n = parseInt(m[1]!, 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / 0.13)`;
}

/* Clearing the accent override means "fall back to the theme". For the
   five built-ins that's automatic — removing the inline property reveals
   the value theme.css set. A writer's own theme has no stylesheet to
   reveal, so customThemes.ts registers a callback here that re-states its
   accent. Registered rather than imported so this file stays the lower
   layer and knows nothing about custom themes. */
let accentFallback: (() => void) | null = null;
export function setAccentFallback(fn: (() => void) | null): void {
  accentFallback = fn;
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
    accentFallback?.();
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

  if (typeof p.leading === "number" && p.leading >= 1.3 && p.leading <= 2.4) {
    root.setProperty("--prose-leading", String(p.leading));
  } else {
    root.removeProperty("--prose-leading");
  }

  const MEASURES = { narrow: "34rem", standard: "42rem", wide: "54rem" } as const;
  if (p.measure && p.measure !== "standard") {
    root.setProperty("--editor-measure", MEASURES[p.measure]);
  } else {
    root.removeProperty("--editor-measure");
  }

  document.documentElement.classList.toggle("has-backdrop", !!p.bgImage);

  const motionMode = motionModeOf(p);
  document.documentElement.classList.toggle("motion-full", motionMode === "full");
  document.documentElement.classList.toggle("motion-minimal", motionMode === "minimal");

  // Scales every blur that happens DURING a movement to zero, leaving the
  // frosted glass and the ambient glow alone — those are a look, not a
  // movement, and the writer asked for them.
  document.documentElement.classList.toggle("no-motion-blur", p.motionBlur === false);

  if (p.corners === "sharp") {
    root.setProperty("--radius-sm", "3px");
    root.setProperty("--radius-md", "4px");
    root.setProperty("--radius-lg", "6px");
  } else {
    root.removeProperty("--radius-sm");
    root.removeProperty("--radius-md");
    root.removeProperty("--radius-lg");
  }
}

/** Call once at boot so saved taste applies before first paint matters. */
export function bootPersonalization(): void {
  applyPersonalization(loadPersonalization());
}
