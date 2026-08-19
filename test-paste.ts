/* Assertions for pasted-HTML conversion — src/import/pasteMarkdown.ts.

   Same shape as test-tasks.ts: silent unless something is wrong, non-zero
   exit when it is.

   The fixtures below are the point of this file. Synthetic HTML proves
   nothing here, because nothing about this feature is hard in the abstract
   — it is hard because Google Docs wraps every copied document in a <b>
   that isn't bold, because Word writes lists as paragraphs with a bullet
   glyph typed into them, and because both bury the prose under a
   stylesheet. So the strings below are the shapes those apps actually put
   on the clipboard, down to the unquoted attributes and the mso- noise.

   Two properties matter more than any single case, and are asserted over
   and over:

     1. the writer's words always survive, even when the formatting
        doesn't, and
     2. anything we are not sure about comes back as null, which the
        editor honours by pasting the plain text exactly as before. */

import {
  clipboardFragment,
  element,
  fromDomNode,
  htmlToMarkdown,
  markdownFromPaste,
  parseHtml,
  textNode,
  type DomLikeNode,
  type PasteNode,
} from "./src/import/pasteMarkdown";

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

/** Convert, ignoring the trust gate — for asserting the conversion itself. */
const md = (html: string): string => htmlToMarkdown(html).markdown;

/** What the editor would actually insert, or null for "leave it alone". */
const paste = (html: string, plain = ""): string | null => markdownFromPaste(html, plain);

/* ============================================================
   1. Google Docs
   ============================================================ */
{
  /* Copied out of Google Docs: every run is a <span> carrying explicit
     font-weight, and the whole selection is wrapped in a <b> that is
     switched off by an inline style. A converter that trusts the tag
     returns a bold document. */
  const DOCS_PARAGRAPH =
    '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-9f31c0a1-7fff-2a1c-0d3e-11">' +
    '<p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">' +
    '<span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;' +
    'font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;' +
    'white-space:pre;white-space:pre-wrap;">The rain came </span>' +
    '<span style="font-size:11pt;font-family:Arial,sans-serif;font-weight:700;font-style:normal;' +
    'text-decoration:none;vertical-align:baseline;white-space:pre-wrap;">sideways</span>' +
    '<span style="font-size:11pt;font-weight:400;font-style:italic;text-decoration:none;' +
    'white-space:pre-wrap;"> and cold</span>' +
    '<span style="font-size:11pt;font-weight:400;text-decoration:none;white-space:pre-wrap;">.</span>' +
    "</p></b>";

  check(
    "docs: the wrapper <b> is not bold",
    md(DOCS_PARAGRAPH),
    "The rain came **sideways** *and cold*.",
  );
  ok("docs: the whole document did not go bold", !md(DOCS_PARAGRAPH).startsWith("**The"));

  /* Two paragraphs inside the same wrapper. The <b> is an inline tag
     holding block elements, so it has to be walked as a container or both
     paragraphs collapse into one line. */
  const DOCS_TWO =
    '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-77">' +
    '<p dir="ltr"><span style="font-weight:400;">First line.</span></p>' +
    '<p dir="ltr"><span style="font-weight:700;">Second</span><span style="font-weight:400;"> line.</span></p>' +
    "</b>";
  check("docs: paragraphs stay separate", md(DOCS_TWO), "First line.\n\n**Second** line.");

  /* Genuinely bold text still survives the wrapper. */
  const DOCS_NESTED_BOLD =
    '<b style="font-weight:normal;" id="docs-internal-guid-1"><p><span style="font-weight:700;">' +
    '<span style="font-style:italic;">Both</span></span><span style="font-weight:400;"> plain</span></p></b>';
  check("docs: bold inside the dead wrapper still lands", md(DOCS_NESTED_BOLD), "***Both*** plain");

  /* Bold explicitly switched off partway through a real <b>. Wrapping at
     element boundaries would swallow the child that turned it off. */
  check(
    "docs: font-weight:normal inside a real <b> ends the bold",
    md('<p><b>bold <span style="font-weight:normal">not</span></b></p>'),
    "**bold** not",
  );

  /* Google Docs lists: <li> holds a <p>, and the nested list lives inside
     the parent <li>. */
  const DOCS_LIST =
    '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-4">' +
    '<ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;">' +
    '<li dir="ltr" aria-level="1" style="list-style-type:disc;font-size:11pt;font-family:Arial;' +
    'color:#000000;font-weight:400;font-style:normal;text-decoration:none;">' +
    '<p dir="ltr" role="presentation" style="line-height:1.38;margin-top:0pt;">' +
    '<span style="font-weight:400;">Pack the lantern</span></p></li>' +
    '<li dir="ltr" aria-level="1" style="list-style-type:disc;font-weight:400;">' +
    '<p dir="ltr" role="presentation"><span style="font-weight:700;">Rope</span>' +
    '<span style="font-weight:400;">, forty feet</span></p>' +
    '<ul style="margin-top:0;margin-bottom:0;">' +
    '<li dir="ltr" aria-level="2" style="list-style-type:circle;font-weight:400;">' +
    '<p dir="ltr" role="presentation"><span style="font-weight:400;">and the maps</span></p></li>' +
    "</ul></li></ul></b>";

  check(
    "docs: nested bullet list",
    md(DOCS_LIST),
    ["- Pack the lantern", "- **Rope**, forty feet", "  - and the maps"].join("\n"),
  );

  /* Docs underlines its links. That decoration is chrome, not authoring
     intent, and carrying it through wraps half a pasted article in <u>. */
  const DOCS_LINK =
    '<p><a href="https://example.com/notes" style="text-decoration:underline;">' +
    '<span style="font-weight:400;text-decoration:underline;color:#1155cc;">the notes</span></a>' +
    '<span style="font-weight:400;"> are here.</span></p>';
  check("docs: an underlined link is a link, not underline", md(DOCS_LINK), "[the notes](https://example.com/notes) are here.");
}

