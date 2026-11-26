const DATABASE_NAME = "lir-appearance";
const STORE_NAME = "settings";
const BACKGROUND_IMAGE_KEY = "background-image";
const ELECTRON_BG_ASSET_ID = "lir_wallpaper_bg";

function openAppearanceDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function getStoredBackgroundImage(): Promise<string | null> {
    if (typeof window !== "undefined" && window.electronAPI?.readAudioAsset) {
        try {
            const diskImage = await window.electronAPI.readAudioAsset(ELECTRON_BG_ASSET_ID);
            if (diskImage && diskImage.startsWith("data:image/")) {
                return diskImage;
            }
        } catch {
            // fallback to IndexedDB
        }
    }

    const database = await openAppearanceDatabase();
    return new Promise((resolve, reject) => {
        const request = database
            .transaction(STORE_NAME, "readonly")
            .objectStore(STORE_NAME)
            .get(BACKGROUND_IMAGE_KEY);
        request.onsuccess = () => {
            database.close();
            const result = typeof request.result === "string" ? request.result : null;
            if (result && typeof window !== "undefined" && window.electronAPI?.saveAudioAsset) {
                void window.electronAPI.saveAudioAsset(ELECTRON_BG_ASSET_ID, result).catch(() => {});
            }
            resolve(result);
        };
        request.onerror = () => {
            database.close();
            reject(request.error);
        };
    });
}

export async function storeBackgroundImage(
    image: string | null,
): Promise<void> {
    if (typeof window !== "undefined") {
        if (image && window.electronAPI?.saveAudioAsset) {
            await window.electronAPI.saveAudioAsset(ELECTRON_BG_ASSET_ID, image).catch(() => {});
        } else if (!image && window.electronAPI?.deleteAudioAsset) {
            await window.electronAPI.deleteAudioAsset(ELECTRON_BG_ASSET_ID).catch(() => {});
        }
    }

    const database = await openAppearanceDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        if (image) {
            store.put(image, BACKGROUND_IMAGE_KEY);
        } else {
            store.delete(BACKGROUND_IMAGE_KEY);
        }
        transaction.oncomplete = () => {
            database.close();
            resolve();
        };
        transaction.onerror = () => {
            database.close();
            reject(transaction.error);
        };
        transaction.onabort = () => {
            database.close();
            reject(transaction.error);
        };
    });
}
