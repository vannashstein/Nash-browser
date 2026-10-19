# Liens externes et onglets jetables

Écrit depuis `docs/arc/little-arc.md`, `docs/10-plan-reproduction.md` et les faits de
`docs/13-fenetre-rapide-faits.md`. Écrit sans exécution ; essais du 19 octobre 2026
en fin de document : deux correctifs appliqués, deux défauts restent ouverts.

## Choix et pourquoi

Arc ouvre les liens externes dans une petite fenêtre (Little Arc), liée à un profil.
Nash ouvre un **onglet** dans un **container jetable**, dans la fenêtre normale.

- Une petite fenêtre légère n'a ni barre d'adresse ni sidebar : il faudrait inventer
  une barre pour promouvoir ou fermer. Les fenêtres ouvertes par `openDialog` sans
  `non-private` n'affichent aucune page web (docs/13, B2).
- Le gain de Little Arc qui compte pour Nash est l'isolation : un lien reçu ne doit
  jamais écrire de cookies dans un espace que l'utilisateur n'a pas choisi. Un
  onglet dans un container jetable la donne, avec beaucoup moins de code.
- La fenêtre légère reste possible plus tard, par-dessus ce mécanisme.

## Ce que ça fait

1. Un lien http(s) venu d'une autre application arrive par
   `BrowserDOMWindow.openURI` avec le drapeau `OPEN_EXTERNAL` (docs/13, B1). Nash
   enveloppe cette méthode sur l'instance de la fenêtre.
2. **Si l'utilisateur a déjà des onglets sur ce site** (tous espaces, y compris les
   onglets cachés), le lien s'ouvre dans le container majoritaire et l'espace de ces
   onglets, et Nash passe sur cet espace. Un lien pro arrive dans l'espace pro.
3. **Sinon**, Nash crée un container `nash-temp-<id>` et y ouvre un onglet, rangé
   dans l'espace courant, sélectionné (sauf si
   `browser.tabs.loadDivertedInBackground` est vrai).
4. Quand le dernier onglet du container se ferme, 500 ms plus tard, Nash appelle
   `closeContainerTabs` puis `remove` : cookies et stockage disparaissent.
5. **"Ranger dans un espace…"** (menu contextuel de l'onglet, visible seulement
   pour un onglet jetable) recopie l'état de l'onglet (adresse, historique,
   défilement, formulaires) dans un nouvel onglet du container de l'espace choisi,
   puis ferme l'original. Les cookies du container jetable ne suivent pas.
6. **Au redémarrage**, un onglet jetable restauré appartient à une exécution finie :
   Nash l'archive (motif "temporaire"), le ferme, puis supprime son container.
   Seuls les onglets marqués d'une autre exécution sont touchés.
7. Si la création du container échoue, l'erreur est journalisée et Firefox ouvre le
   lien comme d'habitude. Jamais de repli silencieux.

Réglage : `nash.external.temp` (vrai par défaut). À faux, Firefox reprend son
comportement.

## Onglets de la session précédente

`browser.startup.page` passe à 3 : les onglets ordinaires reviennent après un
redémarrage, comme dans Arc. Avant, seuls les onglets épinglés revenaient (docs/13).
L'archivage à 12 heures (D13) range ce qui est ancien, et la mesure de
`lastAccessed` (docs/12) montre que les dates survivent au redémarrage.

## Limites connues

- Le container jetable est visible dans `about:preferences#containers` pendant sa vie.
- Un onglet jetable est aussi archivable par le délai de l'archivage : la restauration
  le remet alors dans le container de l'espace (le container jetable n'existe plus).
- La devinette de container compte les onglets de toutes les fenêtres Nash, pas ceux
  des fenêtres privées.
- `openURI` est une méthode interne de Firefox : à revérifier à chaque rebase ESR (D8).
- Pas de raccourci clavier global : impossible sans code natif (docs/13, B5).
  Contournement : un raccourci macOS qui lance `open -a Nash <url>`.
- Plusieurs adresses reçues d'un coup, et une adresse reçue pendant le démarrage de
  Nash : non testés.

## À tester

1. `open -a "$PWD/nash-obj-artifact/dist/Nash.app" "http://localhost:8765/p/x"` sans
   onglet sur ce site : un onglet s'ouvre dans un container `nash-temp-…`, dans
   l'espace courant. Un cookie posé par la page n'est ni dans le container 0 ni dans
   un espace.
2. Même commande avec un onglet déjà ouvert sur ce site dans un espace : le lien
   s'ouvre dans ce container et Nash passe sur cet espace.
3. Fermer l'onglet jetable : le container disparaît de `about:preferences`, le cookie
   aussi. Fermer l'un de deux onglets jetables du même container : il reste.
4. "Ranger dans un espace…" : l'onglet revient dans l'espace choisi avec son
   historique, son défilement et ses champs. Le container jetable disparaît.
5. Arrêt propre avec un onglet jetable ouvert, relance : l'onglet est archivé
   (motif "temporaire"), le container supprimé.
6. `kill -9` avec un onglet jetable, relance : même résultat.
7. Deux fenêtres : ouvrir une seconde fenêtre ne ferme pas l'onglet jetable de la
   première.
8. `nash.external.temp` à faux : comportement Firefox d'origine.
9. Onglets de la session précédente : ouvrir 3 onglets, quitter proprement, relancer.
   Ils reviennent.

## Résultats des essais (19 octobre 2026)

