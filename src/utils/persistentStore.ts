const pendingWrites = new Map<string, string>();
let electronSnapshot: Record<string, string> | null = null;
let snapshotLoaded = false;
let unloadHookAttached = false;

function ensureSnapshot(): Record<string, string> | null {
  if (typeof window === 'undefined') return null;
  if (!snapshotLoaded) {
    snapshotLoaded = true;
    try {
      const api = window.electronAPI;
      if (api?.isElectron && typeof api.getStoreSnapshotSync === 'function') {
        const snap = api.getStoreSnapshotSync();
        if (snap && typeof snap === 'object') {
          electronSnapshot = { ...snap };
        }
      }
    } catch (err) {
      console.warn('Electron store snapshot yüklenemedi:', err);
    }

    if (!unloadHookAttached) {
      unloadHookAttached = true;
      window.addEventListener('beforeunload', flushPendingPersistentWritesSync);
      window.addEventListener('pagehide', flushPendingPersistentWritesSync);
    }
  }
  return electronSnapshot;
}

export function flushPendingPersistentWritesSync(): void {
  if (typeof window === 'undefined') return;
  const api = window.electronAPI;
  if (!api?.isElectron || typeof api.setStoreItemSync !== 'function') return;
  if (pendingWrites.size === 0) return;

  for (const [key, value] of pendingWrites.entries()) {
    try {
      api.setStoreItemSync(key, value);
    } catch {
      // ignore flush error
    }
  }
  pendingWrites.clear();
}

export function getPersistentItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  const snap = ensureSnapshot();
  if (snap) {
    if (Object.prototype.hasOwnProperty.call(snap, key)) {
      return snap[key];
    }
    // One-time migration from legacy browser localStorage into Electron userData store
    try {
      const legacy = window.localStorage.getItem(key);
      if (legacy !== null) {
        snap[key] = legacy;
        void window.electronAPI?.setStoreItem?.(key, legacy);
        return legacy;
      }
    } catch {
      // ignore
    }
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setPersistentItem(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;
  const snap = ensureSnapshot();
  let electronSaved = false;

  if (snap) {
    snap[key] = value;
    pendingWrites.set(key, value);
    const api = window.electronAPI;
    if (api?.setStoreItem) {
      electronSaved = true;
      void api
        .setStoreItem(key, value)
        .then((ok) => {
          if (ok && pendingWrites.get(key) === value) {
            pendingWrites.delete(key);
          }
        })
        .catch(() => {
          // keep in pendingWrites for unload flush
        });
    } else if (api?.setStoreItemSync) {
      try {
        electronSaved = Boolean(api.setStoreItemSync(key, value));
        if (electronSaved) pendingWrites.delete(key);
      } catch {
        // ignore
      }
    }
  }

  let localSaved = false;
  try {
    window.localStorage.setItem(key, value);
    localSaved = true;
  } catch (err) {
    if (!snap) {
      console.warn(`LocalStorage save error (${key}):`, err);
    }
  }

  return electronSaved || localSaved;
}

export function removePersistentItem(key: string): void {
  if (typeof window === 'undefined') return;
  const snap = ensureSnapshot();
  if (snap) {
    delete snap[key];
    pendingWrites.delete(key);
    void window.electronAPI?.removeStoreItem?.(key)?.catch(() => {});
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
