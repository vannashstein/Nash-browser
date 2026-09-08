# La sidebar, partie par partie

Structure relevée sur Arc le 8 septembre 2026, et adoptée comme plan de
travail. On implémente une partie à la fois.

De haut en bas :

| | Partie | État dans Nash |
|---|---|---|
| 1 | **Extensions** — grille d'icônes d'addons | absente |
| 2 | **Tuiles** — gros logos, containers, espaces | faite (D5, D10) |
| 3 | **Favoris** — sites illimités, dossiers imbriqués | **absente** |
| 4 | **Onglets** — liste filtrée par espace, « New Tab », « Clear » | faite |

Les quatre parties partagent la sidebar mais ne se ressemblent pas : une tuile
est un lanceur d'application, un favori est un signet, un onglet est une page
vivante. Les confondre est l'erreur à éviter.

## Partie 3 — la décision d'architecture

**Les favoris de Nash sont les marque-pages de Firefox**, pas une liste
inventée. `browser/components/sidebar/sidebar-bookmark-list.mjs` fournit déjà
la liste, les dossiers, le glisser-déposer et l'intégration Places.

Ce qu'on obtient sans l'écrire :

- des dossiers réels, imbriqués
- un nombre d'entrées illimité
- le glisser-déposer, y compris depuis et vers d'autres fenêtres
- l'import depuis un autre navigateur, et l'export
- la persistance et les sauvegardes de Places
- la survie aux rebases : on consomme le code amont au lieu de le réécrire

Réinventer tout cela dans `nash.model` serait plusieurs semaines de travail
pour un résultat inférieur.

### Ce qui reste à trancher

**Les favoris appartiennent-ils à l'espace, ou sont-ils communs ?**

- *Par espace* — chaque espace pointe vers un dossier de marque-pages. C'est
  le comportement d'Arc, et il est cohérent avec D4 : l'espace est l'unité de
  contexte.
- *Communs* — un seul arbre, identique dans tous les espaces.

Cette réponse détermine le modèle de données. À trancher avant d'écrire.

## Ordre proposé

**Partie 3 d'abord.** C'est le plus gros manque et ce qui rend la sidebar
utilisable au quotidien.

**Partie 1 ensuite.** Les extensions restent accessibles depuis la barre
d'outils : leur absence de la sidebar est un défaut d'apparence, pas d'usage.

## Non couvert ici

Les sous-menus et boutons secondaires de chaque partie, à relever au fur et à
mesure.
