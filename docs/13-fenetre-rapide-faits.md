# Fenêtre rapide : faits mesurés sur le build

Faits demandés par la session qui écrit l'overlay de la fenêtre rapide
(docs/10-plan-reproduction.md, section 3). Ce fichier ne contient aucun code
d'overlay : seulement des mesures sur le build et des lectures du code de Firefox.
Les bouts de console servent à reproduire une mesure, pas à être repris tels quels.

Chaque réponse est marquée :

- **MESURÉ** : observé sur la compilation artifact, profil `.devprofile` ;
- **LECTURE** : lu dans les sources de Firefox 153.6.0esr (`src/`), avec fichier
  et ligne ;
- **non vérifié** : ni mesuré ni lu.

## Conditions de mesure

- Compilation artifact (`nash-obj-artifact/dist/Nash.app`, identifiant
  `org.nash.browser`), lancée par `tools/run-dev.sh artifact` inchangé, arrêtée par
  `tools/stop-dev.sh`.
- Console du navigateur pilotée par Marionette, activé par variables
  d'environnement : `MOZ_MARIONETTE=1 MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1`. Un `user.js`
  temporaire pose `remote.prefs.recommended = false`, pour que Marionette ne change
  aucun réglage de session.
- Pages de test servies par un serveur local (`127.0.0.1:8765` et
  `localhost:8765`). `?cookie=v` pose un cookie, `/form` est une page longue avec
  un champ et une zone de texte.
- Réglages relevés sur `.devprofile` : `browser.link.open_newwindow` = 3,
  `browser.link.open_newwindow.override.external` = -1,
  `browser.link.open_newwindow.restriction` = 2,
  `browser.tabs.loadDivertedInBackground` = false,
  `browser.link.force_default_user_context_id_for_external_opens` = false,
  variable Nimbus `externalLinkHandling.openBehavior` = -1.
- Après les essais : containers de test supprimés, cookies et historique de
  `localhost` et `127.0.0.1` effacés, réglages remis. `prefs.js`,
  `nash-archive.json` et la session de `.devprofile` ont été remis à l'identique de
  leur copie d'avant les essais.

## B1. Liens externes

### Chemin d'une URL envoyée par une autre application (LECTURE, confirmé par MESURE)

1. macOS appelle `-[MacApplicationDelegate application:openURLs:]`
   (`toolkit/xre/MacApplicationDelegate.mm:361`), qui appelle `openURLs:` (`:389`).
   Pendant le démarrage, les URL sont mises de côté (`:403`). Sinon, elle construit
   une ligne de commande `-url <url>` (`:408`) et la lance avec l'état
   `STATE_REMOTE_EXPLICIT` (`:428`).
2. `nsDefaultCommandLineHandler.handle` (`dch_handle`,
   `browser/components/BrowserContentHandler.sys.mjs:1580`) lit `-url` (`:1644`).
   Pour **une seule** URL, hors lancement initial, il appelle
   `handURIToExistingBrowser(uri, OPEN_DEFAULTWINDOW, …)` (`:1698-1712`). Plusieurs
   URL passent par `openBrowserWindow` (`:1720`).
3. `handURIToExistingBrowser` (`:1269`) prend la fenêtre du dessus
   (`BrowserWindowTracker.getTopWindow`, non privée sauf mode privé permanent), puis
   appelle `browserDOMWindow.openURI(uri, null, OPEN_DEFAULTWINDOW, OPEN_EXTERNAL,
   principal)` (`:1281-1287`). Sans fenêtre, il attend une fenêtre en cours
   d'ouverture (`:1303`) ou en ouvre une (`:1315`).
4. **Composant et méthode qui reçoivent l'URL** : `BrowserDOMWindow.openURI`, puis
   `#getContentWindowOrOpenURI` (`browser/modules/BrowserDOMWindow.sys.mjs:233`).

MESURÉ, pile relevée en instrumentant `BrowserDOMWindow.prototype.openURI` au
moment d'un `open -a` :
`openInWindow@BrowserContentHandler.sys.mjs:1281` ← `handURIToExistingBrowser:1299`
← `dch_handle:1706`. Arguments : `where` = 0 (`OPEN_DEFAULTWINDOW`), `flags` = 1
(`OPEN_EXTERNAL`), principal système.

### Réglages qui décident (LECTURE)

