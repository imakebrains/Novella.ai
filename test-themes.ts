/* Assertion tests for writer-built themes.

   Same contract as test-units.ts: no output unless something is wrong,
   non-zero exit when it is. Kept in its own file because customThemes.ts
   is a self-contained layer and its invariant — a writer can pick any
   five colors and still be able to read their own book — deserves to be
   provable on its own.

   Only pure functions are exercised. The storage and apply halves of
   customThemes.ts need localStorage and a document; they're verified in
   the browser. */

import {
  BLURB_MAX,
  COLOR_FIELDS,
  CUSTOM_PREFIX,
  FALLBACK_COLORS,
  NAME_MAX,
  THEME_VAR_NAMES,
  atLeast,
  bestOn,
  channelDistance,
  contrastRatio,
  contrastWarnings,
  dedupeSwatches,
  duplicateOf,
  hslToHex,
  isCustomThemeId,
  isDarkHex,
  luminanceOf,
  makeCustomTheme,
  makeThemeId,
  mixHex,
  normalizeHex,
  sanitizeTheme,
  sortThemes,
  themeCssVars,
  uniqueName,
  validateTheme,
  withSwatch,
  withoutSwatch,
  type CustomThemeColors,
} from "./src/ui/customThemes";
import { readableOn } from "./src/ui/personalize";

let failures = 0;
let checks = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

function ok(name: string, condition: boolean): void {
  checks++;
  if (!condition) {
    failures++;
    console.error(`FAIL  ${name}`);
  }
}

/* ---------- hex parsing ---------- */

{
  check("hex: full form", normalizeHex("#AABBCC"), "#aabbcc");
  check("hex: no hash", normalizeHex("aabbcc"), "#aabbcc");
  check("hex: shorthand expands", normalizeHex("#abc"), "#aabbcc");
  check("hex: whitespace is forgiven", normalizeHex("  #E8A33D \n"), "#e8a33d");
  check("hex: nonsense is null", normalizeHex("rebeccapurple"), null);
  check("hex: wrong length is null", normalizeHex("#aabbc"), null);
  check("hex: empty is null", normalizeHex(""), null);
}

/* ---------- blending and luminance ---------- */

{
  check("mix: t=0 is the first color", mixHex("#102030", "#ffffff", 0), "#102030");
  check("mix: t=1 is the second", mixHex("#102030", "#ffffff", 1), "#ffffff");
  check("mix: halfway between black and white", mixHex("#000000", "#ffffff", 0.5), "#808080");
  check("mix: t clamps below zero", mixHex("#102030", "#ffffff", -3), "#102030");
  check("mix: t clamps above one", mixHex("#102030", "#ffffff", 9), "#ffffff");

  check("luminance: black", Math.round(luminanceOf("#000000") * 1000), 0);
  check("luminance: white", Math.round(luminanceOf("#ffffff") * 1000), 1000);
  check("contrast: black on white is the maximum", Math.round(contrastRatio("#000", "#fff")), 21);
  check("contrast: a color against itself is 1", Math.round(contrastRatio("#3f9b8e", "#3f9b8e")), 1);

  // The five shipped backgrounds must classify the way theme.css does,
  // because the shadow set and every derived lightness hangs off this.
  ok("dark: ember", isDarkHex("#100e10"));
  ok("dark: nocturne", isDarkHex("#0f151c"));
  ok("dark: driftwood", isDarkHex("#262220"));
  ok("light: vellum", !isDarkHex("#e9e0cd"));

  check("hsl: pure red", hslToHex(0, 1, 0.5), "#ff0000");
  check("hsl: no saturation is grey", hslToHex(200, 0, 0.5), "#808080");
  check("hsl: lightness 1 is white", hslToHex(200, 1, 1), "#ffffff");
  check("hsl: hue wraps", hslToHex(360, 1, 0.5), hslToHex(0, 1, 0.5));
}

/* ---------- the token set ---------- */

const EMBER: CustomThemeColors = {
  bgApp: "#100e10",
  bgPane: "#1f1b1f",
  bgEditor: "#131113",
  fgPrimary: "#f2e9dd",
  accent: "#e8a33d",
};

