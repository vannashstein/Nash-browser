#!/usr/bin/env python3
"""Génère l'icône de Nash — sans dépendance.

Le mark : un N à deux tons sur un carré arrondi indigo. La hampe de droite
porte l'accent chaud ; c'est le seul écart de couleur de tout le navigateur.

    python3 tools/make-icon.py <dossier-branding>
"""
import os, sys, zlib, struct

GROUND_TOP    = (0x2E, 0x35, 0x54)
GROUND_BOTTOM = (0x16, 0x19, 0x26)
INK           = (0xF5, 0xF6, 0xFA)
ACCENT        = (0xE8, 0x83, 0x4A)

MASTER, SSY = 1024, 4
INSET, RADIUS = 0.045, 0.225
NX0, NX1, NY0, NY1, STEM = 0.305, 0.695, 0.285, 0.715, 0.076


def add_span(arr, a, b, w=1.0):
    """Ajoute une couverture w sur [a,b), avec bords fractionnaires."""
    n = len(arr)
    if b <= a: return
    a = max(a, 0.0); b = min(b, float(n))
    if b <= a: return
    ia, ib = int(a), int(b)
    if ia == ib:
        arr[ia] += (b - a) * w; return
    arr[ia] += (ia + 1 - a) * w
    for i in range(ia + 1, min(ib, n)):
        arr[i] += w
    if ib < n:
        arr[ib] += (b - ib) * w


def render(size):
    cov_bg = [[0.0] * size for _ in range(size)]
    cov_ink = [[0.0] * size for _ in range(size)]
    cov_acc = [[0.0] * size for _ in range(size)]

    inset = INSET * size
    left, right = inset, size - inset
    top, bottom = inset, size - inset
    r = RADIUS * (right - left)

    nx0, nx1 = NX0 * size, NX1 * size
    ny0, ny1 = NY0 * size, NY1 * size
    sw = STEM * size
    w = 1.0 / SSY

    for y in range(size):
        bg, ink, acc = cov_bg[y], cov_ink[y], cov_acc[y]
        for s in range(SSY):
            fy = y + (s + 0.5) / SSY

            # carré arrondi
            if top <= fy <= bottom:
                dy = 0.0
                if fy < top + r:      dy = (top + r) - fy
                elif fy > bottom - r: dy = fy - (bottom - r)
                if dy > 0:
                    dx = r - (r * r - dy * dy) ** 0.5 if dy < r else r
                    add_span(bg, left + dx, right - dx, w)
                else:
                    add_span(bg, left, right, w)

            # le N
            if ny0 <= fy <= ny1:
                add_span(ink, nx0, nx0 + sw, w)              # hampe gauche
                t = (fy - ny0) / (ny1 - ny0)                 # diagonale
                xc = (nx0 + sw / 2) + t * ((nx1 - sw / 2) - (nx0 + sw / 2))
                add_span(ink, xc - sw / 2, xc + sw / 2, w)
                add_span(acc, nx1 - sw, nx1, w)              # hampe droite

    px = bytearray(size * size * 4)
    for y in range(size):
        g = y / max(size - 1, 1)
        gr = int(GROUND_TOP[0] + (GROUND_BOTTOM[0] - GROUND_TOP[0]) * g)
        gg = int(GROUND_TOP[1] + (GROUND_BOTTOM[1] - GROUND_TOP[1]) * g)
        gb = int(GROUND_TOP[2] + (GROUND_BOTTOM[2] - GROUND_TOP[2]) * g)
        for x in range(size):
            a = min(cov_bg[y][x], 1.0)
            if a <= 0.0:
                continue
            cr, cg, cb = gr, gg, gb
            for cov, col in ((cov_acc[y][x], ACCENT), (cov_ink[y][x], INK)):
                c = min(cov, 1.0)
                if c > 0:
                    cr = int(cr + (col[0] - cr) * c)
                    cg = int(cg + (col[1] - cg) * c)
                    cb = int(cb + (col[2] - cb) * c)
            i = (y * size + x) * 4
            px[i] = cr; px[i+1] = cg; px[i+2] = cb; px[i+3] = int(a * 255 + 0.5)
    return px


def downsample(px, src, dst):
    if src == dst: return px
    out = bytearray(dst * dst * 4)
    k = src / dst
    for y in range(dst):
        y0, y1 = int(y * k), max(int((y + 1) * k), int(y * k) + 1)
        for x in range(dst):
            x0, x1 = int(x * k), max(int((x + 1) * k), int(x * k) + 1)
            r = g = b = a = n = 0
            for yy in range(y0, min(y1, src)):
                base = yy * src * 4
                for xx in range(x0, min(x1, src)):
                    i = base + xx * 4
                    al = px[i+3]
                    r += px[i] * al; g += px[i+1] * al; b += px[i+2] * al
                    a += al; n += 1
            i = (y * dst + x) * 4
            if a:
                out[i] = r // a; out[i+1] = g // a; out[i+2] = b // a
            out[i+3] = a // n if n else 0
    return out


def write_png(path, size, px):
    raw = b"".join(b"\x00" + bytes(px[y*size*4:(y+1)*size*4]) for y in range(size))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    out = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(out)


def main():
    dest = sys.argv[1] if len(sys.argv) > 1 else "."
    print(f"rendu du master {MASTER}px…", flush=True)
    master = render(MASTER)

    iconset = os.path.join(dest, "nash.iconset")
    os.makedirs(iconset, exist_ok=True)
    for base in (16, 32, 128, 256, 512):
        for scale, suffix in ((1, ""), (2, "@2x")):
            s = base * scale
            write_png(os.path.join(iconset, f"icon_{base}x{base}{suffix}.png"),
                      s, downsample(master, MASTER, s))
            print(f"  iconset {base}x{base}{suffix} ({s}px)", flush=True)

    for s in (16, 22, 24, 32, 48, 64, 128, 256):
        write_png(os.path.join(dest, f"default{s}.png"), s, downsample(master, MASTER, s))
    print("  default16…256.png")


if __name__ == "__main__":
    main()
