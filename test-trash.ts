/* Assertions for the trash: retention maths, restore collisions, and the
   store that drives both.

   Same shape as test-units.ts — silent unless something is wrong, non-zero
   exit when it is.

   The retention maths is the part worth proving. It decides when a file
   gets destroyed, so none of it is allowed to read a clock: `now` is an
   argument everywhere, which is what lets "what does 30 days do on the
   boundary?" be a question with an answer here rather than in a month.

   The store is exercised too, headless. With no vault root it keeps its
   payloads inline and its manifest in a localStorage call wrapped in a
   try/catch, so the round trip — delete a note, get it back — runs in
   node against the memory storage adapter. That round trip is the whole
   promise of the feature; a pure-only test would prove the arithmetic and
   miss the point. */

import {
  DEFAULT_RETENTION,
  RETENTION_CHOICES,
  coerceIndex,
  countWords,
  entryIdFor,
  expiryOf,
  isExpired,
  normalizeRetention,
  partitionExpired,
  remainingLabel,
  retentionLabel,
  retentionPromise,
  sortNewestFirst,
  trashStore,
  uniqueId,
  uniquePath,
  type RetentionChoice,
} from "./src/state/trash";
import { store } from "./src/state/vaultStore";
import { boardStore } from "./src/state/boards";

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

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** A fixed clock. Nothing in this file reads the real one. */
const T0 = 1_700_000_000_000;
const at = (trashedAt: number) => ({ trashedAt });

/* ---------- the choices themselves ---------- */

{
  check("retention: the writer gets exactly three windows", RETENTION_CHOICES, [7, 30, "keep"]);
  check("retention: 30 days is the default", DEFAULT_RETENTION, 30);

  check("retention: a stored 7 survives a round trip", normalizeRetention(7), 7);
  check("retention: a stored 30 survives a round trip", normalizeRetention(30), 30);
  check("retention: keep survives a round trip", normalizeRetention("keep"), "keep");

  // A corrupt or hand-edited config must not invent a window nobody
  // chose — least of all a shorter one, which would delete things early.
  check("retention: nonsense falls back to the default", normalizeRetention("soon"), 30);
  check("retention: a stray number falls back", normalizeRetention(3), 30);
  check("retention: undefined falls back", normalizeRetention(undefined), 30);
  check("retention: null falls back", normalizeRetention(null), 30);

  check("retention: labels read as settings", retentionLabel(7), "7 days");
  check("retention: keep says what it does", retentionLabel("keep"), "Keep until I empty it");
  check(
    "retention: the toast makes a promise",
    retentionPromise(30),
    "kept in the trash for 30 days",
  );
  check(
    "retention: keep promises nothing expires",
    retentionPromise("keep"),
    "kept in the trash until you empty it",
  );
}

/* ---------- expiry: the arithmetic that destroys files ---------- */

{
  check("expiry: 7 days out", expiryOf(T0, 7), T0 + 7 * DAY);
  check("expiry: 30 days out", expiryOf(T0, 30), T0 + 30 * DAY);
  check("expiry: keep never comes due", expiryOf(T0, "keep"), null);

  ok("expiry: fresh is not expired", !isExpired(at(T0), 30, T0));
  ok("expiry: a day in is not expired", !isExpired(at(T0), 30, T0 + DAY));
  ok("expiry: one ms short survives", !isExpired(at(T0), 30, T0 + 30 * DAY - 1));
  ok("expiry: the boundary itself expires", isExpired(at(T0), 30, T0 + 30 * DAY));
  ok("expiry: well past expires", isExpired(at(T0), 7, T0 + 400 * DAY));

  // The whole point of "keep": no clock, however far forward, expires it.
  ok("expiry: keep survives a century", !isExpired(at(T0), "keep", T0 + 36_500 * DAY));

  // Shortening the window is retroactive — an 8-day-old item is already
  // past a 7-day window the moment that window is chosen.
  ok("expiry: switching to 7 days expires an 8-day-old item", isExpired(at(T0), 7, T0 + 8 * DAY));
  ok("expiry: the same item is safe at 30 days", !isExpired(at(T0), 30, T0 + 8 * DAY));

  // A clock that went backwards (timezone fix, system clock reset) must
  // not expire anything early.
  ok("expiry: a backwards clock expires nothing", !isExpired(at(T0), 7, T0 - 5 * DAY));
}

