/* Assertions for export fidelity — what a writer's formatting looks like
   once it leaves the app.

   Same shape as the other suites: silent unless something is wrong,
   non-zero exit when it is.

   The bug this suite exists for: every export used to write Markdown
   emphasis out literally, so the DOCX an agent opened said "*never*".
   The checks below don't trust the code that builds the files — they
   unzip the real DOCX and EPUB and read the XML inside, which is what
   Word and an e-reader will do. */

import { unzipSync, strFromU8 } from "fflate";
import { parseInline, plainText, isSceneBreak, runsToHtml, SCENE_BREAK } from "./src/export/inline";
import { toParagraphs, paragraphWords, type Manuscript } from "./src/export/compile";
import { runningHeader, toDocx, toEpub, toMarkdown } from "./src/export/formats";
import { readDocx } from "./src/import/docx";
import { splitIntoChapters } from "./src/import/manuscript";
import { DOMParser as XmlDomParser } from "@xmldom/xmldom";
import { zipSync, strToU8 } from "fflate";

// The importer uses the browser's DOMParser; node has none.
(globalThis as { DOMParser?: unknown }).DOMParser ??= XmlDomParser;

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

const runs = (s: string) => parseInline(s).map((r) => [r.text, r.italic ? "i" : "", r.bold ? "b" : ""].join("|"));

