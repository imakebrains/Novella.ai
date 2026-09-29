/* Assertions for settings that follow the writer (src/cloud/settingsSync.ts,
   settingsMergers.ts, settingsRemote.ts).

   Silent unless something is wrong, non-zero exit when it is.

   The round runs against an in-memory put_settings with the real
   compare-and-swap rules (supabase/migrations/20260923000000_cloud_sync.sql):
   a stale base version is a conflict carrying the current row, a document
   over 256 KB raises settings_too_large. Two MemLocal stores stand in for
   two machines. The host, the refreshers and the banner need a browser
   and a signed-in account; they are typechecked, and the source guards
   at the bottom keep their mounts from being lost in a merge. */

import { readFileSync } from "node:fs";
import { STORAGE_KEYS, accountSnapshot, homeOf, type SettingsDoc } from "./src/cloud/prefs";
import {
  MAX_ATTEMPTS,
  REFRESH,
  SETTINGS_MAX_BYTES,
  SETTINGS_REPLACED_KEY,
  SETTINGS_SYNC_KEY,
  docBytes,
  isCredentialKey,
  looksLikeCredential,
  parsePutReply,
  parseSettingsDoc,
  parseSettingsRow,
  readBase,
  reloadNeeded,
  stableJson,
  syncSettingsRound,
  syncable,
  type PutReply,
  type RoundDeps,
  type SettingsLocal,
  type SettingsRemote,
  type SettingsRow,
} from "./src/cloud/settingsSync";
import { VALUE_MERGERS, mergeSettingsDeep, threeWayRecords } from "./src/cloud/settingsMergers";
import { supabaseSettings } from "./src/cloud/settingsRemote";

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
function ok(name: string, cond: boolean): void {
  checks++;
  if (!cond) {
    failures++;
    console.error(`FAIL  ${name}`);
  }
}

/* ---------------- fixtures ---------------- */

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

class MemLocal implements SettingsLocal {
  map = new Map<string, string>();
  constructor(init: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(init)) this.map.set(k, v);
  }
  get length(): number {
    return this.map.size;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  /** What this machine would sync right now. */
  account(): SettingsDoc {
    return syncable(accountSnapshot(this));
  }
}

class FakeServer implements SettingsRemote {
  row: SettingsRow | null = null;
  putCalls = 0;
  readCalls = 0;
  limit = SETTINGS_MAX_BYTES;
  beforePut: ((call: number) => void) | null = null;
  async read(): Promise<SettingsRow | null> {
    this.readCalls++;
    return this.row ? clone(this.row) : null;
  }
  async put(base: number, doc: SettingsDoc): Promise<PutReply> {
    this.putCalls++;
    this.beforePut?.(this.putCalls);
    if (docBytes(doc) > this.limit) throw new Error("bad_request:settings_too_large");
    if ((this.row?.version ?? 0) !== base) return { ok: false, current: this.row ? clone(this.row) : null };
    this.row = { doc: clone(doc), version: base + 1 };
    return { ok: true, version: base + 1 };
  }
  /** Another device's successful put. */
  write(doc: SettingsDoc): void {
    this.row = { doc: clone(doc), version: (this.row?.version ?? 0) + 1 };
  }
}

const THEME = "novella.theme";
const PROFILE = "novella.profile";
const TIMERS = "novella.timers";
const SESSIONS = "novella.sessions";
const CONNECTIONS = "novella.connections";
const PLANNER = "novella.planner";

function round(server: FakeServer, local: MemLocal, extra: Partial<RoundDeps> = {}) {
  return syncSettingsRound({ remote: server, local, userId: "u1", now: () => 1000, ...extra });
}

/** A machine that last agreed with the server at `version` on `doc`. */
function synced(doc: SettingsDoc, version: number, extra: Record<string, string> = {}): MemLocal {
  return new MemLocal({ ...doc, ...extra, [SETTINGS_SYNC_KEY]: JSON.stringify({ userId: "u1", version, doc }) });
}

const SK = "sk-ant-api03-" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5";
const JWT_LIKE = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.sig";

/* ============================================================
   Pure helpers
   ============================================================ */

