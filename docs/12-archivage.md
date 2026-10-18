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
