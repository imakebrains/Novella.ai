/* Assertions for importing from Scrivener: the RTF reader and the
   binder-to-book mapping (src/import/rtf.ts, src/import/scrivener.ts).

   Silent unless something is wrong, non-zero exit when it is. RTF here
   is written with String.raw so every backslash in the source is the
   backslash RTF sees — a heredoc or a normal string literal would eat
   them, which is how a regex in this repo once lost its \b. */

import { DOMParser as XmlDomParser } from "@xmldom/xmldom";
import { strToU8 } from "fflate";
import { rtfToParagraphs } from "./src/import/rtf";
import { readScrivener } from "./src/import/scrivener";

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

/* A backslash built at runtime. \u sequences written literally into this
   file were converted to the characters they name on the way to disk,
   so the RTF unicode cases spell their backslash through this instead. */
const B = String.fromCharCode(92);
const HEAD = String.raw`{\rtf1\ansi\ansicpg1252\cocoartf2709{\fonttbl\f0\fnil\fcharset0 Palatino-Roman;}{\colortbl;\red255\green255\blue255;}{\*\expandedcolortbl;;}\pard\f0\fs26 `;
const rtf = (body: string) => `${HEAD}${body}}`;

/* ---------------- RTF ---------------- */

check("paragraphs, and the font table never leaks", rtfToParagraphs(rtf(String.raw`It was dark.\par And cold.\par`)), ["It was dark.", "And cold."]);
check("italic group", rtfToParagraphs(rtf(String.raw`She would {\i never} go back.\par`)), ["She would *never* go back."]);
check("italic toggles", rtfToParagraphs(rtf(String.raw`She would \i never\i0  go back.\par`)), ["She would *never* go back."]);
check("bold and both", rtfToParagraphs(rtf(String.raw`{\b loud} and {\b\i louder}\par`)), ["**loud** and ***louder***"]);
check("\\plain resets", rtfToParagraphs(rtf(String.raw`\i\b gone\plain  back\par`)), ["***gone*** back"]);
check("code-page quotes and accents", rtfToParagraphs(rtf(String.raw`It\'92s a caf\'e9.\par`)), ["It’s a café."]);
check("unicode with its fallback dropped", rtfToParagraphs(rtf(String.raw`Wait${B}u8212?what${B}par`)), ["Wait—what"]);
check("unicode with no fallback", rtfToParagraphs(rtf(String.raw`${B}uc0${B}u8220 Hi${B}u8221 ${B}par`)), ["“Hi”"]);
check("named punctuation", rtfToParagraphs(rtf(String.raw`\ldblquote Go\rdblquote \emdash now.\par`)), ["“Go”—now."]);
check("escaped braces and backslash", rtfToParagraphs(rtf(String.raw`a \{b\} c\\d\par`)), ["a {b} c\\d"]);
check("Scrivener's own extensions are skipped", rtfToParagraphs(rtf(String.raw`{\*\Scrv_annot secret note}Kept.\par`)), ["Kept."]);
check("a link keeps its words, not its target", rtfToParagraphs(rtf(String.raw`See {\field{\*\fldinst{HYPERLINK "https://x.test"}}{\fldrslt the map}}.\par`)), ["See the map."]);
check("empty paragraphs are spacing, not content", rtfToParagraphs(rtf(String.raw`One.\par\par\par Two.\par`)), ["One.", "Two."]);
check("raw newlines in the source are not text", rtfToParagraphs(rtf("One\nline.\\par")), ["Oneline."]);

/* ---------------- Scrivener 3 binder ---------------- */

const item = (uuid: string, type: string, title: string, children = "", include = true) =>
  `<BinderItem UUID="${uuid}" Type="${type}"><Title>${title}</Title>${include ? "" : "<MetaData><IncludeInCompile>No</IncludeInCompile></MetaData>"}${children ? `<Children>${children}</Children>` : ""}</BinderItem>`;

const scrivx = `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0"><Binder>
${item("DRAFT", "DraftFolder", "Manuscript",
  item("CH1", "Folder", "Chapter One",
    item("S1", "Text", "Arrival") + item("S2", "Text", "The Harbour") + item("X", "Text", "Cut scene", "", false) + item("GONE", "Text", "Lost")) +
  item("INT", "Text", "Interlude") +
  item("P2", "Folder", "Part Two",
    item("CH3", "Folder", "The Crossing", item("S3", "Text", "Storm")) + item("LOOSE", "Text", "Epigraph")))}
${item("RES", "ResearchFolder", "Research", item("R1", "Text", "Ships") + item("IMG", "Image", "Map"))}
${item("TRASH", "TrashFolder", "Trash", item("T1", "Text", "Old draft"))}
</Binder></ScrivenerProject>`;

const doc = (id: string, body: string) => [`The Drift.scriv/Files/Data/${id}/content.rtf`, strToU8(rtf(body))] as const;
const files: Record<string, Uint8Array> = Object.fromEntries([
  ["The Drift.scriv/The Drift.scrivx", strToU8(scrivx)],
  doc("S1", String.raw`She came in on the {\i Wanderer}.\par`),
  doc("S2", String.raw`The harbour was empty.\par`),
  doc("X", String.raw`Nobody should see this.\par`),
  doc("INT", String.raw`A short breath.\par`),
  doc("S3", String.raw`The storm broke.\par`),
  doc("LOOSE", String.raw`\i All the sea is salt.\par`),
  doc("R1", String.raw`Brigantines have two masts.\par`),
  doc("T1", String.raw`Throw this away.\par`),
]);

const s3 = readScrivener(files);
check("project title from the .scrivx name", s3.title, "The Drift");
check("chapters in binder order, parts prefixed", s3.chapters.map((c) => c.title), ["Chapter One", "Interlude", "Part Two", "Part Two — The Crossing"]);
check("a folder's documents become scenes with a break between", s3.chapters[0]?.body, "She came in on the *Wanderer*.\n\n* * *\n\nThe harbour was empty.");
check("a part's loose document is its own chapter", s3.chapters[2]?.body, "*All the sea is salt.*");
check("orders run 1..n", s3.chapters.map((c) => c.order), [1, 2, 3, 4]);
check("excluded-from-compile is left out and counted", s3.excluded, 1);
check("a listed document with no file is counted, not invented", s3.missing, 1);
check("research text becomes notes; images are skipped", s3.notes, [{ title: "Ships", body: "Brigantines have two masts." }]);
check("nothing from the trash arrives", JSON.stringify(s3).includes("Throw this away"), false);
check("nothing excluded arrives", JSON.stringify(s3).includes("Nobody should see"), false);

/* ---------------- Scrivener 2 layout ---------------- */

const s2 = readScrivener({
  "Old.scrivx": strToU8(`<ScrivenerProject><Binder><BinderItem ID="0" Type="DraftFolder"><Title>Draft</Title><Children><BinderItem ID="7" Type="Text"><Title>Opening</Title></BinderItem></Children></BinderItem></Binder></ScrivenerProject>`),
  "Files/Docs/7.rtf": strToU8(rtf(String.raw`Once.\par`)),
});
check("Scrivener 2 projects read from Files/Docs", s2.chapters, [{ title: "Opening", body: "Once.", order: 1 }]);

let threw = "";
try {
  readScrivener({ "notes.txt": strToU8("hi") });
} catch (e) {
  threw = (e as Error).message;
}
check("a folder that isn't a project says so plainly", threw.includes("no .scrivx"), true);

if (failures > 0) {
  console.error(`\ntest-import: ${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`test-import: ${checks} checks passed`);
