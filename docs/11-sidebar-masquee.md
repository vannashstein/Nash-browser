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
- Réglage `nash.sidebar.peek`, **faux par défaut**.
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

## Défilement horizontal entre espaces (non testé)

Geste horizontal au trackpad sur la colonne : espace précédent ou suivant, sans
bouclage. Seuil 60 px, nouveau geste accepté après 200 ms sans événement (pour
absorber l'inertie). Valeurs de Nash, à ajuster. À tester : sensibilité,
inertie, absence de gêne avec le défilement vertical de la liste d'onglets,
comportement quand il n'y a qu'un seul espace.
