# Décisions

Une décision inscrite ici est figée. La revenir dessus demande d'écrire pourquoi.

## D1 — Moteur : Gecko, fork de Firefox

Retenu contre Chromium et WKWebView.

- Les *contextual identities* (containers) existent nativement. Le cloisonnement
  par espace, qui est le cœur du produit, n'est pas à construire.
- La protection anti-pistage et la Total Cookie Protection sont déjà les
  réglages par défaut. On travaille dans le sens du grain.
- La culture du fork est éprouvée : Zen, LibreWolf, Mullvad, Tor Browser
  fournissent quatre séries de patchs publiques à étudier.

Ce qu'on accepte de perdre : l'interface ne sera pas de l'AppKit natif. C'est du
CSS et du JS dans la couche chrome de Gecko.

## D2 — Branche : ESR, pas la version rapide

C'est la décision qui détermine si Nash existe encore dans deux ans.

ESR reçoit les correctifs de sécurité en backport : un gros rebase par an au
lieu d'un toutes les quatre semaines. C'est ce que font Tor Browser et Mullvad
Browser, pour la même raison — un mainteneur qui ne peut pas suivre le rythme
rapide.

### Branche retenue : `esr153`

Vérifié le 7 septembre 2026 sur `github.com/mozilla-firefox/firefox` :

| Branche | Dernier commit | Nature |
|---|---|---|
| `esr140` | 07/09/2026 | `repo-update HSTS HPKP` — mises à jour automatiques de listes |
| `esr153` | 07/09/2026 | correctifs de bugs réels |
| `main` | 07/09/2026 | développement |

Les deux ESR coexistent pendant la période de recouvrement. `esr153` est le
nouveau : partir sur `esr140` aujourd'hui obligerait à rebaser dans quelques
mois, avant même d'avoir une version utilisable.

Dépôt : Mozilla a migré `mozilla-central` de Mercurial vers Git. La source est
`github.com/mozilla-firefox/firefox`, clonée en `src/` (non versionnée ici).

## D3 — Overlay pour les ajouts, patchs pour les modifications

Jamais d'édition dispersée dans l'arbre. Deux mécanismes distincts, choisis
selon la nature du changement :

- **`overlay/`** — les fichiers que nous créons et qui n'existent pas en amont.
  Recopiés dans `src/` par `tools/apply-overlay.sh`, idempotent. Ne peuvent
  produire aucun conflit de rebase.
- **`patches/`** — uniquement pour les modifications de fichiers de Mozilla.
  Chaque patch ajouté ici est une dette de rebase : à justifier.

La marque Nash (phase 2) tient entièrement dans l'overlay. `patches/` est
encore vide, et c'est un objectif de le garder aussi mince que possible.

## D4 — L'espace porte le container

Chaque espace possède sa `contextualIdentity`, donc son pot à cookies. C'est
l'unité d'identité du navigateur.

## D5 — Une tuile a deux champs, pas un

**Visibilité** et **identité** sont deux questions indépendantes. Les confondre
était une erreur du premier modèle.

| visibilité | identité | comportement | exemple |
|---|---|---|---|
| locale | héritée | vue dans un espace, session de cet espace | Crunchyroll dans Anime |
| globale | héritée | vue partout, **une session par espace** | Gmail : perso ici, pro là |
| globale | fixée | vue partout, **une seule session** | Zotero, gestionnaire de mots de passe |
| locale | fixée | vue dans un espace, session épinglée ailleurs | compte de test |

Défaut : **héritée**. C'est ce qui distingue Nash. `fixée` est un choix explicite
pour les rares sites dont le compte est unique par nature.

L'arbitrage ne se fait pas dans un panneau de réglages. La première fois qu'une
tuile est ouverte dans un second espace, Nash pose la question une fois, au
moment où elle a un sens, et s'en souvient.

Implémentation : l'identité détermine simplement la clé d'instance.
`héritée → (tuile, espace)` · `fixée → (tuile)`

## D6 — Ligne globale plafonnée

Quatre tuiles, à valider à l'usage. La contrainte est la fonctionnalité : sans
plafond, la ligne globale redevient le fourre-tout d'Arc.

## D7 — IA : un routeur, une politique par espace

L'IA n'est pas « locale ». Elle est **routée** : modèle local ou API distante
derrière une seule interface, et le choix appartient à l'espace, comme le
container.

- Le contenu d'une page entre comme donnée, jamais comme instruction.
- Une sortie de modèle ne déclenche aucune action — navigation, ouverture
  d'onglet, lecture d'historique — sans un clic explicite.
- Aucun envoi vers une API distante sans indicateur visible dans la sidebar.
- Le mode automatique ou ambiant reste local, toujours.

## D8 — Règle de sécurité du mainteneur

Au-delà de **huit semaines** sans rebase de sécurité appliqué, Nash cesse d'être
le navigateur principal et on repasse sur Firefox amont le temps de rattraper.

Écrite maintenant, avant d'en dépendre. C'est ce qui sépare un projet solide
d'un projet abandonné en silence.


