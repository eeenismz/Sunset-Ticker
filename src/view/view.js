// Laptop viewer: shows the PDF full screen, reacts to the keyboard / Bluetooth clickers,
// and (M2) opens a room that one phone can pair with, then (M3) applies the phone's
// commands and sends it the slide state and thumbnails.
import { connectRelay, useFake } from '../shared/db.js?v=__V__';
import { newCode, prettyCode, startHeartbeat, watchPeer, setDot, IDLE_MS } from '../shared/room.js?v=__V__';

const $ = (id) => document.getElementById(id);
const startEl = $('start');
const stageEl = $('stage');
const slideEl = $('slide');
const blackEl = $('black');
const hintEl = $('hint');
const msgEl = $('msg');
const fileEl = $('file');
const dotEl = $('dot');
const laserEl = $('laser');

// ---------- PDF engine and relay, both loaded right away ----------
// The PDF engine comes from the CDN. Load it dynamically so that if the internet
// or the CDN is down, the page still runs and can say so (a static import would
// silently stop the whole script).
const enginePromise = import('./pdf-render.js?v=__V__');
enginePromise.catch(() => showMsg("Can't load the PDF engine. This page needs internet.", true));

// The relay (Firebase) connects in the background. If it fails or isn't set up,
// the laptop simply works keyboard-only.
const relayPromise = connectRelay();
relayPromise.catch((err) => console.warn('Phone link unavailable:', err.message));

let engine = null;     // the pdf-render.js module once loaded
let pdf = null;        // the open PDF document
let page = 1;          // current page (1-based)
let black = false;     // black screen on/off
let gen = 0;           // bumped on resize so renders made for the old size are ignored
const cache = new Map(); // page number -> render job, only pages near the current one

function showMsg(text, isError) {
  msgEl.textContent = text;
  msgEl.classList.toggle('error', !!isError);
}

// ---------- Loading screen (while the PDF opens and the room is set up) ----------
// Edit the tips here. Keep each one short: it is read at a glance.
const TIPS = [
  'Press B to black the screen, for example during prayer. The slides stay where they are.',
  'Go full screen (F) before people arrive, so nobody sees the "press Esc" banner.',
  'Phone acting up? Press R to release it, then pair a backup phone.',
  'Your PDF never leaves this laptop. The phone only gets small previews.',
  'Keyboard and Bluetooth clickers always work, even without the phone.',
];
const LOADING_MIN_MS = 1200; // stay at least this long, so a fast open doesn't just flash
const loadingEl = $('loading');
const tipEl = $('loadingTip');
let loadingGen = 0;          // bumped by every show / hide, so an older hide can't close a newer show
let loadingShownAt = 0;
let tipTimer = 0;
let tipIndex = Math.floor(Math.random() * TIPS.length);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Show the loading screen (or just update it) with a status line and bar fill (0 to 1).
function showLoading(status, progress) {
  loadingGen++;
  if (loadingEl.hidden || loadingEl.classList.contains('out')) {
    loadingEl.classList.remove('out');
    loadingEl.hidden = false;
    loadingShownAt = Date.now();
    tipEl.textContent = TIPS[tipIndex];
    clearInterval(tipTimer);
    tipTimer = setInterval(nextTip, 4500);
  }
  $('loadingStatus').textContent = status;
  loadingEl.style.setProperty('--progress', progress);
}

// Next tip with a short cross-fade.
function nextTip() {
  tipEl.classList.add('fading');
  setTimeout(() => {
    tipIndex = (tipIndex + 1) % TIPS.length;
    tipEl.textContent = TIPS[tipIndex];
    tipEl.classList.remove('fading');
  }, 400);
}

// Fill the bar, wait out the minimum time, then fade away. The screen underneath
// (pairing, slides or the error message) is already in place when this is called.
async function hideLoading() {
  if (loadingEl.hidden) return;
  const my = ++loadingGen;
  loadingEl.style.setProperty('--progress', 1);
  const wait = LOADING_MIN_MS - (Date.now() - loadingShownAt);
  if (wait > 0) await sleep(wait);
  if (my !== loadingGen) return; // a new PDF pick started meanwhile
  loadingEl.classList.add('out');
  await sleep(400);              // matches the CSS fade
  if (my !== loadingGen) return;
  loadingEl.hidden = true;
  loadingEl.classList.remove('out');
  clearInterval(tipTimer);
}

