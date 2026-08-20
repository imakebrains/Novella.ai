#!/usr/bin/env python3
"""Regenerate every app icon from the brand source art.

    python scripts/make-icons.py

Sources live in assets/brand/ so this is reproducible on any machine — the
art is 256KB and having it in the tree is cheaper than the afternoon it
costs to work out where it came from. Everything below renders natively
from the 2048px symbol: no frame is ever produced by enlarging a smaller
one.

WHY THIS FILE EXISTS, rather than a one-off resize. Three separate bugs
have made this icon look wrong, and every one of them is easy to
reintroduce by "just resizing the PNG".

1. THE LADDER HAS TO MATCH WHAT WINDOWS ASKS FOR.
   This is the one that actually matters, and it was found last. Windows
   requests icons at logical size x display scaling: 16 logical for small,
   24 for the Windows 11 taskbar, 32 for large. On a 4K screen at 250%
   that is 40, 60 and 80 pixels. The ladder used to run
   ...48, 64, 128... so Windows took the 64px frame and ENLARGED it to 80,
   which is exactly the blocky result the whole file is trying to avoid.
   A missing frame undoes any amount of care spent on the frames that are
   present. SIZES below covers 100% through 300% for all three roles.

2. COMPOSITE FROM THE MASK, NOT FROM A FINISHED TILE.
   Averaging a thin white mark against a near-black tile in sRGB drags
   every edge pixel toward grey; the winding path between the gates came
   out as a smudge. Alpha is linear coverage, so reduce the coverage and
   lay white over charcoal afterwards. Any other order asks sRGB averaging
   to preserve a brightness relationship it does not preserve.

3. FILL, AND KNOWING WHEN TO LEAVE THE EDGE ALONE.
   The source tile's 56% padding is right for a press asset and wrong for
   32 pixels. 74% here, 78% below 24px, because small icons need to be
   optically larger rather than proportionally equal.
   The coverage curve that rescues those tiny frames is deliberately
   capped at 32px: above that there are enough pixels for ordinary
   antialiasing, and steepening a diagonal edge that does not need it just
   trades blur for staircase. An unsharp mask was tried and is worse than
   either — near-binary art rings, and it haloed every gate.

Dilating the mask to save the path was tried and rejected: below 32px it
turns the path into a blob and the gates stop reading as two leaves.

After running this, REBUILD. The Windows icon is compiled into the
executable as a resource, not read from a file at runtime; src-tauri/build.rs
declares assets/brand and the icons directory as inputs so cargo notices.
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

# Only where the reduction is brutal enough to smear a two-pixel feature.
# Above this the edge is better left as honest antialiasing.
CURVE_MAX = 32

# Frames at or above this are stored PNG-compressed rather than as raw DIB.
PNG_FROM = 128


def fill_for(size):
    return 0.78 if size <= 24 else 0.74 if size <= 64 else 0.72


def render(size, fg=(255, 255, 255), bg=CHARCOAL):
    sym, tal = sources()

    target = int(round(size * fill_for(size)))
    scale = target / max(sym.size)
    mark = sym.resize(
        (max(1, round(sym.size[0] * scale)), max(1, round(sym.size[1] * scale))),
        Image.LANCZOS,
    )
    if size <= CURVE_MAX:
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


def _dib_frame(im):
    """A frame as a 32-bit bottom-up DIB with the trailing AND mask.

    PNG-compressed frames are legal from Vista onward and Windows 11 reads
    them, but DIB is what every shell has always understood, and an icon
    is not the place to find out which component is the exception.
    """
    w, h = im.size
    px = im.convert("RGBA").load()

    xor = bytearray()
    for y in range(h - 1, -1, -1):  # DIB rows run bottom-up
        for x in range(w):
            r, g, b, a = px[x, y]
            xor += bytes((b, g, r, a))

    # 1bpp AND mask, rows padded to 4 bytes. Left all-zero (opaque): 32-bit
    # frames are composited from the alpha channel, but the mask must still
    # be present and correctly sized or the frame is rejected outright.
    stride = ((w + 31) // 32) * 4
    and_mask = bytes(stride * h)

    header = struct.pack(
        "<IiiHHIIiiII",
        40,          # biSize
        w,           # biWidth
        h * 2,       # biHeight — XOR and AND stacked
        1,           # biPlanes
        32,          # biBitCount
        0,           # biCompression = BI_RGB
        len(xor) + len(and_mask),
        0, 0, 0, 0,
    )
    return header + bytes(xor) + and_mask


def write_ico(path, sizes):
    """Hand-built, because PIL's ICO writer re-samples every frame from a
    single image — which would throw away the per-size rendering above and
    put the blur straight back."""
    frames = []
    for s in sorted(sizes):
        im = render(s)
        # DIB is uncompressed, so the big frames dominate the file: 128px
        # costs 67KB as a DIB and 4KB as a PNG. Windows has read PNG frames
        # since Vista, and the sizes where it matters are exactly the large
        # ones, so the split goes here.
        if s >= PNG_FROM:
            buf = io.BytesIO()
            im.save(buf, format="PNG", optimize=True)
            frames.append((s, buf.getvalue()))
        else:
            frames.append((s, _dib_frame(im)))

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

# Every size Windows asks for between 100% and 300% scaling, for all three
# icon roles (16 / 24 / 32 logical). 256 is the format's ceiling: an ICO
# directory entry stores each dimension in one byte.
SIZES = [16, 20, 24, 28, 30, 32, 36, 40, 44, 48, 54, 56, 60, 64, 72, 80, 96, 128, 256]


def main():
    for missing in (SYMBOL, TILE):
        if not os.path.exists(missing):
            sys.exit(f"missing brand source: {missing}")

    os.makedirs(ICONS, exist_ok=True)
    os.makedirs(PUBLIC, exist_ok=True)

    render(32).save(os.path.join(ICONS, "32x32.png"), optimize=True)
    render(128).save(os.path.join(ICONS, "128x128.png"), optimize=True)
    render(256).save(os.path.join(ICONS, "128x128@2x.png"), optimize=True)
    render(1024).save(os.path.join(ICONS, "icon.png"), optimize=True)

    for name, s in STORE_TILES:
        render(s).save(os.path.join(ICONS, f"{name}.png"), optimize=True)

    write_ico(os.path.join(ICONS, "icon.ico"), SIZES)

    # macOS. Written by PIL rather than iconutil, so it has never been
    # checked on a real Mac — do that before any mac release.
    imgs = [render(s) for s in (16, 32, 64, 128, 256, 512, 1024)]
    imgs[0].save(os.path.join(ICONS, "icon.icns"), format="ICNS", append_images=imgs[1:])

    # The browser tab, and an iOS home-screen bookmark.
    render(32).save(os.path.join(PUBLIC, "favicon-32.png"), optimize=True)
    render(180).save(os.path.join(PUBLIC, "favicon.png"), optimize=True)

    print(f"icons written to {ICONS} and {PUBLIC}")
    print(f"icon.ico carries {len(SIZES)} frames: {', '.join(str(s) for s in SIZES)}")
    print("now rebuild: the Windows icon is a compiled-in resource, not a file the app reads")


if __name__ == "__main__":
    main()