- `where` vaut `OPEN_DEFAULTWINDOW`. Pour un lien externe, il prend la variable
  Nimbus `externalLinkHandling.openBehavior`, adossée au réglage
  `browser.link.open_newwindow.override.external` (défaut -1,
  `browser/app/profile/firefox.js:1019`). À -1, c'est `browser.link.open_newwindow`
  qui décide (défaut 3, `firefox.js:1014`). Code : `BrowserDOMWindow.sys.mjs:274-283`,
  déclaration Nimbus : `toolkit/components/nimbus/FeatureManifest.yaml:5363-5385`.
- Valeurs : 1 = onglet courant, 2 = nouvelle fenêtre, 3 = nouvel onglet en fin de
  barre, 6 = nouvel onglet au premier plan, 7 = nouvel onglet à côté de l'onglet
  actif (liste de la déclaration Nimbus).
- Nouvel onglet : `#openURIInNewTab` (`BrowserDOMWindow.sys.mjs:86`). Il est ouvert
  en arrière-plan selon `browser.tabs.loadDivertedInBackground` (défaut false,
  `firefox.js:1062`, code `:133-138`). Si la fenêtre courante n'a pas de barre
  d'outils (fenêtre popup), il prend la fenêtre du dessus (`:104-112`).
- `browser.link.open_newwindow.restriction` ne s'applique pas ici : il concerne
  `window.open` depuis une page.

### Container par défaut : 0, sauf devinette (LECTURE et MESURÉ)

- LECTURE : pour un lien externe, Firefox **devine** le container
  (`BrowserDOMWindow.sys.mjs:243-253`). `URILoadingHelper.guessUserContextId`
  (`browser/modules/URILoadingHelper.sys.mjs:846`) compte les onglets **visibles**
  (`gBrowser.visibleTabs`) de toutes les fenêtres dont l'hôte est le même, et
  prend le container qui en a le plus. Faute de correspondance, c'est 0. Le
  réglage `browser.link.force_default_user_context_id_for_external_opens`
  (défaut false, `firefox.js:1010`) force 0.
- MESURÉ : `http://127.0.0.1:8765/…`, avec des onglets 127.0.0.1 ouverts dans le
  container 6 : nouvel onglet dans le container **6**. `http://localhost:8765/…`,
  sans onglet de cet hôte : nouvel onglet dans le container **0** (aucun container).
- MESURÉ, interaction avec Nash : `openURI` passe toujours un `userContextId` (la
  devinette ou 0). L'adaptateur `addTab` de Nash ne complète le container que si
  `userContextId == null` (`overlay/browser/components/nash/nash.js:295-317`).
  Résultat : un lien externe vers un hôte sans onglet ouvert arrive **dans le
  container 0**, rangé dans l'espace courant (valeur `nash-space` posée à
  `TabOpen`). Avec `override.external` à -1 : nouvel onglet en fin de barre,
  sélectionné.
- Non vérifié : Nash masque les onglets des autres espaces (`hideTab`). La
  devinette ne compterait donc que les onglets de l'espace affiché dans chaque
  fenêtre.

### Variantes de réglage (MESURÉ)

| `override.external` | Résultat |
|---|---|
| -1 (défaut) | nouvel onglet en fin de barre, sélectionné, container 0 ou deviné |
| 2 | nouvelle fenêtre complète ; Nash s'y installe, mais **l'URL est perdue** (voir B2) |
| 1 | chargé dans l'onglet courant de la fenêtre du dessus, qui garde son container (6) |

### Simuler le chemin sur `.devprofile` (MESURÉ)

- **`open -a` marche** alors que Nash n'est pas navigateur par défaut et que
  l'instance tourne avec `-no-remote`. LaunchServices envoie l'URL au processus
  déjà ouvert sur ce paquet :

      open -a "$PWD/nash-obj-artifact/dist/Nash.app" "http://localhost:8765/p/ext2"

  Le chemin complet est parcouru (pile ci-dessus).
- **Console** : l'appel direct donne le même résultat (container 0, onglet en fin
  de barre), mais saute la couche ligne de commande (`dch_handle`) :

      window.browserDOMWindow.openURI(
        Services.io.newURI("http://localhost:8765/p/ext4"), null,
        Ci.nsIBrowserDOMWindow.OPEN_DEFAULTWINDOW,
        Ci.nsIBrowserDOMWindow.OPEN_EXTERNAL,
        Services.scriptSecurityManager.getSystemPrincipal());

- Piège mesuré : si la fenêtre modale « Make Nash your primary browser? » est
  ouverte (elle l'est au démarrage sur `.devprofile`, à partir de la deuxième
  relance), l'onglet est créé mais **pas sélectionné**. `gBrowser.selectedTab`
  refuse tout changement tant que `window-modal-open` est posé
  (`browser/components/tabbrowser/content/tabbrowser.js:590`).
