# Palette : mémoire "saisie -> choix" par espace

Écrit depuis `docs/arc/palette.md` et `docs/10-plan-reproduction.md` (section 5), sans
lecture de sortie brute de REA. API vérifiée dans les sources de Firefox 153 esr :
`UrlbarProvider` (`browser/components/urlbar/UrlbarUtils.sys.mjs:3493`),
`ProvidersManager.getInstanceForSap` (`UrlbarProvidersManager.sys.mjs:315`),
`registerProvider` (`:330`), `onEngagement` (doc de la classe de base),
`UrlbarResult` (`browser/components/urlbar/content/UrlbarResult.mjs:75`), schéma du
type URL (`UrlbarUtils.sys.mjs:2789`, `url` obligatoire). **Non exécuté.**

## Ce que ça fait

- Nash ne remplace pas la barre d'adresse : il lui ajoute un fournisseur de
  résultats, `NashMemory`.
- Quand l'utilisateur choisit un résultat qui a une adresse (page, onglet, favori)
  après avoir tapé quelque chose, Nash retient "cette saisie, dans cet espace ->
  cette adresse", avec un compteur et une date.
- À la saisie suivante, dans le **même espace**, Nash propose ce choix en
  **deuxième ligne**, juste sous le premier résultat de Firefox. La saisie exacte
  d'abord, puis, à partir de deux caractères, les saisies plus longues qui
  commencent pareil. Trois propositions au plus.
- Si l'utilisateur choisit autre chose pour la même saisie, le compteur repart de un :
  la mémoire suit l'usage récent.
- La même saisie ("mail") ne désigne pas la même chose dans deux espaces.
- Stockage : `nash-palette.json` dans le profil, écrit une seconde après le dernier
  choix. 500 saisies au plus par espace, les plus anciennes partent. Les espaces
  supprimés perdent leur mémoire au chargement. Un fichier illisible est mis de côté
  en `.corrompu`.
- Rien en fenêtre privée. Rien ne quitte l'appareil. Pas d'embedding.

## Choix assumé

Arc met le choix retenu en tête. Nash le met en deuxième ligne : la touche Entrée
garde le comportement de Firefox (adresse tapée, recherche, complétion), et la mémoire
ne peut pas détourner une adresse que l'utilisateur tape volontairement. Flèche bas
puis Entrée prend la proposition.

## Limites

- Le fournisseur est global (un gestionnaire partagé par toutes les fenêtres). Une
  seule fenêtre l'enregistre et le transmet à une autre quand elle se ferme.
- Choisir un onglet ouvert (bascule d'onglet) est retenu comme une adresse : la
  proposition ouvre alors l'adresse, elle ne rebascule pas sur l'onglet.
- Pas de commande "oublier cette proposition".

## À tester

1. Dans l'espace A, taper `ex`, choisir `https://example.com/` (en le tapant ou dans la
   liste). Retaper `ex` : la proposition example.com est en deuxième ligne.
2. Taper `e` : rien (moins de deux caractères pour le préfixe). Taper `exa` : rien
   (la saisie retenue est `ex`, pas `exa`), sauf si elle a aussi été retenue.
3. Passer dans l'espace B, taper `ex` : pas de proposition de l'espace A.
4. Choisir une autre adresse pour `ex` : la nouvelle passe devant au prochain essai.
5. Entrée sans flèche : le comportement de Firefox est inchangé.
6. Redémarrer : la mémoire revient. Supprimer l'espace A, redémarrer : sa mémoire
   disparaît du fichier.
7. Deux fenêtres, puis fermer celle qui a enregistré le fournisseur : la palette marche
   toujours dans l'autre (console : pas d'erreur `dead object`).
8. Fenêtre privée : aucune proposition, rien d'écrit.
9. Fichier `nash-palette.json` corrompu : `.corrompu` créé, palette vide, pas d'erreur.
10. Console du navigateur : aucune erreur du fournisseur `NashMemory` (les erreurs des
    fournisseurs sont journalisées sous `Provider.NashMemory`).

## Essais (19 octobre 2026)

