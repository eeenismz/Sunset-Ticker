// M5 test steps. Runs inside tests/m3-harness.html (same harness and fake relay as M3 and M4):
// PATH=<node24>/bin node tests/m2-cdp.mjs http://localhost:8888/workplaces/sunset-ticker/tests/m3-harness.html tests/m5-steps.js
// Covers: gesture lock (computed styles, gesture events, grid still scrolls), wake lock asked for on pairing,
// phone reload rejoins on the laptop's current page, return to the app re-attaches and beats the heartbeat,
// "Black screen: off" fits on one line at 320 px, the laptop ending the session shows "That's a wrap",
// and at the end (a plain load, not ?fakedb): manifest + icons, apple meta tags, service worker + shell cache.
const report = {};
const ok = (name, cond, extra) => { report[name] = { pass: !!cond, ...(extra === undefined ? {} : { value: extra }) }; return !!cond; };
const waitFor = async (fn, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await T.sleep(100); }
  return null;
};
const room = (code) => ((T.db().rooms || {})[code] || {});
const lapState = (code) => room(code).state || {};
const phEl = (id) => doc('phA').getElementById(id);
const phWin = () => doc('phA').defaultView;

// 1. Laptop opens the PDF; the phone pairs (wake lock is asked for on pairing; count the requests).
T.pickPdf('wide60');
const code = await waitFor(() => T.roomCode().length === 6 && T.roomCode());
ok('room code shown', code, code);
T.openPhone('phA');
await T.sleep(800);
const wl = phWin().navigator.wakeLock;
const wakeSupported = !!wl;
let wakeRequests = 0;
if (wl) {
  const realRequest = wl.request.bind(wl);
  wl.request = (type) => { wakeRequests++; return realRequest(type); };
}
T.typeCode('phA', code);
ok('phone reaches main view', await waitFor(() => T.visible('phA', 'mainScreen')));
ok('phone shows Page 1 of 60', await waitFor(() => T.text('phA', 'pageLabel') === 'Page 1 of 60'), T.text('phA', 'pageLabel'));
ok('wake lock asked for on pairing (or the API is absent here)', !wakeSupported || wakeRequests >= 1, { supported: wakeSupported, requests: wakeRequests });
ok('the phone is not on the join screen while paired', !T.visible('phA', 'joinScreen'));

// 2. Gesture lock: computed styles and gesture events.
const cs = phWin().getComputedStyle(phEl('nowBox').closest('body'));
const csHtml = phWin().getComputedStyle(doc('phA').documentElement);
ok('body: touch-action manipulation (no double-tap zoom)', cs.touchAction === 'manipulation', cs.touchAction);
ok('body: user-select none (no text selection)', (cs.userSelect || cs.webkitUserSelect) === 'none', cs.userSelect);
ok('body: overscroll-behavior none (no bounce)', cs.overscrollBehavior === 'none', cs.overscrollBehavior);
ok('html: overscroll-behavior none (no bounce)', csHtml.overscrollBehavior === 'none', csHtml.overscrollBehavior);
const callout = cs.getPropertyValue('-webkit-touch-callout');
ok('body: -webkit-touch-callout none (iOS; blank where unsupported)', callout === 'none' || callout === '', callout);
const viewport = doc('phA').querySelector('meta[name=viewport]');
ok('viewport blocks pinch zoom (maximum-scale=1, user-scalable=no)',
  /maximum-scale=1/.test(viewport.content) && /user-scalable=no/.test(viewport.content), viewport.content);
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  const ev = new (phWin().Event)(type, { cancelable: true });
  doc('phA').dispatchEvent(ev);
  ok(type + ' is prevented (no pinch zoom)', ev.defaultPrevented);
}

// 3. Page grid still scrolls (it is the one scroll area on the phone).
phEl('gridBtn').click();
const grid = phEl('grid');
ok('grid is the scroll area (overflow-y auto, taller than its box)', phWin().getComputedStyle(grid).overflowY === 'auto' && grid.scrollHeight > grid.clientHeight,
  { overflowY: phWin().getComputedStyle(grid).overflowY, scrollHeight: grid.scrollHeight, clientHeight: grid.clientHeight });
