# Sync

Sources : entitlements de signature, frameworks présents, structure du fichier
local de la sidebar.

## Ce que fait Arc

- **Deux mécanismes de synchronisation coexistent** dans le même fichier de
  sidebar : un état de synchronisation pour **Firebase / Firestore** et un autre
  pour **CloudKit** (iCloud), chacun avec sa propre copie des éléments.
  Hypothèse : une migration de l'un vers l'autre, ou un double fonctionnement
  pendant la transition.
- Ce qui est synchronisé : l'ordre des espaces, les modèles d'espace (titre,
  icône, thème) et les éléments de sidebar (onglets épinglés, dossiers,
  documents). Chaque valeur porte la date de dernière modification et l'appareil
  qui l'a faite : la règle de conflit ressemble à « la dernière écriture
  l'emporte », champ par champ.
- Les suppressions non encore confirmées par le serveur sont gardées dans une
  liste à part, pour les rejouer.
- Un fichier local contient une **clé de chiffrement liée à Firebase**. On peut en
  déduire qu'une partie des données est chiffrée côté client avant l'envoi, sans
  savoir lesquelles ni avec quel schéma.
- L'application utilise un conteneur iCloud dédié à la sidebar et les
  notifications push d'Apple en production.

## Écart avec Nash

- Arc exige un compte pour synchroniser. Nash (pilier 1) n'impose aucun compte :
  la sync doit être optionnelle, et chiffrée de bout en bout si elle existe.
- Stocker la date et l'appareil de chaque modification, avec une file de
  suppressions en attente, est un modèle simple. Il est à reprendre si Nash
  synchronise un jour.

## Inconnues

- Ce qui est chiffré, et si la clé quitte l'appareil.
- Si l'archive, l'historique et les boosts sont synchronisés.
