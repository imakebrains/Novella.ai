/* Assertions for the project preview slideshow.

   Same shape as test-units.ts: silent when it passes, non-zero exit when
   it doesn't. Everything under test is pure — no filesystem, no DOM — so
   the interesting cases (a vault on a dead drive, a file that won't read,
   a chapter nobody has written yet) are just inputs here.

   The rule these tests exist to defend: a preview never invents content,
   and never costs what opening the project costs. */

import {
  MAX_CODEX_ENTRIES,
  MAX_CODEX_READS,
  OPENING_CHARS,
  buildFrames,
  codexKindOf,
  codexPaths,
  comparePaths,
  countWords,
  frameLabel,
  frontMatterField,
  isCodexPath,
  isNotePath,
  isProsePath,
  isVaultFile,
  openingParagraphs,
  openingPath,
  planReads,
  stripFrontmatter,
  truncateProse,
  vaultFiles,
  type PreviewFrame,
} from "./src/ui/projectPreview";
import { SEED_FILES } from "./src/seed/seedWorld";
import { PRESETS, presetById } from "./src/seed/presets";

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

function frameOf(frames: PreviewFrame[], kind: PreviewFrame["kind"]): PreviewFrame | undefined {
  return frames.find((f) => f.kind === kind);
}

/* ---------- which files are what ---------- */

{
  ok("vault: markdown counts", isVaultFile("Manuscript/01-One.md"));
  ok("vault: other formats don't", !isVaultFile("Manuscript/cover.jpg"));
  ok("vault: dotfolders are not the book", !isVaultFile(".novella/history/x.md"));
  ok("vault: nested dotfolders either", !isVaultFile("Manuscript/.trash/old.md"));

  ok("kind: manuscript is prose", isProsePath("Manuscript/Act-1/01-The-Compass.md"));
  ok("kind: a series book folder is prose", isProsePath("Book-2/01-Chapter-One.md"));
  ok("kind: a numbered file at the root is prose", isProsePath("01-Chapter-One.md"));
  ok("kind: codex is not prose", !isProsePath("Codex/Characters/Wren.md"));
  ok("kind: notes are not prose", !isProsePath("Notes/Revision-Checklist.md"));
  ok("kind: an unnumbered stray is neither", !isProsePath("README.md"));

  ok("kind: characters are codex", isCodexPath("Codex/Characters/Wren-Calloway.md"));
  ok("kind: a bare Characters folder is codex too", isCodexPath("Characters/Wren.md"));
  ok("kind: notes are notes", isNotePath("Notes/Story-Questions.md"));

  check("order: 2 sorts before 10", comparePaths("Ch-2.md", "Ch-10.md") < 0, true);
  check(
    "order: reading order across acts",
    vaultFiles(["Manuscript/Act-2/01-b.md", "Manuscript/Act-1/10-a.md", "Manuscript/Act-1/2-a.md"]),
    ["Manuscript/Act-1/2-a.md", "Manuscript/Act-1/10-a.md", "Manuscript/Act-2/01-b.md"],
  );

  check(
    "opening: the first chapter in reading order",
    openingPath(["Notes/x.md", "Manuscript/10-Ten.md", "Manuscript/02-Two.md", "Codex/Characters/A.md"]),
    "Manuscript/02-Two.md",
  );
  check("opening: no prose, no guess", openingPath(["Notes/x.md", "Codex/Lore/y.md"]), null);

  check("codex kind: from the folder", codexKindOf("Codex/Characters/Wren.md"), "Character");
  check("codex kind: from the file's own type", codexKindOf("Codex/x.md", "---\ntype: location\n---\n"), "Location");
  check("codex kind: an unknown type is shown as written", codexKindOf("Codex/x.md", "---\ntype: ship\n---\n"), "Ship");
  check("codex kind: unclassifiable stays generic", codexKindOf("Codex/x.md"), "Codex");

  check(
    "codex order: characters lead, then places, then lore",
    codexPaths(["Codex/Lore/Drift.md", "Codex/Locations/Reach.md", "Codex/Characters/Wren.md"]),
    ["Codex/Characters/Wren.md", "Codex/Locations/Reach.md", "Codex/Lore/Drift.md"],
  );
}

/* ---------- text handling ---------- */

