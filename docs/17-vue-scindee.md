# Vue scindée native et Nash

Mesuré le 19 octobre 2026 sur la compilation artifact de c689fba (Firefox ESR 153.6.0,
`browser.tabs.splitView.enabled` = vrai), lancée par `tools/run-dev.sh artifact` sur
`.devprofile`, pilotée par Marionette. Aucun code d'overlay n'a été écrit pour ces
mesures. Lectures dans `src/` (esr153 local), chemins relatifs à `src/`.

Légende : **MESURÉ** (exécuté dans Nash), **LECTURE** (code lu, `fichier:ligne`),
**non vérifié**.

## Résumé pour l'écriture du code

| Point | Résultat | Ce qui casse avec Nash |
|---|---|---|
| a. Création | menu de l'onglet, Alt+clic, lien, barre d'adresse ; pas de raccourci par défaut | rien |
| b. Deux containers côte à côte | possible, chaque volet garde son container | l'onglet de l'autre espace reste caché dans la sidebar alors que sa page est affichée |
| c. Changement d'espace | la vue reste active et affichée dans les deux espaces | une page d'un autre espace est visible dans l'espace courant |
| d. Archivage | le volet non sélectionné, pourtant affiché, est archivé par la passe automatique | **défaut** : la vue est défaite |
| e. Sidebar masquée | fonctionne | rien |
| f. Redémarrage | les vues reviennent, containers et espaces gardés | rien |

## Noms exacts (LECTURE)

### Élément et marque sur l'onglet

- `<tab-split-view-wrapper>`, classe `MozTabSplitViewWrapper`
  (`browser/components/tabbrowser/content/tabsplitview.js:35`, définie :491). Les
  onglets en sont les **enfants DOM** dans la bande d'onglets (ou dans un
  `<tab-group>`).
- Identifiant : attribut `splitViewId`, entier (`tabsplitview.js:189-195`), donné par
  `SessionStore.getNextSplitViewId()` (`tabbrowser.js:3580-3592`).
- Autres attributs du conteneur : `hasactivetab` (:53-55, :93-95), `multiselected`.
  Getters : `tabs` (:200-202), `state` = `{id, numberOfTabs}` (:71-88), `visible`
  (vrai si **tous** ses onglets sont visibles, :204-206), `pinned` toujours faux
  (:208-210), `panels` (:217-226), `group` (:64-68).
- Sur l'onglet : **getter `tab.splitview`**, qui rend le conteneur parent ou `null`
  (`tab.js:394-399`). **Aucun attribut d'onglet** ne marque la vue scindée. MESURÉ :
  les attributs d'un onglet scindé ne contiennent rien de propre à la vue.
- `gBrowser.splitViews` (`tabbrowser.js:536-538`), `gBrowser.activeSplitView`
  (:499-504), `gBrowser.splitViewBrowsers` (:511-521), `gBrowser.selectedBrowsers`
  (:610-615), `gBrowser.isSplitViewWrapper(el)` (:6979-6981).
  `tabContainer.allTabs` aplatit les conteneurs (`tabs.js:860-870`).

### Méthodes

- `gBrowser.addTabSplitView(tabs, {id, insertBefore, trigger})`
  (`tabbrowser.js:3612-3675`) : crée le conteneur, `addTabs(tabs)`, émet
  `SplitViewCreated`, rend le conteneur, ou `null` si tous les onglets sont épinglés.
  MESURÉ : **déplace les onglets** dans le conteneur, donc leurs index dans
  `gBrowser.tabs` changent.
- Sur le conteneur : `addTabs(tabs, {isSessionRestore, indexOfReplacedTab})` (:325-364,
  un onglet épinglé arrête toute la boucle), `unsplitTabs(trigger)` (:374-408, ferme un
  `about:opentabs` de la vue), `replaceTab(old, new)` (:413-426),
  `reverseTabs(trigger)` (:434-449, l'échange), `close(trigger)` (:457-470, ferme les
  deux onglets).
- `gBrowser.moveTabToSplitView(tab, wrapper, index)` (:7260-7284),
  `ungroupSplitView` (:3948-3959), `adoptSplitView` (:4041-4080, entre fenêtres),
  `moveSplitViewToExistingGroup` (:7330-7348), `showSplitViewPanels(tabs)` (:3683-3696),
  `openSplitViewMenu(anchor)` (:3715-3725).
- Limite à deux onglets : imposée par l'interface et la mise en page, pas par l'API
  (:10475-10478).
- **`userContextId` n'est vérifié nulle part** : des containers différents peuvent
  partager une vue (LECTURE, confirmé par MESURE en b).

### Événements

