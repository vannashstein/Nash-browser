# Passation — Nash 0.4

Lire `README.md` et `docs/00-decisions.md`. Les chantiers de la passation 0.2
ont été implémentés dans l’overlay et l’outillage le 8 septembre 2026.
Les résultats mesurés et les limites sont consignés dans `docs/06-validation.md`.

## Démarrer

Depuis la racine du projet :

    ./tools/build.sh artifact
    ./tools/run-dev.sh artifact

Le premier script applique l’overlay, compile et corrige les noms des helpers
macOS de l’artifact. Le second impose `.devprofile` et `-no-remote`.
**Ne pas ouvrir directement le bundle artifact comme navigateur principal** :
son lanceur précompilé est toujours celui de Firefox.

Pour la compilation complète :

    ./tools/build.sh full
    ./tools/run-dev.sh full

Elle produit `nash-obj-full/dist/Nash.app/Contents/MacOS/nash`. Le mozconfig
compile `MOZ_APP_BASENAME=Nash`, `MOZ_APP_REMOTINGNAME=nash`, `MOZ_APP_NAME=nash`
et la distribution `org.nash`. Rust est installé dans `build/toolchains/`, sans
modification du shell utilisateur. Les compilations restent limitées à quatre
jobs sur la machine de 16 Go. L’état de validation runtime fait foi dans le
rapport ; un simple `application.ini` renommé ne prouve pas l’isolation.

Au démarrage, stdout doit contenir :

    console.log: "[Nash] 0.4 — 4 espaces, 3 tuiles globales"

Les nombres dépendent naturellement du modèle enregistré. Une fenêtre privée
utilise volontairement l’interface native, sans modèle Nash persistant, car les
containers Firefox ne sont pas disponibles dans les fenêtres privées.

## Nouveautés de la 0.4 (19 octobre 2026)

Chaque fonction a son document, avec ses essais mesurés et ses limites. Les décisions
sont dans `docs/00-decisions.md`.

| Fonction | Document | Décision | Fichiers |
|---|---|---|---|
| Sidebar masquée, révélation au bord, colonne étroite | `docs/11` | — | `nash.js` (`installPeek`, `installNarrow`), `nash.css` |
| Défilement horizontal entre espaces | `docs/11` | — | `installSpaceSwipe` |
| Suppression d'espace non destructive | `docs/11` | D12 | `deleteSpace` |
| Archivage par espace, rétention 90 jours | `docs/12` | D13 | `installArchive`, `nash-archive.json` |
| Fenêtre ouverte avec une adresse | `docs/13` | — | `claimStartupLoad`, `init` |
| Liens externes en container jetable, onglets rouverts | `docs/14` | D15, D18 | `installTemporary`, `browser.startup.page` |
| Boosts CSS par site et par compte | `docs/15` | D16 | `installBoosts`, `boost-frame.js`, `nash-boosts.json` |
| Vue scindée native, unité entre espaces | `docs/17` | D17 | `splitShared`, `availableInSpace`, `archivable` |
| Palette : mémoire saisie -> choix par espace | `docs/18` | — | `installPalette`, `nash-palette.json` |
| Vie privée de la barre d'adresse, promotions coupées | `docs/14`, D18 | D18 | `firefox-branding.js` |

Fichiers écrits dans le profil par Nash : `nash-archive.json`, `nash-boosts.json`,
`nash-palette.json`. Chacun est mis de côté en `.corrompu` s'il devient illisible,
jamais écrasé.

API internes de Firefox dont Nash dépend, à revérifier à chaque rebase ESR (D8) :
`SidebarController._state`, `BrowserDOMWindow.openURI` (sur `wrappedJSObject`),
`gBrowserInit.uriToLoadPromise`, `ProvidersManager.getInstanceForSap` et
`UrlbarProvider`, `tab.splitview` et les événements `SplitView*`,
`windowUtils.loadSheetUsingURIString`, `Services.ppmm.sharedData`,
`messageManager.loadFrameScript`.

Méthode de travail utilisée pour cette version : la session qui écrit l'overlay ne
lit pas les sorties brutes de REA (règle 2 de `docs/09`) ; une session locale
compile, mesure, teste et consigne les résultats. Voir `docs/16-fin-de-chantier.md`.