- Non vérifié : `open -a` avec plusieurs URL, et une URL reçue pendant le démarrage.

## B2. Fenêtre légère

### Nash s'installe partout, `gBrowser` existe partout (MESURÉ)

Toute fenêtre ouverte sur `chrome://browser/content/browser.xhtml` est une fenêtre
`navigator:browser`. `gBrowser` y existe, et Nash y tourne : attribut `nash="0.3"`,
`Nash.model` chargé. Vérifié pour les cinq variantes ci-dessous, y compris les
fenêtres popup. `init()` ne distingue pas une popup d'une fenêtre normale.

### Variantes essayées (MESURÉ)

Bouts de console (fenêtre principale), avec `url` une adresse http :

    // a. sans "all"
    window.openDialog(AppConstants.BROWSER_CHROME_URL, "_blank",
      "chrome,dialog=no,width=520,height=640", url);
    // b. avec "popup"
    window.openDialog(AppConstants.BROWSER_CHROME_URL, "_blank",
      "chrome,dialog=no,popup,width=520,height=640", url);
    // c. BrowserWindowTracker, sans "all"
    const s = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
    s.data = url;
    BrowserWindowTracker.openWindow({ all: false, features: "popup,width=520,height=640", args: s });
    // d. BrowserWindowTracker, fenêtre complète
    BrowserWindowTracker.openWindow({ args: s });
    // e. depuis une page (contexte contenu), anti-popup levé pour l'essai
    window.open(url, "_blank", "popup,width=480,height=600");

| Variante | `chromehidden` | Chrome visible | Container | URL |
|---|---|---|---|---|
| a, b, c | `menubar toolbar location directories status extrachrome` | rien : ni barre d'adresse, ni barre d'onglets, ni colonne Nash ; la page occupe toute la fenêtre (520 × 640 de contenu) | 6 (onglet remplacé par Nash) | **perdue** |
| d | vide | fenêtre normale : barre d'adresse, colonne Nash | 6 (onglet remplacé) | **perdue** |
| e | `menubar toolbar directories extrachrome` | barre d'adresse seule ; pas de barre d'onglets, pas de colonne Nash | 6, hérité de la page qui ouvre | conservée, `opener` gardé |

`popup` n'ajoute rien à « sans `all` » pour une fenêtre ouverte depuis le chrome :
a, b et c donnent le même résultat. `window.toolbar.visible` y vaut `false`.

### L'URL passée à une nouvelle fenêtre est perdue (MESURÉ)

Pour a à d, l'onglet de la fenêtre a été relevé toutes les 20 ms :

    93 ms   about:blank#0   Nash pas encore installé
    267 ms  about:blank#6   Nash installé

Quand `init()` tourne (200 à 420 ms selon l'essai), l'onglet est encore
`about:blank`, sans container, sans historique : la page n'a pas encore commencé
à charger. `init()` remplace un tel onglet par un `about:blank` dans le container
de l'espace (`overlay/browser/components/nash/nash.js:47-56`), et l'URL n'est
jamais chargée. Le même remplacement explique le cas `override.external = 2` de B1.

**Correction du 19 octobre 2026 (MESURÉ)** : pour les variantes a et b, Nash
n'est pas seul en cause. Un `openDialog` sans `all` ni `non-private` donne une
fenêtre mono-processus (`gMultiProcessBrowser = false`), où aucune page web ne
s'affiche, même chargée après `init()` dans un onglet déjà en place. La même
fenêtre avec `non-private` est multi-processus. Une fenêtre légère doit donc
passer par `BrowserWindowTracker.openWindow({ all: false, … })`, ou ajouter
`non-private` aux options d'`openDialog`.

La variante e n'est pas touchée : son onglet a déjà le container de la page qui
ouvre, et le remplacement ne vise que le container 0.

Observé une fois, cause probable la même, non vérifié : après
`SessionStore.undoCloseWindow`, l'onglet sélectionné de la fenêtre rouverte, qui
était dans le container 0, est revenu en `about:blank` dans le container 6.

### Autres points

- LECTURE : `BrowserWindowTracker.getTopWindow` ignore les fenêtres sans barre
  d'outils, sauf `allowPopups` (`browser/modules/BrowserWindowTracker.sys.mjs:196`,
  `:213`). Un lien externe ne va donc pas dans une popup, il va dans la fenêtre
  normale du dessus.
- `openWebLinkIn` : non vérifié (pas essayé).

## B3. Container temporaire (MESURÉ)

Essai : `ContextualIdentityService.create("nash-temp-essai", "circle", "red")`, un
onglet dans ce container sur une page qui pose `probe=v1`, puis
`ContextualIdentityService.remove(id)`.

