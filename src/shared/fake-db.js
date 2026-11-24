// TEST ONLY (never copied to dist/): a stand-in for Firebase that keeps the data
// in localStorage, so a laptop tab and phone tabs in the same browser can talk.
// Same API as the Firebase wrapper in db.js. No security rules are applied here.

const KEY = 'sunset-fakedb';
const TS_MARK = { '.sv': 'timestamp' };
let offline = false;      // setOffline(true) simulates this tab losing its connection
const listeners = new Set();
const childListeners = new Set();   // children() subscriptions: { path, h, seen }
const connListeners = new Set();

// Each page gets its own id; ?fakeuid=name overrides it (to act as a second phone).
const params = new URLSearchParams(location.search);
const uidKey = 'sunset-fakeuid:' + location.pathname;
export const uid = params.get('fakeuid') || localStorage.getItem(uidKey) ||
  (() => { const u = 'u' + Math.random().toString(36).slice(2, 10); localStorage.setItem(uidKey, u); return u; })();
export const TS = TS_MARK;

const parts = (path) => path.split('/').filter(Boolean);
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const valueAt = (tree, path) => parts(path).reduce((o, k) => (o == null ? null : (o[k] ?? null)), tree);

// Replace the server-time marker with the current time, recursively.
function resolveTs(v) {
  if (v && typeof v === 'object') {
    if (v['.sv'] === 'timestamp') return Date.now();
    const out = {};
    for (const k of Object.keys(v)) out[k] = resolveTs(v[k]);
    return out;
  }
  return v;
}

// Remove empty objects, like Firebase does (a room with no children no longer exists).
function prune(o) {
  if (!o || typeof o !== 'object') return o;
  for (const k of Object.keys(o)) {
    o[k] = prune(o[k]);
    if (o[k] === null || o[k] === undefined || (typeof o[k] === 'object' && !Object.keys(o[k]).length)) delete o[k];
  }
  return o;
}

function writeAt(tree, path, value) {
  const ks = parts(path);
  if (!ks.length) return value ?? {};
  let o = tree;
  for (const k of ks.slice(0, -1)) {
    if (typeof o[k] !== 'object' || o[k] === null) o[k] = {};
    o = o[k];
  }
  if (value === null || value === undefined) delete o[ks.at(-1)];
  else o[ks.at(-1)] = value;
  return tree;
}

function commit(mutate) {
  if (offline) return Promise.resolve(); // writes are silently lost while "offline"
  const tree = prune(mutate(load()));
  localStorage.setItem(KEY, JSON.stringify(tree));
  notify();
  return Promise.resolve();
}

// Tell every listener whose value changed (this tab; other tabs get the storage event).
function notify() {
  if (offline) return;
  const tree = load();
  for (const l of listeners) {
    const json = JSON.stringify(valueAt(tree, l.path));
    if (json !== l.last) { l.last = json; l.cb(JSON.parse(json)); }
  }
  for (const l of childListeners) scanChildren(l);
}

// Compare one children() subscription with the stored tree and report what changed.
// A callback often writes (the laptop removes a command it just read), which calls notify()
// again while we are still in the loop. That nested call only sets `again`, and this loop
// re-scans a fresh tree when it finishes. Without this, a stale loop re-reports children
// that were already handled (the commands would be applied twice).
function scanChildren(l) {
  if (l.busy) { l.again = true; return; }
  l.busy = true;
  try {
    do {
      l.again = false;
      const obj = valueAt(load(), l.path) || {};
      for (const k of Object.keys(obj)) {
        const json = JSON.stringify(obj[k]);
        if (l.seen[k] !== json) { l.seen[k] = json; if (l.h.added) l.h.added(k, JSON.parse(json)); }
      }
      for (const k of Object.keys(l.seen)) {
        if (!(k in obj)) { delete l.seen[k]; if (l.h.removed) l.h.removed(k); }
      }
    } while (l.again);
  } finally {
    l.busy = false;
  }
}
window.addEventListener('storage', (e) => { if (e.key === KEY) notify(); });

export const get = async (path) => (offline ? null : valueAt(load(), path));
export const set = (path, value) => commit((t) => writeAt(t, path, resolveTs(value)));
export const remove = (path) => commit((t) => writeAt(t, path, null));
export const update = (path, values) => commit((t) => {
  for (const k of Object.keys(values)) t = writeAt(t, path + '/' + k, resolveTs(values[k]));
  return t;
});

// Adds a child with a unique key (like Firebase push ids); resolves to the key.
export function push(path, value) {
  const key = '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return commit((t) => writeAt(t, path + '/' + key, resolveTs(value))).then(() => key);
}

export function on(path, cb) {
  const l = { path, cb, last: undefined };
  listeners.add(l);
  setTimeout(() => { if (listeners.has(l) && !offline) { l.last = JSON.stringify(valueAt(load(), path)); cb(JSON.parse(l.last)); } }, 0);
  return () => listeners.delete(l);
}

// Calls h.added(key, value) for each child now and when one is added or changed,
// and h.removed(key) when one goes. Returns an unsubscribe function.
export function children(path, h) {
  const l = { path, h, seen: {}, busy: false, again: false };
  childListeners.add(l);
  setTimeout(() => { if (childListeners.has(l) && !offline) scanChildren(l); }, 0);
  return () => childListeners.delete(l);
}

export async function claim(path, who) {
  const cur = valueAt(load(), path);
  if (offline || (cur !== null && cur !== who)) return { ok: false, current: cur };
  await set(path, who);
  return { ok: true, current: who };
}

export function connected(cb) {
  connListeners.add(cb);
  setTimeout(() => cb(!offline), 0);
  return () => connListeners.delete(cb);
}

export async function staleKeys(path, cutoff) {
  const o = valueAt(load(), path) || {};
  return Object.keys(o).filter((k) => typeof o[k] === 'number' && o[k] <= cutoff);
}

// Test hook: simulate this tab dropping off the network (and coming back).
export function setOffline(v) {
  offline = v;
  for (const cb of connListeners) cb(!v);
  if (!v) { for (const l of listeners) l.last = undefined; notify(); }
}
