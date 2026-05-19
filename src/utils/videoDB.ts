const DB_NAME = 'vp_media_db';
const DB_VER  = 1;
const STORE   = 'videos';

export interface VideoRecord {
  id:   string;
  blob: Blob;
  name: string;
  type: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function saveVideo(file: File): Promise<string> {
  const db  = await openDB();
  const id  = `video_${Date.now()}`;
  const rec: VideoRecord = { id, blob: file, name: file.name, type: file.type };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve(id);
    tx.onerror    = () => reject(tx.error);
  });
}

export async function getVideo(id: string): Promise<VideoRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as VideoRecord | undefined) ?? null);
    req.onerror   = () => reject(req.error);
  });
}

export async function deleteVideo(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}