| Question | Résultat |
|---|---|
| Identifiant | 22, soit `lastUserContextId + 1`. Les essais suivants ont eu 23, 24, 25 : les identifiants ne sont pas réutilisés. LECTURE : `toolkit/components/contextualidentity/ContextualIdentityService.sys.mjs:376-380` |
| Écriture sur disque | `containers.json` contient le container 1,6 s après `create` |
| Visible dans `about:preferences#containers` pendant sa vie | **oui**, le nom figure dans la page |
| Après `remove` | absent de la page des réglages (rechargée) et de `containers.json` |
| Le cookie disparaît-il ? | **oui**, tout de suite : `remove` efface les données du container. LECTURE : `ContextualIdentityService.sys.mjs:494` |
| `remove` ferme-t-il les onglets ? | **non**. L'onglet reste ouvert, toujours dans le container 22, sans nom. Rechargé, il n'envoie plus de cookie, mais il **peut en écrire de nouveaux** : `?cookie=v2` a créé un cookie dans le container 22 supprimé |
| Ordre correct | `await closeContainerTabs(id)` puis `remove(id)`. Mesuré : les deux onglets sont fermés ; après `closeContainerTabs` seul, le cookie est encore là ; après `remove`, il disparaît. C'est l'ordre de la page des réglages (LECTURE : `browser/components/preferences/config/containers.mjs:76-78`) |
| Onglets récemment fermés | `remove` retire de la liste des onglets fermés ceux de ce container : SessionStore observe `clear-origin-attributes-data` (LECTURE : `browser/components/sessionstore/SessionStore.sys.mjs:1658-1666`, `5211`). Mesuré : les onglets fermés par `closeContainerTabs` n'apparaissent plus |
| `kill -9` entre `create` et `remove` | **le container survit** au redémarrage, avec son nom, son cookie, et son onglet restauré (reprise après plantage). LECTURE : `ContextualIdentityService` n'a pas de notion de container temporaire ; rien ne le retire au démarrage |

## B4. Promotion vers un autre container (MESURÉ et LECTURE)

### Recharger est imposé (LECTURE, confirmé par MESURE)

Les `OriginAttributes` d'un `BrowsingContext` de contenu, qui portent le
`userContextId`, ne peuvent être posés qu'avant son rattachement
(`docshell/base/BrowsingContext.cpp:1821-1832`, `:2052`). Un onglet ne change donc
pas de container sur place : il faut un nouvel onglet et un nouveau document.
Mesuré : chaque copie a un `performance.timeOrigin` différent de la source.

### APIs (LECTURE)

- `gBrowser.duplicateTab(tab, restoreImmediately, options)` (`tabbrowser.js:7652`)
  appelle `SessionStore.duplicateTab` (`SessionStore.sys.mjs:4174`). Le container
  est pris sur l'onglet source (`:4198`) ; les options sont seulement
  `inBackground` et `tabIndex`. **Pas d'option de container.**
- Chemin qui marche : lire l'état de l'onglet source, créer un onglet vide dans le
  container cible, y appliquer l'état. `duplicateTab` vide le tampon d'état avant
  de copier (`TabStateFlusher.flush`) ; un appel direct à `getTabState` juste après
  une saisie peut rendre un état en retard.

### Essai (MESURÉ)

Source : container 6, deux entrées d'historique (`/p/h1` puis `/form`), défilement
à 1500 px, champ et zone de texte remplis. Container cible : un container créé
pour l'essai (25).

    const st = JSON.parse(SessionStore.getTabState(source));
    st.userContextId = cible;                     // variante « modifié »
    const t = gBrowser.addTrustedTab(null, { userContextId: cible, skipLoad: true });
    SessionStore.setTabState(t, JSON.stringify(st));

| Méthode | Container obtenu | URL | Historique | Défilement | Champ et zone de texte |
|---|---|---|---|---|---|
| `gBrowser.duplicateTab(source, true)` | 6 (celui de la source) | conservée | 2 entrées | 1500 | conservés |
| `setTabState`, `userContextId` de l'état changé | 25 | conservée | 2 entrées | 1500 | conservés |
| `setTabState`, état laissé à 6 | 25 : le container de l'onglet créé l'emporte | conservée | 2 entrées | 1500 | conservés |

Non conservés, par construction : les cookies et le stockage du container
d'origine. La session de connexion ne suit pas.

Non vérifié : `sessionStorage`. Il fait partie de l'état d'onglet (LECTURE :
`SessionStore.sys.mjs:6585`) et serait donc copié dans le container cible ; pas
mesuré.

