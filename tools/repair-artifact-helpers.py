#!/usr/bin/env python3
"""Repair names compiled into Mozilla's macOS artifact (never change XUL).

The artifact XUL looks for 'Firefox GPU Helper', whereas branding packages a
'Nash GPU Helper'. Relative aliases preserve both the runtime and branded names.
Only artifact builds need this; full builds compile consistent names themselves.
"""
import argparse
from pathlib import Path
import plistlib
import re
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("bundle", type=Path)
args = parser.parse_args()
macos = args.bundle.resolve() / "Contents/MacOS"
strings = subprocess.check_output(["/usr/bin/strings", str(macos / "XUL")], text=True)
for suffix, directory in [("GPU Helper", "gpu-helper.app"),
                          ("Media Plugin Helper", "media-plugin-helper.app")]:
    helper = macos / directory
    with (helper / "Contents/Info.plist").open("rb") as stream:
        executable = plistlib.load(stream)["CFBundleExecutable"]
    binary_dir = helper / "Contents/MacOS"
    source = binary_dir / executable
    if not source.is_file():
        raise SystemExit(f"Missing packaged helper: {source}")
    expected_names = set(re.findall(r"^([\w .-]+ " + re.escape(suffix) + r")$", strings, re.M))
    if not expected_names:
        raise SystemExit(f"Cannot identify compiled name for {suffix}; inspect XUL before repair")
    for name in sorted(expected_names):
        target = binary_dir / name
        if not target.exists():
            target.symlink_to(executable)
            print(f"{directory}: {name} -> {executable}")
        else:
            print(f"{directory}: {name} already present")
