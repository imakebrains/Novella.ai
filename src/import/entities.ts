/* ============================================================
   Finding the codex that's already in the prose

   The sharpest criticism of the competition: import a 40,000-word
   manuscript and you're asked to hand-enter the characters and
   places that are already written in the document you just gave it.

   This reads the prose and proposes the entries. It never creates
   anything on its own — the writer reviews a list and ticks what's
   real. A wrong guess must cost one click to dismiss, never a
   cleanup job.

   Pure string work: no model, no network, no DOM. It runs instantly
   on a whole novel and works with the machine offline, which is the
   entire premise of the app.
   ============================================================ */

export type EntityGuess = "character" | "location" | "unknown";

export interface EntityCandidate {
  name: string;
  count: number;
  guess: EntityGuess;
  /** Shorter forms that turned out to be the same person or place —
      "Wren" folded into "Wren Calloway". The vault resolves [[links]]
      through aliases, so recording them here is what makes a mention of
      the short name find the entry. */
  aliases: string[];
  /** A short quote showing where the guess came from, so the writer can
      judge it without opening the chapter. */
  evidence: string;
}

/* Words that start sentences constantly and would otherwise flood the
   list. Only ever applied to SINGLE-word candidates — a capitalized
   multi-word phrase is safe enough to keep. */
const SENTENCE_STARTERS = new Set([
  "the", "a", "an", "and", "but", "or", "so", "then", "now", "yet", "still",
  "he", "she", "it", "they", "we", "i", "you", "his", "her", "its", "their",
  "our", "my", "your", "him", "them", "us", "me",
  "this", "that", "these", "those", "there", "here", "what", "when", "where",
  "why", "how", "who", "which", "if", "as", "at", "in", "on", "of", "for",
  "from", "with", "without", "by", "to", "into", "onto", "up", "down", "out",
  "over", "under", "after", "before", "once", "until", "while", "because",
  "though", "although", "since", "unless", "no", "not", "nothing", "nobody",
  "something", "someone", "somewhere", "anything", "everything", "everyone",
  "one", "two", "three", "first", "last", "next", "each", "every", "all",
  "both", "some", "many", "much", "more", "most", "few", "less", "least",
  "yes", "well", "just", "only", "even", "never", "always", "sometimes",
  "perhaps", "maybe", "instead", "later", "soon", "finally", "suddenly",
  "outside", "inside", "above", "below", "behind", "beyond", "across",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
  "mr", "mrs", "ms", "dr", "sir", "madam", "lord", "lady", "god", "chapter",
]);

/** Phrases that are manuscript structure, not people or places. */
const STRUCTURAL_LEAD = /^(chapter|part|book|act|prologue|epilogue|interlude|volume|section|appendix)\b/i;

/** Titles that mark the following capitalized word as a person. */
const PERSON_TITLES = /\b(mr|mrs|ms|miss|dr|doctor|professor|captain|lieutenant|sergeant|colonel|general|lord|lady|sir|dame|king|queen|prince|princess|father|mother|brother|sister|uncle|aunt|saint|st)\.?\s+$/i;

/* Dialogue attribution runs both ways in fiction — `Wren said` and
   `said Wren` are equally common, and checking only one direction misses
   half the speakers in any manuscript. */
const SPEECH = "said|says|asked|asks|replied|answered|whispered|shouted|muttered|murmured|called|cried|snapped|laughed|sighed|nodded|shrugged|smiled|added|continued|began|repeated|breathed|growled|hissed";

/** `Wren said` — the verb follows the name. */
const SPEECH_VERB_AFTER = new RegExp(`^\\s*(${SPEECH})\\b`, "i");

/** `said Wren` — the verb precedes it. */
const SPEECH_VERB_BEFORE = new RegExp(`\\b(${SPEECH})\\s+$`, "i");

/** Prepositions that mark the following name as somewhere rather than someone. */
const PLACE_PREPS = /\b(in|at|to|from|toward|towards|across|near|outside|inside|through|into|past|beyond|around|above|below|leaving|reached|reaches|entered|enters)\s+$/i;