## D9 — Deux compilations, deux usages

Découvert en franchissant la phase 2.

- **Artifact build** — itération sur l'interface. 2 à 3 minutes. Ne peut rien
  changer de ce qui est compilé en C++, puisque le binaire vient de Mozilla.
- **Compilation complète** — nécessaire pour l'identité runtime (dossier de
  profil, remoting, `--version`) et pour toute publication. 2 à 3 h sur la
  machine actuelle.

Le travail quotidien sur la sidebar se fait entièrement en artifact build. La
compilation complète devient obligatoire avant de faire de Nash le navigateur
principal — sinon il partage le dossier de profil de Firefox.

## D10 — La grille part vide, l'utilisateur la compose

Relevé à l'usage le 8 septembre 2026, sur la version 0.3.

`defaultModel()` livrait une grille pré-remplie : Gmail, ChatGPT, Kagi, Claude,
Netflix, Crunchyroll, Notion, arXiv. Aucun de ces sites n'avait été choisi par
l'utilisateur.

C'est une erreur de principe, pas un manque de fonctionnalité. Dans un
navigateur dont toute la promesse est « c'est le mien », livrer l'avis de
quelqu'un d'autre sur ce qui mérite une tuile contredit le produit. La grille
d'Arc que Nash cherche à égaler ne vaut que parce que **c'est l'utilisateur qui
y place ses sites**.

**Un profil neuf démarre avec une grille vide.** Les espaces par défaut peuvent
exister — ce sont des contenants, pas des choix de contenu — mais aucune tuile
n'est fournie.

Corollaire : la grille vide doit être accueillante et dire quoi faire, pas
paraître cassée. C'est la première chose que voit quelqu'un qui installe Nash.

### Les gestes d'ajout, par ordre d'importance

1. **Faire glisser un onglet dans la grille.** C'est le geste d'Arc, celui que
   l'utilisateur attend. Aujourd'hui refusé : le gestionnaire `drop` rejette
   tout ce qui n'est pas déjà une tuile Nash.
2. **Déposer un lien** depuis une page, un marque-page ou une autre fenêtre.
3. **Ajouter l'onglet courant** par un bouton — existe (`addCurrentTile`).
4. **Saisir une adresse à la main**, sans que le site soit ouvert — absent.

Le bouton `+` seul ne suffit pas : il oblige à sélectionner l'onglet avant de
viser une petite cible, là où le glisser-déposer est direct.

## D6 révisée — la ligne globale n'a plus de plafond

Le 8 septembre 2026, après usage.

D6 posait quatre tuiles maximum, en soutenant que « la contrainte est la
fonctionnalité » et qu'il fallait trancher le nombre en le vivant. C'est fait :
le plafond gêne. **Il est retiré.**

L'argument d'origine — sans limite, la ligne globale redevient le fourre-tout
d'Arc — reste vrai, mais c'est un risque à assumer par celui qui compose sa
grille, pas une règle à lui imposer. Le même raisonnement que D10 : le contenu
appartient à l'utilisateur.

## D11 — Créer un espace se fait dans la sidebar

Une boîte de dialogue système ne peut pas montrer la teinte, et la teinte est
précisément ce qui dira à l'utilisateur dans quel compte il se trouve une fois
l'espace créé. Choisir un espace sans voir sa couleur n'a pas de sens.

Le formulaire vit donc en tête du bandeau : nom, teinte, Annuler / Créer.
Entrée valide, Échap annule. Le renommage utilise le même formulaire.

Un espace créé **part vide**, comme la grille livrée (D10). Son container est
dérivé de son nom et reste unique : deux espaces partageant un pot à cookies
fusionneraient silencieusement les comptes qu'ils existent pour séparer.

### Un piège du rendu, à connaître

`render()` est mémoïsé sur une clé qui résume l'espace courant, le modèle et
les tuiles. Ouvrir le formulaire ne change aucun des trois : sans ajouter
l'état du formulaire à cette clé, le rendu sort avant de dessiner et **rien
n'apparaît, sans la moindre erreur**. Toute nouvelle interface éphémère devra
entrer dans cette clé.

## D12 (proposée) — Supprimer un espace ne détruit rien

À valider. Découle de `docs/10-plan-reproduction.md` : aucune action de la
sidebar ne détruit un onglet sans retour possible.

- Les onglets de l'espace supprimé passent dans l'espace voisin (le précédent,
  ou le suivant s'il n'y en a pas). Ils **gardent leur container**, donc leurs
  cookies et leurs sessions ne bougent pas et rien ne se recharge.
- Les tuiles locales passent aussi dans l'espace voisin. Une instance de tuile à
  identité héritée devient un onglet ordinaire (son container n'est plus celui
  d'un espace qui la possède). Une tuile à identité fixée garde son instance.
- Le container de l'espace supprimé reste dans Firefox. Le supprimer est une
  action distincte, hors de cette décision, parce qu'elle détruit des cookies.
- Le dernier espace ne peut pas être supprimé.
- Une confirmation précise le nombre d'onglets et de tuiles déplacés.
