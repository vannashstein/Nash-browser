# Nash

Un navigateur pour macOS, construit sur Gecko, dont l'organisation, la vie privée
et l'assistance IA appartiennent à celui qui l'utilise.

## Les trois piliers

1. **Vie privée par défaut** — anti-pistage et cloisonnement des cookies actifs
   dès l'installation, aucune télémétrie, aucun compte obligatoire.
2. **Une sidebar à tuiles** — une grille de sites avec leurs logos, rattachée à
   l'espace courant. C'est la fonctionnalité centrale, pas un accessoire.
3. **Une IA à routage explicite** — modèle local ou API distante, choisi par
   espace, jamais silencieux.

## Ce qui rend Nash différent d'un clone d'Arc

L'espace porte le container. Une tuile épinglée « partout » s'instancie dans le
pot à cookies de l'espace où on se trouve : le même geste, la même position, la
même mémoire musculaire — un compte différent. Chromium ne peut pas le faire,
Gecko le fait nativement.

## État

| | |
|---|---|
| Version | **0.4** — sidebar à la Arc, archivage, liens externes isolés, boosts, vue scindée, palette |
| Moteur | Gecko — Firefox **153.6.0esr**, branche `esr153` |
| Cible | macOS d'abord, base multiplateforme conservée |
| Machine de dev | MacBook Pro M1 16 Go (2026) → migration prévue 32-48 Go |

## Structure

    docs/        décisions et spécifications
                 -> 05-passation.md : à lire d'abord si vous reprenez le projet
    build/       mozconfig et outillage de compilation
    patches/     la série de patchs appliquée sur la branche esr153 de Firefox
    prototype/   maquettes d'interface manipulables

## Développer et vérifier

    ./tools/build.sh artifact
    ./tools/run-dev.sh artifact
    node --test tools/tests/model.test.cjs

La v0.3 ajoute les teintes par espace, les thèmes clair/sombre, le filtrage et la
restauration des onglets, les actions et le glisser-déposer des tuiles, les icônes
locales, le choix de session au second espace et les raccourcis clavier.

La v0.4 reprend d'Arc ce qui sert, et le fait passer par les containers :

- **Sidebar masquée** qui réapparaît au bord gauche, défilement horizontal entre espaces.
- **Archivage** des onglets inactifs, par espace (12 h par défaut), restaurables 90 jours.
- **Liens externes** ouverts dans un container jetable : un lien reçu de Mail ou de
  Slack n'écrit pas de cookie dans un espace où ce site n'est pas déjà ouvert : s'il
  l'est, le lien suit ce compte (docs/14). "Ranger dans un espace" le promeut sans
  perdre la page.
- **Boosts** : un style CSS par site, propre à un compte ou commun à tous. Aucun script.
- **Vue scindée** native de Firefox, qui peut mettre deux comptes côte à côte.
- **Palette** : la barre d'adresse retient, par espace, ce que vous choisissez pour une
  saisie, et vous le repropose. Rien ne quitte l'appareil.
- Ni tendances, ni suggestions envoyées au moteur pendant la frappe, ni promotions.

Le détail, les essais mesurés et les limites de chaque fonction sont dans
`docs/05-passation.md` (tableau de la 0.4) et les documents qu'il cite.

`tools/build.sh full` compile aussi l’identité runtime Nash (profil et remoting
séparés). Une version artifact reste réservée au développement sur profil explicite.
Voir `docs/05-passation.md` pour l’architecture et `docs/06-validation.md` pour les
résultats mesurés de compilation et de tests.

## Reprendre le projet

Rien de ce dépôt ne dépend d'une machine particulière. Sur un Mac neuf :

    git clone git@github.com:vannashstein/Nash-browser.git Nash
    cd Nash
    git clone --single-branch --branch esr153 \
      https://github.com/mozilla-firefox/firefox src
    cd src && ./mach bootstrap --application-choice browser_artifact_mode
    cd .. && ./tools/apply-overlay.sh
    cd src && MOZCONFIG=../build/mozconfig.artifact ./mach build

Compter 10 Go pour la source et une heure de téléchargement. L'itération sur
l'interface prend ensuite 30 secondes à 4 minutes.

Lire `docs/05-passation.md` avant tout le reste, puis `docs/08-sidebar-parties.md`
pour l'état de la barre latérale.

Une compilation complète (identité runtime, publication) demande 32 Go de RAM
pour être supportable : sur 16 Go elle a pris **9 h 43** en swap. Voir D9.