| Événement | Cible | `detail` | Source |
|---|---|---|---|
| `SplitViewCreated` | `gBrowser.tabContainer` | — | `tabbrowser.js:3669-3673` |
| `SplitViewRemoved` | `tabContainer` (bulle, composé) | — | `tabsplitview.js:144-149` |
| `TabSplitViewActivate` | `tabContainer` | `{tabs, splitview}` | `tabsplitview.js:234-239` |
| `TabSplitViewDeactivate` | `tabContainer` | `{tabs, splitview}` | `tabsplitview.js:251-256`, :270-275 |
| `SplitViewTabChange` | le conteneur | — | `tabsplitview.js:164-168` |

`TabMove` signale aussi un changement de vue (`tabbrowser.js:7376-7400`). MESURÉ, à la
fermeture d'un volet : `TabClose`, puis `TabSplitViewDeactivate`, puis
`SplitViewRemoved`.

### Affichage

- `#tabbrowser-tabpanels` porte l'attribut **`splitview`** quand une vue est affichée
  (`toolkit/content/widgets/tabbox.js:572-610`). Chaque volet a la classe
  `split-view-panel` et un attribut `column`. Le volet actif a aussi
  **`split-view-panel-active`**, et le volet sélectionné `deck-selected`. MESURÉ.
- Volet actif = `gBrowser.selectedTab` ; cliquer dans un volet sélectionne son onglet
  (`tabbox.js:346-354`).
- Sélectionner un onglet hors de la vue la **suspend** (`tabsplitview.js:265-276`) :
  `TabSplitViewDeactivate`, `activeSplitView` = `null`, mais les classes
  `split-view-panel` restent. Resélectionner un de ses onglets la réactive.
- `hideTab` et `showTab` n'ont aucun code de vue scindée
  (`tabbrowser.js:6744-6792`) : un volet caché reste affiché (MESURÉ en b et c).
- Fermer un volet : l'observateur du conteneur défait la vue
  (`tabsplitview.js:152-187`), et l'onglet sélectionné ensuite suit la règle
  ordinaire, sans préférence pour l'autre volet (`tabbrowser.js:6264-6330`).

## a. Créer une vue scindée dans Nash

MESURÉ : le menu contextuel natif de l'onglet (celui que Nash utilise) affiche les
entrées dans la sidebar Nash.

| Situation | Entrées visibles |
|---|---|
| Un onglet | `context_moveTabToSplitView` « Add Split View » |
| Deux onglets sélectionnés | `context_moveTabToSplitView` « Open in Split View » |
| Onglet déjà dans une vue | `context_separateSplitView` « Separate Split View », `context_reverseSplitView` « Reverse Tabs », `context_moveSplitViewToNewGroup` « Add Split View to New Group » ; bouton `#split-view-button` de la barre d'adresse visible |

- MESURÉ : « Add Split View » sur un onglet de tyu ajoute un volet `about:opentabs`
  dans le **même container et le même espace** (tyu), sélectionné. La page de choix
  liste seulement les onglets visibles, non épinglés et non scindés : un onglet caché
  par Nash (autre espace) n'y figure pas. LECTURE : `opentabs-splitview.mjs:117-124`.
- Raccourcis : `key_addTabSplitView` et `key_separateTabSplitView` n'ont **ni touche
  ni modificateur** (MESURÉ ; `browser/base/content/browser-sets.inc.xhtml:371-372`).
  Ils se lient seulement par les raccourcis personnalisés
  (`browser/components/customkeys/CustomKeysParent.sys.mjs:100-101`). Commandes
  `Browser:AddTabSplitView` et `Browser:SeparateTabSplitView`
  (`browser-sets.js:194-199`, `browser-commands.js:85-105`).
- Alt+clic sur un onglet non sélectionné : vue avec l'onglet sélectionné
  (`tab.js:603-618`). Non vérifié dans la sidebar Nash.
- Menu d'un lien : `context-openlinkinsplitview` « Open Link in Split View », ouvre le
  lien **dans le container de l'onglet courant** (`nsContextMenu.sys.mjs:1550-1570`).
  Non vérifié.
- Pas de glisser-déposer qui crée une vue (`drag-and-drop.js`, LECTURE).
- Menu de la vue `#split-view-menu` : `splitViewCmd_separateTabs`,
  `splitViewCmd_reverseTabs`, `splitViewCmd_closeTabs`
  (`main-popupset.inc.xhtml:494-502`), ouvert par le bouton de la barre d'adresse
  ou le pied `<split-view-footer>` (`split-view-footer.js`).

## b. Deux containers (deux espaces) côte à côte

