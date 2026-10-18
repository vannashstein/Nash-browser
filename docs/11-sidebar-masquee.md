# Sidebar masquée, révélée au bord gauche

Pourquoi : `docs/arc/sidebar.md` montre que c'est le manque principal de Nash
face à Arc. Écrit sans lire de sortie brute de REA.

## Ce que Firefox 153 (branche esr153) fait déjà

Relevé dans `browser/components/sidebar/browser-sidebar.js` et
`SidebarState.sys.mjs` :

- Réglage `sidebar.visibility` : `always-show`, `expand-on-hover`, `hide-sidebar`.
- En `hide-sidebar` avec onglets verticaux, la colonne est **cachée** au démarrage
  et seul le bouton de la barre d'outils la montre. Il n'y a **pas de révélation
  au bord**.
- `SidebarState.updateVisibility(visible)` montre ou cache le conteneur et son
  séparateur. La colonne **repousse la page** (elle est dans la mise en page).
- `expand-on-hover` agrandit une colonne étroite au survol. Ce n'est pas le mode
  masqué : la colonne reste présente en permanence.

## Ce que Nash ajoute

Une bande invisible de 6 px au bord gauche (`#nash-edge`). Après 150 ms de
survol, la colonne apparaît **par-dessus** la page (position absolue, sans
repousser le contenu). Elle se recache 350 ms après la sortie de la souris, sauf
si un menu est ouvert. Échap la recache. Le bouton "Fixer" la verrouille : il
remet `sidebar.visibility` à `always-show`.

