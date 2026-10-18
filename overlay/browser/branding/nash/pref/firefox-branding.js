/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Préférences par défaut de Nash.
//
// Ce fichier appartient entièrement à la marque Nash : il n'existe pas en
// amont, donc il ne produira jamais de conflit lors d'un rebase sur un
// nouvel ESR. C'est la raison pour laquelle les réglages de vie privée
// vivent ici plutôt que dans browser/app/profile/firefox.js.

// ---------------------------------------------------------------------------
// Marque
// ---------------------------------------------------------------------------
pref("startup.homepage_override_url", "");
pref("startup.homepage_welcome_url", "");
pref("startup.homepage_welcome_url.additional", "");
pref("app.update.url.manual", "");
pref("app.update.url.details", "");

// ---------------------------------------------------------------------------
// Anti-pistage — niveau strict dès l'installation
// ---------------------------------------------------------------------------
// Interrupteur maître : active la protection renforcée en mode strict, ce qui
// entraîne le cloisonnement total des cookies (dFPI) et le blocage des
// traqueurs, cryptomineurs et détecteurs d'empreinte.
pref("browser.contentblocking.category", "strict");
pref("privacy.trackingprotection.enabled", true);
pref("privacy.trackingprotection.socialtracking.enabled", true);
pref("privacy.trackingprotection.cryptomining.enabled", true);
pref("privacy.trackingprotection.fingerprinting.enabled", true);

// Retire les paramètres de pistage connus des URL (utm_*, fbclid, gclid…).
pref("privacy.query_stripping.enabled", true);
pref("privacy.query_stripping.enabled.pbmode", true);

// Signale aux sites le refus de la vente et du partage des données.
pref("privacy.globalprivacycontrol.enabled", true);

// ---------------------------------------------------------------------------
// Containers — le socle des espaces de Nash
// ---------------------------------------------------------------------------
// Sans ces deux préférences, les contextual identities ne sont pas exposées.
// Toute la sidebar à tuiles en dépend.
pref("privacy.userContext.enabled", true);
pref("privacy.userContext.ui.enabled", true);

// ---------------------------------------------------------------------------
// Sidebar verticale — la base de la grille de tuiles
// ---------------------------------------------------------------------------
// Firefox 153 rend déjà les onglets épinglés en grille dans la sidebar
// verticale : #pinned-tabs-container[orient="vertical"] est une CSS grid en
// repeat(auto-fit, ...), labels masqués, icônes centrées. C'est exactement la
// structure des Essentials d'Arc. Nash part de là plutôt que de la réécrire.
pref("sidebar.revamp", true);
pref("sidebar.verticalTabs", true);
pref("sidebar.visibility", "always-show");
pref("sidebar.verticalTabs.dragToPinPromo.dismissed", true);

// Mode masqué avec révélation au bord gauche, testé le 18 octobre 2026
// (docs/11-sidebar-masquee.md). N'agit que si l'utilisateur choisit le mode
// « hide-sidebar » de Firefox : la marque impose « always-show ».
pref("nash.sidebar.peek", true);

// ---------------------------------------------------------------------------
// Aucune télémétrie
// ---------------------------------------------------------------------------
pref("datareporting.healthreport.uploadEnabled", false);
pref("datareporting.policy.dataSubmissionEnabled", false);
pref("toolkit.telemetry.enabled", false);
pref("toolkit.telemetry.unified", false);
pref("toolkit.telemetry.archive.enabled", false);
pref("toolkit.telemetry.newProfilePing.enabled", false);
pref("toolkit.telemetry.updatePing.enabled", false);
pref("toolkit.telemetry.shutdownPingSender.enabled", false);
pref("toolkit.coverage.enabled", false);
pref("toolkit.coverage.opt-out", true);
pref("app.shield.optoutstudies.enabled", false);
pref("browser.discovery.enabled", false);
pref("browser.tabs.crashReporting.sendReport", false);
pref("browser.newtabpage.activity-stream.feeds.telemetry", false);
pref("browser.newtabpage.activity-stream.telemetry", false);

// ---------------------------------------------------------------------------
// Rien de sponsorisé, rien de commercial
// ---------------------------------------------------------------------------
pref("browser.newtabpage.activity-stream.showSponsored", false);
pref("browser.newtabpage.activity-stream.showSponsoredTopSites", false);
pref("browser.newtabpage.activity-stream.feeds.section.topstories", false);
pref("browser.urlbar.suggest.quicksuggest.sponsored", false);
pref("browser.urlbar.suggest.quicksuggest.nonsponsored", false);
pref("extensions.pocket.enabled", false);

// ---------------------------------------------------------------------------
// Volontairement laissé actif
// ---------------------------------------------------------------------------
// Safe Browsing reste activé. Sa vérification est locale : la liste est
// téléchargée, les URL visitées ne sont pas envoyées. Le désactiver
// n'améliorerait pas la vie privée et retirerait une protection réelle.
//
// DNS-over-HTTPS n'est pas forcé : cela déplacerait la visibilité du FAI vers
// un résolveur unique. À laisser au choix de l'utilisateur.

// ---------------------------------------------------------------------------
// Divers
// ---------------------------------------------------------------------------
pref("app.update.interval", 86400);
pref("app.update.promptWaitTime", 86400);
pref("app.update.checkInstallTime.days", 2);
pref("app.update.badgeWaitTime", 0);
pref("devtools.selfxss.count", 5);