{
  check(
    "frontmatter: stripped",
    stripFrontmatter("---\ntype: chapter\nname: One\n---\nThe compass lied."),
    "The compass lied.",
  );
  check("frontmatter: an empty block still strips", stripFrontmatter("---\n---\nBody."), "Body.");
  check("frontmatter: a file without one is untouched", stripFrontmatter("Just prose."), "Just prose.");
  check("frontmatter: CRLF is not special", stripFrontmatter("---\r\ntype: x\r\n---\r\nBody."), "Body.");
  check("frontmatter: field read", frontMatterField("---\nname: Wren Calloway\n---\nx", "name"), "Wren Calloway");
  check(
    "frontmatter: quotes come off",
    frontMatterField('---\nname: "Book 1 — Chapter One"\n---\nx', "name"),
    "Book 1 — Chapter One",
  );
  check("frontmatter: a missing field is null", frontMatterField("---\ntype: x\n---\ny", "name"), null);
  check("frontmatter: a bodyless file doesn't throw", frontMatterField("no frontmatter", "name"), null);

  check("words: counted", countWords("  one two   three \n four "), 4);
  check("words: nothing is zero", countWords("   "), 0);

  check("truncate: short prose is left alone", truncateProse("A short line.", 40), "A short line.");
  ok("truncate: long prose ends in an ellipsis", truncateProse("a".repeat(50) + " and more words here", 30).endsWith("…"));
  ok("truncate: never exceeds the budget by much", truncateProse("word ".repeat(200), 40).length <= 41);
  ok("truncate: never splits a word", !/\bwor…$/.test(truncateProse("word ".repeat(200), 42)));

  const chapter = `---
type: chapter
name: The Compass That Lies
---
# Chapter One

The needle pointed at nothing she recognised.

- [ ] fix the ending

She walked anyway, because the alternative was standing still.

A third paragraph nobody asked for.`;

  const paras = openingParagraphs(chapter);
  ok("opening: headings are not prose", paras.every((p) => !p.startsWith("#")));
  ok("opening: checklists are not prose", paras.every((p) => !p.includes("[ ]")));
  ok("opening: real sentences survive", paras[0]?.startsWith("The needle pointed") === true);
  ok("opening: capped at three paragraphs", openingParagraphs(chapter).length <= 3);
  ok(
    "opening: the whole excerpt stays preview-length",
    openingParagraphs("x ".repeat(4000)).join(" ").length <= OPENING_CHARS + 8,
  );
  check("opening: an empty chapter offers nothing", openingParagraphs("---\ntype: chapter\n---\n"), []);
  check("opening: a heading-only file offers nothing", openingParagraphs("# Title\n\n## Later\n"), []);
}

/* ---------- the read plan: cheap by construction ---------- */

{
  const bigVault = [
    ...Array.from({ length: 300 }, (_, i) => `Manuscript/${String(i + 1).padStart(3, "0")}-Chapter.md`),
    ...Array.from({ length: 120 }, (_, i) => `Codex/Characters/Person-${i}.md`),
    ...Array.from({ length: 40 }, (_, i) => `Notes/Note-${i}.md`),
  ];
  const plan = planReads(bigVault);
  ok("plan: a 460-file vault is still a handful of reads", plan.reads.length <= 1 + MAX_CODEX_READS);
  check("plan: the opening is chapter one", plan.opening, "Manuscript/001-Chapter.md");
  ok("plan: every planned read is a real file", plan.reads.every((p) => bigVault.includes(p)));
  ok("plan: no duplicates", new Set(plan.reads).size === plan.reads.length);

  check("plan: an empty folder reads nothing", planReads([]).reads, []);
  check(
    "plan: a codex-only project still reads its codex",
    planReads(["Codex/Characters/A.md"]).reads,
    ["Codex/Characters/A.md"],
  );
}

/* ---------- frames ---------- */

