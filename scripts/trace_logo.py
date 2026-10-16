"""Redraws the 613 Automotive logo as SVG.

The "613" and "AUTOMOTIVE" lettering are traced from the client's JPEG (upscaled first),
the stripes and rules are drawn as clean geometry from measured positions, and the
small tagline is set in Saira from the woff2 file.
"""
import sys

import numpy as np
import potrace
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image

SRC, SAIRA, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
SCALE = 6


def trace(box):
    x0, y0, x1, y1 = box
    crop = Image.open(SRC).convert("RGB").crop(box)
    big = crop.resize(((x1 - x0) * SCALE, (y1 - y0) * SCALE), Image.LANCZOS)
    a = np.asarray(big).astype(int)
    mask = (a[..., 0] > 140) & (a[..., 1] > 140) & (a[..., 2] > 140)
    bmp = potrace.Bitmap(~mask)
    plist = bmp.trace(turdsize=40, alphamax=0.9, opticurve=True, opttolerance=0.2)
    def pt(p):
        return f"{x0 + p.x / SCALE:.2f} {y0 + p.y / SCALE:.2f}"
    d = []
    for curve in plist:
        d.append(f"M{pt(curve.start_point)}")
        for seg in curve.segments:
            if seg.is_corner:
                d.append(f"L{pt(seg.c)}L{pt(seg.end_point)}")
            else:
                d.append(f"C{pt(seg.c1)} {pt(seg.c2)} {pt(seg.end_point)}")
        d.append("Z")
    return "".join(d)


def text_path(font_file, text, x, baseline, size, tracking):
    font = TTFont(font_file)
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    s = size / upm
    pen = SVGPathPen(gs)
    cx = x
    for ch in text:
        g = cmap[ord(ch)]
        tp = TransformPen(pen, (s, 0, 0, -s, cx, baseline))
        gs[g].draw(tp)
        cx += gs[g].width * s + tracking
    return pen.getCommands(), cx - tracking - x


numbers = trace((355, 244, 824, 343))
word = trace((180, 350, 780, 387))

# Stripes: parallelograms, 28 wide, top at y=252, bottom at y=335
stripes = []
for i in range(3):
    tl = 273 + 46 * i
    bl = 198 + 46.5 * i
    stripes.append(f"M{tl} 252H{tl + 28}L{bl + 28} 335H{bl}Z")

# Tagline in Saira 500, fitted between the two yellow rules
tag = "AUTOMOTIVE REFINISHING & RESTORATION"
d, w = text_path(SAIRA, tag, 0, 0, 15, 1.6)
target_w = 720 - 244
size = 15 * target_w / w
tag_d, tag_w = text_path(SAIRA, tag, 244, 418.5, size, 1.6 * target_w / w)

rules = "M188 412H224V415H188ZM737 412H773V415H737Z"

VIEW = "178 240 650 190"


def svg(fg, accent, bg=None):
    rect = f'<rect x="178" y="240" width="650" height="190" fill="{bg}"/>' if bg else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VIEW}" role="img" aria-label="613 Automotive">'
        f"{rect}"
        f'<path fill="{accent}" d="{"".join(stripes)}{rules}"/>'
        f'<path fill="{fg}" fill-rule="evenodd" d="{numbers}{word}"/>'
        f'<path fill="{fg}" d="{tag_d}"/>'
        "</svg>"
    )


def mark(fg, accent):
    # Compact mark for the app bar and icons: stripes + 613 only
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="190 244 636 99" role="img" aria-label="613 Automotive">'
        f'<path fill="{accent}" d="{"".join(stripes)}"/>'
        f'<path fill="{fg}" fill-rule="evenodd" d="{numbers}"/>'
        "</svg>"
    )


def icon():
    # Square app icon: black tile, stripes + 613 centred
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="173 -40.5 668 668">'
        '<rect x="173" y="-40.5" width="668" height="668" rx="0" fill="#0B0B0B"/>'
        f'<g><path fill="#FDCE07" d="{"".join(stripes)}"/>'
        f'<path fill="#FFFFFF" fill-rule="evenodd" d="{numbers}"/></g>'
        "</svg>"
    )


files = {
    "logo-on-dark.svg": svg("#FFFFFF", "#FDCE07"),
    "logo-on-light.svg": svg("#0B0B0B", "#FDCE07"),
    "logo-print.svg": svg("#0B0B0B", "#E0B400"),
    "mark-on-dark.svg": mark("#FFFFFF", "#FDCE07"),
    "mark-on-light.svg": mark("#0B0B0B", "#FDCE07"),
    "icon.svg": icon(),
}
for name, body in files.items():
    with open(f"{OUT}/{name}", "w") as f:
        f.write(body)
    print(name, len(body))
