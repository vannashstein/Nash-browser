# Archivage des onglets

Écrit depuis `docs/arc/archivage.md` et `docs/10-plan-reproduction.md`, sans lecture
de sortie brute de REA. **Non exécuté** : syntaxe vérifiée seulement.

## Ce que ça fait

- **Un délai par espace** : 1 h, 6 h, 12 h, 1 jour, 7 jours, 30 jours, jamais
  (clic droit sur l'espace). Valeur par défaut : **jamais**. Elle passera à 7
  jours seulement après les tests (décision D13 proposée).
- **Archivage automatique** : toutes les 5 minutes (première passe 1 minute après
  le démarrage), un onglet inactif depuis plus longtemps que le délai de son
  espace est archivé. Au plus 10 onglets par passe.
- **Archivage manuel** : "Archiver l'onglet" dans le menu contextuel d'un onglet.
- **Archive** : bouton `▤` dans la barre du bas, avec le nombre d'onglets. Il liste
  les 15 plus récents (titre, espace, "(auto)" si automatique). Un clic restaure.
- **Restauration** : l'onglet revient dans son espace, **dans son container
  d'origine** (sa session est donc celle d'avant, pas celle de l'espace voisin).
  Si l'espace a été supprimé, dans l'espace courant.
- **Stockage** : `nash-archive.json` dans le profil. Chaque entrée : URL, titre,
  espace, container, date d'archivage, dernière activité, motif.
- **Rétention** : 90 jours, puis purge. Pas de copies horodatées sans limite.

## Garanties (D13 proposée)

- L'écriture sur disque se fait **avant** la fermeture. Un échec d'écriture laisse
  l'onglet ouvert.
- Jamais archivés : onglet sélectionné, épinglé, "gardé", instance de tuile, onglet
  qui partage caméra, micro ou écran, onglet qui joue du son, onglet qui demande
  l'attention, adresse qui n'est pas http(s).
- Un fichier d'archive illisible n'est jamais écrasé : il est renommé en
  `.corrompu`.

## Ce qui n'est pas fait

- **Le contenu de la page est perdu** : seuls l'URL et le titre sont gardés. Un
  formulaire à moitié rempli ne revient pas. Arc garde en plus un instantané de la
  page ; Nash ne le fait pas.
- **Pas de bandeau** qui explique la première archive automatique (Arc en a un).
  À ajouter avant de passer le défaut à 7 jours.
- **Pas de page d'archive** avec filtres par espace et par motif. Le menu ne
  montre que les 15 derniers.
- **Pas de "supprimer un dossier archive son contenu"** : il n'y a pas encore de
  dossiers.
- **Pas de seuil séparé pour la fenêtre rapide** : elle n'existe pas encore.
- Les fenêtres se partagent le fichier par relecture à chaque écriture. Deux
  archivages simultanés dans deux fenêtres pourraient perdre une entrée.
  Improbable (une passe toutes les 5 minutes), non éliminé.

## À tester sur le Mac

1. Clic droit sur un espace : choisir "Archiver après 1 heure". Vérifier la coche.
2. Archiver un onglet à la main : il se ferme, le compteur `▤` monte, l'entrée
   apparaît dans le menu.
3. Restaurer : l'onglet revient dans son espace et son container, avec sa session.
4. Pour tester l'automatique sans attendre une heure : en console du navigateur,
   remplacer `Nash.ARCHIVE_SWEEP_MS` et le délai, ou définir `archiveH` sur 1 et
   modifier `lastAccessed` d'un onglet de test.
5. Onglets protégés : un onglet épinglé, un onglet "gardé", un onglet qui joue du
   son ne doivent pas être archivés.
6. Rétention : une entrée de plus de 90 jours disparaît au prochain archivage.
7. Fichier corrompu : écrire n'importe quoi dans `nash-archive.json`, relancer :
   un `.corrompu` apparaît, l'archive repart vide.
8. Deux fenêtres, fenêtre privée (Nash n'y est pas installé : rien ne doit se passer).
9. Le bouton `▤` ne doit pas écraser le sélecteur d'espaces quand il y a
   beaucoup d'espaces.

## Résultats du 18 octobre 2026

Testé sur une compilation artifact, commit bc731d5 puis correctifs. Le mode
automatique et les cas difficiles à produire à la main ont été pilotés depuis la
console du navigateur : vieillissement d'un onglet en modifiant sa date de
dernière activité, et appel direct de la passe d'archivage.

| # | Test | Résultat |
|---|---|---|
| 1 | Délai par espace : choix et coche | **réussi** pour un espace existant ; voir l'échec mineur plus bas |
| 1b | Délais indépendants : un espace à 1 h, l'autre à « jamais » | **réussi** : les onglets vieillis de l'espace sans délai restent |
| 2 | Archivage manuel d'un onglet non affiché | **réussi** : il se ferme, le compteur monte, l'entrée apparaît |
| 2b | Archivage manuel de l'onglet **affiché** | **échec, corrigé** |
| 3 | Restauration dans son espace et son container | **réussi**, y compris depuis un autre espace |
| 3b | Restauration d'un onglet dont le container diffère de celui de l'espace | **réussi** : il revient avec son container d'origine |
| 3c | Restauration quand l'espace d'origine a été supprimé | **réussi** : dans l'espace affiché, container d'origine conservé |
| 4 | Archivage automatique (passe appelée à la main) | **réussi** : motif « auto » |
| 4b | Archivage automatique par le **minuteur réel** (5 min) | **réussi** : onglet vieilli archivé à la passe suivante |
| 5 | Onglets protégés : épinglé, gardé, son (simulé), onglet affiché, adresse non http(s) | **réussi** : aucun archivé |
| 6 | Rétention : entrée de 100 jours | **réussi** : purgée à la première écriture |
| 7 | Fichier corrompu | **réussi** : erreur journalisée, archive vide, fichier renommé en `.corrompu` |
| 8 | Deux fenêtres : compteur ▤ | **échec, corrigé** |
| 8b | Fenêtre privée | **réussi** : ni bouton, ni entrée de menu, ni minuteur |
| 9 | ▤ avec beaucoup d'espaces | **échec, corrigé** |

### Les trois échecs et leur correction

**Onglet affiché impossible à archiver à la main.** L'onglet sélectionné faisait
partie des onglets protégés, pour l'automatique comme pour le manuel : l'entrée
« Archiver l'onglet » n'apparaissait pas. Corrigé : la protection de l'onglet
affiché ne vaut plus que pour l'archivage automatique. Vérifié : l'entrée
apparaît sur l'onglet affiché, l'onglet est archivé, et la sélection passe à un
autre onglet du même espace.

**Compteur ▤ périmé dans les autres fenêtres.** Seule la fenêtre qui écrivait
mettait son compteur à jour. Une autre fenêtre affichait « 0 onglet(s) » alors
que le fichier en contenait un. Corrigé : chaque lecture ou écriture de l'archive
met à jour le compteur de toutes les fenêtres. Vérifié : après un archivage dans
la fenêtre 1, les deux fenêtres et le fichier indiquent 4.

**▤ inaccessible dès cinq espaces.** La barre débordait (266 px de contenu pour
240 visibles) et poussait ▤ hors de la colonne. Elle ne pouvait pas non plus
défiler, parce que le défilement horizontal y changeait d'espace. Corrigé : + et ▤
restent collés au bord droit de la barre, et sur une barre qui déborde le geste
horizontal la fait défiler. Vérifié avec sept espaces : ▤ visible et utilisable,
la barre défile sans changer d'espace, et le geste sur le reste de la colonne
change toujours d'espace.

### Défauts restants, non corrigés

- **Délai d'un espace créé pendant la session** : aucune entrée n'est cochée.
  Le champ n'est initialisé qu'au chargement du modèle. L'effet est bien
  « jamais », mais le menu ne le montre pas.
- **Espace actif caché avec beaucoup d'espaces** : il peut se trouver sous les
  boutons + et ▤ ou hors de la vue. Rien ne le fait revenir dans la vue.
- **Rétention appliquée à l'écriture seulement** : une entrée périmée reste
  visible dans le menu ▤ tant que rien n'a été écrit.
- **Écriture non atomique** : `IOUtils.writeJSON` est appelé sans fichier
  temporaire. Une coupure pendant l'écriture pourrait laisser un fichier tronqué,
  qui serait alors traité comme corrompu.

### Trouvé en passant : suppression d'espace et confirmations empilées

`deleteSpace()` calcule la position de l'espace dans la liste **avant** la
confirmation, et s'en sert **après**. Si le modèle change pendant que la
confirmation est ouverte, la mauvaise position est retirée. Observé avec trois
suppressions lancées à la suite depuis la console : leurs confirmations se sont
empilées, et c'est un autre espace que celui confirmé qui a disparu. En usage
normal, le même cas peut se produire si une autre fenêtre crée ou supprime un
espace pendant qu'une confirmation est ouverte. Piste : retrouver l'espace par
son identifiant dans le modèle courant après la confirmation.