/* ---------- partitioning: what the sweep actually deletes ---------- */

{
  const entries = [
    { entryId: "old", trashedAt: T0 - 40 * DAY },
    { entryId: "recent", trashedAt: T0 - 3 * DAY },
    { entryId: "borderline", trashedAt: T0 - 30 * DAY },
    { entryId: "today", trashedAt: T0 },
  ];

  const thirty = partitionExpired(entries, 30, T0);
  check("sweep: 30 days takes the old and the borderline", thirty.expired.map((e) => e.entryId), [
    "old",
    "borderline",
  ]);
  check("sweep: and keeps the rest", thirty.kept.map((e) => e.entryId), ["recent", "today"]);

  const seven = partitionExpired(entries, 7, T0);
  check("sweep: 7 days takes more", seven.expired.map((e) => e.entryId), ["old", "borderline"]);
  check("sweep: leaving only the last week", seven.kept.map((e) => e.entryId), ["recent", "today"]);

  const keep = partitionExpired(entries, "keep", T0);
  check("sweep: keep deletes nothing", keep.expired.length, 0);
  check("sweep: keep keeps everything", keep.kept.length, entries.length);

  // Order is the caller's business; the sweep must not shuffle it.
  check("sweep: kept order is input order", keep.kept.map((e) => e.entryId), entries.map((e) => e.entryId));

  check("sweep: an empty trash partitions to nothing", partitionExpired([], 7, T0), {
    expired: [],
    kept: [],
  });
}

/* ---------- the label a writer reads ---------- */

{
  const label = (ageMs: number, r: RetentionChoice = 30) => remainingLabel(at(T0 - ageMs), r, T0);

  check("left: a fresh 30-day item", label(0), "30 days left");
  check("left: singular at one day", label(29 * DAY), "1 day left");
  // Rounding down under-promises, which is the safe way round for a
  // deadline that ends in a file being destroyed.
  check("left: a part-day rounds down, never up", label(28 * DAY - HOUR), "2 days left");
  check("left: an almost-two-days still says one", label(29 * DAY - 23 * HOUR), "1 day left");
  check("left: hours when under a day", label(30 * DAY - 5 * HOUR), "5 hours left");
  check("left: singular at one hour", label(30 * DAY - HOUR), "1 hour left");
  check("left: an hour and a half is one hour", label(30 * DAY - 90 * 60_000), "1 hour left");
  check("left: minutes are not worth a number", label(30 * DAY - 60_000), "Less than an hour left");
  check("left: past due is honest about it", label(31 * DAY), "Due to be removed");
  check("left: exactly due", label(30 * DAY), "Due to be removed");
  check("left: keep says so", label(999 * DAY, "keep"), "Kept until you empty the trash");
}

/* ---------- restore: landing somewhere free ---------- */

{
  const taken = ["Codex/Lore/Compass.md", "Manuscript/Ch1.md"];

  check("path: a free path is used as-is", uniquePath("Codex/Lore/Bell.md", taken), "Codex/Lore/Bell.md");
  check(
    "path: an occupied path lands beside the occupant",
    uniquePath("Codex/Lore/Compass.md", taken),
    "Codex/Lore/Compass (restored).md",
  );
  check(
    "path: and again when that is taken too",
    uniquePath("Codex/Lore/Compass.md", [...taken, "Codex/Lore/Compass (restored).md"]),
    "Codex/Lore/Compass (restored 2).md",
  );

  // The suffix goes before the extension, or the file stops being Markdown.
  ok("path: the .md survives the suffix", uniquePath("a/b.md", ["a/b.md"]).endsWith(".md"));

  // A dot in a FOLDER name is not an extension.
  check(
    "path: a dotted folder is not an extension",
    uniquePath(".novella/notes/x", [".novella/notes/x"]),
    ".novella/notes/x (restored)",
  );

  check("id: a free id is used as-is", uniqueId("compass", ["bell"]), "compass");
  check("id: a live id is stepped around", uniqueId("compass", ["compass"]), "compass-2");
  check("id: repeatedly", uniqueId("compass", ["compass", "compass-2"]), "compass-3");

  // Entry ids name files, so they must survive a title full of slashes.
  ok("entry id: is filename-safe", /^[\w.-]+$/.test(entryIdFor("Codex/Lore: A Bell?", T0, [])));
  check("entry id: carries the timestamp", entryIdFor("bell", T0, []).endsWith(String(T0)), true);
  check(
    "entry id: two in the same millisecond still differ",
    entryIdFor("bell", T0, [entryIdFor("bell", T0, [])]),
    `bell-${T0}-2`,
  );
}

