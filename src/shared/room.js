// Room helpers shared by the laptop (/view) and the phone (/remote).

export const HEARTBEAT_MS = 2000;     // each side writes a heartbeat this often
export const YELLOW_AFTER_MS = 3500;  // one missed heartbeat → yellow
export const RED_AFTER_MS = 10000;    // ~10 s of silence → red
export const IDLE_MS = 2 * 60 * 60 * 1000; // rooms idle this long are deleted

// Random 6-digit room code, e.g. "048213".
export function newCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, '0');
}

// "048213" → "048 213" (easier to read off a projector)
export const prettyCode = (code) => code.slice(0, 3) + ' ' + code.slice(3);

// A short device label like "iPhone · iOS 18". Browsers don't expose the real
// device name ("Ee's iPhone"), so this comes from the user agent.
export function deviceName() {
  const ua = navigator.userAgent;
  let m = ua.match(/iPhone OS (\d+)/);
  if (m) return 'iPhone · iOS ' + m[1];
  m = ua.match(/iPad.*OS (\d+)/);
  if (m) return 'iPad · iPadOS ' + m[1];
  m = ua.match(/Android (\d+)/);
  if (m) return 'Android ' + m[1];
  if (/Macintosh/.test(ua)) return 'Mac · ' + browserName(ua);
  if (/Windows/.test(ua)) return 'Windows · ' + browserName(ua);
  return browserName(ua);
}
function browserName(ua) {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  if (/Firefox\//.test(ua)) return 'Firefox';
  return 'Browser';
}

// Write our heartbeat every 2 s. Returns a stop function.
export function startHeartbeat(relay, path) {
  const beat = () => relay.set(path, relay.TS).catch(() => {});
  beat();
  const t = setInterval(beat, HEARTBEAT_MS);
  return () => clearInterval(t);
}

// Watch the other side's heartbeat and our own connection, and report
// 'green' | 'yellow' | 'red' through onColor whenever it changes.
// Ages are measured with this device's own clock (time since the last heartbeat
// *arrived*), so a clock difference between laptop and phone doesn't matter.
export function watchPeer(relay, peerPath, onColor) {
  const start = performance.now();
  let lastSeen = start;   // the first snapshot may be an old value, so don't trust it
  let first = true;
  let online = true;
  let offlineSince = 0;
  let color = '';

  const unsubHb = relay.on(peerPath, () => {
    if (first) { first = false; return; }
    lastSeen = performance.now();
    tick();
  });
  const unsubConn = relay.connected((up) => {
    online = up;
    offlineSince = up ? 0 : performance.now();
    // Back online: give the other side a fresh heartbeat window instead of
    // flashing red because the last beat is old.
    if (up) lastSeen = performance.now();
    tick();
  });

  function tick() {
    const now = performance.now();
    let c;
    if (!online) c = now - offlineSince > RED_AFTER_MS ? 'red' : 'yellow';
    else {
      const age = now - lastSeen;
      c = age <= YELLOW_AFTER_MS ? 'green' : age <= RED_AFTER_MS ? 'yellow' : 'red';
    }
    if (c !== color) { color = c; onColor(c); }
  }
  const timer = setInterval(tick, 500);
  tick();

  return () => { clearInterval(timer); unsubHb(); unsubConn(); };
}

// Set the status dot's colour class (grey / green / yellow / red).
export function setDot(el, color) {
  el.classList.remove('grey', 'green', 'yellow', 'red');
  el.classList.add(color);
}
