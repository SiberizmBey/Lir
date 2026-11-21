import { SavedRecording } from "../types/sound";

const DATABASE_NAME = "lir-recordings";
const STORE_NAME = "recordings";

function openRecordingsDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function getAllSavedRecordings(): Promise<SavedRecording[]> {
    const db = await openRecordingsDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
            db.close();
            const items = Array.isArray(request.result)
                ? (request.result as SavedRecording[])
                : [];
            items.sort((a, b) => b.createdAt - a.createdAt);
            resolve(items);
        };
        request.onerror = () => {
            db.close();
            reject(request.error);
        };
    });
}

export async function putSavedRecording(recording: SavedRecording): Promise<void> {
    const db = await openRecordingsDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(recording);
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

export async function deleteSavedRecording(id: string): Promise<void> {
    const db = await openRecordingsDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(id);
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
