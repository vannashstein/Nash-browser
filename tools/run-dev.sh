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
# -purgecaches : le buildID ne change pas, et le drapeau .purgecaches de mach
# ne couvre pas tout ; sans cette option, le profil peut exécuter l'ancien
# nash.js depuis son cache de scripts (docs/02-build.md).
# Pour quitter sans que la session compte comme plantée : tools/stop-dev.sh.
exec "$app/Contents/MacOS/$binary" -profile "$NASH_ROOT/.devprofile" -no-remote -purgecaches
