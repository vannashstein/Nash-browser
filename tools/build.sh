#!/bin/sh
# Build a reproducible local Nash bundle; always apply the overlay first.
set -eu
NASH_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
mode=${1:-artifact}
case "$mode" in
  artifact|full) ;;
  *) echo "Usage: $0 [artifact|full]" >&2; exit 2 ;;
esac
"$NASH_ROOT/tools/apply-overlay.sh"
cd "$NASH_ROOT/src"
MOZCONFIG="$NASH_ROOT/build/mozconfig.$mode" ./mach build
if [ "$mode" = artifact ]; then
  python3 "$NASH_ROOT/tools/repair-artifact-helpers.py" "$NASH_ROOT/nash-obj-artifact/dist/Nash.app"
fi
