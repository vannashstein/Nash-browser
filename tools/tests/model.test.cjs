// Run with node --test tools/tests/model.test.cjs. Tests execute the real overlay.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
const sourcePath = process.env.NASH_SOURCE || path.join(__dirname, '../../overlay/browser/components/nash/nash.js');

function fixture() {
  const stored = new Map();
  const tabs = [];
  const prefs = new Map();
  let prompts = 0, choice = 0;
  const ss = {
    getCustomTabValue: (tab, key) => stored.get(tab)?.get(key) || '',
    setCustomTabValue(tab, key, value) { if (!stored.has(tab)) stored.set(tab, new Map()); stored.get(tab).set(key, value); },
    deleteCustomTabValue: (tab, key) => stored.get(tab)?.delete(key),
    setCustomWindowValue() {},
  };
  const cis = { ids: [], getPublicIdentities() { return this.ids; },
    create(name) { this.ids.push({ name, userContextId: this.ids.length + 1 }); } };
  const browser = { tabs, selectedTab: null, getTabForBrowser: b => tabs.find(t=>t.linkedBrowser===b),
    addTrustedTab(url, options) {
      const attrs = new Map();
      const tab = { userContextId: options.userContextId, pinned: false, hidden: false,
        linkedBrowser: { currentURI: { spec: url } },
        getAttribute: k => attrs.get(k) || '', setAttribute: (k, v) => attrs.set(k, v),
        removeAttribute: k => attrs.delete(k), hasAttribute: k => attrs.has(k) };
      tabs.push(tab); return tab;
    },
    pinTab: t => { t.pinned = true; }, unpinTab: t => { t.pinned = false; },
    showTab(t) { t.hidden = false; ss.deleteCustomTabValue(t, 'hiddenBy'); },
    hideTab(t, source) { if (!t.pinned && t !== this.selectedTab) { t.hidden = true; ss.setCustomTabValue(t, 'hiddenBy', source); } },
  };
  const context = vm.createContext({ URL, console, Map, Set,
    window: { addEventListener() {} },
    Services: { uuid: { generateUUID: () => `{${crypto.randomUUID()}}` },
      prefs: { getStringPref: (k, fallback) => prefs.get(k) ?? fallback,
        setStringPref: (k, v) => prefs.set(k, v) },
      prompt: { confirmEx() { prompts++; return choice; }, alert() {},
        BUTTON_POS_0: 1, BUTTON_POS_1: 256, BUTTON_POS_2: 65536,
        BUTTON_TITLE_IS_STRING: 127, BUTTON_TITLE_CANCEL: 2 } },
    gBrowser: browser,
    BrowserWindowTracker: { orderedWindows: [] },
  });
  vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context);
  const n = context.Nash;
  n._ss = ss; n._cis = cis;
  n.model = n.normalizeModel(n.defaultModel());
  n.currentSpaceId = 'gen'; n.ensureContainers();
  n.render = () => {}; n.renderSoon = () => {};
  n._dom = {};
  return { n, browser, ss, prefs, cis, context, get prompts() { return prompts; }, set choice(c) { choice = c; } };
}

