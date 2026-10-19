#!/bin/sh
# Quitte proprement l'instance lancée par run-dev.sh, comme Nash > Quitter.
# kill -TERM ne laisse pas Gecko finir sa fermeture : la session compte alors
# comme plantée (docs/02-build.md). On envoie plutôt l'événement « quitter » de
# macOS au seul processus principal qui tourne sur .devprofile, retrouvé par
# son PID : une autre copie de Nash ouverte n'est pas touchée.
set -eu
NASH_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
profile="$NASH_ROOT/.devprofile"
timeout=${NASH_STOP_TIMEOUT:-30}

pid=$(ps -axo pid=,command= | awk -v p="-profile $profile -no-remote" '
  index($0, p) && ($0 ~ /\/Contents\/MacOS\/(firefox|nash) /) { print $1; exit }')
if [ -z "$pid" ]; then
  echo "Aucune instance de dev ouverte sur $profile."
  exit 0
fi

osascript -l JavaScript - "$pid" >/dev/null <<'EOF'
ObjC.import("AppKit");
function run(argv) {
  const app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(Number(argv[0]));
  if (app.isNil() || !app.terminate) throw new Error("processus introuvable");
}
EOF

i=0
while kill -0 "$pid" 2>/dev/null; do
  if [ "$i" -ge "$timeout" ]; then
    echo "L'instance (PID $pid) tourne encore après ${timeout} s : une boîte de" >&2
    echo "dialogue bloque peut-être la fermeture. Quitter à la main (⌘Q)." >&2
    exit 1
  fi
  sleep 1
  i=$((i + 1))
done
python3 "$NASH_ROOT/tools/session-state.py" "$profile"
