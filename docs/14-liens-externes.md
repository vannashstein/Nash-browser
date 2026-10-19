# Liens externes et onglets jetables

Écrit depuis `docs/arc/little-arc.md`, `docs/10-plan-reproduction.md` et les faits de
`docs/13-fenetre-rapide-faits.md`. **Non exécuté** : syntaxe vérifiée seulement.

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
