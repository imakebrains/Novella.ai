/* A small CSS tokenizer and the lints test-css.ts runs over the stylesheets.

   Not a CSS parser. It knows exactly enough to answer "which rule blocks
   define this selector, under which at-rules" — comments, strings with
   escapes, parens (so a data: url or :is(a, b) never splits a rule),
   at-rule chains, keyframes and native nesting. Anything subtler than
   that is out of scope on purpose: the job is a guard that cannot be
   fooled by the shapes app.css actually contains, not a validator.

   Pure: no node, no DOM. The file reading lives in test-css.ts, so this
   stays type-checked with the app and unit-testable in isolation.

   Line numbers are 1-based and survive comments, because stripComments
   blanks a comment to spaces rather than deleting it. */

export interface CssDecl {
  prop: string;
  value: string;
  line: number;
}

export interface CssRule {
  /** Enclosing at-rule preludes (and, for native nesting, parent
      selector lists), outermost first. */
  context: string[];
  selectorText: string;
  selectors: string[];
  line: number;
  decls: CssDecl[];
  inKeyframes: boolean;
}

export interface ParsedCss {
  rules: CssRule[];
  keyframes: { name: string; context: string[]; line: number }[];
  errors: string[];
}

const BACKSLASH = "\\";

interface Stripped {
  text: string;
  unterminatedAt: number | null;
}

function stripWithReport(text: string): Stripped {
  let out = "";
  let quote = "";
  let line = 1;
  let i = 0;
  while (i < text.length) {
    const c = text.charAt(i);
    if (quote) {
      out += c;
      if (c === BACKSLASH && i + 1 < text.length) {
        const next = text.charAt(i + 1);
        out += next;
        if (next === "\n") line++;
        i += 2;
        continue;
      }
      if (c === quote || c === "\n") quote = "";
      if (c === "\n") line++;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && text.charAt(i + 1) === "*") {
      const start = line;
      const end = text.indexOf("*/", i + 2);
      const stop = end < 0 ? text.length : end + 2;
      for (let j = i; j < stop; j++) {
        const cc = text.charAt(j);
        if (cc === "\n") {
          out += "\n";
          line++;
        } else {
          out += " ";
        }
      }
      if (end < 0) return { text: out, unterminatedAt: start };
      i = stop;
      continue;
    }
    if (c === "\n") line++;
    out += c;
    i++;
  }
  return { text: out, unterminatedAt: null };
}

/** Blank every comment to spaces, keeping its newlines so line numbers
    downstream still point at the real file. */
export function stripComments(text: string): string {
  return stripWithReport(text).text;
}

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function normalizePrelude(prelude: string): string {
  return collapse(prelude)
    .replace(/\s*:\s*/g, ": ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")");
}

const KEYFRAMES = /^@(-webkit-|-moz-)?keyframes\s+/i;

/** Whitespace collapsed; `>` `+` `~` spaced only outside parens and
    brackets, so `[class~=x]` and `:nth-child(2n+1)` are left alone;
    every comma inside :is()/:not() followed by exactly one space. */
