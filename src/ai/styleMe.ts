import { stripWikiLinks } from "./context";
import type { RoleId } from "./roles";

/* ============================================================
   Style me — reading a voice off a sample of prose

   The writer hands over a page or two they like: their own best
   chapter, a passage from a book on the shelf, the newsletter
   voice they want the drafts to sound like. A model reads it and
   describes what it is doing — sentence rhythm, diction, habits —
   and that description is saved as an ordinary `type: prompt`
   note in the vault.

   Saving it as a prompt note is the whole design, not a filing
   decision. Prompt notes already appear in the assistant's
   "Writing style" list, already travel with the project folder,
   and are already plain Markdown the writer can rewrite by hand.
   A style stored anywhere else would be a second prompt system
   that only Style me knows about, and it would not survive the
   folder being opened on another machine.

   Everything in this file is pure: text in, text out. No provider,
   no store, no React. That matters because the parts a writer
   actually feels — how much prose is enough, what happens when
   the model answers in the wrong shape, whether the saved note is
   valid Markdown with valid frontmatter — are exactly the parts
   that must not depend on having Ollama running to check.

   The one rule the impure caller must keep: when no model can
   answer, this flow FAILS. It does not describe a style from
   nothing. A fabricated analysis of prose nobody read is worse
   than no feature, because the writer would build a book on it.
   ============================================================ */

/* ---------------- the sample ---------------- */

/* Bounds in words rather than characters, because the thing being
   measured is prose. Below the floor a model has nothing to
   generalize from and will confidently describe the one sentence
   it was given; above the ceiling it costs tokens for no extra
   signal, and a local 8B model starts losing the beginning of the
   sample by the end of it. */
export const SAMPLE_MIN_WORDS = 150;
export const SAMPLE_MAX_WORDS = 2500;

/** Under this it works, but the read is thin and worth saying so. */
const SAMPLE_THIN_WORDS = 400;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Strip everything that is a file rather than prose.

    Samples arrive by three routes — a paste from a book, a paste
    of a whole `.md` file including its frontmatter, and a note
    picked out of the vault. The last two carry `---` headers and
    `[[wiki links]]`, and a model shown those will faithfully
    report that this writer's style involves YAML. */
