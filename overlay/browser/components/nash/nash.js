/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** Nash owns the sidebar and its model; Gecko owns tabs, containers and sessions. */
var Nash = {
  version: "0.4",
  PREF_MODEL: "nash.model",
  TINTS: ["#527b89", "#8b6d9c", "#668777", "#ae805d", "#657fa6", "#a46678"],
  model: null,
  currentSpaceId: null,
  _dom: null,
  _listeners: [],
  _lastTabs: new Map(),

  get SS() {
    return (this._ss ??= ChromeUtils.importESModule(
      "resource:///modules/sessionstore/SessionStore.sys.mjs"
    ).SessionStore);
  },

  get CIS() {
    return (this._cis ??= ChromeUtils.importESModule(
      "resource://gre/modules/ContextualIdentityService.sys.mjs"
    ).ContextualIdentityService);
  },

  async init() {
    // Containers are not supported in private windows. Keep native private UI.
    if (PrivateBrowsingUtils.isWindowPrivate(window)) {
      return;
    }
    try {
      this.claimStartupLoad();
      await delayedStartupPromise;
      await this.SS.promiseAllWindowsRestored;
      if (window.closed) {
        return;
      }
      this.loadModel();
      this.ensureContainers();
      this.adoptKept();
      const restored = this.SS.getCustomWindowValue(window, "nash-space");
      this.currentSpaceId = this.model.spaces.find(s => s.id === restored)?.id
        ?? this.model.spaces[0].id;
      this.buildDOM();
      this.installTabRouting();
      // Une fenêtre ouverte avec une adresse (lien externe en « nouvelle fenêtre »,
      // openDialog) n'a pas encore commencé à la charger quand on arrive ici : la
      // remplacer par un onglet vierge perdait l'adresse (docs/13, B2).
      let initialUrl = null;
      try {
        const asked = await gBrowserInit.uriToLoadPromise;
        initialUrl = typeof asked === "string" && this.validURL(asked) ? asked : null;
      } catch {}
      for (const tab of [...gBrowser.tabs]) {
        // A fresh Firefox startup tab predates our adapter. Replace only an empty
        // uncontained tab; never reload a user's page or move its cookies.
        const uri = tab.linkedBrowser?.currentURI?.spec;
        if (!tab.pinned && !tab.userContextId && ["about:blank", "about:newtab"].includes(uri) &&
            !tab.linkedBrowser.canGoBack && !tab.linkedBrowser.canGoForward) {
          const reload = initialUrl && gBrowser.selectedTab === tab ? initialUrl : uri;
          const replacement = gBrowser.addTrustedTab(reload, { userContextId: this.containerFor({}).id });
          this.assignTab(replacement);
          if (gBrowser.selectedTab === tab) { gBrowser.selectedTab = replacement; }
          gBrowser.removeTab(tab, { skipPermitUnload: true, animate: false });
        } else {
          this.assignTab(tab);
        }
      }
      // SplitViewCreated/Removed : l'onglet de l'autre volet doit apparaître ou
      // disparaître dès la création ou la séparation de la vue (D17).
      for (const name of ["TabOpen", "TabClose", "TabSelect", "TabAttrModified",
                          "TabPinned", "TabUnpinned", "SSTabRestoring", "SSTabRestored",
                          "SplitViewCreated", "SplitViewRemoved"]) {
        this.listen(gBrowser.tabContainer, name, event => this.onTabEvent(event));
      }
      this.listen(window, "keydown", event => this.onKey(event), true);
      this.listen(window, "unload", () => this.destroy(), { once: true });
      this._observer = { observe: () => {
        if (this._saving) {
          return;
        }
        const current = this.currentSpaceId;
        this.loadModel();
        this.currentSpaceId = this.model.spaces.find(s => s.id === current)?.id
          ?? this.model.spaces[0].id;
        this.ensureContainers();
        this.reconcileKept();
        this.syncTabs();
        this.render();
      }};
      Services.prefs.addObserver(this.PREF_MODEL, this._observer);
      this.applySidebarDefault();
      this.installTop();
      this.installToolbar();
      this.installPeek();
      this.installNarrow();
      this.installSpaceSwipe();
      this.installArchive();
      this.installTemporary();
      this.installBoosts();
      this.installPalette();
      this.syncTabs();
      this.render();
      // Commit styling only when the complete UI is mounted successfully (R3).
      document.documentElement.setAttribute("nash", this.version);
      console.log(`[Nash] ${this.version} — ${this.model.spaces.length} espaces, ` +
        `${this.model.global.length} tuiles globales`);
    } catch (error) {
      console.error("[Nash] initialisation impossible :", error);
      this.destroy();
    }
  },

  // A window opened with a URL (openDialog, BrowserWindowTracker.openWindow, an
  // external link in a new window) gets it from delayed startup, which loads it
  // into the first tab in container 0 unless the opener named one. Runs on load,
  // before that: swap the still-empty tab for one in the space's container, so the
  // request never carries uncontained cookies. Restored, adopted and
  // content-opened windows keep Gecko's tab.
  claimStartupLoad() {
    const uri = gBrowserInit.uriToLoadPromise;
    const tab = gBrowser.selectedTab;
    const openWindowInfo = window.docShell.treeOwner
      .QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIAppWindow).initialOpenWindowInfo;
    if (!uri || uri.then || gBrowser.tabs.length !== 1 || tab.pinned || tab.userContextId ||
        gBrowserInit.getTabToAdopt() || openWindowInfo || window.arguments?.[11]) {
      return;
    }
    this.loadModel();
    this.ensureContainers();
    const { id } = this.containerFor({});
    // With 3+ arguments Gecko loads through openLinkIn, which opens an extra tab
    // in the requested container (0 by default) when it differs from the
    // selected tab's. Fill in the container slot, as an opener could have.
    if (window.arguments.length >= 3) {
      window.arguments[5] = id;
    }
    const replacement = gBrowser.addTrustedTab("about:blank", { userContextId: id });
    gBrowser.selectedTab = replacement;
    gBrowser.removeTab(tab, { skipPermitUnload: true, animate: false });
  },

  listen(target, name, callback, options) {
    target.addEventListener(name, callback, options);
    this._listeners.push(() => target.removeEventListener(name, callback, options));
  },

  destroy() {
    this._destroyed = true;
    this._listeners.splice(0).forEach(remove => remove());
    if (this._observer) {
      Services.prefs.removeObserver(this.PREF_MODEL, this._observer);
      this._observer = null;
    }
    if (gBrowser.addTab === this._addTabWrapper) {
      gBrowser.addTab = this._originalAddTab;
    }
    for (const tab of gBrowser.tabs) {
      if (this.SS.getCustomTabValue(tab, "hiddenBy") === "nash") {
        gBrowser.showTab(tab);
      }
    }
    this.removePeek();
    this.removeToolbar();
    this.removeTop();
    this.removeNarrow();
    this.removeArchive();
    this.removeTemporary();
    this.removeBoosts();
    this.removePalette();
    this._dom?.strip.remove();
    this._dom?.switcher.remove();
    this._dom?.popup.remove();
    document.documentElement.removeAttribute("nash");
  },

  // D10: the grid ships empty. Spaces are containers, not content choices, so a
  // single one exists to hold the first tile; everything else the user places.
  defaultModel() {
    return {
      global: [],
      spaces: [
        { id: this.newId(), nom: "Général", emoji: "◉", container: "perso", tiles: [] },
      ],
    };
  },

  normalizeModel(model) {
    if (!model || !Array.isArray(model.global) || !Array.isArray(model.spaces) ||
        !model.spaces.length) {
      throw new Error("Structure du modèle invalide");
    }
    const spaces = new Set();
    const containers = new Set();
    const ids = new Set();
    const kept = new Set();
    model.spaces.forEach((space, index) => {
      if (!space || typeof space.id !== "string" || !space.id || spaces.has(space.id) ||
          typeof space.nom !== "string" || !space.nom.trim() ||
          typeof space.container !== "string" || !space.container ||
          containers.has(space.container) || !Array.isArray(space.tiles)) {
        throw new Error("Espace invalide ou container partagé entre espaces");
      }
      spaces.add(space.id);
      containers.add(space.container);
      space.teinte = /^#[0-9a-f]{6}$/i.test(space.teinte)
        ? space.teinte : this.TINTS[index % this.TINTS.length];
      space.emoji = typeof space.emoji === "string" ? space.emoji : "◉";
      space.archiveH = this.ARCHIVE_DELAYS.some(([hours]) => hours === space.archiveH)
        ? space.archiveH : this.ARCHIVE_DEFAULT_H;
      space.replie = space.replie === true;
      space.folders = (Array.isArray(space.folders) ? space.folders : [])
        .filter(folder => folder && typeof folder.id === "string")
        .map(folder => ({
          id: folder.id,
          nom: (typeof folder.nom === "string" && folder.nom.trim().slice(0, 60)) || "Dossier",
          ouvert: folder.ouvert !== false,
        }));
      // Partie 3 : les sites gardés vivent dans le modèle, pas seulement dans la
      // session. Un dossier disparu remet sa page hors dossier, jamais à la poubelle.
      const folderIds = new Set(space.folders.map(folder => folder.id));
      space.gardes = (Array.isArray(space.gardes) ? space.gardes : [])
        .filter(entry => entry && typeof entry.id === "string" && entry.id &&
          !kept.has(entry.id) && this.validURL(entry.url) && kept.add(entry.id))
        .map(entry => ({
          id: entry.id,
          url: entry.url,
          nom: (typeof entry.nom === "string" && entry.nom.slice(0, 200)) || entry.url,
          dossier: folderIds.has(entry.dossier) ? entry.dossier : null,
        }));
    });
    for (const tile of [ ...model.global, ...model.spaces.flatMap(s => s.tiles) ]) {
      if (!tile || !this.validURL(tile.url) || typeof tile.nom !== "string" ||
          !(tile.identite == null || tile.identite === "heritee" ||
            (typeof tile.identite.fixee === "string" && tile.identite.fixee))) {
        throw new Error("Tuile invalide");
      }
      // Preserve v0.2 origin IDs so existing pinned instances can migrate.
      let id = tile.id || this.origin(tile.url);
      if (typeof id !== "string" || ids.has(id)) {
        id = this.newId();
      }
      tile.id = id;
      ids.add(id);
      if (tile.iconeManuelle && !this.safeIcon(tile.iconeManuelle)) {
        delete tile.iconeManuelle;
      }
    }
    model.version = 3;
    return model;
  },

  loadModel() {
    const raw = Services.prefs.getStringPref(this.PREF_MODEL, "");
    try {
      this.model = this.normalizeModel(raw ? JSON.parse(raw) : this.defaultModel());
    } catch (error) {
      // Keep the original for recovery instead of silently destroying user data.
      if (raw) {
        Services.prefs.setStringPref("nash.model.recovery", raw);
      }
      console.error("[Nash] modèle sauvegardé dans nash.model.recovery :", error);
      this.model = this.normalizeModel(this.defaultModel());
    }
  },

  saveModel() {
    this._saving = true;
    try {
      Services.prefs.setStringPref(this.PREF_MODEL, JSON.stringify(this.model));
    } finally {
      this._saving = false;
    }
  },

  newId() { return Services.uuid.generateUUID().toString().slice(1, -1); },
  get space() { return this.model.spaces.find(s => s.id === this.currentSpaceId) ?? this.model.spaces[0]; },
  get allTiles() { return [...this.model.global, ...this.model.spaces.flatMap(s => s.tiles)]; },
  get visibleTiles() { return [...this.model.global, ...this.space.tiles]; },
  validURL(url) {
    try { return ["https:", "http:"].includes(new URL(url).protocol); }
    catch { return false; }
  },
  origin(url) { try { return new URL(url).origin; } catch { return ""; } },
  safeIcon(src) {
    // Rendering a grid must never make background requests to arbitrary sites.
    return typeof src === "string" && src.length < 750000 &&
      /^data:image\/(?:png|jpeg|gif|webp|x-icon|vnd\.microsoft\.icon);base64,[a-z0-9+/=\s]+$/i.test(src);
  },
  containerByName(name) { return this.CIS.getPublicIdentities().find(id => id.name === name); },
  ensureContainers() {
    const wanted = new Set(this.model.spaces.map(s => s.container));
    this.allTiles.forEach(t => { if (t.identite?.fixee) { wanted.add(t.identite.fixee); } });
    const colors = ["blue", "purple", "green", "orange", "turquoise", "pink"];
    let index = 0;
    for (const name of wanted) {
      if (!this.containerByName(name)) {
        this.CIS.create(name, "circle", colors[index % colors.length]);
      }
      index++;
    }
    // La table container -> nom lue par les pages doit suivre les containers créés.
    if (this._boostObserver) { this.publishBoosts(); }
  },
  containerFor(tile) {
    const name = tile.identite?.fixee ?? this.space.container;
    const container = this.containerByName(name);
    // Never fall back to the uncontained cookie jar when isolation fails.
    if (!container) { throw new Error(`Container « ${name} » absent`); }
    return { name, id: container.userContextId };
  },

  tabValue(tab, key) {
    return this.SS.getCustomTabValue(tab, key) || tab.getAttribute(key) || "";
  },
  setTabValue(tab, key, value) {
    tab.setAttribute(key, value);
    this.SS.setCustomTabValue(tab, key, value);
  },
  clearTabValue(tab, key) {
    tab.removeAttribute(key);
    this.SS.deleteCustomTabValue(tab, key);
  },
  spaceForTab(tab) {
    // A local fixed tile belongs to its visible space, even when its account
    // comes from another container. Do not send native selections to that account's space.
    const key = this.tabValue(tab, "nash-tile");
    const localOwner = this.model.spaces.find(s => s.tiles.some(t => t.id === key && t.identite?.fixee));
    if (localOwner) { return localOwner.id; }
    const keptOwner = this.keptSpace(this.tabValue(tab, "nash-kept"));
    if (keptOwner) { return keptOwner.id; }
    const stored = this.tabValue(tab, "nash-space");
    if (this.model.spaces.some(s => s.id === stored)) { return stored; }
    return this.model.spaces.find(s =>
      this.containerByName(s.container)?.userContextId === tab.userContextId)?.id ?? this.space.id;
  },
  assignTab(tab) {
    this.setTabValue(tab, "nash-space", this.spaceForTab(tab));
    const key = this.tabValue(tab, "nash-tile");
    if (key) { this.setTabValue(tab, "nash-tile", key); }
  },

  installTabRouting() {
    // TabOpen is too late to choose originAttributes: route BEFORE Gecko loads.
    // Preserve explicit containers, openers, restored and adopted browser state.
    // This is the only method adapter; no upstream patch is needed.
    this._originalAddTab = gBrowser.addTab;
    const nash = this;
    this._addTabWrapper = function(url, options = {}) {
      const opener = options.openerBrowser ? this.getTabForBrowser(options.openerBrowser) : null;
      const openerTile = opener && nash.allTiles.find(t => t.id === nash.tabValue(opener, "nash-tile"));
      const openerSpace = opener && (openerTile?.identite?.fixee && nash.model.global.includes(openerTile)
        ? nash.currentSpaceId : nash.spaceForTab(opener));
      if (options.userContextId == null && !options.openerBrowser &&
          !options.openWindowInfo && !options.createLazyBrowser && !options.skipLoad) {
        options = { ...options, userContextId: nash.containerFor({}).id };
      }
      const tab = nash._originalAddTab.call(this, url, options);
      if (tab && openerSpace && !options.createLazyBrowser && !options.skipLoad) {
        nash.setTabValue(tab, "nash-space", openerSpace);
      }
      return tab;
    };
    gBrowser.addTab = this._addTabWrapper;
  },

  onTabEvent(event) {
    const tab = event.target;
    if (["TabOpen", "SSTabRestoring", "SSTabRestored"].includes(event.type)) {
      this.assignTab(tab);
    }
    if (["TabAttrModified", "SSTabRestored"].includes(event.type)) {
      this.recordKept(tab);
    }
    if (event.type === "TabSelect" && !this._switching) {
      const tile = this.allTiles.find(t => t.id === this.tabValue(tab, "nash-tile"));
      const shared = tile?.identite?.fixee && this.model.global.includes(tile);
      const id = this.spaceForTab(tab);
      // Cliquer dans le volet d'un autre espace ne fait pas changer d'espace.
      if (!shared && id !== this.currentSpaceId && !this.splitShared(tab)) {
        this.currentSpaceId = id;
        this.SS.setCustomWindowValue(window, "nash-space", id);
      }
      // Un volet d'un autre espace n'est pas « le dernier onglet » de cet espace :
      // y revenir après séparation de la vue montrerait une page étrangère.
      if (this.spaceForTab(tab) === this.currentSpaceId || shared) {
        this._lastTabs.set(this.currentSpaceId, tab);
      }
    }
    // Vue séparée alors que l'onglet affiché est celui d'un autre espace : on suit la
    // page que l'utilisateur regarde, plutôt que d'ouvrir un onglet vide (docs/17).
    if (event.type === "SplitViewRemoved" && !this._switching) {
      const selected = gBrowser.selectedTab;
      const id = selected && !selected.splitview ? this.spaceForTab(selected) : this.currentSpaceId;
      if (id !== this.currentSpaceId && this.model.spaces.some(s => s.id === id)) {
        this.currentSpaceId = id;
        this.SS.setCustomWindowValue(window, "nash-space", id);
      }
      this.syncTabs();
    }
    this.renderSoon();
  },

  // Partie 3 — les pages gardees. Distinctes des tuiles : une tuile designe un
  // site, une page gardee designe ce contenu-la. La liste vit dans le modele
  // (space.gardes) : la session de Gecko n'est pas restauree apres un arret
  // brutal, et ce niveau ne doit jamais se vider (docs/12-archivage.md). Un
  // onglet n'est que l'instance d'une entree, marquee nash-kept = id.
  keptSpace(id) {
    return id ? this.model.spaces.find(s => s.gardes.some(entry => entry.id === id)) : null;
  },
  keptEntry(tab) {
    const id = tab && this.tabValue(tab, "nash-kept");
    return this.keptSpace(id)?.gardes.find(entry => entry.id === id) ?? null;
  },
  keptTab(entry) {
    return gBrowser.tabs.find(tab => !tab.closing && this.tabValue(tab, "nash-kept") === entry.id) ?? null;
  },
  // Une page en attente de restauration affiche about:blank : son adresse est
  // encore dans l'etat de session.
  tabURL(tab) {
    const spec = tab.linkedBrowser?.currentURI?.spec;
    if (this.validURL(spec)) { return spec; }
    try {
      const state = JSON.parse(this.SS.getTabState(tab));
      return state.entries?.[state.index - 1]?.url ?? "";
    } catch { return ""; }
  },

  toggleKept(tab, url = null) {
    // Une instance de tuile n'a rien a faire ici : elle a deja sa place.
    if (!tab || tab.closing || this.tabValue(tab, "nash-tile")) { return null; }
    const current = this.keptEntry(tab);
    if (current) {
      this.unkeep(current);
      return null;
    }
    url = this.validURL(url) ? url : this.tabURL(tab);
    // Une page qu'on ne saurait pas rouvrir (nouvel onglet, about:) ne se garde pas.
    if (!this.validURL(url)) { return null; }
    const entry = { id: this.newId(), url, nom: tab.label || url, dossier: null };
    this.space.gardes.push(entry);
    this.setTabValue(tab, "nash-kept", entry.id);
    this.setTabValue(tab, "nash-space", this.currentSpaceId);
    gBrowser.pinTab(tab);
    this.saveModel();
    this.renderSoon();
    return entry;
  },

  // Redescendre retire l'entree ; l'onglet, s'il est ouvert, reste parmi les
  // onglets du moment.
  unkeep(entry) {
    const space = this.keptSpace(entry.id);
    if (space) { space.gardes.splice(space.gardes.indexOf(entry), 1); }
    const tab = this.keptTab(entry);
    if (tab) {
      this.clearTabValue(tab, "nash-kept");
      this.clearTabValue(tab, "nash-folder");
      gBrowser.unpinTab(tab);
    }
    this.saveModel();
    this.renderSoon();
  },

  // Une page gardee dont l'onglet est ferme (ou que la session n'a pas rendue)
  // se rouvre au clic, dans le container de son espace.
  openKept(entry) {
    let tab = this.keptTab(entry);
    if (!tab) {
      tab = gBrowser.addTrustedTab(entry.url, { userContextId: this.containerFor({}).id });
      this.setTabValue(tab, "nash-kept", entry.id);
      this.setTabValue(tab, "nash-space", this.keptSpace(entry.id)?.id ?? this.currentSpaceId);
      gBrowser.pinTab(tab);
    }
    gBrowser.selectedTab = tab;
  },

  // L'entree suit la page : derniere adresse et titre connus.
  recordKept(tab) {
    const entry = this.keptEntry(tab);
    if (!entry || tab.closing || tab.hasAttribute("pending")) { return; }
    const url = tab.linkedBrowser?.currentURI?.spec;
    const nom = (tab.label || "").slice(0, 200);
    if (!this.validURL(url) || (entry.url === url && (!nom || entry.nom === nom))) { return; }
    entry.url = url;
    if (nom) { entry.nom = nom; }
    this.saveModel();
  },

  // Au demarrage : un onglet marque mais sans entree vient d'une version
  // anterieure (nash-kept = "1") ou d'un modele perdu. On l'adopte plutot que
  // de le perdre, avec son dossier.
  adoptKept() {
    let changed = false;
    for (const tab of gBrowser.tabs) {
      const id = this.tabValue(tab, "nash-kept");
      if (!id || tab.closing || this.keptEntry(tab)) { continue; }
      const url = this.tabURL(tab);
      if (this.tabValue(tab, "nash-tile") || !this.validURL(url)) {
        this.clearTabValue(tab, "nash-kept");
        this.clearTabValue(tab, "nash-folder");
        continue;
      }
      const space = this.model.spaces.find(s => s.id === this.tabValue(tab, "nash-space")) ?? this.space;
      const folder = this.tabValue(tab, "nash-folder");
      const entry = { id: id === "1" ? this.newId() : id, url, nom: tab.label || url,
        dossier: space.folders.some(f => f.id === folder) ? folder : null };
      space.gardes.push(entry);
      this.setTabValue(tab, "nash-kept", entry.id);
      this.clearTabValue(tab, "nash-folder");
      changed = true;
    }
    if (changed) { this.saveModel(); }
  },

  // Une autre fenetre a redescendu une page : son instance ici redescend aussi.
  reconcileKept() {
    for (const tab of gBrowser.tabs) {
      if (!tab.closing && this.tabValue(tab, "nash-kept") && !this.keptEntry(tab)) {
        this.clearTabValue(tab, "nash-kept");
        this.clearTabValue(tab, "nash-folder");
        gBrowser.unpinTab(tab);
      }
    }
  },

  // En-tête de l'espace : le chevron replie toute la zone gardée, et ce repli
  // est mémorisé avec l'espace.
  spaceHeader() {
    const space = this.space;
    const head = this.button("nash-space-head", "",
      `${space.nom} — les nouveaux onglets utilisent le container « ${space.container} »`, () => {
        space.replie = !space.replie;
        this.saveModel();
        this.render();
      });
    head.setAttribute("aria-expanded", String(!space.replie));
    head.dataset.nashFocus = "space-head";
    head.append(this.node("span", "nash-chevron", "›"),
      this.node("span", "nash-context-name", `${space.emoji}  ${space.nom}`));
    head.addEventListener("contextmenu", event => {
      event.preventDefault();
      this.showMenu([{ label: "Nouveau dossier…", action: () => this.createFolder() }], event);
    });
    return head;
  },

  keptRow(entry, index) {
    const tab = this.keptTab(entry);
    const label = tab?.label || entry.nom || "Sans titre";
    const row = this.node("div", "nash-kept-row");
    if (tab && tab === gBrowser.selectedTab) { row.setAttribute("aria-current", "true"); }
    // Pas d'onglet : la page reste gardée et se rouvre au clic.
    if (!tab) { row.dataset.ferme = "true"; }
    const open = this.button("nash-kept-open", "", label, () => this.openKept(entry));
    open.dataset.nashFocus = `kept:${index}`;
    const icon = this.node("span", "nash-kept-icon");
    if (this.safeIcon(tab?.image)) {
      const img = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
      img.src = tab.image;
      img.alt = "";
      icon.append(img);
    } else {
      icon.textContent = (label || "?").trim().charAt(0).toUpperCase();
      icon.classList.add("nash-kept-mono");
    }
    open.append(icon, this.node("span", "nash-kept-label", label));
    const off = this.button("nash-kept-off", "", "Redescendre dans les onglets",
      () => this.unkeep(entry));
    row.append(open, off);
    row.addEventListener("contextmenu", event => { event.preventDefault(); this.keptMenu(entry, event); });
    return row;
  },

  folderNode(folder, entries, start) {
    const wrap = this.node("div", "nash-folder");
    const head = this.button("nash-folder-head", "", folder.nom, () => {
      folder.ouvert = !folder.ouvert;
      this.saveModel();
      this.render();
    });
    head.setAttribute("aria-expanded", String(folder.ouvert));
    head.dataset.nashFocus = `folder:${folder.id}`;
    head.append(this.node("span", "nash-chevron", "›"),
      this.node("span", "nash-kept-label", folder.nom),
      this.node("span", "nash-folder-count", `${entries.length}`));
    head.addEventListener("contextmenu", event => {
      event.preventDefault();
      this.showMenu([
        { label: "Renommer le dossier…", action: () => this.renameFolder(folder) },
        { label: "Supprimer le dossier (garder les pages)", action: () => this.deleteFolder(folder) },
      ], event);
    });
    // Lâcher un onglet sur le dossier le garde directement dedans.
    head.addEventListener("dragover", event => {
      if (this._drag?.kind === "tile" || !this.dropAccepted(event)) { return; }
      event.preventDefault();
      head.toggleAttribute("data-drop", true);
    });
    for (const name of ["dragleave", "dragend", "drop"]) {
      head.addEventListener(name, () => head.removeAttribute("data-drop"));
    }
    head.addEventListener("drop", event => {
      const payload = this.dropPayload(event);
      if (!payload || payload.kind === "tile") { return; }
      event.preventDefault();
      event.stopPropagation();
      this.keepFromDrop(payload, folder.id);
    });
    wrap.append(head);
    if (folder.ouvert) {
      const body = this.node("div", "nash-folder-body");
      entries.forEach((entry, i) => body.append(this.keptRow(entry, start + i)));
      wrap.append(body);
    }
    return wrap;
  },

  fileKept(entry, folderId) {
    entry.dossier = folderId;
    this.saveModel();
    this.render();
  },

  keptMenu(entry, event) {
    const current = entry.dossier;
    const folders = this.space.folders;
    this.showMenu([
      ...folders.filter(folder => folder.id !== current).map(folder => ({
        label: `Ranger dans « ${folder.nom} »`,
        action: () => this.fileKept(entry, folder.id),
      })),
      ...(folders.some(folder => folder.id === current) ? [{
        label: "Sortir du dossier",
        action: () => this.fileKept(entry, null),
      }] : []),
      { label: "Nouveau dossier avec cette page…", action: () => this.createFolder(entry) },
      null,
      { label: "Redescendre dans les onglets", action: () => this.unkeep(entry) },
    ], event);
  },

  createFolder(entry = null) {
    const nom = this.ask("Nouveau dossier", "Nom du dossier :", "Dossier")?.trim().slice(0, 60);
    if (!nom) { return; }
    const folder = { id: this.newId(), nom, ouvert: true };
    this.space.folders.push(folder);
    if (entry) { entry.dossier = folder.id; }
    this.space.replie = false;
    this.saveModel();
    this.render();
  },

  renameFolder(folder) {
    const nom = this.ask("Renommer le dossier", "Nom du dossier :", folder.nom)?.trim().slice(0, 60);
    if (!nom) { return; }
    folder.nom = nom;
    this.saveModel();
    this.render();
  },

  // Supprimer un dossier ne ferme rien : ses pages restent gardées, hors dossier.
  deleteFolder(folder) {
    for (const entry of this.space.gardes) {
      if (entry.dossier === folder.id) { entry.dossier = null; }
    }
    const folders = this.space.folders;
    folders.splice(folders.indexOf(folder), 1);
    this.saveModel();
    this.render();
  },

  // Le trait entre ce qu'on garde et ce qui passe, avec de quoi vider les onglets
  // du moment de l'espace (jamais l'onglet affiché).
  clearRow() {
    const row = this.node("div", "nash-clear-row");
    const clear = this.button("nash-clear", "↓ Vider",
      "Archiver les onglets de cet espace, sauf l’onglet affiché", () => this.clearTabs());
    clear.dataset.nashFocus = "clear";
    row.append(this.node("div", "nash-kept-rule"), clear);
    return row;
  },

  // Une page web passe par l'archive ; un nouvel onglet vide se ferme simplement.
  async clearTabs() {
    const blank = ["about:blank", "about:newtab", "about:home"];
    for (const tab of [...gBrowser.tabs]) {
      if (tab.selected || this.spaceForTab(tab) !== this.currentSpaceId) { continue; }
      if (this.archivable(tab)) {
        await this.archiveTab(tab, "manuel");
      } else if (!tab.closing && !tab.pinned && !this.tabValue(tab, "nash-kept") &&
                 !this.tabValue(tab, "nash-tile") &&
                 blank.includes(tab.linkedBrowser?.currentURI?.spec)) {
        gBrowser.removeTab(tab);
      }
    }
  },

  keptNode() {
    const wrap = this.node("section", "nash-kept");
    wrap.setAttribute("aria-label", "Sites gardés");
    const list = this.node("div", "nash-kept-list");
    const entries = this.space.gardes;
    const folders = this.space.folders;
    const byFolder = new Map(folders.map(folder => [folder.id, []]));
    const loose = [];
    for (const entry of entries) {
      (byFolder.get(entry.dossier) ?? loose).push(entry);
    }
    let index = 0;
    for (const folder of folders) {
      const inside = byFolder.get(folder.id);
      list.append(this.folderNode(folder, inside, index));
      index += inside.length;
    }
    loose.forEach(entry => list.append(this.keptRow(entry, index++)));

    if (!entries.length && !folders.length) {
      list.append(this.node("div", "nash-kept-empty", "Glisse un onglet ici pour le garder"));
    }

    // Le geste attendu : attraper n'importe quel onglet ouvert et le lâcher ici.
    list.addEventListener("dragover", event => {
      if (this._drag?.kind === "tile" || !this.dropAccepted(event)) { return; }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      list.toggleAttribute("data-drop", true);
    });
    for (const name of ["dragleave", "dragend", "drop"]) {
      list.addEventListener(name, () => list.removeAttribute("data-drop"));
    }
    list.addEventListener("drop", event => {
      const payload = this.dropPayload(event);
      if (!payload || payload.kind === "tile") { return; }
      event.preventDefault();
      event.stopPropagation();
      this.keepFromDrop(payload);
    });

    wrap.append(list);
    return wrap;
  },

  // Un onglet lâché est gardé tel quel. Un lien lâché rejoint l'onglet qui
  // l'affiche déjà, sinon Nash en ouvre un : on ne garde jamais une page
  // qu'on ne pourrait pas rouvrir.
  keepFromDrop(payload, folderId = null) {
    let tab = payload.tab;
    if (!tab && payload.url) {
      tab = gBrowser.tabs.find(candidate => !candidate.closing &&
        candidate.linkedBrowser?.currentURI?.spec === payload.url);
      if (!tab) {
        tab = gBrowser.addTab(payload.url, {
          userContextId: this.containerFor({}).id,
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        });
        this.setTabValue(tab, "nash-space", this.currentSpaceId);
      }
    }
    if (!tab || tab.closing || this.tabValue(tab, "nash-tile")) { return; }
    const entry = this.keptEntry(tab) ?? this.toggleKept(tab, payload.url);
    if (entry && folderId) { this.fileKept(entry, folderId); }
  },

  // Le meme geste depuis le menu natif des onglets. ⌘D reste le raccourci,
  // mais tout ne se fait pas au clavier.
  installTabMenu() {
    const menu = document.getElementById("tabContextMenu");
    if (!menu || document.getElementById("nash-kept-item")) { return; }
    const item = document.createXULElement("menuitem");
    item.id = "nash-kept-item";
    item.addEventListener("command", () => {
      this.toggleKept(window.TabContextMenu?.contextTab ?? gBrowser.selectedTab);
    });
    const separator = document.createXULElement("menuseparator");
    separator.id = "nash-kept-separator";
    const archiveItem = document.createXULElement("menuitem");
    archiveItem.id = "nash-archive-item";
    archiveItem.label = "Archiver l’onglet";
    archiveItem.addEventListener("command", () => {
      this.archiveTab(window.TabContextMenu?.contextTab ?? gBrowser.selectedTab, "manuel");
    });
    const promoteItem = document.createXULElement("menuitem");
    promoteItem.id = "nash-promote-item";
    promoteItem.label = "Ranger dans un espace…";
    promoteItem.addEventListener("command", () => {
      const tab = window.TabContextMenu?.contextTab ?? gBrowser.selectedTab;
      this.promoteMenu(tab, { type: "contextmenu", screenX: 0, screenY: 0, currentTarget: tab });
    });
    const boostItem = document.createXULElement("menuitem");
    boostItem.id = "nash-boost-item";
    boostItem.label = "Style de ce site…";
    boostItem.addEventListener("command", () => {
      this.editBoost(window.TabContextMenu?.contextTab ?? gBrowser.selectedTab);
    });
    menu.prepend(boostItem, promoteItem, item, archiveItem, separator);

    this.listen(menu, "popupshowing", () => {
      const tab = window.TabContextMenu?.contextTab ?? gBrowser.selectedTab;
      const tile = tab && this.tabValue(tab, "nash-tile");
      item.hidden = !tab || !!tile;
      separator.hidden = item.hidden;
      archiveItem.hidden = !tab || !this.archivable(tab, true);
      promoteItem.hidden = !tab || !this.isTemporary(tab);
      boostItem.hidden = !tab || !this.boostOrigin(tab.linkedBrowser?.currentURI);
      item.label = tab && this.keptEntry(tab)
        ? "Redescendre dans les onglets"
        : "Garder dans cet espace";
    });
  },

  // Une vue scindée est une unité (D17) : elle s'affiche dans un espace dès qu'un de
  // ses volets lui appartient, et l'onglet de l'autre volet est alors montré aussi,
  // même s'il vient d'un autre espace. Sinon sa page serait à l'écran sans onglet.
  splitShared(tab) {
    const view = tab?.splitview;
    return !!view && view.tabs.some(other => other !== tab && !other.closing &&
      this.spaceForTab(other) === this.currentSpaceId);
  },

  availableInSpace(tab) {
    if (tab.closing) { return false; }
    if (this.splitShared(tab)) { return true; }
    const tile = this.allTiles.find(t => t.id === this.tabValue(tab, "nash-tile"));
    if (tile) {
      if (!this.visibleTiles.includes(tile)) { return false; }
      return tab.userContextId === this.containerFor(tile).id;
    }
    return this.spaceForTab(tab) === this.currentSpaceId;
  },

  syncTabs() {
    if (this._switching || !this._dom) { return; }
    this._switching = true;
    try {
      let candidate = this._lastTabs.get(this.currentSpaceId);
      const usable = tab => tab && gBrowser.tabs.includes(tab) && this.availableInSpace(tab) &&
        (!tab.hidden || this.SS.getCustomTabValue(tab, "hiddenBy") === "nash");
      if (!usable(gBrowser.selectedTab)) {
        candidate = usable(candidate) ? candidate : gBrowser.tabs.find(usable);
        if (!candidate) {
          candidate = gBrowser.addTrustedTab("about:newtab", { userContextId: this.containerFor({}).id });
          this.setTabValue(candidate, "nash-space", this.currentSpaceId);
        }
        gBrowser.showTab(candidate);
        gBrowser.selectedTab = candidate;
      }
      for (const tab of gBrowser.tabs) {
        if (tab.closing) { continue; }
        if (this.availableInSpace(tab)) {
          if (this.SS.getCustomTabValue(tab, "hiddenBy") === "nash") {
            gBrowser.showTab(tab);
          }
        } else {
          // Gecko deliberately keeps sharing tabs visible; preserve that warning.
          gBrowser.hideTab(tab, "nash");
        }
      }
      this.SS.setCustomWindowValue(window, "nash-space", this.currentSpaceId);
    } finally { this._switching = false; }
  },

  switchSpace(id) {
    if (!this.model.spaces.some(s => s.id === id) || id === this.currentSpaceId) { return; }
    this._lastTabs.set(this.currentSpaceId, gBrowser.selectedTab);
    this.currentSpaceId = id;
    this.syncTabs();
    this.render();
  },

  findInstance(tile) {
    const { id } = this.containerFor(tile);
    const same = tab => !tab.closing && tab.pinned && tab.userContextId === id;
    const marked = gBrowser.tabs.find(tab => same(tab) && this.tabValue(tab, "nash-tile") === tile.id);
    if (marked) { return marked; }
    // Legacy v0.2 adoption only: ambiguous origins must not merge distinct tiles.
    if (this.allTiles.filter(t => this.origin(t.url) === this.origin(tile.url)).length !== 1) { return null; }
    const legacy = gBrowser.tabs.find(tab => same(tab) && !this.tabValue(tab, "nash-tile") &&
      this.origin(tab.linkedBrowser?.currentURI?.spec) === this.origin(tile.url));
    if (legacy) { this.setTabValue(legacy, "nash-tile", tile.id); }
    return legacy;
  },

  resolveIdentity(tile) {
    if (tile.identite?.fixee || tile.identiteChoisie) { return true; }
    if (!tile.premierContainer) {
      // Recover the first account from an existing v0.2 instance when possible.
      const uniqueOrigin = this.allTiles.filter(t => this.origin(t.url) === this.origin(tile.url)).length === 1;
      const previous = gBrowser.tabs.find(tab => tab.pinned && !tab.closing &&
        (this.tabValue(tab, "nash-tile") === tile.id ||
         (!this.tabValue(tab, "nash-tile") && uniqueOrigin &&
          this.origin(tab.linkedBrowser?.currentURI?.spec) === this.origin(tile.url))));
      tile.premierContainer = this.CIS.getPublicIdentities().find(c =>
        c.userContextId === previous?.userContextId)?.name ?? this.space.container;
      this.saveModel();
    }
    if (tile.premierContainer === this.space.container) { return true; }
    const p = Services.prompt;
    const choice = p.confirmEx(window, `Session de ${tile.nom}`,
      `Vous ouvrez ${tile.nom} dans un second espace.\n\n` +
      `Une session par espace garde les comptes séparés. Une seule session partout ` +
      `réutilise le compte du container « ${tile.premierContainer} ». Ce choix sera mémorisé.`,
      p.BUTTON_POS_0 * p.BUTTON_TITLE_IS_STRING + p.BUTTON_POS_1 * p.BUTTON_TITLE_CANCEL +
      p.BUTTON_POS_2 * p.BUTTON_TITLE_IS_STRING,
      "Une session par espace", null, "Une seule session partout", null, {});
    // Native Escape/window-close maps to button 1: it must always mean cancel.
    if (choice !== 0 && choice !== 2) { return false; }
    tile.identite = choice === 2 ? { fixee: tile.premierContainer } : "heritee";
    tile.identiteChoisie = true;
    this.saveModel();
    return true;
  },

  openTile(tile) {
    if (!this.resolveIdentity(tile)) { return; }
    let tab = this.findInstance(tile);
    if (!tab) {
      tab = gBrowser.addTrustedTab(tile.url, { userContextId: this.containerFor(tile).id });
      this.setTabValue(tab, "nash-tile", tile.id);
      this.setTabValue(tab, "nash-space", this.currentSpaceId);
      gBrowser.pinTab(tab);
    }
    // Fixed global tiles may belong to another space; selection must not switch it.
    this._switching = true;
    try { gBrowser.showTab(tab); gBrowser.selectedTab = tab; }
    finally { this._switching = false; }
    this._lastTabs.set(this.currentSpaceId, tab);
    this.renderSoon();
    return tab;
  },

  collection(tile) {
    if (this.model.global.includes(tile)) { return this.model.global; }
    return this.model.spaces.find(s => s.tiles.includes(tile))?.tiles;
  },
  moveTile(tile, destination, index = destination.length) {
    const source = this.collection(tile);
    if (!source || ![this.model.global, ...this.model.spaces.map(s => s.tiles)].includes(destination)) { return false; }
    const oldIndex = source.indexOf(tile);
    source.splice(oldIndex, 1);
    if (source === destination && oldIndex < index) { index--; }
    destination.splice(Math.max(0, Math.min(index, destination.length)), 0, tile);
    this.saveModel();
    this.renderSoon();
    return true;
  },
  toggleScope(tile) {
    this.moveTile(tile, this.model.global.includes(tile) ? this.space.tiles : this.model.global);
  },
  addCurrentTile(scope = "locale") {
    const tab = gBrowser.selectedTab;
    let url = tab.linkedBrowser.currentURI.spec;
    // No usable page in front? Ask instead of refusing — D10 lists typing an
    // address as a first-class way to place a tile.
    if (!this.validURL(url)) {
      url = this.ask("Nouvelle tuile", "Adresse du site :", "https://");
      if (!this.validURL(url)) { return; }
    }
    const destination = scope === "globale" ? this.model.global : this.space.tiles;
    if (destination.some(t => t.url === url)) { this.notify("Cette page est déjà dans cette section."); return; }
    const tile = { id: this.newId(), url, nom: (this.validURL(tab.linkedBrowser.currentURI.spec) && tab.label) || new URL(url).hostname,
      identite: null, premierContainer: this.space.container };
    destination.push(tile);
    if (tab.userContextId === this.containerFor(tile).id && !this.tabValue(tab, "nash-tile")) {
      this.setTabValue(tab, "nash-tile", tile.id);
      this.setTabValue(tab, "nash-space", this.currentSpaceId);
      gBrowser.pinTab(tab);
    }
    this.saveModel();
    this.renderSoon();
  },
  removeTile(tile) {
    const list = this.collection(tile);
    if (!list) { return; }
    const localOwner = this.model.spaces.find(s => s.tiles === list)?.id;
    list.splice(list.indexOf(tile), 1);
    // Removing a shortcut must not discard live forms or sessions, in any window.
    for (const win of BrowserWindowTracker.orderedWindows) {
      if (!win.Nash?.model) { continue; }
      for (const tab of win.gBrowser.tabs) {
        if (this.tabValue(tab, "nash-tile") === tile.id) {
          if (localOwner || win.gBrowser.selectedTab === tab) {
            this.setTabValue(tab, "nash-space", localOwner ?? win.Nash.currentSpaceId);
          }
          this.clearTabValue(tab, "nash-tile");
          win.gBrowser.unpinTab(tab);
        }
      }
    }
    this.saveModel();
    this.renderSoon();
  },
  // Creating a space belongs to the sidebar, not to a system modal. A native
  // prompt cannot show the tint, and the tint is what tells the user which
  // account they are in once the space exists.
  createSpace() { this.openSpaceForm(null); },
  renameSpace(space) { this.openSpaceForm(space); },

  // Supprimer un espace ne détruit ni onglet ni tuile : tout passe dans l'espace
  // voisin. Les onglets gardent leur container (leurs cookies ne bougent pas),
  // et le container de l'espace supprimé reste dans Firefox.
  spaceTabs(space) {
    const found = [];
    for (const win of BrowserWindowTracker.orderedWindows) {
      if (!win.Nash?.model) { continue; }
      for (const tab of win.gBrowser.tabs) {
        if (!tab.closing && win.Nash.spaceForTab(tab) === space.id) { found.push({ win, tab }); }
      }
    }
    return found;
  },

  deleteSpace(space) {
    const spaces = this.model.spaces;
    if (spaces.length < 2) { return; }
    const index = spaces.indexOf(space);
    const target = spaces[index > 0 ? index - 1 : 1];
    const tabs = this.spaceTabs(space);
    const message = `${tabs.length} onglet(s), ${space.tiles.length} tuile(s) et ` +
      `${space.gardes.length} page(s) gardée(s) de ` +
      `« ${space.nom} » passeront dans « ${target.nom} ». Rien n’est fermé. Le ` +
      `container « ${space.container} » et ses cookies sont conservés.`;
    if (!Services.prompt.confirm(window, `Supprimer l’espace « ${space.nom} »`, message)) { return; }
    for (const { win, tab } of tabs) {
      const tile = space.tiles.find(t => t.id === this.tabValue(tab, "nash-tile"));
      this.setTabValue(tab, "nash-space", target.id);
      // Une tuile à identité héritée perd son instance dans le nouvel espace
      // (autre container) : l'onglet reste ouvert, comme un onglet ordinaire.
      if (tile && !tile.identite?.fixee) {
        this.clearTabValue(tab, "nash-tile");
        win.gBrowser.unpinTab(tab);
      }
    }
    target.tiles.push(...space.tiles);
    // Les pages gardées et leurs dossiers suivent : ce niveau ne se vide jamais.
    target.folders.push(...space.folders);
    target.gardes.push(...space.gardes);
    spaces.splice(index, 1);
    // Every window showing the deleted space moves to the same neighbour. Done
    // before saveModel(): the other windows' model observer keeps their current
    // space when it still exists, and would otherwise fall back to the first one.
    for (const win of BrowserWindowTracker.orderedWindows) {
      const nash = win.Nash;
      if (!nash?.model) { continue; }
      nash._lastTabs.delete(space.id);
      if (nash.currentSpaceId === space.id) { nash.currentSpaceId = target.id; }
    }
    this.saveModel();
    this.syncTabs();
    this.render();
  },

  openSpaceForm(space) {
    this._form = {
      space,
      nom: space?.nom ?? "",
      teinte: space?.teinte ?? this.TINTS[this.model.spaces.length % this.TINTS.length],
    };
    this.render();
  },

  closeSpaceForm() { this._form = null; this.render(); },

  commitSpaceForm() {
    const form = this._form;
    const nom = (form?.nom || "").trim().slice(0, 60);
    if (!nom) { return; }
    if (form.space) {
      form.space.nom = nom;
      form.space.teinte = form.teinte;
      this._form = null;
      this.saveModel();
      this.render();
      return;
    }
    const id = this.newId();
    // Containers stay unique across spaces: two spaces sharing a cookie jar
    // would silently merge the accounts they exist to keep apart.
    const container = this.containerByName(nom) ? `${nom} (${id.slice(0, 6)})` : nom;
    this.model.spaces.push({ id, nom, emoji: "◉", container, teinte: form.teinte, tiles: [],
      folders: [], gardes: [], archiveH: this.ARCHIVE_DEFAULT_H });
    this._form = null;
    this.ensureContainers();
    this.saveModel();
    this.switchSpace(id);
  },

  spaceFormNode() {
    const form = this._form;
    const root = this.node("div", "nash-form");

    const input = document.createElementNS("http://www.w3.org/1999/xhtml", "input");
    input.className = "nash-form-name";
    input.type = "text";
    input.maxLength = 60;
    input.placeholder = "Nom de l’espace";
    input.value = form.nom;
    input.addEventListener("input", () => { form.nom = input.value; });
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); this.commitSpaceForm(); }
      if (event.key === "Escape") { event.preventDefault(); this.closeSpaceForm(); }
    });

    const tints = this.node("div", "nash-form-tints");
    for (const teinte of this.TINTS) {
      const swatch = this.button("nash-form-tint", "", `Teinte ${teinte}`, () => {
        form.teinte = teinte;
        this.render();
      });
      swatch.style.setProperty("--space-tint", teinte);
      if (teinte === form.teinte) { swatch.setAttribute("aria-current", "true"); }
      tints.append(swatch);
    }

    const actions = this.node("div", "nash-form-actions");
    actions.append(
      this.button("nash-form-cancel", "Annuler", "Annuler", () => this.closeSpaceForm()),
      this.button("nash-form-ok", form.space ? "Enregistrer" : "Créer",
        form.space ? "Enregistrer le nom et la teinte" : "Créer l’espace",
        () => this.commitSpaceForm()));

    root.append(input, tints, actions);
    Services.tm.dispatchToMainThread(() => input.focus());
    return root;
  },
  renameTile(tile) {
    const name = this.ask("Renommer la tuile", "Nom de la tuile :", tile.nom);
    if (name) { tile.nom = name; this.saveModel(); this.render(); }
  },
  ask(title, message, initial) {
    const value = { value: initial };
    return Services.prompt.prompt(window, title, message, value, null, {})
      ? value.value.trim().slice(0, 100) : null;
  },
  notify(message) { Services.prompt.alert(window, "Nash", message); },

  async chooseIcon(tile) {
    const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    fp.init(window.browsingContext, "Choisir une icône locale", Ci.nsIFilePicker.modeOpen);
    fp.appendFilter("Images PNG, JPEG, WebP, GIF ou ICO", "*.png;*.jpg;*.jpeg;*.webp;*.gif;*.ico");
    if (await new Promise(resolve => fp.open(resolve)) !== Ci.nsIFilePicker.returnOK) { return; }
    try {
      await this.cacheManualIcon(tile, fp.file.path);
    } catch (error) { this.notify(error.message); }
  },
  async cacheManualIcon(tile, path) {
    // Read a bounded local raster, never an SVG or a URL supplied by a web page.
    if ((await IOUtils.stat(path)).size > 512 * 1024) {
      throw new Error("Choisissez une image de moins de 512 Ko.");
    }
    const bytes = await IOUtils.read(path, { maxBytes: 512 * 1024 + 1 });
    if (bytes.length > 512 * 1024) { throw new Error("Image trop volumineuse."); }
    const type = this.imageType(bytes);
    if (!type) { throw new Error("Format d’image non reconnu."); }
    let binary = "";
    for (const byte of bytes) { binary += String.fromCharCode(byte); }
    tile.iconeManuelle = `data:image/${type};base64,${btoa(binary)}`;
    this.saveModel();
    this.render();
  },
  imageType(b) {
    if (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) { return "png"; }
    if (b[0] === 255 && b[1] === 216 && b[2] === 255) { return "jpeg"; }
    if (b[0] === 71 && b[1] === 73 && b[2] === 70 && b[3] === 56) { return "gif"; }
    if (b[0] === 82 && b[1] === 73 && b[2] === 70 && b[3] === 70 &&
        b[8] === 87 && b[9] === 69 && b[10] === 66 && b[11] === 80) { return "webp"; }
    if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) { return "x-icon"; }
    return null;
  },

  onKey(event) {
    const accel = AppConstants.platform === "macosx" ? event.metaKey : event.ctrlKey;
    if (!event.isTrusted || !accel || event.altKey || event.shiftKey ||
        (AppConstants.platform === "macosx" ? event.ctrlKey : event.metaKey)) { return; }
    // ⌘D garde la page courante, ou la redescend. Raccourci d'Arc.
    if (event.key === "d" || event.code === "KeyD") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) { this.toggleKept(gBrowser.selectedTab); }
      return;
    }
    const number = /^[1-9]$/.test(event.key) ? Number(event.key) :
      /^Digit[1-9]$/.test(event.code) ? Number(event.code.slice(-1)) : 0;
    if (!number) { return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    const tile = this.visibleTiles[number - 1];
    if (tile && !event.repeat) { this.openTile(tile); }
  },

  node(tag, className, text) {
    const node = document.createElementNS("http://www.w3.org/1999/xhtml", tag);
    if (className) { node.className = className; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  },
  button(className, text, title, action) {
    const button = this.node("button", className, text);
    button.type = "button";
    button.title = title;
    button.setAttribute("aria-label", title);
    button.addEventListener("click", action);
    return button;
  },
  // Palette (docs/18-palette.md) : la barre d'adresse native retient, par espace,
  // ce que l'utilisateur a choisi pour une saisie donnée, et le lui repropose en
  // deuxième ligne. Rien ne quitte l'appareil. Le premier résultat (celui de la
  // touche Entrée) reste celui de Firefox : la mémoire propose, elle ne détourne pas.
  PALETTE_FILE: "nash-palette.json",
  PALETTE_PROVIDER: "NashMemory",
  PALETTE_MAX_PER_SPACE: 500,
  PALETTE_MAX_RESULTS: 3,

  paletteKey(text) {
    return String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 100);
  },

  // Le fournisseur est global à l'application (un gestionnaire par point d'accès,
  // partagé par toutes les fenêtres) : une seule fenêtre l'enregistre, et passe la
  // main à une autre à sa fermeture.
  installPalette(memory = null) {
    const { UrlbarProvider, UrlbarUtils } = ChromeUtils.importESModule(
      "moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs");
    const { ProvidersManager } = ChromeUtils.importESModule(
      "moz-src:///browser/components/urlbar/UrlbarProvidersManager.sys.mjs");
    const { UrlbarResult } = ChromeUtils.importESModule("chrome://browser/content/urlbar/UrlbarResult.mjs");
    const manager = ProvidersManager.getInstanceForSap(gURLBar.sapName ?? "urlbar");
    if (manager.getProvider(this.PALETTE_PROVIDER)) { return; }
    const nashOf = controller => {
      const win = controller?.browserWindow;
      return win && !win.closed && win.Nash?.model && !PrivateBrowsingUtils.isWindowPrivate(win)
        ? win.Nash : null;
    };
    const path = PathUtils.join(PathUtils.profileDir, this.PALETTE_FILE);
    const store = { memory: memory ?? {}, timer: 0, dirty: false };
    const save = () => {
      store.dirty = true;
      window.clearTimeout(store.timer);
      store.timer = window.setTimeout(() => {
        store.dirty = false;
        IOUtils.writeJSON(path, store.memory).catch(error =>
          console.error("[Nash] mémoire de la palette non écrite :", error));
      }, 1000);
    };
    const nash = this;
    class NashMemoryProvider extends UrlbarProvider {
      get name() { return nash.PALETTE_PROVIDER; }
      get type() { return UrlbarUtils.PROVIDER_TYPE.PROFILE; }
      async isActive(queryContext, controller) {
        return !queryContext.isPrivate && !!nashOf(controller) &&
          nash.paletteKey(queryContext.searchString).length > 0;
      }
      startQuery(queryContext, addCallback, controller) {
        const owner = nashOf(controller);
        const key = nash.paletteKey(queryContext.searchString);
        const space = store.memory[owner?.currentSpaceId] ?? {};
        // La saisie exacte d'abord, puis les saisies plus longues qui commencent
        // pareil (à partir de deux caractères), les plus choisies en tête.
        const found = Object.entries(space)
          .filter(([query]) => query === key || (key.length >= 2 && query.startsWith(key)))
          .sort(([a, x], [b, y]) => (b === key) - (a === key) || y.count - x.count || y.last - x.last);
        const seen = new Set();
        for (const [, choice] of found) {
          if (seen.size >= nash.PALETTE_MAX_RESULTS || seen.has(choice.url) || !nash.validURL(choice.url)) {
            continue;
          }
          seen.add(choice.url);
          addCallback(this, new UrlbarResult({
            type: UrlbarUtils.RESULT_TYPE.URL,
            source: UrlbarUtils.RESULT_SOURCE.OTHER_LOCAL,
            suggestedIndex: 1,
            payload: { url: choice.url, title: choice.title || choice.url, icon: `page-icon:${choice.url}` },
          }));
        }
      }
      // onEngagement ne parvient qu'au fournisseur du résultat choisi
      // (UrlbarProvidersManager #notifyEngagement) : la fin de session est vue par
      // tous, et porte le résultat choisi dans details.result.
      onSearchSessionEnd(queryContext, controller, details) {
        const owner = nashOf(controller);
        const url = details?.result?.payload?.url;
        const key = nash.paletteKey(details?.searchString);
        if (!owner || queryContext?.isPrivate || !key || !nash.validURL(url)) { return; }
        const space = (store.memory[owner.currentSpaceId] ??= {});
        const previous = space[key];
        space[key] = {
          url,
          title: String(details.result.payload.title ?? "").slice(0, 200),
          // Un choix différent remet le compteur à un : la mémoire suit l'usage récent.
          count: previous?.url === url ? previous.count + 1 : 1,
          last: Date.now(),
        };
        const entries = Object.entries(space);
        if (entries.length > nash.PALETTE_MAX_PER_SPACE) {
          entries.sort(([, a], [, b]) => a.last - b.last)
            .slice(0, entries.length - nash.PALETTE_MAX_PER_SPACE)
            .forEach(([query]) => delete space[query]);
        }
        save();
      }
    }
    const provider = new NashMemoryProvider();
    manager.registerProvider(provider);
    this._palette = { manager, provider, store };
    IOUtils.exists(path).then(async exists => {
      if (!exists) { return; }
      try {
        const data = await IOUtils.readJSON(path);
        if (data && typeof data === "object" && !Array.isArray(data)) {
          // Les espaces supprimés n'ont plus de mémoire à garder.
          const spaces = new Set(this.model.spaces.map(s => s.id));
          for (const id of Object.keys(data)) { if (!spaces.has(id)) { delete data[id]; } }
          store.memory = Object.assign(data, store.memory);
        }
      } catch (error) {
        console.error("[Nash] mémoire de la palette illisible, mise de côté :", error);
        try { await IOUtils.move(path, `${path}.${Date.now()}.corrompu`); } catch {}
      }
    });
  },

  removePalette() {
    if (!this._palette) { return; }
    const { manager, provider, store } = this._palette;
    window.clearTimeout(store.timer);
    manager.unregisterProvider(provider);
    this._palette = null;
    // Écriture immédiate de ce qui attendait, et passage de main tout de suite, avec
    // la mémoire : les promesses d'une fenêtre qui se ferme ne s'exécutent plus.
    // Seulement si un choix attendait d'être écrit : pas de fichier vide à chaque
    // fermeture de fenêtre (constat du lot 3).
    if (store.dirty) {
      IOUtils.writeJSON(PathUtils.join(PathUtils.profileDir, this.PALETTE_FILE), store.memory)
        .catch(() => {});
    }
    const next = BrowserWindowTracker.orderedWindows.find(w => w !== window && !w.closed && w.Nash?.model);
    next?.Nash.installPalette(store.memory);
  },

  // Boosts : un style CSS par site, propre à un compte (container) ou commun à tous
  // (docs/15-boosts.md). CSS seul : aucun script n'est injecté, donc rien de ce
  // fichier ne pourra jamais exécuter de code dans une page ni dans un partage.
  // Le style suit le compte et non l'espace : le container est ce que le processus
  // de la page connaît, et c'est lui qui distingue deux comptes du même site.
  BOOST_FILE: "nash-boosts.json",
  BOOST_MAX_CHARS: 20000,
  BOOST_TOPIC: "nash:boosts-changed",
  BOOST_SHARED_KEY: "nash:boosts",
  BOOST_FRAME_URL: "chrome://browser/content/nash/boost-frame.js",
  _boosts: [],

  // Même règle que boost-frame.js : décoder les échappements et les commentaires
  // avant de chercher @import (docs/15, B1).
  boostRefusal(css) {
    if (css.length > this.BOOST_MAX_CHARS) {
      return `Trop long : ${this.BOOST_MAX_CHARS} caractères au plus.`;
    }
    const decoded = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (match, hex) => {
        const point = parseInt(hex, 16);
        return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "\uFFFD";
      })
      .replace(/\\([^\n])/g, "$1");
    return /@\s*import/i.test(decoded)
      ? "@import est refusé : il chargerait une ressource que vous n'avez pas écrite." : null;
  },

  boostOrigin(uri) {
    try {
      return ["http", "https"].includes(uri.scheme) ? uri.prePath : null;
    } catch { return null; }
  },

  boostAccount(tab) {
    return this.CIS.getPublicIdentityFromId(tab?.userContextId)?.name ?? null;
  },

  async readBoosts() {
    const path = PathUtils.join(PathUtils.profileDir, this.BOOST_FILE);
    if (!(await IOUtils.exists(path))) { return []; }
    let list = null;
    try { list = await IOUtils.readJSON(path); } catch (error) {
      console.error("[Nash] boosts illisibles :", error);
    }
    if (!Array.isArray(list)) {
      // Un fichier illisible n'est jamais écrasé en silence : on le met de côté
      // (docs/15, B3), comme l'archive.
      try { await IOUtils.move(path, `${path}.${Date.now()}.corrompu`); } catch {}
      return [];
    }
    const spaces = this.model?.spaces ?? [];
    return list.flatMap(entry => {
      if (!entry || typeof entry.origin !== "string" || typeof entry.css !== "string" ||
          this.boostRefusal(entry.css)) {
        // Écartée : elle disparaîtra du fichier au prochain enregistrement. On le dit.
        console.warn("[Nash] style écarté à la lecture de nash-boosts.json :", entry?.origin ?? entry,
          entry && typeof entry.css === "string" ? this.boostRefusal(entry.css) : "entrée invalide");
        return [];
      }
      // Première version : style rattaché à un espace. On le rattache au container
      // de cet espace, ou on l'abandonne si l'espace n'existe plus.
      if (entry.espace && !("compte" in entry)) {
        const container = spaces.find(s => s.id === entry.espace)?.container;
        if (!container) { return []; }
        return [{ ...entry, compte: container, espace: undefined }];
      }
      return [entry];
    });
  },

  async saveBoosts(list) {
    await IOUtils.writeJSON(PathUtils.join(PathUtils.profileDir, this.BOOST_FILE), list);
    this._boosts = list;
    this.publishBoosts();
    Services.obs.notifyObservers(null, this.BOOST_TOPIC);
  },

  // Les processus de page lisent ces données directement (boost-frame.js).
  publishBoosts() {
    const containers = {};
    for (const identity of this.CIS.getPublicIdentities()) {
      if (identity.name) { containers[identity.userContextId] = identity.name; }
    }
    Services.ppmm.sharedData.set(this.BOOST_SHARED_KEY, { boosts: this._boosts, containers });
    Services.ppmm.sharedData.flush();
    // Les pages déjà ouvertes reprennent le style sans rechargement.
    window.messageManager.broadcastAsyncMessage("Nash:BoostRefresh");
  },

  async installBoosts() {
    this._boosts = await this.readBoosts();
    this.publishBoosts();
    window.messageManager.loadFrameScript(this.BOOST_FRAME_URL, true);
    this._boostObserver = { observe: async () => {
      this._boosts = await this.readBoosts();
      this.publishBoosts();
    }};
    Services.obs.addObserver(this._boostObserver, this.BOOST_TOPIC);
  },

  removeBoosts() {
    if (!this._boostObserver) { return; }
    window.messageManager.removeDelayedFrameScript(this.BOOST_FRAME_URL);
    Services.obs.removeObserver(this._boostObserver, this.BOOST_TOPIC);
    this._boostObserver = null;
  },

  // Éditeur : une boîte <dialog> HTML dans la fenêtre du navigateur.
  editBoost(tab) {
    const origin = this.boostOrigin(tab?.linkedBrowser?.currentURI);
    if (!origin || document.getElementById("nash-boost-dialog")) { return; }
    const account = this.boostAccount(tab);
    const existing = this._boosts.find(b => account && b.origin === origin && b.compte === account) ??
      this._boosts.find(b => b.origin === origin && !b.compte);
    const dialog = this.node("dialog", "nash-boost");
    dialog.id = "nash-boost-dialog";
    const title = this.node("h2", "", `Style de ${new URL(origin).host}`);
    const note = this.node("p", "nash-boost-note",
      "CSS seulement : aucun script n'est exécuté. @import est refusé.");
    const area = this.node("textarea");
    area.rows = 14;
    area.cols = 60;
    area.spellcheck = false;
    area.value = existing?.css ?? "";
    area.placeholder = "body { font-size: 18px; }";
    const label = (text, input) => {
      const row = this.node("label", "nash-boost-row");
      row.append(input, document.createTextNode(` ${text}`));
      return row;
    };
    const all = this.node("input");
    all.type = "checkbox";
    // Sans compte (container 0), seul un style commun a un sens.
    all.checked = !account || (!!existing && !existing.compte);
    all.disabled = !account;
    const on = this.node("input");
    on.type = "checkbox";
    on.checked = existing ? existing.actif !== false : true;
    const error = this.node("p", "nash-boost-error");
    const save = this.button("nash-boost-save", "Enregistrer", "Enregistrer le style", async () => {
      const css = area.value;
      const refusal = this.boostRefusal(css);
      if (refusal) { error.textContent = refusal; return; }
      const target = all.checked || !account ? null : account;
      // Le style édité est déplacé, pas copié : on retire l'ancienne entrée, et toute
      // autre entrée de même site et de même portée.
      const rest = this._boosts.filter(b => b.id !== existing?.id &&
        !(b.origin === origin && (b.compte ?? null) === target));
      if (css.trim()) {
        rest.push({ id: existing?.id ?? this.newId(), origin, compte: target, css,
                    actif: on.checked, modifie: Date.now() });
      }
      await this.saveBoosts(rest);
      dialog.close();
    });
    const remove = this.button("nash-boost-remove", "Supprimer", "Supprimer ce style", async () => {
      await this.saveBoosts(this._boosts.filter(b => b.id !== existing?.id));
      dialog.close();
    });
    remove.disabled = !existing;
    const cancel = this.button("nash-boost-cancel", "Annuler", "Fermer sans enregistrer", () => dialog.close());
    const buttons = this.node("div", "nash-boost-buttons");
    buttons.append(save, remove, cancel);
    dialog.append(title, note, area,
      label(account ? `Tous les comptes (sinon seulement « ${account} »)` : "Tous les comptes", all),
      label("Actif", on), error, buttons);
    dialog.addEventListener("close", () => dialog.remove());
    document.documentElement.append(dialog);
    dialog.showModal();
    area.focus();
  },

  // Liens venus d'une autre application (docs/14-liens-externes.md). Firefox les
  // ouvre dans un onglet sans container (0), donc hors de tout espace : leurs
  // cookies se mélangeraient. Nash les ouvre dans un container jetable, supprimé
  // quand son dernier onglet se ferme. « Ranger dans un espace… » recopie l'onglet
  // (adresse, historique, défilement, formulaires) dans le container d'un espace.
  TEMP_PREFIX: "nash-temp-",
  PREF_TEMP: "nash.external.temp",

  temporaryIdentities() {
    return this.CIS.getPublicIdentities().filter(id => id.name?.startsWith(this.TEMP_PREFIX));
  },

  isTemporary(tab) {
    return !!tab && !!this.CIS.getPublicIdentityFromId(tab.userContextId)?.name?.startsWith(this.TEMP_PREFIX);
  },

  // Un lien vers un site où l'utilisateur a déjà des onglets suit ce compte (un lien
  // pro s'ouvre dans l'espace pro), comme le fait Firefox. Les onglets de tous les
  // espaces comptent, y compris ceux que Nash a cachés.
  guessDonorTab(uri) {
    let host;
    try { host = uri.host; } catch { return null; }
    if (!host) { return null; }
    const votes = new Map();
    for (const win of BrowserWindowTracker.orderedWindows) {
      if (!win.Nash?.model) { continue; }
      for (const tab of win.gBrowser.tabs) {
        let same = false;
        try {
          same = !tab.closing && !!tab.userContextId && tab.linkedBrowser?.currentURI?.host === host;
        } catch {}
        if (same && !win.Nash.isTemporary(tab)) {
          const entry = votes.get(tab.userContextId) ?? { count: 0, tab, win };
          entry.count++;
          votes.set(tab.userContextId, entry);
        }
      }
    }
    return [...votes.values()].sort((a, b) => b.count - a.count)[0] ?? null;
  },

  openExternal(uri) {
    const foreground = !Services.prefs.getBoolPref("browser.tabs.loadDivertedInBackground", false);
    const donor = this.guessDonorTab(uri);
    let userContextId;
    let spaceId = this.currentSpaceId;
    let temporary = false;
    if (donor) {
      userContextId = donor.tab.userContextId;
      spaceId = donor.win.Nash.spaceForTab(donor.tab);
    } else {
      const name = `${this.TEMP_PREFIX}${this.newId().slice(0, 8)}`;
      userContextId = this.CIS.create(name, "circle", "red").userContextId;
      temporary = true;
    }
    const tab = gBrowser.addTrustedTab(uri.spec, { userContextId, inBackground: !foreground });
    this.setTabValue(tab, "nash-space", spaceId);
    if (temporary) {
      this.setTabValue(tab, "nash-temp-run", this.runId());
    }
    if (foreground) {
      if (spaceId !== this.currentSpaceId) { this.switchSpace(spaceId); }
      gBrowser.selectedTab = tab;
    }
    return tab;
  },

  runId() { return String(Services.startup.getStartupInfo().process.getTime()); },

  installTemporary() {
    // Gecko appelle openURI sur l'objet JS, pas sur son reflet XPConnect.
    const target = window.browserDOMWindow?.wrappedJSObject;
    if (target && typeof target.openURI === "function") {
      const original = target.openURI;
      const nash = this;
      this._temp = { target, original, wrapper: null };
      this._temp.wrapper = function(uri, opener, where, flags, principal, csp) {
        const external = (flags & Ci.nsIBrowserDOMWindow.OPEN_EXTERNAL) !== 0;
        if (external && !nash._destroyed && Services.prefs.getBoolPref(nash.PREF_TEMP, true) &&
            ["http", "https"].includes(uri?.scheme)) {
          try {
            return nash.openExternal(uri).linkedBrowser.browsingContext;
          } catch (error) {
            // Jamais de repli silencieux vers le container 0 : on le journalise.
            console.error("[Nash] lien externe : container temporaire impossible :", error);
          }
        }
        return original.call(this, uri, opener, where, flags, principal, csp);
      };
      try {
        target.openURI = this._temp.wrapper;
      } catch (error) {
        console.error("[Nash] openURI non remplaçable :", error);
        this._temp = null;
      }
    }
    this.listen(gBrowser.tabContainer, "TabClose", () => this.scheduleTempCleanup());
    this.sweepStaleTemporary();
  },

  removeTemporary() {
    window.clearTimeout(this._tempTimer);
    if (this._temp && this._temp.target.openURI === this._temp.wrapper) {
      this._temp.target.openURI = this._temp.original;
    }
    this._temp = null;
  },

  scheduleTempCleanup() {
    window.clearTimeout(this._tempTimer);
    this._tempTimer = window.setTimeout(() => this.cleanupTemporary(), 500);
  },

  // Supprime les containers jetables sans onglet, dans toutes les fenêtres.
  async cleanupTemporary() {
    if (this._destroyed) { return; }
    const used = new Set();
    for (const win of BrowserWindowTracker.orderedWindows) {
      for (const tab of win.gBrowser?.tabs ?? []) {
        if (!tab.closing) { used.add(tab.userContextId); }
      }
    }
    for (const identity of this.temporaryIdentities()) {
      if (used.has(identity.userContextId)) { continue; }
      // closeContainerTabs avant remove : sinon un onglet resté ouvert pourrait
      // réécrire des cookies dans un container supprimé (docs/13, B3).
      await this.CIS.closeContainerTabs(identity.userContextId);
      this.CIS.remove(identity.userContextId);
    }
  },

  // Après un redémarrage, un onglet jetable restauré appartient à une exécution
  // finie : on l'archive (rien n'est perdu), puis son container est supprimé.
  // Seuls les onglets d'une AUTRE exécution sont touchés : une fenêtre ouverte plus
  // tard ne doit pas fermer les liens externes de la fenêtre d'à côté.
  async sweepStaleTemporary() {
    const run = this.runId();
    for (const tab of [...gBrowser.tabs]) {
      if (tab.closing || !this.isTemporary(tab) || this.tabValue(tab, "nash-temp-run") === run) { continue; }
      const address = this.tabAddress(tab);
      if (address) {
        const { url, title } = address;
        const space = this.model.spaces.find(s => s.id === this.spaceForTab(tab)) ?? this.space;
        try {
          await this.updateArchive(list => [{
            id: this.newId(), url, titre: (title || url).slice(0, 200),
            espace: space.id, espaceNom: space.nom, container: null,
            archivedAt: Date.now(), lastActive: tab.lastAccessed, motif: "temporaire",
          }, ...list]);
        } catch (error) {
          console.error("[Nash] archive d'un lien externe impossible, onglet conservé :", error);
          continue;
        }
      }
      gBrowser.removeTab(tab, { skipPermitUnload: true, animate: false });
    }
    this.scheduleTempCleanup();
  },

  promoteMenu(tab, anchor) {
    this.showMenu(this.model.spaces.map(space => ({
      label: `${space.emoji}  ${space.nom}`,
      action: () => this.promoteTemporary(tab, space),
    })), anchor);
  },

  // Gecko ne change pas le container d'un onglet : on recopie son état dans un
  // nouvel onglet du container de l'espace (docs/13, B4). Les cookies du container
  // jetable ne suivent pas, c'est voulu.
  async promoteTemporary(tab, space) {
    if (!this.isTemporary(tab) || tab.closing) { return; }
    const target = this.containerByName(space.container);
    if (!target) { return; }
    const { TabStateFlusher } = ChromeUtils.importESModule(
      "resource:///modules/sessionstore/TabStateFlusher.sys.mjs");
    await TabStateFlusher.flush(tab.linkedBrowser);
    // L'état copié porte le container jetable et la marque de l'exécution. Les
    // laisser ferait revenir l'onglet dans un container supprimé au redémarrage
    // (docs/14, D2).
    const state = JSON.parse(this.SS.getTabState(tab));
    state.userContextId = target.userContextId;
    if (state.extData) { delete state.extData["nash-temp-run"]; }
    const copy = gBrowser.addTrustedTab(null, { userContextId: target.userContextId, skipLoad: true });
    this.SS.setTabState(copy, JSON.stringify(state));
    this.setTabValue(copy, "nash-space", space.id);
    this.switchSpace(space.id);
    gBrowser.selectedTab = copy;
    gBrowser.removeTab(tab, { skipPermitUnload: true, animate: false });
  },

  // Archive des onglets (docs/12-archivage.md). Rien n'est détruit : l'URL et le
  // titre sont écrits sur disque AVANT la fermeture, et un échec d'écriture laisse
  // l'onglet ouvert. Délais, plafonds et durées sont des choix de Nash.
  ARCHIVE_FILE: "nash-archive.json",
  ARCHIVE_DELAYS: [[12, "12 heures"], [24, "24 heures"], [168, "7 jours"], [720, "30 jours"]],
  ARCHIVE_DEFAULT_H: 12,
  ARCHIVE_RETENTION_DAYS: 90,
  ARCHIVE_SWEEP_MS: 5 * 60 * 1000,
  ARCHIVE_FIRST_SWEEP_MS: 60 * 1000,
  ARCHIVE_MAX_PER_SWEEP: 10,
  ARCHIVE_MENU_ITEMS: 15,
  _archiveCount: 0,

  get archivePath() { return PathUtils.join(PathUtils.profileDir, this.ARCHIVE_FILE); },

  async readArchive() {
    try {
      if (!(await IOUtils.exists(this.archivePath))) { return []; }
      const list = await IOUtils.readJSON(this.archivePath);
      return Array.isArray(list) ? list : [];
    } catch (error) {
      // Un fichier illisible n'est jamais écrasé en silence : on le met de côté.
      console.error("[Nash] archive illisible :", error);
      try { await IOUtils.move(this.archivePath, `${this.archivePath}.${Date.now()}.corrompu`); } catch {}
      return [];
    }
  },

  // Lecture, modification, écriture atomique. Les fenêtres partagent le fichier :
  // on relit à chaque fois plutôt que de garder une copie en mémoire.
  async updateArchive(change) {
    const limit = Date.now() - this.ARCHIVE_RETENTION_DAYS * 86400000;
    const list = change((await this.readArchive()).filter(entry => entry.archivedAt > limit));
    await IOUtils.writeJSON(this.archivePath, list);
    this.setArchiveCount(list.length);
    return list;
  },

  // Le fichier est commun à toutes les fenêtres : leur compteur aussi.
  setArchiveCount(count) {
    for (const win of BrowserWindowTracker.orderedWindows) {
      const nash = win.Nash;
      if (!nash?._dom || nash._destroyed) { continue; }
      nash._archiveCount = count;
      nash.renderSoon();
    }
  },

  // Adresse et titre d'un onglet. Un onglet restauré et pas encore chargé affiche
  // about:blank : son adresse n'existe que dans l'état SessionStore (docs/14, D1).
  tabAddress(tab) {
    const live = tab?.linkedBrowser?.currentURI?.spec;
    if (this.validURL(live)) { return { url: live, title: tab.label }; }
    try {
      const state = JSON.parse(this.SS.getTabState(tab));
      const entries = state.entries ?? [];
      const entry = entries[Math.max(0, (state.index ?? entries.length) - 1)];
      if (entry && this.validURL(entry.url)) { return { url: entry.url, title: entry.title || tab.label }; }
    } catch {}
    return null;
  },

  // L'archivage manuel peut viser l'onglet affiché ; l'automatique jamais.
  archivable(tab, manual = false) {
    // Un onglet d'une vue scindée n'est jamais archivé : la vue est une mise en page
    // voulue, et l'archiver la défaisait (docs/17, d).
    if (!tab || tab.closing || tab.pinned || tab.splitview || (!manual && tab.selected) || tab.attention ||
        tab.hasAttribute("sharing") || tab.soundPlaying ||
        this.tabValue(tab, "nash-tile") || this.tabValue(tab, "nash-kept")) { return false; }
    return !!this.tabAddress(tab);
  },

  async archiveTab(tab, motif) {
    const manual = motif === "manuel";
    if (this._destroyed || !this.archivable(tab, manual)) { return false; }
    const { url, title } = this.tabAddress(tab);
    const space = this.model.spaces.find(s => s.id === this.spaceForTab(tab)) ?? this.space;
    const entry = {
      id: this.newId(),
      url,
      titre: (title || url).slice(0, 200),
      espace: space.id,
      espaceNom: space.nom,
      container: this.CIS.getPublicIdentityFromId(tab.userContextId)?.name ?? null,
      archivedAt: Date.now(),
      lastActive: tab.lastAccessed,
      motif,
    };
    try {
      await this.updateArchive(list => [entry, ...list]);
    } catch (error) {
      console.error("[Nash] archivage impossible, l'onglet reste ouvert :", error);
      return false;
    }
    // L'onglet a pu changer pendant l'écriture (sélectionné, fermé par l'utilisateur).
    if (!this.archivable(tab, manual)) {
      // Sélectionné ou devenu protégé pendant l'écriture : on retire l'entrée,
      // sinon l'onglet serait à la fois ouvert et archivé.
      await this.updateArchive(list => list.filter(item => item.id !== entry.id));
      return false;
    }
    gBrowser.removeTab(tab);
    return true;
  },

  async sweepArchive() {
    if (this._destroyed || !this.model) { return; }
    let done = 0;
    for (const tab of [...gBrowser.tabs]) {
      if (done >= this.ARCHIVE_MAX_PER_SWEEP) { break; }
      const space = this.model.spaces.find(s => s.id === this.spaceForTab(tab));
      if (!space?.archiveH || !this.archivable(tab)) { continue; }
      if (Date.now() - tab.lastAccessed < space.archiveH * 3600000) { continue; }
      if (await this.archiveTab(tab, "auto")) { done++; }
    }
  },

  async archiveMenu(event) {
    // currentTarget est remis à null après l'événement : on garde l'ancre avant
    // l'attente de la lecture du fichier.
    const anchor = { type: event.type, screenX: event.screenX, screenY: event.screenY,
                     currentTarget: event.currentTarget };
    const list = await this.readArchive();
    this.setArchiveCount(list.length);
    const items = list.slice(0, this.ARCHIVE_MENU_ITEMS).map(entry => ({
      label: `${(entry.titre || entry.url).slice(0, 55)} · ${entry.espaceNom}${entry.motif === "auto" ? " (auto)" : ""}`,
      action: () => this.restoreArchived(entry),
    }));
    this.showMenu(items.length ? items : [{ label: "L’archive est vide", disabled: true, action() {} }], anchor);
  },

  async restoreArchived(entry) {
    const space = this.model.spaces.find(s => s.id === entry.espace) ?? this.space;
    this.ensureContainers();
    // Le container d'origine de l'onglet d'abord : sa session reste celle d'avant.
    const container = (entry.container && this.containerByName(entry.container)) ||
      this.containerByName(space.container);
    // Jamais le pot de cookies sans container si l'isolation échoue.
    if (!container || !this.validURL(entry.url)) { return; }
    this.switchSpace(space.id);
    const tab = gBrowser.addTab(entry.url, {
      userContextId: container.userContextId,
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
    this.setTabValue(tab, "nash-space", space.id);
    gBrowser.selectedTab = tab;
    await this.updateArchive(list => list.filter(item => item.id !== entry.id));
  },

  installArchive() {
    this.readArchive().then(list => { this._archiveCount = list.length; this.renderSoon(); });
    this._archiveTimers = [
      window.setTimeout(() => this.sweepArchive(), this.ARCHIVE_FIRST_SWEEP_MS),
      window.setInterval(() => this.sweepArchive(), this.ARCHIVE_SWEEP_MS),
    ];
  },

  removeArchive() {
    for (const timer of this._archiveTimers ?? []) {
      window.clearTimeout(timer);
      window.clearInterval(timer);
    }
    this._archiveTimers = null;
  },

  // Défilement horizontal (trackpad) sur la colonne : espace précédent ou suivant,
  // sans bouclage. Seuil et délais choisis par Nash, à ajuster à l'usage.
  SWIPE_PX: 60,
  SWIPE_SETTLE_MS: 200,
  // A wheel or a horizontal mouse wheel reports lines, not pixels: one notch is
  // a few lines, which must count as a deliberate gesture.
  SWIPE_LINE_PX: 16,

  installSpaceSwipe() {
    const host = document.getElementById("vertical-tabs");
    if (!host) { return; }
    let accumulated = 0;
    let locked = false;
    let settle = 0;
    this.listen(host, "wheel", event => {
      if (!event.isTrusted || event.ctrlKey || event.metaKey ||
          Math.abs(event.deltaX) <= Math.abs(event.deltaY)) { return; }
      // Sur la barre des espaces qui déborde, le geste la fait défiler.
      const bar = event.target.closest?.("#nash-spaces");
      if (bar && bar.scrollWidth > bar.clientWidth) { return; }
      event.preventDefault();
      // L'inertie du trackpad prolonge le geste : on ne bascule qu'une fois, puis
      // on attend que les événements s'arrêtent avant d'accepter un nouveau geste.
      window.clearTimeout(settle);
      settle = window.setTimeout(() => { locked = false; accumulated = 0; }, this.SWIPE_SETTLE_MS);
      if (locked) { return; }
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? this.SWIPE_LINE_PX
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? host.clientWidth : 1;
      accumulated += event.deltaX * unit;
      if (Math.abs(accumulated) < this.SWIPE_PX) { return; }
      const spaces = this.model.spaces;
      const index = spaces.findIndex(space => space.id === this.currentSpaceId);
      const next = spaces[index + Math.sign(accumulated)];
      accumulated = 0;
      if (next) {
        locked = true;
        this.switchSpace(next.id);
      }
    }, { passive: false });
  },

  // La colonne native peut être étroite sans que Firefox le dise par un attribut
  // fiable (réglage invalide, déplier au survol replié). On mesure la largeur
  // plutôt que de deviner l'état, et on masque les grilles sous le seuil.
  NARROW_PX: 120,

  installNarrow() {
    const target = document.getElementById("sidebar-main") ??
      document.getElementById("vertical-tabs");
    if (!target || typeof ResizeObserver === "undefined") { return; }
    const root = document.documentElement;
    this._narrow = new ResizeObserver(entries => {
      const width = entries.at(-1).contentRect.width;
      // Largeur nulle : pas encore mise en page, on ne conclut rien.
      if (width > 0) { root.toggleAttribute("nash-narrow", width < this.NARROW_PX); }
    });
    this._narrow.observe(target);
  },

  removeNarrow() {
    this._narrow?.disconnect();
    this._narrow = null;
    document.documentElement.removeAttribute("nash-narrow");
  },

  // Sidebar masquée, révélée au bord gauche (voir docs/11-sidebar-masquee.md).
  // Désactivé par défaut : pref nash.sidebar.peek. Ne fait rien hors du mode
  // « hide-sidebar » de Firefox. Non testé en exécution.
  PEEK_PREF: "nash.sidebar.peek",

  // Au premier démarrage, Firefox enregistre « always-show » comme choix de
  // l'utilisateur (SidebarManager). Nash applique une fois son propre défaut,
  // le mode masqué ; « Fixer » ou un réglage manuel reste ensuite respecté.
  applySidebarDefault() {
    if (Services.prefs.getBoolPref("nash.sidebar.defaultApplied", false)) { return; }
    Services.prefs.setBoolPref("nash.sidebar.defaultApplied", true);
    Services.prefs.setCharPref("sidebar.visibility", "hide-sidebar");
  },
  PEEK_SHOW_MS: 150,
  PEEK_HIDE_MS: 350,

  peekEnabled() {
    return Services.prefs.getBoolPref(this.PEEK_PREF, false) &&
      Services.prefs.getCharPref("sidebar.visibility", "always-show") === "hide-sidebar";
  },

  installPeek() {
    const host = document.getElementById("browser") ?? document.documentElement;
    const edge = this.node("div");
    edge.id = "nash-edge";
    edge.setAttribute("aria-hidden", "true");
    host.append(edge);
    this._peek = { edge, peeking: false, showTimer: 0, hideTimer: 0 };
    this._peekObserver = { observe: () => this.refreshPeek() };
    Services.prefs.addObserver(this.PEEK_PREF, this._peekObserver);
    Services.prefs.addObserver("sidebar.visibility", this._peekObserver);
    this.listen(edge, "mouseenter", () => {
      window.clearTimeout(this._peek.hideTimer);
      window.clearTimeout(this._peek.showTimer);
      this._peek.showTimer = window.setTimeout(() => this.showPeek(), this.PEEK_SHOW_MS);
    });
    // The strip sits above the column's first pixels: a pointer that leaves it
    // without crossing the column never fires the column's mouseleave. Entering
    // the column cancels this hide.
    this.listen(edge, "mouseleave", () => {
      window.clearTimeout(this._peek.showTimer);
      this.scheduleHidePeek();
    });
    const container = window.SidebarController?.sidebarContainer;
    if (container) {
      this.listen(container, "mouseenter", () => window.clearTimeout(this._peek.hideTimer));
      this.listen(container, "mouseleave", () => this.scheduleHidePeek());
    }
    this.listen(window, "keydown", event => {
      if (event.key === "Escape" && this._peek.peeking) { this.hidePeek(); }
    });
    this.refreshPeek();
  },

  refreshPeek() {
    if (!this._peek) { return; }
    const on = this.peekEnabled();
    this._peek.edge.toggleAttribute("active", on);
    if (!on && this._peek.peeking) { this.hidePeek(); }
    this.updateToggle();
  },

  popupOpen() {
    return [...document.querySelectorAll("menupopup, panel")].some(p => p.state === "open");
  },

  showPeek() {
    const sidebar = window.SidebarController;
    if (!this._peek || this._peek.peeking || !this.peekEnabled() || !sidebar?._state ||
        sidebar._state.launcherVisible) { return; }
    this._peek.peeking = true;
    document.documentElement.setAttribute("nash-peek", "");
    sidebar.sidebarContainer.setAttribute("nash-float", "");
    sidebar.launcherSplitter?.setAttribute("nash-float", "");
    sidebar._state.updateVisibility(true);
    this.updateToggle();
  },

  scheduleHidePeek() {
    if (!this._peek?.peeking) { return; }
    window.clearTimeout(this._peek.hideTimer);
    this._peek.hideTimer = window.setTimeout(() => {
      // Un menu ouvert depuis la colonne ne doit pas la faire disparaître.
      if (this.popupOpen()) { this.scheduleHidePeek(); } else { this.hidePeek(); }
    }, this.PEEK_HIDE_MS);
  },

  clearPeekMarks() {
    const sidebar = window.SidebarController;
    document.documentElement.removeAttribute("nash-peek");
    sidebar?.sidebarContainer?.removeAttribute("nash-float");
    sidebar?.launcherSplitter?.removeAttribute("nash-float");
  },

  hidePeek() {
    if (!this._peek?.peeking) { return; }
    window.clearTimeout(this._peek.hideTimer);
    this._peek.peeking = false;
    this.clearPeekMarks();
    window.SidebarController?._state?.updateVisibility(false);
    this.updateToggle();
  },

  // Verrouiller : la colonne redevient ancrée, via le réglage natif de Firefox.
  lockPeek() {
    if (!this._peek?.peeking) { return; }
    this._peek.peeking = false;
    this.clearPeekMarks();
    Services.prefs.setCharPref("sidebar.visibility", "always-show");
    this.updateToggle();
  },

  removePeek() {
    if (!this._peek) { return; }
    window.clearTimeout(this._peek.showTimer);
    window.clearTimeout(this._peek.hideTimer);
    if (this._peek.peeking) { this.hidePeek(); }
    Services.prefs.removeObserver(this.PEEK_PREF, this._peekObserver);
    Services.prefs.removeObserver("sidebar.visibility", this._peekObserver);
    this._peek.edge.remove();
    this._peek = null;
  },

  // Niveau 0 (docs/arc/sidebar.md) : en tête de colonne, le bouton qui fixe ou
  // masque la colonne, la navigation de l'onglet affiché et son adresse. Les
  // boutons passent par les commandes de Firefox et recopient leur état.
  NAV_LABELS: { Back: "Page précédente", Forward: "Page suivante", Reload: "Recharger la page" },
  BLANK_PAGES: ["about:blank", "about:newtab", "about:home"],

  installTop() {
    const top = this.node("div");
    top.id = "nash-top";
    const toggle = this.button("nash-nav nash-toggle", "", "", () => this.toggleDock());
    const nav = ["Back", "Forward", "Reload"].map(name => {
      const command = document.getElementById(`Browser:${name}`);
      return [command, this.button(`nash-nav nash-${name.toLowerCase()}`, "", this.NAV_LABELS[name],
        () => command?.doCommand())];
    });
    const row = this.node("div", "nash-nav-row");
    row.append(toggle, this.node("span", "nash-nav-spacer"), ...nav.map(([, button]) => button));
    // openLocation() est le geste de Cmd+L : focus, sélection et liste de suggestions.
    const address = this.button("nash-address", "", "Saisir une adresse ou rechercher",
      event => openLocation(event));
    address.append(this.node("span", "nash-address-text"));
    top.append(row, address);
    // Hors de la bande : render() la vide à chaque rendu.
    this._dom.strip.before(top);
    const sync = () => nav.forEach(([command, button]) => {
      button.disabled = !command || command.hasAttribute("disabled");
    });
    const observer = new MutationObserver(sync);
    for (const [command] of nav) {
      if (command) { observer.observe(command, { attributes: true, attributeFilter: ["disabled"] }); }
    }
    // Le listener doit rester référencé : tabbrowser n'en garde qu'une référence faible.
    const progress = {
      onLocationChange: () => this.updateAddress(),
      QueryInterface: ChromeUtils.generateQI(["nsIWebProgressListener", "nsISupportsWeakReference"]),
    };
    gBrowser.addProgressListener(progress);
    this.listen(gBrowser.tabContainer, "TabSelect", () => this.updateAddress());
    this._top = { top, row, toggle, address, observer, progress };
    sync();
    this.updateAddress();
    this.updateToggle();
  },

  // L'adresse se résume au domaine, comme dans la colonne d'Arc. La barre
  // d'adresse complète s'ouvre au clic.
  updateAddress() {
    if (!this._top) { return; }
    const uri = gBrowser.currentURI;
    let text = "";
    if (uri && !this.BLANK_PAGES.includes(uri.spec)) {
      try {
        text = ["http", "https"].includes(uri.scheme) ? uri.host.replace(/^www\./, "") : uri.spec;
      } catch {
        text = uri.spec;
      }
    }
    const label = this._top.address.firstChild;
    label.textContent = text || "Rechercher ou saisir une adresse";
    this._top.address.toggleAttribute("data-empty", !text);
    this._top.address.title = text ? uri.spec : "Saisir une adresse ou rechercher";
  },

  // Révélée, la colonne se fixe ; fixée, elle se masque et revient au survol.
  toggleDock() {
    if (this._peek?.peeking) {
      this.lockPeek();
    } else if (!Services.prefs.getBoolPref(this.PEEK_PREF, false) &&
               document.documentElement.hasAttribute("nash-toolbarless")) {
      // Sans révélation au bord ni barre d'outils, la colonne masquée serait
      // impossible à rouvrir.
      return;
    } else {
      Services.prefs.setCharPref("sidebar.visibility", "hide-sidebar");
    }
  },

  updateToggle() {
    if (!this._top) { return; }
    const label = this._peek?.peeking ? "Fixer la barre latérale" : "Masquer la barre latérale";
    this._top.toggle.title = label;
    this._top.toggle.setAttribute("aria-label", label);
  },

  // Sans barre d'outils (docs/11) : la page occupe la fenêtre. Les boutons de
  // fenêtre de macOS suivent leur emplacement dans le document ; placés en tête de
  // colonne, ils disparaissent avec elle quand elle est masquée. La barre
  // d'adresse de Firefox reste dans le document et ne s'affiche, au-dessus de
  // la page, que pendant la saisie.
  TOOLBAR_PREF: "nash.toolbar.hidden",

  installToolbar() {
    const box = document.querySelector("#nav-bar > .titlebar-buttonbox-container");
    this._toolbar = {
      box, home: box?.parentNode, next: box?.nextSibling,
      observer: { observe: () => this.refreshToolbar() },
    };
    Services.prefs.addObserver(this.TOOLBAR_PREF, this._toolbar.observer);
    this.refreshToolbar();
  },

  refreshToolbar() {
    if (!this._toolbar || !this._top) { return; }
    const on = Services.prefs.getBoolPref(this.TOOLBAR_PREF, true);
    document.documentElement.toggleAttribute("nash-toolbarless", on);
    const { box, home, next } = this._toolbar;
    if (!box) { return; }
    if (on) {
      this._top.row.prepend(box);
    } else if (box.parentNode !== home) {
      home.insertBefore(box, next?.parentNode === home ? next : null);
    }
  },

  removeToolbar() {
    if (!this._toolbar) { return; }
    Services.prefs.removeObserver(this.TOOLBAR_PREF, this._toolbar.observer);
    const { box, home, next } = this._toolbar;
    if (box && box.parentNode !== home) { home.insertBefore(box, next?.parentNode === home ? next : null); }
    document.documentElement.removeAttribute("nash-toolbarless");
    this._toolbar = null;
  },

  removeTop() {
    if (!this._top) { return; }
    this._top.observer.disconnect();
    gBrowser.removeProgressListener(this._top.progress);
    this._top.top.remove();
    this._top = null;
  },

  buildDOM() {
    const host = document.getElementById("vertical-tabs");
    if (!host) { throw new Error("#vertical-tabs introuvable"); }
    const strip = this.node("div");
    strip.id = "nash-strip";
    const switcher = this.node("div");
    switcher.id = "nash-spaces";
    switcher.setAttribute("role", "group");
    switcher.setAttribute("aria-label", "Espaces");
    const popup = document.createXULElement("menupopup");
    popup.id = "nash-menu";
    document.getElementById("mainPopupSet").append(popup);
    host.prepend(strip);
    host.append(switcher);
    this._dom = { strip, switcher, popup };
    this.installTabMenu();
  },
  renderSoon() {
    if (this._pending || this._destroyed) { return; }
    this._pending = true;
    Services.tm.dispatchToMainThread(() => {
      this._pending = false;
      if (!this._destroyed) { this.syncTabs(); this.render(); }
    });
  },
  render() {
    if (!this._dom) { return; }
    const { strip, switcher } = this._dom;
    // _form belongs to the key: opening the space form changes neither the
    // model nor the tiles, so without it the memoised render returns early and
    // the form is never drawn.
    const renderKey = JSON.stringify([this.currentSpaceId, this.model, this._form, this._archiveCount,
      this.space.gardes.map(entry => {
        const tab = this.keptTab(entry);
        return [tab?.label, tab?.image, !!tab && tab === gBrowser.selectedTab];
      }),
      this.visibleTiles.map(tile => {
        const instance = this.findInstance(tile);
        return [!!instance, instance === gBrowser.selectedTab, instance?.image];
      })]);
    if (renderKey === this._renderKey) { return; }
    this._renderKey = renderKey;
    const focus = document.activeElement?.dataset?.nashFocus;
    const scroll = strip.scrollTop;
    document.documentElement.style.setProperty("--nash-accent", this.space.teinte);
    strip.replaceChildren(
      ...(this._form ? [this.spaceFormNode()] : []),
      this.tileGrid()
    );
    strip.append(this.spaceHeader(), ...(this.space.replie ? [] : [this.keptNode()]),
      this.clearRow());
    // Barre du bas : l'archive à gauche, les espaces, puis + à droite.
    const archive = this.button("nash-space nash-archive", "▤",
      `Archive : ${this._archiveCount ?? 0} onglet(s)`, event => this.archiveMenu(event));
    archive.dataset.nashFocus = "space:archive";
    switcher.replaceChildren(archive);
    for (const space of this.model.spaces) {
      const button = this.button("nash-space", "", `${space.nom} — ${space.container}`, () => this.switchSpace(space.id));
      button.dataset.nashFocus = `space:${space.id}`;
      button.style.setProperty("--space-tint", space.teinte);
      if (space.id === this.currentSpaceId) { button.setAttribute("aria-current", "true"); }
      button.append(this.node("span", "nash-space-symbol", space.emoji), this.node("span", "nash-space-name", space.nom));
      button.addEventListener("contextmenu", e => { e.preventDefault(); this.spaceMenu(space, e); });
      button.addEventListener("keydown", e => {
        if ((e.shiftKey && e.key === "F10") || e.key === "ContextMenu") {
          e.preventDefault(); this.spaceMenu(space, e);
        }
      });
      switcher.append(button);
    }
    const add = this.button("nash-space nash-space-add", "+", "Créer un espace", () => this.createSpace());
    add.dataset.nashFocus = "space:add";
    switcher.append(add);

    strip.scrollTop = scroll;
    if (focus) {
      [...strip.querySelectorAll("[data-nash-focus]"), ...switcher.querySelectorAll("[data-nash-focus]")]
        .find(el => el.dataset.nashFocus === focus)?.focus({ preventScroll: true });
    }
  },
  // What a drop carries: one of our tiles being reordered, a Firefox tab being
  // promoted, or a plain link. Reading is deliberately tolerant — a drop that
  // yields no usable URL is simply ignored rather than reported as an error.
  dropPayload(event) {
    if (this._drag?.kind === "tile") { return { kind: "tile" }; }
    const data = event.dataTransfer;
    try {
      const tab = data.mozGetDataAt("application/x-moz-tabbrowser-tab", 0);
      const url = tab?.linkedBrowser?.currentURI?.spec;
      if (this.validURL(url)) { return { kind: "tab", url, nom: tab.label, tab }; }
    } catch {}
    const raw = data.getData("text/x-moz-url") || data.getData("text/uri-list") ||
                data.getData("text/plain");
    const [url, title] = (raw || "").split("\n");
    if (this.validURL(url?.trim())) {
      return { kind: "lien", url: url.trim(), nom: (title || "").trim() };
    }
    return null;
  },

  dropAccepted(event) {
    const types = event.dataTransfer.types;
    return this._drag?.kind === "tile" ||
      types.includes("application/x-moz-tabbrowser-tab") ||
      types.includes("text/x-moz-url") || types.includes("text/uri-list");
  },

  // Promote a tab or a link into a tile. A dropped tab is adopted rather than
  // duplicated: it becomes the tile's live instance, exactly as in addCurrentTile.
  adoptDrop(payload, tiles, scope, index) {
    if (tiles.some(t => t.url === payload.url)) {
      this.notify("Cette page est déjà dans cette section."); return;
    }
    const tile = {
      id: this.newId(), url: payload.url,
      nom: payload.nom?.trim() || new URL(payload.url).hostname,
      identite: null, premierContainer: this.space.container,
    };
    tiles.splice(Math.max(0, Math.min(index, tiles.length)), 0, tile);
    const tab = payload.tab;
    if (tab && !this.tabValue(tab, "nash-tile") &&
        tab.userContextId === this.containerFor(tile).id) {
      this.setTabValue(tab, "nash-tile", tile.id);
      this.setTabValue(tab, "nash-space", this.currentSpaceId);
      gBrowser.pinTab(tab);
    }
    this.saveModel();
    this.renderSoon();
  },

  // One grid per space (D14): the tiles shown everywhere come first, then the
  // space's own, with no section titles. The model keeps the two lists.
  tileGrid() {
    const local = this.space.tiles;
    const wrap = this.node("section", "nash-section");
    wrap.setAttribute("aria-label", `Tuiles de ${this.space.nom}`);
    const grid = this.node("div", "nash-grid");
    this.model.global.forEach(tile => grid.append(this.tileNode(tile, "globale")));
    local.forEach(tile => grid.append(this.tileNode(tile, "locale")));
    const add = this.button("nash-tile nash-add", "+", "Ajouter l’onglet actuel aux tuiles", () => this.addCurrentTile("locale"));
    add.dataset.nashFocus = "add:locale";
    grid.append(add);
    // An empty grid must invite, not look broken: it is the first thing a new
    // user sees, and D10 makes that state the default.
    if (!this.visibleTiles.length) {
      grid.append(this.node("div", "nash-hint", "Fais glisser un onglet ici pour en faire une tuile"));
    }
    // A drop lands next to the tile it is dropped on; a new tile always joins
    // the space's own list.
    const dropTarget = event => {
      const id = event.target.closest("[data-tile-id]")?.dataset.tileId;
      const tile = id && this.allTiles.find(t => t.id === id);
      const tiles = tile ? this.collection(tile) : null;
      return { tiles, index: tiles ? tiles.indexOf(tile) : -1 };
    };
    grid.addEventListener("dragover", event => {
      if (!this.dropAccepted(event)) { return; }
      event.preventDefault();
      event.dataTransfer.dropEffect = this._drag?.kind === "tile" ? "move" : "link";
      grid.toggleAttribute("data-drop", true);
    });
    for (const name of ["dragleave", "dragend", "drop"]) {
      grid.addEventListener(name, () => grid.removeAttribute("data-drop"));
    }
    grid.addEventListener("drop", event => {
      const payload = this.dropPayload(event);
      if (!payload) { return; }
      event.preventDefault();
      event.stopPropagation();
      const target = dropTarget(event);
      if (payload.kind === "tile") {
        const tile = this.allTiles.find(t => t.id === this._drag.id);
        this._drag = null;
        if (!tile) { return; }
        // Reordering never changes scope: « partout » is chosen from the menu.
        const own = this.collection(tile);
        const index = target.tiles === own ? target.index
          : target.tiles === this.model.global ? 0 : own.length;
        this.moveTile(tile, own, index);
        return;
      }
      const index = target.tiles === local ? target.index : local.length;
      this.adoptDrop(payload, local, "locale", index);
    });
    wrap.append(grid);
    return wrap;
  },
  monogram(tile) {
    const node = this.node("span", "nash-icon nash-mono", (tile.nom.trim()[0] || "?").toUpperCase());
    let hash = 0;
    for (const c of this.origin(tile.url)) { hash = (hash * 31 + c.charCodeAt(0)) >>> 0; }
    node.style.setProperty("--mono-color", this.TINTS[hash % this.TINTS.length]);
    return node;
  },
  iconNode(tile, instance) {
    const live = instance?.image;
    if (this.safeIcon(live) && live !== tile.icone) {
      tile.icone = live;
      // Keep model writes out of synchronous render and coalesce favicon updates.
      if (!this._iconSavePending) {
        this._iconSavePending = true;
        Services.tm.dispatchToMainThread(() => {
          this._iconSavePending = false;
          if (!this._destroyed) { this.saveModel(); }
        });
      }
    }
    const src = tile.iconeManuelle || (this.safeIcon(live) ? live : tile.icone);
    if (!this.safeIcon(src)) { return this.monogram(tile); }
    const image = this.node("img", "nash-icon");
    image.src = src;
    image.alt = "";
    image.addEventListener("error", () => image.replaceWith(this.monogram(tile)), { once: true });
    return image;
  },
  tileNode(tile, scope) {
    const { name } = this.containerFor(tile);
    const instance = this.findInstance(tile);
    // Sibling buttons: avoid nested interactive elements and keep keyboard access.
    const wrapper = this.node("div", "nash-tile-wrap");
    wrapper.dataset.tileId = tile.id;
    wrapper.draggable = true;
    wrapper.addEventListener("dragstart", event => {
      this._drag = { kind: "tile", id: tile.id };
      event.dataTransfer.setData("application/x-nash-tile", tile.id);
      event.dataTransfer.effectAllowed = "move";
    });
    wrapper.addEventListener("dragend", () => { this._drag = null; });
    const button = this.button("nash-tile", "", `${tile.nom} — ${name}${tile.identite?.fixee ? " (session fixée)" : ""}${scope === "globale" ? " · dans tous les espaces" : ""}`,
      () => this.openTile(tile));
    button.dataset.nashFocus = `tile:${tile.id}`;
    button.toggleAttribute("data-open", !!instance);
    button.toggleAttribute("data-current", !!instance && instance === gBrowser.selectedTab);
    button.toggleAttribute("data-global", scope === "globale");
    const badge = this.node("span", "nash-badge", name);
    badge.toggleAttribute("data-fixee", !!tile.identite?.fixee);
    button.append(this.iconNode(tile, instance), badge);
    const menu = this.button("nash-scope", "···", `Actions pour ${tile.nom}`, event => this.tileMenu(tile, event));
    menu.dataset.nashFocus = `menu:${tile.id}`;
    wrapper.addEventListener("contextmenu", e => { e.preventDefault(); this.tileMenu(tile, e); });
    wrapper.append(button, menu);
    return wrapper;
  },
  showMenu(items, event) {
    const popup = this._dom.popup;
    popup.replaceChildren();
    for (const item of items) {
      const node = document.createXULElement(item ? "menuitem" : "menuseparator");
      if (item) {
        node.setAttribute("label", item.label);
        if (item.disabled) { node.setAttribute("disabled", "true"); }
        node.addEventListener("command", item.action);
      }
      popup.append(node);
    }
    if (event.type === "contextmenu" && event.screenX) {
      popup.openPopupAtScreen(event.screenX, event.screenY, true);
    } else {
      popup.openPopup(event.currentTarget, "after_start", 0, 0, false, false);
    }
  },
  tileMenu(tile, event) {
    const list = this.collection(tile);
    const index = list.indexOf(tile);
    const global = list === this.model.global;
    this.showMenu([
      { label: global ? "Garder dans cet espace" : "Épingler partout", action: () => this.toggleScope(tile) },
      { label: "Renommer…", action: () => this.renameTile(tile) },
      { label: "Choisir une icône locale…", action: () => this.chooseIcon(tile) },
      { label: "Rétablir l’icône du site", disabled: !tile.iconeManuelle, action: () => {
        delete tile.iconeManuelle; this.saveModel(); this.render();
      }},
      null,
      { label: "Déplacer avant", disabled: index === 0, action: () => this.moveTile(tile, list, index - 1) },
      { label: "Déplacer après", disabled: index === list.length - 1, action: () => this.moveTile(tile, list, index + 2) },
      null,
      { label: "Revenir à l’adresse de la tuile", action: () => {
        const tab = this.openTile(tile);
        if (tab) { tab.linkedBrowser.loadURI(Services.io.newURI(tile.url), {
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        }); }
      }},
      { label: "Retirer la tuile (conserver les onglets)", action: () => this.removeTile(tile) },
    ], event);
  },
  spaceMenu(space, event) {
    this.showMenu([
      { label: "Renommer l’espace…", action: () => this.renameSpace(space) },
      { label: "Supprimer l’espace…", disabled: this.model.spaces.length < 2,
        action: () => this.deleteSpace(space) },
      null,
      ...this.TINTS.map((tint, index) => ({
        label: ["Bleu ardoise", "Lavande", "Sauge", "Argile", "Azur", "Rose"][index],
        action: () => { space.teinte = tint; this.saveModel(); this.render(); },
      })),
      null,
      ...this.ARCHIVE_DELAYS.map(([hours, label]) => ({
        label: `${space.archiveH === hours ? "✓ " : ""}Archiver après ${label}`,
        action: () => { space.archiveH = hours; this.saveModel(); this.render(); },
      })),
    ], event);
  },
};

// R4: never mount or move chrome before load and delayed startup.
window.addEventListener("load", () => Nash.init(), { once: true });
