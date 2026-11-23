// Laptop viewer: shows the PDF full screen, reacts to the keyboard / Bluetooth clickers,
// and (M2) opens a room that one phone can pair with.
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

// ---------- Opening the PDF ----------
fileEl.addEventListener('change', async () => {
  const file = fileEl.files[0];
  if (!file) return;
  showMsg('Opening…');
  try {
    engine = await enginePromise;
  } catch (err) {
    showMsg("Can't load the PDF engine. This page needs internet.", true);
    fileEl.value = '';
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
  let r = null;
  try { r = await relayPromise; } catch (err) { /* keyboard only */ }
  if (!r) {
    setDot(dotEl, 'grey');
    showStage();
    return;
  }
  try {
    if (!room) await withTimeout(createRoom(r), 8000);
    else relay.set(`rooms/${room}/meta/pageCount`, pdf.numPages).catch(() => {});
    // Already paired (a new PDF picked mid-service): straight back to the slides.
    if (remoteUid) showStage();
    else showPairing();
  } catch (err) {
    console.warn('Could not create a room:', err);
    setDot(dotEl, 'red');
    showStage();
  }
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
  stopPeer = watchPeer(relay, `rooms/${room}/hb/remote`, (color) => setDot(dotEl, color));
  updatePairStatus();
  if (onStartScreen()) showMoment();
}

function phoneLeft() {
  stopPeer();
  stopPeer = () => {};
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
  stopHeartbeat(); stopPeer(); stopMeta();
  stopHeartbeat = stopPeer = stopMeta = () => {};
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
    // 5 minutes of margin, in case this laptop's clock runs ahead of Firebase's.
    const keys = await relay.staleKeys('roomIndex', Date.now() - IDLE_MS - 5 * 60 * 1000);
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
  else if (NEXT_KEYS.includes(k)) goTo(page + 1, prefetch);
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
