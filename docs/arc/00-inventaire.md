# Inventaire du bundle Arc

Relevé le 18 octobre 2026 sur `/Applications/Arc.app`, version **1.168.0** (build 88413),
macOS 13 minimum. Signé par l'éditeur, hardened runtime actif.

## Méthode et périmètre

Première passe, sans décompilation ni désassemblage. Sources utilisées :

- les métadonnées publiques du bundle (`Info.plist`, entitlements de signature,
  liste des frameworks et des ressources) ;
- l'interface AppleScript publique d'Arc (son dictionnaire de scripts), documentée
  pour les tiers ;
- la **structure** (clés et types, aucune valeur) des fichiers locaux d'Arc dans
  `~/Library/Application Support/Arc`, plus des comptages agrégés. Le fichier
  d'état d'authentification n'a pas été ouvert.

Deuxième passe (même jour, après accord pour l'analyse native selon `docs/09`) :
**chaînes et noms de types** de la tranche arm64 du binaire principal. Aucun moteur
de décompilation n'est configuré (Ghidra, Hopper, IDA absents). L'outil de
métadonnées Swift de REA refuse le binaire, trop gros pour son budget (165 Mo
contre 64 Mo). Il n'y a donc eu **aucune décompilation** : seulement `strings`,
`otool` et l'inspection Mach-O de REA. Les textes d'interface d'Arc ont servi à
comprendre le comportement. Ils sont **paraphrasés** ici et jamais recopiés.

Les sources montrent aussi l'architecture : modules Swift par fonctionnalité,
organisés en état, actions et reducers (le style de The Composable Architecture),
avec des clients injectables pour le stockage et le réseau.

Ce qui en sort : des **observations statiques**. Rien ici ne prouve un comportement à
l'exécution. Un framework présent n'est pas forcément appelé, ni à chaque lancement.

## Architecture générale

- **Coquille native en Swift**, découpée en modules nommés par fonction : command bar,
  Little Arc, boosts, split, création d'espace, éditeur de style d'espace, sidebar
  persistée, sync CloudKit, traduction, Ask Arc, blocage de pub, Easel, Capture, etc.
  On peut lire ce découpage comme la carte des fonctionnalités vue par l'éditeur.
- **Moteur Chromium embarqué** dans un framework dédié, version **155.0.8059.40**,
  avec les processus auxiliaires habituels (renderer, GPU, alertes). Une seconde
  série de processus auxiliaires porte un nom de code distinct : un deuxième type de
  fenêtre ou de contexte web, à identifier (hypothèse : Little Arc ou les aperçus).
- **Bibliothèques tierces** : Sparkle (mises à jour), Sentry et Datadog (erreurs et
  observabilité), Firebase (auth, Firestore, messagerie push), gRPC, Lottie
  (animations), SDWebImage, LevelDB, swift-crypto, un lecteur YouTube.
- **AppleScript** activé, avec un schéma d'URL propre à l'application et une prise en
  charge comme navigateur par défaut (http, https, mailto, PDF, HTML).

## Fichiers produits

| Fichier | Ligne de la grille | État |
|---|---|---|
| `espaces.md` | Espaces | partiel |
| `epingles-favoris.md` | Épinglés et favoris | partiel |
| `dossiers.md` | Dossiers d'onglets | partiel |
| `archivage.md` | Onglets qui s'archivent | partiel |
| `sync.md` | Sync | partiel |
| `vie-privee.md` | Où Nash doit faire mieux, vie privée | partiel |
| `little-arc.md` | Little Arc | partiel |
| `split-view.md` | Split view | partiel |
| `palette.md` | Palette de commandes | partiel |
| `boosts.md` | Boosts | partiel |

Restent à faire : la sidebar (redimensionnement, repli, état persisté), une
capture réseau en usage normal pour mesurer `vie-privee.md`, et les inconnues de
chaque fichier. Les poids du classement de la palette et la dérivation des
teintes demandent un moteur de décompilation (Ghidra 12.1, via
`GHIDRA_INSTALL_DIR`).
