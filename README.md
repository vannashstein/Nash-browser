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
| Phase | **3 en cours** — sidebar à tuiles v0.3, onglets par espace et containers |
| Moteur | Gecko — Firefox **153.3.0esr**, branche `esr153` |
| Cible | macOS d'abord, base multiplateforme conservée |
| Machine de dev | MacBook Pro M1 16 Go (2026) → migration prévue 32-48 Go |

## Structure

    docs/        décisions et spécifications
                 -> 05-passation.md : à lire d'abord si vous reprenez le projet
    build/       mozconfig et outillage de compilation
    patches/     la série de patchs appliquée sur mozilla-central
    prototype/   maquettes d'interface manipulables

## Développer et vérifier

    ./tools/build.sh artifact
    ./tools/run-dev.sh artifact
    node --test tools/tests/model.test.cjs

La v0.3 ajoute les teintes par espace, les thèmes clair/sombre, le filtrage et la
restauration des onglets, les actions et le glisser-déposer des tuiles, les icônes
locales, le choix de session au second espace et les raccourcis clavier.

`tools/build.sh full` compile aussi l’identité runtime Nash (profil et remoting
séparés). Une version artifact reste réservée au développement sur profil explicite.
Voir `docs/05-passation.md` pour l’architecture et `docs/06-validation.md` pour les
résultats mesurés de compilation et de tests.
