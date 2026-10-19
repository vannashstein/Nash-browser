# Compilation

## Machine de développement

Relevé le 7 septembre 2026.

| | |
|---|---|
| Machine | MacBook Pro 13" — Apple M1, 8 cœurs, 16 Go |
| macOS | 26.5.2 (25F84) |
| Disque libre | 120 Go |
| Xcode CLT | présent — Apple clang 21.0.0 |
| git | 2.50.1 |
| node | 23.11.0 |
| python3 | 3.9.6 (système) — suffisant, `mach` exige 3.9 minimum |
| rustup | absent — inutile en artifact build, requis pour la compilation complète |

## Disposition

    ~/Nash/                    ce dépôt
    ~/Nash/src/                clone de mozilla-firefox/firefox, branche esr153
    ~/Nash/nash-obj-artifact/  objdir des artifact builds
    ~/Nash/nash-obj-full/      objdir des compilations complètes

`src/` et les objdirs sont hors versionnement. Seule la série de patchs
(`patches/`) est suivie.

## Étapes

### 1. Source

    git clone --single-branch --branch esr153 \
      https://github.com/mozilla-firefox/firefox src

### 2. Bootstrap, en mode artifact

    cd src && ./mach bootstrap

Sans assistant interactif :

    ./mach bootstrap --application-choice browser_artifact_mode

(`--vcs` n'est pas une option de `bootstrap` — elle appartient à une autre
commande de `mach_commands.py`.)

**Ce que bootstrap fait réellement sur un Mac Apple Silicon.** Vérifié dans le
code, pas supposé :

- `bootstrap.py` sélectionne `OSXBootstrapperLight` dès que
  `platform.machine() == "arm64"`.
- Son `install_system_packages()` se limite à `ensure_command_line_tools()`.
  La liste Homebrew (`git`, `gnu-tar`, `terminal-notifier`, `watchman`)
  appartient au bootstrapper Intel, pas à celui-ci.
- `install_browser_artifact_mode_packages()` est un `pass`.
- `ensure_rust_modern()` est gardé par `if not self.instance.artifact_mode`,
  donc sauté.

Aucune modification système. Les toolchains de Mozilla sont téléchargées dans
`~/.mozbuild`, un dossier utilisateur.

L'option `--no-system-changes` existe si on veut interdire explicitement toute
installation ; elle sort avant l'étape d'installation en écrivant seulement le
mozconfig.

### 3. Compiler et lancer

    cd src
    MOZCONFIG=../build/mozconfig.artifact ./mach build
    MOZCONFIG=../build/mozconfig.artifact ./mach run

## Version obtenue

`browser/config/version_display.txt` → **153.3.0esr**
Dépôt : 9,8 Go, 468 658 fichiers suivis, branche `esr153`.

## Première compilation — résultat

Le 8 septembre 2026. **Le risque ne s'est pas matérialisé : l'artifact build
fonctionne sur `esr153`.** Taskcluster publie bien des artefacts pour cette
branche. Pas de compilation complète nécessaire.

| | |
|---|---|
| Durée | **3 min 21 s** |
| Avertissements du compilateur | 0 — aucun C++ compilé, conforme au mode artifact |
| Sortie | `nash-obj-artifact/dist/Nightly.app` |
| `--version` | `Mozilla Firefox 153.3.0esr` |
| Architecture | Mach-O arm64 natif |
| Poids de l'objdir | **503 Mo** (et non 30-40 Go) |
| Disque libre après | 109 Go |

L'estimation de 30-40 Go d'objdir valait pour une compilation complète. En mode
artifact, l'empreinte est deux ordres de grandeur plus faible.

**Un signal à retenir** : 2,4 Go d'écriture en swap pendant la compilation. Les
16 Go tiennent, mais sans marge. C'est un argument mesuré pour la migration vers
32-48 Go, indépendamment de l'IA locale.

