# Validation — Nash 0.3

État au 8 septembre 2026. Source Mozilla : `1e10d63baf4d`, branche ESR du projet.
Les tests utilisent des profils temporaires, jamais le profil de développement
ou les données d’un Firefox installé.

## Résultats acquis

- Compilation artifact réussie avec les deux patchs Mozilla existants.
- **13 tests du modèle réussis**, exécutant directement le vrai `nash.js` dans un
  contexte simulé (`tools/tests/model.test.cjs`).
- **30 contrôles d’intégration réussis dans Gecko**, serveur HTTP local, avec
  fermeture et redémarrage réels (`tools/tests/integration.py`).
- Le processus GPU démarre avec les alias d’exécutables et sans
  `MOZ_DISABLE_GPU_PROCESS`. Les helpers GPU et média sont corrigés automatiquement
  par `tools/build.sh artifact` et `tools/run-dev.sh artifact`.
- Captures contrôlées en thèmes clair et sombre. La palette suit les espaces.
  Les couleurs des badges clairs ont été renforcées : contraste calculé minimal
  4,78:1 (badge hérité) et 4,81:1 (badge fixé), sur les six teintes au survol.
  Les monogrammes ont un contraste minimal calculé de 4,60:1.

Les contrôles dans le navigateur couvrent :

1. Identité du runtime et démarrage d’un premier onglet dans un container.
2. Démarrage du GPU.
3. Cookies réellement déposés par HTTP et séparés entre deux containers.
4. Masquage des onglets non épinglés selon leur espace.
5. Une instance héritée par espace et réutilisation d’une instance fixée.
6. Création native d’un onglet avec le container courant, avant chargement,
   et conservation de l’espace visible pour les liens issus d’une tuile à compte fixe.
7. Réutilisation après redirection HTTP, avec identifiant SessionStore.
8. Raccourcis clavier natifs ⌘1 et ⌘4, ordre global puis local.
9. Plafond de la ligne globale sans perte de tuile.
10. Ajout d’une page ouverte et retrait de tuile sans fermer la page.
11. Création et renommage d’espace avec un container distinct.
12. Vrai dialogue de choix de session au second espace, annulation sans effet,
    acceptation par défaut de sessions séparées.
13. Lecture d’une icône locale, priorité sur la favicon et rejet du SVG.
14. Glisser-déposer à travers les gestionnaires DOM et ouverture du menu natif.
15. Propagation du modèle entre deux fenêtres normales.
16. Fenêtre privée native, sans modèle Nash persistant.
17. Place réservée aux onglets, badges sans débordement, deux thèmes et teintes.
18. Restauration des espaces, de l’appartenance des onglets et d’une tuile
    redirigée, sans duplication après fermeture et relance.

## Compilation complète

La reprise a été documentée à la demande de l’utilisateur dans
`docs/07-reprise-compilation.md`, sans attendre la fin de la compilation.
Les preuves de tests artifact sont dans `build/validation-artifact/`.

**En cours de validation.** Le mozconfig complet contient désormais l’identité
Nash, le nom d’exécutable `nash` et la distribution `org.nash`.
Les outils Mozilla ont été installés par bootstrap sans changement des paquets
système. Rust 1.98.1 et ses outils LLVM sont privés au projet (`build/toolchains`).
La compilation se fait en quatre jobs ; journal `build/full-v03.log`.

La preuve d’isolation finale sera l’exécution du test avec `--expect-name Nash` :
le nom runtime, le remoting et `UAppData` doivent appartenir à Nash. L’artifact
reste explicitement identifié comme Firefox au runtime ; il ne valide pas ce point.

## Journaux et reproduction

    node --test tools/tests/model.test.cjs
    ./tools/build.sh artifact
    python3 tools/tests/integration.py \
      nash-obj-artifact/dist/Nash.app/Contents/MacOS/firefox \
      --output build/validation-artifact

    ./tools/build.sh full
    python3 tools/tests/integration.py \
      nash-obj-full/dist/Nash.app/Contents/MacOS/nash \
      --expect-name Nash --output build/validation-full

Chaque répertoire de validation reçoit `results.json`, `runtime.json`, les
journaux des deux démarrages et les captures `dark.png`/`light.png`.

## Limites et diffusion

- Les pages HTTP locales vérifient les mécanismes d’isolation et de session ;
  elles ne remplacent pas des essais sur les sites, DRM, extensions et usages réels.
- Gecko maintient visibles les onglets qui partagent caméra, micro ou écran.
- Les tuiles sont des onglets épinglés natifs en interne. Les outils natifs de
  recherche peuvent encore les retrouver en dehors de la grille de l’espace.
- Les fenêtres privées conservent l’interface et le fonctionnement natifs.
- Les contrôles automatiques ne constituent pas un audit de sécurité complet.
- La signature de distribution, la notarisation et un service de mises à jour
  Nash ne sont pas fournis par ces changements ; la compilation locale est une
  étape de développement, pas une publication.
- Les données existantes de Firefox n’ont pas été supprimées. Aucun changement
  n’a été apporté aux choix Safe Browsing/DoH ni à la branche ESR.