check("docBytes matches jsonb::text spacing", docBytes({ a: "b", cc: "d" }), Buffer.byteLength('{"a": "b", "cc": "d"}'));
check("docBytes of an empty doc", docBytes({}), 2);
check("docBytes counts UTF-8 bytes", docBytes({ a: "é—" }), Buffer.byteLength('{"a": "é—"}'));

for (const k of ["novella.cloud.session", "novella.plugin.provider-anthropic.apiKey", "x.token", "x.SECRET", "x.password"]) {
  ok(`"${k}" is a credential name`, isCredentialKey(k) || homeOf(k) !== "account");
}
for (const k of ["novella.plugin.provider-anthropic.apiKey", "x.token", "x.SECRET"]) ok(`isCredentialKey("${k}")`, isCredentialKey(k));
for (const k of ["novella.theme", "novella.accentSwatches", "novella.tourOffered", "novella.sessions"]) {
  ok(`"${k}" is not a credential name`, !isCredentialKey(k));
}
check("novella.cloud.session is kept home by prefs.ts, not by the name filter", homeOf("novella.cloud.session"), "device");
check(
  "every account key passes the name filter (a regex tweak must not silently unsync one)",
  STORAGE_KEYS.filter((r) => r.home === "account" && isCredentialKey(r.prefix ? `${r.key}x` : r.key)).map((r) => r.key),
  [],
);

ok("an sk- API key looks like a credential", looksLikeCredential(SK));
ok("a key inside JSON does too", looksLikeCredential(JSON.stringify([{ notes: `mine is ${SK}` }])));
ok("a JWT looks like a credential", looksLikeCredential(JWT_LIKE));
ok("a theme id does not", !looksLikeCredential("vellum"));
ok("a profile does not", !looksLikeCredential('{"name":"Wren"}'));
ok("an id that merely contains sk- does not", !looksLikeCredential("task-a1B2c3D4e5F6g7H8i9J0k1L2"));

check("put reply: ok", parsePutReply({ ok: true, version: 2 }), { ok: true, version: 2 });
check("put reply: bigint as a string", parsePutReply({ ok: true, version: "7" }), { ok: true, version: 7 });
check(
  "put reply: conflict with the current row",
  parsePutReply({ ok: false, reason: "conflict", current: { doc: { [THEME]: "ink" }, version: 3 } }),
  { ok: false, current: { doc: { [THEME]: "ink" }, version: 3 } },
);
check("put reply: conflict on a missing row", parsePutReply({ ok: false, reason: "conflict", current: null }), { ok: false, current: null });
for (const junk of [null, "ok", { ok: "yes" }, { ok: true }, { ok: false, reason: "other" }]) {
  let threw = false;
  try {
    parsePutReply(junk);
  } catch {
    threw = true;
  }
  ok(`put reply garbage throws: ${JSON.stringify(junk)}`, threw);
}
check("row: bigint version as a string", parseSettingsRow({ doc: { [THEME]: "ink" }, version: "4" }), { doc: { [THEME]: "ink" }, version: 4 });
check("row: none", parseSettingsRow(null), null);

check(
  "parseSettingsDoc drops non-strings, device, book and credential keys",
  parseSettingsDoc({
    [THEME]: "ink",
    [PROFILE]: 5,
    "novella.pane.left": "280",
    "novella.chat.p1": "[]",
    "novella.plugin.provider-anthropic.apiKey": '"x"',
    "novella.plugin.provider-ollama-streaming.model": '"llama"',
  }),
  { [THEME]: "ink", "novella.plugin.provider-ollama-streaming.model": '"llama"' },
);

/* ---- record-level merging ---- */

const b = { a: 1, b: 1, c: 1 };
check("records: an edit on one side wins", threeWayRecords(b, { ...b, a: 2 }, b), { a: 2, b: 1, c: 1 });
check("records: an edit on both keeps mine", threeWayRecords(b, { ...b, a: 2 }, { ...b, a: 3 }), { a: 2, b: 1, c: 1 });
check("records: theirs' edit alongside mine", threeWayRecords(b, { ...b, a: 2 }, { ...b, b: 3 }), { a: 2, b: 3, c: 1 });
check("records: a delete on one side sticks", threeWayRecords(b, { a: 1, b: 1 }, b), { a: 1, b: 1 });
check("records: empty base is a union", threeWayRecords<number>({}, { a: 1 }, { b: 2 }), { a: 1, b: 2 });

