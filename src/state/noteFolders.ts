/* Where a freshly created note lands, by type.

   The folder is a courtesy to the writer browsing the project on disk —
   the note's type comes from its frontmatter, so nothing breaks if a
   file is moved. Kinds the codex does not group (or that arrive from a
   template with an unexpected `templateFor`) fall back to Codex/Lore,
   which is where they have always gone.

   Scenes and notes sit in Codex/Lore because that is where they landed
   before this map existed; moving them is a separate decision. */

const FOLDERS: Record<string, string> = {
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

export const DEFAULT_FOLDER = "Codex/Lore";

export function folderForType(type: string): string {
  // hasOwn, not `??` alone — a type named "constructor" must not find Object's.
  return (Object.hasOwn(FOLDERS, type) && FOLDERS[type]) || DEFAULT_FOLDER;
}
