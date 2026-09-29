/* Guards for the stylesheets.

   app.css grew by appending: each round's styling landed as a new block
   restating selectors that already had one, and the cascade order of
   those blocks became how styling actually resolves. This suite does not
   untangle that — the owner has unpushed edits in app.css and one session
   writes styling — it only makes sure the stack stops growing. Every
   selector-in-context defined in more than one block today is recorded
   with its count in src/ui/css-duplicates.baseline.json; a count going up,
   or a new duplicate appearing, fails. A count going down prints one line
   saying so, and `--write-baseline` locks the reduction in. The baseline
   can only shrink through here.

   Alongside it, the CLAUDE.md traps that have each cost a round: no
   transition on grid-template-columns, every reduced-motion block
   guarded by :root:not(.motion-full), no raw hex outside theme.css, and
   every theme block telling native controls whether it is dark.

   Same contract as test-units.ts: silent unless something is wrong,
   non-zero exit when it is. */

import {
  KEY_SEP,
  compareBaseline,
  duplicateBlocks,
  duplicateKeyframes,
  gridTransitionViolations,
  isReducedMotionQuery,
  normalizeSelector,
  parseCss,
  rawHex,
  selectorKey,
  shrinkBaseline,
  splitSelectorList,
  stripComments,
  transitionProperties,
  unguardedReducedMotion,
  type ParsedCss,
} from "./src/ui/cssLint";
import { isDarkHex } from "./src/ui/customThemes";
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const BASELINE_PATH = "src/ui/css-duplicates.baseline.json";
const THEME_PATH = "src/ui/theme.css";
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const dupCounts = (parsed: ParsedCss): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [key, lines] of duplicateBlocks(parsed)) out[key] = lines.length;
  return out;
};

/* ---------- the tokenizer ---------- */

{
  const p = parseCss(".a { color: red; /* } { ; */ margin: 0 }");
  check("parse: a comment holding braces does not split the rule", p.rules.length, 1);
  check("parse: both declarations survive the comment", p.rules[0]?.decls.map((d) => d.prop), [
    "color",
    "margin",
  ]);
  check("parse: no errors", p.errors, []);
}

{
  const p = parseCss('.a::after { content: "}{;"; }');
  check("parse: braces in a string stay in the string", p.rules[0]?.decls[0]?.value, '"}{;"');
  check("parse: and do not open a block", p.rules.length, 1);
}

{
  const p = parseCss(".a{background:url(data:image/svg+xml;utf8,<svg>);color:red}");
  check(
    "parse: a data: url with ; is one declaration",
    p.rules[0]?.decls.map((d) => d.prop),
    ["background", "color"],
  );
}

{
  const p = parseCss("@media (x){.a{}} .a{}");
  const keys = p.rules.map((r) => selectorKey(r.context, r.selectors[0] ?? ""));
  check("context: the same selector inside and outside @media", keys, ["@media (x) { .a", ".a"]);
  check("context: so they are not duplicates", duplicateBlocks(p).size, 0);
  check("context: the key separator", KEY_SEP, " { ");
}

{
  const p = parseCss("@media (max-width:899px){.a{}}");
  check("context: prelude colons normalise", p.rules[0]?.context, ["@media (max-width: 899px)"]);
}

{
  const p = parseCss("@media (a){@supports (b){.a{}}}");
  check("context: nested at-rules chain outermost first", p.rules[0]?.context, [
    "@media (a)",
    "@supports (b)",
  ]);
}

{
  const d = duplicateBlocks(parseCss(".a,.b{} .a{}"));
  check("dup: a list member restated in its own block counts", d.get(".a"), [1, 1]);
  ok("dup: the other member is not a duplicate", !d.has(".b"));
  check("dup: one selector twice in one block is not a duplicate", duplicateBlocks(parseCss(".a,.a{}")).size, 0);
}

{
  check("selector: :is(.a, .b) stays one selector", splitSelectorList(":is(.a, .b)"), [":is(.a, .b)"]);
  check("selector: :is spacing normalises", splitSelectorList(":is(.a,.b)"), [":is(.a, .b)"]);
  check("selector: child combinator spacing", normalizeSelector(".a>.b"), ".a > .b");
  check("selector: sibling combinators", normalizeSelector(".a+.b~.c"), ".a + .b ~ .c");
  check("selector: attribute ~= is untouched", normalizeSelector("[class~=x]"), "[class~=x]");
  check("selector: nth-child arithmetic is untouched", normalizeSelector("li:nth-child(2n+1)"), "li:nth-child(2n+1)");
  check("selector: whitespace collapses", normalizeSelector("  .a \n  .b "), ".a .b");
}