Valeurs 150 ms et 350 ms : choix de Nash, à ajuster à l'usage. Aucune valeur
d'Arc n'est reprise (elles sont d'ailleurs inconnues).

## État

- Code dans `overlay/browser/components/nash/nash.js` (`installPeek` et
  méthodes `*Peek`) et `nash.css` (fin de fichier).
- Réglage `nash.sidebar.peek`, vrai par défaut, et mode masqué par défaut
  depuis le 18 octobre 2026 (voir la fin du fichier).
- **Testé le 18 octobre 2026** sur une compilation artifact (esr153, commit
  9bf5011493d5), à la souris sur la vraie fenêtre. Résultats ci-dessous. Le
  réglage reste faux par défaut tant que les risques connus ne sont pas levés.

## À tester sur le Mac

1. `about:config` : `nash.sidebar.peek` = true, `sidebar.visibility` = `hide-sidebar`.
2. Amener la souris au bord gauche : la colonne doit flotter sans décaler la page.
3. Sortir : elle se cache. Ouvrir un menu contextuel dans la colonne : elle reste.
4. "Fixer" : la colonne devient ancrée et la page se décale.
5. Échap pendant la révélation.
6. Fenêtre privée, plein écran, deuxième fenêtre : pas de bande parasite, pas
   d'erreur dans la console.

## Résultats du 18 octobre 2026

| # | Test | Résultat |
|---|---|---|
| 1 | Réglages dans `about:config` | fait |
| 2 | Révélation au bord, sans décaler la page | **réussi** |
| 3 | Masquage à la sortie ; reste affichée avec un menu ouvert | **échec partiel, corrigé** (voir plus bas) |
| 4 | « Fixer » : colonne ancrée, page décalée, réglage à `always-show` | **réussi** |
| 5 | Échap pendant la révélation, même souris sur la colonne | **réussi** |
| 6 | Deuxième fenêtre, plein écran, fenêtre privée, console | **réussi** |

### Test 3 : l'échec et sa correction

**Symptôme.** Quand la souris quittait la bande du bord sans traverser la colonne
(geste rapide vers la droite, ou sortie de la fenêtre par la gauche), la colonne
restait affichée indéfiniment. Seuls Échap ou un passage sur la colonne la
cachaient.

**Cause.** La bande est au-dessus des premiers pixels de la colonne. Une souris
qui n'a touché que la bande n'est jamais entrée dans la colonne, donc la sortie
de la colonne, seul déclencheur du masquage, ne se produisait jamais. La sortie
de la bande annulait seulement l'apparition en attente.

**Correction.** La sortie de la bande planifie aussi le masquage (même délai de
350 ms). Entrer dans la colonne l'annule, comme avant.

**Vérifié après recompilation :**

- sortie directe depuis la bande : la colonne se cache ;
- sortie de la fenêtre par la gauche : la colonne se cache ;
- passage de la bande à la colonne : la colonne **reste** affichée ;
- sortie progressive en traversant la colonne : la colonne se cache ;
- menu contextuel ouvert depuis la colonne, souris sortie : la colonne reste,
  puis se cache une fois le menu fermé.

### Détails du test 6

- **Deuxième fenêtre** : même comportement que la première. Chaque fenêtre a sa
  propre bande.
- **Plein écran** : la révélation fonctionne au bord de l'écran, sans bande
  visible.
- **Fenêtre privée** : Nash ne s'y installe pas, comme prévu. Il n'y a ni bande ni
  révélation.
- **Console du navigateur** : aucune erreur de Nash, et l'initialisation est
  journalisée une fois par fenêtre. Seules deux erreurs du gestionnaire de
  plantages de Firefox apparaissent : il cherche un dossier sous le répertoire
  applicatif de Firefox, ce qui est attendu en artifact (D9). Elles sont sans
  rapport avec la sidebar.

### Observé en passant, hors liste

- La saisie d'une valeur invalide dans `sidebar.visibility` replie la colonne
  native, et Nash y affiche alors ses grilles **écrasées** dans la colonne
  étroite. C'est le même trou que le cas « déplier au survol » de
  `docs/arc/sidebar.md` : la règle de masquage de Nash ne couvre pas tous les
  états repliés.
- Le bouton « Fixer » s'affiche entre les pages gardées et la liste des onglets,
  pas en tête de colonne. Rien dans la spécification n'impose sa place.
- La page d'accueil des fenêtres privées porte encore la marque « Nightly ».
  C'est sans rapport avec la sidebar, mais c'est une fuite de marque à traiter
  dans `docs/03-branding.md`.

### Non vérifiable par ces tests

- Le décalage bref de la page pendant l'animation native : il n'est pas visible
  sur des captures prises après coup.
- Les langues de droite à gauche et la barre de défilement à gauche.

## Risques connus

- `SidebarController._state` est une API **interne** de Firefox. À revérifier à
  chaque rebase ESR (D8).
- `updateVisibility` déclenche l'animation native de Firefox. Elle peut décaler
  brièvement la page avant que `position: absolute` s'applique.
- La bande de 6 px recouvre le bord gauche de la page quand elle est active. Elle
  gêne une barre de défilement à gauche (langues de droite à gauche : à tester).
- Le séparateur et la poignée de redimensionnement ne sont pas gérés en mode
  flottant.

## Suite du 18 octobre 2026 (écrite depuis la session cloud, non testée)

- **Colonne repliée.** Au lieu de lire l'état de Firefox, Nash mesure la largeur
  de `#sidebar-main` (`installNarrow`, `ResizeObserver`) et pose `nash-narrow`
  sur la racine sous 120 px. Les grilles, le sélecteur d'espaces et le bouton
  "Fixer" sont masqués dans ce cas. Seuil choisi par Nash, à ajuster. L'ancienne
  règle reste en filet de sécurité.
- **Bouton "Fixer"** : `order: -2` le place en tête de colonne. La bande des
  grilles a `order: -1`, ce qui le laissait en dessous.
- **Réglage `nash.sidebar.peek` vrai par défaut.** Il n'a d'effet que si
  `sidebar.visibility` vaut `hide-sidebar`, ce que la marque n'impose pas.
- **À tester** : valeur invalide dans `sidebar.visibility` (les grilles ne
  doivent plus apparaître écrasées), `expand-on-hover` (grilles absentes replié,
  présentes au survol), position du bouton "Fixer".

### Résultats du test du commit 1427cde (session locale, 18 octobre 2026)

Rapportés par la session locale, compilation artifact, sans erreur de Nash en
console.

| Test | Résultat |
|---|---|
| Valeur invalide dans `sidebar.visibility`, partie de `always-show` | réussi : icônes natives seules, aucune grille écrasée |
| Même valeur invalide, partie de `hide-sidebar` | colonne laissée cachée |
| `expand-on-hover` replié | réussi : grilles, sélecteur et "Fixer" absents |
| `expand-on-hover` au survol | réussi : grilles présentes, puis cachées au repli |
| "Fixer" en tête de colonne | réussi en mode masqué, absent quand la colonne est ancrée |

Reste ouvert : mesurer `#sidebar-main` avec un panneau d'outils ouvert (historique,
favoris) n'a pas été testé.

## Défilement horizontal entre espaces

