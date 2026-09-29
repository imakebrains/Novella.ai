/* A saved API key is never rendered back.

   CLAUDE.md: a key is "never logged, never rendered back". The Plugins
   tab used to seed its password input straight from settingsFor().get,
   so the real key sat in the DOM one devtools click away. This suite
   proves the helper that replaced that read can't hand a key back, that
   provider error text is scrubbed of the key before it reaches a
   sentence on screen, and — by scanning source — that no .tsx has
   quietly gone back to reading a secret into a component.

   Same shape as test-units.ts: silent unless something is wrong,
   non-zero exit when it is. Nothing opens a socket; fetch is faked. */

import { readdirSync, readFileSync, lstatSync } from "node:fs";
import { join } from "node:path";
import type { SettingField } from "./src/core/plugins";
import { hasSavedSecret, isSaved, readPlain, secretFieldView, type SettingsHandle } from "./src/ui/secretFieldCore";
import { redactSecret } from "./src/plugins/providers/redact";
import { listRemoteModels, makeOpenAICompatibleProvider } from "./src/plugins/providers/openaiCompatible";

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

function ok(name: string, condition: boolean, detail?: string): void {
  checks++;
  if (!condition) {
    failures++;
    console.error(`FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

async function rejection(name: string, run: () => Promise<unknown>): Promise<string> {
  checks++;
  try {
    await run();
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  failures++;
  console.error(`FAIL  ${name}\n        expected a rejection, it resolved`);
  return "";
}

const SECRET = "sk-ant-api03-REALKEY-0123456789abcdef";
const secretField: SettingField = { key: "apiKey", label: "API key", kind: "password", secret: true };
const plainField: SettingField = { key: "model", label: "Model", kind: "text" };

/* ---------- A. the helper never returns the secret ---------- */

for (const [label, stored, expected] of [
  ["empty string", "", false],
  ["whitespace", "   ", false],
  ["undefined", undefined, false],
  ["null", null, false],
  ["a number", 42, false],
  ["a real key", SECRET, true],
] as const) {
  const got = hasSavedSecret(stored);
  check(`hasSavedSecret: ${label}`, got, expected);
  check(`hasSavedSecret: ${label} is a boolean, not the value`, typeof got, "boolean");
}

const reads: string[] = [];
const spy: SettingsHandle = {
  get(k) {
    reads.push(k);
    return SECRET;
  },
  set() {},
};

check("readPlain: a secret field starts empty", readPlain(spy, secretField), "");
check("readPlain: and the secret is never even read", reads.length, 0);
check("readPlain: a plain field still reads its value", readPlain(spy, plainField), SECRET);
reads.length = 0;

const blank = (v: unknown): SettingsHandle => ({ get: () => v, set() {} });
check("readPlain: undefined reads as empty", readPlain(blank(undefined), plainField), "");
check("readPlain: null reads as empty", readPlain(blank(null), plainField), "");

const emptyHandle = blank(undefined);
for (const hasSavedCase of [true, false]) {
  for (const desktop of [true, false]) {
    for (const draft of ["", "sk-typed-new-0000"]) {
      const hasSaved = isSaved(hasSavedCase ? spy : emptyHandle, secretField);
      const view = secretFieldView(hasSaved, draft, desktop);
      const tag = `view(saved=${hasSaved}, desktop=${desktop}, draft=${JSON.stringify(draft)})`;
      check(`${tag}: isSaved agrees with the store`, hasSaved, hasSavedCase);
      ok(`${tag}: never carries the stored key`, !JSON.stringify(view).includes(SECRET));
      check(`${tag}: value is the writer's own draft`, view.value, draft);
      check(`${tag}: Clear offered only when a key is saved`, view.canClear, hasSaved);
      check(`${tag}: "type to replace" iff saved`, view.placeholder.includes("type to replace"), hasSaved);
      check(`${tag}: keychain named iff saved on desktop`, view.placeholder.includes("keychain"), hasSaved && desktop);
      check(`${tag}: "this session" iff saved on the web`, view.placeholder.includes("this session"), hasSaved && !desktop);
      if (hasSaved) ok(`${tag}: house voice keeps its em-dash`, view.placeholder.includes("—"));
    }
  }
}

check("view: a saved key shows as an empty field, not dots", secretFieldView(true, "", true).value, "");

{
  const mem = new Map<string, unknown>();
  const handle: SettingsHandle = { get: (k) => mem.get(k), set: (k, v) => void mem.set(k, v) };
  handle.set("apiKey", SECRET);
  check("clear: a stored key reads as saved", isSaved(handle, secretField), true);
  handle.set("apiKey", "");
  check("clear: writing empty reads as not saved", isSaved(handle, secretField), false);
}