const day = (d: string, words: number) => ({ day: d, words, baseline: 100 });
const sessions = (days: Record<string, ReturnType<typeof day>>, bestStreak = 0) => JSON.stringify({ days, bestStreak });
{
  const base = sessions({ "2026-09-20": day("2026-09-20", 50) }, 1);
  const mine = sessions({ "2026-09-20": day("2026-09-20", 50), "2026-09-22": day("2026-09-22", 300) }, 2);
  const theirs = sessions({ "2026-09-20": day("2026-09-20", 50), "2026-09-21": day("2026-09-21", 500) }, 4);
  const out = JSON.parse(VALUE_MERGERS[SESSIONS]!(base, mine, theirs)!) as { days: Record<string, unknown>; bestStreak: number };
  check("sessions: Monday from theirs, Tuesday from mine", Object.keys(out.days).sort(), ["2026-09-20", "2026-09-21", "2026-09-22"]);
  check("sessions: best streak is the higher one", out.bestStreak, 4);
}

{
  const e = (id: string, text: string) => ({ id, day: "2026-09-21", text });
  const cal = (entries: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ v: 1, entries, migrated: true, ...extra });
  const out = JSON.parse(VALUE_MERGERS["novella.calendar"]!(undefined, cal([e("a", "A"), e("b", "B")]), cal([e("b", "B2"), e("c", "C")]))!) as {
    entries: { id: string; text: string }[];
    migrated: boolean;
  };
  check("calendar: first-sync union by id, mine wins a clash", out.entries.map((x) => `${x.id}:${x.text}`), ["a:A", "b:B", "c:C"]);
  check("calendar: migrated survives", out.migrated, true);
  check("calendar: a different schema version falls back", VALUE_MERGERS["novella.calendar"]!(undefined, cal([], { v: 1 }), cal([], { v: 2 })), null);
}

{
  const s = (id: string, startedAt: number) => ({ id, startedAt, durationMin: 20, words: 100, completed: true });
  const many = (from: number, n: number) => Array.from({ length: n }, (_, i) => s(`s${from + i}`, from + i));
  const mine = JSON.stringify({ history: many(0, 40), active: { id: "run", startedAt: 999, durationMin: 10, wordsStart: 5 }, pinned: "keep me" });
  const theirs = JSON.stringify({ history: many(30, 40), active: null });
  const out = JSON.parse(VALUE_MERGERS["novella.sprints"]!(undefined, mine, theirs)!) as {
    history: { id: string; startedAt: number }[];
    active: { id: string } | null;
    pinned?: string;
  };
  check("sprints: union capped at 50", out.history.length, 50);
  check("sprints: newest first", out.history[0]!.startedAt, 69);
  check("sprints: the oldest fall off", out.history[49]!.startedAt, 20);
  check("sprints: the running sprint stays mine", out.active?.id, "run");
  check("sprints: an unknown top-level field in mine survives", out.pinned, "keep me");
  check(
    "sprints: a renamed history field falls back to the whole-value pick",
    VALUE_MERGERS["novella.sprints"]!(undefined, JSON.stringify({ runs: [], active: null }), theirs),
    null,
  );
  check(
    "sprints: a record without a numeric startedAt falls back",
    VALUE_MERGERS["novella.sprints"]!(undefined, JSON.stringify({ history: [{ id: "x", startedAt: "yesterday" }] }), theirs),
    null,
  );
}

check("a merger refuses bad JSON", VALUE_MERGERS[SESSIONS]!(undefined, "{nope", sessions({})), null);
check(
  "mergeSettingsDeep keeps mine when a merger refuses",
  mergeSettingsDeep({ [SESSIONS]: sessions({}) }, { [SESSIONS]: "{nope" }, { [SESSIONS]: sessions({ x: day("x", 1) }) })[SESSIONS],
  "{nope",
);
check(
  "mergeSettingsDeep leaves a one-sided change to mergeSettings",
  mergeSettingsDeep({ [PLANNER]: "{}" }, { [PLANNER]: "{}" }, { [PLANNER]: '{"d":"x"}' })[PLANNER],
  '{"d":"x"}',
);

/* ============================================================
   The round
   ============================================================ */