grid.scrollTop = 300;
ok('grid scrolls when set (60 pages)', grid.scrollTop > 0, grid.scrollTop);
phEl('gridBackBtn').click();
ok('back from the grid to the main view', await waitFor(() => T.visible('phA', 'mainScreen')));

// 4. Laptop moves to page 3; the phone reload rejoins by itself (no code typed) on that page.
T.key('ArrowRight');
T.key('ArrowRight');
ok('laptop is on page 3', await waitFor(() => lapState(code).page === 3), lapState(code).page);
ok('phone shows Page 3 before the reload', await waitFor(() => T.text('phA', 'pageLabel') === 'Page 3 of 60'), T.text('phA', 'pageLabel'));
T.openPhone('phA');
ok('phone reload: rejoins with no code, main view on page 3',
  await waitFor(() => T.visible('phA', 'mainScreen') && T.text('phA', 'pageLabel') === 'Page 3 of 60'),
  { main: T.visible('phA', 'mainScreen'), label: T.text('phA', 'pageLabel') });
ok('phone reload: join screen not shown', !T.visible('phA', 'joinScreen'));
ok('phone reload: room still saved on the phone', doc('phA').defaultView.localStorage.getItem('sunset-room') === code);

// 5. Return to the app: listeners are re-attached and the heartbeat is beaten at once.
await T.sleep(500);
const hbBefore = room(code).hb && room(code).hb.remote;
doc('phA').dispatchEvent(new (phWin().Event)('visibilitychange'));
ok('return: heartbeat refreshed at once', await waitFor(() => { const h = room(code).hb && room(code).hb.remote; return h && h !== hbBefore; }, 1500), { before: hbBefore });
T.key('ArrowRight');   // the laptop moves on; the re-attached listeners must show it
ok('return: phone follows the laptop after re-attach (Page 4)', await waitFor(() => T.text('phA', 'pageLabel') === 'Page 4 of 60'), T.text('phA', 'pageLabel'));

// 6. Black button label fits on one line at 320 px (the narrowest iPhone SE class).
const frame = $('phA');
const savedWidth = frame.width;
frame.width = '320';
await T.sleep(400);
const btn = phEl('blackBtn');
const rng = phWin().document.createRange();
rng.selectNodeContents(btn);
const lines = rng.getClientRects().length;
ok('"Black screen: off" is one line at 320 px', lines === 1 && btn.scrollWidth <= btn.clientWidth, { lines, text: btn.textContent, scrollWidth: btn.scrollWidth, clientWidth: btn.clientWidth });
frame.width = savedWidth;
await T.sleep(300);

// 7. The laptop ends the session (its page closes, room deleted): the phone shows That's a wrap.
doc('lap').defaultView.dispatchEvent(new Event('pagehide'));
ok("room end: phone shows That's a wrap", await waitFor(() => T.visible('phA', 'wrapScreen')), T.visible('phA', 'wrapScreen'));
ok('room end: wrap title text', T.text('phA', 'wrapScreen') && /That.s/.test(T.text('phA', 'wrapScreen')));
ok('room end: saved room forgotten (no auto-resume)', doc('phA').defaultView.localStorage.getItem('sunset-room') === null);
await T.sleep(1500);
ok('room end: stays on the wrap screen (no auto rejoin)', T.visible('phA', 'wrapScreen') && !T.visible('phA', 'mainScreen'));
phEl('wrapAgainBtn').click();
ok('"Join again" goes back to code entry', T.visible('phA', 'joinScreen') && !T.visible('phA', 'wrapScreen'));

// 8. Plain load (no ?fakedb): manifest, icons, iOS meta tags, service worker and its shell cache.
// Runs last: the worker controls the /src/remote/ scope, so the phone frames above are not affected.
const plain = document.createElement('iframe');
plain.width = '390'; plain.height = '600';
document.body.appendChild(plain);
const plainLoaded = new Promise((r) => { plain.onload = r; });
plain.src = '../src/remote/';
await plainLoaded;
const pdoc = plain.contentDocument;
const pageUrl = plain.contentWindow.location.href;

