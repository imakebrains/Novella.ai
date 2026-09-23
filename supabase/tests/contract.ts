/* The sync engine against the REAL push_file().

   test-cloud.ts proves the engine against FakeServer, and
   isolation_test.sql proves push_file() on its own. This file closes
   the gap between them: two engine "devices" and one outsider, talking
   to Postgres through psql, with every row passing through the same
   wire.ts parsers the app uses. If FakeServer and the real function
   ever disagree — about what a conflict returns, how bigints arrive,
   what a tombstone looks like — it shows up here and nowhere else.

   Run by supabase/tests/run.sh after the isolation tests, against the
   same throwaway database (PGDATABASE). Uses psql rather than a driver
   so the repo takes no Postgres dependency for one test. Blob BYTES are
   held in a map (Postgres never sees them; Supabase Storage does), but
   the storage.objects row — which push_file trusts for size and
   existence — is real, and inserted under RLS as the writer. */

import { execFileSync } from "node:child_process";
import { ProjectSync, emptySyncState, type LocalFiles, type PullPage, type PushChange, type PushResult, type RemoteFiles } from "../../src/cloud/syncEngine";
import { blobKeyFor, pageOf, parsePushResult, pushArgs } from "../../src/cloud/wire";

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

const TAG = "$nv$";
function lit(value: string | null): string {
  if (value === null) return "null";
  if (value.includes(TAG)) throw new Error("test text collides with the quoting tag");
  return `${TAG}${value}${TAG}`;
}

/** Run SQL as `user` (or as the admin when null) and return the last
    line of output — the result of the final statement. */
function sql(user: string | null, statement: string): string {
  const login = user
    ? `select set_config('request.jwt.claims', ${lit(JSON.stringify({ sub: user, role: "authenticated" }))}, false), set_config('role', 'authenticated', false);`
    : "";
  const out = execFileSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", `${login} ${statement}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lines = out.trimEnd().split("\n");
  return lines[lines.length - 1] ?? "";
}

const blobBytes = new Map<string, Uint8Array>();

class PgRemote implements RemoteFiles {
  constructor(
    private readonly user: string,
    private readonly project: string,
    private readonly device: string,
  ) {}

  async pull(since: number): Promise<PullPage> {
    const json = sql(
      this.user,
      `select coalesce(jsonb_agg(t order by t.seq), '[]') from (
         select path, version, seq, sha256, size, deleted, content, blob_key, device
         from public.project_files where project_id = '${this.project}' and seq > ${Number(since)}
         order by seq limit 501) t;`,
    );
    return pageOf(JSON.parse(json) as unknown[]);
  }

  async push(change: PushChange): Promise<PushResult> {
    const a = pushArgs(this.project, change, this.device);
    const json = sql(
      this.user,
      `select public.push_file('${a.p_project}', ${lit(a.p_path)}, ${a.p_base_version}, ${lit(a.p_sha256)}, ${a.p_deleted},
         ${lit(a.p_content)}, ${lit(a.p_blob_key)}, ${lit(a.p_device)})::text;`,
    );
    return parsePushResult(JSON.parse(json));
  }

  async putBlob(sha256: string, bytes: Uint8Array): Promise<string> {
    const key = blobKeyFor(this.user, this.project, sha256);
    sql(
      this.user,
      `insert into storage.objects (bucket_id, name, metadata)
       values ('vault', ${lit(key)}, jsonb_build_object('size', ${bytes.length}))
       on conflict (bucket_id, name) do nothing;`,
    );
    blobBytes.set(key, bytes.slice());
    return key;
  }

  async getBlob(key: string): Promise<Uint8Array> {
    const bytes = blobBytes.get(key);
    if (!bytes) throw new Error("missing blob");
    return bytes.slice();
  }
}

class MapLocal implements LocalFiles {
  files = new Map<string, Uint8Array>();
  async read(path: string) {
    const b = this.files.get(path);
    return b ? b.slice() : null;
  }
  async write(path: string, bytes: Uint8Array) {
    this.files.set(path, bytes.slice());
  }
  async remove(path: string) {
    this.files.delete(path);
  }
  async list() {
    return [...this.files.keys()];
  }
}

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array | undefined) => (b ? new TextDecoder().decode(b) : null);

