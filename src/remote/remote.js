// Phone remote (/remote): join a laptop's room with the 6-digit code, then drive the slides:
// Next / Prev buttons, swipe, a thumbnail grid to jump to any page, and the connection status.
// The laptop owns the current page. The phone sends commands and shows what the laptop reports.
import { connectRelay } from '../shared/db.js?v=__V__';
import { prettyCode, deviceName, startHeartbeat, watchPeer, setDot } from '../shared/room.js?v=__V__';

const $ = (id) => document.getElementById(id);
const SAVED_ROOM = 'sunset-room'; // remembered so the app can rejoin after a reload (auto-resume)

const STATUS_TEXT = {
  grey: 'Not connected',
  green: 'Connected',
  yellow: 'Reconnecting…',
  red: 'Disconnected',
};

let relay = null;
let relayError = '';      // why the relay isn't available ('not-configured' or other)
let code = null;          // room we're in, or null
let stopHeartbeat = () => {};
let stopPeer = () => {};
let stopMeta = () => {};
let stopState = () => {};
let stopThumbs = () => {};
let stopTimer = () => {};
let stopOffset = () => {};
let showtimeTimer = 0;

// Slide state from the laptop: current page, page count, and thumbnails (page number -> data URL).
let page = 1;
let pageCount = 0;
let black = false;        // the laptop's black screen (state.black)
const thumbs = new Map();
const cells = new Map(); // page number -> { btn, img } in the grid, rebuilt when the page count changes

function setStatus(color) {
  setDot($('dot'), color);
  $('statusText').textContent = STATUS_TEXT[color];
}

function show(screen) {
  for (const id of ['joinScreen', 'showtimeScreen', 'mainScreen', 'gridScreen']) $(id).hidden = id !== screen;
}

function joinMessage(text, isError) {
  const el = $('joinMsg');
  el.textContent = text;
  el.classList.toggle('error', !!isError);
}

// ---------- Code input ----------
const input = $('codeInput');
input.addEventListener('input', () => {
  input.value = input.value.replace(/\D/g, '').slice(0, 6); // digits only
  $('joinBtn').disabled = input.value.length !== 6;
  if (input.value.length) joinMessage('');
});

$('joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (input.value.length === 6) join(input.value, false);
});

$('letsGoBtn').addEventListener('click', () => {
  clearTimeout(showtimeTimer);
  show('mainScreen');
});

$('disconnectBtn').addEventListener('click', () => {
  endDrag(); // clear the laser first: after the release this phone may no longer write to the room
  // Let go of the room so another phone (or this one later) can pair.
  if (relay && code) {
    relay.update(`rooms/${code}/meta`, { remote: null, remoteName: null }).catch(() => {});
  }
  leave('');
});

// ---------- Slides: buttons, swipe, grid ----------
$('prevBtn').addEventListener('click', () => nav('prev'));
$('nextBtn').addEventListener('click', () => nav('next'));
$('gridBtn').addEventListener('click', () => {
  show('gridScreen');
  const cell = cells.get(page);
  if (cell) cell.btn.scrollIntoView({ block: 'center' }); // open the grid around the current slide
});
$('gridBackBtn').addEventListener('click', () => show('mainScreen'));

// Swipe left = next, swipe right = previous. A mostly vertical move is a scroll, not a swipe.
let swipeX = null;
let swipeY = 0;
const mainEl = $('mainScreen');
mainEl.addEventListener('touchstart', (e) => {
  swipeX = e.touches[0].clientX;
  swipeY = e.touches[0].clientY;
  laserEngaged = false; // a new touch; the laser hold (below) can only start after this
}, { passive: true });
mainEl.addEventListener('touchend', (e) => {
  if (swipeX === null) return;
  const dx = e.changedTouches[0].clientX - swipeX;
  const dy = e.changedTouches[0].clientY - swipeY;
  swipeX = null;
  if (laserEngaged) return; // this touch drew with the laser: no swipe, no page change
  if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) nav(dx < 0 ? 'next' : 'prev');
}, { passive: true });
mainEl.addEventListener('touchcancel', () => { swipeX = null; }, { passive: true });

// Send one command to the laptop. Every tap is its own child in the queue, so fast taps all count.
// The page on screen changes when the laptop reports it back.
function sendCommand(cmd) {
  if (!relay || !code) return;
  relay.push(`rooms/${code}/cmds`, { ...cmd, at: relay.TS }).catch(() => {});
}

// Next / Prev from the buttons or a swipe. It checks the last page the laptop reported,
// not a pending one, so a run of taps still sends one command per tap.
function nav(dir) {
  if (dir === 'next') {
    if (pageCount && page >= pageCount) return; // already on the last slide
    sendCommand({ type: 'next' });
  } else {
    if (page <= 1) return;
    sendCommand({ type: 'prev' });
  }
}