async function main(): Promise<void> {
  /* ---------------- emphasis ---------------- */

  check("plain text is one plain run", runs("It was dark."), ["It was dark.||"]);
  check("*italic*", runs("She would *never* go back."), ["She would ||", "never|i|", " go back.||"]);
  check("_italic_", runs("the _Wanderer_ sailed"), ["the ||", "Wanderer|i|", " sailed||"]);
  check("**bold**", runs("a **loud** noise"), ["a ||", "loud||b", " noise||"]);
  check("__bold__", runs("a __loud__ noise"), ["a ||", "loud||b", " noise||"]);
  check("***both***", runs("***Run.***"), ["Run.|i|b"]);
  check("italic inside bold", runs("**all *of* it**"), ["all ||b", "of|i|b", " it||b"]);
  check("bold inside italic", runs("*all **of** it*"), ["all |i|", "of|i|b", " it|i|"]);
  check("single-letter italic", runs("plan *B*"), ["plan ||", "B|i|"]);
  check("intraword asterisks", runs("un*frigging*believable"), ["un||", "frigging|i|", "believable||"]);
  check("snake_case is a word", runs("see file_name_here now"), ["see file_name_here now||"]);
  check("arithmetic stays arithmetic", runs("5 * 3 * 2"), ["5 * 3 * 2||"]);
  check("an unclosed asterisk stays literal", runs("a *stray mark"), ["a *stray mark||"]);
  check("escaped asterisks are literal", runs("\\*not italic\\*"), ["*not italic*||"]);
  check("escaped underscore is literal", runs("\\_x\\_"), ["_x_||"]);
  check("a sentinel smuggled in can't toggle anything", runs("a\uE002b"), ["ab||"]);
  check("plainText drops the marks", plainText("She would *never* go **back**."), "She would never go back.");
  check("html is escaped, emphasis becomes tags", runsToHtml(parseInline("*Tom & <Jerry>*")), "<em>Tom &amp; &lt;Jerry&gt;</em>");

  /* ---------------- scene breaks ---------------- */

  for (const b of ["***", "* * *", "---", "- - -", "___", "~~~", "#", "  #  ", "§"]) ok(`"${b}" is a scene break`, isSceneBreak(b));
  for (const p of ["# Chapter One", "**", "--", "It was *** loud", "#hashtag"]) ok(`"${p}" is not a scene break`, !isSceneBreak(p));

  /* ---------------- compile ---------------- */

  const body = [
    "***",
    "# A heading line",
    "",
    "She would *never* go back.",
    "",
    "#",
    "",
    "#",
    "",
    "Line one",
    "line two of the same paragraph.",
    "",
    "<!-- note to self: fix this -->",
    "",
    "See [[Halden's Reach]] and [the map](https://example.com/map).",
    "",
    "* * *",
  ].join("\n");
  const paras = toParagraphs(body);
  check("compile keeps emphasis, normalises and trims breaks, joins lines", paras, [
    "A heading line",
    "She would *never* go back.",
    SCENE_BREAK,
    "Line one line two of the same paragraph.",
    "See Halden's Reach and the map.",
  ]);
  check("word count ignores markup and breaks", paragraphWords(["She would *never* go back.", SCENE_BREAK, "**One** two."]), 7);

  /* ---------------- the files themselves ---------------- */

  const m: Manuscript = {
    title: "The Drift Below",
    author: "Wren Calloway",
    words: 9,
    chapters: [
      { title: "Harbour", words: 9, paragraphs: ["She would *never* go **back**.", SCENE_BREAK, "Morning came & went."] },
    ],
  };

  check("running header", runningHeader("Wren Calloway", "The Drift Below"), "Calloway / THE DRIFT BELOW / ");
  check("running header clips long titles", runningHeader("Ann Lee", "A Very Long Title Indeed"), "Lee / A VERY LONG / ");
  check("running header without an author", runningHeader("", "Drift"), "DRIFT / ");

  const md = toMarkdown(m).data as string;
  ok("markdown keeps its own emphasis", md.includes("She would *never* go **back**."));
  ok("markdown keeps the scene break", md.includes("\n* * *\n"));

  const epub = unzipSync(toEpub(m).data as Uint8Array);
  const chapter = strFromU8(epub["OEBPS/chapter1.xhtml"]!);
  ok("EPUB: italics are <em>", chapter.includes("<em>never</em>"));
  ok("EPUB: bold is <strong>", chapter.includes("<strong>back</strong>"));
  ok("EPUB: no literal asterisks around words", !/\*\w/.test(chapter.replace("* * *", "")));
  ok("EPUB: the scene break is a centred break", chapter.includes('<p class="break">* * *</p>'));
  ok("EPUB: the paragraph after a break is not indented", chapter.includes('<p class="first">Morning came &amp; went.</p>'));
  ok("EPUB: the break has a style", strFromU8(epub["OEBPS/style.css"]!).includes("p.break"));

  const docx = unzipSync((await toDocx(m)).data as Uint8Array);
  const doc = strFromU8(docx["word/document.xml"]!);
  ok("DOCX: no literal asterisks", !doc.includes("*never*") && !doc.includes("**back**"));
  const runXml = (word: string) => doc.match(new RegExp(`<w:r>(?:(?!<w:r>).)*?<w:t[^>]*>${word}</w:t>`, "s"))?.[0] ?? "";
  ok("DOCX: 'never' is an italic run", /<w:i\/>|<w:i w:val="(?:true|1)"\/>/.test(runXml("never")));
  ok("DOCX: 'back' is a bold run", /<w:b\/>|<w:b w:val="(?:true|1)"\/>/.test(runXml("back")));
  ok("DOCX: plain words are not italic", !/<w:i\/>/.test(runXml("She would ")));
  ok("DOCX: the scene break is a centred #", /<w:jc w:val="center"\/>(?:(?!<w:p>).)*?<w:t[^>]*>#<\/w:t>/s.test(doc));
  const headers = Object.keys(docx).filter((k) => /^word\/header\d*\.xml$/.test(k)).map((k) => strFromU8(docx[k]!));
  ok("DOCX: a running header with surname and title", headers.some((h) => h.includes("Calloway / THE DRIFT BELOW /")));
  ok("DOCX: the header carries a page-number field", headers.some((h) => /PAGE/.test(h)));
  ok("DOCX: the title page is exempt from it", /<w:titlePg\/>|<w:titlePg w:val="(?:true|1)"\/>/.test(doc));

  /* ---------------- import, and the round trip ---------------- */

  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const docxOf = (body: string) =>
    zipSync({ "word/document.xml": strToU8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`) });
  const run = (text: string, props = "") => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`;

  const split = readDocx(docxOf(`<w:p>${run("She said ")}${run("Hel", "<w:i/>")}${run("lo", "<w:i/>")}${run(" twice.")}</w:p>`));
  check("an italic word Word split across runs imports as one", split[0]?.text, "She said *Hello* twice.");
  const off = readDocx(docxOf(`<w:p>${run("plain", '<w:i w:val="0"/>')}${run(" ")}${run("bold", "<w:b/>")}</w:p>`));
  check("italic switched off stays plain; bold imports", off[0]?.text, "plain **bold**");

  const chapters = splitIntoChapters(readDocx((await toDocx(m)).data as Uint8Array));
  const harbour = chapters.find((c) => c.title === "Harbour");
  ok("round trip: the chapter comes back under its own title, without the heading's bold", !!harbour);
  ok("round trip: the exported DOCX imports with its italics", !!harbour?.body.includes("She would *never* go **back**."));
  ok("round trip: the scene break comes back as a break", !!harbour?.body.split(/\n\s*\n/).some((p) => isSceneBreak(p)));
  ok("round trip: the prose after it survives", !!harbour?.body.includes("Morning came & went."));

  if (failures > 0) {
    console.error(`\ntest-export: ${failures} of ${checks} checks failed`);
    process.exit(1);
  }
  console.log(`test-export: ${checks} checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
