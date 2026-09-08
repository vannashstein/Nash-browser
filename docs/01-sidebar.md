# Sidebar

## Modèle

    Tuile {
      id, url, titre
      icone      : { source: "manuelle" | "manifeste", cache: local }
      visibilite : "globale" | spaceId
      identite   : "heritee" | { fixee: containerId }
      ordre
    }

    Espace {
      id, nom, emoji, teinte
      container  : contextualIdentity
      politiqueIA: "locale" | "distante" | "aucune"
    }

    instance(tuile, espace) =
      identite === "heritee"  ->  (tuile.id, espace.container)
      identite.fixee          ->  (tuile.id, identite.fixee)

## Comportements requis

- **Instance unique.** Un second clic revient à l'onglet existant. Jamais de
  doublon, jamais de perte d'état.
- **Retour à l'origine.** Naviguer ailleurs depuis une tuile puis y revenir
  ramène à son URL d'origine.
- **Persistance.** Les tuiles et leurs instances survivent au redémarrage.
- **Icône remplaçable à la main**, mise en cache localement. Une tuile sans logo
  est une tuile morte : on navigue au logo, pas au texte.
- **Clavier.** ⌘1 à ⌘9 ouvrent les tuiles dans l'ordre affiché.
- **Teinte par espace**, comme Arc — le changement de teinte est le signal que
  l'identité a changé.

## Composition de la grille (D10)

Un profil neuf démarre **vide**. Tuiles ajoutables par, dans l'ordre :

| Geste | État |
|---|---|
| glisser un onglet dans la grille | implémenté — **non vérifié en conditions réelles** |
| déposer un lien (page, marque-page, autre fenêtre) | implémenté — non vérifié |
| bouton « ajouter l'onglet actuel » | vérifié : la tuile naît, l'onglet est adopté et épinglé |
| saisir une adresse à la main | implémenté : le `+` demande l'adresse s'il n'y a pas de page |
| retirer, renommer, réordonner, déplacer | présents |

L'onglet déposé est **adopté**, pas dupliqué : il devient l'instance vivante de
la tuile et quitte la liste d'onglets, comme dans Arc.

### Limite de vérification

Le glisser-déposer n'a pas pu être testé par automatisation : les événements de
souris synthétiques n'engagent pas le service de glisser natif de macOS, donc
`dragstart` n'est jamais émis. Le code est en place et lit les trois formats
(`application/x-moz-tabbrowser-tab`, `text/x-moz-url`, `text/uri-list`), mais
**seul un essai à la main confirmera le geste**.

## À trancher à l'usage

- Le plafond de la ligne globale : 4, 5 ou 6.
- Les tuiles globales occupent-elles les premiers ⌘, ou chaque espace
  repart-il de ⌘1 ?
- Les dossiers dans la grille : nécessaires, ou signe que le plafond est trop bas ?