/* ---------- sorting and counting ---------- */

{
  const list = [{ trashedAt: T0 }, { trashedAt: T0 + DAY }, { trashedAt: T0 - DAY }];
  check("sort: newest first", sortNewestFirst(list).map((e) => e.trashedAt), [
    T0 + DAY,
    T0,
    T0 - DAY,
  ]);
  check("sort: the input is left alone", list[0]!.trashedAt, T0);

  check("words: counts them", countWords("one two  three\nfour"), 4);
  check("words: an empty body is zero, not one", countWords("   \n "), 0);
}

/* ---------- a manifest that came back wrong ---------- */

{
  const good = coerceIndex({
    retention: 7,
    entries: [
      { entryId: "a", noteId: "n", title: "T", path: "p.md", trashedAt: T0, reason: "archived", words: 4, boards: ["b1"] },
    ],
  });
  check("index: a good entry survives", good.entries.length, 1);
  check("index: with its reason", good.entries[0]!.reason, "archived");
  check("index: and its boards", good.entries[0]!.boards, ["b1"]);
  check("index: and its window", good.retention, 7);

  // Anything unusable is dropped rather than crashing the panel that also
  // owns the delete buttons.
  const bad = coerceIndex({
    retention: "forever",
    entries: [
      { entryId: "a" },
      { path: "p.md", trashedAt: T0 },
      { entryId: "b", path: "p.md", trashedAt: "yesterday" },
      { entryId: "c", path: "q.md", trashedAt: T0 },
    ],
  });
  check("index: only the usable entry is kept", bad.entries.map((e) => e.entryId), ["c"]);
  check("index: a nonsense window becomes the default", bad.retention, 30);
  check("index: missing fields get safe stand-ins", bad.entries[0]!.reason, "deleted");
  check("index: and an empty board list", bad.entries[0]!.boards, []);

  check("index: garbage yields an empty trash", coerceIndex(null).entries, []);
  check("index: a string yields an empty trash", coerceIndex("nope").entries, []);
}

/* ---------- the store, end to end ---------- */

