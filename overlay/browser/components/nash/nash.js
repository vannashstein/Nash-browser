/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** Nash owns the sidebar and its model; Gecko owns tabs, containers and sessions. */
var Nash = {
  version: "0.3",
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
      await delayedStartupPromise;
      await this.SS.promiseAllWindowsRestored;
      if (window.closed) {
        return;
      }
      this.loadModel();
      this.ensureContainers();
      const restored = this.SS.getCustomWindowValue(window, "nash-space");
      this.currentSpaceId = this.model.spaces.find(s => s.id === restored)?.id
        ?? this.model.spaces[0].id;
      this.buildDOM();
      this.installTabRouting();
      for (const tab of [...gBrowser.tabs]) {
        // A fresh Firefox startup tab predates our adapter. Replace only an empty
        // uncontained tab; never reload a user's page or move its cookies.
        const uri = tab.linkedBrowser?.currentURI?.spec;
        if (!tab.pinned && !tab.userContextId && ["about:blank", "about:newtab"].includes(uri) &&
            !tab.linkedBrowser.canGoBack && !tab.linkedBrowser.canGoForward) {
          const replacement = gBrowser.addTrustedTab(uri, { userContextId: this.containerFor({}).id });
          this.assignTab(replacement);
          if (gBrowser.selectedTab === tab) { gBrowser.selectedTab = replacement; }
          gBrowser.removeTab(tab, { skipPermitUnload: true, animate: false });
        } else {
          this.assignTab(tab);
        }
      }
      for (const name of ["TabOpen", "TabClose", "TabSelect", "TabAttrModified",
                          "TabPinned", "TabUnpinned", "SSTabRestoring", "SSTabRestored"]) {
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
        this.syncTabs();
        this.render();
      }};
      Services.prefs.addObserver(this.PREF_MODEL, this._observer);
      this.installPeek();
      this.installNarrow();
      this.installSpaceSwipe();
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
    this.removeNarrow();
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
    if (event.type === "TabSelect" && !this._switching) {
      const tile = this.allTiles.find(t => t.id === this.tabValue(tab, "nash-tile"));
      const shared = tile?.identite?.fixee && this.model.global.includes(tile);
      const id = this.spaceForTab(tab);
      if (!shared && id !== this.currentSpaceId) {
        this.currentSpaceId = id;
        this.SS.setCustomWindowValue(window, "nash-space", id);
      }
      this._lastTabs.set(this.currentSpaceId, tab);
    }
    this.renderSoon();
  },

  // Partie 3 — les pages gardees. Ce sont de vrais onglets, remontes au-dessus
  // de la liste parce qu'on ne veut pas perdre la page. Distinctes des tuiles :
  // une tuile designe un site, une page gardee designe ce contenu-la.
  get keptTabs() {
    return gBrowser.tabs.filter(tab =>
      !tab.closing &&
      this.tabValue(tab, "nash-kept") &&
      !this.tabValue(tab, "nash-tile") &&
      this.spaceForTab(tab) === this.currentSpaceId);
  },

  toggleKept(tab) {
    // Une instance de tuile n'a rien a faire ici : elle a deja sa place.
    if (!tab || tab.closing || this.tabValue(tab, "nash-tile")) { return; }
    if (this.tabValue(tab, "nash-kept")) {
      this.clearTabValue(tab, "nash-kept");
      gBrowser.unpinTab(tab);
    } else {
      this.setTabValue(tab, "nash-kept", "1");
      this.setTabValue(tab, "nash-space", this.currentSpaceId);
      gBrowser.pinTab(tab);
    }
    this.renderSoon();
  },

  keptNode() {
    const wrap = this.node("section", "nash-kept");
    wrap.setAttribute("aria-label", "Pages gardées");
    const list = this.node("div", "nash-kept-list");
    const tabs = this.keptTabs;

    for (const tab of tabs) {
      const row = this.node("div", "nash-kept-row");
      if (tab === gBrowser.selectedTab) { row.setAttribute("aria-current", "true"); }

      const open = this.button("nash-kept-open", "", tab.label || "Sans titre",
        () => { gBrowser.selectedTab = tab; });
      open.dataset.nashFocus = `kept:${tab.permanentKey ? "" : ""}${tabs.indexOf(tab)}`;
      const icon = this.node("span", "nash-kept-icon");
      if (this.safeIcon(tab.image)) {
        const img = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
        img.src = tab.image;
        img.alt = "";
        icon.append(img);
      } else {
        icon.textContent = (tab.label || "?").trim().charAt(0).toUpperCase();
        icon.classList.add("nash-kept-mono");
      }
      open.append(icon, this.node("span", "nash-kept-label", tab.label || "Sans titre"));

      const off = this.button("nash-kept-off", "", "Redescendre dans les onglets",
        () => this.toggleKept(tab));
      row.append(open, off);
      list.append(row);
    }

    if (!tabs.length) {
      list.append(this.node("div", "nash-kept-empty",
        "Remonte ici une page que tu ne veux pas perdre"));
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

    wrap.append(list, this.node("div", "nash-kept-rule"));
    return wrap;
  },

  // Un onglet lâché est gardé tel quel. Un lien lâché rejoint l'onglet qui
  // l'affiche déjà, sinon Nash en ouvre un : on ne garde jamais une page
  // qu'on ne pourrait pas rouvrir.
  keepFromDrop(payload) {
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
    if (this.tabValue(tab, "nash-kept")) { this.renderSoon(); return; }
    this.toggleKept(tab);
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
    menu.prepend(item, separator);

    this.listen(menu, "popupshowing", () => {
      const tab = window.TabContextMenu?.contextTab ?? gBrowser.selectedTab;
      const tile = tab && this.tabValue(tab, "nash-tile");
      item.hidden = !tab || !!tile;
      separator.hidden = item.hidden;
      item.label = tab && this.tabValue(tab, "nash-kept")
        ? "Redescendre dans les onglets"
        : "Garder dans cet espace";
    });
  },

  availableInSpace(tab) {
    if (tab.closing) { return false; }
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
    this.model.spaces.push({ id, nom, emoji: "◉", container, teinte: form.teinte, tiles: [] });
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
  // Défilement horizontal (trackpad) sur la colonne : espace précédent ou suivant,
  // sans bouclage. Seuil et délais choisis par Nash, à ajuster à l'usage.
  SWIPE_PX: 60,
  SWIPE_SETTLE_MS: 200,

  installSpaceSwipe() {
    const host = document.getElementById("vertical-tabs");
    if (!host) { return; }
    let accumulated = 0;
    let locked = false;
    let settle = 0;
    this.listen(host, "wheel", event => {
      if (!event.isTrusted || event.ctrlKey || event.metaKey ||
          Math.abs(event.deltaX) <= Math.abs(event.deltaY)) { return; }
      event.preventDefault();
      // L'inertie du trackpad prolonge le geste : on ne bascule qu'une fois, puis
      // on attend que les événements s'arrêtent avant d'accepter un nouveau geste.
      window.clearTimeout(settle);
      settle = window.setTimeout(() => { locked = false; accumulated = 0; }, this.SWIPE_SETTLE_MS);
      if (locked) { return; }
      accumulated += event.deltaX;
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
    const lock = this.button("nash-lock", "Fixer", "Fixer la barre latérale", () => this.lockPeek());
    // Hors de la bande : render() la vide à chaque rendu.
    this._dom.strip.before(lock);
    this._peek = { edge, lock, peeking: false, showTimer: 0, hideTimer: 0 };
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
  },

  // Verrouiller : la colonne redevient ancrée, via le réglage natif de Firefox.
  lockPeek() {
    if (!this._peek?.peeking) { return; }
    this._peek.peeking = false;
    this.clearPeekMarks();
    Services.prefs.setCharPref("sidebar.visibility", "always-show");
  },

  removePeek() {
    if (!this._peek) { return; }
    window.clearTimeout(this._peek.showTimer);
    window.clearTimeout(this._peek.hideTimer);
    if (this._peek.peeking) { this.hidePeek(); }
    Services.prefs.removeObserver(this.PEEK_PREF, this._peekObserver);
    Services.prefs.removeObserver("sidebar.visibility", this._peekObserver);
    this._peek.edge.remove();
    this._peek.lock.remove();
    this._peek = null;
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
    const renderKey = JSON.stringify([this.currentSpaceId, this.model, this._form,
      this.keptTabs.map(tab => [tab.label, tab.image, tab === gBrowser.selectedTab]),
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
      this.section("Partout", this.model.global, "globale", `${this.model.global.length}`),
      this.section(this.space.nom, this.space.tiles, "locale", `${this.space.tiles.length}`)
    );
    const heading = this.node("div", "nash-context");
    heading.append(this.node("span", "nash-context-name", `${this.space.emoji}  ${this.space.nom}`),
      this.node("span", "nash-context-badge", this.space.container));
    heading.title = `Les nouveaux onglets utilisent le container « ${this.space.container} »`;
    strip.append(heading, this.keptNode());
    switcher.replaceChildren();
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

  section(title, tiles, scope, count) {
    const wrap = this.node("section", "nash-section");
    wrap.dataset.scope = scope;
    wrap.setAttribute("aria-label", title);
    const label = this.node("div", "nash-label");
    label.append(this.node("span", "", title), this.node("b", "", count));
    const grid = this.node("div", "nash-grid");
    tiles.forEach(tile => grid.append(this.tileNode(tile, scope)));
    // An empty grid must invite, not look broken: it is the first thing a new
    // user sees, and D10 makes that state the default.
    if (!tiles.length) {
      grid.append(this.node("div", "nash-empty",
        scope === "globale"
          ? "Dépose ici les sites que tu veux dans tous les espaces"
          : "Fais glisser un onglet ici pour en faire une tuile"));
    }
    const add = this.button("nash-tile nash-add", "+", "Ajouter l’onglet actuel à cette section", () => this.addCurrentTile(scope));
    add.dataset.nashFocus = `add:${scope}`;
    if (scope === "globale") {
      grid.append(add);
    } else if (scope === "locale") {
      add.className = "nash-section-add";
      label.append(add);
    }
    const dropIndex = event => {
      const target = event.target.closest("[data-tile-id]");
      return target ? tiles.findIndex(t => t.id === target.dataset.tileId) : tiles.length;
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
      const index = dropIndex(event);
      if (payload.kind === "tile") {
        const tile = this.allTiles.find(t => t.id === this._drag.id);
        this._drag = null;
        if (tile) { this.moveTile(tile, tiles, index); }
        return;
      }
      this.adoptDrop(payload, tiles, scope, index);
    });
    wrap.append(label, grid);
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
    const button = this.button("nash-tile", "", `${tile.nom} — ${name}${tile.identite?.fixee ? " (session fixée)" : ""}`,
      () => this.openTile(tile));
    button.dataset.nashFocus = `tile:${tile.id}`;
    button.toggleAttribute("data-open", !!instance);
    button.toggleAttribute("data-current", !!instance && instance === gBrowser.selectedTab);
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
      ...this.TINTS.map((tint, index) => ({
        label: ["Bleu ardoise", "Lavande", "Sauge", "Argile", "Azur", "Rose"][index],
        action: () => { space.teinte = tint; this.saveModel(); this.render(); },
      })),
    ], event);
  },
};

// R4: never mount or move chrome before load and delayed startup.
window.addEventListener("load", () => Nash.init(), { once: true });