{
  const seedPaths = SEED_FILES.map(([path]) => path);
  const plan = planReads(seedPaths);
  const contents = new Map(SEED_FILES.filter(([path]) => plan.reads.includes(path)));
  const frames = buildFrames({ paths: seedPaths, cover: null, contents });

  check("frames: no cover, no cover frame", frameOf(frames, "cover"), undefined);
  check(
    "frames: the demo world tells its story in order",
    frames.map((f) => f.kind),
    ["opening", "codex", "stats"],
  );

  const opening = frameOf(frames, "opening");
  ok("frames: the opening quotes the real first chapter", opening?.kind === "opening" && opening.path === "Manuscript/Act-1/01-The-Compass-That-Lies.md");
  let openingWords: number | null = null;
  if (opening?.kind === "opening") {
    openingWords = opening.words;
    const raw = SEED_FILES.find(([p]) => p === opening.path)?.[1] ?? "";
    const body = stripFrontmatter(raw);
    // Line wrapping is the only thing the preview changes about the prose,
    // so compare against a whitespace-flattened copy of the real file.
    const flat = body.replace(/\s+/g, " ");
    ok(
      "frames: every previewed word is in the file",
      opening.paragraphs.every((p) => flat.includes(p.replace(/…$/, "").trim())),
    );
    ok("frames: the chapter's own name is used", opening.title === "The Compass That Lies");
    ok("frames: the word count is the file's", opening.words === countWords(body));
  }

  const codex = frameOf(frames, "codex");
  ok("frames: the codex frame lists what the vault holds", codex?.kind === "codex" && codex.total === 4);
  if (codex?.kind === "codex") {
    ok("frames: codex entries never exceed the cap", codex.entries.length <= MAX_CODEX_ENTRIES);
    ok(
      "frames: only the files we read carry a quote",
      codex.entries.filter((e) => e.line !== null).length <= MAX_CODEX_READS,
    );
    ok("frames: characters are named first", codex.entries[0]?.kind === "Character");
  }

  const stats = frameOf(frames, "stats");
  if (stats?.kind === "stats") {
    check("frames: chapters counted from the file list", stats.chapters, 3);
    check("frames: codex counted from the file list", stats.codex, 4);
    check("frames: notes counted from the file list", stats.notes, 1);
    check("frames: every file is accounted for", stats.files, SEED_FILES.length);
    ok("frames: the word count is the opening's, and it says so", stats.openingWords === openingWords);
  }
}

/* ---------- frames a project can't fill are skipped ---------- */

{
  check("skip: an empty project has no frames at all", buildFrames({ paths: [], cover: null, contents: new Map() }), []);

  // Every preset scaffolds chapters with no prose in them. A preview must
  // not pretend otherwise — the frame simply isn't offered.
  for (const preset of PRESETS) {
    const paths = preset.files.map(([p]) => p);
    const contents = new Map(preset.files);
    const frames = buildFrames({ paths, cover: null, contents });
    ok(`skip: ${preset.id} shows no prose it doesn't have`, !frames.some((f) => f.kind === "opening"));
    ok(`skip: ${preset.id} never fabricates a cover`, !frames.some((f) => f.kind === "cover"));
    ok(`skip: ${preset.id} still counts what it has`, frames.some((f) => f.kind === "stats"));
  }

  // A blank preset has one empty chapter and nothing else: counts only.
  check(
    "skip: the blank preset is one honest stat frame",
    buildFrames({
      paths: presetById("blank").files.map(([p]) => p),
      cover: null,
      contents: new Map(presetById("blank").files),
    }).map((f) => f.kind),
    ["stats"],
  );

  // A read that failed (file absent from `contents`) must degrade to a
  // missing frame, never to an exception or a blank quote.
  const unread = buildFrames({
    paths: ["Manuscript/01-One.md", "Codex/Characters/Wren.md"],
    cover: null,
    contents: new Map(),
  });
  ok("skip: an unreadable chapter drops its frame", !unread.some((f) => f.kind === "opening"));
  const codex = frameOf(unread, "codex");
  ok("skip: an unreadable codex still names its entries", codex?.kind === "codex" && codex.entries[0]?.title === "Wren");
  ok("skip: an unreadable codex quotes nothing", codex?.kind === "codex" && codex.entries[0]?.line === null);

  // Malformed input is a preview problem, not a crash.
  const junk = buildFrames({
    paths: ["Manuscript/01-One.md"],
    cover: null,
    contents: new Map([["Manuscript/01-One.md", "---\nname: [unclosed\ntype:\n"]]),
  });
  ok("skip: broken frontmatter still yields frames", junk.length > 0);
}

/* ---------- covers ---------- */

{
  const withCover = buildFrames({
    paths: ["Manuscript/01-One.md"],
    cover: "data:image/jpeg;base64,AAAA",
    contents: new Map([["Manuscript/01-One.md", "---\ntype: chapter\n---\nReal words."]]),
  });
  check("cover: a real cover leads the slideshow", withCover[0]?.kind, "cover");
  check(
    "cover: and the rest follows in order",
    withCover.map((f) => f.kind),
    ["cover", "opening", "stats"],
  );
  ok("label: every frame can name itself", withCover.every((f) => frameLabel(f).length > 0));
  ok("label: frames are distinct enough for dots", new Set(withCover.map((f) => f.kind)).size === withCover.length);
}

/* ---------- report ---------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`project preview: ${checks} checks passed`);