{
  const vars = themeCssVars(EMBER);

  // theme.css defines exactly 28 tokens per theme. A custom theme sets
  // data-theme to an id no stylesheet matches, so anything missing here
  // silently inherits Ember's value — this count is the guard.
  check("tokens: every theme.css token is covered", THEME_VAR_NAMES.length, 28);
  check("tokens: no extras, no gaps", Object.keys(vars).sort(), [...THEME_VAR_NAMES].sort());
  ok(
    "tokens: nothing is empty",
    Object.values(vars).every((v) => typeof v === "string" && v.length > 0),
  );

  check("tokens: the writer's window is used as given", vars["--bg-app"], "#100e10");
  check("tokens: the writer's page is used as given", vars["--bg-editor"], "#131113");
  check("tokens: the raised surface is used as given", vars["--bg-raised"], "#1f1b1f");
  check("tokens: readable text is kept, not overridden", vars["--fg-primary"], "#f2e9dd");
  check("tokens: accent is used as given", vars["--accent"], "#e8a33d");
  check("tokens: accent-fg comes from readableOn", vars["--accent-fg"], readableOn("#e8a33d"));
  check("tokens: character type follows the accent", vars["--type-character"], "#e8a33d");

  // Panes sit between the window and the raised surface; hover and active
  // step toward the text. Ember's own values are the target to be near.
  const near = (a: string, b: string, tolerance: number): boolean => {
    const ca = parseInt(a.slice(1), 16);
    const cb = parseInt(b.slice(1), 16);
    return (
      Math.abs(((ca >> 16) & 255) - ((cb >> 16) & 255)) <= tolerance &&
      Math.abs(((ca >> 8) & 255) - ((cb >> 8) & 255)) <= tolerance &&
      Math.abs((ca & 255) - (cb & 255)) <= tolerance
    );
  };
  ok("derive: pane lands near Ember's own", near(vars["--bg-pane"]!, "#171417", 6));
  ok("derive: hover lands near Ember's own", near(vars["--bg-hover"]!, "#272227", 8));
  ok("derive: active lands near Ember's own", near(vars["--bg-active"]!, "#322b32", 10));
  ok("derive: border lands near Ember's own", near(vars["--border"]!, "#272127", 8));
  ok("derive: secondary text lands near Ember's own", near(vars["--fg-secondary"]!, "#b3a698", 14));
  ok("derive: muted text lands near Ember's own", near(vars["--fg-muted"]!, "#7a6f68", 14));

  check("derive: a dark theme takes the dark shadow set", vars["--shadow"], "var(--shadow-dark)");
}

{
  const vellum: CustomThemeColors = {
    bgApp: "#e9e0cd",
    bgPane: "#faf5e9",
    bgEditor: "#faf5e9",
    fgPrimary: "#2d2419",
    accent: "#a9502f",
  };
  const vars = themeCssVars(vellum);
  check("derive: a light theme takes the light shadow set", vars["--shadow"], "var(--shadow-light)");
  check("derive: light themes keep dark text", vars["--fg-primary"], "#2d2419");
  ok(
    "derive: light entity colors are dark enough to read",
    contrastRatio(vars["--type-lore"]!, vellum.bgPane) > 2.5,
  );
}

/* ---------- contrast safety: the promise ----------

   A writer may choose any five colors. What they may not do is end up
   unable to read their own book. Every text token is checked against the
   surface it actually sits on, across a spread of deliberately hostile
   palettes. */

{
  // A tiny deterministic generator, so a failure is reproducible rather
  // than "it went red on Tuesday".
  let seed = 20260819;
  const nextByte = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed >> 16) & 255;
  };
  const nextHex = (): string =>
    `#${[nextByte(), nextByte(), nextByte()].map((c) => c.toString(16).padStart(2, "0")).join("")}`;

  let worstPrimary = Infinity;
  let worstSecondary = Infinity;
  let worstMuted = Infinity;
  let unreadable = 0;

  for (let i = 0; i < 400; i++) {
    const colors: CustomThemeColors = {
      bgApp: nextHex(),
      bgPane: nextHex(),
      bgEditor: nextHex(),
      fgPrimary: nextHex(),
      accent: nextHex(),
    };
    const vars = themeCssVars(colors);
    const editor = vars["--bg-editor"]!;
    const pane = vars["--bg-pane"]!;

    const primary = contrastRatio(vars["--fg-primary"]!, editor);
    const secondary = contrastRatio(vars["--fg-secondary"]!, pane);
    const muted = contrastRatio(vars["--fg-muted"]!, pane);
    worstPrimary = Math.min(worstPrimary, primary);
    worstSecondary = Math.min(worstSecondary, secondary);
    worstMuted = Math.min(worstMuted, muted);
    if (primary < 3 || secondary < 3 || muted < 3) unreadable++;

    // The guarantee is exact: never worse than the best of black or white
    // on that surface, which is all readableOn() has to offer.
    if (primary < 4.5) {
      ok(
        `contrast: prose falls back to readableOn (palette ${i})`,
        vars["--fg-primary"] === bestOn(editor),
      );
    }
  }

  check("contrast: no palette is ever unreadable", unreadable, 0);
  ok(`contrast: worst prose ratio stays over 3 (${worstPrimary.toFixed(2)})`, worstPrimary >= 3);
  ok(`contrast: worst secondary stays over 3 (${worstSecondary.toFixed(2)})`, worstSecondary >= 3);
  ok(`contrast: worst muted stays over 3 (${worstMuted.toFixed(2)})`, worstMuted >= 3);
}

