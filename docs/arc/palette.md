# Palette de commandes

Sources : chaînes et noms de types du binaire principal (analyse statique, sans
décompilation), structure (clés seulement) du fichier local de classement.

## Ce que fait Arc

- Une seule palette sert à tout : recherche web, aller à un onglet ouvert,
  navigation dans l'historique, lancement d'extension, actions de l'application,
  création de dossier, et en option des requêtes envoyées à ChatGPT.
- **Le classement est un score calculé à partir de caractéristiques.** Les
  caractéristiques identifiées sont les suivantes :
  - l'ancienneté de la dernière visite et la fréquence de visite depuis
    toujours ;
  - le nombre de fois où l'adresse a été tapée ;
  - l'engagement sur le site (la mesure de Chromium) ;
  - la correspondance exacte d'URL ou de domaine de base, et le titre qui
    commence par la saisie ;
  - des scores de correspondance floue sur le titre et l'URL ;
  - **un embedding du titre**, donc une similarité sémantique, au moins pour
    certains résultats.

  Les scores sont normalisés par type de résultat. Une fenêtre de débogage affiche
  le classement.
- **Le classement est appris, pas réglé à la main.** Le binaire contient des
  opérations pour entraîner le classement sur des exemples, l'évaluer et charger
  un classement entraîné. Il signale aussi les caractéristiques qu'il ne connaît
  pas. Le bundle ne contient aucun fichier de modèle (ni Core ML ni autre) : les
  paramètres sont soit compilés dans le code, soit téléchargés. L'entraînement
  semble réservé aux outils internes ; rien n'indique qu'il ait lieu chez
  l'utilisateur.
- **Une mémoire « requête → résultat choisi »**, rangée par profil, retient pour
  chaque saisie le résultat que l'utilisateur a retenu et quand. Elle renforce le
  classement à la saisie suivante.
- La saisie au clavier pendant l'ouverture de la palette passe par une machine à
  états explicite, pour ne pas perdre les premières lettres tapées.
- Une page dédiée à la vie privée des suggestions de recherche existe : les
  suggestions passent par le moteur de recherche.

## Écart avec Nash

- La mémoire requête → choix est simple et efficace. On peut la reprendre **par
  espace** plutôt que par profil : la même saisie (« mail ») ne doit pas
  désigner la même chose dans deux espaces.
- L'embedding des titres demande un modèle. Nash peut le faire localement (D7)
  ou s'en passer : la récence, la fréquence et les correspondances suffisent pour
  une v1.
- La palette de Firefox (barre d'adresse et frecency) fournit déjà une grande
  partie de ce classement. Il faut étudier ce qu'on peut réutiliser avant d'écrire
  quoi que ce soit.

## Inconnues

- Les poids des caractéristiques et la formule de combinaison, ainsi que leur
  origine : compilés dans le code ou téléchargés. Il faut la décompilation. Ghidra
  est configuré depuis le 18 octobre ; l'analyse complète du binaire prend environ
  1 h 10.
- Où l'embedding est calculé : sur l'appareil ou sur un serveur.
