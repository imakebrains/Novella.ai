/* Paragraph diffing and relative time.

   Split out of HistoryPanel so both can be tested without mounting React
   or pulling the whole UI into a test run. */

export interface DiffRow {
  kind: "same" | "add" | "remove";
  text: string;
}

/* Paragraph-level rather than word-level. Prose is edited in paragraphs,
   and a word-level diff of a rewritten scene is confetti — technically
   accurate and impossible to read. */
export function diffParagraphs(from: string, to: string): DiffRow[] {
  const a = from.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  const b = to.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);

  // Longest common subsequence over paragraphs.
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      rows.push({ kind: "remove", text: a[i]! });
      i++;
    } else {
      rows.push({ kind: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) rows.push({ kind: "remove", text: a[i++]! });
  while (j < m) rows.push({ kind: "add", text: b[j++]! });
  return rows;
}

/* ---------- word-level diff, inside a changed paragraph ---------- */

export interface WordRun {
  kind: "same" | "add" | "remove";
  text: string;
}

/** Word-level LCS over a remove/add paragraph pair, so History can show
    WHICH words changed instead of striking a whole paragraph for one
    swapped adjective. Tokens keep their trailing whitespace, so joining
    the runs reproduces each side exactly. */
export function diffWords(from: string, to: string): WordRun[] {
  const tokenize = (s: string): string[] => s.match(/\S+\s*/g) ?? [];
  const a = tokenize(from);
  const b = tokenize(to);

  // Same LCS shape as the paragraph diff; the token is a word, not a line.
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const word = (t: string) => t.trim();
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        word(a[i]!) === word(b[j]!)
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const runs: WordRun[] = [];
  const push = (kind: WordRun["kind"], text: string) => {
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.text += text;
    else runs.push({ kind, text });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (word(a[i]!) === word(b[j]!)) {
      push("same", b[j]!);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      push("remove", a[i]!);
      i++;
    } else {
      push("add", b[j]!);
      j++;
    }
  }
  while (i < n) push("remove", a[i++]!);
  while (j < m) push("add", b[j++]!);
  return runs;
}

export function relativeTime(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
