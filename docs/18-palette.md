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
