import type { Manuscript } from "./compile";

/* PDF export, the honest way: a print-formatted window and the OS
   print dialog, where "Save as PDF" lives on every platform. No PDF
   library to trust with the manuscript, and pagination is done by the
   engine that's best at it — the browser's print pipeline. */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function openPrintWindow(m: Manuscript): boolean {
  const win = window.open("", "_blank", "width=760,height=900");
  if (!win) return false;

  const chapters = m.chapters
    .map(
      (c) =>
        `<section class="chapter"><h2>${esc(c.title)}</h2>${c.paragraphs
          .map((p) => `<p>${esc(p)}</p>`)
          .join("")}</section>`,
    )
    .join("");

  win.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>${esc(m.title)}</title>
<style>
  body { font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
         color: #1a1a1a; margin: 0; }
  .page { max-width: 40rem; margin: 0 auto; padding: 3rem 1.5rem; }
  h1 { font-size: 2rem; margin: 4rem 0 0.5rem; text-align: center; }
  .byline { text-align: center; margin-bottom: 4rem; color: #444; }
  h2 { font-size: 1.3rem; margin: 3rem 0 1rem; page-break-before: always; }
  .chapter:first-of-type h2 { page-break-before: avoid; }
  p { line-height: 1.7; margin: 0 0 0.2rem; text-indent: 1.5em; }
  h2 + p { text-indent: 0; }
  @media print { .no-print { display: none; } }
  .no-print { position: fixed; top: 8px; right: 8px; font-family: system-ui;
              font-size: 12px; color: #666; background: #f2f2f2;
              padding: 6px 10px; border-radius: 6px; }
</style></head><body>
<div class="no-print">Choose “Save as PDF” in the print dialog</div>
<div class="page">
  <h1>${esc(m.title)}</h1>
  ${m.author ? `<div class="byline">by ${esc(m.author)}</div>` : ""}
  ${chapters}
</div>
<script>window.addEventListener("load", () => setTimeout(() => window.print(), 300));</script>
</body></html>`);
  win.document.close();
  return true;
}