// ---------- Opening the PDF ----------
fileEl.addEventListener('change', async () => {
  const file = fileEl.files[0];
  if (!file) return;
  showMsg('');
  showLoading('Opening your slides…', 0.35);
  try {
    engine = await enginePromise;
  } catch (err) {
    showMsg("Can't load the PDF engine. This page needs internet.", true);
    fileEl.value = '';
    hideLoading();
    return;
  }
  let doc;
  try {
    doc = await engine.openPdf(file);
  } catch (err) {
    showMsg(err && err.name === 'PasswordException'
      ? 'This PDF is password protected. Save a copy without a password and try again.'
      : 'Could not open that file. Please pick a PDF.', true);
    fileEl.value = '';
    hideLoading();
    return;
  }
  // A newly picked PDF replaces the old one (same room, same phone).
  for (const k of [...cache.keys()]) evict(k);
  pdf = doc;
  fileEl.value = ''; // so picking the same file again still fires "change"
  showMsg('');
  $('fileName').textContent = file.name;
  $('filePages').textContent = pdf.numPages + (pdf.numPages === 1 ? ' page ready' : ' pages ready');
  goTo(1);
  keepAwake();
  activity();

  // Pair a phone if the relay works; otherwise go straight to the slides (keyboard only).
  if (!room) showLoading('Setting up the room…', 0.7);
  let r = null;
  try { r = await relayPromise; } catch (err) { /* keyboard only */ }
  if (!r) {
    setDot(dotEl, 'grey');
    showStage();
    hideLoading();
    return;
  }
  try {
    if (!room) await withTimeout(createRoom(r), 8000);
    else {
      relay.set(`rooms/${room}/meta/pageCount`, pdf.numPages).catch(() => {});
      startThumbs(); // a new PDF: the phone gets fresh thumbnails
    }
    // Already paired (a new PDF picked mid-service): straight back to the slides.
    if (remoteUid) showStage();
    else showPairing();
  } catch (err) {
    console.warn('Could not create a room:', err);
    setDot(dotEl, 'red');
    showStage();
  }
  hideLoading();
});

// Firebase calls can hang while offline; give up after ms so the laptop falls back to keyboard-only.
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

// ---------- Screens ----------
// Start screen in "waiting for phone" state: QR + room code.
function showPairing() {
  clearTimeout(momentTimer);
  $('moment').hidden = true;
  stageEl.hidden = true;
  startEl.hidden = false;
  $('fileChip').hidden = false;
  $('leadPick').hidden = true;
  $('leadPair').hidden = false;
  $('fileBtn').classList.add('ghost');
  $('fileBtnText').textContent = 'Choose another PDF';
  $('startNoPhone').hidden = false;
  $('pairHow').hidden = false;
  $('pairStatus').hidden = false;
  updatePairStatus();
}

function showStage() {
  clearTimeout(momentTimer);
  $('moment').hidden = true;
  startEl.hidden = true;
  stageEl.hidden = false;
  hintEl.hidden = !!document.fullscreenElement;
}

const onStartScreen = () => pdf && !startEl.hidden;

$('startNoPhone').addEventListener('click', showStage);

// "CONNECTED · iPhone · iOS 18" for about 2 s, then the slides.
let momentTimer = 0;
function showMoment() {
  $('momentDevice').textContent = remoteName;
  startEl.hidden = true;
  $('moment').hidden = false;
  clearTimeout(momentTimer);
  momentTimer = setTimeout(showStage, 2000);
}

// ---------- Room (pairing with one phone) ----------
let relay = null;      // the connected relay, once a room exists
let serverOffsetMs = 0; // server clock minus this laptop's clock (0 with the fake relay)
let room = null;       // 6-digit room code
let remoteUid = null;  // the paired phone's id, or null
let remoteName = '';
let stopHeartbeat = () => {};
let stopPeer = () => {};
let stopMeta = () => {};

// Only one room creation at a time (a second PDF pick or a double R while the
// first is still waiting on the network would otherwise start two rooms).
let creating = null;
function createRoom(r) {
  if (!creating) creating = doCreateRoom(r).finally(() => { creating = null; });
  return creating;
}

