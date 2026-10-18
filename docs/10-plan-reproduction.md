# Plan de reproduction d'Arc, version Nash

Écrit le 18 octobre 2026 à partir de `docs/arc/` uniquement. Aucune sortie brute
de REA n'a été lue pour ce plan (règle 2 de `docs/09-analyse-arc.md`). Aucun
réglage chiffré d'Arc n'est repris : les valeurs proposées ici sont celles de
Nash, à tester.

Effort : S = quelques jours dans l'overlay, M = deux à trois semaines,
L = un mois ou plus, avec risque Gecko. Ces estimations sont des hypothèses,
pas des mesures. Rien n'a encore été compilé pour les confirmer.

## Priorités

| # | Fonction | Effort | Intérêt | Ce que Nash fait mieux qu'Arc |
|---|---|---|---|---|
| 1 | Teintes dérivées d'une couleur unique | S | moyen | Un choix, tous les tons calculés par Nash, lisibles en clair et en sombre |
| 2 | Archivage des onglets | M | fort | Délai par espace, motif visible, rétention bornée, rien ne se détruit |
| 3 | Little Arc avec container temporaire | M | très fort | Un lien externe ne fuit jamais vers un espace non choisi |
| 4 | Boosts par espace, CSS seul au partage | M | fort | Même site, style différent selon l'espace |
| 5 | Palette de commandes | M | fort | Mémoire requête vers choix par espace, local, sans service tiers |
| 6 | Dossiers imbriqués et non lu | M | moyen | Rien n'est détruit à la suppression d'un dossier |
| 7 | Split view | L | fort | Deux volets, deux containers, chacun avec sa teinte |
| 8 | Sync | L | faible au début | Optionnelle, sans compte, chiffrée de bout en bout |

Ordre retenu : 1, 2, 3 d'abord. Ce sont celles qui exploitent le plus les
containers de Gecko, donc celles qui rendent Nash différent d'un clone.

## 1. Teintes dérivées

Entrée : une teinte par espace (déjà en place, six choix). Sortie : quatre tons
(clair teinté, médian, ombré, ombré sombre) calculés dans l'espace perceptuel
OKLCH, avec un contraste minimal vérifié en clair et en sombre. Un seul champ à
stocker. Nash invente sa propre courbe de dérivation, testée sur les six teintes.

## 2. Archivage

- Seuils proposés : 1 h, 6 h, 12 h, 1 jour, 7 jours, 30 jours, jamais. Valeur par
  défaut proposée : 7 jours. À valider à l'usage.
- Seuil **par espace**, avec une action "appliquer à tous les espaces".
- Seuls les onglets non épinglés s'archivent.
- Chaque entrée garde : URL, titre, espace d'origine, date, motif (manuel,
  automatique). La restauration remet l'onglet dans son espace et son container.
- Un bandeau explique la première archive automatique, et chaque archive affiche
  son motif.
- Rétention : 90 jours par défaut puis purge. Pas de copies horodatées illimitées.
- Supprimer un dossier archive son contenu. Aucune action de la sidebar ne détruit
  un onglet sans retour possible.
- Stockage local, dans le profil. Un onglet qui partage caméra, micro ou écran
  n'est jamais archivé.

## 3. Fenêtre rapide (équivalent de Little Arc)

- Fenêtre légère et distincte, ouverte par un lien reçu d'une autre application,
  par un raccourci global ou par un clic avec modificateur (option).
- **Container temporaire par défaut.** Il est supprimé avec la fenêtre, à moins
  d'une promotion explicite vers un espace.
- Promotion : choix de l'espace dans un menu. Dans Gecko, changer de container
  impose de recharger la page : on le dit avant, ou on propose de promouvoir
  avant le premier chargement.
- Délai d'archivage propre, plus court, réglable séparément. La provenance
  "fenêtre rapide" est conservée dans l'archive.
- Option : demander l'espace à chaque lien externe au lieu du container
  temporaire.

## 4. Boosts

- Un boost = une feuille de style et, en option, un script, attachés à une origine
  et à un espace. Gérés par le chrome, sans manifeste d'extension.
- Frontière de sécurité reprise : **seul le CSS se partage**. Un boost avec script
  est refusé à l'export et à l'import. L'auteur n'est pas vérifié, on le dit.
- Pas d'installation en fenêtre privée.
- Partage par fichier ou lien local d'abord. Aucun serveur de Nash.
- Réglage de départ : masquer un élément, changer la police, les couleurs.
  Un éditeur de CSS libre vient ensuite.

## 5. Palette de commandes

- Étudier d'abord ce que la barre d'adresse de Firefox fournit déjà (récence,
  fréquence, correspondances). Écrire le minimum au-dessus.
- Sources de résultats : onglets ouverts (tous espaces, avec l'espace affiché),
  tuiles, archive, historique, actions de Nash.
- **Mémoire requête vers choix, par espace**, stockée localement. La même saisie
  ne désigne pas la même chose dans deux espaces.
- Pas d'embedding à la première version. Si on en ajoute un, il tourne en local
  (D7), sans envoi du titre des pages.
- Suggestions de recherche : désactivées par défaut, activables.

## 6. Dossiers et "non lu"

- Arbre : chaque élément a un parent et une liste ordonnée d'enfants. On garde
  les deux sens cohérents par une seule fonction de déplacement, testée.
- Vérifier d'abord ce que les groupes d'onglets natifs de Gecko couvrent.
- Marqueur "non lu" sur un onglet ouvert en arrière-plan.

## 7. Split view

- Le split est un élément de l'arbre des onglets : il survit à la fermeture de
  fenêtre et se range comme un onglet.
- Chaque volet porte la teinte de son container. Deux comptes côte à côte
  deviennent un cas d'usage de premier rang.
- Geste : glisser un onglet vers le centre de la page. Vocabulaire commun avec la
  grille de tuiles (D10).
- À vérifier avant tout : ce que la branche esr153 de Firefox offre déjà en vue
  scindée. Ne pas réécrire ce qui existe.

## 8. Sync

Reportée. Quand elle viendra : optionnelle, sans compte obligatoire, chiffrée de
bout en bout, fichier ou dossier choisi par l'utilisateur. On retient seulement
de l'analyse le modèle "date et appareil par modification, file de suppressions à
rejouer", une règle de conflit champ par champ.

## Vie privée : à mesurer avant d'écrire

Aucune mesure en usage réel d'Arc n'existe encore (voir `docs/arc/00-inventaire.md`).
Une capture réseau d'Arc en usage normal reste à faire sur le Mac. Elle ne bloque
pas le plan : Nash n'envoie rien par défaut, c'est une contrainte de départ.

## Décisions proposées (à valider dans 00-decisions.md)

Les numéros D9 à D11 sont déjà pris. Les suivantes seraient D12 à D17.

- **D12** : la teinte d'un espace est un champ unique, les tons sont dérivés.
- **D13** : l'archivage est par espace, borné dans le temps, et aucune action de
  la sidebar ne détruit un onglet sans retour possible.
- **D14** : un lien externe s'ouvre dans un container temporaire, jamais dans un
  espace non choisi.
- **D15** : un boost est rattaché à une origine et à un espace ; seul le CSS se
  partage.
- **D16** : la mémoire de la palette est par espace et locale.
- **D17** : le split view est un élément de l'arbre des onglets, chaque volet
  garde l'identité de son container.

## Limite de ce plan

Rien n'a été vérifié dans le code de Nash ni dans Gecko. Les points marqués
"à vérifier" (groupes d'onglets natifs, vue scindée de esr153, barre d'adresse)
sont à lire dans le source Firefox avant d'estimer l'effort.