/* ============================================================
   2. Microsoft Word
   ============================================================ */
{
  /* A real Word paste: the CF_HTML header, a stylesheet full of mso-
     rules, MsoNormal paragraphs, <o:p> spacers, and a list that is not a
     list — just paragraphs with `mso-list` in the style and the bullet
     glyph typed into a span marked mso-list:Ignore. */
  const WORD =
    "Version:0.9\r\nStartHTML:00000097\r\nEndHTML:00003186\r\nStartFragment:00000199\r\nEndFragment:00003150\r\n" +
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">' +
    '<head><meta http-equiv=Content-Type content="text/html; charset=utf-8"><meta name=Generator content="Microsoft Word 15">' +
    "<style><!--\n /* Font Definitions */\n @font-face\n\t{font-family:\"Cambria Math\";\n\tpanose-1:2 4 5 3 5 4 6 3 2 4;}\n" +
    "p.MsoNormal, li.MsoNormal, div.MsoNormal\n\t{margin:0in;\n\tfont-size:12.0pt;\n\tfont-family:\"Times New Roman\",serif;}\n" +
    "--></style></head>" +
    "<body lang=EN-US style='word-wrap:break-word'>" +
    "<!--StartFragment-->" +
    "<div class=WordSection1>" +
    "<p class=MsoNormal style='margin-bottom:0in'><span style='font-size:11.0pt;font-family:\"Calibri\",sans-serif'>" +
    "She stepped into the <b>cold</b> and <i>kept walking</i>.<o:p></o:p></span></p>" +
    "<p class=MsoListParagraphCxSpFirst style='text-indent:-.25in;mso-list:l0 level1 lfo1'>" +
    "<span style='font-family:Symbol;mso-fareast-font-family:Symbol'><span style='mso-list:Ignore'>&middot;" +
    "<span style='font:7.0pt \"Times New Roman\"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span>" +
    "<span style='font-size:11.0pt'>Pack the lantern<o:p></o:p></span></p>" +
    "<p class=MsoListParagraphCxSpLast style='text-indent:-.25in;mso-list:l0 level2 lfo1'>" +
    "<span style='mso-list:Ignore'>o<span style='font:7.0pt \"Times New Roman\"'>&nbsp;&nbsp; </span></span>" +
    "<span style='font-size:11.0pt'>and the maps</span></p>" +
    "</div><!--EndFragment--></body></html>";

  const out = md(WORD);
  check(
    "word: prose, then a rebuilt list",
    out,
    [
      "She stepped into the **cold** and *kept walking*.",
      "",
      "- Pack the lantern",
      "  - and the maps",
    ].join("\n"),
  );
  ok("word: no stylesheet leaked into the prose", !/font-family|panose|MsoNormal/.test(out));
  ok("word: no literal bullet glyph survived", !out.includes("·"));
  ok("word: no non-breaking spaces survived", !out.includes(String.fromCharCode(160)));
  ok("word: the <o:p> spacers vanished", !out.includes("o:p"));

  /* Word's numbered lists put "1." in the same Ignore span. That glyph is
     the only place the ordered-vs-bulleted answer is written down. */
  const WORD_NUMBERED =
    "<p class=MsoListParagraphCxSpFirst style='mso-list:l1 level1 lfo2'>" +
    "<span style='mso-list:Ignore'>1.<span style='font:7.0pt \"Times New Roman\"'>&nbsp;&nbsp; </span></span>" +
    "<span>Wake before dawn</span></p>" +
    "<p class=MsoListParagraphCxSpLast style='mso-list:l1 level1 lfo2'>" +
    "<span style='mso-list:Ignore'>2.<span style='font:7.0pt \"Times New Roman\"'>&nbsp;&nbsp; </span></span>" +
    "<span>Leave by the north gate</span></p>";
  check(
    "word: numbered list keeps its numbers",
    md(WORD_NUMBERED),
    "1. Wake before dawn\n2. Leave by the north gate",
  );

  /* Word wraps single paragraphs in one-cell tables for layout. Drawing a
     pipe table around that would be nonsense. */
  const WORD_LAYOUT =
    "<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0 style='border-collapse:collapse'>" +
    "<tr><td width=468 valign=top style='width:351.0pt;padding:0in 5.4pt 0in 5.4pt'>" +
    "<p class=MsoNormal><b>A pull quote</b></p></td></tr></table>";
  check("word: a one-cell layout table is not a table", md(WORD_LAYOUT), "**A pull quote**");

  /* A <style> block that arrives without CF_HTML markers must still never
     reach the manuscript. */
  const BARE_STYLE =
    "<html><head><style>p.MsoNormal {mso-style-parent:\"\"; font-size:12.0pt;}</style></head>" +
    "<body><p><b>Chapter one</b></p></body></html>";
  check("word: an unfenced stylesheet is dropped whole", md(BARE_STYLE), "**Chapter one**");
}

