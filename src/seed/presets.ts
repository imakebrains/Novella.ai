/* ============================================================
   Project presets

   What a writer gets when they make a new project. A blank folder
   is honest but cold; these give the folder a shape — the same
   trick every beloved Notion writer-template pulls, done here with
   plain Markdown files.

   The character and location sheets deliberately ask QUESTIONS
   rather than provide headings. "What do they want?" starts a
   writer typing; an empty "Motivation:" field starts them staring.
   ============================================================ */

export interface ProjectPreset {
  id: string;
  name: string;
  blurb: string;
  files: [path: string, contents: string][];
}

const CHARACTER_SHEET = `---
type: character
name: New Character
---
Rename this entry to theirs (the \`name:\` line above), then link them from
prose with [[double brackets]].

What do they want, and what do they tell people they want?

What would they never forgive?

Who knew them before the story starts?

- [ ] Give them one habit a stranger would notice
- [ ] Decide what they smell like (rooms remember)
`;

const LOCATION_SHEET = `---
type: location
name: First Place
---
Rename this entry to the place's real name (the \`name:\` line above).

What does this place look like at its best hour? Its worst?

Who holds power here, and who actually runs it?

What happened here that people still won't talk about?
`;

export const PRESETS: ProjectPreset[] = [
  {
    id: "novel",
    name: "Novel",
    blurb: "Three chapters, character & location sheets, a revision checklist.",
    files: [
      [
        "Manuscript/01-Chapter-One.md",
        `---\ntype: chapter\nname: Chapter One\norder: 1\n---\n`,
      ],
      [
        "Manuscript/02-Chapter-Two.md",
        `---\ntype: chapter\nname: Chapter Two\norder: 2\n---\n`,
      ],
      [
        "Manuscript/03-Chapter-Three.md",
        `---\ntype: chapter\nname: Chapter Three\norder: 3\n---\n`,
      ],
      ["Codex/Characters/Protagonist.md", CHARACTER_SHEET],
      ["Codex/Locations/First-Place.md", LOCATION_SHEET],
      [
        "Notes/Story-Questions.md",
        `---\ntype: note\nname: Story Questions\n---\nThe questions worth answering before chapter ten.\n\nWhose story is this, and why now?\n\nWhat does the ending cost?\n\n- [ ] Write the promise the first chapter makes\n- [ ] Name the thing the reader should dread\n`,
      ],
      [
        "Notes/Revision-Checklist.md",
        `---\ntype: note\nname: Revision Checklist\n---\nFor when the draft is done. Add to it as you notice things.\n\n- [ ] Read the opening three chapters aloud\n- [ ] Check every name is spelled one way\n- [ ] Find each place the middle sags\n`,
      ],
    ],
  },
  {
    id: "series",
    name: "Series bible",
    blurb: "One shared codex, room for several books — how a series stays consistent.",
    files: [
      [
        "Book-1/01-Chapter-One.md",
        `---\ntype: chapter\nname: "Book 1 — Chapter One"\norder: 1\n---\n`,
      ],
      [
        "Book-2/01-Chapter-One.md",
        `---\ntype: chapter\nname: "Book 2 — Chapter One"\norder: 2\n---\n`,
      ],
      ["Codex/Characters/Protagonist.md", CHARACTER_SHEET],
      ["Codex/Locations/The-Capital.md", LOCATION_SHEET],
      [
        "Codex/Lore/World-Rules.md",
        `---\ntype: lore\nname: World Rules\n---\nThe promises the world makes. Break one on purpose or never.\n\nWhat does magic / technology cost the person using it?\n\nWhat can money not buy here?\n\n- [ ] Write the one rule that will matter in the finale\n`,
      ],
      [
        "Notes/Series-Arc.md",
        `---\ntype: note\nname: Series Arc\n---\nWhere each book leaves the world.\n\n- [ ] One sentence per book: what becomes impossible after it\n`,
      ],
    ],
  },
  {
    id: "short",
    name: "Short story",
    blurb: "One manuscript file and a scratch note. No ceremony.",
    files: [
      ["Manuscript/01-The-Story.md", `---\ntype: chapter\nname: The Story\norder: 1\n---\n`],
      [
        "Notes/Scratch.md",
        `---\ntype: note\nname: Scratch\n---\nFragments, cut lines, and the ending you're not sure about yet.\n`,
      ],
    ],
  },
  {
    id: "blank",
    name: "Blank",
    blurb: "An empty folder. You know what you're doing.",
    files: [
      ["Manuscript/01-Chapter-One.md", `---\ntype: chapter\nname: Chapter One\norder: 1\n---\n`],
    ],
  },
];

export function presetById(id: string): ProjectPreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[PRESETS.length - 1]!;
}