function jumpTo(n) {
  sendCommand({ type: 'goto', page: n });
  show('mainScreen');
}

// ---------- Black screen (M4) ----------
// The laptop owns state.black. The button shows that state and sends the value it wants (on: true / false),
// so a repeated tap can't toggle the screen back by mistake.
function renderBlack() {
  const btn = $('blackBtn');
  btn.textContent = 'Black screen: ' + (black ? 'on' : 'off');
  btn.setAttribute('aria-pressed', String(black));
  btn.classList.toggle('on', black);
}
$('blackBtn').addEventListener('click', () => sendCommand({ type: 'black', on: !black }));

// ---------- Timer (M4) ----------
// The laptop writes timer/startAt (server time) at the first Next. Shown time = server now - startAt,
// so it is computed here and a phone reload simply reads the same start again.
let timerStartAt = null;  // server time of the first Next, or null (not started / reset)
let serverOffsetMs = 0;   // server clock minus this phone's clock
function formatTimer(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? h + ':' + String(m).padStart(2, '0') + ':' + sec : m + ':' + sec; // m:ss, h:mm:ss past an hour
}
function renderTimer() {
  $('timer').textContent = timerStartAt === null ? '0:00' : formatTimer(Date.now() + serverOffsetMs - timerStartAt);
}
setInterval(renderTimer, 500);

// Reset has a confirm step (in-page, not window.confirm). A forgotten confirm closes itself after 6 s.
let resetHide = 0;
function setResetConfirm(on) {
  $('resetConfirm').hidden = !on;
  clearTimeout(resetHide);
  if (on) resetHide = setTimeout(() => setResetConfirm(false), 6000);
}
$('resetBtn').addEventListener('click', () => setResetConfirm(true));
$('resetNo').addEventListener('click', () => setResetConfirm(false));
$('resetYes').addEventListener('click', () => {
  setResetConfirm(false);
  sendCommand({ type: 'resetTimer' });
});

// ---------- Laser pointer (M4) ----------
// Hold a finger on the current slide for LASER_HOLD_MS: a red dot appears on the laptop and follows the
// finger until it lifts. A finger that moves before the hold ends is a swipe, so the laser never starts.
const LASER_HOLD_MS = 150;
const LASER_SLOP_PX = 8;   // movement that turns the touch into a swipe
const LASER_GAP_MS = 66;   // at most ~15 writes per second to the room
const nowBox = $('nowBox');
let laserPid = null;       // pointer that may start or drive a laser drag (null = none)
let laserStart = null;     // where the pointer went down
let laserLast = null;      // latest pointer position
let laserOn = false;       // the laser is drawing
let laserEngaged = false;  // this touch drew with the laser (the swipe handler ignores it)
let laserHold = 0;         // timer for the hold
let laserTrail = 0;        // pending throttled write
let laserSentAt = 0;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// The rectangle the slide picture occupies inside its box (object-fit: contain leaves bars at the sides/top).
// null when no picture is shown yet, so there is nothing to point at.
function slideRect() {
  const img = $('nowImg');
  if (img.hidden || !img.complete || !img.naturalWidth) return null;
  const box = img.getBoundingClientRect();
  const s = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
  const w = img.naturalWidth * s;
  const h = img.naturalHeight * s;
  return { left: box.left + (box.width - w) / 2, top: box.top + (box.height - h) / 2, width: w, height: h };
}

nowBox.addEventListener('pointerdown', (e) => {
  if (laserPid !== null || !code) return;
  laserPid = e.pointerId;
  laserStart = { x: e.clientX, y: e.clientY };
  laserLast = laserStart;
  laserHold = setTimeout(startLaser, LASER_HOLD_MS);
});
nowBox.addEventListener('pointermove', (e) => {
  if (e.pointerId !== laserPid) return;
  laserLast = { x: e.clientX, y: e.clientY };
  if (laserOn) { moveLaser(); return; }
  if (Math.hypot(e.clientX - laserStart.x, e.clientY - laserStart.y) > LASER_SLOP_PX) endDrag(); // a swipe
});
nowBox.addEventListener('pointerup', (e) => { if (e.pointerId === laserPid) endDrag(); });
nowBox.addEventListener('pointercancel', (e) => { if (e.pointerId === laserPid) endDrag(); });

function startLaser() {
  laserHold = 0;
  if (laserPid === null || !slideRect()) { laserPid = null; return; }
  laserOn = true;
  laserEngaged = true;
  nowBox.classList.add('laser-on');
  try { nowBox.setPointerCapture(laserPid); } catch (err) { /* not a real pointer (tests): fine */ }
  moveLaser();
}

