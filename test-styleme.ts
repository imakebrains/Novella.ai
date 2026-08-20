/* Assertions for "Style me" — deriving a reusable writing style from a
   sample of prose.

   Same shape as test-roles.ts and test-format.ts: silent unless
   something is wrong, non-zero exit when it is.

   Why this file exists. The feature's one promise is that the style in
   your Prompts folder was actually read off prose you chose. Three
   things can quietly break that promise, and none of them need a model
   to be running to go wrong:

     1. The sample was never really prose — a frontmatter header, a
        bullet list, or four words — and the "analysis" is a guess.
     2. The model answered in a shape we could not read, and something
        plausible got saved anyway. `parseStyleReply` returning null is
        a load-bearing behaviour, not an edge case.
     3. The note we wrote is not a valid prompt note: broken YAML
        because a summary contained a colon, or a body that appears in
        the assistant's style list and then does nothing because it has
        no variables in it.

   Everything here runs with no network, no browser and no Ollama. The
   last section deliberately runs the finished note back through the
   real vault parser and the real prompt renderer, because "valid
   Markdown" and "a prompt that works" are different claims. */

import matter from "gray-matter";

import { parseNote } from "./src/core/vault";
import { renderTemplate, usedVariables } from "./src/ai/prompts";
import {
  SAMPLE_MAX_WORDS,
  SAMPLE_MIN_WORDS,
  STYLE_FIELDS,
  buildStyleRequest,
  checkSample,
  cleanSample,
  countWords,
  emptyStyle,
  oneLine,
  parseStyleReply,
  styleNoteMarkdown,
  styleNotePath,
  styleTemplate,
  suggestStyleName,
  trimSample,
  yamlString,
  type DerivedStyle,
} from "./src/ai/styleMe";

let failures = 0;
let checks = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

function ok(name: string, condition: boolean): void {
  checks++;
  if (!condition) {
    failures++;
    console.error(`FAIL  ${name}`);
  }
}

/* ---------------- material ---------------- */

/** A paragraph of ordinary prose, repeated to reach a given word count.
    Deliberately not a bullet list and not one sentence. */
function prose(words: number): string {
  const sentence =
    "The rain came in off the water and the harbour lights went soft behind it, and she stood there a while longer than she meant to. ";
  const per = countWords(sentence);
  const times = Math.ceil(words / per);
  const paragraphs: string[] = [];
  for (let i = 0; i < times; i++) {
    paragraphs.push(sentence.trim());
    if (i % 3 === 2) paragraphs.push("\n\n");
  }
  return paragraphs.join(" ").replace(/ \n\n /g, "\n\n");
}

const GOOD_REPLY = `SUMMARY: A close third-person narrator who stays a half-step behind the character and never explains her.
RHYTHM: Long compound sentences, twenty to forty words, broken by a four-word sentence at the end of each paragraph.
DICTION: Plain Anglo-Saxon vocabulary, concrete nouns, weather and shipping imagery, no abstractions.
HABITS: Comma splices used deliberately, dialogue unattributed once the speakers are established, paragraphs of three to five sentences.
AVOID: Adverbs on dialogue tags, similes, any word the character would not know.`;

/* ---------------- counting and cleaning ---------------- */

check("countWords: empty", countWords(""), 0);
check("countWords: whitespace only", countWords("  \n\t "), 0);
check("countWords: one", countWords("word"), 1);
check("countWords: newlines separate words", countWords("one\ntwo\n\nthree"), 3);
check("countWords: repeated spaces are one break", countWords("one    two"), 2);

