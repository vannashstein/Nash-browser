#!/bin/sh
# Reconstruit la marque Nash dans src/ à partir de zéro.
#
# Idempotent : peut être relancé après n'importe quel rebase sur un nouvel ESR.
# Aucun fichier de Mozilla n'est modifié, donc aucun conflit possible — la
# marque Nash dérive de « unofficial », le jeu neutre que Mozilla fournit
# précisément pour les compilations tierces.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC="$ROOT/src"
DST="$SRC/browser/branding/nash"

[ -d "$SRC/browser/branding/unofficial" ] || { echo "src/ introuvable ou incomplet"; exit 1; }

echo "1/5  base « unofficial » -> nash"
rm -rf "$DST"
cp -R "$SRC/browser/branding/unofficial" "$DST"

echo "2/5  application de l'overlay"
cp -R "$ROOT/overlay/browser/" "$SRC/browser/"

echo "3/5  génération des icônes"
python3 "$ROOT/tools/make-icon.py" "$DST"

echo "4/5  assemblage du .icns"
iconutil -c icns "$DST/nash.iconset" -o "$DST/firefox.icns"
cp "$DST/firefox.icns" "$DST/document.icns"
rm -rf "$DST/nash.iconset"

echo "5/5  application des patchs"
for p in "$ROOT"/patches/*.patch; do
  [ -e "$p" ] || continue
  name=$(basename "$p")
  if git -C "$SRC" apply --reverse --check "$p" 2>/dev/null; then
    echo "     $name — déjà appliqué"
  elif git -C "$SRC" apply "$p" 2>/dev/null; then
    echo "     $name — appliqué"
  else
    echo "     $name — ÉCHEC (conflit à résoudre à la main)"; exit 1
  fi
done

echo "OK — Nash reconstruit dans $SRC"
