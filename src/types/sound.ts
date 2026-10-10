export type SoundCategory = 'Tümü' | 'Meme & Eğlence' | 'Oyun SFX' | 'Reaksiyon' | 'Anime & Dizi' | 'Özel';

export interface SoundItem {
  id: string;
  title: string;
  hotkey: string; // e.g. 'F1', 'F2', 'NUMPAD 1', 'CTRL+1'
  duration: number; // in seconds
  category: SoundCategory;
  volume: number; // 0 to 1
  isFavorite: boolean;
  loop: boolean;
  playMode: 'overlap' | 'restart' | 'stop';
  audioBuffer?: AudioBuffer;
  dataUrl?: string; // base64 or object URL or generated identifier
  synthPreset?: string; // name of synthesizer preset if generated
  addedAt: number;
}

export interface AudioRoutingConfig {
  masterVolume: number;
  primaryDeviceLabel: string;
  primaryDeviceId: string;
  secondaryDeviceLabel: string;
  secondaryDeviceId: string;
  dualOutputEnabled: boolean; // Hear sound yourself + stream to virtual cable
  micPassThrough: boolean;
  micDeviceId: string;
  micDeviceLabel: string;
  micVolume: number;
  playbackMode: 'overlap' | 'cutoff'; // Play multiple sounds together or stop previous
  stopAllHotkey: string;
}

export interface UpdateInfo {
  version: string;
  title: string;
  notes: string;
  url: string;
}

export interface ElectronAPI {
  isElectron: boolean;
  openFileDialog: () => Promise<Array<{
    path: string;
    name: string;
    format: string;
    fileUrl: string;
    size: number;
  }> | null>;
  registerHotkeys: (hotkeys: Array<{ hotkey: string; id: string }>) => Promise<{
    success: boolean;
    registeredCount: number;
    failedKeys?: string[];
  }>;
  unregisterAllHotkeys: () => Promise<boolean>;
  onTriggerHotkey: (callback: (key: string) => void) => () => void;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  isMaximized: () => Promise<boolean>;
  getPlatform: () => string;
  getAppVersion: () => Promise<string>;
  checkForUpdates: () => Promise<UpdateInfo | null>;
  openUpdateRelease: (url: string) => void;
  openExternal: (url: string) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