check(
  "cleanSample: frontmatter at the top is dropped",
  cleanSample("---\ntype: chapter\nname: Chapter One\n---\nShe waited."),
  "She waited.",
);
check(
  "cleanSample: a --- that is not at the top is prose",
  cleanSample("She waited.\n\n---\n\nHe did not."),
  "She waited.\n\n---\n\nHe did not.",
);
check(
  "cleanSample: wiki links lose their brackets",
  cleanSample("[[Wren Calloway]] crossed the [[Long Quay|quay]]."),
  "Wren Calloway crossed the quay.",
);
check("cleanSample: CRLF is normalized", cleanSample("one\r\ntwo"), "one\ntwo");
check(
  "cleanSample: runs of blank lines collapse to one",
  cleanSample("one\n\n\n\n\ntwo"),
  "one\n\ntwo",
);
check("cleanSample: nothing at all stays nothing", cleanSample("   \n  "), "");
// A file that is frontmatter and nothing else has no prose in it, and
// must not be mistaken for a short sample.
check("cleanSample: frontmatter-only file empties out", cleanSample("---\ntype: prompt\n---\n"), "");

/* ---------------- is this enough to read a voice off ---------------- */

{
  const empty = checkSample("");
  ok("checkSample: empty is refused", !empty.ok);
  ok("checkSample: empty says what to do next", /paste|pick a note/i.test(empty.problem ?? ""));
  check("checkSample: empty counts zero words", empty.words, 0);

  const tiny = checkSample("She waited by the door.");
  ok("checkSample: a single line is refused", !tiny.ok);
  ok("checkSample: the refusal names the shortfall", (tiny.problem ?? "").includes("5"));
  ok(
    "checkSample: the refusal says why, not just no",
    /guess|voice does not show up/i.test(tiny.problem ?? ""),
  );

  const justUnder = checkSample(prose(SAMPLE_MIN_WORDS - 30));
  ok("checkSample: just under the floor is still refused", !justUnder.ok);

  const good = checkSample(prose(600));
  ok("checkSample: a real sample passes", good.ok);
  check("checkSample: a comfortable sample needs no caveat", good.note, undefined);
  check("checkSample: no problem on a passing sample", good.problem, undefined);

  const thin = checkSample(prose(200));
  ok("checkSample: a thin sample passes", thin.ok);
  ok("checkSample: a thin sample is flagged as thin", /sharpen|more pages/i.test(thin.note ?? ""));

  const long = checkSample(prose(SAMPLE_MAX_WORDS + 900));
  ok("checkSample: a long sample passes", long.ok);
  ok("checkSample: a long sample says it will be cut", /first/i.test(long.note ?? ""));
  ok("checkSample: the long note names the ceiling", (long.note ?? "").includes("2,500"));

  /* Long enough to clear the word floor, so what is being tested is the
     shape of the text and not its length. */
  const outlineLines = ["# Act One"];
  for (let i = 1; i <= 20; i++) {
    outlineLines.push(
      `- Beat ${i}: she goes back down to the quay and finds the harbourmaster has changed his story again`,
    );
  }
  const outline = checkSample(outlineLines.join("\n"));
  ok("checkSample: the outline fixture clears the word floor", countWords(outlineLines.join("\n")) > SAMPLE_MIN_WORDS);
  ok("checkSample: an outline is not blocked", outline.ok);
  ok(
    "checkSample: an outline is called an outline",
    /notes rather than prose|bullets/i.test(outline.note ?? ""),
  );

  // Prose that merely contains a couple of dashes is not an outline.
  const dashes = `${prose(500)}\n\n- one aside\n- another aside`;
  check("checkSample: two stray bullets do not make it an outline", checkSample(dashes).note, undefined);
}

/* ---------------- trimming ---------------- */

