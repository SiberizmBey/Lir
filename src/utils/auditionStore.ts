/**
 * Tiny external store that mirrors the Dış Kaynak (Spotify / YouTube) "Dinle"
 * audition into the global Dynamic Island, without threading state through App.
 */
export interface AuditionSnapshot {
    id: string;
    title: string;
    artist: string;
    thumbnailUrl?: string;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
}

interface AuditionControls {
    toggle: () => void;
    stop: () => void;
}

let snapshot: AuditionSnapshot | null = null;
let controls: AuditionControls | null = null;
const listeners = new Set<(next: AuditionSnapshot | null) => void>();

export const auditionStore = {
    getSnapshot(): AuditionSnapshot | null {
        return snapshot;
    },

    subscribe(listener: (next: AuditionSnapshot | null) => void): () => void {
        listeners.add(listener);
        listener(snapshot);
        return () => {
            listeners.delete(listener);
        };
    },

    publish(next: AuditionSnapshot | null) {
        if (next === null && snapshot === null) return;
        snapshot = next;
        listeners.forEach((listener) => listener(snapshot));
    },

    setControls(next: AuditionControls | null) {
        controls = next;
    },

    toggle() {
        controls?.toggle();
    },

    stop() {
        controls?.stop();
    },
};
