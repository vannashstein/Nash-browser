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

## Partie 3 — ce que c'est, et ce que ce n'est pas

**Correction du 8 septembre 2026.** Cette partie avait d'abord été spécifiée
comme une vue sur les marque-pages de Firefox. C'était faux.

Ce ne sont pas des signets. Ce sont **des onglets vivants que l'on remonte**
depuis la liste du dessous, parce qu'on ne veut pas perdre la page en cours.

Le geste : on est sur une page, elle compte, on la fait glisser vers la zone
supérieure. Elle y reste, avec son titre. On l'enlève quand on veut.

### Trois niveaux, pas deux

| Niveau | Ce que c'est | Comment ça s'affiche |
|---|---|---|
| Partie 2 — tuile | **un site** qu'on veut toujours sous la main | un logo, sans texte |
| Partie 3 — page gardée | **cette page précise** qu'on ne veut pas perdre | favicon et titre |
| Partie 4 — onglet | la page du moment | favicon et titre, balayable |

C'est la distinction qui manquait au modèle : une tuile désigne un *site*, une
page gardée désigne un *contenu*. Les confondre reviendrait à remplacer le
titre d'un article par le logo de son journal.

### Ce que ça implique

- Une page gardée reste un onglet réel, pas une entrée de base de données.
- Le séparateur `Clear` balaie les onglets du dessous, **jamais** les pages
  gardées.
- Elles survivent au redémarrage.
- On les retire à volonté, et on peut les redescendre.
- Elles se regroupent en dossiers — à traiter après le geste lui-même.

### Comportement d'Arc, relevé dans sa documentation

Vérifié le 8 septembre 2026 sur `resources.arc.net`. Arc appelle cette partie
les *Pinned Tabs*, et documente explicitement l'absence de marque-pages : ils
ont mis des onglets épinglés à la place.

| Point | Comportement |
|---|---|
| Portée | **rattachés à un espace**, un seul. Question tranchée. |
| Balayage | **jamais** archivés automatiquement |
| Regroupement | dossiers, imbriqués |
| Raccourci | ⌘D épingle et désépingle |
| Geste | glisser au-dessus de la ligne pour épingler, en dessous pour retirer |
| Repli | un chevron près du titre de l'espace masque toute la zone |
| Duplication | clic droit, ou glisser en tenant Option |

#### Deux comportements qui font la valeur de la chose

**Le confinement.** Un onglet épinglé se comporte comme une application : il
reste sur son site. Cliquer un lien qui ferait quitter le site n'écrase pas
l'onglet — Arc ouvre une fenêtre de survol par-dessus. On garde donc toujours
son New York Times, même après avoir suivi un lien sortant.

**Le retour à l'origine.** Un onglet épinglé garde l'adresse à laquelle il a
été épinglé et sait y revenir : un clic sur son icône le réinitialise. Et
tant qu'on est ailleurs que sur cette adresse, **une barre oblique précède son
titre** dans la barre latérale. C'est ce que montre « / Beeg » sur la capture
du 8 septembre : cet onglet a navigué ailleurs.

Ces deux points sont ce qui distingue l'onglet épinglé d'un simple onglet
qu'on aurait remonté. Sans eux, la zone n'est qu'une liste.

### Où Nash diffère déjà, volontairement

Arc rend ses *Favorites* — la grille de logos — **communs à tous les espaces**.
Nash a en plus une grille propre à chaque espace, parce que la ligne globale
seule finit en fourre-tout (D10, et le plafond retiré de D6). C'est un écart
assumé, pas un oubli.

### Conséquence technique

Les onglets épinglés de Firefox servent déjà de stockage aux instances des
tuiles (partie 2). La partie 3 a donc besoin de son propre marqueur plutôt que
d'un second usage du même mécanisme : un onglet ordinaire porteur d'un
attribut Nash, rendu dans sa liste, exclu du balayage et persisté par la
session.

## Ordre proposé

**Partie 3 d'abord.** C'est le plus gros manque et ce qui rend la sidebar
utilisable au quotidien.

**Partie 1 ensuite.** Les extensions restent accessibles depuis la barre
d'outils : leur absence de la sidebar est un défaut d'apparence, pas d'usage.

## Non couvert ici

Les sous-menus et boutons secondaires de chaque partie, à relever au fur et à
mesure.
