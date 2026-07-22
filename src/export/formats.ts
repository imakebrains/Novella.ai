import {
  AlignmentType,
  Document,
  HeadingLevel,
  PageBreak,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { zipSync, strToU8 } from "fflate";
import type { Manuscript } from "./compile";

/* Output formats.

   Three, chosen for what writers actually do with a finished draft:

     Markdown — plain, portable, diffable. Never lossy.
     DOCX     — what agents, editors and publishers ask for. Formatted to
                standard manuscript conventions, not just "a Word file".
     EPUB     — what self-publishing platforms ingest.

   PDF is deliberately absent: it's a final-output format, and both DOCX
   and EPUB convert to it better than a hand-rolled renderer would. */

export type Format = "markdown" | "docx" | "epub";

export interface ExportResult {
  filename: string;
  /** Text for Markdown, bytes for the binary formats. */
  data: string | Uint8Array;
  mime: string;
}

function slug(s: string): string {
  return s.trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-") || "manuscript";
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/* ---------------- markdown ---------------- */

export function toMarkdown(m: Manuscript): ExportResult {
  const parts: string[] = [`# ${m.title}`, ""];
  if (m.author) parts.push(`*by ${m.author}*`, "");

  for (const chapter of m.chapters) {
    parts.push("", `## ${chapter.title}`, "");
    for (const p of chapter.paragraphs) parts.push(p, "");
  }

  return {
    filename: `${slug(m.title)}.md`,
    data: parts.join("\n").replace(/\n{3,}/g, "\n\n"),
    mime: "text/markdown",
  };
}

/* ---------------- docx ---------------- */

/* Standard manuscript format: 12pt serif, double spaced, indented
   paragraphs, chapters starting on a new page. This is the shape agents
   expect, and getting it wrong is a reason to be passed over. */
const FONT = "Times New Roman";
const SIZE_HALF_POINTS = 24; // 12pt
const DOUBLE = 480; // 240 = single spacing
const INDENT_TWIPS = 720; // half an inch

export async function toDocx(m: Manuscript): Promise<ExportResult> {
  const title: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 3000, after: 240 },
      children: [
        new TextRun({ text: m.title, bold: true, font: FONT, size: 36 }),
      ],
    }),
  ];

  if (m.author) {
    title.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: `by ${m.author}`, font: FONT, size: SIZE_HALF_POINTS })],
      }),
    );
  }

  title.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240 },
      children: [
        new TextRun({
          text: `${m.words.toLocaleString()} words`,
          font: FONT,
          size: SIZE_HALF_POINTS,
        }),
        new PageBreak(),
      ],
    }),
  );

  const body: Paragraph[] = [];
  m.chapters.forEach((chapter, ci) => {
    body.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: ci === 0 ? 0 : 240, after: 480 },
        children: [
          new TextRun({ text: chapter.title, bold: true, font: FONT, size: 28 }),
        ],
      }),
    );

    chapter.paragraphs.forEach((p, pi) => {
      body.push(
        new Paragraph({
          spacing: { line: DOUBLE },
          // First paragraph of a scene isn't indented, by convention.
          indent: pi === 0 ? undefined : { firstLine: INDENT_TWIPS },
          children: [new TextRun({ text: p, font: FONT, size: SIZE_HALF_POINTS })],
        }),
      );
    });

    if (ci < m.chapters.length - 1) {
      body.push(new Paragraph({ children: [new PageBreak()] }));
    }
  });

  const doc = new Document({
    creator: m.author || "Novella",
    title: m.title,
    sections: [
      {
        properties: {
          page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
        },
        children: [...title, ...body],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const data = new Uint8Array(await blob.arrayBuffer());

  return {
    filename: `${slug(m.title)}.docx`,
    data,
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}

/* ---------------- epub ---------------- */

/* An EPUB is a ZIP with a prescribed layout. Built by hand rather than
   pulling another dependency: the spec surface we need is small, and the
   one rule that actually bites is that `mimetype` must be the first entry
   and stored uncompressed. */

export function toEpub(m: Manuscript): ExportResult {
  const uid = `urn:uuid:novella-${slug(m.title).toLowerCase()}-${Date.now()}`;
  const files: Record<string, Uint8Array> = {};

  files["META-INF/container.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  );

  files["OEBPS/style.css"] = strToU8(
    `body { font-family: Georgia, serif; line-height: 1.6; margin: 5%; }
h1 { text-align: center; margin: 2em 0 1.5em; font-weight: normal; }
p { margin: 0; text-indent: 1.5em; }
p.first { text-indent: 0; }
.title { text-align: center; margin-top: 30%; }
.title h1 { font-size: 2em; }
.byline { text-align: center; font-style: italic; }`,
  );

  files["OEBPS/title.xhtml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${escapeXml(m.title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/></head>
<body><div class="title"><h1>${escapeXml(m.title)}</h1>
${m.author ? `<p class="byline">by ${escapeXml(m.author)}</p>` : ""}</div></body></html>`,
  );

  m.chapters.forEach((chapter, i) => {
    const paras = chapter.paragraphs
      .map((p, pi) => `<p${pi === 0 ? ' class="first"' : ""}>${escapeXml(p)}</p>`)
      .join("\n");
    files[`OEBPS/chapter${i + 1}.xhtml`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${escapeXml(chapter.title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/></head>
<body><h1>${escapeXml(chapter.title)}</h1>
${paras}</body></html>`,
    );
  });

  const manifest = m.chapters
    .map((_, i) => `<item id="ch${i + 1}" href="chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>`)
    .join("\n    ");
  const spine = m.chapters.map((_, i) => `<itemref idref="ch${i + 1}"/>`).join("\n    ");

  files["OEBPS/content.opf"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${uid}</dc:identifier>
    <dc:title>${escapeXml(m.title)}</dc:title>
    <dc:language>en</dc:language>
    ${m.author ? `<dc:creator>${escapeXml(m.author)}</dc:creator>` : ""}
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
    ${manifest}
  </manifest>
  <spine>
    <itemref idref="title"/>
    ${spine}
  </spine>
</package>`,
  );

  const navItems = m.chapters
    .map((c, i) => `<li><a href="chapter${i + 1}.xhtml">${escapeXml(c.title)}</a></li>`)
    .join("\n      ");

  files["OEBPS/nav.xhtml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc"><h1>Contents</h1><ol>
      ${navItems}
</ol></nav></body></html>`,
  );

  // mimetype must come first and be stored, not deflated.
  const zipped = zipSync(
    { mimetype: [strToU8("application/epub+zip"), { level: 0 }], ...files },
    { level: 6 },
  );

  return {
    filename: `${slug(m.title)}.epub`,
    data: zipped,
    mime: "application/epub+zip",
  };
}

export async function render(m: Manuscript, format: Format): Promise<ExportResult> {
  if (format === "markdown") return toMarkdown(m);
  if (format === "epub") return toEpub(m);
  return toDocx(m);
}
