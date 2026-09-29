/* The public docs tell the truth about the optional cloud.

   Same shape as test-units.ts: silent unless something is wrong, non-zero
   exit when it is.

   README and SECURITY once promised "no account, no cloud sync" and stayed
   that way after the cloud was built — and SECURITY went further, promising
   end-to-end encryption the sync as built does not have. Both documents are
   the first thing a writer reads before trusting Novella with a novel, so a
   stale promise there is worse than a missing feature. Three things are
   checked, because each has gone wrong once:

   1. An absolute claim ("no account", "never syncs", "no cloud") must carry
      the local-default qualifier in the same block. Local-first without an
      account is true of every build; "no account, ever" stops being true
      the day the owner sets the two values in .env.example.
   2. No sentence asserts end-to-end encryption or ciphertext unless it
      negates it. The sync stores readable text; saying otherwise is the
      "encrypted label on plaintext" SECURITY.md itself calls theatre.
   3. Every repo path either document cites exists, and every snake_case
      symbol it names appears in the code. A security page that points at a
      file that was renamed reads as checked when nobody can check it.

   The claim test is a heuristic. An honest sentence can trip it ("no
   account is needed to write"); the fix is to state the local default in
   that same block, which is what the failure message says. Blocks are
   paragraphs split further at list items, so a qualifier in one bullet
   cannot vouch for a claim in the next. Whitespace is collapsed first:
   both docs wrap at ~76 columns, and a claim split across a line break
   must not slip past a pattern with a literal space in it. */

import { readFileSync, existsSync, readdirSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail?: string): void {
  checks++;
  if (!condition) {
    failures++;
    console.error(`FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

const ROOT = resolve(".");

// ---------------------------------------------------------------- helpers

const FENCE = /```[\s\S]*?```/g;

function flat(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Paragraphs, with each list item its own block. Fenced code is dropped:
    shell examples are not claims and their paths are illustrative. */
function blocks(md: string): string[] {
  const out: string[] = [];
  for (const para of md.replace(FENCE, "").split(/\n\s*\n/)) {
    for (const item of para.split(/\n(?=\s*(?:[-*]|\d+\.)\s)/)) {
      const b = flat(item);
      if (b) out.push(b);
    }
  }
  return out;
}

const ABSOLUTE: RegExp[] = [
  /\bno accounts?\b/i,
  /\bnever sync(s|ed)?\b/i,
  /\bno cloud\b/i,
  /\bno sync\b/i,
  /\bno (?:(?:google|apple|email)(?: or | and |, ?| ))*sign-?(?:in|up)\b/i,
];

const QUALIFIER =
  /local-first|by default|\bthe default\b|without (an|creating an|signing in to an) account|until you sign in|unless you sign in|optional (cloud|account)|cloud is off|builds? without the cloud|if you (sign in|create an account)|signed out/i;

function absoluteClaims(md: string): string[] {
  return blocks(md)
    .filter((b) => ABSOLUTE.some((re) => re.test(b)) && !QUALIFIER.test(b))
    .map((b) => b.slice(0, 120));
}

/** A negation that governs the term itself — "not end-to-end", "no
    end-to-end", "not yet end-to-end", "not ciphertext". A bare "never"
    elsewhere in the sentence ("receives ciphertext and never holds a
    key") is not a negation of the claim, and passing it was the bug. */
const E2E = /end-to-end|ciphertext/i;
const E2E_NEGATED = /\b(?:not|no|isn't|aren't|never)\s+(?:\S+\s+){0,2}?(?:end-to-end|encrypted|ciphertext)/i;

function e2eClaims(md: string): string[] {
  const hits: string[] = [];
  for (const b of blocks(md)) {
    for (const sentence of b.split(/(?<=[.!?][*_)"'”]*)\s+/)) {
      if (E2E.test(sentence) && !E2E_NEGATED.test(sentence)) hits.push(sentence.slice(0, 120));
    }
  }
  return hits;
}

/** Build output: real paths once built, absent in a clean checkout and CI. */
const GENERATED = ["src-tauri/target/", "dist/"];
const REPO_PATH = [
  /^(?:src|src-tauri|supabase|docs|scripts|public|\.github)\/[A-Za-z0-9_.\/-]+$/,
  /^test-[a-z0-9-]+\.ts$/,
  /^(?:package\.json|\.env\.example|vite\.config\.ts)$/,
];

/** Relative paths a doc cites: link targets and path-shaped code spans.
    Bare names like `known_vaults.json` or `.novella/` are runtime names,
    not repo files, and are left alone. */
function citedPaths(md: string): string[] {
  const text = md.replace(FENCE, "");
  const found = new Set<string>();
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue;
    const path = target.split("#")[0];
    if (path) found.add(path);
  }
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const span = m[1];
    if (span && REPO_PATH.some((re) => re.test(span))) found.add(span);
  }
  return [...found].filter((p) => !GENERATED.some((g) => p.startsWith(g)));
}

/** snake_case code spans — commands, tables, SQL functions. */
function citedSymbols(md: string): string[] {
  const found = new Set<string>();
  for (const m of md.replace(FENCE, "").matchAll(/`([^`\n]+)`/g)) {
    const span = m[1];
    if (span && /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?:\(\))?$/.test(span)) found.add(span.replace(/\(\)$/, ""));
  }
  return [...found];
}

// ------------------------------------------------- the helpers themselves

const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

ok("fixture: bare 'no account' is flagged", absoluteClaims("No account, ever.").length === 1);
ok(
  "fixture: 'no account' with the local default passes",
  absoluteClaims("No account needed — Novella is local-first by default.").length === 0,
);
ok("fixture: 'never syncs' is flagged", absoluteClaims("The cloud never syncs.").length === 1);
ok(
  "fixture: a claim wrapped across lines is still flagged",
  absoluteClaims("The free tier has no\n   account and no server to talk to.").length === 1,
);
ok("fixture: 'no Google or Apple sign-in' is flagged", absoluteClaims("There is no Google or Apple sign-in.").length === 1);
ok(
  "fixture: a qualifier in one bullet does not vouch for the next",
  absoluteClaims("- Local-first by default.\n- No account, ever.").length === 1,
);
ok("fixture: asserted end-to-end is flagged", e2eClaims("Sync is end-to-end encrypted.").length === 1);
ok("fixture: negated end-to-end passes", e2eClaims("Sync is not end-to-end encrypted.").length === 0);
ok(
  "fixture: the old principle 2 is flagged",
  e2eClaims("The server stores\n   ciphertext. Novella's operator must not be able to read a novel.").length === 1,
);
ok(
  "fixture: an unrelated 'never' does not negate ciphertext",
  e2eClaims("The server receives ciphertext and never holds a key capable of decrypting it.").length === 1,
);
{
  const got = citedPaths(
    "see `src/cloud/config.ts` and [x](SECURITY.md) and [y](https://a.b) and `known_vaults.json` and `src-tauri/target/release/bundle/`",
  );
  ok("fixture: citedPaths keeps repo paths, skips URLs, runtime names and build output", same(got, ["src/cloud/config.ts", "SECURITY.md"]), JSON.stringify(got));
}
ok("fixture: citedPaths ignores fenced code", citedPaths("```\ncat `src/nope.ts`\n```\n").length === 0);
{
  const got = citedSymbols("`allow_vault` `push_file()` `owner_id = auth.uid()`");
  ok("fixture: citedSymbols finds snake_case spans", same(got, ["allow_vault", "push_file"]), JSON.stringify(got));
}

// ------------------------------------------------------------- the docs

/** Every text file under the dirs that define commands, tables and SQL
    functions. lstat, never stat: writing-skills holds a symlink to its own
    parent (CLAUDE.md), and a walk that follows links never comes back. */
function corpus(dirs: string[]): string {
  const parts: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "target" || name === "dist") continue;
      const full = join(dir, name);
      const st = lstatSync(full);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(full);
      else if (/\.(ts|tsx|rs|sql|json|toml)$/.test(name)) parts.push(readFileSync(full, "utf8"));
    }
  };
  for (const d of dirs) if (existsSync(join(ROOT, d))) walk(join(ROOT, d));
  return parts.join("\n");
}

