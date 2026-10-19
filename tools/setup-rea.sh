#!/usr/bin/env bash
# Installe REA (rea-agents) et l'enregistre auprès de l'agent local.
# À lancer sur la machine où Arc est installé. Voir docs/09-analyse-arc.md.
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  echo "REA doit tourner sur le Mac qui contient Arc.app." >&2
  exit 1
fi
if [ ! -d "/Applications/Arc.app" ]; then
  echo "Arc.app introuvable dans /Applications." >&2
  exit 1
fi
command -v node >/dev/null || { echo "Node.js est requis." >&2; exit 1; }

npx rea-agents@latest setup

echo
echo "REA est enregistré. Relancez Claude Code dans ce dépôt."
echo "Cible d'analyse : /Applications/Arc.app"
