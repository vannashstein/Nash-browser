#!/usr/bin/env python3
"""Sème des onglets épinglés dans un profil de dev, pour voir la grille.

Écrit un sessionstore au format mozlz4 sans dépendance : le bloc LZ4 est
émis en littéraux purs, ce qui est un bloc valide que Gecko décompresse
normalement.

    python3 tools/seed-tiles.py .devprofile
"""
import json, os, struct, sys, time

SITES = [
    ("https://mail.google.com/",   "Gmail"),
    ("https://chatgpt.com/",       "ChatGPT"),
    ("https://claude.ai/",         "Claude"),
    ("https://www.crunchyroll.com/", "Crunchyroll"),
    ("https://www.netflix.com/",   "Netflix"),
    ("https://www.notion.so/",     "Notion"),
    ("https://github.com/",        "GitHub"),
    ("https://www.reddit.com/",    "Reddit"),
    ("https://fr.wikipedia.org/",  "Wikipédia"),
]


def lz4_literals(data: bytes) -> bytes:
    """Bloc LZ4 valide composé uniquement de littéraux."""
    out = bytearray()
    n = len(data)
    if n < 15:
        out.append(n << 4)
    else:
        out.append(0xF0)
        rem = n - 15
        while rem >= 255:
            out.append(255)
            rem -= 255
        out.append(rem)
    out += data
    return bytes(out)


def write_mozlz4(path: str, payload: bytes) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(b"mozLz40\0")
        f.write(struct.pack("<I", len(payload)))
        f.write(lz4_literals(payload))


def main() -> None:
    profile = sys.argv[1] if len(sys.argv) > 1 else ".devprofile"
    now = int(time.time() * 1000)

    tabs = [
        {
            "entries": [{"url": url, "title": title, "triggeringPrincipal_base64":
                         "eyIxIjp7fX0="}],
            "lastAccessed": now,
            "index": 1,
            "pinned": True,
            "hidden": False,
            "searchMode": None,
            "userContextId": 0,
        }
        for url, title in SITES
    ]
    tabs.append({
        "entries": [{"url": "about:blank", "title": "New Tab",
                     "triggeringPrincipal_base64": "eyIxIjp7fX0="}],
        "lastAccessed": now, "index": 1, "pinned": False, "hidden": False,
        "searchMode": None, "userContextId": 0,
    })

    session = {
        "version": ["sessionrestore", 1],
        "windows": [{
            "tabs": tabs,
            "selected": len(tabs),
            "_closedTabs": [],
            "busy": False,
            "width": 1280, "height": 800, "screenX": 60, "screenY": 60,
            "sizemode": "normal",
        }],
        "selectedWindow": 1,
        "_closedWindows": [],
        "session": {"lastUpdate": now, "startTime": now, "recentCrashes": 0},
        "global": {},
    }

    payload = json.dumps(session, ensure_ascii=False).encode("utf-8")
    write_mozlz4(os.path.join(profile, "sessionstore-backups", "recovery.jsonlz4"), payload)

    with open(os.path.join(profile, "user.js"), "a", encoding="utf-8") as f:
        f.write('\nuser_pref("browser.startup.page", 3);\n')

    print(f"{len(SITES)} tuiles semées dans {profile}")


if __name__ == "__main__":
    main()