Le bundle s'appelle `Nightly.app` faute de branding propre — c'est l'objet de la
phase 2.

## Lancer et arrêter l'instance de dev

    ./tools/build.sh artifact
    ./tools/run-dev.sh artifact     # lance Nash sur .devprofile
    ./tools/stop-dev.sh             # le quitte proprement
    ./tools/session-state.py        # dit comment s'est fini le dernier arrêt

### Le cache de scripts garde l'ancien code

Le `buildID` ne change pas d'une compilation à l'autre. Gecko ne vide donc le
cache de scripts du profil (`.devprofile/startupCache/scriptCache*.bin`) que si
on le lui demande. `mach build` le demande en déposant un drapeau
`Nash.app/Contents/Resources/browser/.purgecaches`
(`python/mozbuild/mozbuild/backend/base.py`). Le démarrage suivant vide le cache
et efface le drapeau.

Ce drapeau ne suffit pas. `nash.js` est servi par un lien vers
`src/browser/components/nash/nash.js` : toute modification de `src/` sans
`mach build` (par exemple `apply-overlay.sh` seul), ou faite après qu'un
démarrage a déjà consommé le drapeau, laisse le cache périmé. Gecko exécute
alors l'**ancien** `nash.js` alors que le fichier servi a changé, et un test à
la main porte sur l'ancien code.

`run-dev.sh` passe donc toujours `-purgecaches`. Gecko jette le cache à chaque
démarrage (`toolkit/xre/nsAppRunner.cpp`, même effet que `MOZ_PURGE_CACHES=1`),
ce qui coûte quelques secondes. Si on lance le binaire à la main, il faut
ajouter `-purgecaches` soi-même.

Vérifié le 19 octobre 2026, avec une ligne témoin ajoutée temporairement à la
fin de `nash.js`, qui écrit un fichier dans le profil :

| Étape | Lancement | Code exécuté |
|---|---|---|
| témoin « A », `build.sh artifact` | binaire seul, sans `-purgecaches` | « A » (drapeau de mach) |
| témoin « B », `apply-overlay.sh` seul | binaire seul, sans `-purgecaches` | **« A », périmé** |
| même état | `run-dev.sh` | « B » |
| témoin retiré, `build.sh artifact` | `run-dev.sh` | sans témoin |

### Arrêter sans « planter »

`kill -TERM` (ou ⌃C dans le terminal de `run-dev.sh`) coupe Gecko avant qu'il ait
écrit l'état final de la session. Au démarrage suivant, Gecko compte un plantage :
c'est le critère de `SessionStartup.sys.mjs`, qui vérifie dans
`.devprofile/sessionCheckpoints.json` la présence du point
`sessionstore-final-state-write-complete`. `recentCrashes` monte de 1 à chaque
fois. Au-delà de `browser.sessionstore.max_resumed_crashes` (1), Gecko ne
restaure plus la session et affiche la page de récupération à chaque démarrage.

Pour quitter proprement : menu Nash > Quitter, ⌘Q, ou `./tools/stop-dev.sh`. Le
script retrouve le PID du processus principal lancé avec
`-profile .devprofile -no-remote` et lui envoie l'événement « quitter » de macOS
(`NSRunningApplication.terminate`, via `osascript -l JavaScript`), comme ⌘Q.
Viser le PID plutôt que `quit app "Nash"` évite de fermer une autre copie de
Nash ouverte, et de lancer l'app si elle n'est pas ouverte. Le script attend la
fin du processus (30 s au plus, réglable avec `NASH_STOP_TIMEOUT`), puis
affiche l'état de session. Si une boîte de dialogue bloque la fermeture, il le
signale et ne tue rien.

`tools/session-state.py [profil]` affiche « arrêt propre » ou « planté (ou
encore ouvert) », ainsi que `recentCrashes`. Il sort avec 0 seulement après un
arrêt propre. Après un arrêt propre, le démarrage suivant remet
`recentCrashes` à 0.
