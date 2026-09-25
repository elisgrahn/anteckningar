// The local queue for M4: writes that couldn't reach the server (offline,
// airplane mode) wait here instead of being lost, and are flushed once the
// network is back. IndexedDB, not memory, because a reload or a crash must
// not drop them either (invariant 7).
//
// One entry per target ("doc", or "figure:<name>"): a second offline edit to
// the same file replaces the queued one rather than piling up, since only the
// latest content matters — exactly how the live save already behaves.

const DB_NAME = 'anteckningar-queue';
const STORE = 'ops';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// fn issues one IDBRequest on the store; resolves with that request's own
// result once the transaction that carries it completes.
async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const docKey = () => 'doc';
export const figureKey = (name) => 'figure:' + name;

export function enqueue(key, op) {
  return withStore('readwrite', (store) => store.put(op, key));
}

export function dequeue(key) {
  return withStore('readwrite', (store) => store.delete(key));
}

// [[key, op], ...]. The order between keys doesn't matter — each key is an
// independent file, and flushQueue keeps going past a per-key failure rather
// than relying on any ordering.
export async function allQueued() {
  const keys = await withStore('readonly', (store) => store.getAllKeys());
  const ops = await withStore('readonly', (store) => store.getAll());
  return keys.map((k, i) => [k, ops[i]]);
}