## Règles de maintenance

1. **Fichiers nouveaux dans `overlay/`, jamais directement dans `src/`.** Le
   script les recopie. Les outils du projet vivent dans `tools/`.
2. **Un changement d’un fichier Mozilla nécessite un patch justifié.** Les deux
   patchs existants sont conservés : déclaration du composant et chargement JS/CSS.
   Aucun patch Mozilla supplémentaire n’a été ajouté pour la 0.3.
3. **Tout le CSS est porté par `:root[nash]`.** L’attribut est maintenant posé
   après une initialisation réussie. Un échec retire le DOM et les adaptations
   Nash et réaffiche les onglets cachés par Nash.
4. **Initialisation sur `load`**, puis attente du démarrage différé et de la
   restauration de session avant de modifier la sidebar.
5. **Ne pas confondre visibilité et identité.** L’espace porte le container ;
   une tuile globale peut avoir une session héritée ou fixée (D4/D5).
6. **Conserver ESR, Safe Browsing et les arbitrages DoH.** La politique de suivi
   des correctifs reste celle de D8 ; ce travail n’est pas un rebase de sécurité.

## A — Design

- Typographie système ; aucune police, image ou feuille de style distante.
- Palette claire/sombre, six teintes d’espace, changement de teinte de la sidebar.
- Ligne « Partout » à quatre colonnes, grille locale à trois colonnes ; distinction
  de taille et de hiérarchie. Ajout local dans l’en-tête, sans case vide superflue.
- Monogrammes harmonisés, badge du container, anneau de sélection et témoin d’ouverture.
- Menus accessibles par bouton et clic droit ; focus clavier visible, préférence
  de mouvement réduit et couleurs forcées prises en compte.
- Bandeau défilant en hauteur, place conservée pour les onglets natifs, sélecteur
  d’espaces défilant horizontalement si nécessaire.
- Les contrôles natifs de navigation, de permissions et les indicateurs de
  container restent gérés par Firefox.

Pour modifier une teinte : clic droit sur l’espace, puis choix d’une palette.

## B — Profil et compilation complète

`mozconfig.full` contenait seulement la marque. Il compile désormais aussi les
trois valeurs d’identité et le namespace de distribution. Le binaire est `nash`
en compilation complète et reste `firefox` en artifact (contrainte de l’archive).

Le test d’intégration en compilation complète vérifie les valeurs runtime :
`Services.appinfo.name`, `remotingName` et le répertoire `UAppData`, qui doit finir
par `Library/Application Support/Nash`. Il utilise un profil temporaire explicite,
sans changer `HOME` ni lire les cookies d’un profil existant.

Le dossier `~/Library/Application Support/Firefox` mentionné dans l’ancienne
passation **n’a pas été supprimé**. Son nettoyage est indépendant de cette
implémentation et exige toujours une demande explicite.

## C — Espaces et tuiles

### Onglets par espace

Chaque onglet porte une valeur SessionStore `nash-space`, et chaque instance de
tuile porte `nash-tile`. Ces valeurs survivent aux redirections et aux relances.
L’espace actif est enregistré par fenêtre, également dans SessionStore.

Nash sélectionne d’abord un onglet du nouvel espace, puis utilise `hideTab` et
`showTab`. Il ne réaffiche que les onglets qu’il a lui-même cachés (`hiddenBy=nash`),
sans annuler les masquages d’extensions. Les onglets qui partagent caméra, micro
ou écran restent visibles conformément aux protections natives de Gecko.

Une adaptation locale et réversible de `gBrowser.addTab` choisit le container
**avant le chargement** lorsque l’appelant ne fournit ni container ni opener.
`TabOpen` serait trop tard : les premiers cookies seraient déjà dans le mauvais
pot. Les containers explicites (y compris 0), les openers et les restaurations
restent du ressort de Gecko. Les liens issus d’une tuile à compte fixe gardent
son espace visible, même si son container est celui d’un autre espace.
Seul un onglet initial vierge et sans container est
remplacé ; les pages utilisateur existantes ne sont pas rechargées.