export function cleanSample(raw: string): string {
  let text = raw.replace(/\r\n?/g, "\n");

  // A frontmatter block only counts at the very top of the text.
  const fm = text.match(/^---\n[\s\S]*?\n---\n?/);
  if (fm) text = text.slice(fm[0].length);

  text = stripWikiLinks(text);

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

export interface SampleCheck {
  ok: boolean;
  words: number;
  /** Blocking. Said the way a person would say it, never a rule number. */
  problem?: string;
  /** Worth knowing, not worth stopping for. */
  note?: string;
}

/** Is this enough to read a voice off? */
export function checkSample(text: string): SampleCheck {
  const words = countWords(text);

  if (words === 0) {
    return {
      ok: false,
      words,
      problem: "Paste some prose first, or pick a note from this project.",
    };
  }

  if (words < SAMPLE_MIN_WORDS) {
    return {
      ok: false,
      words,
      problem: `That is ${words} ${words === 1 ? "word" : "words"}. A voice does not show up until about ${SAMPLE_MIN_WORDS} — one scene, not one line. Anything read off this would be a guess dressed up as an analysis.`,
    };
  }

  // Notes, outlines and beat lists are the usual mis-paste. The style
  // read off a bullet list is an accurate description of a bullet list.
  const lines = text.split("\n").filter((l) => l.trim());
  const listy = lines.filter((l) => /^\s*([-*+•>#]|\d+[.)])\s/.test(l)).length;
  if (lines.length >= 4 && listy > lines.length / 2) {
    return {
      ok: true,
      words,
      note: "This reads as notes rather than prose — mostly headings and bullets. The style you get back will describe the outline, not the writing.",
    };
  }

  if (words > SAMPLE_MAX_WORDS) {
    return {
      ok: true,
      words,
      note: `Long sample — the first ${SAMPLE_MAX_WORDS.toLocaleString()} words are read, which is more than enough for a voice.`,
    };
  }

  if (words < SAMPLE_THIN_WORDS) {
    return {
      ok: true,
      words,
      note: "Enough to work with. A few more pages would sharpen it.",
    };
  }

  return { ok: true, words };
}

/** Cut to the ceiling at a boundary a reader would recognize.

    A sample that stops mid-sentence teaches the model that this
    writer abandons sentences, so the cut lands on a paragraph
    break where possible and a sentence end otherwise. */
export function trimSample(text: string, maxWords = SAMPLE_MAX_WORDS): string {
  const clean = text.trim();
  if (countWords(clean) <= maxWords) return clean;

  const paragraphs = clean.split(/\n{2,}/);
  const kept: string[] = [];
  let used = 0;
  for (const p of paragraphs) {
    const n = countWords(p);
    if (used > 0 && used + n > maxWords) break;
    kept.push(p);
    used += n;
    if (used >= maxWords) break;
  }

  let out = kept.join("\n\n").trim();

  // One paragraph longer than the whole budget — a wall of text with no
  // blank lines. Fall back to sentences, then to a hard word cut.
  if (countWords(out) > maxWords) {
    const words = out.split(/\s+/).slice(0, maxWords).join(" ");
    const lastStop = Math.max(
      words.lastIndexOf(". "),
      words.lastIndexOf("! "),
      words.lastIndexOf("? "),
      words.lastIndexOf(".”"),
      words.lastIndexOf("”"),
    );
    out = lastStop > words.length / 2 ? words.slice(0, lastStop + 1).trim() : words.trim();
  }

  return out;
}

/* ---------------- asking the model ---------------- */

/** The five things a style has to answer to be usable when drafting.
    Fewer than five and the description is a compliment; more and the
    model starts padding. The `ask` text is what goes in the prompt. */
export const STYLE_FIELDS: {
  key: keyof DerivedStyle;
  label: string;
  ask: string;
}[] = [
  {
    key: "summary",
    label: "Voice",
    ask: "One sentence naming the voice — who seems to be telling this, at what distance, in what mood.",
  },
  {
    key: "rhythm",
    label: "Sentence rhythm",
    ask: "Sentence length and shape: typical length, how much it varies, where the short ones land, paragraph size.",
  },
  {
    key: "diction",
    label: "Diction",
    ask: "Word choice and register: plain or ornate, concrete or abstract, era, and what the imagery is drawn from.",
  },
  {
    key: "habits",
    label: "Habits",
    ask: "Recurring moves: punctuation it leans on, how dialogue is handled, how much interiority, what it does with white space.",
  },
  {
    key: "avoid",
    label: "Avoid",
    ask: "What this writer never does — the things an imitation would get wrong by adding.",
  },
];

export interface StyleRequest {
  system: string;
  prompt: string;
  /** Reading prose back is a critique job, not a drafting one. */
  role: RoleId;
}

/** Build the analysis request.

    Two things the system prompt exists to prevent. First, praise:
    ask a model about prose and it will tell you the prose is
    evocative, which is worth nothing when the answer's whole job is
    to be pasted into a later prompt. Second, quotation: a style
    note that carries three sentences of someone else's novel will
    hand those sentences back to every draft that uses it. */
export function buildStyleRequest(sample: string, opts: { source?: string } = {}): StyleRequest {
  const shape = STYLE_FIELDS.map((f) => `${f.key.toUpperCase()}: ${f.ask}`).join("\n");
  const where = opts.source?.trim() ? ` (from “${opts.source.trim()}”)` : "";

  return {
    role: "critique",
    system: [
      "You analyse prose style. You are describing HOW a passage is written so that the description can be handed to a writing model later as instructions.",
      "Be concrete and specific. Name lengths, counts, tendencies. No praise, no marketing adjectives, no summary of what happens in the passage.",
      "Never quote the passage. Do not reproduce its sentences, phrases, character names, or plot — the description travels on its own and must not carry the source's words with it.",
      "Answer as exactly five labelled blocks, in the order given, each on its own line, with no preamble, no closing remarks and no markdown headings.",
      "If the passage is too short or is not prose, say so plainly on the first line instead of inventing an analysis.",
    ].join(" "),
    prompt: `Describe the style of this passage${where}.

Answer in exactly this shape:

${shape}

Passage:

${sample}`,
  };
}

/* ---------------- reading the answer back ---------------- */

export interface DerivedStyle {
  summary: string;
  rhythm: string;
  diction: string;
  habits: string;
  avoid: string;
}

export function emptyStyle(): DerivedStyle {
  return { summary: "", rhythm: "", diction: "", habits: "", avoid: "" };
}

/* Labels a model actually produces when asked for SUMMARY. Told to
   write one word, half of them write the synonym they would have
   chosen anyway, and a style thrown away over the word "VOICE" is a
   failure the writer would rightly find stupid. */
const LABELS: { key: keyof DerivedStyle; match: RegExp }[] = [
  { key: "summary", match: /^(summary|voice|overall|style)$/ },
  { key: "rhythm", match: /^(rhythm|sentence rhythm|sentences|rhythm and pacing|pacing|syntax)$/ },
  { key: "diction", match: /^(diction|word choice|vocabulary|register|language)$/ },
  { key: "habits", match: /^(habits|tics|patterns|recurring moves|moves|quirks)$/ },
  { key: "avoid", match: /^(avoid|avoids|never|what to avoid|does not)$/ },
];

/** Strip the decoration models add to a line they were told to leave
    plain: bullets, bold, numbering, wrapping quotes. */
function undress(line: string): string {
  return line
    .replace(/^\s*(?:[-*+•]|\d+[.)])\s*/, "")
    .replace(/^#{1,6}\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/^__|__$/g, "")
    .trim();
}

function tidyValue(value: string): string {
  let v = value.replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  v = v.replace(/^\*\*/, "").replace(/\*\*$/, "").trim();
  if (v.length > 1 && /^["“'](.*)["”']$/s.test(v)) v = v.slice(1, -1).trim();
  return v;
}

/** Turn a model's reply into a style, or admit it could not be done.

    `null` is a real answer here and the caller must show it as one.
    The alternative — filling the gaps with plausible sentences about
    sentence rhythm — would produce a style note indistinguishable
    from a real one, saved into the writer's vault, used to draft
    chapters. That is the exact failure this whole flow is built to
    refuse. */
export function parseStyleReply(reply: string): DerivedStyle | null {
  let text = reply.trim();
  if (!text) return null;

  // A fence around the whole reply, which several models add despite
  // being asked for plain lines.
  const fence = text.match(/^```[a-z]*\n([\s\S]*?)\n?```$/i);
  if (fence?.[1] !== undefined) text = fence[1].trim();

  const style = emptyStyle();
  let current: keyof DerivedStyle | null = null;
  const buffers: Partial<Record<keyof DerivedStyle, string[]>> = {};

  for (const rawLine of text.split("\n")) {
    const line = undress(rawLine);
    if (!line) continue;

    const labelled = line.match(/^([A-Za-z][A-Za-z ]{1,24}?)\s*[:\-–—]\s*(.*)$/);
    const name = labelled?.[1]?.trim().toLowerCase();
    const hit = name ? LABELS.find((l) => l.match.test(name)) : undefined;

    if (hit) {
      current = hit.key;
      buffers[current] ??= [];
      const rest = labelled?.[2]?.trim();
      if (rest) buffers[current]?.push(rest);
      continue;
    }

    // A continuation line under the label above it. Text before any
    // label at all is preamble the model was asked not to write.
    if (current) buffers[current]?.push(line);
  }

  for (const field of STYLE_FIELDS) {
    style[field.key] = tidyValue((buffers[field.key] ?? []).join(" "));
  }

  const filled = STYLE_FIELDS.filter((f) => style[f.key]).length;
  // The voice line plus at least one supporting observation. Less than
  // that is not a style, it is a fragment, and saving it would put a
  // near-empty note in the writer's Prompts folder.
  if (!style.summary || filled < 2) return null;

  return style;
}

/* ---------------- the note it becomes ---------------- */

/** One line, cut at a word boundary — for the frontmatter description
    that shows under the style's name in the assistant. */
export function oneLine(text: string, max = 160): string {
  const v = text.replace(/\s+/g, " ").trim();
  if (v.length <= max) return v;
  const cut = v.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, "")}…`;
}

/** Quote a frontmatter value only when leaving it bare would change
    its meaning. A model's summary contains colons and dashes often
    enough that an unquoted one is a corrupt file waiting to happen,
    and gray-matter fails the whole note rather than the one field. */
export function yamlString(value: string): string {
  const v = value.replace(/\s+/g, " ").trim();
  if (!v) return '""';
  const plain =
    /^[A-Za-z][\w .,!?'’()&\/–—-]*$/.test(v) && !/^(true|false|null|yes|no|on|off)$/i.test(v);
  if (plain) return v;
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** The prompt body a style becomes.

    It has to be a working template, not a description filed next to
    one: the assistant's "Writing style" list runs whatever is in the
    note, so a style that is only prose about prose would appear in
    the list and then do nothing when chosen. Same variables as every
    other prompt — {{scene}}, {{prose}}, {{guidance}}. */
export function styleTemplate(style: DerivedStyle): string {
  const observed = STYLE_FIELDS.filter((f) => style[f.key].trim())
    .map((f) => `- **${f.label}:** ${style[f.key].trim()}`)
    .join("\n");

  return `Continue "{{scene}}" in the voice described below.

${observed}

What is written so far:

{{prose}}

Direction from the writer (follow it if given):
{{guidance}}

Write only the prose. Match the voice as described rather than imitating any one sentence of it, and keep the manuscript's own tense and point of view.`;
}

export interface StyleNoteOptions {
  name: string;
  /** Where the sample came from, in the writer's terms. */
  source?: string;
  /** A plain date for the frontmatter. Passed in rather than read from
      the clock so this stays a pure function and the tests can prove
      what it writes. */
  derivedOn?: string;
}

/** The whole file, ready to write to disk. */
export function styleNoteMarkdown(style: DerivedStyle, opts: StyleNoteOptions): string {
  const lines = [
    "---",
    "type: prompt",
    `name: ${yamlString(opts.name)}`,
    `description: ${yamlString(oneLine(style.summary))}`,
  ];
  if (opts.source?.trim()) lines.push(`styleFrom: ${yamlString(opts.source)}`);
  if (opts.derivedOn?.trim()) lines.push(`styleDerivedOn: ${yamlString(opts.derivedOn)}`);
  lines.push("---");

  return `${lines.join("\n")}\n${styleTemplate(style)}\n`;
}

/* ---------------- naming it ---------------- */

function cleanLabel(source: string): string {
  return source
    .replace(/\.(md|txt|markdown)$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A name the writer will recognize in a dropdown six months later,
    and never one that collides with a style already in the vault —
    two prompts with the same title make the picker ambiguous and the
    second file would overwrite the first on disk. */
export function suggestStyleName(source: string, taken: string[] = []): string {
  const label = cleanLabel(source);
  const base = !label ? "My style" : /\bstyle\b/i.test(label) ? label : `${label} style`;

  const used = new Set(taken.map((t) => t.trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; n < 500; n++) {
    const candidate = `${base} ${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} ${Date.now()}`;
}

/** Where the file lands. Prompts/ is where the assistant already looks
    and where the built-in prompts live, so a derived style is a
    sibling of them rather than a special case. */
export function styleNotePath(name: string): string {
  const slug = name
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `Prompts/${slug || "Style"}.md`;
}