export function normalizeSelector(s: string): string {
  const src = collapse(s);
  let out = "";
  let depth = 0;
  let quote = "";
  for (let i = 0; i < src.length; i++) {
    const c = src.charAt(i);
    if (quote) {
      out += c;
      if (c === BACKSLASH && i + 1 < src.length) {
        out += src.charAt(++i);
        continue;
      }
      if (c === quote) quote = "";
      continue;
    }
    if (c === BACKSLASH && i + 1 < src.length) {
      out += c + src.charAt(++i);
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if ((c === ")" || c === "]") && depth > 0) depth--;
    if (depth === 0 && (c === ">" || c === "+" || c === "~")) {
      out += ` ${c} `;
      continue;
    }
    if (depth > 0 && c === ",") {
      out += ", ";
      continue;
    }
    out += c;
  }
  return collapse(out).replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
}

/** Split a selector list on its top-level commas only. */
export function splitSelectorList(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (quote) {
      current += c;
      if (c === BACKSLASH && i + 1 < text.length) {
        current += text.charAt(++i);
        continue;
      }
      if (c === quote) quote = "";
      continue;
    }
    if (c === BACKSLASH && i + 1 < text.length) {
      current += c + text.charAt(++i);
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if ((c === ")" || c === "]") && depth > 0) depth--;
    if (c === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  parts.push(current);
  return parts.map(normalizeSelector).filter((p) => p.length > 0);
}

type Frame =
  | { kind: "at"; prelude: string; keyframes: boolean; line: number }
  | { kind: "rule"; rule: CssRule; line: number };

export function parseCss(input: string): ParsedCss {
  const errors: string[] = [];
  const rules: CssRule[] = [];
  const keyframes: ParsedCss["keyframes"] = [];
  const stripped = stripWithReport(input);
  if (stripped.unterminatedAt !== null) {
    errors.push(`unterminated comment opened at line ${stripped.unterminatedAt}`);
  }
  const text = stripped.text;

  const stack: Frame[] = [];
  let buf = "";
  let bufLine = 0;
  let line = 1;
  let quote = "";
  let quoteLine = 0;
  let parens = 0;

  const top = (): Frame | undefined => stack[stack.length - 1];

  /* The context a new block would sit in: every enclosing at-rule and,
     for native nesting, every enclosing selector list. */
  const contextNow = (): string[] =>
    stack.map((f) => (f.kind === "at" ? f.prelude : f.rule.selectorText));

  const inKeyframesNow = (): boolean => stack.some((f) => f.kind === "at" && f.keyframes);

  const flushDecl = (): void => {
    const t = top();
    const raw = buf.trim();
    if (t && t.kind === "rule" && raw) {
      const colon = raw.indexOf(":");
      if (colon > 0) {
        t.rule.decls.push({
          prop: raw.slice(0, colon).trim(),
          value: raw.slice(colon + 1).trim(),
          line: bufLine,
        });
      }
    }
  };

  const reset = (): void => {
    buf = "";
    bufLine = 0;
  };

  const append = (c: string): void => {
    if (bufLine === 0 && !/\s/.test(c)) bufLine = line;
    buf += c;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);

    if (quote) {
      buf += c;
      if (c === BACKSLASH && i + 1 < text.length) {
        const next = text.charAt(++i);
        buf += next;
        if (next === "\n") line++;
        continue;
      }
      if (c === "\n") {
        errors.push(`unterminated string opened at line ${quoteLine}`);
        quote = "";
        line++;
        continue;
      }
      if (c === quote) quote = "";
      continue;
    }

    if (c === '"' || c === "'") {
      quote = c;
      quoteLine = line;
      append(c);
      continue;
    }
    if (c === "(") parens++;
    else if (c === ")" && parens > 0) parens--;

    if (parens > 0 || (c !== "{" && c !== "}" && c !== ";")) {
      if (c === "\n") {
        buf += c;
        line++;
      } else {
        append(c);
      }
      continue;
    }

    if (c === "{") {
      const prelude = buf.trim();
      const at = bufLine || line;
      if (prelude.startsWith("@")) {
        const norm = normalizePrelude(prelude);
        const isKf = KEYFRAMES.test(norm);
        if (isKf) {
          keyframes.push({
            name: norm.replace(KEYFRAMES, "").trim(),
            context: contextNow(),
            line: at,
          });
        }
        stack.push({ kind: "at", prelude: norm, keyframes: isKf, line: at });
      } else {
        const selectors = splitSelectorList(prelude);
        const rule: CssRule = {
          context: contextNow(),
          selectorText: selectors.join(", "),
          selectors,
          line: at,
          decls: [],
          inKeyframes: inKeyframesNow(),
        };
        rules.push(rule);
        stack.push({ kind: "rule", rule, line: at });
      }
      reset();
      continue;
    }

    if (c === ";") {
      flushDecl();
      reset();
      continue;
    }

    // c === "}"
    if (stack.length === 0) {
      errors.push(`unexpected } at line ${line}`);
      reset();
      continue;
    }
    flushDecl();
    stack.pop();
    reset();
  }

  if (quote) errors.push(`unterminated string opened at line ${quoteLine}`);
  for (const f of stack) errors.push(`unclosed block opened at line ${f.line}`);

  return { rules, keyframes, errors };
}

/** A brace can never appear in a selector or a prelude, and the key then
    reads like the nesting it stands for: `@media (max-width: 899px) { .pane-left`. */
export const KEY_SEP = " { ";

export function selectorKey(context: string[], selector: string): string {
  return [...context, selector].join(KEY_SEP);
}

/** Selector-in-context → the start line of every block defining it,
    only where there are two or more. A selector listed twice in one
    block counts once; keyframe steps are never selectors. */
export function duplicateBlocks(parsed: ParsedCss): Map<string, number[]> {
  const all = new Map<string, number[]>();
  for (const rule of parsed.rules) {
    if (rule.inKeyframes) continue;
    for (const sel of new Set(rule.selectors)) {
      const key = selectorKey(rule.context, sel);
      const lines = all.get(key);
      if (lines) lines.push(rule.line);
      else all.set(key, [rule.line]);
    }
  }
  const out = new Map<string, number[]>();
  for (const [key, lines] of all) if (lines.length >= 2) out.set(key, lines);
  return out;
}

/** A second @keyframes of the same name silently replaces the first, so
    whichever animation was written earlier stops existing. */
export function duplicateKeyframes(parsed: ParsedCss): string[] {
  const seen = new Map<string, number>();
  for (const k of parsed.keyframes) {
    const key = selectorKey(k.context, `@keyframes ${k.name}`);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([key]) => key);
}

export interface BaselineDiff {
  grown: { key: string; was: number; now: number }[];
  added: { key: string; now: number }[];
  /** Extra blocks gone since the baseline — what the debt went down by. */
  removed: number;
}

/** Counts are blocks per key. A key missing from the baseline (or at
    under 2 there) is a new duplicate; anything above its baseline grew. */
export function compareBaseline(
  current: Record<string, number>,
  baseline: Record<string, number>,
): BaselineDiff {
  const grown: BaselineDiff["grown"] = [];
  const added: BaselineDiff["added"] = [];
  for (const key of Object.keys(current).sort()) {
    const now = current[key] ?? 0;
    if (now < 2) continue;
    const was = baseline[key] ?? 0;
    if (was < 2) added.push({ key, now });
    else if (now > was) grown.push({ key, was, now });
  }
  let removed = 0;
  for (const [key, was] of Object.entries(baseline)) {
    const now = Math.max(current[key] ?? 1, 1);
    removed += Math.max(0, was - 1 - (now - 1));
  }
  return { grown, added, removed };
}

/** The baseline only ever moves down: each existing key keeps the lower
    of its two counts, a key that stopped being a duplicate is dropped,
    and nothing new is ever let in through here. */
export function shrinkBaseline(
  current: Record<string, number>,
  baseline: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(baseline).sort()) {
    const was = baseline[key] ?? 0;
    const now = current[key] ?? 0;
    if (now >= 2) out[key] = Math.min(was, now);
  }
  return out;
}

function splitTopLevel(value: string, sep: (c: string) => boolean): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < value.length; i++) {
    const c = value.charAt(i);
    if (c === "(") depth++;
    else if (c === ")" && depth > 0) depth--;
    if (depth === 0 && sep(c)) {
      parts.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

const EASING = new Set([
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "linear",
  "step-start",
  "step-end",
  "allow-discrete",
  "normal",
]);
const GLOBAL = new Set(["none", "inherit", "initial", "unset", "revert", "revert-layer"]);

/** The properties a `transition` (or `transition-property`) value names.
    An item that names none animates `all`, and so does one whose
    property hides behind var() — conservative on purpose. */
export function transitionProperties(value: string): string[] {
  const v = value.replace(/!important\s*$/i, "").trim();
  if (GLOBAL.has(v.toLowerCase())) return [];
  const out: string[] = [];
  for (const item of splitTopLevel(v, (c) => c === ",")) {
    let prop = "all";
    for (const token of splitTopLevel(item, (c) => /\s/.test(c))) {
      const t = token.toLowerCase();
      if (/^-?[\d.]+m?s$/.test(t)) continue;
      if (/^-?[\d.]+$/.test(t)) continue;
      if (EASING.has(t)) continue;
      if (/^(cubic-bezier|steps|linear|var)\(/.test(t)) continue;
      prop = t;
      break;
    }
    if (prop !== "none") out.push(prop);
  }
  return out;
}

const GRID_PROPS = new Set(["grid-template-columns", "grid-template", "grid"]);

function lastCompound(selector: string): string {
  const parts = splitTopLevel(selector, (c) => c === " ");
  return parts[parts.length - 1] ?? "";
}

/** CLAUDE.md trap: the workspace track list mixes `auto` and minmax(),
    which cannot interpolate, so a transition on it freezes the tracks at
    their old widths. `transition: all` on the workspace itself (whose
    columns are set inline) is the same bug by another name. */
export function gridTransitionViolations(
  parsed: ParsedCss,
): { line: number; selector: string; value: string }[] {
  const out: { line: number; selector: string; value: string }[] = [];
  for (const rule of parsed.rules) {
    for (const d of rule.decls) {
      const prop = d.prop.toLowerCase();
      if (!/^(-webkit-)?transition(-property)?$/.test(prop)) continue;
      const props = transitionProperties(d.value);
      const grid = props.some((p) => GRID_PROPS.has(p));
      const allOnWorkspace =
        props.includes("all") &&
        rule.selectors.some((s) => {
          const last = lastCompound(s);
          return last === "*" || /\.workspace(?![\w-])/.test(last);
        });
      if (grid || allOnWorkspace) {
        out.push({ line: d.line, selector: rule.selectorText, value: d.value });
      }
    }
  }
  return out;
}

/** Bare `(prefers-reduced-motion)` means reduce as well; no-preference does not. */
export function isReducedMotionQuery(prelude: string): boolean {
  return /prefers-reduced-motion\s*(:\s*reduce\s*)?\)/i.test(prelude);
}

const MOTION_GUARD = ":root:not(.motion-full)";

/** CLAUDE.md trap: Windows with OS animation effects off reports
    reduced motion, which silently flattened the whole app for months.
    Motion defaults to full, so every reduced-motion rule has to opt out
    when the writer kept it. */
export function unguardedReducedMotion(parsed: ParsedCss): { line: number; selector: string }[] {
  const out: { line: number; selector: string }[] = [];
  for (const rule of parsed.rules) {
    if (rule.inKeyframes) continue;
    if (!rule.context.some((c) => c.startsWith("@") && isReducedMotionQuery(c))) continue;
    const parentGuarded = rule.context.some((c) => !c.startsWith("@") && c.startsWith(MOTION_GUARD));
    if (parentGuarded) continue;
    for (const sel of rule.selectors) {
      if (!sel.startsWith(MOTION_GUARD)) out.push({ line: rule.line, selector: sel });
    }
  }
  return out;
}

/** Hex colours in declaration values. Strings and url() contents are
    blanked first, so `url(#clip)` and `content: "#1"` never count, and
    selectors are never scanned at all. */
export function rawHex(
  parsed: ParsedCss,
): { line: number; selector: string; prop: string; hex: string }[] {
  const out: { line: number; selector: string; prop: string; hex: string }[] = [];
  for (const rule of parsed.rules) {
    for (const d of rule.decls) {
      const blanked = d.value
        .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')
        .replace(/url\([^)]*\)/gi, "url()");
      for (const m of blanked.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        out.push({ line: d.line, selector: rule.selectorText, prop: d.prop, hex: m[0] });
      }
    }
  }
  return out;
}
