/** Legt die sql.js-Datenbank im Browser in IndexedDB ab (nur Entwicklung/Web). */
const DB_NAME = 'haustechnik-clausen';
const STORE = 'datenbank';
const SCHLUESSEL = 'sqlite';

function oeffnen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const anfrage = indexedDB.open(DB_NAME, 1);
    anfrage.onupgradeneeded = () => anfrage.result.createObjectStore(STORE);
    anfrage.onsuccess = () => resolve(anfrage.result);
    anfrage.onerror = () => reject(anfrage.error);
  });
}

export async function ladeAusBrowser(): Promise<Uint8Array | undefined> {
  const idb = await oeffnen();
  try {
    return await new Promise((resolve, reject) => {
      const anfrage = idb.transaction(STORE, 'readonly').objectStore(STORE).get(SCHLUESSEL);
      anfrage.onsuccess = () => resolve(anfrage.result as Uint8Array | undefined);
      anfrage.onerror = () => reject(anfrage.error);
    });
  } finally {
    idb.close();
  }
}

export async function speichereImBrowser(inhalt: Uint8Array): Promise<void> {
  const idb = await oeffnen();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(inhalt, SCHLUESSEL);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    idb.close();
  }
}