{
  const short = prose(300);
  check("trimSample: under the ceiling is untouched", trimSample(short), short.trim());

  const long = prose(SAMPLE_MAX_WORDS + 1200);
  const cut = trimSample(long);
  ok("trimSample: a long sample comes back shorter", countWords(cut) < countWords(long));
  ok("trimSample: a long sample stays near the ceiling", countWords(cut) <= SAMPLE_MAX_WORDS);
  ok("trimSample: a long sample is not gutted", countWords(cut) > SAMPLE_MAX_WORDS * 0.7);
  ok("trimSample: the cut lands on a sentence end", /[.!?”"]$/.test(cut));
  ok("trimSample: no trailing whitespace", cut === cut.trim());

  // The custom ceiling is what the caller asked for, not a suggestion.
  const small = trimSample(prose(500), 60);
  ok("trimSample: a custom ceiling is respected", countWords(small) <= 60);
  ok("trimSample: a custom ceiling still returns something", countWords(small) > 0);

  // One paragraph longer than the whole budget: the fallback path.
  const wall = "She waited. ".repeat(400).trim();
  const walled = trimSample(wall, 50);
  ok("trimSample: a wall of text is cut anyway", countWords(walled) <= 50);
  ok("trimSample: a wall of text is cut at a full stop", walled.endsWith("."));
  ok("trimSample: a wall of text is never cut mid-word", !/\bwaite$|\bwait$/.test(walled));

  // A single paragraph with no sentence ends at all — a hard cut is the
  // only option left, and it must still not split a word.
  const noStops = "word ".repeat(300).trim();
  const chopped = trimSample(noStops, 20);
  check("trimSample: no sentence ends still yields whole words", countWords(chopped), 20);
  ok("trimSample: no sentence ends yields no fragment", chopped.split(/\s+/).every((w) => w === "word"));
}

/* ---------------- the request ---------------- */

{
  const sample = prose(400);
  const req = buildStyleRequest(sample);

  check("request: reading prose back is a critique job", req.role, "critique");
  ok("request: the sample is actually in the prompt", req.prompt.includes(sample.slice(0, 60)));
  for (const field of STYLE_FIELDS) {
    ok(`request: asks for ${field.key.toUpperCase()}`, req.prompt.includes(field.key.toUpperCase()));
  }
  ok("request: forbids quoting the passage", /never quote/i.test(req.system));
  ok("request: forbids praise", /no praise/i.test(req.system));
  ok(
    "request: tells the model to refuse rather than invent",
    /instead of inventing/i.test(req.system),
  );
  ok("request: no source label when none was given", !req.prompt.includes("(from"));

  const named = buildStyleRequest(sample, { source: "Chapter Three" });
  ok("request: a named source is passed through", named.prompt.includes("Chapter Three"));
  const blank = buildStyleRequest(sample, { source: "   " });
  ok("request: a blank source is not passed through", !blank.prompt.includes("“"));
}

/* ---------------- reading the reply ---------------- */

{
  const style = parseStyleReply(GOOD_REPLY);
  ok("parse: a well-formed reply parses", style !== null);
  check(
    "parse: the summary survives whole",
    style?.summary,
    "A close third-person narrator who stays a half-step behind the character and never explains her.",
  );
  ok("parse: rhythm is filled", (style?.rhythm ?? "").includes("twenty to forty words"));
  ok("parse: diction is filled", (style?.diction ?? "").includes("Anglo-Saxon"));
  ok("parse: habits are filled", (style?.habits ?? "").includes("Comma splices"));
  ok("parse: avoid is filled", (style?.avoid ?? "").includes("Adverbs"));
}

check(
  "parse: bold labels and bullets are decoration, not data",
  parseStyleReply(
    [
      "- **SUMMARY:** A wry first-person narrator.",
      "- **RHYTHM:** Short sentences. Very short.",
      "- **DICTION:** Contemporary and profane.",
    ].join("\n"),
  )?.summary,
  "A wry first-person narrator.",
);

check(
  "parse: markdown headings are stripped too",
  parseStyleReply("## SUMMARY: A wry narrator.\n## RHYTHM: Short.")?.rhythm,
  "Short.",
);

check(
  "parse: an em dash separates a label from its value",
  parseStyleReply("SUMMARY — A wry narrator.\nRHYTHM — Short.")?.summary,
  "A wry narrator.",
);

check(
  "parse: a code fence around the whole reply is unwrapped",
  parseStyleReply("```\nSUMMARY: A wry narrator.\nRHYTHM: Short.\n```")?.summary,
  "A wry narrator.",
);

check(
  "parse: a fence with a language tag is unwrapped",
  parseStyleReply("```text\nSUMMARY: A wry narrator.\nRHYTHM: Short.\n```")?.rhythm,
  "Short.",
);

// The synonym problem: told to write SUMMARY, models write VOICE.
check(
  "parse: VOICE counts as the summary",
  parseStyleReply("VOICE: A wry narrator.\nSENTENCE RHYTHM: Short.")?.summary,
  "A wry narrator.",
);
check(
  "parse: SENTENCE RHYTHM counts as rhythm",
  parseStyleReply("VOICE: A wry narrator.\nSENTENCE RHYTHM: Short.")?.rhythm,
  "Short.",
);
check(
  "parse: WORD CHOICE counts as diction",
  parseStyleReply("Voice: A wry narrator.\nWord choice: Blunt.")?.diction,
  "Blunt.",
);
check(
  "parse: labels are case-insensitive",
  parseStyleReply("summary: A wry narrator.\nhabits: Repeats itself.")?.habits,
  "Repeats itself.",
);

check(
  "parse: a wrapped value continues onto the next line",
  parseStyleReply(
    "SUMMARY: A wry narrator\nwho will not be pinned down.\nRHYTHM: Short.",
  )?.summary,
  "A wry narrator who will not be pinned down.",
);

check(
  "parse: a preamble before the first label is discarded",
  parseStyleReply("Sure! Here is the analysis you asked for:\n\nSUMMARY: A wry narrator.\nRHYTHM: Short.")
    ?.summary,
  "A wry narrator.",
);

check(
  "parse: wrapping quotes come off a value",
  parseStyleReply('SUMMARY: "A wry narrator."\nRHYTHM: Short.')?.summary,
  "A wry narrator.",
);

/* The refusals. Each of these must come back null so the caller shows
   the writer what the model actually said instead of saving a style. */
check("parse: an empty reply is null", parseStyleReply(""), null);
check("parse: whitespace is null", parseStyleReply("   \n  "), null);
check(
  "parse: an unstructured essay is null",
  parseStyleReply("This passage is beautifully evocative and rich with sensory detail."),
  null,
);
check(
  "parse: a refusal is null, not a style",
  parseStyleReply("That passage is too short for me to describe a style from."),
  null,
);
check(
  "parse: a summary with nothing under it is null",
  parseStyleReply("SUMMARY: A wry narrator."),
  null,
);
check(
  "parse: observations with no voice line are null",
  parseStyleReply("RHYTHM: Short.\nDICTION: Blunt.\nHABITS: Repeats."),
  null,
);
check(
  "parse: an empty summary label is null",
  parseStyleReply("SUMMARY:\nRHYTHM: Short.\nDICTION: Blunt."),
  null,
);
check(
  "parse: labels for something else entirely are null",
  parseStyleReply("THEME: Loss.\nSETTING: A harbour town.\nPLOT: She stays."),
  null,
);

/* ---------------- one line, and YAML ---------------- */

check("oneLine: a short line is left alone", oneLine("A wry narrator."), "A wry narrator.");
check("oneLine: newlines become spaces", oneLine("A wry\nnarrator."), "A wry narrator.");
ok("oneLine: a long line is cut", oneLine("word ".repeat(80), 40).length <= 41);
ok("oneLine: a cut line is marked as cut", oneLine("word ".repeat(80), 40).endsWith("…"));
ok(
  "oneLine: a cut never splits a word",
  !/\bwor…$/.test(oneLine("word ".repeat(80), 40)),
);

check("yaml: a plain phrase stays bare", yamlString("A wry narrator"), "A wry narrator");
check("yaml: empty becomes an empty string", yamlString(""), '""');
check("yaml: a colon forces quoting", yamlString("Voice: wry"), '"Voice: wry"');
check("yaml: a leading hash forces quoting", yamlString("#1 voice"), '"#1 voice"');
check("yaml: a leading dash forces quoting", yamlString("- wry"), '"- wry"');
check("yaml: an inner quote is escaped", yamlString('She said "no"'), '"She said \\"no\\""');
check("yaml: a backslash is escaped", yamlString("back\\slash"), '"back\\\\slash"');
check("yaml: a bare yes is quoted so it stays a string", yamlString("yes"), '"yes"');
check("yaml: a bare number is quoted", yamlString("1984"), '"1984"');
check("yaml: newlines are flattened", yamlString("one\ntwo"), "one two");

/* ---------------- the template it becomes ---------------- */

{
  const style = parseStyleReply(GOOD_REPLY) as DerivedStyle;
  const template = styleTemplate(style);

  // A style that appears in the assistant's list and then does nothing
  // when chosen is worse than no style at all.
  ok("template: uses {{scene}}", template.includes("{{scene}}"));
  ok("template: uses {{prose}}", template.includes("{{prose}}"));
  ok("template: uses {{guidance}}", template.includes("{{guidance}}"));
  check(
    "template: the variables are the ones the prompt library knows",
    usedVariables(template).sort(),
    ["guidance", "prose", "scene"],
  );

  for (const field of STYLE_FIELDS) {
    ok(`template: carries the ${field.key} observation`, template.includes(style[field.key]));
    ok(`template: labels ${field.key} in the writer's words`, template.includes(field.label));
  }
  ok("template: keeps the manuscript's tense and POV", /tense and point of view/i.test(template));

  const partial = { ...emptyStyle(), summary: "A wry narrator.", rhythm: "Short." };
  const thin = styleTemplate(partial);
  ok("template: an empty field is left out entirely", !thin.includes("Diction"));
  ok("template: a filled field is still there", thin.includes("Sentence rhythm"));
  ok("template: no empty bullet is left behind", !/\*\*[A-Za-z ]+:\*\*\s*$/m.test(thin));

  // The renderer is the real one from the prompt library: proof the
  // saved style behaves like every other prompt at draft time.
  const rendered = renderTemplate(template, {
    scene: "Chapter Three",
    prose: "She waited by the door.",
    guidance: "the storm hits mid-conversation",
  });
  ok("template: renders the scene title", rendered.includes("Chapter Three"));
  ok("template: renders the prose so far", rendered.includes("She waited by the door."));
  ok("template: renders the writer's direction", rendered.includes("the storm hits"));
  ok("template: nothing is left unsubstituted", !rendered.includes("{{"));
}

/* ---------------- the note it becomes ---------------- */

{
  const style = parseStyleReply(GOOD_REPLY) as DerivedStyle;
  const md = styleNoteMarkdown(style, {
    name: "Chapter Three style",
    source: "Chapter Three",
    derivedOn: "2026-08-20",
  });

  const parsed = matter(md);
  check("note: it is a prompt note", parsed.data.type, "prompt");
  check("note: the name is the title", parsed.data.name, "Chapter Three style");
  check("note: it remembers where it came from", parsed.data.styleFrom, "Chapter Three");
  check("note: it remembers when", parsed.data.styleDerivedOn, "2026-08-20");
  ok("note: the description is the voice, in one line", String(parsed.data.description).length <= 161);
  ok("note: the body is the template", parsed.content.includes("{{prose}}"));

  // Through the real vault parser, because that is what the app will do
  // with this file the moment the folder is reopened.
  const note = parseNote(styleNotePath("Chapter Three style"), md);
  check("note: the vault reads it as a prompt", note.type, "prompt");
  check("note: the vault titles it correctly", note.title, "Chapter Three style");
  ok("note: the vault keeps the body", note.body.includes("{{scene}}"));

  const bare = styleNoteMarkdown(style, { name: "My style" });
  ok("note: no source line when there is no source", !bare.includes("styleFrom"));
  ok("note: no date line when no date was given", !bare.includes("styleDerivedOn"));

  // The frontmatter-breaking case this exists to survive: a model
  // summary with a colon in it, which unquoted takes the whole file out.
  const colonish: DerivedStyle = {
    ...emptyStyle(),
    summary: 'Close third: wry, and unafraid of the word "no".',
    rhythm: "Short.",
  };
  const risky = styleNoteMarkdown(colonish, { name: "Risky: a style", source: 'a book called "Quay"' });
  const reparsed = matter(risky);
  check("note: a colon in the summary survives", reparsed.data.description, colonish.summary);
  check("note: a colon in the name survives", reparsed.data.name, "Risky: a style");
  check("note: quotes in the source survive", reparsed.data.styleFrom, 'a book called "Quay"');
  check(
    "note: the vault agrees about the risky one",
    parseNote(styleNotePath("Risky a style"), risky).title,
    "Risky: a style",
  );
}

/* ---------------- naming and filing ---------------- */

check("name: a note title becomes a style name", suggestStyleName("Chapter Three"), "Chapter Three style");
check("name: nothing to go on falls back", suggestStyleName(""), "My style");
check("name: whitespace is nothing to go on", suggestStyleName("   "), "My style");
check(
  "name: a label that already says style is not doubled",
  suggestStyleName("House style"),
  "House style",
);
check(
  "name: a filename loses its extension",
  suggestStyleName("favourite-passage.txt"),
  "favourite-passage style",
);
check("name: underscores become spaces", suggestStyleName("my_best_chapter"), "my best chapter style");
check(
  "name: a taken name gets a number",
  suggestStyleName("Chapter Three", ["Chapter Three style"]),
  "Chapter Three style 2",
);
check(
  "name: it keeps counting",
  suggestStyleName("Chapter Three", ["Chapter Three style", "Chapter Three style 2"]),
  "Chapter Three style 3",
);
check(
  "name: collision is case-insensitive, because the filesystem is",
  suggestStyleName("Chapter Three", ["chapter three STYLE"]),
  "Chapter Three style 2",
);
check(
  "name: an unrelated prompt does not push it along",
  suggestStyleName("Chapter Three", ["Email writer", "Paragraph mode"]),
  "Chapter Three style",
);

check("path: it lands in Prompts", styleNotePath("Chapter Three style"), "Prompts/Chapter-Three-style.md");
check("path: punctuation is dropped from the filename", styleNotePath("Risky: a style"), "Prompts/Risky-a-style.md");
check("path: a name of pure punctuation still yields a file", styleNotePath("!!!"), "Prompts/Style.md");
ok("path: always a markdown file", styleNotePath("anything").endsWith(".md"));

/* ---------------- the whole way through ---------------- */

/* Sample in, note out, with no model and no store: the shape of a real
   run, so a change anywhere along it has to keep the end usable. */
{
  const raw = `---\ntype: chapter\nname: Chapter Three\n---\n${prose(700)}\n\nShe thought of [[Wren Calloway]] and said nothing.`;
  const sample = trimSample(cleanSample(raw));

  ok("end to end: the header is gone", !sample.startsWith("---"));
  ok("end to end: the wiki link is gone", !sample.includes("[["));
  ok("end to end: the sample passes the check", checkSample(sample).ok);

  const req = buildStyleRequest(sample, { source: "Chapter Three" });
  ok("end to end: the request carries the cleaned sample", req.prompt.includes("Wren Calloway"));

  const style = parseStyleReply(GOOD_REPLY);
  ok("end to end: the reply parses", style !== null);

  const name = suggestStyleName("Chapter Three", ["Chapter Three style"]);
  const md = styleNoteMarkdown(style as DerivedStyle, { name, source: "Chapter Three" });
  const note = parseNote(styleNotePath(name), md);

  check("end to end: it is a prompt note", note.type, "prompt");
  check("end to end: it took the free name", note.title, "Chapter Three style 2");
  check("end to end: it is filed under Prompts", note.path, "Prompts/Chapter-Three-style-2.md");
  ok("end to end: choosing it would actually draft", usedVariables(note.body).includes("prose"));
}

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks failed.`);
  process.exit(1);
}

console.log(`style me tests: ${checks} checks passed`);