// First sign-in uploads.
{
  const server = new FakeServer();
  const local = new MemLocal({ [THEME]: "vellum", [PROFILE]: '{"name":"Wren"}', "novella.pane.left": "280", "novella.chat.p1": "[]" });
  const r = await round(server, local);
  check("first sign-in: pushed", r.outcome, "pushed");
  check("first sign-in: server at version 1", server.row?.version, 1);
  check("first sign-in: only account keys went up", server.row?.doc, { [THEME]: "vellum", [PROFILE]: '{"name":"Wren"}' });
  const base = readBase(local, "u1");
  check("first sign-in: the base remembers account and version", [base?.userId, base?.version], ["u1", 1]);

  // Idempotence.
  const again = await round(server, local);
  check("nothing changed: in-sync", again.outcome, "in-sync");
  check("nothing changed: no second put", server.putCalls, 1);
  check("nothing changed: nothing applied", again.applied, []);
}

// A second device merges, the account wins, and nothing is lost unseen.
{
  const server = new FakeServer();
  server.write({ [THEME]: "vellum", [PROFILE]: "P" });
  const bee = new MemLocal({ [THEME]: "ember", [TIMERS]: '{"mode":"alarm"}', "novella.pane.left": "280" });
  const r = await round(server, bee);
  check("second device: takes the account's theme", bee.getItem(THEME), "vellum");
  check("second device: takes the profile", bee.getItem(PROFILE), "P");
  check("second device: keeps its own timers", bee.getItem(TIMERS), '{"mode":"alarm"}');
  check("second device: uploads them", server.row?.doc[TIMERS], '{"mode":"alarm"}');
  check("second device: pane width untouched and absent from the server", [bee.getItem("novella.pane.left"), "novella.pane.left" in server.row!.doc], ["280", false]);
  const stash = JSON.parse(bee.getItem(SETTINGS_REPLACED_KEY) ?? "{}") as { userId: string; values: SettingsDoc };
  check("second device: what the account replaced is kept", stash.values, { [THEME]: "ember" });
  check("second device: applied lists exactly what was written", [...r.applied].sort(), [PROFILE, THEME]);
}

// The boot-time rewrite of sessions must not erase the other machine's days.
{
  const s0 = sessions({ "2026-09-20": day("2026-09-20", 50) });
  const d0 = { [THEME]: "vellum", [SESSIONS]: s0 };
  const server = new FakeServer();
  server.row = { doc: clone(d0), version: 1 };
  const a = synced(d0, 1);
  const bee = synced(d0, 1);
  a.setItem(SESSIONS, sessions({ "2026-09-20": day("2026-09-20", 50), "2026-09-21": day("2026-09-21", 800) }, 2));
  await round(server, a);
  bee.setItem(SESSIONS, sessions({ "2026-09-20": day("2026-09-20", 50), "2026-09-29": day("2026-09-29", 0) }));
  await round(server, bee);
  const days = (raw: string | null | undefined) => Object.keys((JSON.parse(raw ?? "{}") as { days: object }).days).sort();
  check("rebaseline survival: B has Monday and today", days(bee.getItem(SESSIONS)), ["2026-09-20", "2026-09-21", "2026-09-29"]);
  check("rebaseline survival: so does the server", days(server.row?.doc[SESSIONS]), ["2026-09-20", "2026-09-21", "2026-09-29"]);
}

// Concurrent edits on two devices converge.
{
  const d0 = { [THEME]: "ember", [PROFILE]: "P1" };
  const server = new FakeServer();
  server.row = { doc: clone(d0), version: 1 };
  const a = synced(d0, 1);
  const bee = synced(d0, 1);
  a.setItem(THEME, "vellum");
  bee.setItem(THEME, "nocturne");
  bee.setItem(PROFILE, "P2");
  await round(server, a);
  await round(server, bee);
  await round(server, a);
  check("converge: A equals B", stableJson(a.account()), stableJson(bee.account()));
  check("converge: both equal the server", stableJson(a.account()), stableJson(server.row!.doc));
  check("converge: the later device's theme (mine wins a double change)", a.getItem(THEME), "nocturne");
  check("converge: B's profile", a.getItem(PROFILE), "P2");
}