const link = pdoc.querySelector('link[rel="manifest"]');
ok('manifest link present', !!link, link && link.getAttribute('href'));
let manifest = null;
let manifestUrl = null;
if (link) {
  manifestUrl = new URL(link.getAttribute('href'), pageUrl).href;
  const res = await fetch(manifestUrl);
  ok('manifest loads (HTTP 200)', res.status === 200, res.status);
  try { manifest = await res.json(); } catch (err) { manifest = null; }
}
ok('manifest parses as JSON', !!manifest);
if (manifest) {
  ok('manifest display standalone', manifest.display === 'standalone', manifest.display);
  const start = new URL(manifest.start_url, manifestUrl).pathname;
  const scope = new URL(manifest.scope, manifestUrl).pathname;
  ok('manifest start_url inside its scope (relative, /remote/)', start.startsWith(scope) && scope.endsWith('/remote/'), { start, scope });
  ok('manifest theme colour is the night token', manifest.theme_color === '#0a0720' && manifest.background_color === '#0a0720');
  const sizes = (manifest.icons || []).filter((i) => i.type === 'image/png').map((i) => i.sizes);
  ok('manifest has 192 and 512 PNG icons', sizes.includes('192x192') && sizes.includes('512x512'), sizes);
  for (const icon of manifest.icons || []) {
    const r = await fetch(new URL(icon.src, manifestUrl));
    ok('icon loads: ' + icon.src, r.status === 200, r.status);
  }
  for (const icon of (manifest.icons || []).filter((i) => i.type === 'image/png')) {
    const img = new Image();
    img.src = new URL(icon.src, manifestUrl).href;
    await img.decode().catch(() => {});
    const want = Number(icon.sizes.split('x')[0]);
    ok('icon decodes at ' + icon.sizes, img.naturalWidth === want && img.naturalHeight === want, { w: img.naturalWidth, h: img.naturalHeight });
  }
}
const apple = pdoc.querySelector('link[rel="apple-touch-icon"]');
ok('apple-touch-icon link present', !!apple);
if (apple) {
  const appleUrl = new URL(apple.getAttribute('href'), pageUrl).href;
  const img = new Image();
  img.src = appleUrl;
  await img.decode().catch(() => {});
  ok('apple-touch-icon is a 180 px PNG', (await fetch(appleUrl)).status === 200 && img.naturalWidth === 180 && img.naturalHeight === 180, { w: img.naturalWidth });
}
const meta = (name) => pdoc.querySelector(`meta[name="${name}"]`);
ok('iOS meta: apple-mobile-web-app-capable yes', meta('apple-mobile-web-app-capable') && meta('apple-mobile-web-app-capable').content === 'yes');
ok('iOS meta: status bar black-translucent', meta('apple-mobile-web-app-status-bar-style') && meta('apple-mobile-web-app-status-bar-style').content === 'black-translucent');
ok('iOS meta: app title', !!meta('apple-mobile-web-app-title') && meta('apple-mobile-web-app-title').content.length > 0);

// Service worker: registers on a plain load (localhost counts as a secure context), caches the shell only.
const swReady = await Promise.race([
  plain.contentWindow.navigator.serviceWorker.ready,
  T.sleep(8000).then(() => null),
]);
ok('service worker registers and activates on a plain /remote/ load', !!swReady, swReady && swReady.active && swReady.active.scriptURL);
if (swReady) ok('service worker scope is /remote/ only', swReady.scope.endsWith('/src/remote/'), swReady.scope);
const cacheNames = await caches.keys();
const shellName = cacheNames.filter((n) => n.startsWith('sunset-remote-'));
ok('one shell cache, named with the build stamp', shellName.length === 1, shellName);
if (shellName.length === 1) {
  const keys = (await (await caches.open(shellName[0])).keys()).map((r) => r.url);
  ok('shell cache holds remote.js, remote.css, tokens.css and the font', ['remote.js', 'remote.css', 'tokens.css', 'anton-latin-400.woff2'].every((f) => keys.some((k) => k.includes(f))), keys.length);
  ok('shell cache holds no Firebase or CDN traffic', keys.every((k) => k.startsWith(location.origin)));
  ok('shell cache holds no fake database', !keys.some((k) => k.includes('fake-db')));
}

// Clean up the test frame and the worker, so the next run starts clean.
plain.remove();
for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister();
for (const name of cacheNames) await caches.delete(name);

const passed = Object.values(report).filter((r) => r.pass === true).length;
const total = Object.values(report).filter((r) => typeof r.pass === 'boolean').length;
report.summary = { passed, total };
return report;
