#!/usr/bin/env node
/* The three PWA install icons — public/icon-192.png, icon-512.png and
   icon-512-maskable.png.

     PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core \
     CHROME=/path/to/chrome \
     node scripts/make-pwa-icons.cjs

   Why a browser draws them. make-icons.py renders every other icon, but it
   needs PIL, and neither PIL nor sharp is in the tree; adding a native
   image dependency for three PNGs that change once a rebrand is a bad
   trade. Headless Chromium is already a dev fixture here, and a canvas
   scaled with imageSmoothingQuality "high" is a proper resampler. The
   toolchain is passed in by env var and is NOT a repo dependency, so CI
   cannot run this — which is why the PNGs are committed and why the
   self-check below decodes what was written instead of trusting it.
   Re-run only when assets/brand changes.

   Same sources and the same composition as make-icons.py, so the installed
   icon is the tab icon at a larger size:
   - both sources are cropped to their alpha bbox first (make-icons.py's
     getbbox). The tile's opaque square sits inside a 5.5% transparent
     margin and the mark inside ~10%; skipping the crop shrinks the tile
     off the box edge and the mark to ~57% instead of 72%.
   - the mark is laid white over charcoal AFTER it is scaled, never scaled
     on top of a finished tile (make-icons.py, bug 2 — sRGB averaging
     turns the path between the gates into a smudge).
   - "any" is the rounded charcoal tile with transparent corners; fill
     0.72, fill_for() above 64px.

   Maskable is a different shape entirely. Android crops it to a circle or
   squircle and only promises the circle of radius 40% around the centre
   (the "safe zone"). So: full-bleed charcoal, no tile, no alpha, and the
   mark sized so its furthest pixel — measured, not assumed from the bbox,
   since a square bbox's corner is at 42% for a 60% box — lands inside
   that circle. The self-check fails the run if any pixel of the mark
   escapes it. */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT = path.dirname(__dirname);
const BRAND = path.join(ROOT, "assets", "brand");
const PUBLIC = path.join(ROOT, "public");

// make-icons.py's CHARCOAL. The manifest's background_color is #100e10;
// the icon follows the favicon, not the splash, so the two stay one icon.
const CHARCOAL = [31, 32, 34];
const ANY_FILL = 0.72;
// The brief's 20% padding per side. Capped below by the safe zone.
const MASKABLE_FILL = 0.6;
const SAFE_RADIUS = 0.4;
// A pixel short of the line is still on it once the launcher antialiases
// its own mask.
const SAFE_MARGIN = 0.01;

const ICONS = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-512-maskable.png", size: 512, maskable: true },
];

function dataUri(file) {
  return "data:image/png;base64," + fs.readFileSync(path.join(BRAND, file)).toString("base64");
}

/* ---------- in the page ---------- */

// Runs in Chromium. Returns the mark's geometry so the maskable fill can
// be decided from real pixels.
async function pagePrepare({ symbol, tile }) {
  const load = async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    return img;
  };
  const bbox = (img) => {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const { data, width, height } = g.getImageData(0, 0, c.width, c.height);
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    const pts = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 0) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
          pts.push(x, y);
        }
      }
    }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, pts };
  };

  const sym = await load(symbol);
  const til = await load(tile);
  const sb = bbox(sym);
  const tb = bbox(til);

  // Furthest covered pixel from the bbox centre, in units of the bbox's
  // longer side — the number the safe zone is really about.
  const cx = sb.x + sb.w / 2;
  const cy = sb.y + sb.h / 2;
  const long = Math.max(sb.w, sb.h);
  let r2 = 0;
  for (let i = 0; i < sb.pts.length; i += 2) {
    const dx = sb.pts[i] + 0.5 - cx;
    const dy = sb.pts[i + 1] + 0.5 - cy;
    if (dx * dx + dy * dy > r2) r2 = dx * dx + dy * dy;
  }

  window.__icon = { sym, til, sb: { ...sb, pts: null }, tb: { ...tb, pts: null } };
  return {
    symbol: { w: sym.naturalWidth, h: sym.naturalHeight, bbox: [sb.x, sb.y, sb.w, sb.h] },
    tile: { w: til.naturalWidth, h: til.naturalHeight, bbox: [tb.x, tb.y, tb.w, tb.h] },
    reach: Math.sqrt(r2) / long,
  };
}