{
  const p = parseCss("@keyframes one{0%{opacity:0}to{opacity:1}} @keyframes two{0%{opacity:1}}");
  check("keyframes: steps are never duplicates", duplicateBlocks(p).size, 0);
  check("keyframes: both names recorded", p.keyframes.map((k) => k.name), ["one", "two"]);
  ok("keyframes: steps are flagged", p.rules.every((r) => r.inKeyframes));
  check("keyframes: distinct names are fine", duplicateKeyframes(p), []);
  const again = parseCss("@keyframes one{} @-webkit-keyframes x{} @keyframes one{}");
  check("keyframes: a repeated name is caught", duplicateKeyframes(again), ["@keyframes one"]);
}

{
  const p = parseCss(".a{color:red;&:hover{color:blue}}");
  check("nesting: the nested rule carries its parent", p.rules[1]?.context, [".a"]);
  check("nesting: the parent keeps its own declaration", p.rules[0]?.decls.length, 1);
}

{
  const p = parseCss("/* one\ntwo\nthree */\n.a {\n  color: red;\n}");
  check("lines: a rule after a 3-line comment", p.rules[0]?.line, 4);
  check("lines: its declaration", p.rules[0]?.decls[0]?.line, 5);
  check("lines: comments blank to spaces, newlines kept", stripComments("a/*\n*/b"), "a  \n  b");
}

{
  ok("errors: a stray } is reported", parseCss(".a{}}").errors.some((e) => e.startsWith("unexpected }")));
  ok("errors: an unclosed block is reported", parseCss(".a{color:red").errors.some((e) => e.startsWith("unclosed block")));
  ok("errors: an unterminated comment is reported", parseCss(".a{} /* x").errors.length > 0);
  ok("errors: an unterminated string is reported", parseCss('.a{content:"x}').errors.length > 0);
}

/* ---------- transitions ---------- */

{
  check("transition: a bare duration animates all", transitionProperties("200ms"), ["all"]);
  check(
    "transition: a list names its properties",
    transitionProperties("opacity 120ms, transform 1s ease"),
    ["opacity", "transform"],
  );
  check("transition: none is nothing", transitionProperties("none"), []);
  check("transition: var() only is all", transitionProperties("var(--motion-quick) var(--ease)"), ["all"]);
  check(
    "transition: easing functions are not properties",
    transitionProperties("cubic-bezier(0.2, 0, 0, 1) 200ms color"),
    ["color"],
  );
  check(
    "transition: grid-template-columns is flagged",
    gridTransitionViolations(parseCss(".x{transition: grid-template-columns 200ms}")).length,
    1,
  );
  check(
    "transition: via transition-property too",
    gridTransitionViolations(parseCss(".x{transition-property: opacity, grid-template}")).length,
    1,
  );
  check(
    "transition: all on the workspace is flagged",
    gridTransitionViolations(parseCss(".app .workspace{transition: all 200ms}")).length,
    1,
  );
  check(
    "transition: all on something else is not this lint's business",
    gridTransitionViolations(parseCss(".workspace .chip, .workspace-head{transition: all 200ms}")).length,
    0,
  );
}

/* ---------- reduced motion ---------- */

{
  ok("motion: reduce matches", isReducedMotionQuery("@media (prefers-reduced-motion: reduce)"));
  ok("motion: the bare feature matches", isReducedMotionQuery("@media (prefers-reduced-motion)"));
  ok("motion: no-preference does not", !isReducedMotionQuery("@media (prefers-reduced-motion: no-preference)"));

  const rm = (css: string): number => unguardedReducedMotion(parseCss(css)).length;
  check("motion: an unguarded rule is flagged", rm("@media (prefers-reduced-motion: reduce){.x{animation:none}}"), 1);
  check(
    "motion: a guarded rule passes",
    rm("@media (prefers-reduced-motion: reduce){:root:not(.motion-full) .x{animation:none}}"),
    0,
  );
  check(
    "motion: one unguarded list member is flagged",
    rm("@media (prefers-reduced-motion: reduce){:root:not(.motion-full) .x, .y{animation:none}}"),
    1,
  );
  check(
    "motion: no-preference blocks are not reduced motion",
    rm("@media (prefers-reduced-motion: no-preference){.x{animation:spin 1s}}"),
    0,
  );
}

/* ---------- raw hex ---------- */

