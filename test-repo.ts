/* Repo hygiene — the two landmines that actually went off.

   Same shape as test-units.ts: silent unless something is wrong, non-zero
   exit when it is.

   Neither of these is about the app's behaviour. Both are about the tree
   itself, and both cost real time on 2026-08-20:

   1. A SYMLINK POINTING AT ITS OWN ANCESTOR.
      writing-skills/vendor/story-skills/plugins/story-skills -> ..
      Vite's watcher follows symlinks by default, so it walked
      plugins/story-skills/plugins/story-skills/... until the path was too
      long to stat, and took the dev server down with it. The link is
      deliberate upstream — Codex marketplace entries have to point at a
      child plugin directory — so it is not a thing to delete; it is a
      thing to KNOW ABOUT before some tool runs with --follow. Most tools
      here are safe (git and ripgrep never follow, tsc only reads src),
      but the next one added might not be.

   2. STRAY CONTROL CHARACTERS IN SOURCE.
      A `\b` written through a heredoc reached prose.ts as a literal 0x08
      backspace byte, turning /^\s+by\b/ into /^\s+by<BS>/ — a regex that
      compiled fine, read fine, and never matched. Only a failing
      assertion found it. A byte you cannot see in a diff is worth a gate. */

import { readdirSync, lstatSync, readlinkSync, readFileSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";

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

/** Directories never worth walking, for speed rather than correctness. */
const SKIP = new Set(["node_modules", ".git", "target", "dist", ".vite"]);

interface Found {
  links: { at: string; to: string; recursive: boolean }[];
  controls: { at: string; line: number; code: string }[];
}

/** Source we author. Vendored reference text is not ours to police. */
const SOURCE = /\.(ts|tsx|css|json|rs|html|js|mjs)$/;
const VENDORED = ["writing-skills", "src-tauri" + sep + "target"];

/* Control characters that have no business in source. Tab (0x09), newline
   (0x0a) and carriage return (0x0d) are deliberately absent.

   Written with \x escapes rather than the characters themselves, which
   sounds obvious and is exactly what went wrong the first time this line
   was authored: it was generated through a shell heredoc, the escapes
   were consumed on the way in, and the file ended up holding the raw
   bytes it exists to forbid. */
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;

function walk(dir: string, out: Found, depth = 0): void {
  // Depth cap so a loop this test has NOT yet reported cannot hang the
  // test that exists to report it.
  if (depth > 24) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const full = join(dir, e.name);
    const rel = relative(ROOT, full);

    // lstat, never stat: the whole point is to see the link, not through it.
    let st;
    try {
      st = lstatSync(full);
    } catch {
      continue;
    }

    if (st.isSymbolicLink()) {
      const target = readlinkSync(full);
      const resolved = resolve(dir, target);
      // A link is recursive when it resolves to itself or to something it
      // lives inside — that is the shape that walks forever.
      const recursive = full === resolved || full.startsWith(resolved + sep);
      out.links.push({ at: rel, to: target, recursive });
      continue; // never descend through a link
    }

    if (st.isDirectory()) {
      walk(full, out, depth + 1);
      continue;
    }

    if (!SOURCE.test(e.name)) continue;
    if (VENDORED.some((v) => rel.startsWith(v))) continue;

    let text: string;
    try {
      text = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    if (!CONTROL.test(text)) continue;
    text.split("\n").forEach((line, i) => {
      const m = CONTROL.exec(line);
      if (m) {
        out.controls.push({
          at: rel,
          line: i + 1,
          code: "0x" + m[0].charCodeAt(0).toString(16).padStart(2, "0"),
        });
      }
    });
  }
}

const found: Found = { links: [], controls: [] };
walk(ROOT, found);

/* ============================================================
   No source file carries an invisible control character
   ============================================================ */

ok(
  "no stray control characters in source",
  found.controls.length === 0,
  found.controls.map((c) => `${c.at}:${c.line} contains ${c.code}`).join("\n        "),
);

/* ============================================================
   Recursive symlinks are known, not discovered

   This does not fail on the known one — it is upstream's, it is
   deliberate, and removing it would be a fork. It fails when a NEW one
   appears, so the next person to vendor a self-referential tree finds out
   from the gate instead of from a dead dev server.
   ============================================================ */

const KNOWN_RECURSIVE = [
  join("writing-skills", "vendor", "story-skills", "plugins", "story-skills"),
];

const recursive = found.links.filter((l) => l.recursive).map((l) => l.at);
const unexpected = recursive.filter((p) => !KNOWN_RECURSIVE.includes(p));

ok(
  "no NEW recursive symlink has appeared",
  unexpected.length === 0,
  unexpected.length
    ? `${unexpected.join(", ")}\n        ` +
      "A symlink pointing at its own ancestor makes any tool that follows\n        " +
      "symlinks walk forever. Vite's watcher does. If this one is deliberate,\n        " +
      "add it to KNOWN_RECURSIVE here and to server.watch.ignored in vite.config.ts."
    : undefined,
);

// And the known one must still be known: if it is ever removed upstream,
// this list should shrink with it rather than quietly rot.
for (const known of KNOWN_RECURSIVE) {
  ok(
    `the documented recursive symlink is still where it is documented (${known})`,
    recursive.includes(known),
    "It is gone. Drop it from KNOWN_RECURSIVE, and from vite.config.ts's ignore list.",
  );
}

/* The vite watcher must keep ignoring every directory holding one, or the
   dev server dies again the next time the watcher restarts. */
const viteConfig = readFileSync("vite.config.ts", "utf8");
for (const known of KNOWN_RECURSIVE) {
  const top = known.split(sep)[0]!;
  ok(
    `vite's watcher ignores ${top}`,
    viteConfig.includes(top),
    `server.watch.ignored in vite.config.ts must cover **/${top}/**`,
  );
}

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`repo hygiene: ${checks} checks passed`);