Les instances de tuiles restent épinglées côté Gecko ; le conteneur natif des
épinglés est masqué comme en 0.2. Leur présence dans certains outils natifs de
recherche d’onglets n’est pas une frontière de sécurité. Le cloisonnement des
cookies est assuré par les containers, pas par le masquage visuel.

### Helpers GPU et média

La cause observée de `posix_spawnp Error:2` était un **nom d’exécutable absent**,
et non une signature démontrée invalide : XUL précompilé cherche « Firefox GPU
Helper » et « Firefox Media Plugin Helper », alors que le branding les renomme.

`tools/repair-artifact-helpers.py` lit les noms compilés dans XUL et les exécutables
déclarés dans les `Info.plist`, puis crée des alias relatifs dans les bundles
concernés. Il ne modifie pas XUL, ne désactive pas le sandbox et n’impose pas de
rendu logiciel. En compilation complète les noms sont compilés de façon cohérente
et ces alias ne sont pas nécessaires.

### Édition

- `+` ajoute la page courante (HTTP/HTTPS), dans la section choisie.
- Le menu d’une tuile permet de la renommer, de changer sa portée, de choisir ou
  réinitialiser son icône, de la déplacer, de revenir à son adresse d’origine,
  ou de la retirer.
- Retirer une tuile désépingle ses instances sans fermer les pages ni perdre les
  formulaires. Le plafond de quatre tuiles globales est contrôlé à chaque déplacement.
- Le glisser-déposer fonctionne dans une grille et entre les sections ; les actions
  « Déplacer avant/après » constituent une alternative au clavier.
- `+` en bas crée un espace et son container ; clic droit pour renommer ou teinter.
  Renommer l’espace ne change pas son container, donc ne déplace pas ses cookies.
- Les modifications du modèle se propagent aux autres fenêtres normales.

### Icônes locales

Le sélecteur accepte PNG, JPEG, WebP, GIF et ICO jusqu’à 512 Ko. La signature du
fichier est vérifiée, les octets sont enregistrés dans `iconeManuelle` sous forme
de data URI. Cette icône a priorité sur la favicon et survit aux relances.
Les SVG et les URL distantes ne sont pas chargés depuis le modèle. Les favicons
raster déjà fournies par Gecko sont mises en cache ; une icône absente ou invalide
retombe sur le monogramme.

### Choix de session, une fois

Les nouvelles tuiles commencent avec `identite: null`, c’est-à-dire une session
héritée tant que le choix n’a pas encore été nécessaire. `premierContainer` garde
le premier compte. À l’ouverture dans un second espace, une question propose :

- une session par espace (choix par défaut) ;
- une seule session partout, fixée sur le premier container ;
- annuler, sans ouvrir de nouvelle instance.

`identiteChoisie` mémorise la réponse. Les identités déjà fixées restent fixées.
La migration des anciennes tuiles conserve les identifiants et retrouve le premier
container depuis une instance existante lorsque c’est possible.

### Clavier

⌘1 à ⌘9 sur Mac, Ctrl+1 à Ctrl+9 sur les autres plateformes : ordre global puis
local, sans compter les boutons d’ajout. Les positions vides ne déclenchent pas
un raccourci natif contradictoire.

## Vérifications

Tests du modèle et des invariants :

    node --test tools/tests/model.test.cjs

Intégration dans le vrai navigateur (profil jetable et serveur HTTP local) :

    python3 tools/tests/integration.py \
      nash-obj-artifact/dist/Nash.app/Contents/MacOS/firefox \
      --output build/validation-artifact

Pour vérifier l’identité compilée :

    python3 tools/tests/integration.py \
      nash-obj-full/dist/Nash.app/Contents/MacOS/nash \
      --expect-name Nash --output build/validation-full

Marionette n’est activé que dans ces processus de test. Les tests n’utilisent ni
`.devprofile` ni un profil Firefox existant. Ils produisent journaux, captures
claires/sombres et résultats JSON, puis ferment leurs processus et retirent leurs
profils temporaires.

Avant diffusion, conserver une validation manuelle sur les sites et extensions
réellement utilisés et mettre en place la distribution signée et son circuit de
mises à jour. La réussite de ces tests ne vaut pas audit de sécurité du navigateur.
