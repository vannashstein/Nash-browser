# Marque Nash

## Pourquoi c'est obligatoire

Une compilation non officielle de Firefox n'a le droit ni de s'appeler Firefox
ni d'en porter les icônes. C'est du droit des marques, pas une convention
technique — la même règle qui a imposé Iceweasel à Debian pendant des années.

Mozilla le prévoit : l'arbre contient quatre jeux de marque.

| Jeu | Usage |
|---|---|
| `official` | verrouillé derrière `--enable-official-branding`, réservé à Mozilla |
| `nightly`, `aurora` | canaux internes |
| `unofficial` | **le jeu neutre laissé aux tiers** — nom d'affichage « Nightly » |

C'est de `unofficial` que dérive Nash. Ses icônes ne sont pas le logo Firefox :
Mozilla les a faites génériques exactement pour cet usage.

## Le mécanisme : un overlay, pas des patchs

Tous les fichiers de la marque Nash sont **neufs**, dans un dossier qui n'existe
pas en amont. Un patch ne sert qu'à modifier un fichier de Mozilla ; ici il n'y
en a aucun. La forme correcte est donc un overlay reconstructible.

    overlay/browser/branding/nash/   les fichiers que nous écrivons
    tools/make-icon.py               le générateur d'icônes
    tools/apply-overlay.sh           reconstruit tout dans src/

`apply-overlay.sh` est idempotent et se relance après n'importe quel rebase :

1. copie `unofficial` vers `nash`
2. applique nos fichiers par-dessus
3. régénère les icônes
4. assemble le `.icns`

**Conséquence : la marque Nash ne peut produire aucun conflit de rebase.** Zéro
fichier de Mozilla n'est modifié. `patches/` reste vide jusqu'à la première
vraie modification d'un fichier amont.

## Ce que l'overlay contient

| Fichier | Rôle |
|---|---|
| `configure.sh` | `MOZ_APP_DISPLAYNAME=Nash`, `MOZ_MACBUNDLE_ID=nash` |
| `locales/en-US/brand.ftl` | `-brand-*-name`, `-vendor-short-name` |
| `locales/en-US/brand.properties` | `brandShortName`, `brandFullName` |
| `locales/jar.mn` | empaquetage des chaînes |
| `pref/firefox-branding.js` | **les préférences par défaut de Nash** |

Le nom `firefox-branding.js` est câblé en dur dans
`browser/branding/branding-common.mozbuild` : il ne peut pas être renommé. Mais
son contenu nous appartient entièrement, ce qui en fait le meilleur endroit où
poser les réglages de vie privée — bien meilleur que
`browser/app/profile/firefox.js`, qui produirait un conflit à chaque rebase.

## Identité système — le piège à ne pas manquer

Renommer la marque ne suffit pas. Après la première compilation « Nash », le
fichier `application.ini` du bundle disait encore :

    Vendor=Mozilla
    Name=Firefox
    RemotingName=firefox-default
    CodeName=Nash

Autrement dit : l'interface affichait Nash, mais l'application **utilisait le
profil de Firefox** — `~/Library/Application Support/Firefox` — et se disputait
son socket de remoting. Sur une machine où Firefox est installé, Nash aurait
écrit dans l'historique, les cookies et les marque-pages existants.

`MOZ_APP_BASENAME` et `MOZ_APP_REMOTINGNAME` sont réglables par variable
d'environnement (`build/moz.configure/init.configure` et
`toolkit/moz.configure`). Aucun patch n'est nécessaire ; tout tient dans le
mozconfig :

    export MOZ_APP_BASENAME=Nash          # -> profil ~/Library/Application Support/Nash
    export MOZ_APP_REMOTINGNAME=nash      # -> plus de collision avec Firefox
    export MOZ_APP_NAME=firefox           # conservé, voir ci-dessous
    ac_add_options --with-distribution-id=org.nash

### ⚠ Ces variables n'agissent PAS en artifact build

Vérifié empiriquement le 8 septembre 2026. Malgré `MOZ_APP_BASENAME=Nash` et un
`application.ini` empaqueté qui dit bien `Name=Nash`, l'application crée au
démarrage :

    ~/Library/Application Support/Firefox

Et `--version` affiche toujours `Mozilla Firefox 153.3.0esr`.

La raison : en artifact build, `Contents/MacOS/firefox` est le **lanceur
précompilé téléchargé chez Mozilla**. `MOZ_APP_BASENAME` y est figé à la
compilation. `strings` sur ce binaire ne trouve que `Firefox` et `Mozilla` —
jamais `Nash`. L'`application.ini` n'est lu qu'avec l'argument `-app`.

