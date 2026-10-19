# Little Arc

Sources : chaînes et noms de types du binaire principal (analyse statique, sans
décompilation, voir `00-inventaire.md`), structure du fichier d'archive local.

## Ce que fait Arc

- Little Arc est un **type de fenêtre distinct**, plus petit et plus simple, avec sa
  propre barre d'outils (extensions, menu pour envoyer la page ailleurs). L'application compte à
  part les fenêtres normales et les fenêtres Little Arc.
- Plusieurs points d'entrée :
  - les **liens ouverts depuis une autre application** arrivent dans Little Arc
    (réglable) ;
  - un **raccourci clavier global** ouvre une Little Arc vide pour une recherche
    rapide ;
  - un **clic avec modificateur** sur un lien, en option, l'ouvre dans Little Arc.
- **La promotion vers un espace** est une action explicite : on choisit l'espace de
  destination dans un menu, et l'onglet passe dans une fenêtre normale.
- **Les Little Arc ont leur propre délai d'archivage**, distinct de celui des
  onglets ordinaires et activable séparément. L'archive garde la provenance
  « Little Arc » : on peut la filtrer à part.
- Le Dock et un menu permettent d'afficher ou de fermer toutes les Little Arc
  d'un coup.

## Écart avec Nash

- La question que Little Arc ne pose pas : **dans quel container s'ouvre un lien
  externe ?** Chez Arc, c'est le profil. Pour Nash, c'est le point clé : un lien
  reçu d'une autre application doit soit demander l'espace, soit s'ouvrir dans un
  container temporaire jusqu'à sa promotion. Avec un container temporaire par
  défaut, aucun cookie ne fuit vers un espace que l'utilisateur n'a pas choisi.
- La promotion doit déplacer l'onglet **et** son identité. Dans Gecko, changer de
  container impose de recharger l'onglet. Il faut le dire à l'utilisateur, ou
  promouvoir avant le premier chargement.
- La durée de vie courte et séparée est une bonne idée à reprendre telle quelle.

## Inconnues

- Le délai d'archivage par défaut des Little Arc.
- Le comportement quand l'espace de destination est dans un autre profil.
