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

    /Users/jf/Nash/                    ce dépôt
    /Users/jf/Nash/src/                clone de mozilla-firefox/firefox, branche esr153
    /Users/jf/Nash/nash-obj-artifact/  objdir des artifact builds
    /Users/jf/Nash/nash-obj-full/      objdir des compilations complètes

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
