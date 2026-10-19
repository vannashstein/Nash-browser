# Dossiers d'onglets

Sources : structure et comptages agrégés du fichier local de la sidebar.

## Ce que fait Arc

- La sidebar est un **arbre plat** : chaque élément porte son identifiant, celui de
  son parent et la liste ordonnée de ses enfants. Les liens sont donc stockés dans
  les deux sens.
- Un élément est d'un type parmi plusieurs : onglet, dossier, conteneur (racine
  d'une partie de la sidebar) et documents propres à Arc (Easel, note).
- **Les dossiers s'imbriquent** : la sidebar observée contient un dossier dans un
  dossier.
- Chaque élément enregistre la date de création, l'appareil d'origine et un
  indicateur « non lu ».

## Écart avec Nash

- Un modèle parent et liste ordonnée d'enfants convient aux tuiles comme aux
  onglets. Le double lien rend le glisser-déposer simple : on retire l'élément de
  la liste de l'ancien parent, on l'insère dans celle du nouveau. En contrepartie,
  il faut garder les deux sens cohérents.
- L'indicateur « non lu » est une idée à reprendre pour les onglets ouverts en
  arrière-plan.

## Inconnues

- Profondeur maximale d'imbrication.
- Ce que deviennent les enfants quand on supprime un dossier.