async function doCreateRoom(r) {
  relay = r;
  relay.serverOffset((ms) => { serverOffsetMs = ms; });
  cleanupStaleRooms();
  for (let tries = 0; tries < 5 && !room; tries++) {
    const code = newCode();
    if (await relay.get(`rooms/${code}/meta`)) continue; // code taken, pick another
    try {
      // Room and its index entry are written together (one atomic update).
      await relay.update('', {
        [`rooms/${code}/meta`]: { owner: relay.uid, createdAt: relay.TS, pageCount: pdf.numPages },
        [`roomIndex/${code}`]: relay.TS,
      });
      room = code;
    } catch (err) { /* collision or rules: try another code */ }
  }
  if (!room) throw new Error('no free room code');

  renderQr();
  stopHeartbeat = startHeartbeat(relay, `rooms/${room}/hb/laptop`);
  stopMeta = relay.on(`rooms/${room}/meta`, onMeta);
  listenCommands();   // taps from the phone
  listenLaser();      // the phone's laser pointer
  publishState(true); // so a phone that joins sees the current page
  startThumbs();      // previews for the phone's grid
  setDot(dotEl, 'grey');
}

// The room's meta changed: a phone paired, changed name, left, or the room is gone.
function onMeta(meta) {
  if (!meta) { roomGone(); return; }
  const r = meta.remote || null;
  if (r && r !== remoteUid) {
    remoteUid = r;
    remoteName = meta.remoteName || 'Phone';
    phonePaired();
  } else if (r && meta.remoteName && meta.remoteName !== remoteName) {
    remoteName = meta.remoteName; // the name arrives just after the claim
    $('momentDevice').textContent = remoteName;
    updatePairStatus();
  } else if (!r && remoteUid) {
    remoteUid = null;
    remoteName = '';
    phoneLeft();
  }
}

function phonePaired() {
  activity();
  stopPeer();
  stopPeer = watchPeer(relay, `rooms/${room}/hb/remote`, (color) => {
    setDot(dotEl, color);
    if (color === 'red') hideLaser(); // phone went quiet: don't leave a dot stuck on screen
  });
  updatePairStatus();
  if (onStartScreen()) showMoment();
}

function phoneLeft() {
  stopPeer();
  stopPeer = () => {};
  hideLaser();
  setDot(dotEl, 'grey');
  updatePairStatus();
}

function updatePairStatus() {
  const dot = $('pairStatus').querySelector('.dot');
  if (remoteUid) {
    $('pairStatusText').textContent = 'Connected: ' + remoteName;
    dot.classList.remove('pulse');
    setDot(dot, 'green');
  } else {
    $('pairStatusText').textContent = 'Waiting for your phone';
    dot.classList.add('pulse');
    setDot(dot, 'grey');
  }
}

// R key: let go of the current phone (e.g. its battery died) and show the QR again.
async function releasePhone() {
  if (!relay || !pdf) return;
  if (!room) { // session ended earlier (idle): open a fresh room
    try { await withTimeout(createRoom(relay), 8000); } catch (err) { return; }
  } else if (remoteUid) {
    relay.update(`rooms/${room}/meta`, { remote: null, remoteName: null }).catch(() => {});
  }
  showPairing();
}

// Stop all room activity locally (the room was deleted, or we're ending it).
function leaveRoom() {
  stopHeartbeat(); stopPeer(); stopMeta(); stopCmds(); stopLaser();
  stopHeartbeat = stopPeer = stopMeta = stopCmds = stopLaser = () => {};
  thumbRun++;         // stops a thumbnail loop still running
  published = null;
  timerArmed = false;
  hideLaser();
  room = null;
  remoteUid = null;
  remoteName = '';
  setDot(dotEl, 'grey');
  resetPairCard();
}

function roomGone() {
  if (!room) return;
  leaveRoom();
  if (onStartScreen()) showStage(); // nothing to pair with any more; keyboard still works
}

// Delete our room (session over). Best effort: also used when the tab closes.
function endSession() {
  if (!room || !relay) return;
  relay.update('', { [`rooms/${room}`]: null, [`roomIndex/${room}`]: null }).catch(() => {});
  leaveRoom();
}
window.addEventListener('pagehide', endSession);

function resetPairCard() {
  const qrEl = $('qr');
  qrEl.classList.add('empty');
  qrEl.textContent = 'Pick a PDF and your QR code appears here';
  $('roomCode').textContent = '--- ---';
  $('roomCode').classList.add('empty');
}