## B5. Raccourci global

- LECTURE : Gecko n'offre au code du navigateur aucune API de raccourci clavier
  qui marche quand l'application n'est pas au premier plan. Dans `widget/cocoa`,
  `toolkit` et `browser`, les seules écoutes globales natives sont :
  - les touches média, par un `CGEventTap` en écoute seule sur les événements
    système (`widget/cocoa/MediaHardwareKeysEventSourceMac.mm:93`) ;
  - un moniteur global des clics souris, pour fermer les menus ouverts
    (`widget/cocoa/nsToolkit.mm:149`).

  Aucun ne concerne les touches du clavier.
- Connaissance, non mesurée ici : sur macOS, un raccourci global passe par une API
  native. `RegisterEventHotKey` (Carbon) ne demande pas de permission. Un moniteur
  global `NSEvent` sur les touches demande la permission Accessibilité, et un
  `CGEventTap` sur le clavier demande Surveillance de l'entrée.
- **Hors de portée d'un overlay Gecko en JavaScript** : il faut du code natif dans
  `widget/cocoa`, exposé au chrome par une interface XPCOM, donc un patch du moteur.
- Contournement sans code natif, non vérifié : un raccourci macOS (app Raccourcis
  ou service) qui lance `open -a Nash <url>` rejoint le chemin de B1.

## Suite : correctif de l'adresse perdue (écrit depuis la session cloud, non testé)

Cause relevée en B2 : `init()` remplace l'onglet vierge d'une nouvelle fenêtre par
un onglet dans le container de l'espace, avant que Firefox ait commencé à charger
l'adresse demandée. Correctif : `init()` lit `gBrowserInit.uriToLoadPromise`
(`browser/base/content/browser-init.js:1131`) et, si c'est une adresse http(s),
la donne à l'onglet de remplacement quand l'onglet remplacé est celui affiché.

À tester : les variantes a à d de B2 (`openDialog`, `BrowserWindowTracker.openWindow`)
avec une adresse, et `browser.link.open_newwindow.override.external = 2` avec
`open -a`. L'adresse doit se charger. Cas à surveiller : plusieurs adresses
(tableau), qui ne passent pas par ce chemin, et une fenêtre ouverte sans adresse.

### Résultats du 19 octobre 2026 (MESURÉ)

Compilation artifact, `.devprofile`, pages locales qui posent un cookie. Pour
chaque fenêtre : adresse finale de l'onglet, son container, et présence du cookie
dans le container 0 (fuite) ou dans celui de l'espace (6).

**Avec `f1f0c71` seul** (le correctif ci-dessus) :

| Ouverture | Résultat |
|---|---|
| c, d (`BrowserWindowTracker.openWindow`) | **adresse chargée**, container 6, un seul onglet, rien dans le container 0 |
| a, b avec `non-private` ajouté | **adresse chargée**, container 6, rien dans le container 0 |
| a, b tels qu'écrits en B2 | `about:blank` : fenêtre mono-processus, voir la correction en B2. La requête part pourtant dans le container 6 et le cookie y est posé, mais la page ne s'affiche pas |
| `override.external = 2` + `open -a` | **adresse chargée** dans une nouvelle fenêtre, container 6, rien dans le container 0 |
| ⌘N (`OpenBrowserWindow`), `BrowserWindowTracker.openWindow()` sans adresse | **échec** : Firefox demande `about:home`, la fenêtre reste sur `about:blank`. Le correctif ne reprend que les adresses http(s), et l'onglet de remplacement prend l'adresse courante (`about:blank`) |
| `openDialog` sans adresse, popup sans adresse, `about:blank` | `about:blank`, container 6, aucune erreur |

La requête partie dans le container 0 par Firefox (`_delayedStartup`, avant
`init()`) est annulée avant d'être envoyée (aucune trace `http-on-modify-request`
dans ce container) : pas de fuite mesurée.

**Après fusion avec `nash/fenetre-url-perdue`** (`claimStartupLoad()`, qui remplace
l'onglet vide au chargement de la fenêtre, avant Firefox ; les deux correctifs sont
gardés) : mêmes résultats pour toutes les ouvertures avec une adresse, et **⌘N
comme `openWindow()` sans adresse affichent maintenant `about:home`** dans le
container 6. Les variantes a et b sans `non-private` restent vides (limite de Gecko).
Tests : `model.test.cjs` 15/15, `integration.py` 36/36 sur l'artifact, dont les 4
contrôles « window opened with a URL ».

Non vérifié : plusieurs adresses (tableau), et une adresse reçue pendant le
démarrage de l'application.
