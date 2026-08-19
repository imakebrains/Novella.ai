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

/* ------------------------------------------------------------
   Rewriting a single task line

   The Tasks panel edits, archives and deletes tasks, and each of
   those is really one operation: replace or cut the line the task
   lives on, leaving every other byte of the note alone. Doing it
   here — pure, on offsets the caller already holds — means the
   panel never hand-rolls string surgery on a manuscript.

   Every function verifies the offset still holds a task line and
   returns null when it doesn't, for the same reason toggleTaskAt
   does: the body can change under a rendered list, and a confident
   guess would rewrite prose.
   ------------------------------------------------------------ */

export interface TaskLine {
  /** Offset of the line's first character — a BodyTask's lineFrom. */
  from: number;
  /** Offset of the terminating newline, or the body's end. */
  to: number;
  /** List marker and its trailing whitespace, e.g. `"  - "`. */
  prefix: string;
  /** The character inside the box: `" "`, `"x"` or `"X"`. */
  box: string;
  text: string;
}

/** Read the task line starting at `from`, or null if there isn't one.

    `expect` is the text the caller believed was there. Passing it turns a
    stale offset into a refusal rather than an edit to the wrong task —
    worth it for anything destructive. */
export function taskLineAt(body: string, from: number, expect?: string): TaskLine | null {
  if (from < 0 || from > body.length) return null;
  // Offsets that don't land on a line start belong to a different body.
  if (from > 0 && body[from - 1] !== "\n") return null;
  const nl = body.indexOf("\n", from);
  const to = nl === -1 ? body.length : nl;
  const m = TASK_LINE.exec(body.slice(from, to));
  if (!m) return null;
  const text = (m[3] ?? "").trim();
  if (expect !== undefined && expect !== text) return null;
  return { from, to, prefix: m[1]!, box: m[2]!, text };
}

/** Rewrite a task's text, keeping its indent, marker and tick.

    Newlines are flattened: a task is one line by definition, so pasting a
    paragraph into the edit box must not split it into prose the panel can
    no longer see. */
export function replaceTaskTextAt(body: string, from: number, text: string): string | null {
  const line = taskLineAt(body, from);
  if (!line) return null;
  const clean = text.replace(/\s+/g, " ").trim();
  const next = `${line.prefix}[${line.box}]${clean ? ` ${clean}` : ""}`;
  if (next === body.slice(line.from, line.to)) return body;
  return body.slice(0, line.from) + next + body.slice(line.to);
}

/** Cut a task line out entirely, newline and all — no blank gap left
    behind where the task used to be. */
export function removeTaskLineAt(body: string, from: number, expect?: string): string | null {
  const line = taskLineAt(body, from, expect);
  if (!line) return null;
  // The line takes its own terminating newline; the last line of a body
  // has none, so it takes the one in front of it instead.
  if (line.to < body.length) return body.slice(0, line.from) + body.slice(line.to + 1);
  return body.slice(0, line.from > 0 ? line.from - 1 : 0);
}

export interface TaskProgress {
  done: number;
  total: number;
}

export function taskProgress(body: string): TaskProgress {
  const tasks = extractTasks(body);
  return { done: tasks.filter((t) => t.done).length, total: tasks.length };
}