function device(user: string, project: string, name: string) {
  const local = new MapLocal();
  const engine = new ProjectSync({
    remote: new PgRemote(user, project, name),
    local,
    state: emptySyncState(),
    saveState: () => {},
    now: () => new Date(2026, 8, 23, 21, 30),
  });
  return {
    local,
    engine,
    write(path: string, text: string) {
      local.files.set(path, enc(text));
      engine.markChanged(path);
    },
    remove(path: string) {
      local.files.delete(path);
      engine.markRemoved(path);
    },
    text: (path: string) => dec(local.files.get(path)),
  };
}

async function main(): Promise<void> {
  const writer = "cccccccc-0000-0000-0000-000000000003";
  const outsider = "dddddddd-0000-0000-0000-000000000004";
  const project = "55555555-0000-0000-0000-00000000000e";
  sql(null, `insert into auth.users (id, email) values ('${writer}', 'c@example.com'), ('${outsider}', 'd@example.com');`);
  sql(writer, `insert into public.projects (id, name) values ('${project}', 'Contract book');`);

  const desk = device(writer, project, "Desk");
  const laptop = device(writer, project, "Laptop");

  desk.write("Manuscript/01.md", "It was a dark night.");
  desk.local.files.set(".novella/cover.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01]));
  desk.engine.markChanged(".novella/cover.jpg");
  const first = await desk.engine.sync();
  check("desk pushes text and bytes through the real function", [first.pushed, first.error], [2, null]);
  check("the database holds the text", sql(null, `select content from public.project_files where path = 'Manuscript/01.md';`), "It was a dark night.");
  check("the cover's size came from storage", sql(null, `select size from public.project_files where path = '.novella/cover.jpg';`), "5");

  const pulled = await laptop.engine.sync();
  check("laptop pulls both", [pulled.pulled, pulled.error], [2, null]);
  check("the text arrives", laptop.text("Manuscript/01.md"), "It was a dark night.");
  check("the bytes arrive", [...(laptop.local.files.get(".novella/cover.jpg") ?? [])], [0xff, 0xd8, 0xff, 0x00, 0x01]);

  // Edited on both sides, against the real compare-and-swap.
  desk.write("Manuscript/01.md", "Desk words.");
  laptop.write("Manuscript/01.md", "Laptop words.");
  await desk.engine.sync();
  const clash = await laptop.engine.sync();
  const copy = "Manuscript/01 (Desk conflicted copy 2026-09-23).md";
  check("the real conflict reply produces the copy", clash.conflicts, [{ path: "Manuscript/01.md", copyPath: copy }]);
  await desk.engine.sync();
  for (const [name, d] of [["desk", desk], ["laptop", laptop]] as const) {
    check(`${name} holds the laptop's text in place`, d.text("Manuscript/01.md"), "Laptop words.");
    check(`${name} holds the desk's text as the copy`, d.text(copy), "Desk words.");
  }

  // Deleted at the desk, edited on the laptop: the edit wins.
  desk.remove("Manuscript/01.md");
  await desk.engine.sync();
  check("the delete is a tombstone in the database", sql(null, `select deleted from public.project_files where path = 'Manuscript/01.md';`), "t");
  laptop.write("Manuscript/01.md", "Laptop words, still going.");
  await laptop.engine.sync();
  await desk.engine.sync();
  check("the edit came back to the desk", desk.text("Manuscript/01.md"), "Laptop words, still going.");

  // Someone else entirely.
  const stranger = device(outsider, project, "Stranger");
  const peek = await stranger.engine.sync();
  check("an outsider pulls nothing from the writer's book", [...stranger.local.files.keys()], []);
  stranger.write("Manuscript/01.md", "Vandalised.");
  const vandal = await stranger.engine.sync();
  check("and cannot push into it", vandal.error !== null && /not_found/.test(vandal.error), true);
  check("the writer's text is untouched", sql(null, `select content from public.project_files where path = 'Manuscript/01.md';`), "Laptop words, still going.");
  check("the outsider's pull raised no error — it just saw nothing", peek.error, null);

  if (failures > 0) {
    console.error(`\ncontract: ${failures} of ${checks} checks failed`);
    process.exit(1);
  }
  console.log(`contract: ${checks} checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
