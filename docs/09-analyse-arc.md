# Analyse d'Arc avec REA

Objectif : comprendre comment Arc obtient ses comportements, pour les réécrire
dans Nash. On étudie le fonctionnement et l'architecture. On ne reprend ni code,
ni asset, ni texte d'Arc.

## Règle de salle blanche

1. Les constats vont dans `docs/arc/` sous forme de descriptions : comportement
   observé, état manipulé, événements, cas limites. Pas de pseudocode copié,
   pas de noms de symboles privés recopiés en bloc.
2. Celui qui écrit le code de Nash part de ces descriptions, pas du résultat
   brut de REA. Si la même session lit REA et écrit l'overlay, on le dit dans
   le commit.
3. Aucune icône, police, animation ou chaîne de texte d'Arc dans `overlay/`.
4. Le bundle Arc analysé reste sur la machine de développement. Il n'entre
   jamais dans le dépôt (voir `.gitignore`).

## Installation (sur le Mac, là où Arc est installé)

REA ne tourne pas sur la machine cloud : il lui faut `Arc.app` en local.

    ./tools/setup-rea.sh

Le script lance `npx rea-agents setup`, qui enregistre le serveur MCP auprès de
Claude Code et installe les instructions de travail associées. Pour la partie
native (Swift et Chromium), REA s'appuie sur Hopper, Ghidra ou IDA, à installer
séparément. La partie JavaScript et ressources web s'analyse sans moteur natif.

Vérification : relancer Claude Code dans le dépôt et demander la liste des outils
REA.

## Grille d'analyse

Pour chaque ligne : ce que fait Arc, comment (état, événements, stockage), puis
l'équivalent Gecko pour Nash et l'écart.

| Fonction Arc | À établir | Équivalent Nash visé |
|---|---|---|
| Sidebar verticale | structure, redimensionnement, repli, état persisté | tuiles v0.3, à compléter par les onglets |
| Espaces | modèle de données, profils, bascule, teinte | espace = container (D4) |
| Épinglés et favoris | différence entre les deux, comportement à la fermeture | tuiles globales et locales |
| Dossiers d'onglets | imbrication, glisser-déposer, persistance | à décider |
| Onglets qui s'archivent | délai, règle, stockage de l'archive | suspension et archivage, mieux réglables |
| Split view | disposition, redimensionnement, raccourcis | à décider |
| Little Arc | fenêtre rapide pour un lien externe, promotion vers un espace | à décider |
| Palette de commandes | sources de résultats, classement, raccourcis | à décider |
| Boosts | injection CSS/JS par site, stockage, partage | comparer avec les extensions |
| Sync | ce qui est synchronisé, où, chiffré ou non | sans compte obligatoire (pilier 1) |

## Où Nash doit faire mieux

- **Vie privée.** Relever tout ce qu'Arc envoie à l'extérieur : télémétrie,
  appels de synchronisation, IA. Nash n'en a aucun par défaut.
- **IA.** Arc route vers un service imposé. Nash garde le routage explicite
  par espace (pilier 3).
- **Identité.** Arc sépare les profils. Nash isole par espace dans le même
  geste, grâce aux containers.

## Livrables

- `docs/arc/<fonction>.md` : un fichier par ligne de la grille.
- Une mise à jour de `docs/00-decisions.md` pour chaque décision tirée de
  l'analyse (D9 et suivantes), avec le pourquoi.
