import { Vault, parseNote, serializeNote } from "./src/core/vault";

// Four codex files + one chapter, exactly as they'd sit on disk.
const files: [string, string][] = [
  ["Codex/Characters/Wren-Calloway.md",
`---
type: character
name: Wren Calloway
aliases: [Wren, The Apprentice]
tags: [protagonist, cartographer]
age: 19
---
Cartographer's apprentice. Carries her late mother's brass compass.
Studied under [[The Archivist]] before returning to [[Halden's Reach]].`],

  ["Codex/Characters/The-Archivist.md",
`---
type: character
name: The Archivist
tags: [mentor]
---
Keeper of the Sunken Library. Trades knowledge for memories.`],

  ["Codex/Locations/Haldens-Reach.md",
`---
type: location
name: Halden's Reach
tags: [home]
---
Harbor town built on the ribs of a beached leviathan. Reshaped nightly by [[The Drift]].`],

  ["Codex/Lore/The-Drift.md",
`---
type: lore
name: The Drift
---
A slow tide that rewrites coastlines overnight. Maps expire within days.`],

  ["Manuscript/Act-1/01-The-Compass-That-Lies.md",
`---
type: chapter
name: The Compass That Lies
pov: "[[Wren Calloway]]"
---
The fog folded over [[Halden's Reach]] like a hand closing around a coin.
Wren pressed her thumb to the compass her mother left her. Somewhere out past
the harbor, [[The Drift]] was busy unmaking the coast she'd charted last week.`],
];

const vault = new Vault();
for (const [path, raw] of files) vault.add(parseNote(path, raw));

const line = (s = "") => console.log(s);
line("VAULT LOADED — " + vault.all().length + " notes");
line("  characters: " + vault.byType("character").map(n => n.title).join(", "));
line("  locations:  " + vault.byType("location").map(n => n.title).join(", "));
line("  chapters:   " + vault.byType("chapter").map(n => n.title).join(", "));

line();
const wren = vault.resolveLink("Wren")!;   // resolved via ALIAS, not exact title
line(`BACKLINKS for "${wren.title}" (looked up by alias "Wren"):`);
for (const b of vault.backlinksOf(wren))
  line(`  ← ${b.note.title}  (${b.note.type}, ${b.count} mention${b.count > 1 ? "s" : ""})`);

line();
line("RELATIONSHIP GRAPH (edges):");
for (const e of vault.graph())
  line(`  ${vault.get(e.from)!.title}  →  ${vault.get(e.to)!.title}`);

line();
line('SEARCH "compass":');
for (const n of vault.search("compass")) line(`  • ${n.title} (${n.type})`);

line();
line("DANGLING LINKS (referenced but not yet written): " +
  (vault.danglingLinks().join(", ") || "none — world is consistent"));

line();
line("ROUND-TRIP (parse → edit → serialize back to a file):");
wren.data.status = "alive";
line(serializeNote(wren).split("\n").slice(0, 9).join("\n"));