MESURÉ : `addTabSplitView([onglet perso de Général, onglet tyu de tyu])` crée la vue
(`splitViewId` = 1). Avec l'onglet tyu sélectionné, les deux pages sont côte à côte
(x = 51 et 665, 605 px chacune). Chaque volet garde son container :
`browsingContext.originAttributes.userContextId` vaut 6 et 21.

Ce qui gêne : l'onglet de l'autre espace (Général) **reste caché** dans la sidebar
Nash (`hidden`) alors que sa page est affichée. L'utilisateur voit une page dont il
ne voit pas l'onglet.

MESURÉ aussi : juste après la création, sélectionner par code l'onglet caché (celui
de l'autre espace) n'a pas abouti : la sélection est allée à un onglet de l'espace
courant. Cause non vérifiée.

## c. Changement d'espace pendant une vue scindée

MESURÉ : passer de tyu à Général, puis revenir.

- La vue reste **active et affichée** dans les deux espaces (mêmes volets, mêmes
  positions).
- Nash sélectionne le volet de l'espace d'arrivée (Général : celui de perso ; tyu :
  celui de tyu). L'onglet de l'autre volet est caché dans la sidebar, mais sa page
  reste à l'écran.

Rien n'est cassé, mais une vue mêlant deux espaces fait passer une page d'un espace
dans l'autre. Ce qu'il faut faire est un choix (voir « Décisions »).

## d. Archivage

MESURÉ : le volet non sélectionné d'une vue active a `tab.lastAccessed` figé à sa
dernière sélection. Seul l'onglet sélectionné a `Infinity`. `Nash.archivable()` le
déclare archivable : la règle ne regarde que `tab.selected`. Avec un âge simulé de
13 h, `Nash.sweepArchive()` l'a archivé (motif « auto »). Ont suivi `TabClose`,
`TabSplitViewDeactivate`, `SplitViewRemoved`. La vue est défaite, et l'onglet restant
occupe toute la largeur.

**Défaut** : un volet affiché à l'écran ne doit pas être archivé. Repère pour le
code : `tab.splitview` non nul et l'autre onglet de `tab.splitview.tabs` sélectionné,
ou plus simplement `gBrowser.splitViewBrowsers.includes(tab.linkedBrowser)` quand une
vue est active. Faut-il protéger aussi les onglets d'une vue suspendue ? À trancher.

## e. Sidebar masquée

MESURÉ, avec `sidebar.visibility` = `hide-sidebar` :

- Colonne affichée : volets à x = 199 et 739 (531 px).
- Colonne cachée : volets à x = 3 et 645 (633 px), vue toujours active.
- Révélation au bord (`#nash-edge`) : la colonne flotte (`nash-peek`), les volets
  **ne bougent pas**.
- Masquée de nouveau : rien ne change dans la vue.

Rien à corriger.

## f. Restauration après redémarrage

MESURÉ, arrêt propre avec deux vues (une qui mêle Général et tyu, une
`seul` avec `about:opentabs`) :

- Session écrite : `windows[0].splitViews` = `[{"id": 2, "numberOfTabs": 2},
  {"id": 3, "numberOfTabs": 2}]`, et chaque onglet a `splitViewId` dans ses données,
  avec son `userContextId` et `hidden`.
- Après relance : les deux vues reviennent avec leurs `splitViewId`, leurs containers
  (6 et 21) et leurs espaces Nash. La vue de l'onglet sélectionné est active, et
  l'onglet de l'autre espace est de nouveau caché par Nash mais affiché.
- La seconde vue revient en attente (`pending`, `about:blank` en adresse vivante,
  adresse réelle dans l'état SessionStore). À sa sélection, elle s'active et charge
  ses deux volets, y compris `about:opentabs`.

LECTURE : enregistrement `TabState.sys.mjs:88-90` (`splitViewId`),
`SessionStore.sys.mjs:5830-5834` (`splitViews`), :5730 (`maxSplitViewId`) ;
restauration par `gBrowser.createTabsForSessionRestore(..., splitViews)`
(`SessionStore.sys.mjs:6074-6086`, `tabbrowser.js:4449-4640`). Si moins d'onglets
que `numberOfTabs` arrivent, le conteneur n'est pas créé et ces onglets ne sont pas
insérés (`tabbrowser.js:4555-4606`). Non vérifié en exécution.

## Décisions à prendre (pour l'utilisateur)

1. Une vue scindée peut-elle mêler deux espaces ? Options : l'interdire (refuser ou
   ramener l'onglet dans l'espace courant), l'autoriser et montrer l'onglet de l'autre
   volet dans la sidebar, ou suspendre la vue quand on quitte l'un de ses espaces.
2. Archivage : protéger seulement les volets d'une vue active, ou tous les onglets
   d'une vue scindée.