{
  check("hex: a colour value counts", rawHex(parseCss(".a{color:#fff}")).length, 1);
  check("hex: url(#id) does not", rawHex(parseCss(".a{clip-path:url(#abc)}")).length, 0);
  check("hex: a string does not", rawHex(parseCss('.a::before{content:"#fff"}')).length, 0);
  check("hex: an id selector does not", rawHex(parseCss("#add{color:var(--fg-primary)}")).length, 0);
}

/* ---------- the baseline ---------- */

{
  const base = { ".a": 2, ".b": 5, ".c": 2 };
  const diff = compareBaseline({ ".a": 3, ".b": 3, ".d": 2 }, base);
  check("baseline: a grown count is reported", diff.grown, [{ key: ".a", was: 2, now: 3 }]);
  check("baseline: a new key is reported", diff.added, [{ key: ".d", now: 2 }]);
  check("baseline: removed counts extra blocks (5→3 is 2, 2→gone is 1)", diff.removed, 3);
  check("baseline: unchanged is clean", compareBaseline(base, base), { grown: [], added: [], removed: 0 });
  check(
    "baseline: shrinking keeps the lower count, drops the cured, adds nothing",
    shrinkBaseline({ ".a": 3, ".b": 3, ".d": 2 }, base),
    { ".a": 2, ".b": 3 },
  );
}

/* ---------- the real stylesheets ---------- */

function cssFiles(dir: string, out: string[]): void {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = join(dir, e.name);
    // lstat, never stat — a symlink that points at its own parent is a
    // known trap in this repo, so links are never followed.
    const st = lstatSync(join(ROOT, rel));
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      if (e.name === "node_modules") continue;
      cssFiles(rel, out);
    } else out.push(rel.split("\\").join("/"));
  }
}

const srcFiles: string[] = [];
cssFiles("src", srcFiles);
const hexScanned = srcFiles.filter((f) => f.endsWith(".css") && f !== THEME_PATH).sort();

const app = parseCss(read("src/ui/app.css"));
const theme = parseCss(read(THEME_PATH));
const currentDups = dupCounts(app);
const currentHex: Record<string, number> = {};
for (const f of hexScanned) currentHex[f] = rawHex(parseCss(read(f))).length;

interface Baseline {
  about: string;
  duplicates: Record<string, number>;
  rawHex: Record<string, number>;
}

const sorted = (r: Record<string, number>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const k of Object.keys(r).sort()) out[k] = r[k] ?? 0;
  return out;
};

if (process.argv.includes("--write-baseline")) {
  // A tokenizer that fails its own fixtures would write a wrong baseline
  // that every later run then trusts.
  if (failures > 0) {
    console.error(`${failures} tokenizer checks failed, so no baseline`);
    process.exit(1);
  }
  if (app.errors.length > 0) {
    console.error(`app.css does not parse, so no baseline:\n  ${app.errors.join("\n  ")}`);
    process.exit(1);
  }
  let dups = currentDups;
  let hex = currentHex;
  if (existsSync(join(ROOT, BASELINE_PATH))) {
    const old = JSON.parse(read(BASELINE_PATH)) as Baseline;
    const diff = compareBaseline(currentDups, old.duplicates);
    const hexGrown = Object.entries(currentHex).filter(([f, n]) => n > (old.rawHex[f] ?? 0));
    if (diff.grown.length > 0 || diff.added.length > 0 || hexGrown.length > 0) {
      console.error(
        "the baseline only shrinks — to rebaseline after a merge, delete the file, rerun, and name the grown keys in the commit",
      );
      for (const g of diff.grown) console.error(`  grown  ${g.key}  ${g.was} → ${g.now}`);
      for (const a of diff.added) console.error(`  added  ${a.key}  ${a.now}`);
      for (const [f, n] of hexGrown) console.error(`  hex    ${f}  ${old.rawHex[f] ?? 0} → ${n}`);
      process.exit(1);
    }
    dups = shrinkBaseline(currentDups, old.duplicates);
    hex = {};
    for (const [f, n] of Object.entries(currentHex)) hex[f] = Math.min(n, old.rawHex[f] ?? 0);
  }
  const out: Baseline = {
    about:
      "Selector-in-context duplicates in src/ui/app.css (blocks per key) and raw hex counts in src CSS outside theme.css; test-css.ts fails if any count grows or a new key appears.",
    duplicates: sorted(dups),
    rawHex: sorted(hex),
  };
  writeFileSync(join(ROOT, BASELINE_PATH), JSON.stringify(out, null, 2) + "\n");
  const keys = Object.keys(out.duplicates).length;
  const extra = Object.values(out.duplicates).reduce((s, n) => s + n - 1, 0);
  console.log(`css: baseline written — ${keys} duplicate keys, ${extra} extra blocks`);
  process.exit(0);
}

