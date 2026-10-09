// IndexedDB Storage Manager for GuideFlow
// Keeps recordings local until user explicitly uploads

const DB_NAME = 'guideflow';
const DB_VERSION = 1;
const STORES = {
  recordings: 'recordings',
  screenshots: 'screenshots',
  settings: 'settings',
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORES.recordings)) {
        const recordingStore = db.createObjectStore(STORES.recordings, { keyPath: 'id' });
        recordingStore.createIndex('state', 'state', { unique: false });
        recordingStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.screenshots)) {
        const screenshotStore = db.createObjectStore(STORES.screenshots, { keyPath: 'id' });
        screenshotStore.createIndex('recordingId', 'recordingId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Generic get/put/delete for any store */
async function getItem<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function putItem<T>(storeName: string, item: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function deleteItem(storeName: string, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getAllItems<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

// ─── Recording Storage ───────────────────────────────────────────────

import type { Recording, CapturedStep } from '../types';

export async function saveRecording(recording: Recording): Promise<void> {
  await putItem(STORES.recordings, { ...recording, updatedAt: Date.now() });
}

export async function getRecording(id: string): Promise<Recording | undefined> {
  return getItem<Recording>(STORES.recordings, id);
}

export async function getAllRecordings(): Promise<Recording[]> {
  return getAllItems<Recording>(STORES.recordings);
}

export async function deleteRecording(id: string): Promise<void> {
  // Also delete associated screenshots
  const db = await openDB();
  const tx = db.transaction([STORES.recordings, STORES.screenshots], 'readwrite');

  const screenshotStore = tx.objectStore(STORES.screenshots);
  const index = screenshotStore.index('recordingId');
  const request = index.getAllKeys(id);

  request.onsuccess = () => {
    for (const key of request.result) {
      screenshotStore.delete(key);
    }
  };

  tx.objectStore(STORES.recordings).delete(id);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Screenshot Storage (separate from recording for size) ───────────

interface StoredScreenshot {
  id: string;
  recordingId: string;
  stepId: string;
  dataUrl: string;
  capturedAt: number;
}

export async function saveScreenshot(
  recordingId: string,
  stepId: string,
  dataUrl: string
): Promise<void> {
  await putItem<StoredScreenshot>(STORES.screenshots, {
    id: `${recordingId}_${stepId}`,
    recordingId,
    stepId,
    dataUrl,
    capturedAt: Date.now(),
  });
}

export async function getScreenshot(
  recordingId: string,
  stepId: string
): Promise<string | null> {
  const item = await getItem<StoredScreenshot>(
    STORES.screenshots,
    `${recordingId}_${stepId}`
  );
  return item?.dataUrl ?? null;
}

export async function getRecordingScreenshots(
  recordingId: string
): Promise<Map<string, string>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.screenshots, 'readonly');
    const store = tx.objectStore(STORES.screenshots);
    const index = store.index('recordingId');
    const request = index.getAll(recordingId);

    request.onsuccess = () => {
      const map = new Map<string, string>();
      for (const item of request.result as StoredScreenshot[]) {
        map.set(item.stepId, item.dataUrl);
      }
      resolve(map);
    };
    request.onerror = () => reject(request.error);
  });
}

// ─── Settings Storage ────────────────────────────────────────────────

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const item = await getItem<{ key: string; value: T }>(STORES.settings, key);
  return item?.value ?? defaultValue;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await putItem(STORES.settings, { key, value });
}

// ─── Recovery: find interrupted recordings ───────────────────────────

export async function getInterruptedRecordings(): Promise<Recording[]> {
  const all = await getAllRecordings();
  return all.filter(
    (r) => r.state === 'recording' || r.state === 'paused' || r.state === 'interrupted'
  );
}