Conditions : comme docs/13. Compilation artifact de 7cda092, lancée par
`tools/run-dev.sh artifact` sur `.devprofile`, arrêt propre par `tools/stop-dev.sh`.
Marionette est activé par variables d'environnement. Un `user.js` temporaire pose
`remote.prefs.recommended = false` et `browser.shell.checkDefaultBrowser = false`.
Serveur local sur le port 8765 ; les hôtes `a.localhost` à `f.localhost` servent de
sites sans onglet ouvert. Après les essais, les cookies et l'historique de ces hôtes
ont été effacés, et `prefs.js`, `containers.json`, `nash-archive.json` et la session
ont été remis à l'identique de leur copie d'avant les essais.

### Défauts corrigés (dans ce commit)

- **C1. L'enveloppe d'`openURI` n'était jamais appelée.** MESURÉ : sur 7cda092,
  `open -a … http://localhost:8765/p/x?cookie=t1` ouvre l'onglet dans le container 0,
  le cookie y est écrit, et aucun container `nash-temp-…` n'est créé.
  `window.browserDOMWindow` est le reflet XPConnect de l'objet ; affecter
  `openURI` sur ce reflet ne change rien, `openURI` reste `[native code]`. Gecko
  appelle la méthode de l'objet JS, `window.browserDOMWindow.wrappedJSObject`.
  Correctif : envelopper `openURI` sur `wrappedJSObject`.
- **C2. `temporaryIdentities()` levait une exception.** Les containers intégrés
  (1 à 4) n'ont pas de `name`, seulement un `l10nId` ; `id.name.startsWith` lève
  `TypeError`. `cleanupTemporary()` échouait donc toujours, et aucun container
  jetable n'était supprimé. Correctif : `id.name?.startsWith`.

### Résultats après C1 et C2

| Essai | Résultat |
|---|---|
| 1. Lien sans onglet sur ce site | RÉUSSI : onglet sélectionné dans `nash-temp-…`, espace courant ; cookie dans ce seul container |
| 2. Lien vers un site ouvert dans l'espace « tyu » | RÉUSSI : container tyu, Nash passe sur tyu |
| 3. Fermeture | RÉUSSI : avec deux onglets du même container jetable, fermer l'un le garde ; fermer le dernier supprime le container et le cookie en 1,5 s |
| 4. « Ranger dans un espace… » | RÉUSSI dans la session, **ÉCHOUE au redémarrage** (D2) |
| 5. Arrêt propre avec un onglet jetable | **ÉCHOUE** (D1) |
| 6. `kill -9` avec un onglet jetable | **ÉCHOUE** (D1) |
| 7. Deux fenêtres | RÉUSSI : la seconde fenêtre a son enveloppe et ne ferme pas l'onglet jetable de la première |
| 8. `nash.external.temp` à faux | RÉUSSI : container 0, onglet sélectionné, comme Firefox |
| 9. Onglets de la session précédente | RÉUSSI : trois onglets ordinaires reviennent après un arrêt propre |

Détail de l'essai 4 : l'entrée de menu est visible sur l'onglet jetable et cachée sur
un onglet d'espace. Après rangement dans tyu : `/form` dans le container tyu,
`history.length` = 2, défilement 1500, les deux champs remplis, pas de cookie,
container jetable supprimé.

### Défauts ouverts

- **D1. Un onglet jetable restauré est fermé sans être archivé, donc perdu.**
  MESURÉ : après un arrêt propre ou un `kill -9`, l'onglet et son container
  disparaissent, et `nash-archive.json` n'a aucune entrée « temporaire ».
  L'onglet n'est pas non plus dans les onglets fermés : la suppression du container
  efface aussi ces entrées. Cause, MESURÉE par une sonde temporaire dans
  `sweepStaleTemporary()` : à ce moment, `linkedBrowser.currentURI` vaut
  `about:blank`, et l'adresse n'existe que dans `SS.getTabState(tab).entries`.
  `validURL()` est alors faux, et l'onglet est fermé sans archive. Piste : prendre
  l'adresse dans l'état SessionStore quand `currentURI` n'est pas valable.
- **D2. Un onglet rangé revient dans le container jetable supprimé.** MESURÉ : après
  le rangement, l'onglet vivant est dans le container tyu (21), mais
  `SS.getTabState()` garde `userContextId: 31`, celui du container jetable recopié
  par `setTabState`. Au redémarrage, l'onglet est restauré dans le container 31, qui
  n'existe plus : hors de tout espace, cookies à part. `extData` garde aussi
  `nash-temp-run`. Piste : réécrire `userContextId` (et retirer `nash-temp-run`)
  dans l'état avant `setTabState`.

### Autres constats

- MESURÉ : fermer une fenêtre qui contient un onglet jetable laisse son container en
  place. Il est supprimé au prochain `TabClose` d'une autre fenêtre, ou au
  redémarrage. La fermeture d'une fenêtre n'envoie pas de `TabClose`.
- MESURÉ : au premier lancement de l'essai, l'invite de Firefox « Make Nash your
  primary browser? » était ouverte (`window-modal-open`). Tant qu'elle est là,
  `gBrowser.selectedTab = …` ne fait rien, si bien qu'un lien externe s'ouvre sans
  être sélectionné, avec ou sans Nash. Pour la suite des essais, elle a été coupée
  par `user.js`.
- Un lien vers un hôte déjà ouvert dans un espace suit ce compte, y compris quand
  l'onglet donneur a été rangé depuis un container jetable. C'est conforme au point 2.
