#!/usr/bin/env python3
"""Dit si le dernier arrêt d'un profil était propre, comme Gecko le jugera.

Critère de Gecko (SessionStartup.sys.mjs) : la session précédente a planté si
sessionCheckpoints.json, tenu par CrashMonitor, n'a pas le point
"sessionstore-final-state-write-complete". Dans ce cas, le démarrage suivant
ajoute 1 à session.recentCrashes et, au-delà de
browser.sessionstore.max_resumed_crashes, affiche la page de récupération.

recentCrashes est lu dans sessionstore.jsonlz4 (écrit à l'arrêt) ou, à défaut,
sessionstore-backups/recovery.jsonlz4 (écrit pendant que l'instance tourne).

Usage : tools/session-state.py [profil]   (défaut : .devprofile)
Sortie 0 si le dernier arrêt est propre, 1 sinon.
"""
import json
import os
import struct
import sys


def lz4_block(src: bytes, size: int) -> bytes:
    out = bytearray()
    i = 0
    while i < len(src):
        token = src[i]
        i += 1
        n = token >> 4
        if n == 15:
            while True:
                b = src[i]
                i += 1
                n += b
                if b != 255:
                    break
        out += src[i:i + n]
        i += n
        if i >= len(src):
            break
        offset = src[i] | (src[i + 1] << 8)
        i += 2
        m = token & 15
        if m == 15:
            while True:
                b = src[i]
                i += 1
                m += b
                if b != 255:
                    break
        start = len(out) - offset
        for k in range(m + 4):
            out.append(out[start + k])
    if len(out) != size:
        raise ValueError("taille décompressée inattendue")
    return bytes(out)


def read_mozlz4(path: str) -> dict:
    with open(path, "rb") as f:
        data = f.read()
    if data[:8] != b"mozLz40\0":
        raise ValueError(f"{path} : pas un fichier mozlz4")
    (size,) = struct.unpack("<I", data[8:12])
    return json.loads(lz4_block(data[12:], size))


def main() -> int:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    profile = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, ".devprofile")
    try:
        with open(os.path.join(profile, "sessionCheckpoints.json")) as f:
            checkpoints = json.load(f)
    except (OSError, ValueError):
        checkpoints = {}
    clean = bool(checkpoints.get("sessionstore-final-state-write-complete"))

    crashes = "?"
    for name in ("sessionstore.jsonlz4", "sessionstore-backups/recovery.jsonlz4"):
        path = os.path.join(profile, name)
        if os.path.exists(path):
            crashes = read_mozlz4(path).get("session", {}).get("recentCrashes", 0)
            break

    verdict = "arrêt propre" if clean else "planté (ou encore ouvert)"
    print(f"{verdict} — recentCrashes={crashes}")
    return 0 if clean else 1


if __name__ == "__main__":
    sys.exit(main())