async function storeRoundTrip(): Promise<void> {
  // The bundled seed world: no vault root, memory storage, no disk.
  store.loadSeed();
  await trashStore.sweep();

  const note = store.vault.all().find((n) => n.type !== "prompt")!;
  const id = note.id;
  const path = note.path;
  const title = note.title;
  const body = note.body;
  const before = store.vault.all().length;

  const board = boardStore.add("trash test board");
  boardStore.addNote(board.id, id);

  const moved = await trashStore.moveToTrash(id, "archived");
  ok("store: the move reports success", moved.ok);
  if (!moved.ok) return;

  check("store: the note left the vault", store.vault.get(id), undefined);
  check("store: exactly one note left", store.vault.all().length, before - 1);
  check("store: one item in the trash", trashStore.entries().length, 1);
  check("store: it remembers where it came from", trashStore.entries()[0]!.path, path);
  check("store: and what it was called", trashStore.entries()[0]!.title, title);
  check("store: and how it got there", trashStore.entries()[0]!.reason, "archived");
  check("store: and which boards it was on", trashStore.entries()[0]!.boards, [board.id]);
  ok(
    "store: the board card went with it",
    !boardStore.all().find((b) => b.id === board.id)!.noteIds.includes(id),
  );

  // Undo, the morning after.
  const restored = await trashStore.restore(moved.value.entryId);
  ok("store: the restore reports success", restored.ok);
  if (!restored.ok) return;

  const back = store.vault.get(restored.value);
  ok("store: the note is back in the vault", !!back);
  check("store: at its original path", back!.path, path);
  check("store: with its prose intact", back!.body, body);
  check("store: the trash is empty again", trashStore.entries().length, 0);
  ok(
    "store: the board card came back",
    boardStore.all().find((b) => b.id === board.id)!.noteIds.includes(restored.value),
  );

  // Something else took the path in the meantime.
  const second = await trashStore.moveToTrash(restored.value, "deleted");
  ok("store: it can be trashed again", second.ok);
  if (!second.ok) return;
  store.createNoteAtPath(path, `---\ntype: note\nname: Impostor\n---\n\nNot the original.\n`);

  const squeezed = await trashStore.restore(second.value.entryId);
  ok("store: restoring around an occupant still works", squeezed.ok);
  if (!squeezed.ok) return;
  const moved2 = store.vault.get(squeezed.value)!;
  check("store: the occupant is untouched", store.vault.all().filter((n) => n.path === path).length, 1);
  check("store: the restored note stands beside it", moved2.path, uniquePath(path, [path]));
  check("store: with its own prose", moved2.body, body);

  // Emptying is the only thing besides expiry that destroys anything.
  const third = await trashStore.moveToTrash(moved2.id, "deleted");
  ok("store: trashed once more", third.ok);
  check("store: one item waiting", trashStore.entries().length, 1);
  await trashStore.empty();
  check("store: empty means empty", trashStore.entries().length, 0);

  // A note that isn't there cannot be trashed, and says so.
  const missing = await trashStore.moveToTrash("no-such-note", "deleted");
  check("store: trashing a ghost fails", missing.ok, false);

  // An item that isn't there cannot be restored, and says so.
  const ghost = await trashStore.restore("no-such-entry");
  check("store: restoring a ghost fails", ghost.ok, false);

  // The window is a stored setting, and changing it sweeps immediately.
  await trashStore.setRetention(7);
  check("store: the window is remembered", trashStore.retention(), 7);
  await trashStore.setRetention(DEFAULT_RETENTION);
  check("store: and set back", trashStore.retention(), 30);
}

/* ---------- the sweep, against a clock we control ---------- */

async function sweepRoundTrip(): Promise<void> {
  store.loadSeed();
  await trashStore.setRetention(7);

  const notes = store.vault.all().filter((n) => n.type !== "prompt").slice(0, 2);
  ok("sweep: the seed world has notes to work with", notes.length === 2);
  if (notes.length < 2) return;

  const first = await trashStore.moveToTrash(notes[0]!.id, "deleted");
  const second = await trashStore.moveToTrash(notes[1]!.id, "archived");
  ok("sweep: both moved", first.ok && second.ok);
  if (!first.ok || !second.ok) return;

  check("sweep: nothing expires today", await trashStore.sweep(Date.now()), 0);
  check("sweep: both are still there", trashStore.entries().length, 2);

  // Wind the clock forward instead of the timestamps back: the sweep
  // takes `now`, which is exactly what makes this testable.
  check("sweep: eight days on, both are gone", await trashStore.sweep(Date.now() + 8 * DAY), 2);
  check("sweep: the trash is empty", trashStore.entries().length, 0);
  check("sweep: a second pass finds nothing", await trashStore.sweep(Date.now() + 99 * DAY), 0);

  // "Keep" means the sweep is a no-op no matter how far the clock runs.
  await trashStore.setRetention("keep");
  const kept = await trashStore.moveToTrash(store.vault.all()[0]!.id, "deleted");
  ok("sweep: moved under keep", kept.ok);
  check("sweep: keep survives the clock", await trashStore.sweep(Date.now() + 9999 * DAY), 0);
  check("sweep: and is still listed", trashStore.entries().length, 1);
  await trashStore.empty();
  await trashStore.setRetention(DEFAULT_RETENTION);
}

async function main(): Promise<void> {
  await storeRoundTrip();
  await sweepRoundTrip();

  if (failures > 0) {
    console.error(`\n${failures} of ${checks} checks FAILED`);
    process.exit(1);
  }
  console.log(`trash tests: ${checks} checks passed`);
}

void main();