// QR code pointing at the phone page with this room, e.g. …/remote/?room=482913
let qrLib = null;
async function renderQr() {
  const code = room;
  const url = new URL('../remote/?room=' + code + (useFake ? '&fakedb' : ''), location.href).href;
  $('roomCode').textContent = prettyCode(code);
  $('roomCode').classList.remove('empty');
  const qrEl = $('qr');
  try {
    qrLib = qrLib || (await import('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm')).default;
    const qr = qrLib(0, 'M');
    qr.addData(url);
    qr.make();
    if (code !== room) return; // room changed while loading
    qrEl.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    qrEl.classList.remove('empty');
  } catch (err) {
    qrEl.textContent = 'QR code unavailable. Type the code in the app.';
  }
}

// Rooms idle over 2 hours are deleted by the next laptop that opens a room
// (no server needed). Failures are ignored; the next session tries again.
async function cleanupStaleRooms() {
  try {
    // The live rules only accept an exact cutoff (a `<=` on query.endAt never passes), so the
    // cutoff is Firebase time minus 2 h, rounded down to the minute, minus 2 minutes. The rules
    // allow 1-3 minutes back, which leaves about a minute either way for clock drift.
    const t = Date.now() + serverOffsetMs - IDLE_MS;
    const keys = await relay.staleKeys('roomIndex', t - (t % 60000) - 2 * 60 * 1000);
    for (const k of keys.slice(0, 20)) {
      relay.update('', { [`rooms/${k}`]: null, [`roomIndex/${k}`]: null }).catch(() => {});
    }
  } catch (err) { /* not allowed or offline: skip */ }
}

// Idle tracking: "activity" = slide changes and pairing. The room's index entry is
// refreshed at most once a minute; after 2 hours with no activity the session ends.
let lastActivity = Date.now();
let activitySinceIndex = false;
function activity() {
  lastActivity = Date.now();
  activitySinceIndex = true;
}
setInterval(() => {
  if (!room || !relay) return;
  if (Date.now() - lastActivity > IDLE_MS) { endSession(); return; }
  if (activitySinceIndex) {
    activitySinceIndex = false;
    relay.set(`roomIndex/${room}`, relay.TS).catch(() => {});
  }
}, 60 * 1000);

// ---------- Phone link: state, commands and thumbnails (M3) ----------
// The laptop alone writes rooms/<code>/state, so it stays the source of truth.
let published = null; // last state written, to skip repeat writes
function publishState(force) {
  if (!room || !relay) return;
  const s = { page, black };
  if (!force && published && published.page === s.page && published.black === s.black) return;
  published = s;
  relay.update(`rooms/${room}/state`, s).catch(() => {});
}

// The phone pushes {type, page?, at} into rooms/<code>/cmds. Each one is applied in arrival
// order and then removed, so a fast run of taps is never lost and nothing is replayed later.
let stopCmds = () => {};
// A command older than this (server time) was sent before a dropout or a long pause; skip it.
const STALE_CMD_MS = 10000;
function listenCommands() {
  stopCmds();
  stopCmds = relay.children(`rooms/${room}/cmds`, {
    added: (key, cmd) => {
      relay.remove(`rooms/${room}/cmds/${key}`).catch(() => {});
      // Taps queued while the laptop was offline arrive in a burst on reconnect; replaying them would
      // jump several slides at once. Removed above, but not applied. The phone's `at` is server time,
      // so compare it with the server's now (local clock + offset).
      if (cmd && typeof cmd.at === 'number' && Date.now() + serverOffsetMs - cmd.at > STALE_CMD_MS) return;
      applyCommand(cmd);
    },
  });
}

function applyCommand(cmd) {
  if (!pdf || !cmd) return;
  activity(); // a phone tap is presenter activity, so the 2 h idle end doesn't fire mid-service
  // Like a slide key: a tap on the phone starts presenting from the current slide.
  if (onStartScreen() || !$('moment').hidden) showStage();
  if (cmd.type === 'next') nextSlide(true);
  else if (cmd.type === 'prev') goTo(page - 1);
  else if (cmd.type === 'goto' && Number.isInteger(cmd.page)) goTo(cmd.page);
  // The phone sends the wanted value (on: true/false), so a repeated tap can't toggle back by mistake.
  else if (cmd.type === 'black') { if (typeof cmd.on !== 'boolean' || cmd.on !== black) toggleBlack(); }
  else if (cmd.type === 'resetTimer') resetTimer();
}