{
  // The specific case that started all this: black text on a black page.
  const blackOnBlack: CustomThemeColors = {
    bgApp: "#000000",
    bgPane: "#0a0a0a",
    bgEditor: "#050505",
    fgPrimary: "#111111",
    accent: "#e8a33d",
  };
  const vars = themeCssVars(blackOnBlack);
  ok("contrast: black on black is refused", vars["--fg-primary"] !== "#111111");
  check("contrast: it becomes the readable ink", vars["--fg-primary"], bestOn("#050505"));
  ok("contrast: and that actually reads", contrastRatio(vars["--fg-primary"]!, "#050505") > 4.5);

  // Readable text is left exactly alone — correction is a last resort,
  // not a house style.
  const fine = themeCssVars({ ...blackOnBlack, fgPrimary: "#dedede" });
  check("contrast: readable text is untouched", fine["--fg-primary"], "#dedede");
}

{
  // bestOn agrees with readableOn everywhere the shipped themes live —
  // it only differs where readableOn's perceived-luminance shortcut
  // provably picks the worse ink.
  for (const bg of ["#100e10", "#e9e0cd", "#0f151c", "#262220", "#faf5e9", "#e8a33d"]) {
    check(`bestOn: agrees with readableOn on ${bg}`, bestOn(bg), readableOn(bg));
  }
  ok("bestOn: overrules readableOn on saturated magenta", bestOn("#ff44ff") !== readableOn("#ff44ff"));
  ok("bestOn: and the override actually reads", contrastRatio(bestOn("#ff44ff"), "#ff44ff") > 4);
  ok(
    "bestOn: is never worse than readableOn, on any color",
    [
      "#000000", "#ffffff", "#808080", "#7f7f7f", "#8d8d8d", "#ff0000", "#00ff00",
      "#0000ff", "#ff00ff", "#00ffff", "#ffff00", "#123456", "#abcdef", "#4a7fb5",
    ].every((bg) => contrastRatio(bestOn(bg), bg) >= contrastRatio(readableOn(bg), bg)),
  );

  check("distance: a color against itself is zero", channelDistance("#123456", "#123456"), 0);
  check("distance: black to white is the maximum", channelDistance("#000000", "#ffffff"), 765);
  ok(
    "distance: Ember's window and page are distinct enough to pass",
    channelDistance("#100e10", "#131113") >= 6,
  );

  check("atLeast: an already-readable color is returned unchanged", atLeast("#ffffff", "#000000", 4.5), "#ffffff");
  const walked = atLeast("#0a0a0a", "#000000", 4.5);
  ok("atLeast: an unreadable color is walked to safety", contrastRatio(walked, "#000000") >= 4.5);
  // Mid-grey can't carry 4.5 with either extreme; the answer is the best
  // available, not an endless loop or a compromise worse than readableOn.
  const impossible = atLeast("#7f7f7f", "#808080", 4.5);
  check("atLeast: an impossible target lands on the best ink", impossible, bestOn("#808080"));
}

/* ---------- warnings ---------- */

{
  check(
    "warnings: a good theme has nothing to say",
    contrastWarnings(EMBER).length,
    0,
  );
  ok(
    "warnings: unreadable prose is called out",
    contrastWarnings({ ...EMBER, fgPrimary: "#141214" }).some((w) => w.includes("adjusted")),
  );
  ok(
    "warnings: an invisible page is called out",
    contrastWarnings({ ...EMBER, bgEditor: EMBER.bgApp }).length > 0,
  );
  ok(
    "warnings: a vanishing accent is called out",
    contrastWarnings({ ...EMBER, accent: "#141214" }).length > 0,
  );
}

/* ---------- validation ---------- */

{
  const valid = { name: "Midnight", blurb: "For the small hours.", colors: EMBER };
  check("validate: a complete theme has no problems", validateTheme(valid), []);
  check("validate: a name is required", validateTheme({ ...valid, name: "   " }).length, 1);
  ok(
    "validate: names have a ceiling",
    validateTheme({ ...valid, name: "x".repeat(NAME_MAX + 1) }).length === 1,
  );
  ok(
    "validate: descriptions have a ceiling",
    validateTheme({ ...valid, blurb: "x".repeat(BLURB_MAX + 1) }).length === 1,
  );
  ok(
    "validate: a broken color is named in the problem",
    validateTheme({ ...valid, colors: { ...EMBER, accent: "puce" } })[0]?.includes("Accent") === true,
  );
  check(
    "validate: every color is checked, not just the first",
    validateTheme({
      ...valid,
      colors: { bgApp: "", bgPane: "", bgEditor: "", fgPrimary: "", accent: "" },
    }).length,
    COLOR_FIELDS.length,
  );
}

