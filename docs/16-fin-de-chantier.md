# Fin de chantier : ce qui reste avant de fusionner dans main

Écrit le 19 octobre 2026. L'utilisateur a demandé un travail mené jusqu'au bout sans
aller-retour. Ce document est la définition de "terminé" pour la branche
`analyse-arc`, et la règle de travail entre les deux sessions.

## Qui fait quoi

- **Session cloud** (`session_013hgRussECcsngV2fXJiv79`) : écrit le code de
  l'overlay à partir de `docs/arc/` et des faits mesurés, sans lire de sortie brute
  de REA (règle 2 de `docs/09-analyse-arc.md`). Elle ne peut pas compiler.
- **Session locale** (Mac, Remote Control) : compile, lance, mesure, teste, consigne
  les résultats dans `docs/`, commite et pousse sur `analyse-arc`. Elle répond à la
  session cloud par `send_message`. Elle a lu des sorties de REA : quand elle corrige
  du code, elle le dit dans le message de commit.
- Rien n'est fusionné dans `main` sans une pull request relue.

## Fait et validé

| Fonction | Document | Décision |
|---|---|---|
| Sidebar masquée, révélation au bord | `docs/11` | — |
| Défilement entre espaces | `docs/11` | — |
| Suppression d'espace non destructive | `docs/11` | D12 |
| Archivage par espace | `docs/12` | D13 |
| Grille unique par espace | — | D14 |
| Liens externes en container jetable, onglets rouverts au démarrage | `docs/13`, `docs/14` | D15 |
| Boosts CSS par site et par compte | `docs/15` | D16 |
| Vie privée de la barre d'adresse | `overlay/.../firefox-branding.js` | — |

## Reste à faire, dans cet ordre

1. **Compilation complète** (`./tools/build.sh full`) : le binaire s'appelle `nash`,
   le test d'intégration passe avec `--expect-name Nash`. Mesure : durée, taille,
   résultat de la suite.
2. **Fuite de marque "Nightly"** sur la page des fenêtres privées : trouver d'où elle
   vient (fichier exact) et la corriger dans l'overlay si c'est possible sans patch
   Mozilla.
3. **Vue scindée** : Firefox 153 l'a nativement (`browser.tabs.splitView.enabled` vaut
   vrai dans `browser/app/profile/firefox.js` de la branche esr153). Nash ne la
   réécrit pas (`docs/10`, section 7). Vérifier qu'elle cohabite avec Nash : deux
   containers côte à côte, changement d'espace, archivage, sidebar masquée.
   Corriger ce qui casse. Faits consignés dans `docs/17-vue-scindee.md`.
4. **Palette de commandes** (`docs/10`, section 5) : mémoire "saisie -> choix" par
   espace, sur la barre d'adresse native, locale, sans service tiers.
   `docs/18-palette.md`. Écrite le 19 octobre 2026, à tester.
5. **Teintes dérivées** (`docs/10`, section 1) : vérifier ce que la passe visuelle
   018c96c fait déjà ; compléter seulement si la teinte de l'espace n'est pas déjà
   dérivée en tons lisibles en clair et en sombre.
6. **Revue finale** : test d'intégration et tests du modèle verts sur la
   compilation complète, `README.md` et `docs/05-passation.md` à jour, puis pull
   request de `analyse-arc` vers `main`.

## Hors de ce chantier, par décision

- **Synchronisation** (`docs/10`, section 8) : reportée. Elle demande un choix de
  chiffrement et de stockage qui mérite sa propre décision.
- **Fenêtre légère type Little Arc** : repoussée par D15.
- **Raccourci clavier global** : impossible sans code natif (`docs/13`, B5).
