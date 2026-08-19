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

/** One line of a body with the offsets it occupies. Everything below walks
    a body this way rather than re-deriving offsets per feature, so a task,
    a heading and an insertion point can never disagree about where a line
    begins. */
interface Row {
  text: string;
  from: number;
  /** Offset of the terminating newline, or the body's end. */
  to: number;
}

function rowsOf(body: string): Row[] {
  const out: Row[] = [];
  let offset = 0;
  for (const line of body.split("\n")) {
    out.push({ text: line, from: offset, to: offset + line.length });
    offset += line.length + 1;
  }
  return out;
}

function readTask(text: string, from: number): BodyTask | null {
  const m = TASK_LINE.exec(text);
  if (!m) return null;
  return {
    text: (m[3] ?? "").trim(),
    done: (m[2] ?? "").toLowerCase() === "x",
    checkbox: from + m[1]!.length,
    lineFrom: from,
    lineTo: from + text.length,
  };
}

export function extractTasks(body: string): BodyTask[] {
  const out: BodyTask[] = [];
  for (const row of rowsOf(body)) {
    const task = readTask(row.text, row.from);
    if (task) out.push(task);
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

/* ============================================================
   Headers — a checklist with sections in it

   A revision list wants headings over it ("Act one", "Line
   edits") with the boxes underneath. Markdown already has that
   shape, so nothing new is invented: a section is an ordinary
   ATX heading with task lines under it.

     ## Act one
     - [ ] cut the ferry scene
     - [ ] name the dog

   The other candidate — a plain `- Act one` bullet with the
   boxes indented beneath — was rejected. `- something` is the
   most common line in anyone's notes, so a bullet header could
   only be told from an ordinary bullet by the indentation of
   what follows, and indentation is precisely what a
   list-continuing editor and a stray Tab will change. `#` can
   never be read as a task and a task can never be read as `#`,
   so however the file is edited the two cannot be confused.

   A heading counts as a task header only when the first
   non-blank line beneath it is a task. Without that rule every
   `# Chapter Three` in a manuscript would adopt whatever
   reminder happens to sit further down the page, and notes that
   were never meant to have sections would sprout them. Once a
   heading qualifies it owns every task down to the next heading
   of any level, so typing a paragraph between two boxes does
   not split the group.

   The consequence worth stating plainly: delete every task under
   a heading and it stops qualifying — the panel loses the
   section and the writer's `## Act one` line stays in the note.
   Cutting a line the writer typed is not something a checkbox
   panel gets to do on its own.

   Setext headings (`Title` over `=====`) are not read as
   headers. Neither is a `#` inside a fenced code block — the
   same blind spot `- [ ]` has had here from the beginning, and
   for the same reason: this parser reads lines, not a document
   tree.
   ============================================================ */

/** `## Heading` — ATX, one to six hashes, the space required.

    Deliberately no support for the closing-hash form (`## X ##`): the text
    this captures is the text a rename writes back, and a form that reads
    differently from how it is written cannot round-trip. */
export const HEADING_LINE = /^(#{1,6})[ \t]+(.*)$/;

export interface TaskHeader {
  /** The heading text, hashes and surrounding space stripped. */
  text: string;
  /** How many hashes — kept so renaming never promotes or demotes a line. */
  level: number;
  lineFrom: number;
  lineTo: number;
}

export interface TaskSection {
  /** null for the note's ungrouped tasks — the ones under no header at
      all, which is every task in every note written before this existed. */
  header: TaskHeader | null;
  tasks: BodyTask[];
}

function readHeader(text: string, from: number): TaskHeader | null {
  const m = HEADING_LINE.exec(text);
  if (!m) return null;
  return {
    text: m[2]!.trim(),
    level: m[1]!.length,
    lineFrom: from,
    lineTo: from + text.length,
  };
}

/** Every task in a body, split into the sections it reads as.

    The ungrouped section comes first when there is one, then each header
    section in document order. A body with no headings returns exactly one
    ungrouped section holding everything — which is what makes this safe to
    render for notes that have never heard of headers. */
export function extractSections(body: string): TaskSection[] {
  const rows = rowsOf(body);
  const loose: BodyTask[] = [];
  const sections: TaskSection[] = [];
  let current: TaskSection | null = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const header = readHeader(row.text, row.from);
    if (header) {
      // Any heading closes the section above it, qualified or not.
      current = null;
      for (let j = i + 1; j < rows.length; j++) {
        if (rows[j]!.text.trim() === "") continue;
        if (TASK_LINE.test(rows[j]!.text)) {
          current = { header, tasks: [] };
          sections.push(current);
        }
        break;
      }
      continue;
    }
    const task = readTask(row.text, row.from);
    if (task) (current ? current.tasks : loose).push(task);
  }

  return loose.length ? [{ header: null, tasks: loose }, ...sections] : sections;
}

export interface HeaderLine {
  from: number;
  to: number;
  level: number;
  text: string;
}

/** Read the heading starting at `from`, or null if there isn't one.

    Same contract as taskLineAt, for the same reason: a header's offset was
    captured when the panel last rendered, the note may have moved under it
    since, and rewriting a line we can no longer identify would eat prose. */
export function headerLineAt(body: string, from: number, expect?: string): HeaderLine | null {
  if (from < 0 || from > body.length) return null;
  if (from > 0 && body[from - 1] !== "\n") return null;
  const nl = body.indexOf("\n", from);
  const to = nl === -1 ? body.length : nl;
  const header = readHeader(body.slice(from, to), from);
  if (!header) return null;
  if (expect !== undefined && expect !== header.text) return null;
  return { from, to, level: header.level, text: header.text };
}

/** Build a `- [ ] text` line, borrowing the indent and bullet character of
    the line it will follow. A note written with `*` bullets or an indented
    sub-list keeps the shape the writer chose; an ordered marker falls back
    to `-`, because inserting `4.` into a list means renumbering the rest. */
function newTaskLine(text: string, likePrefix?: string): string {
  let indent = "";
  let marker = "-";
  if (likePrefix) {
    const m = /^([ \t]*)([-*+])/.exec(likePrefix);
    if (m) {
      indent = m[1]!;
      marker = m[2]!;
    } else {
      indent = /^[ \t]*/.exec(likePrefix)![0];
    }
  }
  return `${indent}${marker} [ ] ${text}`;
}

/** A task is one line by definition — the same flattening replaceTaskTextAt
    does, so a pasted paragraph can't become prose the panel cannot see. */
function cleanOneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Add a task under the header at `from`, below that header's last task.

    Below the last rather than above the first: a list you add to grows
    downward, and the panel's add field sits at the foot of the section, so
    the line lands where the writer was looking when they typed it. */
export function insertTaskUnderHeaderAt(
  body: string,
  from: number,
  expect: string,
  text: string,
): string | null {
  const header = headerLineAt(body, from, expect);
  if (!header) return null;
  const clean = cleanOneLine(text);
  if (!clean) return null;

  const rows = rowsOf(body);
  const start = rows.findIndex((r) => r.from === header.from);
  if (start === -1) return null;

  // With no task in the section yet the line goes directly under the
  // heading — which is also precisely what makes the heading qualify.
  let at = header.to;
  let likePrefix: string | undefined;
  for (let i = start + 1; i < rows.length; i++) {
    if (HEADING_LINE.test(rows[i]!.text)) break;
    const m = TASK_LINE.exec(rows[i]!.text);
    if (!m) continue;
    at = rows[i]!.to;
    likePrefix = m[1]!;
  }
  return `${body.slice(0, at)}\n${newTaskLine(clean, likePrefix)}${body.slice(at)}`;
}

/** Add a task that belongs to no header.

    It lands after the last ungrouped task, or — in a note that already has
    sections but nothing loose — in front of the first header rather than at
    the end of the file, where it would silently join the last section. The
    file's order and the panel's order stay the same thing that way. A note
    with no headers at all gets the plain append it has always got. */
export function appendLooseTask(body: string, text: string): string | null {
  const clean = cleanOneLine(text);
  if (!clean) return null;

  const sections = extractSections(body);
  const loose = sections.find((s) => s.header === null);
  const last = loose?.tasks[loose.tasks.length - 1];
  if (last) {
    const prefix = taskLineAt(body, last.lineFrom)?.prefix;
    return `${body.slice(0, last.lineTo)}\n${newTaskLine(clean, prefix)}${body.slice(last.lineTo)}`;
  }

  const first = sections.find((s) => s.header)?.header;
  if (first) {
    return `${body.slice(0, first.lineFrom)}${newTaskLine(clean)}\n\n${body.slice(first.lineFrom)}`;
  }

  const glue = body.length === 0 || body.endsWith("\n") ? "" : "\n";
  return `${body}${glue}${newTaskLine(clean)}\n`;
}

/** Create a header and its first task in one edit.

    One edit because a heading with nothing under it is not a header — it
    would vanish from the panel the moment it was written. So the panel
    holds a new header in its own state until a task arrives, and the file
    only ever sees the finished pair.

    `##` rather than `#`: a single hash usually stands for the note's own
    title, and a section inside a note sits below that.

    A heading of the same name already in the body is reused rather than
    duplicated. A section whose last task was deleted still has its line
    sitting in the note, and writing a second `## Act one` underneath it
    would split one group into two. */
export function createHeaderWithTask(body: string, name: string, text: string): string | null {
  const heading = cleanOneLine(name);
  const clean = cleanOneLine(text);
  if (!heading || !clean) return null;

  for (const row of rowsOf(body)) {
    const found = readHeader(row.text, row.from);
    if (found && found.text.toLowerCase() === heading.toLowerCase()) {
      return insertTaskUnderHeaderAt(body, found.lineFrom, found.text, clean);
    }
  }

  const glue =
    body.length === 0 ? "" : body.endsWith("\n\n") ? "" : body.endsWith("\n") ? "\n" : "\n\n";
  return `${body}${glue}## ${heading}\n${newTaskLine(clean)}\n`;
}

/** Rename a header in place, keeping its level. Its tasks are not touched,
    so nothing is orphaned — they go on sitting under the same line.

    An empty name is refused rather than written: `## ` is not a heading, so
    saving one would drop the line out of the parse and cut every task under
    it loose from its group in the same keystroke. */
export function renameHeaderAt(
  body: string,
  from: number,
  expect: string,
  name: string,
): string | null {
  const header = headerLineAt(body, from, expect);
  if (!header) return null;
  const clean = cleanOneLine(name);
  if (!clean) return null;
  const next = `${"#".repeat(header.level)} ${clean}`;
  if (next === body.slice(header.from, header.to)) return body;
  return body.slice(0, header.from) + next + body.slice(header.to);
}

/** Remove a header line and nothing else.

    Its tasks stay exactly where they are and simply stop being grouped:
    they join whatever section now contains them — the one above if there
    is one, otherwise the note's ungrouped list. Removing a header is a
    change to a label, never to a checklist, so it never deletes a task. */
export function removeHeaderAt(body: string, from: number, expect: string): string | null {
  const header = headerLineAt(body, from, expect);
  if (!header) return null;
  // Same newline arithmetic as removeTaskLineAt: a line takes its own
  // terminating newline, and the body's last line takes the one in front.
  if (header.to < body.length) return body.slice(0, header.from) + body.slice(header.to + 1);
  return body.slice(0, header.from > 0 ? header.from - 1 : 0);
}

export interface TaskProgress {
  done: number;
  total: number;
}

export function taskProgress(body: string): TaskProgress {
  const tasks = extractTasks(body);
  return { done: tasks.filter((t) => t.done).length, total: tasks.length };
}
