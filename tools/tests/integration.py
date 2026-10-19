#!/usr/bin/env python3
"""Browser integration tests: real Gecko, local HTTP fixture, temporary profile.

No existing profile is read. Marionette is enabled only in the disposable test
process and listens on loopback. Never enable it in a distributed build.
"""
import argparse
import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
from urllib.parse import urlparse, parse_qs

class Marionette:
    def __init__(self, port):
        self.sock = socket.create_connection(('127.0.0.1', port), timeout=20)
        self.seq = 0
        self.read()
        self.call('WebDriver:NewSession', {'capabilities': {'alwaysMatch': {}}})
        self.call('Marionette:SetContext', {'value': 'chrome'})
    def read(self):
        length = b''
        while not length.endswith(b':'):
            data = self.sock.recv(1)
            if not data: raise RuntimeError('Marionette closed')
            length += data
        remaining = int(length[:-1]); chunks = []
        while remaining:
            data = self.sock.recv(remaining)
            if not data: raise RuntimeError('Marionette closed')
            chunks.append(data); remaining -= len(data)
        return json.loads(b''.join(chunks))
    def call(self, method, params=None):
        self.seq += 1
        payload = json.dumps([0, self.seq, method, params or {}]).encode()
        self.sock.sendall(str(len(payload)).encode() + b':' + payload)
        answer = self.read()
        if answer[2]: raise RuntimeError(json.dumps(answer[2], ensure_ascii=False))
        return answer[3]
    def js(self, code, args=None):
        result = self.call('WebDriver:ExecuteScript', {
            'script': code, 'args': args or [], 'newSandbox': False, 'sandbox': 'nash-test',
        })
        return result.get('value') if isinstance(result, dict) and 'value' in result else result
    def js_async(self, code, args=None):
        result = self.call('WebDriver:ExecuteAsyncScript', {
            'script': code, 'args': args or [], 'newSandbox': False, 'sandbox': 'nash-test',
        })
        return result.get('value') if isinstance(result, dict) and 'value' in result else result
    def wait(self, code, timeout=15):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            value = self.js(code)
            if value: return value
            time.sleep(.15)
        raise AssertionError('Condition timed out: ' + code)
    def screenshot(self, path):
        result = self.call('WebDriver:TakeScreenshot', {'full': False})
        if isinstance(result, dict): result = result['value']
        path.write_bytes(base64.b64decode(result))

