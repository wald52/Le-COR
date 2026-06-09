#!/usr/bin/env python3
"""Génère les icônes PNG de la PWA sans dépendance externe (zlib seulement).

Rasterise une version simplifiée de icon.svg : carré arrondi bleu COR + trois
courbes superposées (le motif « projections »). Réexécuter si l'on change le
visuel : `python3 icons/make_icons.py`.
"""
import struct, zlib, math

BG = (31, 78, 121)      # bleu COR
CURVES = [
    ((255, 255, 255), [(80, 360), (180, 330), (280, 300), (380, 250), (432, 150)]),
    ((127, 209, 168), [(80, 360), (180, 345), (280, 335), (380, 330), (432, 320)]),
    ((255, 158, 77),  [(80, 360), (180, 340), (280, 300), (380, 210), (432, 360)]),
]
DOT = (432, 150)


def dist_to_seg(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def render(size, maskable=False):
    s = size / 512.0
    radius = 0 if maskable else 96 * s     # maskable : carré plein (la zone sûre est gérée par l'OS)
    half = 9 * s                            # demi-épaisseur des courbes
    px_buf = bytearray()
    for y in range(size):
        px_buf.append(0)  # filtre PNG : aucun
        for x in range(size):
            r, g, b = 247, 248, 251  # fond hors du carré arrondi (quasi blanc)
            inside = True
            if radius > 0:
                inside = in_rounded(x, y, size, radius)
            if inside:
                r, g, b = BG
                # courbes
                sx, sy = x / s, y / s
                for color, pts in CURVES:
                    d = min(dist_to_seg(sx, sy, *pts[i], *pts[i + 1]) for i in range(len(pts) - 1))
                    if d <= half / s:
                        r, g, b = color
                        break
                # point final
                if math.hypot(sx - DOT[0], sy - DOT[1]) <= 14:
                    r, g, b = 255, 255, 255
            px_buf.extend((r, g, b))
    return png_bytes(size, size, bytes(px_buf))


def in_rounded(x, y, size, radius):
    rx = min(x, size - 1 - x)
    ry = min(y, size - 1 - y)
    if rx >= radius or ry >= radius:
        return True
    return math.hypot(radius - rx, radius - ry) <= radius


def png_bytes(w, h, raw):
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)  # 8 bits, RGB
    idat = zlib.compress(raw, 9)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


if __name__ == "__main__":
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    for size, name, mask in [(192, "icon-192.png", False),
                             (512, "icon-512.png", False),
                             (512, "icon-maskable.png", True)]:
        path = os.path.join(here, name)
        with open(path, "wb") as f:
            f.write(render(size, mask))
        print("écrit", name)
