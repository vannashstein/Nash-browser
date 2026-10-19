# Espaces

Sources : structure du fichier local de la sidebar, interface AppleScript publique.
Voir `00-inventaire.md` pour la méthode.

## Ce que fait Arc

- Un espace est un objet de premier rang. Il a un identifiant, un titre, une icône
  (emoji ou pictogramme) et un **thème de fenêtre** complet : un fond, une palette
  principale déclinée en quatre tons (clair teinté, médian, ombré, ombré sombre) et
  une palette sémantique qui suit l'apparence claire ou sombre.
- **L'espace est rattaché à un profil.** L'espace observé ne porte qu'un indicateur
  « profil par défaut ou non ». Le cloisonnement des cookies se fait donc par
  profil, et plusieurs espaces peuvent partager un même profil.
- L'ordre des espaces est une liste à part, synchronisée séparément du contenu.
- Chaque espace pointe vers deux conteneurs d'éléments : la partie épinglée et la
  partie non épinglée (voir `epingles-favoris.md`).
- Côté AppleScript, une fenêtre a un espace actif, et une commande permet de
  basculer d'un espace à l'autre.

## Écart avec Nash

- Arc lie espace et profil, mais la relation n'est pas un-pour-un. Nash (D4) donne à
  chaque espace son propre container. C'est plus strict, et ce cloisonnement fait
  partie du produit, il n'est pas une option.
- La teinte d'Arc est une palette dérivée en plusieurs tons, pas une couleur
  unique. C'est utile pour la v0.3 : générer les tons à partir d'une seule teinte
  choisie, plutôt que de stocker une couleur.

## Inconnues

- Comment les quatre tons sont dérivés de la couleur choisie.
- Ce qu'il advient des onglets ouverts quand on change le profil d'un espace.
