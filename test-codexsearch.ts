/* Assertion tests for the codex sidebar search.

   Same shape as test-units.ts: silent unless something is wrong, non-zero
   exit when it is. Notes are built with parseNote so aliases arrive through
   the same toArray path the app and [[link]] resolution use — a hand-built
   fixture would test a shape the vault never produces. */

import { parseNote, Vault, type Note } from "./src/core/vault";
import { fold, searchCodex, codexSearchIds } from "./src/state/codexSearch";

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

/* ---------- fixture ---------- */

const zoe = parseNote("characters/zoe.md", "---\nname: Zoë Hart\naliases: [Starling, Zed]\n---\nA pilot.");
const starling = parseNote("characters/starling.md", "---\nname: Starling\n---\nThe ship.");
const star = parseNote("locations/starfall.md", "---\nname: Starfall\n---\nA city.");
const mira = parseNote("characters/mira.md", "---\nname: Mira\naliases: Starla\n---\nQuiet.");
const lone = parseNote("lore/lone.md", "---\nname: Lodestar Rite\n---\nNo alias field.");
const chap = parseNote("manuscript/ch1.md", "---\nname: Chapter One\n---\nThe star rose over Zoe's hangar.");
const tagged = parseNote("lore/t.md", "---\nname: Old Songs\ntags: [starlore]\n---\nx");
const all: Note[] = [zoe, starling, star, mira, lone, chap, tagged];

const hitFor = (notes: readonly Note[], q: string, id: string) =>
  searchCodex(notes, q)?.find((h) => h.id === id);

/* ---------- aliases arrive as arrays, string or list ---------- */

check("alias as bare string", mira.aliases, ["Starla"]);
check("aliases as list", zoe.aliases, ["Starling", "Zed"]);
check("no alias field", lone.aliases, []);

/* ---------- empty query means no filter ---------- */

check("empty query", searchCodex(all, ""), null);
check("whitespace query", searchCodex(all, "   "), null);
check("empty query ids", codexSearchIds(all, ""), null);

/* ---------- title exact beats alias exact ---------- */

{
  const hits = searchCodex(all, "starling")!;
  check("starling ids", hits.map((h) => h.id), [starling.id, zoe.id]);
  check("starling ranks", hits.map((h) => h.rank), [0, 1]);
}

/* ---------- the full ladder ---------- */

{
  const hits = searchCodex(all, "star")!;
  check(
    "star ids",
    hits.map((h) => h.id),
    [star.id, starling.id, mira.id, zoe.id, lone.id, chap.id, tagged.id],
  );
  check("star ranks", hits.map((h) => h.rank), [2, 2, 3, 3, 4, 5, 5]);
  check("star alias labels", hits.map((h) => h.alias ?? null), [null, null, "Starla", "Starling", null, null, null]);

  // Body and tag hits come after every name hit.
  const lastName = hits.map((h) => h.rank < 5).lastIndexOf(true);
  const firstBody = hits.findIndex((h) => h.rank === 5);
  ok("body hits after name hits", lastName < firstBody);
  ok("body-only hit present", hits.some((h) => h.id === chap.id));
  ok("tag-only hit present", hits.some((h) => h.id === tagged.id));
}

/* ---------- alias label ---------- */

{
  const zed = hitFor(all, "zed", zoe.id);
  check("zed rank", zed?.rank, 1);
  check("zed alias", zed?.alias, "Zed");

  const s = hitFor(all, "starling", starling.id)!;
  ok("title exact has no alias", !("alias" in s) || s.alias === undefined);

  // Title and alias both prefix-match: the title wins the tie, no label.
  const raven = parseNote("x.md", "---\nname: Ravenhold\naliases: [Ravenholm]\n---\n");
  const r = hitFor([raven], "raven", raven.id)!;
  check("tie rank", r.rank, 2);
  ok("tie has no alias", r.alias === undefined);

  // Alias exact over title substring — the label names the alias.
  const nick = parseNote("characters/n.md", "---\nname: Bartholomew Ash\naliases: [Ash]\n---\n");
  const n = hitFor([nick], "ash", nick.id)!;
  check("alias exact beats title substring", n.rank, 1);
  ok("no label when the title already shows the match", n.alias === undefined);

  // The seeded Wren case: rank from the alias, label from nowhere.
  const wren = parseNote("characters/w.md", "---\nname: Wren Calloway\naliases: [Wren, The Apprentice]\n---\n");
  const w = hitFor([wren], "wren", wren.id)!;
  check("wren alias exact rank", w.rank, 1);
  ok("wren unlabelled", w.alias === undefined);
  const ap = hitFor([wren], "apprentice", wren.id)!;
  check("apprentice labelled", [ap.rank, ap.alias], [4, "The Apprentice"]);
}

/* ---------- diacritics ---------- */

check("fold precomposed", fold("Zoë"), "zoe");
check("fold combining", fold("Zoe" + String.fromCharCode(0x308)), "zoe");
check("fold dotted capital I", fold("İstanbul"), "istanbul");
{
  const ids = codexSearchIds(all, "zoe")!;
  check("zoe first", ids[0], zoe.id);
  check("zoe rank", hitFor(all, "zoe", zoe.id)?.rank, 2);
  ok("zoe body hit after zoe", ids.indexOf(chap.id) > ids.indexOf(zoe.id));
  check("accented exact", codexSearchIds(all, "ZOË HART")![0], zoe.id);
  check("accented exact rank", hitFor(all, "ZOË HART", zoe.id)?.rank, 0);
}

/* ---------- a Note without the aliases field ---------- */

{
  check("lodestar rank", hitFor(all, "lodestar", lone.id)?.rank, 2);
  const bare = { ...lone } as Partial<Note>;
  delete bare.aliases;
  let rank: unknown = "threw";
  try {
    rank = hitFor([bare as Note], "lodestar", lone.id)?.rank;
  } catch {
    /* recorded as "threw" */
  }
  check("missing aliases field ranks by title", rank, 2);
}

/* ---------- vault.search stays a floor ---------- */

{
  const v = new Vault();
  all.forEach((n) => v.add(n));
  for (const q of ["star", "zoe", "pilot", "starlore", "hangar"]) {
    const floor = v.search(q);
    const ids = codexSearchIds(all, q, floor)!;
    ok(`floor holds for "${q}"`, floor.length > 0 && floor.every((n) => ids.includes(n.id)));
  }
  // A hit only vault.search found still lands, at the bottom tier.
  const ghost = parseNote("lore/g.md", "---\nname: Ghost\n---\nnothing here");
  const hits = searchCodex(all, "star", [ghost])!;
  check("extra vault hit ranks last tier", hits.find((h) => h.id === ghost.id)?.rank, 5);
}

/* ---------- no match is empty, not null ---------- */

check("no match", codexSearchIds(all, "qqqq"), []);

/* ---------- determinism ---------- */

check("order ignores input order", codexSearchIds([...all].reverse(), "star"), codexSearchIds(all, "star"));
check("stable across calls", codexSearchIds(all, "zoe"), codexSearchIds(all, "zoe"));

/* ---------- report ---------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`codexsearch: ${checks} checks passed`);