// ---------- Timer (M4) ----------
// Counts up from the first forward flip (Next key or phone Next). The start time is kept in the room
// as timer/startAt (server time), so a phone reload keeps it. Grid jumps and Home/End don't start it.
let timerArmed = false; // true once startAt has been written in this room (cleared by reset and by leaving)
function startTimer() {
  if (timerArmed || !room || !relay) return;
  timerArmed = true;
  relay.set(`rooms/${room}/timer/startAt`, relay.TS).catch(() => { timerArmed = false; });
}
function resetTimer() {
  timerArmed = false; // the next forward flip starts it again
  if (room && relay) relay.set(`rooms/${room}/timer/startAt`, null).catch(() => {});
}

// One forward slide, and start the timer on the first one.
function nextSlide(prefetch) {
  if (!pdf || page >= pdf.numPages) return;
  startTimer();
  goTo(page + 1, prefetch);
}

// ---------- Laser pointer (M4) ----------
// While a finger is held on the phone's slide, the phone writes {x, y} (0..1 of the slide image) to
// rooms/<code>/laser. Here the red dot is drawn over the slide canvas, which is already letterboxed.
// Only the phone can clear its laser node, so the dot is also hidden when no phone is paired.
let stopLaser = () => {};
function listenLaser() {
  stopLaser();
  stopLaser = relay.on(`rooms/${room}/laser`, (p) => {
    if (!p || !remoteUid) hideLaser();
    else showLaserAt(p);
  });
}

function showLaserAt(p) {
  const canvas = slideEl.querySelector('canvas');
  if (!canvas || stageEl.hidden || !Number.isFinite(p.x) || !Number.isFinite(p.y)) { hideLaser(); return; }
  const r = canvas.getBoundingClientRect(); // the slide as it is on screen (letterbox included)
  laserEl.style.left = (r.left + p.x * r.width) + 'px';
  laserEl.style.top = (r.top + p.y * r.height) + 'px';
  laserEl.hidden = false;
}

function hideLaser() {
  laserEl.hidden = true;
}

// Thumbnails for the phone: each page is rendered at 320 px (JPEG, quality 0.75) and written to
// rooms/<code>/thumbs/<n>. Pages near the current one go first. One page at a time with a short
// pause between pages, so a slide flip never waits behind a thumbnail.
let thumbRun = 0; // bumped to stop an older loop when a new one starts or the room closes
const THUMB_MAX_CHARS = 40000; // size cap per thumbnail (database.rules.json has the same cap)
async function startThumbs() {
  const run = ++thumbRun;
  const code = room;
  const doc = pdf;
  try { await relay.remove(`rooms/${code}/thumbs`); } catch (err) { /* nothing to clear */ }
  for (const n of pageOrder(doc.numPages, page)) {
    if (run !== thumbRun || room !== code) return;
    try {
      let url = await engine.renderThumb(doc, n, 320, 0.75);
      if (url.length > THUMB_MAX_CHARS) url = await engine.renderThumb(doc, n, 320, 0.45); // a busy page: smaller JPEG
      if (run !== thumbRun || room !== code) return; // checked right before the write
      if (url.length <= THUMB_MAX_CHARS) relay.set(`rooms/${code}/thumbs/${n}`, url).catch(() => {});
    } catch (err) {
      console.warn('Thumbnail ' + n + ' failed', err);
    }
    await new Promise((r) => setTimeout(r, 20)); // let slide flips and taps run first
  }
}

// Page numbers from `from` outward (from, from+1, from-1, from+2, ...), each one once.
function pageOrder(total, from) {
  const seen = new Set();
  const out = [];
  for (let d = 0; out.length < total; d++) {
    for (const n of [from + d, from - d]) {
      if (n >= 1 && n <= total && !seen.has(n)) { seen.add(n); out.push(n); }
    }
  }
  return out;
}

// ---------- Render cache ----------
function getJob(n) {
  if (!cache.has(n)) {
    const job = engine.renderPage(pdf, n, window.innerWidth, window.innerHeight);
    job.promise.catch((err) => {
      if (job.cancelled) return;
      console.error('Page ' + n + ' failed to render', err);
      if (cache.get(n) === job) cache.delete(n); // retried on the next visit
    });
    cache.set(n, job);
  }
  return cache.get(n);
}

// Drop a page from the cache: stop its render and free its pixels,
// unless that canvas is the one on screen right now.
function evict(n) {
  const job = cache.get(n);
  cache.delete(n);
  job.cancel();
  if (job.canvas && job.canvas !== slideEl.firstChild) engine.freeCanvas(job.canvas);
}

