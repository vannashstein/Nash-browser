# Fin de chantier : ce qui reste avant de fusionner dans main

Écrit le 19 octobre 2026. L'utilisateur a demandé un travail mené jusqu'au bout sans
aller-retour. Ce document est la définition de "terminé" pour la branche
`analyse-arc`, et la règle de travail entre les deux sessions.

## Qui fait quoi

- **Session cloud** (`session_013hgRussECcsngV2fXJiv79`) : écrit le code de
  l'overlay à partir de `docs/arc/` et des faits mesurés, sans lire de sortie brute
  de REA (règle 2 de `docs/09-analyse-arc.md`). Elle ne peut pas compiler.
- **Session locale** (Mac, Remote Control) : compile, lance, mesure, teste, consigne
  les résultats dans `docs/`, commite et pousse sur `analyse-arc`. Elle répond à la
  session cloud par `send_message`. Elle a lu des sorties de REA : quand elle corrige
  du code, elle le dit dans le message de commit.
- Rien n'est fusionné dans `main` sans une pull request relue.

## Fait et validé

| Fonction | Document | Décision |
|---|---|---|
| Sidebar masquée, révélation au bord | `docs/11` | — |
| Défilement entre espaces | `docs/11` | — |
| Suppression d'espace non destructive | `docs/11` | D12 |
| Archivage par espace | `docs/12` | D13 |
| Grille unique par espace | — | D14 |
| Liens externes en container jetable, onglets rouverts au démarrage | `docs/13`, `docs/14` | D15 |
| Boosts CSS par site et par compte | `docs/15` | D16 |
| Vie privée de la barre d'adresse | `overlay/.../firefox-branding.js` | — |

## Reste à faire, dans cet ordre

1. **Compilation complète** (`./tools/build.sh full`) : le binaire s'appelle `nash`,
   le test d'intégration passe avec `--expect-name Nash`. Mesure : durée, taille,
   résultat de la suite.
2. **Fuite de marque "Nightly"** sur la page des fenêtres privées : trouver d'où elle
   vient (fichier exact) et la corriger dans l'overlay si c'est possible sans patch
   Mozilla.
3. **Vue scindée** : Firefox 153 l'a nativement (`browser.tabs.splitView.enabled` vaut
   vrai dans `browser/app/profile/firefox.js` de la branche esr153). Nash ne la
   réécrit pas (`docs/10`, section 7). Vérifier qu'elle cohabite avec Nash : deux
   containers côte à côte, changement d'espace, archivage, sidebar masquée.
   Corriger ce qui casse. Faits consignés dans `docs/17-vue-scindee.md`.
4. **Palette de commandes** (`docs/10`, section 5) : mémoire "saisie -> choix" par
   espace, sur la barre d'adresse native, locale, sans service tiers.
   `docs/18-palette.md`. Écrite le 19 octobre 2026, à tester.
5. **Teintes dérivées** (`docs/10`, section 1) : **déjà fait** par la passe visuelle
   018c96c. L'espace ne stocke qu'une teinte (`teinte`), et `nash.css` en dérive les
   tons du haut et du bas en `color-mix(in oklab, …)`, avec une version claire et une
   sombre (`light-dark`). Reste à **mesurer** le contraste du texte sur les six teintes,
   en clair et en sombre (seuil visé : 4,5:1 pour le texte courant).
6. **Revue finale** : test d'intégration et tests du modèle verts sur la
   compilation complète, `README.md` et `docs/05-passation.md` à jour, puis pull
   request de `analyse-arc` vers `main`.

## Hors de ce chantier, par décision

- **Synchronisation** (`docs/10`, section 8) : reportée. Elle demande un choix de
  chiffrement et de stockage qui mérite sa propre décision.
- **Fenêtre légère type Little Arc** : repoussée par D15.
- **Raccourci clavier global** : impossible sans code natif (`docs/13`, B5).

## Résultats du lot 1 (session locale, 19 octobre 2026)

Sur c689fba. Détails de la vue scindée dans `docs/17-vue-scindee.md`.

### 1. Compilation complète : bloquée, en attente d'une décision

- `build/mozconfig.full` attend Rust dans `build/toolchains/`. Ce dossier est ignoré par
  git et **absent de cette copie du dépôt** (`/Users/jf/Documents/B-20`). Ni `rustc` ni
  `cargo` ne sont installés ailleurs (`~/.cargo`, `~/.rustup`, `~/.mozbuild`), et
  l'ancien dossier `~/Nash` n'existe plus. `nash-obj-full` n'existe pas non plus.
