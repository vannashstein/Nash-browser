/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Script de contenu des boosts (docs/15-boosts.md). Il tourne dans le processus de
 * chaque page et choisit LUI-MÊME le style : les boosts et la table des containers
 * sont lus dans les données partagées que Nash publie, sans aller-retour avec la
 * fenêtre. Un aller-retour arrivait après DOMContentLoaded (docs/15, essais). */
(function () {
  const KEY = "nash:boosts";
  let applied = null;

  // Les échappements CSS (\69 mport) et les commentaires ne doivent pas permettre de
  // contourner le refus d'@import : on décode avant de tester (docs/15, B1).
  const decode = css => css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (match, hex) => {
      const point = parseInt(hex, 16);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "�";
    })
    .replace(/\\([^\n])/g, "$1");
  const unsafe = css => /@\s*import/i.test(decode(css));

  const styleFor = () => {
    const data = Services.cpmm.sharedData.get(KEY);
    if (!data || !Array.isArray(data.boosts)) { return ""; }
    let origin;
    let container;
    try {
      origin = content.location.origin;
      container = data.containers?.[content.document.nodePrincipal.originAttributes.userContextId] ?? null;
    } catch { return ""; }
    if (!/^https?:\/\//.test(origin)) { return ""; }
    const mine = data.boosts.filter(b => b && b.actif !== false && b.origin === origin &&
      typeof b.css === "string" && !unsafe(b.css));
    // Le style d'un compte précis passe en dernier et l'emporte à égalité.
    return [...mine.filter(b => !b.compte), ...mine.filter(b => b.compte && b.compte === container)]
      .map(b => b.css).join("\n");
  };

  const clear = () => {
    if (!applied) { return; }
    try { content.windowUtils.removeSheetUsingURIString(applied, Ci.nsIDOMWindowUtils.AUTHOR_SHEET); } catch {}
    applied = null;
  };

  const apply = () => {
    clear();
    const css = styleFor();
    if (!css) { return; }
    const uri = "data:text/css;charset=utf-8," + encodeURIComponent(css);
    try {
      content.windowUtils.loadSheetUsingURIString(uri, Ci.nsIDOMWindowUtils.AUTHOR_SHEET);
      applied = uri;
    } catch {}
  };

  addMessageListener("Nash:BoostRefresh", apply);
  addEventListener("DOMDocElementInserted", event => {
    // Un nouveau document n'hérite pas de la feuille du précédent.
    if (event.target === content.document) { applied = null; apply(); }
  }, true);
  addEventListener("DOMContentLoaded", event => {
    if (event.target === content.document && !applied) { apply(); }
  }, true);
})();