// Draw the dot on the phone at once; send to the laptop at most every LASER_GAP_MS.
// A position that arrives inside the gap is sent when the gap ends, so the last spot is never lost.
function moveLaser() {
  const box = nowBox.getBoundingClientRect();
  const dot = $('laserDot');
  dot.style.left = (laserLast.x - box.left) + 'px';
  dot.style.top = (laserLast.y - box.top) + 'px';
  const wait = LASER_GAP_MS - (Date.now() - laserSentAt);
  if (wait <= 0) sendLaser();
  else if (!laserTrail) laserTrail = setTimeout(sendLaser, wait);
}

function sendLaser() {
  laserTrail = 0;
  laserSentAt = Date.now();
  const r = slideRect();
  if (!laserOn || !r || !relay || !code) return;
  // Normalised 0..1 of the slide picture; the laptop maps it onto its own letterboxed slide.
  relay.set(`rooms/${code}/laser`, {
    x: clamp01((laserLast.x - r.left) / r.width),
    y: clamp01((laserLast.y - r.top) / r.height),
  }).catch(() => {});
}

// Finger lifted, cancelled, or a swipe started: stop the hold and remove the dot on the laptop.
// The trailing write is cancelled first so nothing re-creates the node after the removal.
function endDrag() {
  clearTimeout(laserHold);
  laserHold = 0;
  laserPid = null;
  if (!laserOn) return;
  laserOn = false;
  clearTimeout(laserTrail);
  laserTrail = 0;
  nowBox.classList.remove('laser-on');
  if (relay && code) relay.remove(`rooms/${code}/laser`).catch(() => {});
}
// A reload or app switch in the middle of a drag must not leave the dot on the laptop.
window.addEventListener('pagehide', endDrag);

// Build one grid cell per page. Called when the laptop reports the page count.
function setPageCount(n) {
  if (n === pageCount) return;
  pageCount = n;
  cells.clear();
  $('grid').replaceChildren();
  for (let p = 1; p <= n; p++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'thumb-cell';
    const img = document.createElement('img');
    img.alt = '';
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = p;
    btn.append(img, num);
    btn.addEventListener('click', () => jumpTo(p));
    $('grid').append(btn);
    cells.set(p, { btn, img });
    setImg(img, p);
  }
  renderMain();
}

// Show page n's thumbnail, or hide the image until it arrives (the placeholder text shows instead).
function setImg(img, n) {
  const url = thumbs.get(n);
  if (url && img.src !== url) img.src = url;
  img.hidden = !url;
}

// A thumbnail arrived or was removed: update wherever that page is on screen.
function paintThumb(n) {
  if (n === page) setImg($('nowImg'), n);
  if (n === page + 1) setImg($('nextImg'), n);
  const cell = cells.get(n);
  if (cell) setImg(cell.img, n);
}

// Paint the main view from the laptop's page and page count.
function renderMain() {
  const total = pageCount;
  $('pageLabel').textContent = total ? 'Page ' + page + ' of ' + total : 'Waiting for slides…';
  $('nextPh').textContent = total && page >= total ? 'Last slide' : 'Loading…';
  $('prevBtn').disabled = page <= 1;
  $('nextBtn').disabled = !!total && page >= total;
  setImg($('nowImg'), page);
  setImg($('nextImg'), page + 1);
  for (const [n, cell] of cells) cell.btn.classList.toggle('current', n === page);
  renderBlack();
}

function resetSlides() {
  stopState(); stopThumbs(); stopTimer(); stopOffset();
  stopState = stopThumbs = stopTimer = stopOffset = () => {};
  page = 1;
  pageCount = 0;
  black = false;
  timerStartAt = null;
  setResetConfirm(false);
  thumbs.clear();
  cells.clear();
  $('grid').replaceChildren();
  renderMain();
  renderTimer();
}

