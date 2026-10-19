# Split view

Sources : chaînes et noms de types du binaire principal (analyse statique, sans
décompilation).

## Ce que fait Arc

- Un split view est un **élément de sidebar à part entière**, et pas un état de
  fenêtre. Il a son propre titre de repli et se range dans la sidebar comme un
  onglet.
- Les volets s'ajoutent **dans les quatre directions** (haut, bas, gauche,
  droite). Une disposition entière peut basculer entre horizontal et vertical.
- Il y a plusieurs façons de créer un split :
  - **glisser un onglet de la sidebar vers le milieu de la page** (c'est le geste
    mis en avant à la découverte) ;
  - une commande qui ajoute l'onglet courant au split ;
  - copier une URL dans un nouveau volet.
- On peut **détacher** un volet pour en refaire un onglet ordinaire, ou le fermer
  seul.
- La palette de commandes sait qu'un onglet est dans un split : choisir cet
  onglet parmi les résultats ouvre le split qui le contient.
- L'IA de recherche peut, d'après un prompt embarqué, renvoyer ses résultats sous
  forme de split quand la requête le demande explicitement.

## Écart avec Nash

- Faire du split un élément de sidebar est le bon choix : il survit à la
  fermeture de la fenêtre et se range comme le reste. Nash peut en faire un
  élément de l'arbre des onglets (voir `dossiers.md`).
- La question propre à Nash : **un split peut-il mêler deux containers ?**
  Techniquement oui (un onglet par volet), et c'est même un cas d'usage fort :
  comparer deux comptes côte à côte. Il faut que chaque volet porte sa teinte.
- Le glisser-déposer vers le centre de la page complète bien D10 (glisser un
  onglet dans la grille). On garde le même vocabulaire de gestes.

## Inconnues

- Le nombre maximal de volets.
- Les raccourcis clavier par défaut (à relever dans les menus).
- Comment se redimensionnent les volets et si les proportions sont mémorisées.
