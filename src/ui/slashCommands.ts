/* Slash-command menu — Notion's fastest habit, adapted for prose.

   Typing "/" as the only thing on a line opens a menu of things to drop
   in: a task, a scene break, a heading, a beat, a link, a new character.
   The trigger only fires when "/" starts the line and nothing follows the
   cursor, so "and/or" mid-sentence or a pasted URL never pops it open.

   This module is the pure half — the command list and the matching/insert
   logic, with no CodeMirror or store dependency, so it's testable without
   a live editor. EditorPane.tsx wires it to the autocomplete API and to
   the vault for the commands that need it (beat, link, character). */

export interface SlashCommand {
  id: string;
  label: string;
  hint: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: "task", label: "Task", hint: "- [ ] a to-do line" },
  { id: "scene-break", label: "Scene break", hint: "* * *" },
  { id: "heading", label: "Heading", hint: "## a section title" },
  { id: "beat", label: "Beat", hint: "Jump to the beat plan below" },
  { id: "link", label: "Link to entry", hint: "[[ — search the codex" },
  { id: "character", label: "New character", hint: "Create a codex entry and link it here" },
];

/** Only fires on a blank line: "/" plus optional word characters, with
    nothing before the "/" and nothing after the cursor. */
export const SLASH_TRIGGER = /^\/(\w*)$/;

/** Commands that just insert fixed prose — no store access needed, so
    they're kept separate from the ones that reach into the vault. */
export const SLASH_INSERT: Partial<Record<string, string>> = {
  task: "- [ ] ",
  "scene-break": "* * *",
  heading: "## ",
};

/** Filter the menu as the writer keeps typing after "/". Empty query
    shows everything, in the fixed priority order above. */
export function matchSlashCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    (c) => c.id.includes(q) || c.label.toLowerCase().includes(q),
  );
}
