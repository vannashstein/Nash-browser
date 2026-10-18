# Onglets qui s'archivent

Sources : structure et comptages agrégés du fichier local d'archive.

## Ce que fait Arc

- L'archive est un fichier local séparé de la sidebar. Chaque entrée garde **une
  copie entière de l'élément de sidebar** (URL et titre enregistrés, date de
  dernière activité), la **date d'archivage**, le **motif** et la **provenance**.
- Il y a deux motifs : **manuel** (l'utilisateur ferme l'onglet) et
  **automatique** (le délai d'inactivité est écoulé). Sur le profil observé, les
  deux sont à peu près à égalité : environ 300 chacun, sur 598 entrées.
- Trois provenances : un espace (en précisant lequel), Little Arc, ou inconnue.
- À côté, des caches séparés gardent les favicons et des instantanés des pages
  archivées.
- Arc conserve de nombreuses copies horodatées du fichier d'archive (une par
  sauvegarde importante, semble-t-il). Elles ne sont pas purgées : la plus
  ancienne date d'octobre 2025.

### Ajouts de l'analyse du binaire

- **Les seuils proposés** : 1 h, 6 h, 12 h, 24 h, 7 jours, 30 jours, ou jamais.
  Un seuil de quelques secondes existe aussi, réservé au débogage.
- **Le seuil est défini par profil et synchronisé.** Quand on le modifie, Arc
  propose de l'appliquer au profil courant seulement ou à tous les profils.
- Little Arc a son propre seuil, activable séparément (voir `little-arc.md`).
- Seuls les onglets **non épinglés** s'archivent. Une commande archive d'un coup
  tous les onglets non épinglés, une autre ceux au-dessus ou en dessous de
  l'onglet courant.
- **Supprimer un dossier archive son contenu** au lieu de le détruire. On peut
  restaurer un dossier entier, et il revient dans son espace. Une notification
  propose alors d'aller le voir.
- La page d'archive filtre par espace, par Little Arc et par mode de fermeture
  (manuel ou automatique), et regroupe les éléments par tranches de temps.
- Un bandeau dans la sidebar explique l'archivage automatique la première fois
  qu'il agit.

## Écart avec Nash

- Une archive automatique aussi fréquente que l'archive manuelle confirme que la
  règle de délai compte vraiment à l'usage. Nash doit rendre ce délai **réglable
  par espace** et afficher clairement qu'un onglet a été archivé et pourquoi.
- Garder la provenance (quel espace) permet de restaurer l'onglet au bon endroit :
  il faut la stocker.
- Les copies horodatées sans limite d'Arc sont un défaut à ne pas reproduire. Nash
  doit fixer une durée de rétention.

- Le seuil par profil, chez Arc, devient chez Nash un **seuil par espace**, ce qui
  est plus fin pour la même interface. La même gamme de valeurs, « jamais »
  compris, est une bonne base.
- « Supprimer un dossier archive son contenu » est un filet de sécurité à
  reprendre : aucune action sur la sidebar ne doit détruire un onglet sans retour
  possible.

## Inconnues

- La valeur par défaut du seuil.
- Si le contenu de l'archive est synchronisé (le seuil, lui, l'est).