// Runs in Chromium. Paints one icon into a canvas pinned at (0, 0) at its
// exact pixel size, for a clipped screenshot.
function pageRender({ size, maskable, fill, charcoal }) {
  const { sym, til, sb, tb } = window.__icon;
  document.body.replaceChildren();
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  c.style.cssText = `position:absolute;left:0;top:0;width:${size}px;height:${size}px`;
  document.body.append(c);
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  const bg = `rgb(${charcoal.join(",")})`;

  if (maskable) {
    g.fillStyle = bg;
    g.fillRect(0, 0, size, size);
  } else {
    // The tile as a coverage mask, filled with charcoal: the source's own
    // colour never matters, only its alpha.
    g.drawImage(til, tb.x, tb.y, tb.w, tb.h, 0, 0, size, size);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = bg;
    g.fillRect(0, 0, size, size);
    g.globalCompositeOperation = "source-over";
  }

  // Scale the mark alone on a transparent layer, whiten it, THEN lay it
  // over the charcoal.
  const target = Math.round(size * fill);
  const scale = target / Math.max(sb.w, sb.h);
  const mw = Math.max(1, Math.round(sb.w * scale));
  const mh = Math.max(1, Math.round(sb.h * scale));
  const layer = document.createElement("canvas");
  layer.width = mw;
  layer.height = mh;
  const lg = layer.getContext("2d");
  lg.imageSmoothingEnabled = true;
  lg.imageSmoothingQuality = "high";
  lg.drawImage(sym, sb.x, sb.y, sb.w, sb.h, 0, 0, mw, mh);
  lg.globalCompositeOperation = "source-in";
  lg.fillStyle = "#fff";
  lg.fillRect(0, 0, mw, mh);
  g.drawImage(layer, Math.floor((size - mw) / 2), Math.floor((size - mh) / 2));
}

/* ---------- PNG read-back ---------- */

