import { SoundItem } from '../types/sound';

export const LIR_ASSET_PREFIX = 'lir-asset://';

const DATABASE_NAME = 'lir-audio-assets';
const STORE_NAME = 'assets';

const assetMemoryCache = new Map<string, string>();
const reverseAssetCache = new Map<string, string>();
const pendingPersistTasks = new Map<string, Promise<void>>();

function openAssetDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGetAsset(id: string): Promise<string | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openAssetDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => {
      db.close();
      resolve(typeof req.result === 'string' ? req.result : null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function idbPutAsset(id: string, dataUrl: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openAssetDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(dataUrl, id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

function makeAssetFingerprint(dataUrl: string): string {
  const len = dataUrl.length;
  let h1 = 2166136261 >>> 0;
  let h2 = 0x9e3779b9 >>> 0;
  const step = Math.max(1, Math.floor(len / 4096));
  for (let i = 0; i < len; i += step) {
    const code = dataUrl.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 16777619) >>> 0;
    h2 = (Math.imul(h2 ^ code, 2246822519) + (i & 0xff)) >>> 0;
  }
  const tailStart = Math.max(0, len - 256);
  for (let i = tailStart; i < len; i += 1) {
    const code = dataUrl.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 16777619) >>> 0;
  }
  return `aud_${len.toString(36)}_${h1.toString(36)}_${h2.toString(36)}`;
}

async function persistAudioAsset(id: string, dataUrl: string): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  if (typeof window !== 'undefined' && window.electronAPI?.saveAudioAsset) {
    tasks.push(
      window.electronAPI.saveAudioAsset(id, dataUrl).catch((err) => {
        console.warn('Electron ses varlığı kaydedilemedi:', err);
      }),
    );
  }
  tasks.push(
    idbPutAsset(id, dataUrl).catch((err) => {
      console.warn('IndexedDB ses varlığı kaydedilemedi:', err);
    }),
  );
  await Promise.allSettled(tasks);
}

export function isAssetUri(value?: string): value is string {
  return Boolean(value && value.startsWith(LIR_ASSET_PREFIX));
}

export function offloadDataUrlSync(dataUrl?: string): string | undefined {
  if (!dataUrl || typeof dataUrl !== 'string') return dataUrl;
  if (!dataUrl.startsWith('data:')) return dataUrl;

  const existingUri = reverseAssetCache.get(dataUrl);
  if (existingUri) return existingUri;

  const baseId = makeAssetFingerprint(dataUrl);
  let id = baseId;
  let suffix = 1;
  while (
    assetMemoryCache.has(`${LIR_ASSET_PREFIX}${id}`) &&
    assetMemoryCache.get(`${LIR_ASSET_PREFIX}${id}`) !== dataUrl
  ) {
    id = `${baseId}_${suffix}`;
    suffix += 1;
  }

  const assetUri = `${LIR_ASSET_PREFIX}${id}`;
  assetMemoryCache.set(assetUri, dataUrl);
  reverseAssetCache.set(dataUrl, assetUri);

  const task = persistAudioAsset(id, dataUrl).finally(() => {
    if (pendingPersistTasks.get(id) === task) {
      pendingPersistTasks.delete(id);
    }
  });
  pendingPersistTasks.set(id, task);

  return assetUri;
}

export async function loadAudioAssetDataUrl(assetUri: string): Promise<string | null> {
  if (!assetUri) return null;
  if (!assetUri.startsWith(LIR_ASSET_PREFIX)) return assetUri;

  const mem = assetMemoryCache.get(assetUri);
  if (mem) return mem;

  const id = assetUri.slice(LIR_ASSET_PREFIX.length);
  if (!id) return null;

  const inflight = pendingPersistTasks.get(id);
  if (inflight) {
    await inflight.catch(() => {});
    const cachedAfter = assetMemoryCache.get(assetUri);
    if (cachedAfter) return cachedAfter;
  }

  if (typeof window !== 'undefined' && window.electronAPI?.readAudioAsset) {
    try {
      const fromDisk = await window.electronAPI.readAudioAsset(id);
      if (fromDisk && fromDisk.startsWith('data:')) {
        assetMemoryCache.set(assetUri, fromDisk);
        reverseAssetCache.set(fromDisk, assetUri);
        return fromDisk;
      }
    } catch {
      // fall back to IndexedDB
    }
  }

  try {
    const fromIdb = await idbGetAsset(id);
    if (fromIdb && fromIdb.startsWith('data:')) {
      assetMemoryCache.set(assetUri, fromIdb);
      reverseAssetCache.set(fromIdb, assetUri);
      if (typeof window !== 'undefined' && window.electronAPI?.saveAudioAsset) {
        void window.electronAPI.saveAudioAsset(id, fromIdb).catch(() => {});
      }
      return fromIdb;
    }
  } catch (err) {
    console.warn('Ses varlığı okunamadı:', err);
  }

  return null;
}

export function offloadSoundItem(sound: SoundItem): { sound: SoundItem; changed: boolean } {
  let changed = false;
  let nextDataUrl = sound.dataUrl;
  if (nextDataUrl && nextDataUrl.startsWith('data:')) {
    const offloaded = offloadDataUrlSync(nextDataUrl);
    if (offloaded && offloaded !== nextDataUrl) {
      nextDataUrl = offloaded;
      changed = true;
    }
  }

  let nextSegments = sound.segments;
  if (Array.isArray(sound.segments) && sound.segments.length > 0) {
    let segChanged = false;
    const mapped = sound.segments.map((seg) => {
      if (seg.dataUrl && seg.dataUrl.startsWith('data:')) {
        const offloaded = offloadDataUrlSync(seg.dataUrl);
        if (offloaded && offloaded !== seg.dataUrl) {
          segChanged = true;
          return { ...seg, dataUrl: offloaded };
        }
      }
      return seg;
    });
    if (segChanged) {
      nextSegments = mapped;
      changed = true;
    }
  }

  if (!changed) return { sound, changed: false };
  return {
    sound: {
      ...sound,
      dataUrl: nextDataUrl,
      segments: nextSegments,
    },
    changed: true,
  };
}

export function offloadSoundsArray(sounds: SoundItem[]): {
  sounds: SoundItem[];
  changed: boolean;
} {
  let anyChanged = false;
  const next = sounds.map((s) => {
    const res = offloadSoundItem(s);
    if (res.changed) anyChanged = true;
    return res.sound;
  });
  return { sounds: anyChanged ? next : sounds, changed: anyChanged };
}
