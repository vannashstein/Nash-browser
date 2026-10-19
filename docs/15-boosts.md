# Boosts : un style par site, et par espace

Écrit depuis `docs/arc/boosts.md` et `docs/10-plan-reproduction.md`, sans lecture de
sortie brute de REA. **Non exécuté** : syntaxe vérifiée seulement (le script de
contenu a été vérifié séparément).

## Ce que ça fait

- Clic droit sur un onglet http(s) : **"Style de ce site…"**. Une boîte s'ouvre avec
  un champ de CSS, la case "Tous les espaces" et la case "Actif".
- Le style s'applique à toutes les pages de **cette origine** (schéma, hôte, port).
  Par défaut il est propre à **l'espace de l'onglet** : le même site peut avoir un
  style différent selon le compte (production en rouge, test en vert). Avec "Tous les
  espaces", il vaut partout.
- À égalité, le style propre à l'espace passe en dernier et l'emporte.
- Stockage : `nash-boosts.json` dans le profil. Toutes les fenêtres sont prévenues
  d'un changement.
- Pas de boosts en fenêtre privée (Nash n'y est pas installé).

## Frontière de sécurité (reprise de l'analyse d'Arc, réécrite par Nash)

- **CSS seulement. Aucun script n'est injecté**, ni maintenant ni dans un futur
  partage. Un boost ne peut donc rien exécuter dans la page.
- `@import` est refusé : il chargerait une ressource que l'utilisateur n'a pas écrite.
- 20 000 caractères au plus par style.
- Le CSS est chargé comme une feuille de style de la fenêtre de contenu
  (`windowUtils.loadSheetUsingURIString`, niveau "auteur"), pas comme un élément
  `<style>` de la page : il n'est pas bloqué par la politique CSP du site. Cela
  veut dire qu'un style peut modifier une page que la CSP protège. C'est le but d'un
  boost, mais à savoir.

## Ce qui n'est pas fait

- **Pas de partage** : ni fichier, ni lien. Quand il viendra : CSS seul, l'auteur
  n'est pas vérifié (comme chez Arc, qui prévient l'utilisateur).
- **Pas de réglages graphiques** (masquer un élément, police, couleurs) : un champ de
  CSS libre seulement.
- **Pas d'indicateur** dans la sidebar qu'un site porte un style.
- Le style se recharge à chaque navigation ; une page qui change d'adresse sans
  navigation (application monopage) garde le style de son origine.
- Les sous-domaines sont des origines distinctes : `www.exemple.fr` et `exemple.fr`
  demandent deux styles.

## Points techniques à vérifier

- `loadSheetUsingURIString` : la feuille s'applique-t-elle au document courant et
  est-elle retirée à la navigation, ou faut-il la recharger à chaque document ? Le
  script de contenu la recharge sur `DOMDocElementInserted` et `DOMContentLoaded`.
- `DOMDocElementInserted` est-il délivré aux scripts de contenu en 153 ? Sinon, le
  style n'apparaît qu'à `DOMContentLoaded` (un bref flash de la page sans style).
- Les scripts de contenu (`loadFrameScript`) sont dépréciés mais présents. À
  revérifier à chaque rebase ESR (D8).

## À tester

1. Ouvrir un site, clic droit, "Style de ce site…", saisir `body { background: #fdd !important; }`,
   enregistrer : le fond change tout de suite, sans rechargement.
2. Recharger, changer de page du même site : le style reste.
3. Même site dans un autre espace : **pas** de style (le style est propre à l'espace).
4. Rouvrir l'éditeur, cocher "Tous les espaces" : le style apparaît dans l'autre espace.
5. Décocher "Actif" : le style disparaît. "Supprimer" : l'entrée disparaît.
6. Un site à CSP stricte (par exemple github.com) : le style s'applique.
7. `@import url(...)` : message d'erreur, rien n'est enregistré. 20 001 caractères :
   message d'erreur.
8. Deux fenêtres : un style créé dans l'une apparaît dans l'autre.
9. Redémarrer : les styles reviennent. Fichier corrompu : erreur journalisée, aucun
   style, pas de plantage.
10. Page `about:` ou `file:` : l'entrée du menu est cachée.