const CODE = corpus(["src", join("src-tauri", "src"), "supabase"]);
const FLOORS: Record<string, number> = { "README.md": 3, "SECURITY.md": 12 };
const docs: Record<string, string> = {};

for (const doc of ["README.md", "SECURITY.md"]) {
  const md = readFileSync(join(ROOT, doc), "utf8");
  docs[doc] = md;

  const claims = absoluteClaims(md);
  ok(
    `${doc}: no unqualified 'no account' / 'never syncs' / 'no cloud' claim`,
    claims.length === 0,
    `${claims.map((c) => `"${c}"`).join("\n        ")}\n        state the local default in the same paragraph (e.g. 'without an account', 'by default')`,
  );

  const e2e = e2eClaims(md);
  ok(
    `${doc}: no sentence asserts end-to-end encryption`,
    e2e.length === 0,
    `${e2e.map((c) => `"${c}"`).join("\n        ")}\n        synced books are stored readable by the project's operator; say so, or negate the claim`,
  );

  const paths = citedPaths(md);
  for (const p of paths) ok(`${doc}: ${p} exists`, existsSync(resolve(ROOT, p)), "cited but missing");
  ok(`${doc}: cites at least ${FLOORS[doc]} repo paths`, paths.length >= (FLOORS[doc] ?? 0), `found ${paths.length}: ${paths.join(", ")}`);

  for (const s of citedSymbols(md)) ok(`${doc}: \`${s}\` appears in the code`, CODE.includes(s), "named in the doc but found nowhere in src/, src-tauri/src/ or supabase/");
}

const secPaths = citedPaths(docs["SECURITY.md"] ?? "");
for (const p of ["supabase/tests/isolation_test.sql", "src/cloud/sessionStorage.ts", "src-tauri/src/lib.rs"]) {
  ok(`SECURITY.md cites ${p}`, secPaths.includes(p));
}
ok("README.md links to SECURITY.md", citedPaths(docs["README.md"] ?? "").includes("SECURITY.md"));

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`docs: ${checks} checks passed`);
