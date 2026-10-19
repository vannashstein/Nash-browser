# Boosts : un style par site, et par espace

Écrit depuis `docs/arc/boosts.md` et `docs/10-plan-reproduction.md`, sans lecture de
sortie brute de REA. Écrit sans exécution ; essais du 19 octobre 2026 en fin de
document : trois défauts ouverts (B1 à B3), réponses aux deux questions techniques.

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

## Résultats des essais (19 octobre 2026)

Conditions : compilation artifact de 8f0d119, lancée par `tools/run-dev.sh artifact`
sur `.devprofile`, arrêt propre par `tools/stop-dev.sh`. Marionette est activé par
variables d'environnement. Un `user.js` temporaire pose
`remote.prefs.recommended = false` et `browser.shell.checkDefaultBrowser = false`.
Le serveur local sur le port 8765 journalise chaque requête ; `/csp` envoie
`Content-Security-Policy: default-src 'none'; style-src 'none'; script-src 'none'`.
L'éditeur est ouvert par le vrai menu de l'onglet (`nash-boost-item`), le champ est
rempli et le bouton cliqué ; le fond est lu par `getComputedStyle` dans la page.
Après les essais, les cookies et l'historique des hôtes de test ont été effacés, ainsi
que les cookies github.com créés et les visites faites pendant les essais.
`nash-boosts.json` a été retiré (il n'existait pas). `prefs.js`, `containers.json`,
`nash-archive.json` et la session ont été remis à l'identique.

| Essai | Résultat |
|---|---|
| 1. Création par le clic droit | RÉUSSI : fond `rgb(255, 221, 221)` sans rechargement (une seule requête de la page au serveur) |
| 2. Rechargement, autre page, retour | RÉUSSI : le style reste sur `/p/b` et au retour sur `/p/a` |
| 3. Même site dans un autre espace | RÉUSSI : pas de style dans tyu |
| 4. « Tous les espaces » | RÉUSSI à l'écran : le style apparaît dans tyu. Mais voir B2 |
| 5. « Actif » décoché, « Supprimer » | **ÉCHOUE** (B2) |
| 6. CSP stricte : `/csp` locale et github.com | RÉUSSI : le style s'applique sur les deux. La CSP de github.com (`default-src 'none'`, …) a été vérifiée dans la réponse |
| 7. `@import`, 20 001 caractères | `@import` et `@IMPORT` sont refusés et rien n'est enregistré ; 20 001 refusés, 20 000 acceptés. **Mais le filtre se contourne** (B1) |
| 8. Deux fenêtres | RÉUSSI : un style créé dans la seconde fenêtre s'applique dans la première |
| 9. Redémarrage, fichier corrompu | RÉUSSI : les styles reviennent. Un fichier corrompu : erreur journalisée (`[Nash] boosts illisibles`), aucun style, Nash monté. Mais voir B3 |
| 10. Page `about:` | RÉUSSI : entrée cachée sur `about:robots` |

### Défauts ouverts

- **B1. Le refus d'`@import` se contourne par un échappement CSS.** MESURÉ :
  `@\69mport url(http://127.0.0.1:8765/p/importe.css); body { … }` passe
  `/@import/i`, est enregistré, et la feuille importée **est chargée** (requête
  `GET /p/importe.css` au serveur, à chaque navigation), alors que la page impose
  `style-src 'none'`. La frontière de sécurité annoncée n'est donc pas tenue. Une
  expression régulière ne suffit pas : les échappements CSS (`\69`, `\0069 `, `\i`)
  sont valables dans un mot-clé. Piste : analyser le CSS (par exemple
  `new CSSStyleSheet().replaceSync(css)` dans une fenêtre sans réseau, qui ignore
  `@import`) et refuser si une règle `CSSImportRule` apparaît, ou retirer toute règle
  `@import` de la feuille analysée avant de l'enregistrer.
- **B2. Changer la portée duplique l'entrée.** MESURÉ : après « Tous les espaces »
  coché depuis Général, `nash-boosts.json` contient deux entrées de **même `id`** :
  celle de Général, restée, et une copie sans espace. Conséquences :
  - rouvert depuis Général, l'éditeur montre l'entrée de Général, « Tous les espaces »
    décoché ;
  - décocher « Actif » depuis Général ne retire pas le style : l'entrée de Général
    devient inactive, la copie « tous espaces » s'applique toujours, dans les deux
    espaces. Il faut décocher aussi depuis tyu ;
  - « Supprimer » depuis Général efface les deux entrées (filtre par `id`), donc aussi
    le style de tous les espaces.
  Piste : changer la portée doit déplacer l'entrée (retirer celle d'origine), et
  chaque entrée doit avoir son propre `id`.
