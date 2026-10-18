# Sidebar

Sources : noms de types et chaînes du binaire principal (analyse statique, sans
décompilation), structure et valeurs non personnelles (mode et largeur) du fichier
local d'état des fenêtres, relevé public de `docs/08-sidebar-parties.md`. Côté Nash :
`overlay/browser/components/nash/` et les préférences de la marque.

## Ce que fait Arc

### De haut en bas

1. **Barre de fenêtre et navigation.** Les boutons de la fenêtre, puis précédent,
   suivant et recharger. Un appui long ou un menu sur recharger propose d'autres
   options, dont vider les cookies du site avant de recharger. Ces boutons peuvent
   aussi quitter la sidebar et former une barre d'outils séparée en haut de la
   fenêtre (réglage par menu contextuel).
2. **Champ d'adresse** (inférence : sa place exacte dans la colonne reste à
   confirmer à l'usage).
3. **Favoris** : la grille de gros logos, commune à tous les espaces (voir
   `epingles-favoris.md`). La disposition s'adapte à la largeur. Le binaire
   distingue trois gabarits de largeur, du large à l'étroit.
4. **En-tête de l'espace** : nom et icône. Un contrôle replie toute la zone des
   épinglés de cet espace. Le renommage se fait sur place.
5. **Épinglés** de l'espace, avec dossiers imbriqués. Chaque dossier se déplie ou
   se replie.
6. **Séparateur et actions de rangement** : un bouton vide les onglets non épinglés
   de l'espace, sauf l'onglet sélectionné. Un autre, assisté par l'IA, les range.
   Une notification confirme le vidage.
7. **Nouvel onglet**, puis la **liste des onglets non épinglés**. Au survol, chaque
   ligne montre un bouton qui ferme l'onglet et l'envoie à l'archive. D'autres
   indicateurs s'affichent selon l'état : non lu, son en cours, demande
   d'attention.
8. **Bandeaux contextuels** : explication de l'archivage automatique, offres,
   conseils. Ils sont posés dans la colonne et se ferment.
9. **Bas de la colonne**, une barre fixe qui contient :
   - un accès à la **bibliothèque** (téléchargements, médias, captures,
     archive) ;
   - les **icônes des espaces**, qui servent à basculer de l'un à l'autre. On
     peut aussi passer d'un espace à l'autre par un défilement horizontal, chaque
     espace étant une page de la colonne ;
   - un bouton **plus**, qui ouvre un menu de création (nouvel espace, dossier,
     etc.).

Les commandes associées existent aussi au clavier et dans les menus : montrer ou
cacher la sidebar, révéler l'onglet courant dans la liste, aller au dernier
élément, épingler ou désépingler l'onglet courant.

### Redimensionnement

- Une zone de saisie le long du bord permet de tirer pour changer la largeur. Un
  double-clic sur cette même zone déclenche une action distincte (vraisemblablement
  un retour à la largeur par défaut ou un repli, à confirmer).
- Arc note le mode d'affichage au début du geste : un redimensionnement peut donc
  faire changer de mode, par exemple tirer jusqu'au bord pour masquer (inférence).
- Bornes minimale et maximale : inconnues sans décompilation.

### Repli et affichage au survol

- Deux modes d'affichage principaux : **ancrée** (la colonne occupe sa place à
  côté de la page) et **masquée** (la page prend toute la fenêtre, sans aucun
  chrome).
- En mode masqué, **amener la souris au bord gauche de la fenêtre fait apparaître
  la sidebar en flottant** par-dessus la page. Un suivi dédié du survol du bord
  gauche existe pour ça. La sidebar flottante peut ensuite être **verrouillée**,
  c'est-à-dire revenir en mode ancré, par un bouton, ou recachée par un autre.
- Le binaire distingue aussi l'origine d'une bascule (clavier, menu, bouton,
  survol). La bascule se fait par menu, raccourci ou bouton.
- Un autre suivi du survol gère l'**aperçu** d'un élément de la sidebar (une carte
  qui montre la page sans l'ouvrir).

### État mémorisé à la fermeture

Le fichier d'état des fenêtres garde, **par fenêtre** :

- le mode d'affichage et la largeur de la sidebar ;
- l'espace affiché ;
- les éléments dépliés (dossiers ouverts) ;
- les espaces dont la zone épinglée est repliée ;
- l'option « toujours au premier plan » ;
- l'état du split view (volets et volet actif) ;
- les dates de création et de dernière activité des éléments, qui alimentent
  l'archivage automatique.

Une **préférence globale** garde aussi le dernier mode et la dernière largeur,
reprise pour les nouvelles fenêtres. Sur le profil observé, il y a une seule
fenêtre, la sidebar est masquée et la largeur vaut 204 points.

## La sidebar de Nash aujourd'hui

### De haut en bas

Nash s'insère dans la barre latérale verticale native de Firefox 153 (sidebar
réorganisée et onglets verticaux activés par la marque, toujours visible). Dans la
colonne :

