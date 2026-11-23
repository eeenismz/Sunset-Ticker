// Phone remote (/remote): join a laptop's room with the 6-digit code, keep the
// connection status, and leave again. Slide controls come in M3.
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
let showtimeTimer = 0;

function setStatus(color) {
  setDot($('dot'), color);
  $('statusText').textContent = STATUS_TEXT[color];
}

function show(screen) {
  for (const id of ['joinScreen', 'showtimeScreen', 'mainScreen']) $(id).hidden = id !== screen;
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