/* ============================================================
   3. Browser-copied HTML
   ============================================================ */
{
  const ARTICLE =
    "<h2>The long way round</h2>" +
    "<p>Some <strong>bold</strong>, some <em>italic</em>, some <code>inline_code()</code>, " +
    'and <s>a cut line</s>. See <a href="https://example.com/a?b=1&amp;c=2">the source</a>.</p>' +
    "<blockquote><p>He never came back.</p></blockquote>" +
    "<ul><li>first<ul><li>nested</li><li>also nested</li></ul></li><li>second</li></ul>" +
    "<ol start=\"3\"><li>three</li><li>four</li></ol>" +
    "<hr>";

  check(
    "browser: a whole article",
    md(ARTICLE),
    [
      "## The long way round",
      "",
      "Some **bold**, some *italic*, some `inline_code()`, and ~~a cut line~~. " +
        "See [the source](https://example.com/a?b=1&c=2).",
      "",
      "> He never came back.",
      "",
      "- first",
      "  - nested",
      "  - also nested",
      "- second",
      "",
      "3. three",
      "4. four",
      "",
      "---",
    ].join("\n"),
  );

  /* <p><span> soup with no semantic tags at all, the shape most CMS and
     email clients produce. */
  const SOUP =
    '<div><div><span><p><span style="font-weight: bold">Heavy</span>' +
    '<span> and </span><span style="font-style: italic">slanted</span></p></span></div></div>';
  check("browser: span soup still resolves", md(SOUP), "**Heavy** and *slanted*");

  /* Unclosed <p> and <li>, which browsers accept and clipboards contain. */
  check(
    "browser: unclosed tags still split",
    md("<p>one<p>two<ul><li>a<li>b</ul>"),
    "one\n\ntwo\n\n- a\n- b",
  );

  /* A list nested straight inside a list with no <li> between — invalid,
     and produced anyway. It belongs to the item above it. */
  check(
    "browser: a <ul> parented by a <ul> is still nested",
    md("<ul><li>a</li><ul><li>b</li></ul></ul>"),
    "- a\n  - b",
  );

  check("browser: a <br> is a line break, not a lost word", md("<p>one<br>two</p>"), "one\ntwo");

  check(
    "browser: fenced code keeps its shape",
    md('<pre><code class="language-ts">const a = 1;\nif (a) run();</code></pre>'),
    "```ts\nconst a = 1;\nif (a) run();\n```",
  );

  check(
    "browser: headings only go as deep as Markdown does",
    md("<h1>One</h1><h6>Six</h6>"),
    "# One\n\n###### Six",
  );

  ok("browser: a script tag is never read", !md("<p>safe<script>alert(1)</script></p>").includes("alert"));
  ok("browser: comments are dropped", !md("<p>a<!-- hidden -->b</p>").includes("hidden"));
}

