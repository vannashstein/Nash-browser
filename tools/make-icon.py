#!/usr/bin/env python3
"""Génère l'icône de Nash, piste « Sillage » — sans dépendance.

Le mark (prototype/logo-pistes.html) : un N sur un carré arrondi couleur nuit.
Les deux hampes sont blanches ; la diagonale est un faisceau qui passe du cyan
au violet puis au rose, avec un halo. Elle figure le passage d'un espace à
l'autre, et le chemin visible de l'IA.

    python3 tools/make-icon.py <dossier-branding>

Toutes les cotes sont en centièmes du côté de l'image, comme le viewBox
0 0 100 100 de la maquette.
"""
import math, os, sys, zlib, struct

NIGHT_TOP    = (0x15, 0x1A, 0x33)
NIGHT_BOTTOM = (0x07, 0x09, 0x0F)
HALO         = (0x3B, 0x4B, 0xFF)
HALO_ALPHA   = 0.35
STEM_TOP     = (0xF4, 0xF6, 0xFF)
STEM_BOTTOM  = (0xB9, 0xC1, 0xDA)
BEAM         = ((0.0, (0x5E, 0xE7, 0xFF)), (0.55, (0x7C, 0x6C, 0xFF)), (1.0, (0xFF, 0x6F, 0xB5)))
GLOW_ALPHA   = 0.9
EDGE_ALPHA   = 0.10

MASTER, SSY = 1024, 4
SQUARE = (9.0, 9.0, 91.0, 91.0, 18.5)          # x0, y0, x1, y1, rayon
STEMS = ((29.0, 27.0, 40.0, 73.0, 2.5), (60.0, 27.0, 71.0, 73.0, 2.5))
BEAM_TOP = (29.0, 40.0)                          # bords gauche et droit, en haut
BEAM_BOTTOM = (60.0, 71.0)                       # bords gauche et droit, en bas
BEAM_Y = (27.0, 73.0)
GLOW_SIGMA = 3.2                                 # flou gaussien de la maquette
GLOW_RES = 128                                   # le halo se calcule à cette taille


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


def rrect_span(row, fy, x0, y0, x1, y1, r, w):
    """Couverture, sur la ligne fy, d'un rectangle aux coins de rayon r."""
    if not (y0 <= fy <= y1): return
    dy = 0.0
    if fy < y0 + r:   dy = (y0 + r) - fy
    elif fy > y1 - r: dy = fy - (y1 - r)
    dx = r - math.sqrt(max(r * r - dy * dy, 0.0)) if dy > 0 else 0.0
    add_span(row, x0 + dx, x1 - dx, w)


def coverage(size):
    k = size / 100.0
    sq = [[0.0] * size for _ in range(size)]
    inner = [[0.0] * size for _ in range(size)]
    stem = [[0.0] * size for _ in range(size)]
    beam = [[0.0] * size for _ in range(size)]
    x0, y0, x1, y1, r = (v * k for v in SQUARE)
    edge = max(1.0, 0.5 * k)                       # filet d'un demi-point
    by0, by1 = BEAM_Y[0] * k, BEAM_Y[1] * k
    w = 1.0 / SSY
    for y in range(size):
        for s in range(SSY):
            fy = y + (s + 0.5) / SSY
            rrect_span(sq[y], fy, x0, y0, x1, y1, r, w)
            rrect_span(inner[y], fy, x0 + edge, y0 + edge, x1 - edge, y1 - edge, r - edge, w)
            for sx0, sy0, sx1, sy1, sr in STEMS:
                rrect_span(stem[y], fy, sx0 * k, sy0 * k, sx1 * k, sy1 * k, sr * k, w)
            if by0 <= fy <= by1:
                t = (fy - by0) / (by1 - by0)
                left = (BEAM_TOP[0] + (BEAM_BOTTOM[0] - BEAM_TOP[0]) * t) * k
                right = (BEAM_TOP[1] + (BEAM_BOTTOM[1] - BEAM_TOP[1]) * t) * k
                add_span(beam[y], left, right, w)
    return sq, inner, stem, beam