// Enough of a PNG decoder for what Chromium writes: 8-bit, non-interlaced,
// colour type 2 or 6. Anything else is a failure worth hearing about.
function decodePng(buf) {
  const sig = "89504e470d0a1a0a";
  if (buf.subarray(0, 8).toString("hex") !== sig) throw new Error("not a PNG");
  let pos = 8;
  let ihdr = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      ihdr = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (!ihdr) throw new Error("no IHDR");
  const { width, height, depth, colorType, interlace } = ihdr;
  if (depth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unexpected PNG format: depth ${depth}, colour ${colorType}, interlace ${interlace}`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0;
      const b = y > 0 ? out[dst + x - stride] : 0;
      const c = x >= bpp && y > 0 ? out[dst + x - stride - bpp] : 0;
      let v = raw[src + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`bad filter ${filter} on row ${y}`);
      out[dst + x] = v & 0xff;
    }
  }
  const px = (x, y) => {
    const i = y * stride + x * bpp;
    return [out[i], out[i + 1], out[i + 2], bpp === 4 ? out[i + 3] : 255];
  };
  return { ...ihdr, px };
}

// What would have caught every composition mistake this script can make:
// wrong size, wrong alpha, a tile that stops short of the box, a mark that
// crosses the maskable crop line, a mark that is not there at all.
function check(icon, file) {
  const png = decodePng(fs.readFileSync(file));
  const { size, maskable } = icon;
  const problems = [];
  if (png.width !== size || png.height !== size) {
    problems.push(`is ${png.width}x${png.height}, wanted ${size}x${size}`);
  }
  if (png.colorType !== (maskable ? 2 : 6)) {
    problems.push(`colour type ${png.colorType}, wanted ${maskable ? "2 (no alpha)" : "6 (alpha)"}`);
  }
  const mid = size >> 1;
  const isCharcoal = ([r, g, b, a]) =>
    a === 255 && Math.abs(r - CHARCOAL[0]) <= 1 && Math.abs(g - CHARCOAL[1]) <= 1 && Math.abs(b - CHARCOAL[2]) <= 1;

  if (maskable) {
    for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1], [mid, 0]]) {
      if (!isCharcoal(png.px(x, y))) problems.push(`(${x},${y}) is not charcoal: ${png.px(x, y)}`);
    }
    let worst = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isCharcoal(png.px(x, y))) continue;
        const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / size;
        if (d > worst) worst = d;
      }
    }
    if (worst === 0) problems.push("no mark drawn");
    if (worst > SAFE_RADIUS) {
      problems.push(`mark reaches ${(worst * 100).toFixed(1)}% from centre; safe zone is ${SAFE_RADIUS * 100}%`);
    }
    icon.reach = worst;
  } else {
    // A flat tile edge must reach the box on all four sides...
    for (const [x, y] of [[1, mid], [size - 2, mid], [mid, 1], [mid, size - 2]]) {
      if (png.px(x, y)[3] !== 255) problems.push(`edge (${x},${y}) is not opaque: ${png.px(x, y)}`);
    }
    // ...and the rounded corners must not.
    if (png.px(0, 0)[3] !== 0) problems.push(`corner is not transparent: ${png.px(0, 0)}`);
  }
  // Something white near the middle, or the mark went missing.
  let bright = 0;
  const q = size >> 2;
  for (let y = q; y < size - q; y++) {
    for (let x = q; x < size - q; x++) if (png.px(x, y)[0] > 200) bright++;
  }
  if (bright === 0) problems.push("no white pixels in the middle half: the mark is missing");
  return problems;
}

/* ---------- run ---------- */

async function main() {
  const exe = process.env.CHROME;
  if (!exe) {
    console.error("set CHROME to a Chromium binary and PLAYWRIGHT_CORE to playwright-core (neither is a repo dependency)");
    process.exit(2);
  }
  const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");

  const browser = await chromium.launch({
    executablePath: exe,
    // sRGB pinned so a screenshot is the canvas's bytes, not the canvas
    // converted to whatever profile the headless display claims.
    args: ["--no-sandbox", "--disable-gpu", "--force-color-profile=srgb"],
  });
  let failed = false;
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });
    await page.setContent('<!doctype html><body style="margin:0;background:transparent"></body>');
    const geo = await page.evaluate(pagePrepare, {
      symbol: dataUri("symbol-white.png"),
      tile: dataUri("tile-charcoal.png"),
    });
    console.log(
      `symbol ${geo.symbol.w}x${geo.symbol.h}, bbox ${geo.symbol.bbox.join(",")}; ` +
        `tile ${geo.tile.w}x${geo.tile.h}, bbox ${geo.tile.bbox.join(",")}; ` +
        `mark reach ${(geo.reach * 100).toFixed(1)}% of its long side`,
    );

    const maskableFill = Math.min(MASKABLE_FILL, (SAFE_RADIUS - SAFE_MARGIN) / geo.reach);

    for (const icon of ICONS) {
      const fill = icon.maskable ? maskableFill : ANY_FILL;
      await page.evaluate(pageRender, { size: icon.size, maskable: icon.maskable, fill, charcoal: CHARCOAL });
      const out = path.join(PUBLIC, icon.file);
      await page.screenshot({
        path: out,
        clip: { x: 0, y: 0, width: icon.size, height: icon.size },
        omitBackground: !icon.maskable,
      });
      const problems = check(icon, out);
      const extra = icon.maskable ? `, reach ${(icon.reach * 100).toFixed(1)}% (safe ${SAFE_RADIUS * 100}%)` : "";
      console.log(
        `${problems.length ? "FAIL" : "ok  "} ${icon.file} ${icon.size}px fill ${(fill * 100).toFixed(1)}%${extra}` +
          ` ${fs.statSync(out).size} bytes`,
      );
      for (const p of problems) console.error(`     ${p}`);
      if (problems.length) failed = true;
    }
  } finally {
    await browser.close();
  }
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