/* ---------- identity, naming, duplication ---------- */

{
  const id = makeThemeId(1_700_000_000_000, 0.5);
  ok("id: carries the custom prefix", id.startsWith(CUSTOM_PREFIX));
  check("id: is stable given the same clock and roll", id, makeThemeId(1_700_000_000_000, 0.5));
  ok("id: a different roll gives a different id", id !== makeThemeId(1_700_000_000_000, 0.9));
  ok("id: custom ids are recognised", isCustomThemeId(id));
  ok("id: built-ins are not", !isCustomThemeId("ember"));

  check("name: an unused name is left alone", uniqueName("Midnight", ["Ember"]), "Midnight");
  check("name: a clash becomes a copy", uniqueName("Midnight", ["Midnight"]), "Midnight (copy)");
  check(
    "name: copies keep counting",
    uniqueName("Midnight", ["Midnight", "Midnight (copy)"]),
    "Midnight (copy 2)",
  );
  check("name: clashes ignore case", uniqueName("midnight", ["MIDNIGHT"]), "midnight (copy)");

  const original = makeCustomTheme("Midnight", EMBER, "For the small hours.", 1_000, "custom-a");
  const copy = duplicateOf(original, [original.name], 2_000, "custom-b");
  check("duplicate: gets its own id", copy.id, "custom-b");
  check("duplicate: gets a distinct name", copy.name, "Midnight (copy)");
  check("duplicate: keeps the colors", copy.colors, original.colors);
  ok(
    "duplicate: does not share the colors object with the original",
    copy.colors !== original.colors,
  );
}

/* ---------- storage sanitising ---------- */

{
  const theme = makeCustomTheme("Midnight", EMBER, "", 1_000, "custom-a");
  check("sanitize: a real theme survives the round trip", sanitizeTheme(JSON.parse(JSON.stringify(theme))), theme);
  check("sanitize: rubbish is rejected", sanitizeTheme({ id: "custom-a" }), null);
  check("sanitize: a built-in id is not a custom theme", sanitizeTheme({ ...theme, id: "ember" }), null);
  check("sanitize: a nameless theme is rejected", sanitizeTheme({ ...theme, name: "  " }), null);
  check(
    "sanitize: a missing color is rejected rather than guessed",
    sanitizeTheme({ ...theme, colors: { ...EMBER, accent: undefined } }),
    null,
  );
  check(
    "sanitize: colors are normalized on the way in",
    sanitizeTheme({ ...theme, colors: { ...EMBER, accent: "#ABC" } })?.colors.accent,
    "#aabbcc",
  );
  check("sanitize: not an object", sanitizeTheme("ember"), null);
  check("sanitize: null", sanitizeTheme(null), null);

  const shelf = sortThemes([
    makeCustomTheme("Zephyr", EMBER, "", 1, "custom-z"),
    makeCustomTheme("Anvil", EMBER, "", 2, "custom-a"),
  ]);
  check("sort: the shelf is alphabetical", shelf.map((t) => t.name), ["Anvil", "Zephyr"]);
}

/* ---------- saved accent swatches ---------- */

{
  check("swatches: newest first", withSwatch(["#111111"], "#222222"), ["#222222", "#111111"]);
  check("swatches: saving twice does not duplicate", withSwatch(["#222222"], "#222222"), ["#222222"]);
  check(
    "swatches: a re-saved color moves to the front",
    withSwatch(["#111111", "#222222"], "#222222"),
    ["#222222", "#111111"],
  );
  check("swatches: input is normalized", withSwatch([], "ABC"), ["#aabbcc"]);
  check("swatches: nonsense is ignored", withSwatch(["#111111"], "not a color"), ["#111111"]);
  check("swatches: removal works", withoutSwatch(["#111111", "#222222"], "#222222"), ["#111111"]);
  check("swatches: removal is case-insensitive", withoutSwatch(["#aabbcc"], "#AABBCC"), []);
  check("swatches: removing something absent is a no-op", withoutSwatch(["#111111"], "#999999"), ["#111111"]);
  check("swatches: junk from storage is dropped", dedupeSwatches(["#111111", "x", "#111111"]), ["#111111"]);
  ok(
    "swatches: the row has a ceiling",
    dedupeSwatches(Array.from({ length: 40 }, (_, i) => `#0000${i.toString(16).padStart(2, "0")}`)).length <= 12,
  );
}

/* ---------- fallbacks ---------- */

{
  const vars = themeCssVars({ bgApp: "", bgPane: "", bgEditor: "", fgPrimary: "", accent: "" });
  check("fallback: an empty palette still yields every token", Object.keys(vars).length, 28);
  check("fallback: unparseable colors land on Ember's", vars["--bg-app"], FALLBACK_COLORS.bgApp);
}

/* ---------- report ---------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`theme tests: ${checks} checks passed`);