function isCached(canvas) {
  for (const job of cache.values()) if (job.canvas === canvas) return true;
  return false;
}

// ---------- Showing pages ----------
// prefetch = false while a key is held down, so auto-repeat doesn't start dozens of renders.
function goTo(n, prefetch = true) {
  if (!pdf) return;
  n = Math.max(1, Math.min(pdf.numPages, n));
  page = n;
  publishState();
  const myGen = gen;

  // Keep the old slide on screen until the new one is ready (no blank flash),
  // and drop the result if the presenter already moved on or the window resized.
  getJob(n).promise.then((canvas) => {
    if (n !== page || myGen !== gen) return;
    const old = slideEl.firstChild;
    slideEl.replaceChildren(canvas);
    if (old && old !== canvas && !isCached(old)) engine.freeCanvas(old);
  }).catch(() => {});

  // Pre-render the neighbours so the next flip is instant.
  if (prefetch) {
    if (n < pdf.numPages) getJob(n + 1);
    if (n > 1) getJob(n - 1);
  }

  // Free memory: forget pages more than 2 away.
  for (const k of [...cache.keys()]) {
    if (Math.abs(k - n) > 2) evict(k);
  }
}

// Window size changes (full screen on/off, projector resolution): render again at the new size.
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!pdf) return;
    gen++;
    for (const k of [...cache.keys()]) evict(k);
    goTo(page);
  }, 150);
});

// ---------- Black screen ----------
// Changing slides while black keeps the screen black, so the next slide
// can be lined up during a prayer. Only B / "." (or the phone, later) turns it off.
function toggleBlack() {
  black = !black;
  blackEl.classList.toggle('on', black);
  publishState();
}

// ---------- Full screen ----------
// Browsers only allow full screen right after a click or key press, so it can't start by itself.
function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}
stageEl.addEventListener('click', () => {
  if (!document.fullscreenElement) toggleFullscreen();
});

// The hint shows whenever the slide is not full screen (also after Esc), and hides in full screen.
document.addEventListener('fullscreenchange', () => {
  hintEl.hidden = !!document.fullscreenElement;
});

// ---------- Keyboard and Bluetooth clickers ----------
// Clickers send the same keys as a keyboard (arrows / PageUp / PageDown, some send "." or B for black).
const NEXT_KEYS = ['ArrowRight', 'ArrowDown', 'PageDown', ' '];
const PREV_KEYS = ['ArrowLeft', 'ArrowUp', 'PageUp'];

document.addEventListener('keydown', (e) => {
  if (!pdf || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  const prefetch = !e.repeat;
  const isSlideKey = NEXT_KEYS.includes(k) || PREV_KEYS.includes(k) || k === 'Home' || k === 'End';

  // While the QR / "Connected" screen shows, a slide key just starts presenting
  // (from the current slide) without a phone, so a clicker alone is always enough.
  if (isSlideKey && (onStartScreen() || !$('moment').hidden)) {
    e.preventDefault();
    activity();
    showStage();
    return;
  }

  let handled = true;
  if (k === ' ' && e.shiftKey) goTo(page - 1, prefetch);
  else if (NEXT_KEYS.includes(k)) nextSlide(prefetch);
  else if (PREV_KEYS.includes(k)) goTo(page - 1, prefetch);
  else if (k === 'Home') goTo(1);
  else if (k === 'End') goTo(pdf.numPages);
  else if (k === 'b' || k === 'B' || k === '.') toggleBlack();
  else if (k === 'f' || k === 'F') { if (startEl.hidden === false) showStage(); toggleFullscreen(); }
  else if (k === 'r' || k === 'R') releasePhone();
  else handled = false;

  if (handled) {
    e.preventDefault(); // stop Space / arrows from scrolling
    activity();
  }
});

// After a held key is released, pre-render the neighbours that were skipped.
document.addEventListener('keyup', () => {
  if (pdf) goTo(page);
});

// ---------- Keep the laptop screen awake ----------
// The wake lock is dropped when the tab is hidden, so ask again when it comes back.
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      await navigator.wakeLock.request('screen');
    }
  } catch (err) {
    // Not allowed (e.g. battery saver): the slides still work, the screen may just dim.
  }
}
document.addEventListener('visibilitychange', () => {
  if (pdf && document.visibilityState === 'visible') keepAwake();
});