Sur l'artifact de 71279ae, `.devprofile`, Marionette. La saisie est faite **au
clavier** (`WebDriver:ElementSendKeys` dans `#urlbar-input`, puis flèche bas et
Entrée par `WebDriver:PerformActions`). Un `gURLBar.search()` appelé par script ne
démarre pas d'engagement : `#internalRecord` sort quand `startEventInfo` manque
(`UrlbarController.sys.mjs:1016-1021`), et aucun fournisseur n'est prévenu. Un
premier essai fait ainsi n'est donc pas compté. Après les essais,
`nash-palette.json` et son `.corrompu` ont été retirés (ils n'existaient pas), et
`.devprofile` a été remis à l'identique.

| Essai | Résultat |
|---|---|
| 1. `ex` → choisir `example.com/?garde-test`, retaper `ex` | **ÉCHOUÉ, corrigé** (D-P1). Après correction : retenu, et proposé par `NashMemory` en ligne 1, sous le premier résultat de Firefox |
| 2. `e`, puis `exa` | RÉUSSI : aucune proposition Nash |
| 3. Espace tyu, `ex` | RÉUSSI : aucune proposition de Général |
| 4. Autre choix pour `ex` (`example.org`) | RÉUSSI : il remplace l'ancien, compte remis à 1, proposé en ligne 1 |
| 5. Entrée sans flèche | RÉUSSI : la ligne 0 de Firefox est chargée. Ce choix est aussi retenu, ce qui est voulu |
| 6. Redémarrage, puis suppression d'un espace et redémarrage | RÉUSSI : la mémoire revient (`exam` → `example.org` en ligne 1). L'espace supprimé (« Essai SV ») perd sa mémoire au chargement, puis dans le fichier à l'écriture suivante |
| 7. Deux fenêtres, fermer celle qui a enregistré le fournisseur | **ÉCHOUÉ, corrigé** (D-P2). Après correction : la fenêtre restante reprend le fournisseur et la mémoire en cours ; proposition présente ; aucun `dead object` |
| 8. Fenêtre privée | RÉUSSI : aucune proposition ; un choix fait en privé n'est pas retenu, et le fichier n'est pas réécrit |
| 9. Fichier corrompu | RÉUSSI : `nash-palette.json.<horodatage>.corrompu` créé avec le contenu d'origine ; palette vide mais enregistrée ; un nouveau choix est écrit normalement. La console porte l'erreur attendue `[Nash] mémoire de la palette illisible, mise de côté` |
| 10. Console | RÉUSSI : aucune ligne `Provider.NashMemory` dans les journaux des neuf lancements |

Constat : quand l'adresse retenue est aussi la ligne 0 de Firefox (heuristique ou
complétion), la barre fusionne les doublons et la proposition n'apparaît pas. C'est
normal, mais c'est fréquent après un choix fait par Entrée (essai 5).

### Défauts corrigés (règle 2 de `docs/09` : corrections faites par la session
locale, qui a lu des sorties de REA lors d'essais antérieurs)

- **D-P1. La mémoire n'était jamais écrite.** LECTURE : `#notifyEngagement` n'appelle
  `onEngagement` que sur le fournisseur du résultat choisi
  (`UrlbarProvidersManager.sys.mjs:628-635`). Un résultat de Firefox n'arrivait donc
  jamais à `NashMemory`. MESURÉ : avec ce routage, rétabli à chaud, un choix au clavier
  n'écrit rien. Correction : la méthode devient `onSearchSessionEnd(queryContext,
  controller, details)`. Elle est appelée pour tous les fournisseurs qui
  l'implémentent (`:617-623`, `:675-688`), avec le même `details`, dont
  `details.result` lors d'un choix. Sans `onEngagement`, un choix fait sur une
  proposition de Nash n'est pas compté deux fois.
- **D-P2. Le fournisseur se perdait à la fermeture de la fenêtre qui l'avait
  enregistré.** MESURÉ : après la fermeture, aucun fournisseur dans la fenêtre
  restante, et aucune erreur. Enregistré à la main, il fonctionnait. Le passage de
  main se faisait dans le `.finally()` de l'écriture, qui ne s'exécute plus une fois
  la fenêtre fermée (cause probable, non prouvée). Correction : le passage de main se
  fait tout de suite, et `installPalette(memory)` reçoit la mémoire en cours. Celle-ci
  l'emporte sur le fichier lu ensuite (`Object.assign(data, store.memory)`), et un
  choix pas encore écrit n'est pas perdu.