**Conséquence structurelle, valable bien au-delà de la marque :**

| Ce qui vit dans… | Modifiable en artifact build ? |
|---|---|
| préférences, JS, CSS, couche chrome | **oui** — c'est là que vit toute la sidebar |
| chaînes `brand.*`, empaquetage, `Info.plist`, icône | **oui** |
| tout ce qui est compilé en C++ | **non** |

L'identité runtime (dossier de profil, `--version`, remoting) exige donc une
**compilation complète**. C'est la première chose qui justifie les 2-3 h de
`mozconfig.full`, et ça ne bloque en rien le travail sur la sidebar.

**Pourquoi `MOZ_APP_NAME` reste `firefox`** : il détermine le nom du binaire, et
l'artifact build récupère en amont une archive contenant un exécutable nommé
`firefox`. Le changer casserait l'empaquetage. C'est un nom interne, jamais
montré à l'utilisateur.

**Le bundle id** se compose en `<distribution-id>.<MOZ_MACBUNDLE_ID>`. Laissé
au défaut, il donnait `org.mozilla.nash` — ce qui revendique à tort le namespace
de Mozilla. D'où `org.nash.browser`.

### Ce qui reste au nom de Mozilla

Deux valeurs sont posées par `imply_option` dans `browser/moz.configure`, ce qui
interdit de les surcharger par l'environnement :

| Valeur | État | Conséquence |
|---|---|---|
| `MOZ_APP_VENDOR` | `Mozilla` | apparaît dans quelques chaînes internes |
| `MOZ_APP_ID` | UUID de Firefox | identifie l'application auprès des extensions |

Les changer demanderait le premier vrai patch dans `patches/`. Pour `MOZ_APP_ID`
c'est même déconseillé : de nombreuses extensions déclarent explicitement l'UUID
de Firefox dans leur manifeste et cesseraient de s'installer. À laisser tel quel
tant qu'aucun besoin concret ne l'impose.

## L'icône

Générée par `tools/make-icon.py`, sans aucune dépendance : PNG écrits à la main
via `zlib`, anti-aliasing par couverture fractionnaire.

**Piste « Sillage »**, choisie le 19 octobre 2026 parmi quatre
(`prototype/logo-pistes.html`). Un N sur un carré arrondi couleur nuit
(`#151A33` → `#07090F`, halo bleu). Les deux hampes sont blanches ; la diagonale
est un faisceau cyan → violet → rose (`#5EE7FF`, `#7C6CFF`, `#FF6FB5`) avec un
halo. Elle figure le passage d'un espace à l'autre, et le chemin visible que
prend l'IA. Le mark reste une lettre parce qu'à 16 px, une lettre survit là où
un pictogramme devient une bouillie. Il remplace le N indigo à hampe orange.

Ce qui porte le mark :

- l'icône de l'application (`firefox.icns`, Dock et Finder) et les PNG
  `default16…256`, générés par `tools/make-icon.py` ;
- `content/about-logo.png` et `@2x`, générés par le même script ;
- `overlay/browser/branding/nash/content/about-logo.svg` (même dessin, en SVG),
  `firefox-wordmark.svg` et `about-wordmark.svg` (le nom « Nash »), qui
  remplacent ceux de `unofficial`.

### Le piège de macOS 26 : Assets.car

macOS 26 prend d'abord l'icône dans le catalogue `Assets.car` désigné par
`CFBundleIconName`, et `unofficial` y range un globe. Tant que cette clé reste
dans `Info.plist`, le Dock montre ce globe, quel que soit `firefox.icns`.
Compiler un `Assets.car` demande `actool`, donc Xcode, absent de la machine.
`tools/build.sh` retire donc la clé de l'application construite, puis la
réenregistre auprès de LaunchServices : macOS prend `firefox.icns`. Pas de patch
de fichier Mozilla. Vérifié le 19 octobre 2026 : le Dock et la fenêtre « À propos
de Nash » montrent Sillage. Une instance lancée avant la compilation garde
l'ancienne icône jusqu'à sa fermeture.

À faire plus tard : un `Assets.car` Sillage, fait avec Icon Composer et Xcode,
pour l'effet de verre de macOS 26.

### Nouvel onglet : vérifié

La page Nouvel onglet montre le N Sillage et « Nash » (vérifié le 19 octobre 2026
sur un profil neuf). Le globe et « Nightly » encore vus venaient d'une instance
lancée **avant** la compilation : elle garde l'ancienne image en mémoire. Quitter
Nash et le relancer suffit. Le mot « Nash » n'apparaît que si la fenêtre est
assez large ; la page de Firefox le masque sinon.