/* ============================================================
   4. Underline — the one thing Markdown cannot say
   ============================================================ */
{
  /* Markdown has no underline. Mapping it to italic would destroy the
     distinction the writer made; dropping it would lose formatting they
     asked to keep. Inline HTML is part of Markdown, renders everywhere,
     and is visible enough to delete — so it passes through as <u>. */
  check("underline: <u> passes through", md("<p><u>underlined</u></p>"), "<u>underlined</u>");
  check(
    "underline: from a style, and combined with bold",
    md('<p><span style="text-decoration:underline"><b>both</b></span></p>'),
    "<u>**both**</u>",
  );
  check("underline: <ins> counts too", md("<p><ins>added</ins></p>"), "<u>added</u>");
  check(
    "underline: text-decoration:none switches it back off",
    md('<p><u style="text-decoration:none">plain</u></p>'),
    "plain",
  );
  ok("underline: never becomes italic", !md("<p><u>x</u></p>").includes("*"));
}

/* ============================================================
   5. Tables and images
   ============================================================ */
{
  check(
    "table: a simple grid becomes a pipe table",
    md("<table><thead><tr><th>Name</th><th>Role</th></tr></thead>" +
      "<tbody><tr><td>Ines</td><td>captain</td></tr><tr><td>Rook</td><td>navigator</td></tr></tbody></table>"),
    [
      "| Name | Role |",
      "| --- | --- |",
      "| Ines | captain |",
      "| Rook | navigator |",
    ].join("\n"),
  );

  check(
    "table: a pipe inside a cell is escaped, never left to break the row",
    md("<table><tr><td>a|b</td><td>c</td></tr><tr><td>d</td><td>e</td></tr></table>"),
    "| a\\|b | c |\n| --- | --- |\n| d | e |",
  );

  /* Merged cells cannot be said in GFM. Rather than emit a table that
     doesn't parse, the cells come through as prose — every word kept, only
     the grid lost. */
  const MERGED =
    "<table><tr><td colspan=\"2\">Spanning header</td></tr><tr><td>left</td><td>right</td></tr></table>";
  const merged = md(MERGED);
  ok("table: merged cells produce no pipe syntax", !merged.includes("|"));
  ok("table: merged cells keep every word", ["Spanning header", "left", "right"].every((w) => merged.includes(w)));

  const NESTED = "<table><tr><td><table><tr><td>inner</td></tr></table></td><td>x</td></tr><tr><td>y</td><td>z</td></tr></table>";
  ok("table: a nested table never emits broken syntax", !md(NESTED).includes("|"));
  ok("table: a nested table keeps its words", md(NESTED).includes("inner"));

  /* A data: URI is the whole image inlined — pasting one drops megabytes
     of base64 into a chapter. The alt text is kept; the payload is not. */
  const DATA_IMG =
    '<p>before <img alt="a map of the delta" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg' +
    "AAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==\"> after</p>";
  const dataOut = md(DATA_IMG);
  ok("image: no base64 payload reaches the manuscript", !dataOut.includes("base64"));
  ok("image: the alt text is kept instead", dataOut.includes("a map of the delta"));

  check(
    "image: a real URL survives as an image",
    md('<p><img src="https://example.com/delta.png" alt="the delta"></p>'),
    "![the delta](https://example.com/delta.png)",
  );
  ok(
    "image: a blob: URL is dropped, not linked",
    !md('<p><img src="blob:https://x/9f-1" alt="chart"></p>').includes("blob:"),
  );
}