- Pour la lancer, il faut télécharger Rust (rustup, plusieurs centaines de Mo), puis
  compter 2 à 3 h et 30 à 40 Go d'objdir (83 Go libres). La session locale ne
  télécharge rien sans l'accord de l'utilisateur.
- À la place, sur l'**artifact** :
  - `node --test tools/tests/model.test.cjs` : **15/15**.
  - `tools/tests/integration.py` (nom attendu `Firefox`, comme toujours sur
    l'artifact) : **échec au contrôle `/window-external`** ; les 35 autres contrôles
    passent (copie de la suite sans ce cas).
- Le contrôle `/window-external` ouvre une adresse par `openURI(…, OPEN_EXTERNAL)`
  avec `browser.link.open_newwindow.override.external` = 2 et attend une **nouvelle
  fenêtre**. Depuis f48ef63 (l'enveloppe d'`openURI` agit vraiment), Nash ouvre tout
  lien externe dans un onglet jetable de la fenêtre courante, quel que soit ce
  réglage. Le test date d'avant f48ef63. À trancher : adapter le test à D15, ou faire
  respecter par Nash le choix « nouvelle fenêtre ».

### 2. « Nightly » sur la page des fenêtres privées : corrigé

- MESURÉ sur l'artifact : le texte (« Nash deletes your cookies… »), le titre
  (« Nash — Private Browsing ») et le logotype `chrome://branding/content/firefox-wordmark.svg`
  sont à Nash. La marque Nightly est **le logo**
  `chrome://branding/content/about-logo-private.png` (et `@2x`) : masque violet avec le
  globe de Nightly. Ces deux fichiers sont ceux de la marque `unofficial`, copiés par
  `tools/apply-overlay.sh` (empreinte identique), que ni l'overlay ni
  `tools/make-icon.py` ne remplaçaient.
- Correction, sans patch Mozilla : `tools/make-icon.py` écrit aussi
  `about-logo-private.png` (192 px) et `about-logo-private@2x.png` (384 px) avec le
  mark de Nash, comme `about-logo.png`. Vérifié : la page privée montre le N de Nash.
- Compilation complète : non vérifiée (voir 1). La même chaîne de marque
  (`--with-branding=browser/branding/nash`, même `jar.mn`) devrait donner le même
  résultat.
- Autre marque de tiers sur cette page, laissée telle quelle : la promotion
  « Firefox Focus » (`browser.promo.focus.enabled`, vrai dans `firefox.js`). La
  couper est un choix.

### 3. Vue scindée

Voir `docs/17-vue-scindee.md`. Un défaut (archivage d'un volet affiché) et deux
décisions.

## Décisions du lot 1 (session cloud, sur délégation)

1. `/window-external` : D15 l'emporte, le test est adapté (D18).
2. Vue scindée entre deux espaces : autorisée, la vue est une unité (D17).
3. Archivage : aucun onglet d'une vue scindée, active ou suspendue (D17).
4. Promotions Mozilla sur la page privée et ailleurs : coupées (D18).
5. Compilation complète : faite en dernier, avec la chaîne Rust installée dans
   `build/toolchains/` comme le prévoit `docs/02-build.md`.

## Résultats du lot 2 (session locale, 19 octobre 2026)

Sur l'artifact de 71279ae, avec les corrections de la session locale décrites dans
`docs/17` (vue scindée) et `docs/18` (palette). Détails dans ces documents.

| Point | Résultat |
|---|---|
| A. Vue scindée (D17) | RÉUSSI après un correctif (onglet de l'autre espace visible dès la création) |
| B. Palette | RÉUSSI après deux correctifs (mémoire jamais écrite ; fournisseur perdu à la fermeture de la fenêtre qui l'avait enregistré) |
| C. Promotions (D18) | RÉUSSI : sur trois chargements de la page privée, ni bloc `.promo`, ni « Focus », ni « VPN » ; les quatre réglages valent faux |
| D. Contraste | texte principal au-dessus de 4,5:1 partout ; **texte secondaire sous 4,5:1 en clair** (tableau ci-dessous) |
| E. Tests | modèle **15/15**, intégration **36/36** (artifact, nom attendu `Firefox`) |
| F. Compilation complète | **sautée** : aucun `nash-obj-full` ni chaîne Rust sur ce Mac (recherche dans `~` et `/` sur 6 niveaux) ; pas de compilation depuis zéro, comme demandé |

### Contraste de la sidebar (item 5)

MESURÉ dans Nash : pour chaque teinte, `--nash-accent` posé sur la racine comme le
fait Nash, `color-scheme` imposé sur un élément sonde, couleurs résolues par Gecko
(`light-dark()`, `color-mix()`) puis converties en sRGB par un canvas. Rapport WCAG
2 contre les deux extrémités du dégradé de fond (`--nash-tint-top` en haut,
`--nash-tint-bot` en bas) et contre une ligne sélectionnée (`--nash-sel` sur le haut
du dégradé). Texte principal : `--nash-ink`. Texte secondaire : `--nash-muted`
(indications, badges, chevrons, bouton Annuler). En gras : sous 4,5:1.

| Teinte | Thème | Principal haut | Principal bas | Principal sur sélection | Secondaire haut | Secondaire bas | Secondaire sur sélection |
|---|---|---|---|---|---|---|---|
| `#527b89` | clair | 11,20 | 8,79 | 16,86 | **3,98** | **3,12** | 6,00 |
| `#527b89` | sombre | 10,70 | 13,57 | 6,80 | 5,27 | 6,68 | **3,35** |
| `#8b6d9c` | clair | 11,36 | 8,94 | 16,83 | **4,04** | **3,18** | 5,99 |
| `#8b6d9c` | sombre | 10,55 | 13,43 | 6,67 | 5,20 | 6,62 | **3,28** |
| `#668777` | clair | 11,62 | 9,31 | 16,89 | **4,13** | **3,31** | 6,01 |
| `#668777` | sombre | 10,28 | 13,15 | 6,50 | 5,06 | 6,48 | **3,20** |
| `#ae805d` | clair | 11,99 | 9,78 | 16,98 | **4,26** | **3,48** | 6,04 |
| `#ae805d` | sombre | 9,76 | 12,86 | 6,24 | 4,81 | 6,33 | **3,07** |
| `#657fa6` | clair | 11,58 | 9,19 | 16,91 | **4,12** | **3,27** | 6,01 |
| `#657fa6` | sombre | 10,33 | 13,28 | 6,56 | 5,09 | 6,54 | **3,23** |
| `#a46678` | clair | 11,35 | 8,93 | 16,85 | **4,04** | **3,18** | 5,99 |
| `#a46678` | sombre | 10,60 | 13,43 | 6,71 | 5,22 | 6,62 | **3,31** |

- Texte principal : de 6,24 à 16,98, au-dessus du seuil partout.
- Texte secondaire, thème clair : de 3,12 à 4,26 sur le fond, sous le seuil pour les
  six teintes, surtout en bas du dégradé. Il passe sur une ligne sélectionnée
  (6,0).
- Texte secondaire, thème sombre : de 4,81 à 6,68 sur le fond ; sous le seuil
  (3,07 à 3,35) seulement s'il se trouve sur une ligne sélectionnée.
- Piste : foncer `--nash-muted` en clair (valeur à choisir, non mesurée), ou réduire la
  part de teinte de `--nash-tint-bot`. À recalculer avec la même méthode.

## Suite du lot 2 (session cloud)

- **Compilation complète : classée étape de publication, hors de ce chantier.** Aucun
  objdir complet ni chaîne Rust n'existe sur le Mac de développement, et une
  compilation depuis zéro y a déjà pris 9 h 43 en swap (D9). Elle se fera sur une
  machine de 32 Go ou plus, avec `./tools/build.sh full` puis
  `integration.py --expect-name Nash`. Ce qu'elle doit confirmer en plus de l'artifact :
  le nom du binaire, l'identité du profil, et l'absence de "Nightly" sur la page privée
  (le logo est déjà remplacé par `tools/make-icon.py`).
- **Contraste corrigé** : `--nash-muted` passe à `#3f454b` en clair et `#d1d6da` en
  sombre. Calcul à partir des rapports mesurés ci-dessus : au moins 4,82:1 sur les six
  teintes en bas du dégradé clair, au moins 4,83:1 sur une ligne sélectionnée sombre.
  À remesurer.
- **Séparation d'une vue scindée** dont l'onglet affiché vient d'un autre espace : Nash
  passe sur l'espace de cet onglet au lieu d'ouvrir un onglet vide, et ne retient plus
  un volet étranger comme "dernier onglet" d'un espace.
- **Palette** : une proposition identique à la première ligne de Firefox est fusionnée
  avec elle par Firefox. C'est voulu (pas de doublon).
