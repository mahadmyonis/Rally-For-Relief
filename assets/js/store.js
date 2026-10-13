// Rally for Relief — tournament data store
// Uses Firebase (Firestore + Google sign-in) when firebase-config.js is filled
// in, otherwise a demo store kept in this browser's localStorage.
//
// API (both backends):
//   mode                       "firebase" | "demo"
//   watchTournaments(cb)       live list of tournaments → unsubscribe()
//   watchTournament(id, cb)    live single tournament (null if missing) → unsubscribe()
//   createTournament(data)     → id
//   updateTournament(id, patch) patch keys may be dotted, e.g. "matches.m1.hs"
//   deleteTournament(id)
//   onAuth(cb)                 cb(user | null) → unsubscribe()
//   signIn(), signOut()

import { firebaseConfig } from "./firebase-config.js";

const FB = "https://www.gstatic.com/firebasejs/10.14.1";

function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof o[keys[i]] !== "object" || o[keys[i]] === null) o[keys[i]] = {};
    o = o[keys[i]];
  }
  if (value === DELETE) delete o[keys[keys.length - 1]];
  else o[keys[keys.length - 1]] = value;
}

// Marker for removing a field in a patch
export const DELETE = { __delete: true };

async function firebaseStore() {
  const [{ initializeApp }, fs, auth] = await Promise.all([
    import(`${FB}/firebase-app.js`),
    import(`${FB}/firebase-firestore.js`),
    import(`${FB}/firebase-auth.js`)
  ]);
  const app = initializeApp(firebaseConfig);
  const db = fs.getFirestore(app);
  const au = auth.getAuth(app);
  const col = fs.collection(db, "tournaments");

  const toFs = (patch) => {
    const out = {};
    for (const [k, v] of Object.entries(patch)) out[k] = v === DELETE ? fs.deleteField() : v;
    out.updatedAt = Date.now();
    return out;
  };

  return {
    mode: "firebase",
    watchTournaments(cb) {
      return fs.onSnapshot(col, (snap) => {
        cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, (err) => { console.error(err); cb([], err); });
    },
    watchTournament(id, cb) {
      return fs.onSnapshot(fs.doc(db, "tournaments", id), (d) => {
        cb(d.exists() ? { id: d.id, ...d.data() } : null);
      }, (err) => { console.error(err); cb(null, err); });
    },
    async createTournament(data) {
      const ref = await fs.addDoc(col, { ...data, createdAt: Date.now(), updatedAt: Date.now() });
      return ref.id;
    },
    updateTournament(id, patch) {
      return fs.updateDoc(fs.doc(db, "tournaments", id), toFs(patch));
    },
    deleteTournament(id) {
      return fs.deleteDoc(fs.doc(db, "tournaments", id));
    },
    onAuth(cb) {
      return auth.onAuthStateChanged(au, cb);
    },
    signIn() {
      return auth.signInWithPopup(au, new auth.GoogleAuthProvider());
    },
    signOut() {
      return auth.signOut(au);
    }
  };
}

function demoStore() {
  const KEY = "r4r-demo-tournaments";
  const listeners = new Set();
  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  };
  const write = (all) => {
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { console.error(e); }
    listeners.forEach((fn) => fn());
  };
  // Other tabs (e.g. the public page open next to the admin) update live too
  window.addEventListener("storage", (e) => { if (e.key === KEY) listeners.forEach((fn) => fn()); });
  const listen = (fn) => { listeners.add(fn); fn(); return () => listeners.delete(fn); };
  const clone = (x) => JSON.parse(JSON.stringify(x));

  let user = null;
  try { user = JSON.parse(sessionStorage.getItem("r4r-demo-user")); } catch { /* ignore */ }
  const authListeners = new Set();

  return {
    mode: "demo",
    watchTournaments(cb) {
      return listen(() => cb(Object.entries(read()).map(([id, t]) => ({ id, ...clone(t) }))));
    },
    watchTournament(id, cb) {
      return listen(() => { const t = read()[id]; cb(t ? { id, ...clone(t) } : null); });
    },
    async createTournament(data) {
      const all = read();
      const id = "demo" + Date.now().toString(36);
      all[id] = { ...clone(data), createdAt: Date.now(), updatedAt: Date.now() };
      write(all);
      return id;
    },
    async updateTournament(id, patch) {
      const all = read();
      if (!all[id]) throw new Error("Tournament not found");
      for (const [k, v] of Object.entries(patch)) setPath(all[id], k, v === DELETE ? DELETE : clone(v));
      all[id].updatedAt = Date.now();
      write(all);
    },
    async deleteTournament(id) {
      const all = read();
      delete all[id];
      write(all);
    },
    onAuth(cb) {
      authListeners.add(cb);
      cb(user);
      return () => authListeners.delete(cb);
    },
    async signIn() {
      user = { displayName: "Demo admin", email: "demo@local" };
      try { sessionStorage.setItem("r4r-demo-user", JSON.stringify(user)); } catch { /* ignore */ }
      authListeners.forEach((fn) => fn(user));
    },
    async signOut() {
      user = null;
      try { sessionStorage.removeItem("r4r-demo-user"); } catch { /* ignore */ }
      authListeners.forEach((fn) => fn(user));
    }
  };
}

export const store = firebaseConfig ? await firebaseStore() : demoStore();
