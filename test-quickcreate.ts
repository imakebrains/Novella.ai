/* Assertions for quick create: every kind the codex sidebar can show is
   one the + button can make, and each lands in the right folder with the
   right frontmatter.

   Same shape as test-units.ts — silent unless something is wrong,
   non-zero exit when it is. The store is driven headless on a fresh
   instance so nothing here touches the seed world or the singleton. */

import { readFileSync } from "node:fs";
import { KINDS } from "./src/ui/quickCreateKinds";
import { DEFAULT_FOLDER, folderForType } from "./src/state/noteFolders";
import { VaultStore } from "./src/state/vaultStore";
import { parseNote, serializeNote } from "./src/core/vault";

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

/* ---------- the kind list ---------- */

/* Mirrors GROUPS in src/ui/CodexPane.tsx. Kept by hand rather than
   imported: that file is a React component and this suite runs in node.
   The source is also read as text below, so a group added to the sidebar
   without a matching kind here fails loudly instead of drifting. */
const CODEX_GROUPS = [
  "chapter", "scene", "character", "location",
  "faction", "object", "lore", "note", "prompt",
];

{
  const src = readFileSync("src/ui/CodexPane.tsx", "utf8");
  const block = src.match(/const GROUPS[^=]*=\s*\[([\s\S]*?)\n\];/);
  ok("codex: GROUPS block is still findable", block !== null);
  const fromSource = block?.[1]
    ? [...block[1].matchAll(/type:\s*"([^"]+)"/g)].map((m) => m[1])
    : [];
  check("codex: hand-kept mirror matches the sidebar", fromSource, CODEX_GROUPS);
}

{
  const types = KINDS.map((k) => k.type);
  check("kinds: offers exactly what the codex groups", types, CODEX_GROUPS);
  ok("kinds: no duplicate types", new Set(types).size === types.length);
  ok("kinds: every kind has a label", KINDS.every((k) => k.label.trim().length > 0));
  ok("kinds: every kind has a hint", KINDS.every((k) => k.hint.trim().length > 0));
  ok("kinds: chapter stays first — it is the default selection", types[0] === "chapter");
}

/* ---------- folder map ---------- */

{
  const expected: Record<string, string> = {
    chapter: "Manuscript",
    scene: "Codex/Lore",
    character: "Codex/Characters",
    location: "Codex/Locations",
    faction: "Codex/Factions",
    object: "Codex/Objects",
    lore: "Codex/Lore",
    note: "Codex/Lore",
    prompt: "Prompts",
  };
  for (const [type, folder] of Object.entries(expected)) {
    check(`folder: ${type}`, folderForType(type), folder);
  }
  check("folder: unknown kinds fall back", folderForType("timeline"), DEFAULT_FOLDER);
  check("folder: prototype names are not kinds", folderForType("constructor"), DEFAULT_FOLDER);
  ok("folder: every offered kind is mapped explicitly",
    KINDS.every((k) => k.type in expected));
  ok("folder: no folder starts or ends with a slash",
    Object.values(expected).every((f) => !f.startsWith("/") && !f.endsWith("/")));
}

/* ---------- createNote lands each kind ---------- */

{
  const s = new VaultStore();
  for (const k of KINDS) {
    const title = `Test ${k.label}`;
    const note = s.createNote(k.type, title);
    check(`create: ${k.type} path`, note.path, `${folderForType(k.type)}/Test-${k.label}.md`);
    check(`create: ${k.type} type`, note.type, k.type);
    check(`create: ${k.type} title`, note.title, title);
    check(`create: ${k.type} frontmatter type`, note.data.type, k.type);
    check(`create: ${k.type} frontmatter name`, note.data.name, title);
    ok(`create: ${k.type} is findable by type`, s.vault.byType(k.type).some((n) => n.id === note.id));
    ok(`create: ${k.type} resolves as a link`, s.vault.resolveLink(title)?.id === note.id);

    // What hits disk must parse back to the same kind regardless of folder —
    // the folder is a courtesy, the frontmatter is the truth.
    const back = parseNote(note.path, serializeNote(note));
    check(`create: ${k.type} survives the round trip`, back.type, k.type);
  }
  ok("create: chapters and scenes get an order, codex kinds do not",
    typeof s.vault.byType("chapter")[0]?.data.order === "number" &&
    typeof s.vault.byType("scene")[0]?.data.order === "number" &&
    s.vault.byType("faction")[0]?.data.order === undefined);
  check("create: nine notes, nine kinds", s.vault.all().length, KINDS.length);
}

/* ---------- report ---------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`quickcreate: ${checks} checks passed`);
