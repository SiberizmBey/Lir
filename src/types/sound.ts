export type SoundCategory = 'Tümü' | 'Meme & Eğlence' | 'Oyun SFX' | 'Reaksiyon' | 'Anime & Dizi' | 'Özel';
export type ResolvedTheme = 'amoled' | 'dark' | 'light';
export type AppTheme = 'system' | ResolvedTheme;
export type UIStyle = 'gama' | 'win11' | 'win10';

export interface AppearanceSettings {
  backgroundImage: string | null;
  backgroundBlur: number;
  sidebarTransparency: number;
  cardTransparency: number;
  headerTransparency: number;
}

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

export type VoicePresetId =
  | 'natural'
  | 'studio'
  | 'anime'
  | 'reporter'
  | 'radio'
  | 'phone'
  | 'megaphone'
  | 'robot'
  | 'cave'
  | 'demon';

export interface VoiceChangerConfig {
  enabled: boolean;
  preset: VoicePresetId;
  pitchSemitones: number;
  highpassHz: number;
  lowpassHz: number;
  bassBoostDb: number;
  clarityBoostDb: number;
  distortionAmount: number;
  ringModHz: number;
  ringModMix: number;
  echoDelayMs: number;
  echoFeedback: number;
  echoMix: number;
  reverbMix: number;
  wetMix: number;
  selfMonitor: boolean;
  presetHotkeys?: Partial<Record<VoicePresetId, string>>;
  toggleHotkey?: string;
}

export type HotkeyTarget =
  | { kind: 'sound'; id: string; title: string; hotkey: string }
  | { kind: 'voice-preset'; presetId: VoicePresetId; title: string; hotkey: string }
  | { kind: 'voice-toggle'; title: string; hotkey: string };

export interface SavedRecording {
  id: string;
  title: string;
  hotkey: string;
  duration: number;
  createdAt: number;
  dataUrl: string;
  effectName?: string;
  addedToSoundboard?: boolean;
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
  muteMicOnPlay?: boolean; // Mute/duck microphone while sound effect plays to eliminate acoustic echo
  playbackMode: 'overlap' | 'cutoff'; // Play multiple sounds together or stop previous
  stopAllHotkey: string;
  discordRpcEnabled: boolean;
}

export interface DiscordActivity {
  details?: string;
  state?: string;
  startTimestamp?: number | Date;
  endTimestamp?: number | Date;
  largeImageKey?: string;
  largeImageText?: string;
  smallImageKey?: string;
  smallImageText?: string;
  instance?: boolean;
}

export interface DiscordStatus {
  connected: boolean;
  clientId: string;
  username?: string;
  error?: string;
}

export interface SubtitleOverlaySettings {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

export interface AppPauseRule {
  id: string;
  name: string;
  processName: string;
  titleMatch?: string;
  enabled: boolean;
  addedAt: number;
}

export interface HotkeyFilterConfig {
  enabled: boolean;
  manuallyPaused: boolean;
  pauseInTextInputs: boolean;
  pausedApps: AppPauseRule[];
}

export interface InstalledAppInfo {
  name: string;
  processName: string;
  path?: string;
  source: 'running' | 'installed' | 'catalog';
  windowTitle?: string;
}

export interface HotkeyFilterStatus {
  paused: boolean;
  reason?: 'manual' | 'app' | 'modal' | 'input';
  activeProcess?: string;
  activeTitle?: string;
  matchedRuleName?: string;
}

export interface PlaybackTrackInfo {
  soundId: string;
  startedAt: number;
  duration: number;
  loop: boolean;
}

export interface RemoteControlSettings {
  enabled: boolean;
  deviceName: string;
  requirePin: boolean;
  pin: string;
}

export interface RemoteConnectedClient {
  id: string;
  name: string;
  ip: string;
  connectedAt: number;
}

export interface RemoteHostStatus {
  enabled: boolean;
  deviceId: string;
  deviceName: string;
  port: number;
  lanIps: string[];
  wsPath: string;
  mdnsService: string;
  udpDiscoveryPort: number;
  requirePin: boolean;
  pin: string;
  connectedClients: RemoteConnectedClient[];
  hostConnected: boolean;
}

export interface RelayBridgeConfig {
  enabled: boolean;
  relayUrl: string;
  roomCode: string;
  hostSecret: string;
  deviceName: string;
  requirePin: boolean;
  pin: string;
}

export type RelayBridgeConnectionState = 'disabled' | 'connecting' | 'connected' | 'error';

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
  getInstalledApps?: () => Promise<InstalledAppInfo[]>;
  setHotkeyFilterConfig?: (config: HotkeyFilterConfig) => Promise<boolean>;
  onHotkeyFilterStatus?: (callback: (status: HotkeyFilterStatus) => void) => () => void;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  isMaximized: () => Promise<boolean>;
  getPlatform: () => string;
  getAppVersion: () => Promise<string>;
  openExternal: (url: string) => void;
  setSubtitleOverlayVisible: (visible: boolean) => Promise<boolean>;
  setSubtitleOverlaySettings: (settings: SubtitleOverlaySettings) => Promise<boolean>;
  updateSubtitleOverlay: (translation: string) => void;
  onSubtitleOverlayUpdate: (callback: (translation: string) => void) => () => void;
  onSubtitleOverlaySettings: (callback: (settings: SubtitleOverlaySettings) => void) => () => void;
  onSubtitleOverlayVisibilityChange: (callback: (visible: boolean) => void) => () => void;
  // Discord Rich Presence
  updateDiscordActivity?: (activity: DiscordActivity) => Promise<boolean>;
  getDiscordRPCStatus?: () => Promise<DiscordStatus>;
  setDiscordRPCEnabled?: (enabled: boolean) => Promise<DiscordStatus>;
  reconnectDiscordRPC?: () => Promise<boolean>;
  onDiscordStatusChange?: (callback: (status: DiscordStatus) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

