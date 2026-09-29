/* Every icon-only button has an accessible name.

   Same shape as test-units.ts: silent unless something is wrong, non-zero
   exit when it is.

   Why a source scan and not axe: axe accepts a glyph as a name, so a
   close button announced as "multiplication x" passes it. And why title=
   and data-tip= don't count: title is not reliably announced (and never
   on touch), and data-tip only reached the name on desktop by accident —
   Chrome folds the `[data-tip]::after { content: attr(data-tip) }` text
   into the name, and 9.62 hides that pseudo-element on touch, so on a
   phone those buttons had no name at all.

   The classifier is deliberately conservative: any dynamic child
   ({label}, a call, a template with substitutions) is assumed to be
   words. That keeps false positives at zero, at the cost of missing an
   icon passed in through a variable. Buttons with a {...spread} are
   skipped because the spread may carry the label. */

import ts from "typescript";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

let failures = 0;
let checks = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`FAIL ${name}\n  expected ${e}\n  actual   ${a}`);
  }
}

function ok(name: string, condition: boolean): void {
  checks++;
  if (!condition) {
    failures++;
    console.error(`FAIL ${name}`);
  }
}

/* ---------- the scanner ---------- */

export interface Hit {
  file: string;
  line: number;
  glyphs: string;
  title: string;
}

type Verdict = "icon" | "text";

/** Counted across calls so the tree check can prove the walk found buttons. */
let buttonsSeen = 0;

const hasWord = (s: string) => /[\p{L}\p{N}]/u.test(s);

function attr(el: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  for (const a of el.attributes.properties) {
    if (ts.isJsxAttribute(a) && a.name.getText() === name) return a;
  }
  return undefined;
}

const named = (el: ts.JsxOpeningLikeElement) =>
  !!(attr(el, "aria-label") || attr(el, "aria-labelledby"));

function exprVerdict(e: ts.Expression): Verdict {
  if (ts.isParenthesizedExpression(e)) return exprVerdict(e.expression);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) {
    return hasWord(e.text) ? "text" : "icon";
  }
  if (ts.isConditionalExpression(e)) {
    return exprVerdict(e.whenTrue) === "icon" && exprVerdict(e.whenFalse) === "icon" ? "icon" : "text";
  }
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return exprVerdict(e.right);
  }
  if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return nodeVerdict(e);
  return "text";
}

function childrenVerdict(kids: ts.NodeArray<ts.JsxChild>): Verdict {
  for (const k of kids) if (nodeVerdict(k) === "text") return "text";
  return "icon";
}

function nodeVerdict(n: ts.Node): Verdict {
  if (ts.isJsxText(n)) return hasWord(n.text) ? "text" : "icon";
  if (ts.isJsxExpression(n)) return n.expression ? exprVerdict(n.expression) : "icon";
  if (ts.isJsxFragment(n)) return childrenVerdict(n.children);
  if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
    const open = ts.isJsxElement(n) ? n.openingElement : n;
    const tag = open.tagName.getText();
    // aria-hidden takes the whole subtree out of the name, words and all.
    if (attr(open, "aria-hidden")) return "icon";
    // A child that names itself contributes that name to the button's.
    if (named(open)) return "text";
    const cls = attr(open, "className")?.initializer?.getText() ?? "";
    if (/sr-only|visually-hidden/.test(cls)) {
      return ts.isJsxElement(n) ? childrenVerdict(n.children) : "icon";
    }
    if (tag === "svg") return "icon";
    if (tag === "img") {
      const alt = attr(open, "alt")?.initializer;
      if (!alt) return "icon";
      if (ts.isStringLiteral(alt)) return hasWord(alt.text) ? "text" : "icon";
      return "text";
    }
    if (/^[A-Z]/.test(tag)) return /(Icon|Glyph|Logo|Svg)$/.test(tag) ? "icon" : "text";
    // <span className="theme-dot" /> — decoration with nothing to read.
    if (ts.isJsxSelfClosingElement(n)) return "icon";
    return childrenVerdict(n.children);
  }
  return "text";
}