/* ============================================================
   6. Escaping — pasted prose must not become syntax
   ============================================================ */
{
  check("escape: asterisks in prose stay literal", md("<p>a * b * c</p>"), "a \\* b \\* c");
  check("escape: brackets stay literal", md("<p>see [note] here</p>"), "see \\[note\\] here");
  check("escape: a leading dash is not a list", md("<p>- not a list</p>"), "\\- not a list");
  check("escape: a leading hash is not a heading", md("<p># not a heading</p>"), "\\# not a heading");
  check("escape: a leading number is not an item", md("<p>1. not an item</p>"), "\\1. not an item");
  check("escape: intra-word underscores are left alone", md("<p>read file_name_here</p>"), "read file_name_here");
  check("escape: a lone underscore is escaped", md("<p>an _ alone</p>"), "an \\_ alone");
  /* Only a "<" that could actually open a tag is escaped. "3 < 4" is
     arithmetic and reads worse with a backslash in it. */
  check("escape: a < that could open a tag is escaped", md("<p>a &lt;b&gt; tag</p>"), "a \\<b> tag");
  check("escape: a < that cannot is left alone", md("<p>3 &lt; 4</p>"), "3 < 4");

  /* Escapes must not fire inside emphasis we generated ourselves. */
  check("escape: our own markers are not escaped", md("<p><b>a * b</b></p>"), "**a \\* b**");
}

/* ============================================================
   7. The trust gate — when we refuse
   ============================================================ */
{
  check("gate: no HTML means no conversion", paste("", "hello"), null);
  check("gate: whitespace HTML means no conversion", paste("   \n ", "hello"), null);

  /* The common case, and the one that must not regress: HTML that carries
     no formatting converts to itself, so there is nothing to gain and an
     escaped backslash to lose. Plain text pastes exactly as before. */
  check("gate: unformatted HTML is left to the plain-text paste", paste("<p>just words</p>", "just words"), null);
  check("gate: a bare text node is left alone", paste("hello there", "hello there"), null);
  check("gate: prose with an asterisk is not rewritten for nothing", paste("<p>a * b</p>", "a * b"), null);

  ok("gate: formatted HTML does convert", paste("<p><b>yes</b></p>", "yes") === "**yes**");

  /* A parser that throws must cost the writer nothing. */
  const boom = htmlToMarkdown("<p>x</p>", {
    parse: () => {
      throw new Error("bang");
    },
  });
  check("gate: a throwing parser is not fatal", boom.ok, false);
  check(
    "gate: and yields nothing to insert",
    markdownFromPaste("<p><b>x</b></p>", "x", {
      parse: () => {
        throw new Error("bang");
      },
    }),
    null,
  );

  /* Oversized clipboards stop rather than lock the editor mid-paste. */
  const huge = `<p><b>${"word ".repeat(900_000)}</b></p>`;
  ok("gate: an implausibly large paste is refused", huge.length > 4_000_000 && paste(huge, "word") === null);

  /* Words going missing is the failure that matters most. */
  ok(
    "gate: losing the writer's words refuses the conversion",
    paste('<p><b>short</b></p>', "short but the plain text had a great deal more prose in it than this") === null,
  );
  ok(
    "gate: gaining text the reader never saw also refuses",
    paste("<h1>a heading nobody selected plus more invented prose here</h1>", "a") === null,
  );

  /* Every conversion this file makes must pass its own sanity checks. */
  const balanced = [
    "<p><b>a</b> <i>b</i> <s>c</s> <u>d</u> <code>e</code></p>",
    "<ul><li><b>x</b><ul><li><i>y</i></li></ul></li></ul>",
    "<table><tr><th>a</th></tr><tr><td>b</td></tr></table>",
  ];
  ok("gate: our own output always passes the balance checks", balanced.every((h) => htmlToMarkdown(h).ok));
}