check("view: the field's own placeholder shows when nothing is saved", secretFieldView(false, "", true, "Paste it here").placeholder, "Paste it here");
check("view: with no placeholder of its own", secretFieldView(false, "", true).placeholder, "Paste your key");

/* ---------- B. redactSecret ---------- */

const K = "sk-proj-abcdEFGH1234ijklMNOP5678";
check("redact: the OpenAI sentence", redactSecret("Incorrect API key provided: " + K, K), "Incorrect API key provided: [your key]");
check("redact: every occurrence", redactSecret(`${K} and ${K}`, K), "[your key] and [your key]");
check("redact: a Bearer header echo", redactSecret(`Bearer ${K}`, K), "Bearer [your key]");
check("redact: empty secret leaves text alone", redactSecret("text " + K, ""), "text " + K);
check("redact: undefined secret leaves text alone", redactSecret("text", undefined), "text");
check("redact: null secret leaves text alone", redactSecret("text", null), "text");
check("redact: a too-short secret would shred words, so it's ignored", redactSecret("abc abcdef", "abc"), "abc abcdef");
check("redact: regex characters in a key need no escaping", redactSecret("key a+b.c*d?e(f) rejected", "a+b.c*d?e(f)"), "key [your key] rejected");
check("redact: a pasted key with stray spaces still matches", redactSecret("bad " + K, " " + K + " "), "bad [your key]");

/* ---------- C. providers redact at the source ---------- */

const realFetch = globalThis.fetch;

async function withFetch(respond: () => Response, run: () => Promise<void>): Promise<void> {
  globalThis.fetch = (async () => respond()) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = realFetch;
  }
}

const echo401 = () => new Response(JSON.stringify({ error: { message: "bad key " + K } }), { status: 401 });
const provider = makeOpenAICompatibleProvider(() => ({ baseUrl: "https://api.example.com/v1", apiKey: K, model: "m" }));

async function providers(): Promise<void> {
  await withFetch(echo401, async () => {
    const msg = await rejection("listRemoteModels: 401 rejects", () => listRemoteModels("https://api.example.com/v1", K));
    ok("listRemoteModels: the echoed key is gone", !msg.includes(K), msg);
    ok("listRemoteModels: and says so", msg.includes("[your key]"), msg);
  });

  await withFetch(echo401, async () => {
    const msg = await rejection("generateStream: 401 rejects", () => provider.generateStream({ system: "", prompt: "x" }, () => {}));
    ok("generateStream: the echoed key is gone from an HTTP error", !msg.includes(K) && msg.includes("[your key]"), msg);
  });

  await withFetch(
    () => new Response("data: " + JSON.stringify({ error: { message: "echo " + K } }) + "\n\n", { status: 200 }),
    async () => {
      const msg = await rejection("generateStream: an in-stream error rejects", () => provider.generateStream({ system: "", prompt: "x" }, () => {}));
      ok("generateStream: the echoed key is gone from a stream error", !msg.includes(K) && msg.includes("[your key]"), msg);
    },
  );
}

/* ---------- D. no .tsx renders a secret back ---------- */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const path = join(dir, name);
    // lstat, not stat: a symlink to its own parent has hung a walker here before.
    const st = lstatSync(path);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const sources = walk("src");
const secretKeys = new Set<string>();
for (const file of sources) {
  for (const m of readFileSync(file, "utf8").matchAll(/key:\s*"([^"]+)"[^{}]*?secret:\s*true/g)) {
    if (m[1]) secretKeys.add(m[1]);
  }
}
ok("scan: the secret-key harvest found apiKey", secretKeys.has("apiKey"), [...secretKeys].join(", "));

/* A handle is anything bound from settingsFor(). Reading a quoted secret
   key through one is the bug; so is a dynamic read, because nothing at
   scan time can say field.key isn't a secret — those go through
   readPlain / isSaved, which decide before touching the value. */
function findReadbacks(src: string): string[] {
  const found: string[] = [];
  const handles = new Set<string>();
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*(?:[\w$]+\.)*settingsFor\(/g)) {
    if (m[1]) handles.add(m[1]);
  }
  for (const h of handles) {
    const read = new RegExp("(?<![\\w$.])" + h + "\\s*\\.get(?:<[^>]*>)?\\(\\s*([^)]*?)\\s*\\)", "g");
    for (const m of src.matchAll(read)) {
      const arg = m[1] ?? "";
      const literal = /^(["'`])([^"'`]*)\1$/.exec(arg);
      if (literal) {
        if (secretKeys.has(literal[2] ?? "")) found.push(`${h} reads secret ${literal[2]}`);
      } else {
        found.push(`${h}.get(${arg}) is a dynamic settings read — route it through readPlain/isSaved in src/ui/secretFieldCore.ts`);
      }
    }
  }
  if (/settingsFor\([^)]*\)\s*\.get(?:<[^>]*>)?\(/.test(src)) found.push("direct settingsFor().get");
  if (/\{[^}]*\bget\b[^}]*\}\s*=\s*(?:[\w$]+\.)*settingsFor\(/.test(src)) found.push("destructured get from settingsFor()");
  for (const k of secretKeys) {
    if (new RegExp("settings\\s*\\.get(?:<[^>]*>)?\\(\\s*[\"'`]" + k + "[\"'`]").test(src)) {
      found.push(`a settings handle reads secret ${k}`);
    }
  }
  return found;
}