export function iconOnlyButtons(source: string, file: string): Hit[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: Hit[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const open = ts.isJsxElement(n) ? n.openingElement : n;
      if (open.tagName.getText() === "button") {
        buttonsSeen++;
        const spread = open.attributes.properties.some((a) => ts.isJsxSpreadAttribute(a));
        if (!spread && !named(open)) {
          const verdict = ts.isJsxElement(n) ? childrenVerdict(n.children) : "icon";
          if (verdict === "icon") {
            const tip = attr(open, "title") ?? attr(open, "data-tip");
            hits.push({
              file,
              line: sf.getLineAndCharacterOfPosition(open.getStart()).line + 1,
              glyphs: ts.isJsxElement(n)
                ? n.children.map((c) => c.getText()).join("").replace(/\s+/g, " ").trim().slice(0, 60)
                : "(empty)",
              title: tip?.initializer?.getText() ?? "",
            });
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

/* ---------- fixtures ---------- */

const scan = (jsx: string) => iconOnlyButtons(`const x = (\n${jsx}\n);`, "fixture.tsx");
const isHit = (name: string, jsx: string) => check(`hit: ${name}`, scan(jsx).length, 1);
const notHit = (name: string, jsx: string) => check(`not a hit: ${name}`, scan(jsx).length, 0);

isHit("bare glyph", `<button>✕</button>`);
isHit("title alone is not a name", `<button title="Close">✕</button>`);
isHit("data-tip alone is not a name", `<button data-tip="x">+</button>`);
isHit("ternary of two glyphs", `<button>{open ? "▾" : "▸"}</button>`);
isHit("svg", `<button><svg/></button>`);
isHit("img without alt", `<button><img src="a.png"/></button>`);
isHit("an *Icon component", `<button><CloseIcon/></button>`);
isHit("aria-hidden span", `<button><span aria-hidden>✕</span></button>`);
isHit("aria-hidden words still hidden", `<button><span aria-hidden="true">Close</span></button>`);
isHit("emoji", `<button>🔥</button>`);
isHit("empty self-closing", `<button />`);
isHit("self-closing decoration child", `<button><span className="theme-dot" /></button>`);
isHit("glyph after &&", `<button>{busy && "…"}</button>`);

notHit("aria-label", `<button aria-label="Close">✕</button>`);
notHit("aria-labelledby", `<button aria-labelledby="x">✕</button>`);
notHit("aria-label expression", `<button aria-label={name}>✕</button>`);
notHit("plain words", `<button>Save</button>`);
notHit("ternary with one word branch", `<button>{open ? "Hide" : "▸"}</button>`);
notHit("identifier child", `<button>{label}</button>`);
notHit("glyph plus a word span", `<button>+ <span>New</span></button>`);
notHit("digits", `<button>1.</button>`);
notHit("sr-only text", `<button><span aria-hidden>✕</span><span className="sr-only">Close</span></button>`);
notHit("child that names itself", `<button><span aria-label="Close">✕</span></button>`);
notHit("img with alt", `<button><img src="a.png" alt="Close"/></button>`);
notHit("spread may carry the label", `<button {...rest}>✕</button>`);
notHit("non-icon component", `<button><Kbd k="Esc"/></button>`);
notHit("other tags are out of scope", `<div>✕</div>`);

{
  const src = `const a = <button>Save</button>;\nconst b = 1;\nconst c = <button title="Close (Esc)">✕</button>;\n`;
  const hits = iconOnlyButtons(src, "lines.tsx");
  check("reports the button's own line", hits.map((h) => h.line), [3]);
  check("reports the title source", hits[0]?.title, `"Close (Esc)"`);
  check("reports the glyph", hits[0]?.glyphs, "✕");
}

/* ---------- the tree ---------- */

/* The owner's InspectorPane hits (the tool-strip fold and the "+" tab),
   left for them because that file is mid-split in their local work.
   Matched on title rather than file name so the exemption survives the
   split; a retitle makes them fail loudly, which is the point. */
const HELD_TITLES = ["Add a tool back, or rearrange the tabs", "Hide the tool strip"];

const ROOT = resolve(".");
const files: string[] = [];
(function walk(dir: string) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    // isDirectory() on a Dirent is false for a symlink, so a link to an
    // ancestor (the CLAUDE.md trap) is never walked.
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile() && e.name.endsWith(".tsx")) files.push(p);
  }
})(join(ROOT, "src"));

buttonsSeen = 0;
const treeHits: Hit[] = [];
for (const f of files) treeHits.push(...iconOnlyButtons(readFileSync(f, "utf8"), relative(ROOT, f)));

// Floors sit well under today's tree (55 files, ~350 buttons): they are
// there to catch a walk that silently found nothing, not to assert growth.
ok(`walked src (${files.length} .tsx files, want at least 45)`, files.length >= 45);
ok(`scanned buttons (${buttonsSeen}, want at least 300)`, buttonsSeen >= 300);

for (const h of treeHits) {
  if (HELD_TITLES.some((t) => h.title.includes(t))) continue;
  ok(
    `${h.file}:${h.line} ${h.glyphs} (title ${h.title || "none"}) — give it an aria-label; title and data-tip are not names`,
    false,
  );
}

/* ---------- report ---------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`icon names: ${checks} checks passed`);