// A conflict retries once and wins.
{
  const d0 = { [THEME]: "ember", [PROFILE]: "P1" };
  const server = new FakeServer();
  server.row = { doc: clone(d0), version: 1 };
  const a = synced(d0, 1);
  a.setItem(THEME, "vellum");
  server.beforePut = (call) => {
    if (call === 1) server.write({ [THEME]: "ember", [PROFILE]: "P3" });
  };
  const r = await round(server, a);
  check("conflict: two puts", server.putCalls, 2);
  check("conflict: pushed", r.outcome, "pushed");
  check("conflict: server has A's theme and the competing profile", server.row?.doc, { [THEME]: "vellum", [PROFILE]: "P3" });
  check("conflict: A took the profile", a.getItem(PROFILE), "P3");
  check("conflict: A's base is the server's version", readBase(a, "u1")?.version, server.row?.version);
}

// The re-merge after a conflict uses the document just taken in as its base.
{
  const server = new FakeServer();
  server.row = { doc: { [THEME]: "ember", [PROFILE]: "P" }, version: 1 };
  const a = synced({ [THEME]: "ember", [PROFILE]: "P" }, 1);
  server.write({ [THEME]: "vellum", [PROFILE]: "P" });
  a.setItem(PROFILE, "X");
  server.beforePut = (call) => {
    if (call === 1) server.write({ [THEME]: "nocturne", [PROFILE]: "P" });
  };
  await round(server, a);
  check("re-merge base: the newest remote theme wins, not the one applied a moment ago", [a.getItem(THEME), server.row?.doc[THEME]], ["nocturne", "nocturne"]);
  check("re-merge base: A's own profile edit survives", [a.getItem(PROFILE), server.row?.doc[PROFILE]], ["X", "X"]);
}

// A first sync that hits a conflict keeps the device's ORIGINAL values in the stash.
{
  const server = new FakeServer();
  server.write({ [THEME]: "vellum" });
  const bee = new MemLocal({ [THEME]: "ember", [TIMERS]: "T" });
  server.beforePut = (call) => {
    if (call === 1) server.write({ [THEME]: "nocturne", [PROFILE]: "P" });
  };
  await round(server, bee);
  const stash = JSON.parse(bee.getItem(SETTINGS_REPLACED_KEY) ?? "{}") as { values: SettingsDoc };
  check("first-sync conflict: the stash still holds this device's own theme", stash.values, { [THEME]: "ember" });
  check("first-sync conflict: server has all three", stableJson(server.row!.doc), stableJson({ [THEME]: "nocturne", [PROFILE]: "P", [TIMERS]: "T" }));
}

// Bounded: a server that always moves on gets MAX_ATTEMPTS puts, then the round stops.
{
  const server = new FakeServer();
  server.row = { doc: { [THEME]: "ember" }, version: 1 };
  const a = synced({ [THEME]: "ember" }, 1);
  a.setItem(THEME, "vellum");
  server.beforePut = (call) => server.write({ ...server.row!.doc, [PROFILE]: `P${call}` });
  let threw = false;
  let outcome = "";
  try {
    outcome = (await round(server, a)).outcome;
  } catch {
    threw = true;
  }
  check("bounded: gave up", [outcome, threw], ["gave-up", false]);
  check("bounded: exactly MAX_ATTEMPTS puts", server.putCalls, MAX_ATTEMPTS);
}

// Device keys and credentials never leave.
{
  const server = new FakeServer();
  const conns = JSON.stringify([{ id: "claude", name: "Claude", notes: SK }]);
  const local = new MemLocal({
    [THEME]: "vellum",
    "novella.cloud.session": JWT_LIKE,
    "novella.pane.left": "280",
    "novella.cloudBindings": "{}",
    "novella.draft.x": "words",
    "novella.plugin.provider-anthropic.apiKey": JSON.stringify(SK),
    [CONNECTIONS]: conns,
  });
  await round(server, local);
  check("credentials: only the theme went up", Object.keys(server.row?.doc ?? {}), [THEME]);
  ok("credentials: no sk- anywhere in the server doc", !JSON.stringify(server.row?.doc).includes("sk-ant"));
  check("credentials: the local connections are left alone", local.getItem(CONNECTIONS), conns);
  check("credentials: the session is left alone", local.getItem("novella.cloud.session"), JWT_LIKE);
}