1. Le formulaire de création ou de renommage d'espace, quand il est ouvert (D11).
2. La grille **Partout** (tuiles globales), avec son compteur et son bouton
   d'ajout.
3. La grille de l'**espace courant**.
4. L'en-tête de contexte : nom de l'espace et nom de son container.
5. Les **pages gardées** de l'espace (partie 3), avec un bouton de retrait au
   survol.
6. La **liste native des onglets** de Firefox, filtrée par espace.
7. En bas, le **sélecteur d'espaces** : un bouton par espace, avec sa teinte, et
   un bouton de création.

Les boutons natifs de Firefox (outils de la sidebar, personnalisation) restent
gérés par Firefox. Le champ d'adresse et les boutons de navigation restent dans la
barre d'outils du haut. Les onglets épinglés natifs et leur séparateur sont masqués :
Nash les utilise comme stockage des instances de tuiles et des pages gardées.

### Redimensionnement, repli, survol

- La largeur et le repli sont **ceux de Firefox** : Nash n'a pas de poignée à lui.
  La conservation de la largeur et de l'état replié d'une session à l'autre est
  donc celle de Firefox, à vérifier sur la 153.
- Quand la colonne native est repliée, Nash **masque ses grilles et son
  sélecteur** plutôt que de les écraser. Il ne reste que les icônes natives.
- La marque impose « toujours visible ». Firefox propose aussi un mode
  « déplier au survol », mais la règle de masquage de Nash l'exclut volontairement :
  en mode survol, les grilles restent affichées dans la colonne étroite. **Ce cas
  n'a pas été vérifié.**
- Aucun équivalent du mode masqué d'Arc, où la sidebar réapparaît en flottant au
  bord gauche : Firefox ne fait que déplier une colonne déjà présente.

### État mémorisé

- L'**espace courant**, par fenêtre, via la restauration de session.
- Le **modèle** (espaces, tuiles, teintes) dans une préférence, partagé par toutes
  les fenêtres et rechargé dès qu'il change.
- Les **pages gardées** et les instances de tuiles, comme onglets de la session.
- Rien d'autre : ni dossiers dépliés (il n'y a pas encore de dossiers), ni zone
  repliée par espace (pas encore de contrôle de repli).

## Écarts et pistes pour Nash

| Point | Arc | Nash | Piste |
|---|---|---|---|
| Ordre | navigation, favoris, espace, épinglés, onglets, barre du bas | grilles, en-tête, pages gardées, onglets, espaces | même logique ; seule la navigation reste en haut chez Nash, et c'est un choix défendable |
| Bascule d'espace | icônes en bas, plus défilement horizontal | boutons en bas | ajouter le défilement horizontal entre espaces |
| Repli de la zone épinglée | par espace, mémorisé | absent | à ajouter avec la partie 3, mémorisé par fenêtre |
| Vider les onglets | bouton, sauf l'onglet sélectionné, avec archive | prévu (« Clear » dans `08`) | même règle : jamais les pages gardées ni l'onglet courant |
| Redimensionnement | poignée propre, double-clic | natif Firefox | garder le natif ; vérifier la mémorisation |
| Masquée et flottante | bord gauche, verrouillable | absent | principal manque : un mode masqué avec révélation au bord, propre à Nash |
| Déplier au survol | (le mode flottant en tient lieu) | non géré | soit le prendre en charge, soit le désactiver explicitement |
| État par fenêtre | mode, largeur, espace, dossiers, replis | espace seulement | ajouter les replis et les dossiers quand ils existeront |
| Bibliothèque | accès en bas de colonne | absente | relève de Firefox (téléchargements, historique) ; à décider |

## Inconnues

- Les bornes de largeur et la largeur par défaut.
- L'effet exact du double-clic sur la zone de redimensionnement.
- La place précise du champ d'adresse dans la colonne et son comportement quand
  la sidebar est masquée.
- Le délai d'apparition de la sidebar flottante au survol du bord.
- Le comportement de Nash en mode « déplier au survol » de Firefox (à tester).