requests = []
class Fixture(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        requests.append((parsed.path, self.headers.get('Cookie') or ''))
        if parsed.path == '/redirect':
            self.send_response(302); self.send_header('Location', '/destination'); self.end_headers(); return
        self.send_response(200)
        cookie = parse_qs(parsed.query).get('cookie', [None])[0]
        if cookie: self.send_header('Set-Cookie', 'nash_test=' + cookie + '; Path=/; SameSite=Lax')
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(('''<!doctype html><html><head><title>Page locale Nash</title>
          <style>html{color-scheme:light dark}body{font:18px system-ui;max-width:700px;margin:80px auto;padding:30px}
          h1{font-size:42px}p{line-height:1.6;opacity:.7}small{letter-spacing:.12em}</style></head>
          <body><small>NASH · TEST LOCAL</small><h1>Un espace à vous.</h1>
          <p>Cette page est servie sur votre ordinateur pour vérifier les onglets,
          les sessions et les containers du navigateur.</p></body></html>''').encode())
    def log_message(self, *args): pass

parser = argparse.ArgumentParser()
parser.add_argument('binary', type=Path)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--expect-name', default='Firefox')
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
server = ThreadingHTTPServer(('127.0.0.1', 0), Fixture)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
checks = []
def check(name, condition, detail=None):
    if not condition: raise AssertionError(f'{name}: {detail}')
    checks.append(name); print('PASS:', name, flush=True)

with tempfile.TemporaryDirectory(prefix='nash-integration-') as tmp:
    profile = Path(tmp)
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]
    prefs = {
        'marionette.port': port,
        'browser.shell.checkDefaultBrowser': False,
        'browser.startup.homepage_override.mstone': 'ignore',
        'browser.aboutwelcome.enabled': False,
        'browser.startup.page': 3,
        'browser.sessionstore.resume_from_crash': True,
        'browser.newtabpage.enabled': False,
        'browser.newtabpage.activity-stream.feeds.system.topstories': False,
        'browser.newtabpage.activity-stream.feeds.topsites': False,
        'browser.tabs.warnOnClose': False,
        'browser.warnOnQuitShortcut': False,
        'browser.tabs.closeWindowWithLastTab': False,
        'datareporting.policy.dataSubmissionEnabled': False,
        'devtools.console.stdout.chrome': True,
        'sidebar.visibility': 'always-show',
        'sidebar.verticalTabs': True,
        'ui.systemUsesDarkTheme': 1,
        'browser.theme.toolbar-theme': 0,
    }
    (profile/'user.js').write_text(''.join(f'user_pref({json.dumps(k)}, {json.dumps(v)});\n' for k,v in prefs.items()))
    processes = []
    logs = []
    client = None
    def start(number):
        log = (args.output/f'browser-{number}.log').open('w'); logs.append(log)
        process = subprocess.Popen([str(args.binary.resolve()), '-profile', str(profile),
            '-no-remote', '-marionette', '-remote-allow-system-access'], stdout=log, stderr=log)
        processes.append(process)
        deadline = time.monotonic() + 60
        while True:
            if process.poll() is not None: raise RuntimeError('Browser exited; inspect browser log')
            try: c = Marionette(port); break
            except (OSError, ConnectionError):
                if time.monotonic() > deadline: raise
                time.sleep(.25)
        c.wait("return document.documentElement.getAttribute('nash') === '0.4';")
        return c, process
    def stop(c, process):
        try: c.js('Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);')
        except Exception: pass
        process.wait(timeout=20)
        c.sock.close()
    try:
        client, process = start(1)
        status = client.js('''return {version:Nash.version, name:Services.appinfo.name,
          remoting:Services.appinfo.remotingName,
          appData:Services.dirsvc.get('UAppData',Ci.nsIFile).path,
          profile:Services.dirsvc.get('ProfD',Ci.nsIFile).path,
          gpu:window.windowUtils.gpuProcessPid,
          initialContainer:gBrowser.selectedTab.userContextId,
          expectedContainer:Nash.containerFor({}).id};''')
        (args.output/'runtime.json').write_text(json.dumps(status, indent=2))
        check('compiled application identity', status['name'] == args.expect_name, status)
        if args.expect_name == 'Nash':
            check('separate Nash application-data directory', status['appData'].endswith('/Nash'), status)
            check('separate Nash remoting identity', status['remoting'] == 'nash', status)
        check('fresh startup tab is contained', status['initialContainer'] == status['expectedContainer'], status)
        check('GPU process starts without disabling acceleration', status.get('gpu', 0) > 0, status)
        # Nash applies its own sidebar default once (hidden column); the layout
        # checks below need the column docked, as after « Fixer ».
        state = client.js('''return {visibility:Services.prefs.getCharPref('sidebar.visibility'),
          applied:Services.prefs.getBoolPref('nash.sidebar.defaultApplied',false)};''')
        check('first run applies the hidden sidebar default once', state == {'visibility':'hide-sidebar','applied':True}, state)
        client.js("Services.prefs.setCharPref('sidebar.visibility','always-show');")
        # D10: the default model is one empty space. The test builds the spaces it
        # needs; the first keeps the default container, so the startup tab stays its own.
        state = client.js('''
          const defaults=Nash.model.spaces;
          Nash.model = Nash.normalizeModel({
            global: [
              {id:'mail',nom:'Courrier',url:arguments[0]+'/page?cookie=perso',identite:'heritee',identiteChoisie:true},
              {id:'fixed',nom:'Bibliothèque',url:arguments[0]+'/fixed',identite:{fixee:'kagi'}},
              {id:'third',nom:'Documents',url:arguments[0]+'/documents',identite:'heritee',identiteChoisie:true}
            ],
            spaces: [
              {id:'gen',nom:'Générale',emoji:'🪐',container:defaults[0].container,tiles:[
                {id:'redirect',nom:'Redirection',url:arguments[0]+'/redirect',identite:'heritee',identiteChoisie:true},
                {id:'notes',nom:'Notes',url:arguments[0]+'/notes',identite:'heritee',identiteChoisie:true}
              ]},
              {id:'anime',nom:'Anime',emoji:'🧠',container:'loisirs',tiles:[]},
              {id:'trav',nom:'Travail',emoji:'📦',container:'pro',tiles:[]},
              {id:'rech',nom:'Recherche',emoji:'👻',container:'recherche',tiles:[]}
            ]
          });
          Nash.currentSpaceId = 'gen';
          Nash.ensureContainers(); Nash.saveModel(); Nash.syncTabs(); Nash.render();
          return {defaults:defaults.length, startup:Nash.spaceForTab(gBrowser.selectedTab),
            containers:['perso','loisirs','pro','recherche','kagi'].every(n=>!!Nash.containerByName(n))};
        ''', [base])
        check('test spaces and their containers are set up', state == {'defaults':1,'startup':'gen','containers':True}, state)
        # A window opened with a URL loads it in its space container, and its request
        # never carries the uncontained cookie jar (docs/13-fenetre-rapide-faits.md, B2).
        client.js("window._nashZero=gBrowser.addTrustedTab(arguments[0]+'/page?cookie=zero',{userContextId:0});", [base])
        client.wait("return window._nashZero.linkedBrowser.currentURI.spec.includes('cookie=zero') && !window._nashZero.linkedBrowser.webProgress.isLoadingDocument;")
        client.js("gBrowser.removeTab(window._nashZero);")
        # openDialog needs "all": without it Gecko makes a single-process window that
        # never shows web content, with or without Nash.
        openings = {
          '/window-dialog': "window.openDialog(AppConstants.BROWSER_CHROME_URL,'_blank','chrome,dialog=no,all',url);",
          '/window-popup': "BrowserWindowTracker.openWindow({all:false,features:'popup,width=520,height=640',args:arg});",
          '/window-full': "BrowserWindowTracker.openWindow({args:arg});",
        }
        for path, opening in openings.items():
            client.js('''const url=arguments[0]+arguments[1];
              const arg=Cc['@mozilla.org/supports-string;1'].createInstance(Ci.nsISupportsString);arg.data=url;''' + opening,
              [base, path])
            client.wait('''window._nashOpened=[...Services.wm.getEnumerator('navigator:browser')].find(w=>w!==window&&
              w.Nash?.model&&w.gBrowser.selectedBrowser.currentURI.spec.endsWith(arguments[0]));
              return window._nashOpened&&!window._nashOpened.gBrowser.selectedBrowser.webProgress.isLoadingDocument;'''
              .replace('arguments[0]', json.dumps(path)))
            state = client.js('''const w=window._nashOpened;const state={
              tabs:w.gBrowser.tabs.map(t=>t.userContextId),expected:w.Nash.containerFor({}).id};
              w.close();return state;''')
            sent = [cookie for p, cookie in requests if p == path]
            check('window opened with a URL loads it in its space container: ' + path,
              state['tabs'] == [state['expected']] and state['expected'] != 0 and sent
              and not any('nash_test=zero' in c for c in sent), [state, sent])
        # D15 prevails over browser.link.open_newwindow.override.external: even when the
        # user asks external links for a new window, Nash opens them in a tab of the
        # current window, in a throwaway container, never in container 0 nor in a
        # space container (docs/14-liens-externes.md).
        client.js('''const url=arguments[0]+'/window-external';
          Services.prefs.setIntPref('browser.link.open_newwindow.override.external',2);
          try { window.browserDOMWindow.wrappedJSObject.openURI(Services.io.newURI(url),null,
            Ci.nsIBrowserDOMWindow.OPEN_DEFAULTWINDOW,Ci.nsIBrowserDOMWindow.OPEN_EXTERNAL,
            Services.scriptSecurityManager.getSystemPrincipal()); }
          finally { Services.prefs.clearUserPref('browser.link.open_newwindow.override.external'); }''', [base])
        client.wait('''window._nashExternal=gBrowser.tabs.find(t=>t.linkedBrowser.currentURI.spec.endsWith('/window-external'));
          return window._nashExternal&&!window._nashExternal.linkedBrowser.webProgress.isLoadingDocument;''')
        state = client.js('''const tab=window._nashExternal;const state={
          name:Nash.CIS.getPublicIdentityFromId(tab.userContextId)?.name??null,
          windows:[...Services.wm.getEnumerator('navigator:browser')].length};
          gBrowser.removeTab(tab);return state;''')
        sent = [cookie for p, cookie in requests if p == '/window-external']
        check('external link opens in a throwaway container even with a new-window preference (D15)',
          (state['name'] or '').startswith('nash-temp-') and state['windows'] == 1 and sent
          and not any('nash_test=zero' in c for c in sent), [state, sent])
        client.js('''
          window._nashTestA = gBrowser.selectedTab;
          Nash.openTile(Nash.model.global[0]);
        ''', [base])
        client.wait("return !gBrowser.selectedBrowser.webProgress.isLoadingDocument && gBrowser.selectedBrowser.currentURI.spec.includes('cookie=perso');")
        first_id = client.js("return gBrowser.selectedTab.userContextId;")
        client.js("window._nashMail = gBrowser.selectedTab; Nash.switchSpace('anime'); Nash.model.global[0].url=arguments[0]+'/page?cookie=loisirs'; Nash.openTile(Nash.model.global[0]);", [base])
        client.wait("return !gBrowser.selectedBrowser.webProgress.isLoadingDocument && gBrowser.selectedBrowser.currentURI.spec.includes('cookie=loisirs');")
        state = client.js('''return {
          id:gBrowser.selectedTab.userContextId,
          cookies:[arguments[0],gBrowser.selectedTab.userContextId].map(userContextId=>
            Services.cookies.getCookiesFromHost('127.0.0.1',{userContextId}).map(c=>c.value)),
          hidden:window._nashTestA.hidden,
          visible:gBrowser.visibleTabs.filter(t=>!t.pinned).map(t=>Nash.spaceForTab(t)),
          count:gBrowser.tabs.filter(t=>Nash.tabValue(t,'nash-tile')==='mail').length
        };''', [first_id])
        check('real HTTP cookies isolated by container', state['id'] != first_id and state['cookies'] == [['perso'], ['loisirs']], state)
        check('ordinary tabs filtered by space', state['hidden'] and all(s == 'anime' for s in state['visible']), state)
        check('inherited tile has one instance per space', state['count'] == 2, state)
        state = client.js('''Nash.openTile(Nash.model.global[1]); window._nashFixed=gBrowser.selectedTab;
          Nash.switchSpace('gen'); Nash.openTile(Nash.model.global[1]);
          return {same:gBrowser.selectedTab===window._nashFixed,space:Nash.currentSpaceId,
            count:gBrowser.tabs.filter(t=>Nash.tabValue(t,'nash-tile')==='fixed').length};''')
        check('fixed tile reused without changing current space', state == {'same': True, 'space': 'gen', 'count': 1}, state)
        client.js("BrowserCommands.openTab();")
        client.wait("return !gBrowser.selectedTab.pinned;")
        check('native New Tab receives current container', client.js("return gBrowser.selectedTab.userContextId===Nash.containerFor({}).id;"))
        client.js("Nash.openTile(Nash.space.tiles[0]);")
        client.wait("return gBrowser.selectedBrowser.currentURI.spec.endsWith('/destination') && !gBrowser.selectedBrowser.webProgress.isLoadingDocument;")
        state = client.js('''window._nashRedirect=gBrowser.selectedTab; Nash.openTile(Nash.space.tiles[0]);
          return {same:gBrowser.selectedTab===window._nashRedirect,
            key:Nash.SS.getCustomTabValue(gBrowser.selectedTab,'nash-tile')};''')
        check('redirected tile reuses persistent instance ID', state == {'same': True, 'key': 'redirect'}, state)
        # Exercise real shortcut handling with Gecko-generated trusted key events.
        state = client.js('''
          const {event}=ChromeUtils.importESModule('chrome://remote/content/shared/webdriver/Event.sys.mjs');
          event.sendSingleKey({key:'1',code:'Digit1',printable:true,metaKey:true},window);
          return {tile:Nash.tabValue(gBrowser.selectedTab,'nash-tile'),space:Nash.currentSpaceId};
        ''')
        check('Command-1 selects first global tile', state['tile'] == 'mail' and state['space'] == 'gen', state)
        state = client.js('''
          const {event}=ChromeUtils.importESModule('chrome://remote/content/shared/webdriver/Event.sys.mjs');
          event.sendSingleKey({key:'4',code:'Digit4',printable:true,metaKey:true},window);
          return Nash.tabValue(gBrowser.selectedTab,'nash-tile');
        ''')
        check('Command-4 follows globals with first local tile', state == 'redirect', state)
        # D6 révisée: the global row has no cap. Moves beyond the old limit of four
        # succeed silently, and no tile is lost or duplicated on the way there and back.
        state = client.js('''const notes=Nash.space.tiles[1], redirect=Nash.space.tiles[0];
          const notify=Nash.notify; let notified=false; Nash.notify=()=>{notified=true;};
          const moved=[Nash.moveTile(notes,Nash.model.global),Nash.moveTile(redirect,Nash.model.global)];
          Nash.notify=notify;
          const global=Nash.model.global.map(t=>t.id), local=Nash.space.tiles.length;
          Nash.moveTile(redirect,Nash.space.tiles); Nash.moveTile(notes,Nash.space.tiles);
          return {moved,notified,global,local,
            back:[Nash.model.global.map(t=>t.id),Nash.space.tiles.map(t=>t.id)],
            saved:JSON.parse(Services.prefs.getStringPref('nash.model')).spaces[0].tiles.map(t=>t.id)};''')
        check('uncapped global row keeps every moved tile', state == {'moved':[True,True],'notified':False,
          'global':['mail','fixed','third','notes','redirect'],'local':0,
          'back':[['mail','fixed','third'],['redirect','notes']],'saved':['redirect','notes']}, state)
        client.js('''const tab=gBrowser.addTrustedTab(arguments[0]+'/added');gBrowser.selectedTab=tab;
        ''', [base])
        client.wait("return gBrowser.selectedBrowser.currentURI.spec.endsWith('/added') && !gBrowser.selectedBrowser.webProgress.isLoadingDocument;")
        state = client.js('''const tab=gBrowser.selectedTab;Nash.addCurrentTile();
          const t=Nash.space.tiles.at(-1);window._nashAdded=t.id;
          return {pinned:tab.pinned,key:Nash.tabValue(tab,'nash-tile'),id:t.id};''')
        check('add current page adopts contained live tab', state['pinned'] and state['key'] == state['id'], state)
        state = client.js('''const t=Nash.space.tiles.at(-1);const tab=gBrowser.selectedTab;
          Nash.removeTile(t);return {alive:gBrowser.tabs.includes(tab),pinned:tab.pinned,key:Nash.tabValue(tab,'nash-tile')};''')
        check('remove tile keeps live page and session', state == {'alive':True,'pinned':False,'key':''}, state)
        # D11: creating and renaming a space go through the form at the head of the
        # sidebar, driven here through its own input, tint swatches and buttons.
        state = client.js('''
          const strip=document.getElementById('nash-strip');
          const fill=(name)=>{const input=strip.querySelector('.nash-form-name');input.value=name;
            input.dispatchEvent(new Event('input'));strip.querySelector('.nash-form-ok').click();};
          const before=Nash.model.spaces.map(s=>s.id);
          Nash.createSpace();
          strip.querySelectorAll('.nash-form-tint')[2].click();
          fill('Atelier');
          window._nashCreated=Nash.currentSpaceId;const s=Nash.space;
          gBrowser.selectedTab=gBrowser.addTrustedTab('about:blank');
          Nash.renameSpace(s);
          const prefilled=strip.querySelector('.nash-form-name').value;
          fill('Studio');
          return {name:s.nom,container:s.container,tint:s.teinte===Nash.TINTS[2],prefilled,
            isNew:!before.includes(s.id),form:!strip.querySelector('.nash-form'),
            tabContainer:gBrowser.selectedTab.userContextId,
            expected:Nash.containerFor({}).id,count:Nash.model.spaces.length};
        ''')
        check('create and rename space with distinct container', state['name']=='Studio' and state['container']=='Atelier' and state['tint'] and state['prefilled']=='Atelier' and state['isNew'] and state['form'] and state['tabContainer']==state['expected'] and state['count']==5, state)
        client.js("Nash.switchSpace('gen');")
        state=client.js("""const tile={id:'cross-account',nom:'Compte de loisirs',url:arguments[0]+'/cross-account',
          identite:{fixee:'loisirs'}};Nash.space.tiles.push(tile);Nash.saveModel();
          Nash.openTile(tile);const opener=gBrowser.selectedBrowser;
          const tab=gBrowser.addTab(arguments[0]+'/child',{openerBrowser:opener,
            triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});
          gBrowser.selectedTab=tab;
          const result={space:Nash.currentSpaceId,owner:Nash.spaceForTab(tab),container:tab.userContextId,
            expected:Nash.containerByName('loisirs').userContextId};
          Nash.removeTile(tile);return result;""",[base])
        check('link from a fixed local tile keeps its visible space and account', state['space']=='gen' and state['owner']=='gen' and state['container']==state['expected'],state)
        # Real native choice dialog: cancel must not pin the first account globally.
        client.js("""Nash.switchSpace('gen');Nash.model.global.push({id:'choice',nom:'Choix',url:arguments[0]+'/choice',identite:null});
          Nash.saveModel();Nash.openTile(Nash.model.global.at(-1));""", [base])
        client.js("""Nash.switchSpace('anime');window.setTimeout(()=>Nash.openTile(Nash.model.global.at(-1)),0);""")
        deadline=time.monotonic()+10
        while True:
            try:
                message=client.call('WebDriver:GetAlertText');break
            except RuntimeError:
                if time.monotonic()>deadline: raise
                time.sleep(.15)
        check('native identity question appears in second space', 'second espace' in str(message), message)
        client.call('WebDriver:DismissAlert')
        state=client.js("""const t=Nash.model.global.at(-1);return {chosen:!!t.identiteChoisie,
          fixed:!!t.identite?.fixee,count:gBrowser.tabs.filter(x=>Nash.tabValue(x,'nash-tile')==='choice').length};""")
        check('native cancellation leaves identity and instances unchanged', state=={'chosen':False,'fixed':False,'count':1},state)
        client.js("window.setTimeout(()=>Nash.openTile(Nash.model.global.at(-1)),0);")
        deadline=time.monotonic()+10
        while True:
            try: client.call('WebDriver:GetAlertText');break
            except RuntimeError:
                if time.monotonic()>deadline: raise
                time.sleep(.15)
        client.call('WebDriver:AcceptAlert')
        check('native default choice keeps one session per space', client.js("return Nash.model.global.at(-1).identiteChoisie && Nash.model.global.at(-1).identite==='heritee';"))
        client.js("Nash.removeTile(Nash.model.global.at(-1));")
        # A real local image passes through IOUtils and remains the chosen icon.
        icon = profile/'icon.png'
        icon.write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGZkAAAAASUVORK5CYII='))
        state = client.js_async("""const done=arguments[arguments.length-1];
          Nash.cacheManualIcon(Nash.model.global[0],arguments[0]).then(()=>done({
            cached:Nash.model.global[0].iconeManuelle.startsWith('data:image/png;base64,'),
            same:Nash.iconNode(Nash.model.global[0],{image:'data:image/png;base64,AAAA'}).src === Nash.model.global[0].iconeManuelle
          })).catch(e=>done({error:e.message}));""", [str(icon)])
        check('local manual icon cache overrides live favicon', state == {'cached':True,'same':True}, state)
        invalid = profile/'unsafe.svg'; invalid.write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
        state = client.js_async("""const done=arguments[arguments.length-1];
          Nash.cacheManualIcon(Nash.model.global[0],arguments[0]).then(()=>done(false)).catch(()=>done(true));""", [str(invalid)])
        check('manual icon rejects active SVG content', state)
        # Drive the actual drag/drop listeners, rather than just calling moveTile.
        client.js("Nash.switchSpace('gen');Nash.render();")
        # D14: one grid, global tiles first; a dropped local tile stays local.
        state = client.js("""const grid=document.querySelector('#nash-strip .nash-section .nash-grid');
          const wrappers=[...grid.querySelectorAll('.nash-tile-wrap')];
          const order=wrappers.map(w=>w.dataset.tileId);
          const local=wrappers.find(w=>Nash.space.tiles.some(t=>t.id===w.dataset.tileId));
          const id=local.dataset.tileId;const global=Nash.model.global.map(t=>t.id);const dt=new DataTransfer();
          local.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));
          grid.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));
          Nash.render();
          return {id,last:Nash.space.tiles.at(-1).id,globalFirst:order.slice(0,global.length).join()===global.join(),
            globalKept:Nash.model.global.map(t=>t.id).join()===global.join(),
            shown:[...document.querySelectorAll('#nash-strip .nash-grid .nash-tile-wrap')].at(-1).dataset.tileId};""")
        check('tile drag/drop updates displayed ordering', state['id']==state['last']==state['shown'] and state['globalFirst'] and state['globalKept'], state)
        # Native actions menu is populated and can be dismissed by keyboard.
        state=client.js("""const b=document.querySelector('.nash-scope');b.click();
          const p=document.getElementById('nash-menu');const count=p.children.length;
          p.hidePopup();return count;""")
        check('tile actions menu opens', state>=9, state)
        # A second normal window observes model edits; private windows stay native.
        client.js("window._nashSecond=OpenBrowserWindow();")
        client.wait("return window._nashSecond?.document.documentElement.hasAttribute('nash');")
        client.js("Nash.space.nom='Générale modifiée';Nash.saveModel();")
        check('model edits synchronize across normal windows', client.js("return window._nashSecond.Nash.model.spaces.find(s=>s.id==='gen').nom==='Générale modifiée';"))
        client.js("window._nashSecond.close();window._nashPrivate=OpenBrowserWindow({private:true});")
        client.wait("return window._nashPrivate?.gBrowserInit?.delayedStartupFinished;")
        check('private windows keep native UI without persistent Nash model', client.js("return !window._nashPrivate.document.documentElement.hasAttribute('nash') && !window._nashPrivate.Nash.model;"))
        client.js("window._nashPrivate.close();")
        client.js("Nash.switchSpace('gen'); Nash.openTile(Nash.model.global[1]);")
        client.wait("return !gBrowser.selectedBrowser.webProgress.isLoadingDocument && gBrowser.selectedBrowser.currentURI.spec.endsWith('/fixed');")
        time.sleep(.4)
        # The column has no background of its own: it sits on the space tint painted
        # on #browser, which the space bar's sticky buttons repeat as a solid color.
        tint_probe = "({column:getComputedStyle(document.getElementById('browser')).backgroundImage," \
          "bar:getComputedStyle(document.querySelector('#nash-spaces > .nash-space-add')).backgroundColor})"
        # Ensure badges fit and the native tab list retains usable height.
        layout = client.js('''return {
          clipped:[...document.querySelectorAll('.nash-badge')].some(b=>{
            const r=b.getBoundingClientRect(),p=b.parentElement.getBoundingClientRect();return r.bottom>p.bottom-2;}),
          // D14: only a fixed session shows its container on the card.
          badges:[...document.querySelectorAll('#nash-strip .nash-badge')].filter(b=>b.getClientRects().length)
            .map(b=>b.hasAttribute('data-fixee')),
          tabs:document.getElementById('tabbrowser-tabs').getBoundingClientRect().height,
          strip:document.getElementById('nash-strip').getBoundingClientRect().width,
          background:'''+tint_probe+''',
          browserRect:(()=>{const r=gBrowser.selectedBrowser.getBoundingClientRect();return {width:r.width,height:r.height};})()
        };''')
        check('tile labels fit and native tabs retain space', not layout['clipped'] and layout['badges'] and all(layout['badges']) and layout['tabs']>90 and layout['strip']>100, layout)
        client.screenshot(args.output/'dark.png')
        client.js("Services.prefs.setIntPref('ui.systemUsesDarkTheme',0);Services.prefs.setIntPref('browser.theme.toolbar-theme',1);")
        time.sleep(.7)
        light = client.js("return "+tint_probe+";")
        check('light and dark palettes differ', light['column'] != layout['background']['column'] and light['bar'] != layout['background']['bar'], [light,layout])
        client.screenshot(args.output/'light.png')
        client.js("Nash.switchSpace('anime');")
        tint = client.js("return "+tint_probe+";")
        time.sleep(.3)
        tint = client.js("return "+tint_probe+";")
        check('switching spaces changes sidebar tint', tint['column'] != light['column'] and tint['bar'] != light['bar'], [tint,light])
        client.js("Nash.switchSpace('gen'); Nash.openTile(Nash.space.tiles.find(t=>t.id==='redirect')); Nash.saveModel();")
        client.wait("return gBrowser.selectedBrowser.currentURI.spec.endsWith('/destination');")
        before = client.js("return {space:Nash.currentSpaceId,tile:Nash.tabValue(gBrowser.selectedTab,'nash-tile'),count:gBrowser.tabs.filter(t=>Nash.tabValue(t,'nash-tile')==='redirect').length};")
        stop(client, process)
        client, process = start(2)
        after = client.js('''Nash.openTile(Nash.space.tiles.find(t=>t.id==='redirect'));
          return {space:Nash.currentSpaceId,tile:Nash.tabValue(gBrowser.selectedTab,'nash-tile'),
            count:gBrowser.tabs.filter(t=>Nash.tabValue(t,'nash-tile')==='redirect').length,
            url:gBrowser.selectedBrowser.currentURI.spec,spaces:Nash.model.spaces.length,
            keys:gBrowser.tabs.filter(t=>!t.pinned).map(t=>({space:Nash.spaceForTab(t),hidden:t.hidden}))};''')
        check('restart restores spaces and redirected instance without duplication',
          before['space']==after['space'] and after['tile']=='redirect' and after['count']==1 and after['spaces']==5 and after['url'].endswith('/destination'), after)
        check('restart restores ordinary tab ownership and visibility', all(t['hidden'] or t['space']=='gen' for t in after['keys']), after)
        stop(client, process)
        client=None
        (args.output/'results.json').write_text(json.dumps({'checks':checks,'runtime':status,'restored':after},indent=2,ensure_ascii=False))
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
                try: process.wait(timeout=15)
                except subprocess.TimeoutExpired: process.kill(); process.wait()
        for log in logs: log.close()
        server.shutdown()