// A value held back for looking like a key is neither a deletion nor overwritten.
{
  const c0 = JSON.stringify([{ id: "local", name: "Ollama" }]);
  const d0 = { [THEME]: "ember", [CONNECTIONS]: c0 };
  const server = new FakeServer();
  server.row = { doc: clone(d0), version: 1 };
  const a = synced(d0, 1);
  const bee = synced(d0, 1);
  const bad = JSON.stringify([{ id: "local", name: "Ollama", notes: SK }]);
  a.setItem(CONNECTIONS, bad);
  a.setItem(THEME, "vellum");
  await round(server, a);
  check("held back: the server keeps the clean connections", server.row?.doc[CONNECTIONS], c0);
  check("held back: A's theme still went up", server.row?.doc[THEME], "vellum");
  check("held back: A's own value untouched", a.getItem(CONNECTIONS), bad);
  await round(server, bee);
  check("held back: B keeps its connections", bee.getItem(CONNECTIONS), c0);
  check("held back: B took the theme", bee.getItem(THEME), "vellum");

  // Theirs has a newer clean value: still not written over A's.
  const c1 = JSON.stringify([{ id: "local", name: "Ollama 2" }]);
  bee.setItem(CONNECTIONS, c1);
  await round(server, bee);
  await round(server, a);
  check("held back: a newer remote value doesn't overwrite it either", a.getItem(CONNECTIONS), bad);
  check("held back: and the server's newer value stands", server.row?.doc[CONNECTIONS], c1);
}

// Book keys never travel through user_settings.
{
  const server = new FakeServer();
  const bookKeys = [
    "novella.chat.p1",
    "novella.agents.p1",
    "novella.boards.p1",
    "novella.board.panels.p1",
    "novella.plot.p1",
    "novella.music.p1",
    "novella.history.n",
    "novella.trash.p1",
  ];
  const local = new MemLocal({ [THEME]: "vellum", ...Object.fromEntries(bookKeys.map((k) => [k, "[]"])) });
  await round(server, local);
  for (const k of bookKeys) check(`book key stays out: ${k}`, homeOf(k) === "book" && !(k in (server.row?.doc ?? {})), true);
}

// A poisoned server document is never applied.
{
  const server = new FakeServer();
  server.row = {
    doc: {
      [THEME]: "vellum",
      "novella.chat.p1": "[]",
      "novella.pane.left": "900",
      "novella.cloud.session": "x",
      "novella.plugin.provider-anthropic.apiKey": JSON.stringify(SK),
    },
    version: 1,
  };
  const bee = synced({ [THEME]: "ember" }, 1, { "novella.pane.left": "280" });
  await round(server, bee);
  check("poison: pane width unchanged", bee.getItem("novella.pane.left"), "280");
  check(
    "poison: nothing else written",
    ["novella.chat.p1", "novella.cloud.session", "novella.plugin.provider-anthropic.apiKey"].map((k) => bee.getItem(k)),
    [null, null, null],
  );
  check("poison: the clean part applied", bee.getItem(THEME), "vellum");
}

// A vanished row never wipes this device.
{
  const server = new FakeServer();
  const a = synced({ [THEME]: "vellum", [PROFILE]: "P" }, 5);
  await round(server, a);
  check("vanished row: local kept", [a.getItem(THEME), a.getItem(PROFILE)], ["vellum", "P"]);
  check("vanished row: pushed at base 0", server.row, { doc: { [THEME]: "vellum", [PROFILE]: "P" }, version: 1 });
}

// "Last seen" is what the store really holds, so a write the quota
// refused doesn't read as a new local change on every poll.
{
  const server = new FakeServer();
  server.write({ [THEME]: "vellum", [PROFILE]: "P" });
  const full = new MemLocal({ [THEME]: "ember" });
  const setItem = full.setItem.bind(full);
  full.setItem = (k: string, v: string) => {
    if (k === PROFILE) throw new Error("QuotaExceededError");
    setItem(k, v);
  };
  const r = await round(server, full);
  check("quota: the refused key isn't reported as applied", r.applied, [THEME]);
  check("quota: last seen matches the store", stableJson(r.local), stableJson(full.account()));
}

