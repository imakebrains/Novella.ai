/* ============================================================
   Prose analysis — the ProWritingAid-style checks

   All of this runs locally on plain text. No API, no cost, no
   network, instant on a chapter. These are heuristics, not truth:
   the panel that renders them says so, because "passive voice"
   detected by regex is a suggestion, not a verdict.
   ============================================================ */

export interface Sentence {
  text: string;
  words: number;
  start: number;
}

export interface Finding {
  /** Character offset into the analysed text. */
  index: number;
  length: number;
  text: string;
  note: string;
}

export interface ProseReport {
  words: number;
  sentences: number;
  paragraphs: number;
  readingMinutes: number;

  readability: { score: number; label: string; grade: number };
  avgSentenceWords: number;
  /** Standard deviation of sentence length — low means monotonous rhythm. */
  sentenceVariety: number;
  longestSentence: Sentence | null;

  glueIndex: number;
  adverbs: Finding[];
  passive: Finding[];
  echoes: { word: string; count: number; nearest: number }[];
  overused: { word: string; count: number; per1000: number }[];
  dialogueRatio: number;
  stickySentences: Sentence[];
}

/* Function words that carry no image. A sentence stuffed with them
   reads "sticky" — technically correct, no traction. */
const GLUE = new Set([
  "a","about","after","all","am","an","and","any","are","as","at","be","been",
  "being","but","by","can","could","did","do","does","down","for","from","had",
  "has","have","he","her","here","him","his","how","i","if","in","into","is",
  "it","its","just","like","may","me","might","more","most","much","must","my",
  "no","not","of","off","on","one","only","or","other","our","out","over","own",
  "quite","rather","really","said","same","she","should","so","some","such",
  "than","that","the","their","them","then","there","these","they","this",
  "those","through","to","too","under","up","very","was","we","were","what",
  "when","where","which","while","who","why","will","with","would","you","your",
]);

/** Words that mean nothing on their own — flagged when overused. */
const FILLER = new Set(["very","really","just","quite","rather","somewhat","actually","literally","basically","suddenly","simply"]);

const BE_VERBS = ["is","are","was","were","be","been","being","am"];

const COMMON = new Set([...GLUE, "s","t","said","asked","replied"]);

export function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  const re = /[^.!?]+[.!?]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    out.push({ text: trimmed, words: countWords(trimmed), start: m.index });
  }
  return out;
}

