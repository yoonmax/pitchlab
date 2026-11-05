/** A small promise wrapper over IndexedDB. Every object store is keyed by `id`. */
const DB_NAME = 'pitchlab';
const DB_VERSION = 1;
export const STORES = ['documents', 'formations', 'sessions', 'kv'];

let dbPromise = null;

export function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser has no IndexedDB, so work cannot be saved here.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('pitchlab is open in another tab that is blocking an upgrade.'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

/** Test hook: forget the cached connection so a fresh database can be opened. */
export function resetDatabaseConnection() {
  dbPromise = null;
}

function run(store, mode, fn) {
  return openDatabase().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('The save was aborted, possibly because storage is full.'));
  }));
}

export const dbPut = (store, value) => run(store, 'readwrite', (s) => s.put(value));
export const dbGet = (store, id) => run(store, 'readonly', (s) => s.get(id));
export const dbDelete = (store, id) => run(store, 'readwrite', (s) => s.delete(id));
export const dbAll = (store) => run(store, 'readonly', (s) => s.getAll());
