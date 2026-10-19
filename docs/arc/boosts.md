# Boosts

Sources : chaînes et noms de types du binaire principal (analyse statique, sans
décompilation), liste des caches locaux.

## Ce que fait Arc

- Un boost est une **personnalisation par site** : CSS, JavaScript, et des
  réglages graphiques simples (masquer des éléments, police, couleurs). Il porte
  un titre, un auteur, et un état activé ou désactivé.
- On crée un boost depuis un menu, puis on l'édite dans un éditeur intégré qui
  dialogue avec la page.
- **Partage par lien.** Arc refuse de partager un boost qui contient du
  JavaScript, et refuse à l'installation un boost partagé qui en contient : seul
  le CSS circule. Le nom de l'auteur n'est pas vérifié, et Arc en avertit
  l'utilisateur.
- Supprimer un boost partagé coupe le lien, mais ceux qui l'ont déjà installé le
  gardent.
- Pas d'installation en navigation privée.
- Les images des boosts sont mises en cache localement. Le partage passe par les
  serveurs de l'éditeur.

## Écart avec Nash

- Une extension Firefox fait déjà la même chose (style et script par site), mais
  avec un modèle de permissions plus lourd. Un boost est une **extension
  personnelle sans manifeste**. Pour Nash, il vaut mieux l'implémenter comme une
  feuille de style et un script utilisateur par origine, gérés par le chrome.
- La règle « pas de JavaScript dans ce qui se partage » est la bonne frontière de
  sécurité. Il faut la reprendre.
- Ce qu'Arc ne fait pas : **un boost par espace**. Le même site pourrait avoir un
  style différent selon le compte (prod en rouge, test en vert). Avec les
  containers, Nash peut le proposer pour presque rien.

## Inconnues

- Le format exact de stockage et la synchronisation éventuelle des boosts.
- L'ordre d'injection par rapport aux scripts de la page.