export function countWords(text: string): number {
  const m = text.trim().match(/[\p{L}\p{N}'’-]+/gu);
  return m ? m.length : 0;
}

function wordsOf(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}'’-]+/gu) ?? []).filter(Boolean);
}

/** Approximate syllable count. Good enough for a readability index. */
function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  const trimmed = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

function readabilityLabel(score: number): string {
  if (score >= 90) return "Very easy";
  if (score >= 80) return "Easy";
  if (score >= 70) return "Fairly easy";
  if (score >= 60) return "Plain English";
  if (score >= 50) return "Fairly hard";
  if (score >= 30) return "Hard";
  return "Very hard";
}

export function analyseProse(input: string): ProseReport {
  // Strip wiki-link syntax so [[Halden's Reach]] counts as two words,
  // not as brackets, and markdown emphasis doesn't skew counts.
  const text = input
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t: string, a?: string) => (a ?? t))
    .replace(/[*_`#>]/g, "");

  const sentences = splitSentences(text);
  const allWords = wordsOf(text);
  const words = allWords.length;
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;

  const totalSyllables = allWords.reduce((sum, w) => sum + syllables(w), 0);
  const avgSentenceWords = sentences.length ? words / sentences.length : 0;
  const avgSyllables = words ? totalSyllables / words : 0;

  const score = words && sentences.length
    ? 206.835 - 1.015 * avgSentenceWords - 84.6 * avgSyllables
    : 0;
  const grade = words && sentences.length
    ? 0.39 * avgSentenceWords + 11.8 * avgSyllables - 15.59
    : 0;

  // Rhythm: identical sentence lengths read like a metronome.
  const mean = avgSentenceWords;
  const variance = sentences.length
    ? sentences.reduce((s, x) => s + (x.words - mean) ** 2, 0) / sentences.length
    : 0;

  const glueCount = allWords.filter((w) => GLUE.has(w)).length;

  const adverbs: Finding[] = [];
  const adverbRe = /\b\w{4,}ly\b/g;
  let am: RegExpExecArray | null;
  while ((am = adverbRe.exec(text))) {
    adverbs.push({
      index: am.index,
      length: am[0].length,
      text: am[0],
      note: "Adverb — is the verb doing enough work?",
    });
  }

  // Passive voice: a "to be" verb followed by a past participle. Rough,
  // and it will miss irregulars and flag some false positives.
  const passive: Finding[] = [];
  const passiveRe = new RegExp(`\\b(${BE_VERBS.join("|")})\\s+(\\w+ed|born|done|gone|seen|known|taken|given|made|held|told|found)\\b`, "gi");
  let pm: RegExpExecArray | null;
  while ((pm = passiveRe.exec(text))) {
    passive.push({
      index: pm.index,
      length: pm[0].length,
      text: pm[0],
      note: "Reads passive — who is doing this?",
    });
  }

  // Echoes: a distinctive word repeated close to itself is the kind of
  // thing a writer never notices and a reader always does.
  const positions = new Map<string, number[]>();
  const wordRe = /[\p{L}'’-]+/gu;
  let wm: RegExpExecArray | null;
  let ordinal = 0;
  while ((wm = wordRe.exec(text))) {
    const w = wm[0].toLowerCase();
    ordinal++;
    if (w.length < 5 || COMMON.has(w)) continue;
    const list = positions.get(w) ?? [];
    list.push(ordinal);
    positions.set(w, list);
  }

  const echoes: { word: string; count: number; nearest: number }[] = [];
  for (const [word, list] of positions) {
    if (list.length < 2) continue;
    let nearest = Infinity;
    for (let i = 1; i < list.length; i++) {
      const gap = (list[i] ?? 0) - (list[i - 1] ?? 0);
      if (gap < nearest) nearest = gap;
    }
    if (nearest <= 60) echoes.push({ word, count: list.length, nearest });
  }
  echoes.sort((a, b) => a.nearest - b.nearest || b.count - a.count);

  const freq = new Map<string, number>();
  for (const w of allWords) {
    if (w.length < 4 && !FILLER.has(w)) continue;
    if (COMMON.has(w) && !FILLER.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  const overused = [...freq.entries()]
    .map(([word, count]) => ({ word, count, per1000: words ? (count / words) * 1000 : 0 }))
    .filter((e) => e.count >= 3)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // Dialogue share, counting straight and curly quotes.
  const dialogueChars = (text.match(/["“][^"”]*["”]/g) ?? []).join("").length;
  const dialogueRatio = text.length ? dialogueChars / text.length : 0;

  const stickySentences = sentences
    .filter((s) => {
      if (s.words < 8) return false;
      const ws = wordsOf(s.text);
      const glue = ws.filter((w) => GLUE.has(w)).length;
      return glue / ws.length > 0.45;
    })
    .sort((a, b) => b.words - a.words)
    .slice(0, 5);

  const longest = sentences.reduce<Sentence | null>(
    (best, s) => (!best || s.words > best.words ? s : best),
    null,
  );

  return {
    words,
    sentences: sentences.length,
    paragraphs,
    readingMinutes: words / 240,
    readability: { score: clampScore(score), label: readabilityLabel(score), grade: Math.max(0, grade) },
    avgSentenceWords,
    sentenceVariety: Math.sqrt(variance),
    longestSentence: longest,
    glueIndex: words ? (glueCount / words) * 100 : 0,
    adverbs,
    passive,
    echoes: echoes.slice(0, 8),
    overused,
    dialogueRatio,
    stickySentences,
  };
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/* ============================================================
   Inline issues

   analyseProse() reports offsets into a *cleaned* copy of the text —
   fine for a statistics panel, useless for underlining, because every
   stripped [[link]] shifts everything after it. These run against the
   raw buffer so the ranges land on the right characters.
   ============================================================ */

export type IssueKind = "adverb" | "passive" | "echo" | "sticky";

export interface InlineIssue {
  from: number;
  to: number;
  kind: IssueKind;
  message: string;
}

/** Character ranges covered by [[wiki-links]], so we don't decorate inside them. */
function linkRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  const re = /\[\[[^\]]*\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push([m.index, m.index + m[0].length]);
  return out;
}

export function findInlineIssues(text: string, kinds?: Set<IssueKind>): InlineIssue[] {
  const want = (k: IssueKind) => !kinds || kinds.has(k);
  const issues: InlineIssue[] = [];
  const links = linkRanges(text);
  const insideLink = (i: number) => links.some(([a, b]) => i >= a && i < b);

  if (want("adverb")) {
    const re = /\b\w{4,}ly\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (insideLink(m.index)) continue;
      issues.push({
        from: m.index,
        to: m.index + m[0].length,
        kind: "adverb",
        message: `“${m[0]}” — could a stronger verb carry this?`,
      });
    }
  }

  if (want("passive")) {
    const re = new RegExp(
      `\\b(${BE_VERBS.join("|")})\\s+(\\w+ed|born|done|gone|seen|known|taken|given|made|held|told|found)\\b`,
      "gi",
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (insideLink(m.index)) continue;
      issues.push({
        from: m.index,
        to: m.index + m[0].length,
        kind: "passive",
        message: `“${m[0]}” reads passive — who is doing this?`,
      });
    }
  }

  if (want("echo")) {
    // Same word, twice, within 60 words of itself.
    const seen = new Map<string, { index: number; ordinal: number }[]>();
    const re = /[\p{L}'’-]+/gu;
    let m: RegExpExecArray | null;
    let ordinal = 0;
    while ((m = re.exec(text))) {
      ordinal++;
      const w = m[0].toLowerCase();
      if (w.length < 5 || COMMON.has(w) || insideLink(m.index)) continue;
      const list = seen.get(w) ?? [];
      list.push({ index: m.index, ordinal });
      seen.set(w, list);
    }
    for (const [word, hits] of seen) {
      if (hits.length < 2) continue;
      for (let i = 1; i < hits.length; i++) {
        const prev = hits[i - 1];
        const cur = hits[i];
        if (!prev || !cur) continue;
        if (cur.ordinal - prev.ordinal <= 60) {
          issues.push({
            from: cur.index,
            to: cur.index + word.length,
            kind: "echo",
            message: `“${word}” repeats ${cur.ordinal - prev.ordinal} words after the last one.`,
          });
        }
      }
    }
  }

  if (want("sticky")) {
    for (const s of splitSentences(text)) {
      if (s.words < 8) continue;
      const ws = (s.text.toLowerCase().match(/[\p{L}'’-]+/gu) ?? []);
      if (!ws.length) continue;
      const glue = ws.filter((w) => GLUE.has(w)).length;
      const ratio = glue / ws.length;
      if (ratio > 0.45) {
        issues.push({
          from: s.start,
          to: s.start + s.text.length,
          kind: "sticky",
          message: `${Math.round(ratio * 100)}% filler words — this sentence has little traction.`,
        });
      }
    }
  }

  return issues.sort((a, b) => a.from - b.from);
}
