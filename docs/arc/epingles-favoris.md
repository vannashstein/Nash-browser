# Épinglés et favoris

Sources : interface AppleScript publique, structure du fichier local de la sidebar.

## Ce que fait Arc

L'interface AppleScript publique donne à chaque onglet un emplacement parmi trois :
**favori** (la grille en haut de la sidebar), **épinglé** dans l'espace, ou
**ordinaire** (onglet non épinglé de l'espace).

Côté stockage :

- les **favoris** vivent dans un conteneur à part, **global à la fenêtre**, qui ne
  dépend d'aucun espace. Le fichier prévoit une liste de ces conteneurs, avec un
  indicateur « par défaut » : la structure permet plusieurs jeux de favoris, par
  exemple un par profil ;
- les **épinglés** et les **non épinglés** sont deux conteneurs propres à chaque
  espace ;
- un élément épinglé garde l'URL et le titre enregistrés, ainsi que la date de
  dernière activité. C'est ce qui permet de le « remettre » à son adresse
  d'origine après navigation.

## Écart avec Nash

- Les favoris d'Arc correspondent aux tuiles globales de Nash. Mais chez Arc, un
  favori ouvre toujours la même session, celle du profil. Nash fait ici mieux : une
  tuile globale « héritée » s'ouvre dans le container de l'espace courant (D5).
- Pour les épinglés, l'URL d'origine est conservée à part de l'URL courante. Il faut
  prévoir la même chose sur les tuiles, pour pouvoir ramener une tuile à son
  adresse d'origine.

## Inconnues

- Comportement à la fermeture d'un épinglé : retour à l'URL d'origine ou
  déchargement seul. À observer à l'usage.
- La règle qui choisit le jeu de favoris quand il y en a plusieurs.