def blur(img, size, sigma):
    """Flou gaussien approché par trois flous en boîte, lignes puis colonnes."""
    radius = max(1, int(round(math.sqrt(12 * sigma * sigma / 3 + 1) / 2)))
    win = 2 * radius + 1
    def box_rows(src):
        out = []
        for row in src:
            acc = [0.0] * (size + 1)
            for i, v in enumerate(row):
                acc[i + 1] = acc[i] + v
            out.append([(acc[min(i + radius + 1, size)] - acc[max(i - radius, 0)]) / win
                        for i in range(size)])
        return out
    for _ in range(3):
        img = box_rows(img)
    img = [list(c) for c in zip(*img)]
    for _ in range(3):
        img = box_rows(img)
    return [list(c) for c in zip(*img)]


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def beam_color(x, y, k):
    """Dégradé de la diagonale, sur la boîte englobante du faisceau."""
    bx0, bx1 = BEAM_TOP[0] * k, BEAM_BOTTOM[1] * k
    by0, by1 = BEAM_Y[0] * k, BEAM_Y[1] * k
    p = (((x - bx0) / (bx1 - bx0)) + ((y - by0) / (by1 - by0))) / 2
    p = min(max(p, 0.0), 1.0)
    for (o0, c0), (o1, c1) in zip(BEAM, BEAM[1:]):
        if p <= o1:
            return mix(c0, c1, (p - o0) / (o1 - o0))
    return BEAM[-1][1]


def render(size):
    k = size / 100.0
    sq, inner, stem, beam = coverage(size)
    low = GLOW_RES
    glow = blur(coverage(low)[3], low, GLOW_SIGMA * low / 100.0)

    def glow_at(x, y):
        fx = min(max(x * low / size - 0.5, 0.0), low - 1.0)
        fy = min(max(y * low / size - 0.5, 0.0), low - 1.0)
        ix, iy = int(fx), int(fy)
        jx, jy = min(ix + 1, low - 1), min(iy + 1, low - 1)
        tx, ty = fx - ix, fy - iy
        top = glow[iy][ix] * (1 - tx) + glow[iy][jx] * tx
        bot = glow[jy][ix] * (1 - tx) + glow[jy][jx] * tx
        return top * (1 - ty) + bot * ty

    x0, y0, x1, y1, _ = (v * k for v in SQUARE)
    hcx, hcy = (x0 + x1) / 2, y0 + 0.38 * (y1 - y0)
    hr = 0.6 * (x1 - x0)
    sy0, sy1 = STEMS[0][1] * k, STEMS[0][3] * k

    px = bytearray(size * size * 4)
    for y in range(size):
        cy = y + 0.5
        ground = mix(NIGHT_TOP, NIGHT_BOTTOM, min(max((cy - y0) / (y1 - y0), 0.0), 1.0))
        stem_col = mix(STEM_TOP, STEM_BOTTOM, min(max((cy - sy0) / (sy1 - sy0), 0.0), 1.0))
        for x in range(size):
            a = min(sq[y][x], 1.0)
            if a <= 0.0:
                continue
            cx = x + 0.5
            col = ground
            d = math.hypot(cx - hcx, cy - hcy) / hr
            if d < 1.0:
                col = mix(col, HALO, HALO_ALPHA * (1.0 - d))
            ring = max(a - min(inner[y][x], 1.0), 0.0)
            if ring > 0:
                col = mix(col, (255, 255, 255), EDGE_ALPHA * ring)
            gl = glow_at(cx, cy)
            if gl > 0.002:
                col = mix(col, beam_color(cx, cy, k), min(GLOW_ALPHA * gl, 1.0))
            c = min(stem[y][x], 1.0)
            if c > 0:
                col = mix(col, stem_col, c)
            c = min(beam[y][x], 1.0)
            if c > 0:
                col = mix(col, beam_color(cx, cy, k), c)
            i = (y * size + x) * 4
            px[i] = int(col[0] + 0.5); px[i+1] = int(col[1] + 0.5); px[i+2] = int(col[2] + 0.5)
            px[i+3] = int(a * 255 + 0.5)
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

    # Logo des pages internes (nouvel onglet, À propos) : le même mark.
    content = os.path.join(dest, "content")
    if os.path.isdir(content):
        for name, s in (("about-logo.png", 192), ("about-logo@2x.png", 384)):
            write_png(os.path.join(content, name), s, downsample(master, MASTER, s))
        print("  content/about-logo.png, about-logo@2x.png")


if __name__ == "__main__":
    main()
