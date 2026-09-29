/* Assertion tests for the persistent-storage ask.

   Same shape as test-units.ts: silent unless something is wrong, non-zero
   exit when it is. The navigator is faked — the real persist() answer
   depends on the browser, the origin's engagement and whether the app is
   installed, none of which a test can stand up. What CAN be pinned is the
   decision: every shape of missing, refusing or throwing API lands on one
   of three answers and never on an exception. */

import {
  decidePersistence,
  requestPersistentStorage,
  persistenceAnswer,
  onPersistenceAnswer,
  type PersistenceAnswer,
} from "./src/storage/persistence";
import { persistenceLine, type StorageBacking } from "./src/storage/persistenceCopy";

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

const nav = (persist?: () => Promise<boolean>) => ({ storage: persist ? { persist } : {} });

// Order matters: the first check is the state before anything was asked.
ok("nothing asked yet: answer is null", persistenceAnswer() === null);

check("no navigator at all", await decidePersistence(undefined), "unsupported");
check("navigator without storage", await decidePersistence({}), "unsupported");
// Node's own navigator has no storage — proves the guard on a real object.
check("Node's real navigator", await decidePersistence(globalThis.navigator as never), "unsupported");
check("storage without persist (older Safari)", await decidePersistence(nav()), "unsupported");
check("persist() true", await decidePersistence(nav(async () => true)), "granted");
check("persist() false", await decidePersistence(nav(async () => false)), "denied");

try {
  const a = await decidePersistence(
    nav(async () => {
      throw new Error("blocked");
    }),
  );
  check("persist() rejects", a, "unsupported");
  ok("a rejection resolves, it does not reject", true);
} catch {
  ok("a rejection resolves, it does not reject", false);
}

try {
  const a = await decidePersistence(
    nav(() => {
      throw new Error("sync");
    }),
  );
  check("persist() throws synchronously", a, "unsupported");
} catch {
  ok("a synchronous throw resolves, it does not reject", false);
}

// The real persist() is a method; called detached it throws "Illegal
// invocation". A fake that needs its `this` proves it is called on storage.
{
  const storage = {
    granted: true,
    persist(this: { granted: boolean }) {
      return Promise.resolve(this.granted);
    },
  };
  check("persist() is called on its StorageManager", await decidePersistence({ storage }), "granted");
}

let calls = 0;
const first = await requestPersistentStorage(nav(async () => (calls++, true)));
check("persist() called exactly once per request", calls, 1);
check("request returns the answer", first, "granted");
check("the answer is remembered", persistenceAnswer(), "granted");

const seen: PersistenceAnswer[] = [];
const off = onPersistenceAnswer((a) => seen.push(a));
await requestPersistentStorage(nav(async () => false));
check("subscriber hears the answer", seen, ["denied"]);
check("the latest answer replaces the earlier one", persistenceAnswer(), "denied");

off();
await requestPersistentStorage(nav(async () => true));
check("unsubscribed listener hears nothing more", seen, ["denied"]);

const offBad = onPersistenceAnswer(() => {
  throw new Error("ui");
});
try {
  const a = await requestPersistentStorage(nav(async () => true));
  check("a throwing subscriber does not break the request", a, "granted");
} catch {
  ok("a throwing subscriber does not break the request", false);
}
offBad();

try {
  check("default argument under Node", await requestPersistentStorage(), "unsupported");
} catch {
  ok("default argument under Node does not throw", false);
}

/* ---------- the sentence the writer sees ---------- */

const ANSWERS: PersistenceAnswer[] = ["granted", "denied", "unsupported"];
const BACKINGS: StorageBacking[] = ["web", "tauri", "memory"];

for (const a of ANSWERS) {
  check(`desktop says nothing (${a})`, persistenceLine(a, "tauri"), null);
  check(`memory fallback says nothing (${a})`, persistenceLine(a, "memory"), null);
}
check("web before the ask settles says nothing", persistenceLine(null, "web"), null);

const granted = persistenceLine("granted", "web");
check("granted reads as ok", granted?.tone, "ok");
ok("granted says the browser agreed", /agreed/.test(granted?.text ?? ""));

// persistence.ts: denied is Chrome's normal first answer, so neither the
// tone nor the words may read as a failure.
const FAILURE_WORDS = /denied|fail|error|refus|couldn|can't|cannot|lost/i;
for (const a of ["denied", "unsupported"] as const) {
  const line = persistenceLine(a, "web");
  check(`${a} is quiet, not a warning`, line?.tone, "quiet");
  ok(`${a} copy does not read as a failure`, !FAILURE_WORDS.test(line?.text ?? "x denied"));
}

for (const a of ANSWERS) {
  const line = persistenceLine(a, "web");
  ok(`${a} copy is a real sentence about the browser`, !!line && line.text.length > 20 && /browser/.test(line.text));
}

for (const a of [...ANSWERS, null]) {
  for (const b of BACKINGS) {
    const line = persistenceLine(a, b);
    ok(`tone is ok or quiet (${a}, ${b})`, line === null || line.tone === "ok" || line.tone === "quiet");
  }
}

/* ---------- report ---------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`persistence: ${checks} checks passed`);