Geste horizontal au trackpad sur la colonne : espace précédent ou suivant, sans
bouclage. Seuil 60 px, nouveau geste accepté après 200 ms sans événement (pour
absorber l'inertie). Valeurs de Nash, à ajuster.

### Premier test (commit 55e8fa8) : un échec

Un enregistreur temporaire, posé depuis la console du navigateur, a relevé les
événements reçus par la colonne. Les crans de défilement arrivent en **lignes**
(`deltaMode` = 1), un cran valant 5 lignes. Le code comparait ce nombre brut au
seuil de 60, comme s'il s'agissait de pixels. Il fallait donc environ 60 lignes,
une douzaine de crans d'un coup, pour changer d'espace. Cela concerne les
molettes horizontales et les souris, pas le trackpad, qui envoie des pixels.

### Correction

Le delta horizontal est converti en pixels avant d'être cumulé : 16 px par ligne,
et la largeur de la colonne par page. Cran de 5 lignes = 80 px : un cran franc
change d'espace, un cran de 3 lignes (48 px) reste sous le seuil.

### Résultats après correction (18 octobre 2026)

Mesurés avec le même enregistreur, sur trois espaces (Général, Test A, Test B) :

| Geste | Avant | Après | Résultat |
|---|---|---|---|
| gauche, 5 lignes, sur le premier espace | Général | Général | **réussi** : pas de bouclage |
| droite, 3 lignes (48 px) | Général | Général | **réussi** : sous le seuil |
| droite, 5 lignes (80 px) | Général | Test A | **réussi** : un espace |
| droite, 5 lignes | Test A | Test B | **réussi** : un espace |
| droite, 5 lignes, sur le dernier espace | Test B | Test B | **réussi** : pas de bouclage |
| rafale de 3 × 5 lignes, écarts de 114 et 117 ms | Test B | Test A | **réussi** : un seul espace |
| défilement vertical de la liste (15 onglets) | Test A | Test A | **réussi** : la liste défile, l'espace ne change pas |
| un seul espace (profil temporaire neuf) | Général | Général | **réussi** : rien ne change, aucune erreur de Nash en console |

### Non vérifié

- **Un vrai trackpad.** Les outils d'automatisation n'envoient que des crans
  de défilement, sans les phases d'inertie de macOS. La rafale simule l'inertie
  (événements à moins de 200 ms d'intervalle). La sensibilité réelle du seuil de
  60 px au doigt reste à juger à la main.
- **Les gestes en diagonale**, où l'horizontal domine à peine le vertical.
- **16 px par ligne** est une approximation : la hauteur de ligne réelle de
  Firefox varie selon la police. Le seuil peut demander un ajustement à l'usage.

### Observé en passant

- À ce moment-là, le menu d'un espace ne proposait que le renommage et la
  teinte : aucun moyen de supprimer un espace. C'est réglé par 050bb4d (voir
  « Suppression d'un espace » plus bas), et les espaces de test ont été
  supprimés du profil de développement.
- En survolant les onglets, la prévisualisation native de Firefox journalise deux
  erreurs. Elles sont sans rapport avec Nash.

## Suppression d'un espace (D12 proposée)

Testé le 18 octobre 2026 sur une compilation artifact, commit 050bb4d puis
correctif. Le menu d'un espace propose désormais « Supprimer l'espace… ». Les
vérifications reposent sur un relevé pris dans la console du navigateur avant et
après chaque suppression : pour chaque onglet, son espace, son container et
l'identifiant de sa page chargée, qui change si la page est rechargée.

### Résultats

| Vérification | Résultat |
|---|---|
| Les onglets passent dans l'espace voisin (précédent, sinon suivant) | **réussi** |
| Aucun rechargement : identifiant de page inchangé pour chaque onglet | **réussi** |
| La session est gardée : chaque onglet garde son container d'origine | **réussi** |
| Les tuiles locales suivent dans l'espace voisin | **réussi** |
| Une instance de tuile à identité héritée redevient un onglet ordinaire | **réussi**, comme prévu par D12 |
| La confirmation annonce le bon nombre d'onglets et de tuiles | **réussi** |
| Le dernier espace ne peut pas être supprimé (entrée grisée) | **réussi** |
| Deux fenêtres : la fenêtre qui supprime l'espace qu'elle affiche passe sur le voisin | **réussi** |
| Deux fenêtres : l'**autre** fenêtre qui affichait l'espace supprimé passe sur le voisin | **échec, corrigé** |
| Console : aucune erreur de Nash | **réussi** |

### L'échec et sa correction

**Symptôme.** Une seconde fenêtre qui affichait l'espace supprimé retombait sur
le **premier** espace, pas sur le voisin. Avec Général, Test A et Test B, la
suppression de Test B renvoyait l'autre fenêtre sur Général au lieu de Test A.

**Cause.** Seule la fenêtre qui supprimait mettait à jour son espace courant. Les
autres fenêtres se recalaient par l'observateur du modèle, qui retombe sur le
premier espace quand l'espace courant n'existe plus.

**Correction.** Avant d'enregistrer le modèle, la suppression fait passer **toutes**
les fenêtres qui affichaient l'espace sur le même voisin. L'observateur des autres
fenêtres retrouve alors cet espace et le garde.

**Vérifié après recompilation**, avec Général, Milieu et Dernier : la fenêtre 1
affiche Général, la fenêtre 2 affiche Dernier, et la fenêtre 1 supprime Dernier.
La fenêtre 2 passe sur **Milieu**, le voisin, et la fenêtre 1 reste sur Général.
La suppression de Milieu depuis la fenêtre qui l'affiche la fait ensuite passer
sur Général.

### Conséquences de D12 à trancher

- **Un espace peut contenir des onglets d'autres containers.** Après suppression,
  Général affiche des onglets des containers Test A et Test B. La barre
  d'adresse montre le nom de container d'un espace qui n'existe plus, ce qui
  peut dérouter. C'est le prix du « rien ne se recharge » : Gecko ne change pas
  le container d'un onglet sans le recharger.
- **La confirmation ne nomme que le container de l'espace supprimé**, alors que
  les onglets déplacés peuvent venir d'autres containers (cas d'un espace qui en
  avait déjà reçu par une suppression précédente).

### Observé en passant

- La barre d'adresse affiche par défaut des suggestions « Trending on Google ».
  Elles interrogent le moteur de recherche à chaque ouverture : à désactiver au
  titre du pilier « vie privée par défaut ».
- Un clic de souris sur l'entrée « Supprimer l'espace… » n'a rien fait une fois,
  alors que le clavier et un clic sur « Renommer » fonctionnaient. Non reproduit :
  vraisemblablement un clic envoyé avant que la fenêtre soit active.

## Masquée par défaut, colonne flottante (18 octobre 2026)

Demande de l'utilisateur : comme dans Arc, la colonne ne reste pas affichée et
n'apparaît qu'au survol du bord gauche.

### Ce qui change

- `firefox-branding.js` : `sidebar.visibility` vaut `hide-sidebar` par défaut.
- **Ce défaut ne suffit pas.** Au premier démarrage d'un profil sans valeur
  utilisateur, `SidebarManager.sys.mjs` écrit lui-même `always-show` comme choix
  de l'utilisateur, ce qui écrase le défaut de la marque. Nash applique donc une
  seule fois son défaut dans `applySidebarDefault()` (nash.js, appelé avant
  `installPeek()`), marqué par `nash.sidebar.defaultApplied`. Ensuite, « Fixer »
  ou un réglage manuel est respecté. Aucun patch de fichier Mozilla.
- `nash.css` : révélée, la colonne flotte à 8 px des bords de la fenêtre, avec
  des coins arrondis de 12 px et une ombre. Fixée, elle redevient une colonne
  ordinaire.

### Résultats (compilation artifact, profil de développement)

| Test | Résultat |
|---|---|
| Démarrage : colonne masquée, la page occupe toute la largeur | ✅ |
| Survol du bord gauche : la colonne apparaît par-dessus la page | ✅ |
| Coins arrondis et ombre de la colonne flottante | ✅ |
| Sortie de la souris : la colonne se recache | ✅ |
| « Fixer » : la colonne se loge à gauche, sans coins ni marge | ✅ |
| Après « Fixer », `sidebar.visibility` vaut `always-show` et `defaultApplied` reste vrai, donc le choix n'est pas écrasé | ✅ (prefs.js) |

Un premier survol à 5 px à l'intérieur de la fenêtre n'a rien révélé. À 2 px du
bord, tout fonctionne. La bande de 6 px est étroite : à surveiller à l'usage.

### Non vérifié

- Le redémarrage après « Fixer » (la colonne doit revenir fixée).
- Un profil existant qui avait déjà `always-show` reçoit lui aussi le mode masqué
  une fois, au premier lancement de cette version. C'est voulu, mais non testé
  sur un vrai profil d'usage.
