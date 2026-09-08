# Reprendre Nash 0.3 — finir la compilation et vérifier l’identité

Projet : `~/Nash`.

## Message à donner à l’autre IA

> Reprends le projet `~/Nash`. Lis `docs/05-passation.md`,
> `docs/06-validation.md` et `docs/07-reprise-compilation.md`.
> L’implémentation de la passation est faite : ne la recommence pas.
> Les 13 tests du modèle et les 30 contrôles d’intégration sur l’artifact passent.
> Une compilation complète est déjà lancée ; vérifie son état avant de lancer
> quoi que ce soit. Termine cette compilation, puis exécute les contrôles sur
> le binaire complet pour prouver que le profil et le remoting appartiennent
> bien à Nash. Mets ensuite le rapport de validation à jour et indique comment
> lancer l’application. Ne supprime aucun profil existant.

## État au passage de relais

Le 8 septembre 2026, après environ 40 minutes de compilation complète :

- La compilation complète progresse dans les composants C++ `dom/…`.
- Aucun `error:` / `E ERROR` n’a été observé dans son journal à ce stade.
- Des avertissements du code amont sont présents ; ce n’est pas une compilation
  annoncée sans avertissement.
- **La compilation complète n’est pas encore validée.** Le profil propre Nash
  reste donc à vérifier sur le binaire final.
- Journal : `~/Nash/build/full-v03.log`.
- Processus tenant le journal au dernier contrôle : `5529`, `5577`, `5578`.
  Ces PID sont des repères temporaires : vérifier qu’ils existent encore.
- Dossier d’objets à conserver : `~/Nash/nash-obj-full`.
- Environ 100 Go de disque restaient disponibles au dernier contrôle.

La version artifact est compilée et a passé les essais dans Gecko. Elle garde
volontairement le lanceur précompilé Firefox et **ne prouve pas** l’isolation du
répertoire applicatif de Nash. Elle se lance uniquement avec un profil explicite.

## Ce qui est implémenté

- Sidebar inspirée de la référence fournie : deux sections, grille locale,
  teintes par espace, palettes claire/sombre, focus clavier et monogrammes.
- Onglets rattachés à un espace, filtrés et restaurés avec SessionStore.
- Container attribué avant le chargement des nouveaux onglets ; liens issus
  d’une tuile à compte fixe conservés dans son espace visible.
- Ajout, retrait sans fermeture de page, renommage, changement de portée,
  glisser-déposer et réorganisation accessible au clavier.
- Création/renommage d’espaces et choix de teinte.
- Icônes locales mises en cache, priorité à l’icône manuelle, rejet du SVG.
- Vrai dialogue au second espace, choix mémorisé, annulation sans partage de session.
- ⌘1–⌘9, ordre global puis local.
- Correction des noms des helpers GPU/média dans les artifacts, sans désactiver
  le GPU ou le sandbox.
- Identité Nash configurée dans la compilation complète, outils Rust installés.

Les ajouts sont dans l’overlay ; les deux patchs Mozilla existants sont conservés.
Aucun patch amont supplémentaire n’a été ajouté. Aucun profil existant n’a été supprimé.

## 1. Vérifier la compilation existante

```sh
cd ~/Nash
tail -n 40 build/full-v03.log
lsof -t build/full-v03.log
```

Si elle tourne encore, suivre ce journal et attendre sa fin. **Ne pas lancer une
seconde compilation dans le même objdir**, ne pas faire de clobber, ne pas
re-télécharger Firefox ou reconstruire les fonctionnalités déjà terminées.

Une réussite doit être constatée dans le journal (`Your build was successful!`)
et par la présence du bundle complet. Si le processus s’est arrêté ou si une
correction a été nécessaire, reprendre de façon incrémentale :

```sh
cd ~/Nash/src
MOZCONFIG=~/Nash/build/mozconfig.full ./mach build > ../build/full-v03-resume.log 2>&1
```

La chaîne Rust 1.98.1 se trouve dans `build/toolchains/` ; le mozconfig définit
`CARGO_HOME`, `RUSTUP_HOME` et `PATH`. Le composant `llvm-tools-preview` a été
installé après des avertissements de chargement de `rust-objcopy`. Les premières
lignes du journal peuvent donc conserver des avertissements antérieurs à ce correctif.

## 2. Exécuter la vérification restante sur le vrai binaire Nash

```sh
cd ~/Nash
python3 tools/tests/integration.py \
  nash-obj-full/dist/Nash.app/Contents/MacOS/nash \
  --expect-name Nash \
  --output build/validation-full
```

Ce script lance ses propres processus et son serveur HTTP local, dans un profil
jetable. Il ferme ses processus, redémarre une fois pour vérifier la restauration,
puis retire le profil de test. Marionette est limité à ce processus de test.

Résultats attendus : **32 contrôles réussis**, dont :

- `Services.appinfo.name` : `Nash` ;
- `Services.appinfo.remotingName` : `nash` ;
- `UAppData` : `~/Library/Application Support/Nash` ;
- PID GPU positif, sans `MOZ_DISABLE_GPU_PROCESS` ;
- cookies réellement isolés, onglets filtrés, instances réutilisées,
  dialogue natif, actions de tuiles et restauration après relance.

Lire `build/validation-full/runtime.json`, `results.json` et les journaux.
Les captures `dark.png` et `light.png` sont produites automatiquement.
Ne pas considérer le seul fichier `application.ini` comme une preuve.

## 3. Ce qui est déjà vérifié, à ne pas refaire sans raison

- `node --test tools/tests/model.test.cjs` : **13/13**.
- `tools/tests/integration.py` sur l’artifact : **30/30**.
- Compilation artifact, correctif de helpers idempotent, syntaxe JS/Python/shell.
- Deux thèmes, teinte par espace, badges sans débordement.
- Modèle partagé entre fenêtres normales ; fenêtre privée laissée native.

Preuves copiées dans `~/Nash/build/validation-artifact/`.
Journal du modèle : `~/Nash/build/model-tests.log`.

Relancer les tests concernés si du code est modifié, ou si le binaire complet
révèle une différence. Les scénarios réels de DRM, extensions, très longues
sessions, sidebar repliée et expansion au survol restent des vérifications
manuelles complémentaires, pas des résultats déjà acquis.

## 4. Clore la passation

Après validation complète :

1. Mettre `docs/06-validation.md` à jour avec les résultats runtime réels et
   remplacer la mention « compilation complète en cours ».
2. Mettre à jour l’état dans `README.md` et ce document de reprise.
3. Fournir le chemin du bundle et la commande de lancement :

```sh
cd ~/Nash
./tools/run-dev.sh full
```

Cette commande utilise `.devprofile`. Si une ancienne instance utilise déjà ce
profil, la fermer normalement avant de lancer la nouvelle ; ne pas tuer tous les
processus Firefox de la machine.

La compilation locale ne fournit pas à elle seule une distribution notarifiée ni
un service de mises à jour Nash. Le circuit de publication et les tests sur les
sites réellement utilisés restent des étapes distinctes.