// Oversize is refused locally, every time, without a put.
{
  const server = new FakeServer();
  const local = new MemLocal({ [THEME]: "vellum", "novella.calendar": "x".repeat(SETTINGS_MAX_BYTES) });
  let threw = false;
  const outcomes: string[] = [];
  let message = "";
  try {
    for (let i = 0; i < 2; i++) {
      const r = await round(server, local);
      outcomes.push(r.outcome);
      message = r.message ?? "";
    }
  } catch {
    threw = true;
  }
  check("oversize: too-large twice, never thrown", [outcomes, threw], [["too-large", "too-large"], false]);
  check("oversize: no put", server.putCalls, 0);
  ok(`oversize: the message names the limit and the culprit (${message})`, message.includes("256 KB") && message.includes("novella.calendar"));
}

// The server's own size refusal maps to too-large, with no retry.
{
  const server = new FakeServer();
  server.limit = 50;
  const local = new MemLocal({ [THEME]: "vellum", [PROFILE]: "a profile long enough to pass fifty bytes" });
  const r = await round(server, local);
  check("server too-large: outcome", r.outcome, "too-large");
  check("server too-large: one put", server.putCalls, 1);
}

// Another error from put is the host's to describe.
{
  const server = new FakeServer();
  server.beforePut = () => {
    throw new Error("Failed to fetch");
  };
  let threw = false;
  try {
    await round(server, new MemLocal({ [THEME]: "vellum" }));
  } catch {
    threw = true;
  }
  ok("a network error is rethrown", threw);
}

// A different account on this machine takes the first-sync path.
{
  const server = new FakeServer();
  server.row = { doc: { [THEME]: "vellum" }, version: 3 };
  const local = synced({ [THEME]: "ember", [PROFILE]: "P" }, 9);
  const r = await syncSettingsRound({ remote: server, local, userId: "u2", now: () => 1000 });
  check("new account: account wins the theme", local.getItem(THEME), "vellum");
  check("new account: nothing deleted", local.getItem(PROFILE), "P");
  check("new account: pushed with both", [r.outcome, server.row?.doc], ["pushed", { [THEME]: "vellum", [PROFILE]: "P" }]);
  check("new account: base now belongs to u2", readBase(local, "u2")?.version, 4);
}

// Removals are applied and reported.
{
  const d0 = { [THEME]: "ember", [PLANNER]: '{"d":"x"}' };
  const server = new FakeServer();
  server.row = { doc: { [THEME]: "ember" }, version: 2 };
  const a = synced(d0, 1);
  const r = await round(server, a);
  check("removal: applied", r.applied, [PLANNER]);
  check("removal: gone locally", a.getItem(PLANNER), null);
}

// onApplied runs before the push is awaited, which is what keeps a
// cached store from writing its stale copy back during the wait.
{
  const s0 = sessions({ "2026-09-20": day("2026-09-20", 50) });
  const d0 = { [SESSIONS]: s0 };
  const withMonday = sessions({ "2026-09-20": day("2026-09-20", 50), "2026-09-21": day("2026-09-21", 800) });
  const withToday = sessions({ "2026-09-20": day("2026-09-20", 50), "2026-09-29": day("2026-09-29", 10) });
  const hasMonday = (raw: string | null | undefined) => raw != null && raw.includes("2026-09-21");

  for (const refresh of [true, false]) {
    const server = new FakeServer();
    server.row = { doc: clone(d0), version: 1 };
    const a = synced(d0, 1);
    a.setItem(SESSIONS, withMonday);
    await round(server, a);

    const bee = synced(d0, 1);
    bee.setItem(SESSIONS, withToday);
    // B's sessions store: the in-memory copy recordProgress writes back.
    let cached = withToday;
    server.beforePut = () => bee.setItem(SESSIONS, cached);
    const onApplied = refresh
      ? (keys: string[]) => {
          if (keys.includes(SESSIONS)) cached = bee.getItem(SESSIONS)!;
        }
      : undefined;
    await round(server, bee, { onApplied });
    server.beforePut = null;
    await round(server, bee, { onApplied });
    if (refresh) {
      ok("onApplied: B keeps A's Monday", hasMonday(bee.getItem(SESSIONS)));
      ok("onApplied: so does the server", hasMonday(server.row?.doc[SESSIONS]));
    } else {
      // The control: without the synchronous refresh the hazard is real.
      ok("control: without onApplied the stale cache erases Monday", !hasMonday(server.row?.doc[SESSIONS]));
    }
  }
}

