/* The first-run world. Five notes that exercise every part of the engine:
   alias resolution, frontmatter backlinks (the chapter's POV field), the
   relationship graph, search, and a clean dangling-link state. */

export const SEED_FILES: [string, string][] = [
  [
    "Codex/Characters/Wren-Calloway.md",
    `---
type: character
name: Wren Calloway
aliases: [Wren, The Apprentice]
tags: [protagonist, cartographer]
age: 19
---
Cartographer's apprentice. Carries her late mother's brass compass.
Studied under [[The Archivist]] before returning to [[Halden's Reach]].`,
  ],

  [
    "Codex/Characters/The-Archivist.md",
    `---
type: character
name: The Archivist
tags: [mentor]
---
Keeper of the Sunken Library. Trades knowledge for memories.`,
  ],

  [
    "Codex/Locations/Haldens-Reach.md",
    `---
type: location
name: Halden's Reach
tags: [home]
---
Harbor town built on the ribs of a beached leviathan. Reshaped nightly by [[The Drift]].`,
  ],

  [
    "Codex/Lore/The-Drift.md",
    `---
type: lore
name: The Drift
---
A slow tide that rewrites coastlines overnight. Maps expire within days.`,
  ],

  [
    "Manuscript/Act-1/01-The-Compass-That-Lies.md",
    `---
type: chapter
name: The Compass That Lies
pov: "[[Wren Calloway]]"
order: 1
plot:
  the-drift:
    - Wren notices the coastline has moved again overnight
  wrens-mother:
    - The compass is introduced as her mother's last gift
---
The fog folded over [[Halden's Reach]] like a hand closing around a coin.
Wren pressed her thumb to the compass her mother left her. Somewhere out past
the harbor, [[The Drift]] was busy unmaking the coast she'd charted last week.`,
  ],

  [
    "Manuscript/Act-1/02-What-The-Archivist-Kept.md",
    `---
type: chapter
name: What the Archivist Kept
pov: "[[Wren Calloway]]"
order: 2
synopsis: Wren returns to the Sunken Library to trade for a map that predates the Drift.
beats:
  - Wren descends into the Sunken Library and finds it flooded deeper than last time
  - "[[The Archivist]] names a price: a memory of her mother"
  - She agrees, and forgets something she cannot afterwards identify
plot:
  the-drift:
    - Wren seeks a map older than the Drift's reach
  wrens-mother:
    - She trades away a memory of her mother to pay the Archivist
    - Afterward she cannot recall what she lost
---
The stair went down further than she remembered, and the water had come up
to meet it.`,
  ],

  [
    "Manuscript/Act-1/03-The-Coast-That-Wasnt.md",
    `---
type: chapter
name: The Coast That Wasn't
pov: "[[Wren Calloway]]"
order: 3
synopsis: The old map shows a headland that the Drift has never touched — and shouldn't exist.
beats:
  - Wren unrolls the traded map and finds a coastline she has never charted
  - The compass agrees with the map, not with the world
plot:
  the-drift:
    - The traded map shows a headland the Drift has never reached
  wrens-mother:
    - The compass sides with the map over the living world
---
- [ ] Chart the impossible headland against the real coast
- [x] Ask the Archivist what the map cost, the last time
`,
  ],

  [
    "Notes/Revision-Checklist.md",
    `---
type: note
name: Revision Checklist
---
The pass planned for when the draft is done. Tick things off here or in
the Tasks panel — they're the same list.

- [ ] Read chapters 1–3 aloud for rhythm
- [ ] Check every compass mention against the map timeline
- [x] Name the harbor's inner district
- [ ] Do the Drift's rules stay consistent through chapter three?
`,
  ],
];

/** An empty vault, for writers starting their own world from nothing. */
export const EMPTY_FILES: [string, string][] = [];
