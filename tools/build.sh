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
# macOS 26 lit d'abord l'icône du catalogue Assets.car (CFBundleIconName), qui
# reste celui de « unofficial » : le compiler demande Xcode. Sans cette clé,
# macOS prend firefox.icns, généré par tools/make-icon.py (docs/03-branding.md).
app="$NASH_ROOT/nash-obj-$mode/dist/Nash.app"
/usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$app/Contents/Info.plist" 2>/dev/null || true
touch "$app"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app" || true
