#!/usr/bin/env python3
"""Regenerate every app icon from the brand source art.

    python scripts/make-icons.py

Sources live in assets/brand/ so this is reproducible on any machine — the
art is 256KB and having it in the tree is cheaper than the afternoon it
costs to work out where it came from.

WHY THIS FILE EXISTS AT ALL, rather than a one-off resize:

The first icon pass downscaled the already-composited tile in sRGB. Average
a thin white mark against a near-black tile that way and every edge pixel is
dragged toward grey, so at 32px — exactly what Windows puts in the taskbar —
the winding path between the gates arrived as a smudge. Just under 12% of
that frame was neither tile nor mark, only mush. Three things fix it, and
all three are easy to lose if someone regenerates these by hand:

1. Composite from the MASK. Alpha is linear coverage: reduce the coverage,
   then lay white over charcoal. Any other order asks sRGB averaging to
   preserve a brightness relationship that it does not preserve.

2. Steepen the coverage curve after the reduction (smoothstep, twice).
   This is NOT sharpening — it never moves a pixel outside the range it
   already occupied, so it cannot ring. An unsharp mask on near-binary art
   very much does: the first attempt at this put a black halo around every
   gate, which looked worse than the blur it was fixing.

3. Fill 74% of the tile rather than the source art's 56%. That padding is
   right for a 1024px press asset and wrong for 32 pixels, where it spends
   a third of the budget on empty corners.

Dilating the mask to thicken the path was tried and rejected: below 32px it
turns the path into a blob and the gates stop reading as two leaves.

The ICO carries 20px and 40px frames as well as the usual ladder, because
those are the sizes Windows asks for at 125% and 150% display scaling. Left
out, Windows rescales a neighbouring frame and adds back the blur this file
exists to remove.

After running this, REBUILD — the Windows icon is compiled into the
executable as a resource. src-tauri/build.rs declares assets/brand and the
icons directory as inputs so cargo notices; before it did, a regenerated
icon sat on disk looking correct while the binary kept shipping the old one.
"""

from PIL import Image
import io
import os
import struct
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRAND = os.path.join(ROOT, "assets", "brand")
ICONS = os.path.join(ROOT, "src-tauri", "icons")
PUBLIC = os.path.join(ROOT, "public")

SYMBOL = os.path.join(BRAND, "symbol-white.png")
TILE = os.path.join(BRAND, "tile-charcoal.png")

CHARCOAL = (31, 32, 34)

_sym = None
_tile = None


def sources():
    """The mark and the rounded square, both as coverage masks."""
    global _sym, _tile
    if _sym is None:
        a = Image.open(SYMBOL).convert("RGBA").split()[-1]
        _sym = a.crop(a.getbbox())
        t = Image.open(TILE).convert("RGBA").split()[-1]
        _tile = t.crop(t.getbbox())
    return _sym, _tile


def _smoothstep_lut(times):
    lut = []
    for i in range(256):
        v = i / 255.0
        for _ in range(times):
            v = v * v * (3 - 2 * v)
        lut.append(int(round(v * 255)))
    return lut


CURVE = _smoothstep_lut(2)


def fill_for(size):
    """Share of the tile the mark spans.

    Small icons need to be optically LARGER, not proportionally identical:
    at 24px the padding is doing nothing except stealing pixels from the
    only part anyone has to recognise.
    """
    return 0.78 if size <= 24 else 0.74 if size <= 64 else 0.72


def render(size, fg=(255, 255, 255), bg=CHARCOAL):
    sym, tal = sources()

    target = int(round(size * fill_for(size)))
    scale = target / max(sym.size)
    mark = sym.resize(
        (max(1, round(sym.size[0] * scale)), max(1, round(sym.size[1] * scale))),
        Image.LANCZOS,
    )
    # Only where a reduction actually happened; at 256+ the edges are
    # already the artwork's own and steepening them would coarsen it.
    if size <= 128:
        mark = mark.point(CURVE)

    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    tile.paste(
        Image.new("RGBA", (size, size), bg + (255,)),
        (0, 0),
        tal.resize((size, size), Image.LANCZOS),
    )

    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    layer.paste(
        Image.new("RGBA", mark.size, fg + (255,)),
        ((size - mark.size[0]) // 2, (size - mark.size[1]) // 2),
        mark,
    )
    return Image.alpha_composite(tile, layer)


def write_ico(path, sizes):
    """Hand-built, because PIL's ICO writer re-samples every frame from one
    image — which would throw away the per-size rendering above and put the
    blur straight back."""
    frames = []
    for s in sizes:
        buf = io.BytesIO()
        render(s).save(buf, format="PNG", optimize=True)
        frames.append((s, buf.getvalue()))

    offset = 6 + 16 * len(frames)
    entries, blobs = b"", b""
    for s, data in frames:
        dim = 0 if s >= 256 else s  # 0 means 256 in the ICO directory
        entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(data), offset)
        blobs += data
        offset += len(data)

    with open(path, "wb") as f:
        f.write(struct.pack("<HHH", 0, 1, len(frames)) + entries + blobs)


STORE_TILES = [
    ("Square30x30Logo", 30), ("Square44x44Logo", 44), ("Square71x71Logo", 71),
    ("Square89x89Logo", 89), ("Square107x107Logo", 107), ("Square142x142Logo", 142),
    ("Square150x150Logo", 150), ("Square284x284Logo", 284), ("Square310x310Logo", 310),
    ("StoreLogo", 50),
]

# 20 and 40 are not decoration: they are what Windows asks for at 125% and
# 150% scaling.
ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]


def main():
    for missing in (SYMBOL, TILE):
        if not os.path.exists(missing):
            sys.exit(f"missing brand source: {missing}")

    os.makedirs(ICONS, exist_ok=True)
    os.makedirs(PUBLIC, exist_ok=True)

    render(32).save(os.path.join(ICONS, "32x32.png"), optimize=True)
    render(128).save(os.path.join(ICONS, "128x128.png"), optimize=True)
    render(256).save(os.path.join(ICONS, "128x128@2x.png"), optimize=True)
    render(512).save(os.path.join(ICONS, "icon.png"), optimize=True)

    for name, s in STORE_TILES:
        render(s).save(os.path.join(ICONS, f"{name}.png"), optimize=True)

    write_ico(os.path.join(ICONS, "icon.ico"), ICO_SIZES)

    # macOS. Written by PIL rather than iconutil, so it has never been
    # checked on a real Mac — do that before any mac release.
    imgs = [render(s) for s in (16, 32, 64, 128, 256, 512, 1024)]
    imgs[0].save(os.path.join(ICONS, "icon.icns"), format="ICNS", append_images=imgs[1:])

    # The browser tab, and an iOS home-screen bookmark.
    render(32).save(os.path.join(PUBLIC, "favicon-32.png"), optimize=True)
    render(180).save(os.path.join(PUBLIC, "favicon.png"), optimize=True)

    print(f"icons written to {ICONS} and {PUBLIC}")
    print("now rebuild: the Windows icon is a compiled-in resource, not a file the app reads")


if __name__ == "__main__":
    main()