/** Suffixes that give a place away regardless of context. */
const PLACE_SUFFIX =
  /\b(street|road|lane|avenue|square|city|town|village|harbou?r|port|bay|isle|island|mountains?|valley|forest|wood|woods|river|lake|sea|ocean|hall|castle|keep|tower|temple|abbey|market|bridge|gate|reach|hollow|ridge|moor|fields?|inn|tavern)$/i;

/** Strip anything that isn't prose the reader would see. */
function cleanProse(text: string): string {
  return text
    .replace(/^---[\s\S]*?---/, "") // frontmatter
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, " ") // already-linked names
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_~`]/g, "");
}

interface Hit {
  index: number;
  sentenceInitial: boolean;
}

/** Propose codex entries found in the prose.

    `known` is every name the vault already resolves — those are filtered
    out, because proposing an entry that exists is noise. */
export function extractEntities(
  text: string,
  known: Iterable<string> = [],
  options: { minCount?: number } = {},
): EntityCandidate[] {
  const minCount = options.minCount ?? 2;
  const prose = cleanProse(text);
  const knownSet = new Set([...known].map((k) => k.trim().toLowerCase()));

  // Capitalized word, optionally continued by more capitalized words and
  // lowercase connectors ("Halden's Reach", "Order of the Vane").
  //
  // The connector is deliberately NOT \s+. That would span a blank line and
  // weld the end of one paragraph to the start of the next — a chapter
  // heading swallowing the first name beneath it, so "Chapter Four" plus
  // "Mira Vance" becomes one bogus phrase and the real name is lost. A
  // single newline is still allowed, because hard-wrapped manuscripts break
  // names across lines.
  const GAP = "(?:[ \\t]+|\\n(?!\\s*\\n))";
  const WORD = "[A-Z][a-z'’À-ɏ-]+";
  const re = new RegExp(
    `\\b${WORD}(?:${GAP}(?:of|the|de|van|von|da|di|le|la)${GAP}${WORD}|${GAP}${WORD})*`,
    "g",
  );

  const hits = new Map<string, Hit[]>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(prose))) {
    let name = m[0].trim().replace(/[’']s$/, "");
    if (!name) continue;

    // Drop a leading title so "Captain Vale" and "Vale" are one entry.
    // The index has to move with it: everything downstream slices the prose
    // around `index`, so leaving it pointing at "Doctor" would misread the
    // surrounding context and hand back a crooked evidence quote.
    let index = m.index;
    const withoutTitle = name.replace(
      /^(mr|mrs|ms|miss|dr|doctor|professor|captain|lieutenant|sergeant|colonel|general|lord|lady|sir|dame|king|queen|prince|princess|saint|st)\.?\s+/i,
      "",
    );
    if (withoutTitle && withoutTitle !== name && /^[A-Z]/.test(withoutTitle)) {
      index += name.length - withoutTitle.length;
      name = withoutTitle;
    }

    const before = prose.slice(Math.max(0, index - 60), index);
    // Sentence-initial means: nothing before it, or terminal punctuation
    // (or an opening quote) immediately before.
    const sentenceInitial = /(^|[.!?]["'”’)\]]?\s+|\n\s*|["'“(]\s*)$/.test(before);

    const list = hits.get(name) ?? [];
    list.push({ index, sentenceInitial });
    hits.set(name, list);
  }

  const out: EntityCandidate[] = [];
  for (const [name, list] of hits) {
    if (knownSet.has(name.toLowerCase())) continue;

    const words = name.split(/\s+/);
    const multiWord = words.length > 1;

    // A single word that ONLY ever appears at the start of a sentence is
    // almost certainly a common word, not a name. This one rule removes
    // the overwhelming majority of false positives.
    if (!multiWord) {
      if (SENTENCE_STARTERS.has(name.toLowerCase())) continue;
      if (list.every((h) => h.sentenceInitial)) continue;
    }

    // Structural headings ("Chapter Four", "Part Two") are frequent and
    // capitalized but never characters.
    if (multiWord && STRUCTURAL_LEAD.test(name)) continue;

    const { guess, evidence } = classify(name, list, prose);
    out.push({ name, count: list.length, guess, aliases: [], evidence });
  }

  // Resolve identity BEFORE applying the frequency cutoff. "Elias" appearing
  // once is below the bar on its own, but it is not a separate discovery —
  // it is another sighting of "Elias Thorne", and it carries the dialogue
  // tag that reveals both are a character. Cutting it first would throw that
  // evidence away and leave the full name unclassified.
  const merged = mergeShortForms(out);

  // A capitalized multi-word phrase is distinctive enough to trust from a
  // single sighting — a place named once in a novel still earns an entry.
  // A lone capitalized word needs to recur before it means anything.
  const kept = merged.filter((c) =>
    c.name.includes(" ") || c.aliases.length > 0 ? true : c.count >= minCount,
  );

  // Frequent names first — that's the order a writer wants to review in.
  return kept.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Fold "Elias" into "Elias Thorne".

    A novel refers to one character by several names, and proposing an entry
    per name would make the reviewer do the deduplication by hand. The full
    name becomes the entry and the short form becomes an alias, which is
    exactly the shape the vault already resolves links through.

    Only unambiguous merges happen: if two full names share a short form
    ("Elias Thorne" and "Mira Thorne" both matching "Thorne"), there is no
    right answer, so both are left alone for the writer to sort out. */
function mergeShortForms(candidates: EntityCandidate[]): EntityCandidate[] {
  const multi = candidates.filter((c) => c.name.includes(" "));
  const dropped = new Set<string>();

  for (const short of candidates) {
    if (short.name.includes(" ")) continue;
    const owners = multi.filter((m) =>
      m.name.split(/\s+/).some((w) => w.replace(/[’']s$/, "") === short.name),
    );
    if (owners.length !== 1) continue;

    const owner = owners[0]!;
    owner.aliases = [...owner.aliases, short.name];
    owner.count += short.count;
    // Whatever the short form revealed applies to the whole identity — the
    // dialogue tag on "Elias" is what tells us "Elias Thorne" is a person.
    if (owner.guess === "unknown") owner.guess = short.guess;
    // The short form is what the prose actually uses, so once it recurs its
    // evidence is the more telling quote.
    if (short.count > 1) owner.evidence = short.evidence;
    dropped.add(short.name);
  }

  return candidates.filter((c) => !dropped.has(c.name));
}

function classify(
  name: string,
  hits: Hit[],
  prose: string,
): { guess: EntityGuess; evidence: string } {
  let person = 0;
  let place = 0;
  let best = "";

  for (const hit of hits) {
    const before = prose.slice(Math.max(0, hit.index - 40), hit.index);
    const after = prose.slice(hit.index + name.length, hit.index + name.length + 40);

    let scoredHere = false;
    if (SPEECH_VERB_AFTER.test(after) || SPEECH_VERB_BEFORE.test(before)) {
      person += 2;
      scoredHere = true;
    }
    if (PERSON_TITLES.test(before)) {
      person += 2;
      scoredHere = true;
    }
    // Possessive followed by a body part or belonging reads as a person.
    if (/^[’']s\s+(hand|face|eyes?|voice|mouth|hair|shoulder|arm|head|heart|father|mother|sister|brother|daughter|son|wife|husband)\b/i.test(after)) {
      person += 2;
      scoredHere = true;
    }
    if (PLACE_PREPS.test(before)) {
      place += 1;
      scoredHere = true;
    }
    if (scoredHere && !best) {
      best = `…${before.trim()} ${name}${after.replace(/\s+/g, " ").trimEnd()}…`.trim();
    }
  }

  if (PLACE_SUFFIX.test(name)) place += 3;

  const guess: EntityGuess = person > place ? "character" : place > person ? "location" : "unknown";
  if (!best) {
    const h = hits[0]!;
    const start = Math.max(0, h.index - 40);
    best = `…${prose.slice(start, h.index + name.length + 40).replace(/\s+/g, " ").trim()}…`;
  }
  return { guess, evidence: best };
}
