#!/bin/sh
# An explicit profile is mandatory for artifact builds: the launcher is Firefox.
set -eu
NASH_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
mode=${1:-artifact}
case "$mode" in
  artifact) binary=firefox ;;
  full) binary=nash ;;
  *) echo "Usage: $0 [artifact|full]" >&2; exit 2 ;;
esac
app="$NASH_ROOT/nash-obj-$mode/dist/Nash.app"
if [ "$mode" = artifact ]; then
  python3 "$NASH_ROOT/tools/repair-artifact-helpers.py" "$app"
fi
exec "$app/Contents/MacOS/$binary" -profile "$NASH_ROOT/.devprofile" -no-remote