/* ============================================================
   8. Parsing plumbing
   ============================================================ */
{
  check(
    "fragment: the CF_HTML slice drops everything around it",
    clipboardFragment("Version:0.9\r\nStartHTML:1\r\n<html><head><style>x{}</style></head><body><!--StartFragment--><p>keep</p><!--EndFragment--></body></html>").trim(),
    "<p>keep</p>",
  );
  check(
    "fragment: HTML without the markers is left whole",
    clipboardFragment("<p>keep</p>"),
    "<p>keep</p>",
  );

  check("entities: named and numeric both decode", md("<p>caf&eacute; &#8212; &#x2014; &amp;</p>"), "café — — &");
  check("entities: an unknown entity stays as written", md("<p>a &notreal; b</p>"), "a &notreal; b");

  const tree = parseHtml("<p class=MsoNormal style='mso-list:l0 level1 lfo1'>x</p>");
  const first = tree.children[0];
  ok("tokenizer: unquoted Word attributes parse", first?.kind === "element" && first.attrs.class === "MsoNormal");
  ok(
    "tokenizer: single-quoted styles parse",
    first?.kind === "element" && first.attrs.style === "mso-list:l0 level1 lfo1",
  );

  /* The browser hands us a DOM rather than a token stream, so the same
     conversion has to come out of the same document read the other way.
     This stands a minimal DOM in front of it — including a comment node,
     which must be ignored the way a real one is. */
  const toDom = (node: PasteNode): DomLikeNode =>
    node.kind === "text"
      ? { nodeType: 3, nodeName: "#text", nodeValue: node.text, childNodes: [] }
      : {
          nodeType: 1,
          nodeName: node.tag.toUpperCase(),
          nodeValue: null,
          childNodes: node.children.map(toDom),
          attributes: Object.entries(node.attrs).map(([name, value]) => ({ name, value })),
        };

  const viaDom = (html: string): string =>
    htmlToMarkdown(html, { parse: (h) => fromDomNode(toDom(parseHtml(h))) }).markdown;

  const shared = "<p><b>bold</b> and <i>italic</i></p><ul><li>one<ul><li>two</li></ul></li></ul>";
  check("dom: the DOM path agrees with the tokenizer", viaDom(shared), md(shared));

  /* The two riskiest cases, asserted again through the DOM, because the
     DOM is the path that actually ships. */
  const docsViaDom = viaDom(
    '<b style="font-weight:normal;" id="docs-internal-guid-2"><p><span style="font-weight:400;">plain </span>' +
      '<span style="font-weight:700;">bold</span></p></b>',
  );
  check("dom: the Google Docs wrapper is dead on the DOM path too", docsViaDom, "plain **bold**");
  ok(
    "dom: stylesheets and scripts are dropped on the DOM path too",
    viaDom("<style>p{color:red}</style><p><b>x</b><script>alert(1)</script></p>") === "**x**",
  );

  const withComment = fromDomNode({
    nodeType: 1,
    nodeName: "BODY",
    nodeValue: null,
    childNodes: [
      { nodeType: 8, nodeName: "#comment", nodeValue: " hidden ", childNodes: [] },
      toDom(element("p", {}, [textNode("kept")])),
    ],
  });
  check("dom: comment nodes are skipped", htmlToMarkdown("", { parse: () => withComment }).markdown, "kept");
}

/* ============================================================
   9. Round-trip properties
   ============================================================ */
{
  /* Whatever the shape, the words come through. */
  const shapes = [
    "<p>Alpha <b>bravo</b> charlie.</p>",
    "<ul><li>Alpha</li><li>bravo <i>charlie</i></li></ul>",
    "<blockquote><p>Alpha bravo charlie</p></blockquote>",
    "<h3>Alpha</h3><p>bravo charlie</p>",
    "<table><tr><th>Alpha</th></tr><tr><td>bravo charlie</td></tr></table>",
    '<p><a href="https://e.com">Alpha</a> bravo charlie</p>',
  ];
  const words = ["Alpha", "bravo", "charlie"];
  ok(
    "property: every shape keeps every word",
    shapes.every((html) => {
      const out = md(html);
      return words.every((w) => out.includes(w));
    }),
  );
  ok("property: every shape passes the trust gate", shapes.every((html) => htmlToMarkdown(html).ok));
  ok(
    "property: no shape ends with stray blank lines",
    shapes.every((html) => md(html) === md(html).trim()),
  );
  ok(
    "property: nothing emits a raw HTML tag except the underline we chose",
    shapes.every((html) => !/<(?!\/?u>)[a-z]/i.test(md(html))),
  );
}

/* ---------- report ---------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`paste conversion tests: ${checks} checks passed`);