// The scan has to be able to fire, or a clean result means nothing.
const ORIGINAL = `
  const settings = pluginHost.settingsFor(pluginId);
  const [value, setValue] = useState<string>(() => {
    const v = settings.get(field.key);
    return v === undefined || v === null ? "" : String(v);
  });
  return <input value={value} />;`;
const LITERAL = `const s = pluginHost.settingsFor("provider-anthropic"); <input value={String(s.get("apiKey"))} />`;
const DIRECT = `<input value={pluginHost.settingsFor(id).get("apiKey") as string} />`;
const CTX = `const key = ctx.settings.get<string>("apiKey");`;
const SAFE = `const settings = pluginHost.settingsFor("provider-ollama-streaming"); const m = settings.get("model");`;
const SAFE2 = `const settings = pluginHost.settingsFor(pluginId); useState(() => readPlain(settings, field)); isSaved(settings, field)`;
ok("scan self-test: the original SettingRow is caught", findReadbacks(ORIGINAL).length >= 1);
ok("scan self-test: a literal secret read is caught", findReadbacks(LITERAL).length >= 1);
ok("scan self-test: a direct settingsFor().get is caught", findReadbacks(DIRECT).length >= 1);
ok("scan self-test: a ctx.settings secret read is caught", findReadbacks(CTX).length >= 1);
check("scan self-test: a non-secret literal read is fine", findReadbacks(SAFE), []);
check("scan self-test: the readPlain/isSaved route is fine", findReadbacks(SAFE2), []);

let tsxCount = 0;
for (const file of sources.filter((f) => f.endsWith(".tsx"))) {
  tsxCount++;
  const findings = findReadbacks(readFileSync(file, "utf8"));
  ok(`scan: ${file} renders no secret back`, findings.length === 0, `${file}: ${findings.join("; ")}`);
}
ok("scan: it actually walked the components", tsxCount > 10, `only ${tsxCount} .tsx files`);

{
  const conn = readFileSync("src/plugins/providers/connections.ts", "utf8");
  ok(
    "connections: keyFor stays unexported",
    !/export\s+(async\s+)?function\s+keyFor\b/.test(conn) && !/export\s*\{[^}]*\bkeyFor\b/.test(conn),
  );
  ok("connections: test and generation failures are both redacted", (conn.match(/redactSecret\(/g) ?? []).length >= 2);
  for (const file of sources.filter((f) => f.endsWith(".tsx"))) {
    ok(`scan: ${file} never touches keyFor`, !/\bkeyFor\b/.test(readFileSync(file, "utf8")));
  }
  ok("SecretField.tsx reads nothing back", !readFileSync("src/ui/SecretField.tsx", "utf8").includes(".get("));
}

/* ---------- E. connection probes carry no key ---------- */

async function probes(): Promise<void> {
  // The connections store persists through localStorage at module load.
  const mem = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  };
  mem.set("novella.connections", "[]");
  mem.set("novella.connections.seeded", "1");
  const { addConnection, noteResult, probeOf, testConnection } = await import("./src/plugins/providers/connections");

  const conn = addConnection({ kind: "openai", label: "Echoing server", model: "m", baseUrl: "https://api.example.com/v1" }, K);
  await withFetch(echo401, async () => {
    const result = await testConnection(conn);
    check("test button: an echoing server still fails", result.ok, false);
    ok("test button: the key is not in the sentence", !result.detail.includes(K) && result.detail.includes("[your key]"), result.detail);
    ok("test button: nor in the stored probe", !(probeOf(conn.id).detail ?? "").includes(K));
  });

  noteResult(conn.id, false, "Generation failed: Incorrect API key provided: " + K);
  const detail = probeOf(conn.id).detail ?? "";
  ok("noteResult: a generation failure is recorded without the key", !detail.includes(K) && detail.includes("[your key]"), detail);
  noteResult(conn.id, true);
  check("noteResult: success still clears the detail", probeOf(conn.id).detail, undefined);
}

/* ---------- report ---------- */

async function main(): Promise<void> {
  await providers();
  await probes();
  if (failures > 0) {
    console.error(`\n${failures} of ${checks} checks FAILED`);
    process.exit(1);
  }
  console.log(`secretfield: ${checks} checks passed`);
}

void main();
