/* Paragraph movement — the writer-shaped version of Notion's drag-handle
   block reordering. Prose's natural block is the paragraph (text between
   blank lines), so Alt+↑/↓ swaps the paragraph under the cursor with its
   neighbour and the cursor rides along.

   Pure string math, no editor: given a body and a cursor offset, return
   the new body and where the cursor lands. The CodeMirror keymap in
   EditorPane is a five-line wrapper around this. */

export interface ParagraphMove {
  body: string;
  /** Where the cursor should land so it stays on the same word. */
  cursor: number;
}

interface Block {
  start: number;
  end: number; // exclusive
}

/** Split into paragraph blocks (runs of non-blank lines) with the blank
    runs between them preserved implicitly by position. */
function blocksOf(body: string): Block[] {
  const blocks: Block[] = [];
  const re = /[^\n][\s\S]*?(?=\n\s*\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    blocks.push({ start: m.index, end: m.index + m[0].length });
    // Avoid zero-width loops on pathological input.
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  return blocks;
}

/** Move the paragraph containing `cursor` up or down one paragraph.
    Returns null when there's nowhere to go — first paragraph moving up,
    last moving down, or an empty body. */
export function moveParagraph(
  body: string,
  cursor: number,
  direction: -1 | 1,
): ParagraphMove | null {
  const blocks = blocksOf(body);
  if (blocks.length < 2) return null;

  let idx = blocks.findIndex((b) => cursor >= b.start && cursor <= b.end);
  // Cursor on a blank line between blocks: attach to the previous block,
  // which is where a writer would say "my paragraph" is.
  if (idx === -1) {
    idx = blocks.findIndex((b) => b.start > cursor) - 1;
    if (idx < 0) idx = blocks.length - 1;
  }

  const target = idx + direction;
  if (target < 0 || target >= blocks.length) return null;

  const a = blocks[Math.min(idx, target)]!;
  const b = blocks[Math.max(idx, target)]!;
  const textA = body.slice(a.start, a.end);
  const gap = body.slice(a.end, b.start);
  const textB = body.slice(b.start, b.end);

  const next = body.slice(0, a.start) + textB + gap + textA + body.slice(b.end);

  // The cursor keeps its offset WITHIN its paragraph.
  const within = cursor - blocks[idx]!.start;
  const cursorHome =
    direction === -1
      ? a.start // moved up: my paragraph now starts where the earlier one did
      : a.start + textB.length + gap.length; // moved down: after the swapped-in block
  return { body: next, cursor: Math.min(cursorHome + Math.max(0, within), next.length) };
}