check("reloadNeeded: sprints", reloadNeeded(["novella.sprints"]), true);
check("reloadNeeded: plugins", reloadNeeded(["novella.enabledPlugins", THEME]), true);
check("reloadNeeded: theme alone", reloadNeeded([THEME]), false);
check("reloadNeeded: a per-plugin setting", reloadNeeded(["novella.plugin.provider-ollama-streaming.model"]), false);

// The Supabase adapter over a fake client.
{
  const calls: unknown[] = [];
  const fakeClient = {
    from(table: string) {
      calls.push(["from", table]);
      return {
        select(cols: string) {
          calls.push(["select", cols]);
          return { maybeSingle: async () => ({ data: { doc: { [THEME]: "ink", "novella.pane.left": "9" }, version: "4" }, error: null }) };
        },
      };
    },
    async rpc(name: string, args: unknown) {
      calls.push(["rpc", name, args]);
      return { data: { ok: true, version: "5" }, error: null };
    },
  };
  const remote = supabaseSettings(fakeClient as unknown as Parameters<typeof supabaseSettings>[0]);
  check("remote read: parsed and filtered, bigint as number", await remote.read(), { doc: { [THEME]: "ink" }, version: 4 });
  check("remote put: reply parsed", await remote.put(4, { [THEME]: "ink" }), { ok: true, version: 5 });
  check("remote: the calls", calls, [
    ["from", "user_settings"],
    ["select", "doc,version"],
    ["rpc", "put_settings", { p_base_version: 4, p_doc: { [THEME]: "ink" } }],
  ]);

  const failing = {
    rpc: async () => ({ data: null, error: { message: "bad_request:settings_too_large", code: "22023" } }),
  };
  let msg = "";
  try {
    await supabaseSettings(failing as unknown as Parameters<typeof supabaseSettings>[0]).put(0, {});
  } catch (err) {
    msg = (err as { message: string }).message;
  }
  check("remote put: a server error is thrown as-is, so the round can map it", msg, "bad_request:settings_too_large");
}

/* ============================================================
   Guards
   ============================================================ */

const accountRules = STORAGE_KEYS.filter((r) => r.home === "account").map((r) => r.key);
for (const key of accountRules) {
  checks++;
  if (!(key in REFRESH)) {
    failures++;
    console.error(
      `FAIL  account key "${key}" has no REFRESH entry — add it to REFRESH in src/cloud/settingsSync.ts (refresher, read-through, quiet or reload) so the running app hears when settings sync changes it`,
    );
  }
}
check("every REFRESH key is an account rule", Object.keys(REFRESH).filter((k) => !accountRules.includes(k)), []);

const refreshSource = readFileSync("src/cloud/settingsRefresh.ts", "utf8");
for (const [key, how] of Object.entries(REFRESH)) {
  if (how !== "refresher") continue;
  ok(`refresher "${key}" is named in settingsRefresh.ts`, refreshSource.includes(`"${key}"`));
}

const importsOf = (file: string) => [...readFileSync(file, "utf8").matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]).sort();
check("settingsSync.ts imports only prefs and the mergers", importsOf("src/cloud/settingsSync.ts"), ["./prefs", "./settingsMergers"]);
check("settingsMergers.ts imports only prefs", importsOf("src/cloud/settingsMergers.ts"), ["./prefs"]);

for (const file of ["src/cloud/settingsSync.ts", "src/cloud/settingsMergers.ts", "src/cloud/settingsHost.ts", "src/cloud/settingsRemote.ts", "src/cloud/settingsRefresh.ts"]) {
  const text = readFileSync(file, "utf8");
  ok(`${file} never logs`, !/console\./.test(text));
  ok(`${file} never creates the client`, !/cloudClient\(/.test(text));
}

ok("wireCloud() installs settings sync", /installSettingsSync\(/.test(readFileSync("src/cloud/wiring.ts", "utf8")));
ok("App.tsx mounts the settings banner", /<SettingsSyncBanner \/>/.test(readFileSync("src/App.tsx", "utf8")));
check("the merge base is a device key", homeOf(SETTINGS_SYNC_KEY), "device");
check("the first-sync stash is a device key", homeOf(SETTINGS_REPLACED_KEY), "device");

if (failures > 0) {
  console.error(`\ntest-settingssync: ${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`test-settingssync: ${checks} checks passed`);
