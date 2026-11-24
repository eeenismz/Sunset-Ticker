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
let showtimeTimer = 0;

// Slide state from the laptop: current page, page count, and thumbnails (page number -> data URL).
let page = 1;
let pageCount = 0;
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
}, { passive: true });
mainEl.addEventListener('touchend', (e) => {
  if (swipeX === null) return;
  const dx = e.changedTouches[0].clientX - swipeX;
  const dy = e.changedTouches[0].clientY - swipeY;
  swipeX = null;
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
}

function resetSlides() {
  stopState(); stopThumbs();
  stopState = stopThumbs = () => {};
  page = 1;
  pageCount = 0;
  thumbs.clear();
  cells.clear();
  $('grid').replaceChildren();
  renderMain();
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
    renderMain();
  });
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