{
  check("app.css: parses cleanly", app.errors, []);
  ok(`app.css: the parser saw the whole file (${app.rules.length} rules)`, app.rules.length > 1000);
  check("theme.css: parses cleanly", theme.errors, []);
}

{
  const baseline = JSON.parse(read(BASELINE_PATH)) as Baseline;
  const all = duplicateBlocks(app);
  const where = (key: string): string => (all.get(key) ?? []).join(", ");
  const diff = compareBaseline(currentDups, baseline.duplicates);
  for (const a of diff.added) {
    ok(`app.css: new duplicate ${a.key} — ${a.now} blocks (lines ${where(a.key)})`, false);
  }
  for (const g of diff.grown) {
    ok(`app.css: duplicate ${g.key} grew — baseline ${g.was}, now ${g.now} (lines ${where(g.key)})`, false);
  }
  checks++;
  if (diff.removed > 0) {
    console.log(
      `css: ${diff.removed} duplicate blocks removed since the baseline — run \`npx tsx test-css.ts --write-baseline\` to lock it in`,
    );
  }

  for (const f of hexScanned) {
    const now = currentHex[f] ?? 0;
    const allowed = baseline.rawHex[f] ?? 0;
    if (now > allowed) {
      const found = rawHex(parseCss(read(f)))
        .map((h) => `${h.hex} at ${h.line}`)
        .join(", ");
      ok(`${f}: raw hex outside theme.css — baseline ${allowed}, now ${now} (${found})`, false);
    } else checks++;
  }
}

{
  check("app.css: no @keyframes name is defined twice", duplicateKeyframes(app), []);
  check("app.css: no transition on the grid tracks", gridTransitionViolations(app), []);
  check("theme.css: no transition on the grid tracks", gridTransitionViolations(theme), []);
  check("app.css: every reduced-motion rule is guarded", unguardedReducedMotion(app), []);
  check("theme.css: every reduced-motion rule is guarded", unguardedReducedMotion(theme), []);
}

{
  // Inline styles are where the grid actually lives (App.tsx sets
  // gridTemplateColumns), so a transition written there is the same trap.
  const inline = /transition(Property)?\s*:\s*["'`][^"'`]*grid-template/;
  const hits = srcFiles
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => inline.test(read(f)));
  check("src: no inline transition on grid-template", hits, []);
}

/* ---------- native controls follow color-scheme ----------

   Select popups, scrollbars and date pickers are drawn by the platform,
   and the platform goes by color-scheme, not our tokens. Without it a
   near-black theme opens a white dropdown under its own pale text.
   `light dark` would hand the choice back to the OS, which is wrong for
   a theme that has exactly one brightness. */

{
  const blocks = theme.rules
    .map((rule) => {
      const bg = rule.decls.find((d) => d.prop === "--bg-app");
      if (!bg) return null;
      const named = /\[data-theme="([^"]+)"\]/.exec(rule.selectorText)?.[1];
      const systemLight =
        rule.selectors.includes(":root:not([data-theme])") &&
        rule.context.some((c) => /prefers-color-scheme: light/.test(c));
      const name = named ?? (systemLight ? "system-light" : "default");
      const scheme = rule.decls.find((d) => d.prop === "color-scheme")?.value.trim();
      return { name, bgApp: bg.value.trim(), scheme };
    })
    .filter((b): b is { name: string; bgApp: string; scheme: string | undefined } => b !== null);

  const names = blocks.map((b) => b.name);
  ok(
    "theme.css: ember, vellum, nocturne, driftwood and system-light blocks found",
    ["ember", "vellum", "nocturne", "driftwood", "system-light"].every((n) => names.includes(n)),
  );
  for (const b of blocks) {
    ok(`theme.css ${b.name}: declares color-scheme`, b.scheme !== undefined);
    if (b.scheme !== undefined) {
      check(
        `theme.css ${b.name}: color-scheme matches its brightness`,
        b.scheme,
        isDarkHex(b.bgApp) ? "dark" : "light",
      );
    }
  }

  const lastIsOption = (s: string): boolean => /(^|\s)option$/.test(s);
  const themed = [...theme.rules, ...app.rules].some(
    (r) =>
      r.selectors.some(lastIsOption) &&
      r.decls.some((d) => /^background(-color)?$/.test(d.prop) && d.value.includes("var(--bg-")) &&
      r.decls.some((d) => d.prop === "color" && d.value.includes("var(--fg-")),
  );
  ok("option popups are themed", themed);
}

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`css tests: ${checks} checks passed`);
