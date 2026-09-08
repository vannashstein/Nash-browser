# La couche chrome de Nash

## Ce que Firefox 153 fournit déjà

Découvert avant d'écrire la moindre ligne, et ça a changé toute l'approche.

La sidebar refondue (`sidebar.revamp`) et les onglets verticaux
(`sidebar.verticalTabs`) existent nativement. Mieux : les onglets épinglés y
sont **déjà rendus en grille CSS**.

    browser/themes/shared/tabbrowser/tabs.css
    #pinned-tabs-container[orient="vertical"] ::part(items-wrapper) {
      grid-template-columns: repeat(auto-fit, minmax(...));
      display: grid;
    }
    .tab-label-container { display: none; }

Grille, labels masqués, icônes centrées : c'est la structure des Essentials
d'Arc. Nash ne la réécrit pas, il la met à l'échelle d'un lanceur.

## L'ancrage — deux patchs, cinq lignes

| Patch | Fichier | Lignes ajoutées |
|---|---|---|
| `0001-register-nash-component` | `browser/components/moz.build` | 1 |
| `0002-load-nash-chrome` | `browser/base/content/browser.xhtml` | 4 |

C'est toute la dette de rebase de Nash. Tout le reste vit dans
`overlay/browser/components/nash/`, un dossier qui n'existe pas en amont.

    browser.jar:
        content/browser/nash/nash.css
        content/browser/nash/nash.js

Chargés depuis `browser.xhtml`, juste après `browser-main.js`.

## Le garde-fou : `:root[nash]`

`nash.js` pose l'attribut `nash` sur la racine du document. **Toutes** les
règles de `nash.css` en dépendent. Si le script ne s'exécute pas, Nash retombe
exactement sur la sidebar de Firefox au lieu d'afficher une interface à moitié
stylée. C'est ce qui rend un échec de chargement visible et sans danger.

## Vérifié

    console.log: "[Nash] couche chrome 0.1 — 4 containers disponibles"

Le script s'exécute, et il lit déjà les contextual identities de Gecko via
`ContextualIdentityService.getPublicIdentities()`. C'est la primitive dont
dépend tout le modèle : un espace possédera un container, une tuile
s'instanciera dedans (identité héritée) ou dans un container fixe (identité
fixée). Voir D5 et `docs/01-sidebar.md`.

## Outillage

`tools/seed-tiles.py` sème des onglets épinglés dans un profil de dev pour
voir la grille sans cliquer. Il écrit un `sessionstore` au format mozlz4 sans
aucune dépendance : le bloc LZ4 est émis en littéraux purs — un bloc valide
que Gecko décompresse normalement.

    python3 tools/seed-tiles.py .devprofile

## La sidebar de Nash — v0.2

### L'idée qui rend l'implémentation simple

Firefox ne fournit qu'un seul conteneur d'onglets épinglés et aucune notion
d'espace. Nash construit donc son propre DOM à côté, et **se sert des onglets
épinglés de Firefox comme stockage des instances**.

| | |
|---|---|
| Nash fournit | le modèle, les deux sections, les badges, les espaces |
| Firefox fournit | l'onglet, son container, sa favicon, sa persistance |

Ancrage : `#vertical-tabs`, le slot que Firefox prévoit pour le bandeau
latéral. `nash.js` s'initialise sur `load` et non `DOMContentLoaded` : avant
`load`, le toolbox n'y est pas encore reparenté et l'insertion casse la
fenêtre — elle ne s'affiche plus du tout.

### Vérifié dans le navigateur

- Les deux sections avec libellés et compteurs : `PARTOUT 3/4`, `GENERALE 3`
- Le badge de container sous chaque tuile
- **Changer d'espace change les badges de la ligne globale** — `perso` devient
  `loisirs` — sauf la tuile d'identité fixée, qui reste `kagi` en accent
- Cliquer une tuile ouvre le site **dans le container de l'espace**, confirmé
  par l'indicateur natif de Firefox dans la barre d'adresse
- Point vert d'instance vivante, anneau sur la tuile sélectionnée
- Le sélecteur d'espaces en bas

### Les icônes

Ordre : favicon de l'instance vivante, sinon cache local du modèle, sinon
**monogramme coloré** dont la teinte dérive de l'hôte. Jamais de globe
générique : sur une grille où l'on navigue au logo, une tuile aveugle est une
tuile morte.

La favicon vue une fois est écrite dans le modèle. C'est le début du cache
local d'icônes.

### Un bug trouvé en testant

Retrouver l'instance par comparaison d'origine échoue dès qu'un site redirige
— `mail.google.com` part vers `accounts.google.com` — et le clic suivant
créerait un doublon, exactement ce que la règle « une clé, une instance »
interdit.

Corrigé : l'onglet est **marqué** à sa création (`nash-tile`). La comparaison
d'origine reste en repli, car l'attribut ne survit pas à une restauration de
session, contrairement à l'onglet épinglé lui-même — un onglet retrouvé par
origine est alors adopté et marqué.

### Le modèle

Sérialisé en JSON dans la préférence `nash.model`. Les containers manquants
sont créés au démarrage par `ContextualIdentityService.create()` : chaque
espace obtient le sien.

## Ce qui reste à construire

1. **Le filtrage de la liste d'onglets par espace.** C'est la vraie limite de
   la v0.2 : les espaces regroupent les tuiles, mais tous les onglets non
   épinglés restent visibles quel que soit l'espace. Un espace n'est pas
   encore un ensemble d'onglets.
2. **La teinte par espace**, qui est le signal visuel du changement d'identité.
3. **Le remplacement manuel d'icône** — le cache existe, le choix à la main non.
4. **La question posée une fois** quand une tuile s'ouvre dans un second
   espace (D5). Le modèle supporte `identite: null`, l'interface non.
5. **⌘1–9** sur l'ordre affiché.
6. **Ajouter et réordonner les tuiles** depuis l'interface : aujourd'hui le
   modèle ne se modifie que par la bascule de portée.
