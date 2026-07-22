/* ============================================================
   Task lists

   Notion's plainest good idea: a to-do can live anywhere. Here a
   task is a Markdown task-list line — `- [ ] thing` — in any note:
   a revision checklist in a note file, a "fix this scene" reminder
   inside a chapter, research to chase in a codex entry.

   Storing them as plain Markdown (not a separate database) keeps
   the vault's one promise: the files are the truth, and they stay
   readable in any editor on earth. This module is the single
   parser both the editor decorations and the Tasks panel share,
   so a "task" always means exactly the same thing everywhere.

   Pure string work — no store, no DOM — so it's unit-testable.
   ============================================================ */

export interface BodyTask {
  /** The task text with the marker and checkbox stripped. */
  text: string;
  done: boolean;
  /** Offset of the checkbox's `[` in the body — the toggle target. */
  checkbox: number;
  /** Bounds of the whole line, for line-level styling. */
  lineFrom: number;
  lineTo: number;
}

/** `- [ ] text`, `* [x] text`, `3. [ ] text` — list marker, box, text.
    Indentation allowed; the space between marker and box required. */
export const TASK_LINE = /^([ \t]*(?:[-*+]|\d+[.)])[ \t]+)\[( |x|X)\](?:[ \t]+(.*))?$/;

export function extractTasks(body: string): BodyTask[] {
  const out: BodyTask[] = [];
  let offset = 0;
  for (const line of body.split("\n")) {
    const m = TASK_LINE.exec(line);
    if (m) {
      out.push({
        text: (m[3] ?? "").trim(),
        done: (m[2] ?? "").toLowerCase() === "x",
        checkbox: offset + m[1]!.length,
        lineFrom: offset,
        lineTo: offset + line.length,
      });
    }
    offset += line.length + 1;
  }
  return out;
}

/** Flip the checkbox at `checkbox`. Returns null when the offset doesn't
    hold a checkbox — the body changed under us, and guessing would corrupt
    prose, so the caller just re-reads and tries again. */
export function toggleTaskAt(body: string, checkbox: number): string | null {
  const token = body.slice(checkbox, checkbox + 3);
  if (token === "[ ]") return `${body.slice(0, checkbox)}[x]${body.slice(checkbox + 3)}`;
  if (token === "[x]" || token === "[X]") return `${body.slice(0, checkbox)}[ ]${body.slice(checkbox + 3)}`;
  return null;
}

export interface TaskProgress {
  done: number;
  total: number;
}

export function taskProgress(body: string): TaskProgress {
  const tasks = extractTasks(body);
  return { done: tasks.filter((t) => t.done).length, total: tasks.length };
}