test('v0.2 migration preserves IDs and assigns distinct IDs to same-origin tiles', () => {
  const { n } = fixture(); const m = n.defaultModel();
  m.global.push({ url: 'https://mail.google.com/other', nom: 'Autre', identite: 'heritee' });
  n.normalizeModel(m);
  assert.equal(new Set([...m.global, ...m.spaces.flatMap(s => s.tiles)].map(t => t.id)).size, 14);
  assert.equal(m.global[0].id, 'https://mail.google.com');
  assert.ok(m.spaces.every(s => /^#[\da-f]{6}$/i.test(s.teinte)));
});
test('invalid persisted model is recoverable, including duplicate space containers', () => {
  const { n, prefs } = fixture();
  const m = n.defaultModel(); m.spaces[1].container = m.spaces[0].container;
  const raw = JSON.stringify(m); prefs.set('nash.model', raw); n.loadModel();
  assert.equal(prefs.get('nash.model.recovery'), raw);
  assert.equal(n.model.spaces[1].container, 'loisirs');
});
test('missing container fails closed instead of returning cookie jar 0', () => {
  const { n, cis } = fixture(); cis.ids = [];
  assert.throws(() => n.containerFor(n.model.global[0]), /absent/);
});
test('fixed identity reuses one tab; inherited uses a separate tab per space', () => {
  const { n, browser } = fixture();
  const fixed = n.model.global[2]; const first = n.openTile(fixed);
  n.currentSpaceId = 'anime'; assert.equal(n.openTile(fixed), first);
  const inherited = n.model.global[0]; inherited.identiteChoisie = true;
  const a = n.openTile(inherited); n.currentSpaceId = 'gen'; const b = n.openTile(inherited);
  assert.notEqual(a, b); assert.notEqual(a.userContextId, b.userContextId);
  assert.equal(n.openTile(inherited), b); assert.equal(browser.tabs.length, 3);
});
test('one-time choice is deferred to second space; cancellation creates no instance', () => {
  const f = fixture(), { n, browser } = f; const t = n.model.global[0];
  const first = n.openTile(t); assert.equal(f.prompts, 0);
  n.currentSpaceId = 'anime'; f.choice = 1;
  assert.equal(n.openTile(t), undefined); assert.equal(browser.tabs.length, 1);
  f.choice = 2; assert.equal(n.openTile(t), first); assert.equal(t.identite.fixee, 'perso');
  n.currentSpaceId = 'trav'; n.openTile(t); assert.equal(f.prompts, 2);
});
test('restored redirected tile reuses persisted ID, without origin matching', () => {
  const { n, ss } = fixture(); const t = n.model.global[0];
  const tab = n.openTile(t); tab.linkedBrowser.currentURI.spec = 'https://accounts.google.com/login';
  tab.removeAttribute('nash-tile');
  assert.equal(ss.getCustomTabValue(tab, 'nash-tile'), t.id);
  assert.equal(n.openTile(t), tab);
});
test('space switching selects a valid tab before hiding the old space', () => {
  const { n, browser, ss } = fixture();
  const a = browser.addTrustedTab('https://one.test', { userContextId: n.containerFor({}).id });
  n.assignTab(a); browser.selectedTab = a;
  n.switchSpace('anime'); const b = browser.selectedTab;
  assert.notEqual(a, b); assert.equal(a.hidden, true); assert.equal(b.hidden, false);
  assert.equal(ss.getCustomTabValue(a, 'hiddenBy'), 'nash');
  n.switchSpace('gen'); assert.equal(browser.selectedTab, a); assert.equal(a.hidden, false); assert.equal(b.hidden, true);
});
test('move supports drag indices and global cap without losing a tile', () => {
  const { n } = fixture(); const list = n.space.tiles; const a = list[0];
  n.moveTile(a, list, list.length); assert.equal(list.at(-1), a);
  assert.equal(n.moveTile(a, n.model.global), true);
  const b = list[0]; assert.equal(n.moveTile(b, n.model.global), false); assert.ok(list.includes(b));
  assert.equal(n.model.global.length, 4);
});
test('remote and active icon URLs are rejected; small raster data stays local', () => {
  const { n } = fixture();
  for (const url of ['https://tracker.test/a.png', 'file:///tmp/a.png', 'data:image/svg+xml;base64,PHN2Zz4=']) {
    assert.equal(n.safeIcon(url), false);
  }
  assert.equal(n.safeIcon('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(n.imageType(Uint8Array.from([137, 80, 78, 71])), 'png');
  assert.equal(n.imageType(Uint8Array.from([60, 115, 118, 103])), null);
});
test('routing sets container before loading and preserves explicit or opener identity', () => {
  const { n, browser } = fixture();
  browser.addTab = (url, options) => options;
  n.installTabRouting();
  assert.equal(browser.addTab('https://a.test').userContextId, n.containerFor({}).id);
  assert.equal(browser.addTab('https://a.test', { userContextId: 0 }).userContextId, 0);
  const opener = { openerBrowser: {} };
  assert.equal(browser.addTab('https://a.test', opener), opener);
});


test('legacy instance determines first identity before the second-space question', () => {
  const f = fixture(), { n, browser } = f;
  const tile = n.model.global[0];
  const legacy = browser.addTrustedTab(tile.url, {userContextId:n.containerFor(tile).id});
  browser.pinTab(legacy);
  n.currentSpaceId='anime'; f.choice=2;
  assert.equal(n.openTile(tile),legacy);
  assert.equal(tile.identite.fixee,'perso');
  assert.equal(f.prompts,1);
});

test('hiding a space does not reveal tabs hidden by an extension', () => {
  const {n,browser,ss}=fixture();
  const tab=browser.addTrustedTab('https://hidden.test',{userContextId:n.containerFor({}).id});
  n.assignTab(tab);tab.hidden=true;ss.setCustomTabValue(tab,'hiddenBy','extension@example');
  n.syncTabs();
  assert.equal(tab.hidden,true);
  assert.equal(ss.getCustomTabValue(tab,'hiddenBy'),'extension@example');
  assert.notEqual(browser.selectedTab,tab);
});


test('local fixed tile follows visibility space when selected natively', () => {
  const {n}=fixture();const fixed=n.model.global[2];
  const tab=n.openTile(fixed);
  n.currentSpaceId='anime';n.toggleScope(fixed);
  n.currentSpaceId='gen';n.onTabEvent({type:'TabSelect',target:tab});
  assert.equal(n.currentSpaceId,'anime');
  assert.equal(n.spaceForTab(tab),'anime');
});
