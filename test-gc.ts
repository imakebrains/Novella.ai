/* The blob collector's pure rules (supabase/functions/_shared/gcCore.ts):
   who may call it, whose folders it sweeps, and what one run removes.
   Silent unless something is wrong; non-zero exit when it is. The SQL
   half — which keys are unreferenced — is proven in
   supabase/tests/isolation_test.sql against real Postgres. */

import { CRON_HEADER, MAX_KEYS_PER_RUN, cronAuthorized, planRemoval, usersToSweep } from "./supabase/functions/_shared/gcCore";

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

const secret = "0123456789abcdef0123456789abcdef";
ok("the right secret opens the door", cronAuthorized(secret, secret));
ok("one wrong character does not", !cronAuthorized("0123456789abcdef0123456789abcdeX", secret));
ok("a missing header does not", !cronAuthorized(null, secret));
ok("an empty header does not", !cronAuthorized("", secret));
ok("a prefix of the secret is not enough", !cronAuthorized(secret.slice(0, 20), secret));
ok("nor is the secret with something after it", !cronAuthorized(secret + "x", secret));
ok("no secret configured lets nobody in, not everybody", !cronAuthorized("", ""));
ok("a secret too short to be one is refused outright", !cronAuthorized("abc", "abc"));
check("the header name is fixed and lower-case, as fetch() delivers it", CRON_HEADER, "x-cron-secret");

check("users: union, once each, blanks dropped, sorted", usersToSweep(["u2", "u1", null, "u2"], ["u3", "", "u1"]), ["u1", "u2", "u3"]);
check("users: nobody to sweep is an empty run, not an error", usersToSweep([], []), []);

const keys = ["u1/p/a", "u1/p/b", "u2/p/c", "u1/../u2/x", "u1/p/d"];
check("removal: only the account's own keys, batched", planRemoval(keys, "u1", 10), { batches: [["u1/p/a", "u1/p/b", "u1/p/d"]], deferred: 0 });
check("removal: a budget defers the rest to the next run", planRemoval(keys, "u1", 2), { batches: [["u1/p/a", "u1/p/b"]], deferred: 1 });
check("removal: no budget removes nothing and defers everything", planRemoval(keys, "u1", 0), { batches: [], deferred: 3 });
check("removal: a negative budget is no budget", planRemoval(keys, "u1", -5), { batches: [], deferred: 3 });
const many = Array.from({ length: 250 }, (_, i) => `u1/p/${i}`);
check("removal: batches of 100 for the Storage API", planRemoval(many, "u1", MAX_KEYS_PER_RUN).batches.map((b) => b.length), [100, 100, 50]);
ok("the per-run cap drains a backlog in hours, not weeks", MAX_KEYS_PER_RUN >= 500);

if (failures > 0) {
  console.error(`\ntest-gc: ${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`test-gc: ${checks} checks passed`);