// ---------- Joining ----------
// resuming = true when rejoining a saved room after a reload: skip the Showtime moment.
async function join(c, resuming) {
  if (!relay) {
    joinMessage(relayError === 'not-configured'
      ? 'The phone link is not set up yet.'
      : "Can't reach the connection service. Check your internet and try again.", true);
    return;
  }
  $('joinBtn').disabled = true;
  joinMessage('Joining…');
  try {
    const meta = await relay.get(`rooms/${c}/meta`);
    if (!meta) {
      forgetRoom();
      joinMessage(resuming ? '' : `No room ${prettyCode(c)}. Check the code on the laptop.`, !resuming);
      return;
    }
    // Resuming after a reload: only if the room is still ours. If the laptop released
    // this phone meanwhile (R), don't grab it back; a backup phone may be pairing.
    if (resuming && meta.remote !== relay.uid) {
      forgetRoom();
      joinMessage('');
      return;
    }
    // One phone at a time: take the room only if nobody (or this phone) holds it.
    const inUse = () => {
      forgetRoom();
      const who = meta.remoteName || 'another phone';
      joinMessage(`In use by ${who}. This room already has a phone. Ask the presenter to press R on the laptop to release it, then try again.`, true);
    };
    if (meta.remote && meta.remote !== relay.uid) { inUse(); return; }
    let res;
    try {
      res = await relay.claim(`rooms/${c}/meta/remote`, relay.uid);
    } catch (err) {
      // Firebase may refuse the claim outright (permission denied) when another phone holds it.
      if (/permission/i.test(String(err && (err.code || err.message)))) { inUse(); return; }
      throw err;
    }
    if (!res.ok) { inUse(); return; }
    try {
      await relay.set(`rooms/${c}/meta/remoteName`, deviceName());
    } catch (err) {
      // Don't leave the room locked by a half-finished join.
      relay.update(`rooms/${c}/meta`, { remote: null }).catch(() => {});
      throw err;
    }
  } catch (err) {
    joinMessage("Couldn't join. Check your internet and try again.", true);
    return;
  } finally {
    $('joinBtn').disabled = input.value.length !== 6;
  }

  code = c;
  relay.remove(`rooms/${c}/laser`).catch(() => {}); // a laser left over from an earlier phone
  try { localStorage.setItem(SAVED_ROOM, c); } catch (err) { /* private mode */ }
  $('roomLabel').textContent = 'Room ' + prettyCode(c);
  joinMessage('');
  input.value = '';

  stopHeartbeat = startHeartbeat(relay, `rooms/${c}/hb/remote`);
  stopPeer = watchPeer(relay, `rooms/${c}/hb/laptop`, setStatus);
  stopMeta = relay.on(`rooms/${c}/meta`, (meta) => {
    if (!meta) leave('The session ended on the laptop.');
    else if (meta.remote !== relay.uid) leave('The laptop released this phone. Type the code to join again.');
    else setPageCount(meta.pageCount || 0);
  });
  // The laptop's current page, and its thumbnails (they arrive one by one, so listen to children).
  stopState = relay.on(`rooms/${c}/state`, (s) => {
    page = s && s.page ? s.page : 1;
    black = !!(s && s.black);
    renderMain();
  });
  stopTimer = relay.on(`rooms/${c}/timer`, (t) => {
    timerStartAt = t && typeof t.startAt === 'number' ? t.startAt : null;
    renderTimer();
  });
  stopOffset = relay.serverOffset((ms) => { serverOffsetMs = ms; renderTimer(); });
  stopThumbs = relay.children(`rooms/${c}/thumbs`, {
    added: (key, url) => { thumbs.set(Number(key), url); paintThumb(Number(key)); },
    removed: (key) => { thumbs.delete(Number(key)); paintThumb(Number(key)); },
  });

  if (resuming) {
    show('mainScreen');
  } else {
    show('showtimeScreen');
    showtimeTimer = setTimeout(() => show('mainScreen'), 2500);
  }
}

// Back to the join screen, with an optional message explaining why.
function leave(message) {
  endDrag();
  stopHeartbeat(); stopPeer(); stopMeta();
  stopHeartbeat = stopPeer = stopMeta = () => {};
  clearTimeout(showtimeTimer);
  code = null;
  forgetRoom();
  resetSlides();
  $('roomLabel').textContent = '';
  setStatus('grey');
  show('joinScreen');
  joinMessage(message, false);
}

function forgetRoom() {
  try { localStorage.removeItem(SAVED_ROOM); } catch (err) { /* ignore */ }
}

// ---------- Start ----------
setStatus('grey');
show('joinScreen');

(async () => {
  try {
    relay = await connectRelay();
  } catch (err) {
    relayError = err.message;
    joinMessage(err.message === 'not-configured'
      ? 'The phone link is not set up yet.'
      : "Can't reach the connection service. Check your internet.", true);
    return;
  }
  // From a scanned QR code (…/remote/?room=482913) or a remembered room.
  const fromUrl = (new URLSearchParams(location.search).get('room') || '').replace(/\D/g, '');
  let saved = null;
  try { saved = localStorage.getItem(SAVED_ROOM); } catch (err) { /* ignore */ }
  if (fromUrl.length === 6) join(fromUrl, fromUrl === saved);
  else if (saved) join(saved, true);
})();
