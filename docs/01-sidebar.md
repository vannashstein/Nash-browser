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

## À trancher à l'usage

- Le plafond de la ligne globale : 4, 5 ou 6.
- Les tuiles globales occupent-elles les premiers ⌘, ou chaque espace
  repart-il de ⌘1 ?
- Les dossiers dans la grille : nécessaires, ou signe que le plafond est trop bas ?
