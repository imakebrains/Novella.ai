/* Assertions for where browser-stored state belongs (src/cloud/prefs.ts).

   Silent unless something is wrong, non-zero exit when it is.

   The first half is a guard, not a unit test: it reads every source
   file, finds every "novella.…" storage key, and fails if the table
   doesn't say where it belongs — or if the table lists a key nothing
   uses any more. New keys arrive with every feature; this is what makes
   each one choose a home instead of silently staying on one machine. */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { STORAGE_KEYS, accountSnapshot, homeOf, mergeSettings, settingsDiff, type KeyValueStore } from "./src/cloud/prefs";

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

/* ---------------- the guard ---------------- */

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

// A quoted or templated literal starting "novella." — the static part,
// and whether code follows it (a key built at runtime).
const LITERAL = /["'`](novella\.[A-Za-z0-9_.-]*)(\$\{)?/g;
const found = new Map<string, { dynamic: boolean; where: string }>();
for (const file of sources("src")) {
  if (file.endsWith("prefs.ts")) continue;
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(LITERAL)) {
    const key = m[1]!;
    const dynamic = m[2] !== undefined;
    if (!found.has(key) || dynamic) found.set(key, { dynamic, where: file });
  }
}

for (const [key, { dynamic, where }] of found) {
  const covered = dynamic
    ? STORAGE_KEYS.some((r) => r.prefix && r.key === key) || homeOf(`${key}x`) !== null
    : homeOf(key) !== null || STORAGE_KEYS.some((r) => r.prefix && r.key === key);
  checks++;
  if (!covered) {
    failures++;
    console.error(`FAIL  storage key "${key}${dynamic ? "…" : ""}" (${where}) has no home in src/cloud/prefs.ts — classify it as account, book or device`);
  }
}
for (const rule of STORAGE_KEYS) {
  checks++;
  const used = [...found.keys()].some((k) => (rule.prefix ? k === rule.key || k.startsWith(rule.key) : k === rule.key));
  if (!used) {
    failures++;
    console.error(`FAIL  prefs.ts lists "${rule.key}" but no source uses it any more — remove the rule`);
  }
}
check("the scan found keys at all (it isn't silently scanning nothing)", found.size > 30, true);
check("no rule lists a key twice", new Set(STORAGE_KEYS.map((r) => `${r.key}|${!!r.prefix}`)).size, STORAGE_KEYS.length);

/* ---------------- classification ---------------- */

check("theme follows the writer", homeOf("novella.theme"), "account");
check("chat belongs to its book", homeOf("novella.chat.proj-1"), "book");
check("a pane width stays on the machine", homeOf("novella.pane.left"), "device");
check("a dynamic pane key stays too", homeOf("novella.pane.codex.width"), "device");
check("the sign-in never syncs", homeOf("novella.cloud.session"), "device");
check("crash drafts never sync", homeOf("novella.draft.C:/Books/Drift/ch1.md"), "device");
check("an exact rule beats a prefix", homeOf("novella.calendar.feedsOpen"), "device");
check("an unknown key has no home", homeOf("somethingElse"), null);
check("a bare prefix isn't a key", homeOf("novella.chat."), null);

/* ---------------- snapshot, merge, apply ---------------- */

const store = (entries: Record<string, string>): KeyValueStore => {
  const keys = Object.keys(entries);
  return { length: keys.length, key: (i) => keys[i] ?? null, getItem: (k) => entries[k] ?? null, setItem: () => {} };
};
check(
  "a snapshot takes account keys only",
  accountSnapshot(store({ "novella.theme": "ink", "novella.pane.left": "280", "novella.chat.p": "[]", "novella.sessions": "[1]", "novella.cloud.session": "tok" })),
  { "novella.theme": "ink", "novella.sessions": "[1]" },
);

const base = { "novella.theme": "ink", "novella.profile": "{}", "novella.sprints": "[]" };
check(
  "theme changed here, profile changed there: both kept",
  mergeSettings(base, { ...base, "novella.theme": "vellum" }, { ...base, "novella.profile": '{"name":"Wren"}' }),
  { "novella.theme": "vellum", "novella.profile": '{"name":"Wren"}', "novella.sprints": "[]" },
);
check(
  "the same key changed on both sides: this device wins",
  mergeSettings(base, { ...base, "novella.theme": "vellum" }, { ...base, "novella.theme": "noir" })["novella.theme"],
  "vellum",
);
const { ["novella.sprints"]: _gone, ...withoutSprints } = base;
check(
  "a delete on one side sticks",
  "novella.sprints" in mergeSettings(base, base, withoutSprints),
  false,
);
check(
  "a device key in an old cloud doc is dropped, never applied",
  "novella.pane.left" in mergeSettings({}, {}, { "novella.pane.left": "900" }),
  false,
);
check(
  "applying writes what changed and removes what went",
  settingsDiff({ "novella.theme": "ink", "novella.sprints": "[]", "novella.pane.left": "280" }, { "novella.theme": "vellum" }),
  { set: { "novella.theme": "vellum" }, remove: ["novella.sprints"] },
);

if (failures > 0) {
  console.error(`\ntest-prefs: ${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`test-prefs: ${checks} checks passed`);
