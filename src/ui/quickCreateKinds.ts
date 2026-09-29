/* The kinds the + button offers. Mirrors the codex sidebar's groups, in
   the same order, so nothing the sidebar can show is something the button
   cannot make — test-quickcreate.ts holds the two lists to each other.
   Chapter stays first: it is the picker's default selection. */

export interface QuickKind {
  type: string;
  label: string;
  hint: string;
}

export const KINDS: QuickKind[] = [
  { type: "chapter", label: "Chapter", hint: "Lands at the end of the manuscript" },
  { type: "scene", label: "Scene", hint: "A smaller unit — also on the board" },
  { type: "character", label: "Character", hint: "Codex entry, linkable with [[name]]" },
  { type: "location", label: "Location", hint: "Codex entry for a place" },
  { type: "faction", label: "Faction", hint: "A house, guild, crew or cause — who stands with whom" },
  { type: "object", label: "Object", hint: "A thing that matters — the ring, the letter, the gun on the mantel" },
  { type: "lore", label: "Lore", hint: "How the world works — history, rules, magic, money" },
  { type: "note", label: "Note", hint: "Checklists, research, anything" },
  { type: "prompt", label: "Prompt", hint: "A saved instruction for the assistant — voice, style, a recurring ask" },
];
