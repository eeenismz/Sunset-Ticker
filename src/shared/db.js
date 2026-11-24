// The relay between laptop and phone: Firebase Realtime Database, or (for local
// testing with ?fakedb in the URL) a stand-in that only works between tabs of one browser.
// Both offer the same small path-based API, so the rest of the app never touches Firebase directly:
//   uid, TS (server time marker), get, set, update, remove, push, on, children, claim, connected, staleKeys, serverOffset
import { firebaseConfig } from './firebase-config.js?v=__V__';

const FB = 'https://www.gstatic.com/firebasejs/11.0.2/';
export const useFake = new URLSearchParams(location.search).has('fakedb');

// Resolves to the API, or rejects with Error('not-configured') / a network error.
export async function connectRelay() {
  if (useFake) {
    const fake = await import('./fake-db.js?v=__V__');
    window.__relay = fake; // test hook: lets a test harness simulate going offline
    return fake;
  }
  if (!firebaseConfig.apiKey) throw new Error('not-configured');

  const [app, auth, rtdb] = await Promise.all([
    import(FB + 'firebase-app.js'),
    import(FB + 'firebase-auth.js'),
    import(FB + 'firebase-database.js'),
  ]);
  const fbApp = app.initializeApp(firebaseConfig);
  // Anonymous sign-in: no account, but a stable id per device so the rules can tell
  // the laptop (room owner) from the paired phone. Firebase remembers it on the device.
  const cred = await auth.signInAnonymously(auth.getAuth(fbApp));
  const db = rtdb.getDatabase(fbApp);
  // '' means the database root (multi-path updates); Firebase rejects ref(db, '').
  const R = (path) => (path ? rtdb.ref(db, path) : rtdb.ref(db));

  return {
    uid: cred.user.uid,
    TS: rtdb.serverTimestamp(),
    async get(path) {
      const snap = await rtdb.get(R(path));
      return snap.exists() ? snap.val() : null;
    },
    set: (path, value) => rtdb.set(R(path), value),
    update: (path, values) => rtdb.update(R(path), values),
    remove: (path) => rtdb.remove(R(path)),
    // Calls cb(value) now and on every change; returns an unsubscribe function.
    on: (path, cb) => rtdb.onValue(R(path), (snap) => cb(snap.val())),
    // Adds a child under path with a new unique (time-ordered) key; resolves to that key.
    async push(path, value) {
      const ref = rtdb.push(R(path));
      await rtdb.set(ref, value);
      return ref.key;
    },
    // Calls h.added(key, value) for each child now and whenever one is added or changed,
    // and h.removed(key) when one goes. Returns an unsubscribe function.
    children(path, h) {
      const ref = R(path);
      const offs = [
        rtdb.onChildAdded(ref, (snap) => h.added && h.added(snap.key, snap.val())),
        rtdb.onChildChanged(ref, (snap) => h.added && h.added(snap.key, snap.val())),
        rtdb.onChildRemoved(ref, (snap) => h.removed && h.removed(snap.key)),
      ];
      return () => offs.forEach((off) => off());
    },
    // Atomically take the value at path for uid if it is empty (or already ours).
    async claim(path, uid) {
      const res = await rtdb.runTransaction(R(path), (cur) =>
        cur === null || cur === uid ? uid : undefined); // undefined = give up
      return { ok: res.committed, current: res.snapshot.val() };
    },
    // cb(ms) with the difference between server time and this device's clock (server - local).
    serverOffset: (cb) => rtdb.onValue(R('.info/serverTimeOffset'), (snap) => cb(snap.val() || 0)),
    // cb(true/false) whenever this device's own link to Firebase goes up or down.
    connected: (cb) => rtdb.onValue(R('.info/connected'), (snap) => cb(snap.val() === true)),
    // Keys under path whose value (a timestamp) is at or before cutoff.
    async staleKeys(path, cutoff) {
      const q = rtdb.query(R(path), rtdb.orderByValue(), rtdb.endAt(cutoff));
      const snap = await rtdb.get(q);
      return snap.exists() ? Object.keys(snap.val()) : [];
    },
  };
}
