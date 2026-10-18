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
- La syntaxe du JS est vérifiée. **Rien n'a été exécuté** : pas de compilation
  possible dans la session qui l'a écrit.

## À tester sur le Mac

1. `about:config` : `nash.sidebar.peek` = true, `sidebar.visibility` = `hide-sidebar`.
2. Amener la souris au bord gauche : la colonne doit flotter sans décaler la page.
3. Sortir : elle se cache. Ouvrir un menu contextuel dans la colonne : elle reste.
4. "Fixer" : la colonne devient ancrée et la page se décale.
5. Échap pendant la révélation.
6. Fenêtre privée, plein écran, deuxième fenêtre : pas de bande parasite, pas
   d'erreur dans la console.

## Risques connus

- `SidebarController._state` est une API **interne** de Firefox. À revérifier à
  chaque rebase ESR (D8).
- `updateVisibility` déclenche l'animation native de Firefox. Elle peut décaler
  brièvement la page avant que `position: absolute` s'applique.
- La bande de 6 px recouvre le bord gauche de la page quand elle est active. Elle
  gêne une barre de défilement à gauche (langues de droite à gauche : à tester).
- Le séparateur et la poignée de redimensionnement ne sont pas gérés en mode
  flottant.