- **B3. Un fichier corrompu est écrasé sans copie.** MESURÉ : après un fichier
  corrompu, le premier style enregistré remplace `nash-boosts.json` ; les styles
  précédents sont perdus sans trace. L'archive, elle, garde un `.corrompu`
  (docs/12). Piste : même traitement.

### Réponses aux deux questions techniques

**La feuille survit-elle à une navigation ?** Non. MESURÉ avec un script de contenu
sonde qui appelle lui-même `loadSheetUsingURIString` : la feuille est attachée au
document. Après une navigation vers une autre page de la même origine, elle n'est
plus appliquée ; après un rechargement non plus. Exception : au retour arrière, la
page sort du cache de navigation (bfcache) avec sa feuille encore posée. Il faut donc
bien la recharger à chaque document, comme le fait le script.

**`DOMDocElementInserted` arrive-t-il ?** Oui. MESURÉ : un script de contenu chargé
comme celui de Nash (`window.messageManager.loadFrameScript(…, true)`) le reçoit à
chaque chargement, 8 à 32 ms après le début de la page, en état `loading` et sans
`body`, avant `DOMContentLoaded`.

Mais il n'aide presque jamais, pour une raison qui n'était pas prévue :
`fission.bfcacheInParent` est vrai. **Chaque navigation, même vers la même origine,
crée une nouvelle instance du script de contenu** (MESURÉ : identifiant d'instance
différent à chaque navigation, même PID ; seul le rechargement garde l'instance).
La nouvelle instance n'a pas encore reçu `Nash:Boost`, donc `current` vaut `null`
quand `DOMDocElementInserted` arrive, et rien n'est appliqué. Le style vient de
l'aller-retour `Nash:BoostReady` → `Nash:Boost`. Sur une origine avec un style simple :

| Chargement | Style à `DOMContentLoaded` | Style à la première image |
|---|---|---|
| Nouvel onglet (2 essais) | non | oui une fois, **non** une fois |
| Navigation même origine (4 essais) | non | oui |
| Rechargement | **oui** | oui |
| Retour sur l'origine depuis une autre | non | oui |

Il y a donc bien un flash possible, surtout à l'ouverture d'un onglet. Piste : rendre
les styles lisibles sans aller-retour dans le processus de contenu, par exemple
`Services.ppmm.sharedData` lu de façon synchrone au `DOMDocElementInserted`, de
préférence par un `JSWindowActor` (événement déclaré dans `child.events`), qui
remplacerait aussi le script de contenu déprécié.

### Autres constats

- Une seule fois au démarrage, Gecko refuse le script de contenu des boosts :
  `InternalError: unsafe filename: data:application/javascript…`
  (`browser-custom-element.mjs`, ligne 1127). C'est sans doute un `<browser>` du
  processus parent, où un script `data:` à privilèges est interdit. Les onglets web
  ne sont pas touchés. Un `JSWindowActor` en `chrome://` ferait disparaître ce message.
- Si l'éditeur est déjà ouvert, « Style de ce site… » ne fait rien, sans le dire.
