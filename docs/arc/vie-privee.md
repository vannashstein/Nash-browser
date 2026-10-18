# Vie privée : ce qu'Arc peut envoyer à l'extérieur

Sources : métadonnées du bundle, entitlements, frameworks présents, indicateurs de
configuration Firebase. **Observation statique seulement** : ce fichier liste les
canaux possibles. Il ne mesure ni volumes ni fréquences.

## Canaux identifiés

| Canal | Indice | Nature probable |
|---|---|---|
| Mises à jour | Sparkle, flux sur le domaine de l'éditeur, vérification automatique activée | appel périodique au serveur de l'éditeur |
| Rapports d'erreur | Sentry | plantages et erreurs |
| Observabilité | Datadog | métriques, journaux ou traces de performance |
| Compte et sync | Firebase Auth, Firestore, gRPC | identité et données de sidebar |
| Push | Firebase Cloud Messaging, push Apple en production | notifications du serveur |
| iCloud | CloudKit, conteneur dédié à la sidebar | sync de la sidebar |
| IA | module Ask Arc | requêtes vers un service distant (à confirmer) |
| Traduction | module dédié | probablement un service distant (à confirmer) |
| Domaines populaires | liste embarquée | probablement locale, pour la saisie d'adresse |

### Ajouts de l'analyse du binaire

- **Métriques de performance.** Le binaire définit une structure de rapport qui
  regroupe la mémoire par type de processus, le CPU (moyen, en arrière-plan,
  pendant une vidéo plein écran, au repos), la batterie, le nombre d'onglets
  vivants, gelés ou déchargés, le nombre de fenêtres normales et Little Arc,
  l'activation du bloqueur de pub et le nombre d'extensions de blocage, ainsi que
  le CPU du service d'IA. C'est vraisemblablement le contenu envoyé à Datadog. À
  confirmer par une capture réseau.
- **Domaines de l'éditeur** cités dans le binaire : le site principal, des
  sous-domaines pour les ressources, le contenu et la page de démarrage, et une
  organisation Sentry dédiée. On trouve aussi **des domaines de Dia**, le
  navigateur suivant de l'éditeur, dont un proxy de résultats de recherche. Une
  partie de la recherche par IA d'Arc passe donc probablement par
  l'infrastructure de Dia.
- **IA** : intégration ChatGPT dans la palette (sur adhésion), plus des fichiers
  de tokenizer téléchargés depuis le stockage public d'OpenAI.
- **Intégrations tierces** citées : Google (comptes, agenda, Drive), Microsoft
  Graph et Outlook, Notion, Slack, Atlassian. Ce sont probablement les aperçus et
  intégrations de la page d'accueil et de la sidebar.

Quelques précisions :

- La configuration Firebase embarquée **désactive** Analytics et la publicité,
  mais active la connexion, l'invitation et la messagerie push.
- L'application autorise le chargement de contenus non sécurisés pour tous les
  domaines (exception App Transport Security globale). C'est attendu pour un
  navigateur, puisque les pages web passent par Chromium, mais cela vaut aussi pour
  la coquille native.

## Écart avec Nash

Nash n'active par défaut aucun de ces canaux, sauf les mises à jour de sécurité.
Celles-ci doivent être visibles et vérifiables, ce que le choix d'ESR rend
possible (D2, D8).

## Pour mesurer plutôt que déduire

L'étape suivante est une capture réseau pendant une session d'usage normal : on
lance Arc, on bascule d'espace, on ouvre Little Arc, on laisse un onglet
s'archiver. Une telle capture ne demande aucune analyse du code d'Arc, et c'est
elle qui mettra des volumes et des fréquences sur ce tableau.
