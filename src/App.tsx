import {
    useState,
    useEffect,
    useMemo,
    useCallback,
    useLayoutEffect,
    useRef,
} from "react";
import { motion, AnimatePresence, MotionConfig } from "motion/react";
import { RotateCcw, Heart, Music, Plus, Volume2 } from "lucide-react";
import {
    SoundItem,
    SoundSegment,
    SoundCategory,
    AudioRoutingConfig,
    AppTheme,
    ResolvedTheme,
    UIStyle,
    AppearanceSettings,
    DiscordStatus,
    VoiceChangerConfig,
    HotkeyTarget,
    VoicePresetId,
    HotkeyFilterConfig,
    HotkeyFilterStatus,
    PlaybackTrackInfo,
    RemoteConnectedClient,
    RelayBridgeConfig,
    RelayBridgeConnectionState,
} from "./types/sound";
import { STARTER_SOUNDS } from "./utils/starterSounds";
import {
    DEFAULT_VOICE_CHANGER_CONFIG,
    VOICE_PRESETS,
    VoicePresetDefinition,
} from "./utils/voicePresets";
import { audioEngine } from "./utils/audioEngine";
import {
    normalizeHotkey,
    extractHotkeyFromKeyboardEvent,
    isTextEntryElement,
} from "./utils/hotkeys";
import { Sidebar, NavTab } from "./components/Sidebar";
import { Header } from "./components/Header";
import { SoundCard } from "./components/SoundCard";
import { PlaybackBar } from "./components/PlaybackBar";
import { HotkeyModal, ExistingHotkeyBinding } from "./components/HotkeyModal";
import { AddSoundModal } from "./components/AddSoundModal";
import { AudioRoutingView } from "./components/AudioRoutingView";
import { VoiceChangerView } from "./components/VoiceChangerView";
import { HotkeysView } from "./components/HotkeysView";
import { RecorderView } from "./components/RecorderView";
import { LirMakerView } from "./components/LirMakerView";
import { SpotifyMusicView } from "./components/SpotifyMusicView";
import { GuideView } from "./components/GuideView";
import { SettingsView } from "./components/SettingsView";
import { SubtitleTranslatorView } from "./components/SubtitleTranslatorView";
import { Footer } from "./components/Footer";
import { KoruBanner } from "./components/KoruBanner";
import { VbCableGuardOverlay } from "./components/VbCableGuardOverlay";
import {
    getStoredBackgroundImage,
    storeBackgroundImage,
} from "./utils/appearanceStorage";
import {
    DEFAULT_ACCENT_COLOR,
    applyAccentColorToRoot,
    normalizeHexColor,
} from "./utils/accentColors";
import { useTranslation } from "./i18n";
import { getPersistentItem, setPersistentItem } from "./utils/persistentStore";
import { offloadSoundItem, offloadSoundsArray } from "./utils/audioAssetStorage";

const STORAGE_KEY_SOUNDS = "lir_soundboard_sounds_v1";
const STORAGE_KEY_CONFIG = "lir_soundboard_config_v1";
const STORAGE_KEY_VOICE_CHANGER = "lir_voice_changer_v1";
const STORAGE_KEY_HOTKEY_FILTER = "lir_hotkey_filter_v1";
const STORAGE_KEY_THEME = "lir_theme_v1";
const STORAGE_KEY_ACCENT = "lir_accent_color_v1";
const STORAGE_KEY_UI_STYLE = "lir_ui_style_v1";
const STORAGE_KEY_APPEARANCE = "lir_appearance_v1";
const STORAGE_KEY_RELAY_BRIDGE = "lir_relay_bridge_v1";
const DEFAULT_RELAY_URL = "https://lirandroid.anticvalley.com.tr";

function generateRandomRoomCode(): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
}

function generateRandomSixDigitPin(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function generateHostSecret(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID().replace(/-/g, "");
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

function createDefaultRelayBridgeConfig(): RelayBridgeConfig {
    return {
        enabled: true,
        relayUrl: DEFAULT_RELAY_URL,
        roomCode: generateRandomRoomCode(),
        hostSecret: generateHostSecret(),
        deviceName: "Lir Masaüstü",
        requirePin: true,
        pin: generateRandomSixDigitPin(),
    };
}

const DEFAULT_HOTKEY_FILTER: HotkeyFilterConfig = {
    enabled: true,
    manuallyPaused: false,
    pauseInTextInputs: true,
    allowedApps: [],
};

const DEFAULT_APPEARANCE: AppearanceSettings = {
    backgroundImage: null,
    backgroundBlur: 0,
    sidebarTransparency: 20,
    cardTransparency: 20,
    headerTransparency: 20,
};

const clampPercentage = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value)
        ? Math.min(100, Math.max(0, value))
        : fallback;

const DEFAULT_CONFIG: AudioRoutingConfig = {
    masterVolume: 0.85,
    primaryDeviceLabel: "Varsayılan Sistem Çıkışı",
    primaryDeviceId: "default",
    secondaryDeviceLabel: "Varsayılan Kulaklık",
    secondaryDeviceId: "default",
    dualOutputEnabled: false,
    micPassThrough: false,
    micDeviceId: "default",
    micDeviceLabel: "Varsayılan Mikrofon",
    micVolume: 1.0,
    muteMicOnPlay: true,
    playbackMode: "overlap",
    stopAllHotkey: "CTRL+SHIFT+X",
    discordRpcEnabled: true,
};

const CATEGORIES: SoundCategory[] = [
    "Tümü",
    "Meme & Eğlence",
    "Oyun SFX",
    "Reaksiyon",
    "Anime & Dizi",
    "Müzik",
    "Özel",
];

export default function App() {
    const { t, language } = useTranslation();
    const [theme, setTheme] = useState<AppTheme>(() => {
        try {
            const savedTheme = getPersistentItem(STORAGE_KEY_THEME);
            if (
                savedTheme === "system" ||
                savedTheme === "amoled" ||
                savedTheme === "dark" ||
                savedTheme === "light"
            ) {
                return savedTheme;
            }
        } catch (error) {
            console.warn("Tema tercihi okunamadı:", error);
        }
        return "system";
    });

    const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
        if (typeof window === "undefined" || !window.matchMedia) return true;
        return window.matchMedia("(prefers-color-scheme: dark)").matches;
    });

    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = (event: MediaQueryListEvent) => {
            setSystemPrefersDark(event.matches);
        };
        setSystemPrefersDark(mediaQuery.matches);
        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
    }, []);

    const effectiveTheme: ResolvedTheme =
        theme === "system" ? (systemPrefersDark ? "dark" : "light") : theme;

    const [accentColor, setAccentColor] = useState<string>(() => {
        try {
            const saved = getPersistentItem(STORAGE_KEY_ACCENT);
            const normalized = saved ? normalizeHexColor(saved) : null;
            if (normalized) return normalized;
        } catch (error) {
            console.warn("Aksan rengi okunamadı:", error);
        }
        return DEFAULT_ACCENT_COLOR;
    });

    useLayoutEffect(() => {
        const root = document.documentElement;
        root.dataset.theme = effectiveTheme;
        root.classList.remove("amoled", "dark", "light");
        root.classList.add(effectiveTheme);
        applyAccentColorToRoot(accentColor, effectiveTheme);

        try {
            setPersistentItem(STORAGE_KEY_THEME, theme);
        } catch (error) {
            console.warn("Tema tercihi kaydedilemedi:", error);
        }
        try {
            setPersistentItem(
                STORAGE_KEY_ACCENT,
                normalizeHexColor(accentColor) ?? DEFAULT_ACCENT_COLOR,
            );
        } catch (error) {
            console.warn("Aksan rengi kaydedilemedi:", error);
        }
    }, [theme, effectiveTheme, accentColor]);

    const [uiStyle, setUiStyle] = useState<UIStyle>(() => {
        try {
            const saved = getPersistentItem(STORAGE_KEY_UI_STYLE);
            if (saved === "gama" || saved === "win11" || saved === "win10") {
                return saved;
            }
        } catch (error) {
            console.warn("Tasarım dili okunamadı:", error);
        }
        return "gama";
    });

    useLayoutEffect(() => {
        document.documentElement.dataset.uiStyle = uiStyle;
        try {
            setPersistentItem(STORAGE_KEY_UI_STYLE, uiStyle);
        } catch (error) {
            console.warn("Tasarım dili kaydedilemedi:", error);
        }
    }, [uiStyle]);

    const [appearance, setAppearance] = useState<AppearanceSettings>(() => {
        try {
            const saved = getPersistentItem(STORAGE_KEY_APPEARANCE);
            if (saved) {
                const parsed: unknown = JSON.parse(saved);
                if (parsed && typeof parsed === "object") {
                    const stored = parsed as Partial<AppearanceSettings> & {
                        soundCardTransparency?: unknown;
                    };
                    return {
                        backgroundImage:
                            typeof stored.backgroundImage === "string" &&
                            stored.backgroundImage.startsWith("data:image/")
                                ? stored.backgroundImage
                                : null,
                        backgroundBlur: Math.min(
                            20,
                            clampPercentage(
                                stored.backgroundBlur,
                                DEFAULT_APPEARANCE.backgroundBlur,
                            ),
                        ),
                        sidebarTransparency: clampPercentage(
                            stored.sidebarTransparency,
                            DEFAULT_APPEARANCE.sidebarTransparency,
                        ),
                        cardTransparency: clampPercentage(
                            stored.cardTransparency ??
                                stored.soundCardTransparency,
                            DEFAULT_APPEARANCE.cardTransparency,
                        ),
                        headerTransparency: clampPercentage(
                            stored.headerTransparency,
                            DEFAULT_APPEARANCE.headerTransparency,
                        ),
                    };
                }
            }
        } catch (error) {
            console.warn("Görünüm ayarları okunamadı:", error);
        }
        return DEFAULT_APPEARANCE;
    });
    const backgroundImageRef = useRef(appearance.backgroundImage);

    useEffect(() => {
        let isMounted = true;
        const loadBackground = async () => {
            try {
                const storedImage = await getStoredBackgroundImage();
                const legacyImage = backgroundImageRef.current;
                if (legacyImage) {
                    await storeBackgroundImage(legacyImage);
                    try {
                        const saved = getPersistentItem(STORAGE_KEY_APPEARANCE);
                        if (saved) {
                            const parsed = JSON.parse(saved) as AppearanceSettings;
                            setPersistentItem(
                                STORAGE_KEY_APPEARANCE,
                                JSON.stringify({ ...parsed, backgroundImage: null }),
                            );
                        }
                    } catch (error) {
                        console.warn("Eski arka plan ayarı taşınamadı:", error);
                    }
                } else if (storedImage && isMounted) {
                    backgroundImageRef.current = storedImage;
                    setAppearance((current) => ({
                        ...current,
                        backgroundImage: storedImage,
                    }));
                }
            } catch (error) {
                console.error("Arka plan görseli yüklenemedi:", error);
            }
        };
        void loadBackground();
        return () => {
            isMounted = false;
        };
    }, []);

    const handleAppearanceChange = useCallback(
        async (nextAppearance: AppearanceSettings) => {
            const imageChanged =
                backgroundImageRef.current !== nextAppearance.backgroundImage;
            backgroundImageRef.current = nextAppearance.backgroundImage;
            setAppearance(nextAppearance);
            try {
                setPersistentItem(
                    STORAGE_KEY_APPEARANCE,
                    JSON.stringify({
                        ...nextAppearance,
                        backgroundImage: null,
                    }),
                );
                if (imageChanged) {
                    await storeBackgroundImage(nextAppearance.backgroundImage);
                }
                return true;
            } catch (error) {
                console.error("Görünüm ayarları kaydedilemedi:", error);
                return false;
            }
        },
        [],
    );

    const [sounds, setSounds] = useState<SoundItem[]>(() => {
        try {
            const saved = getPersistentItem(STORAGE_KEY_SOUNDS);
            if (saved !== null) {
                const parsed: unknown = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    const cleaned = parsed.filter(
                        (item): item is SoundItem =>
                            Boolean(item) && typeof item === "object",
                    );
                    return offloadSoundsArray(cleaned).sounds;
                }
            }
        } catch {
            // fallback
        }
        return STARTER_SOUNDS;
    });

    const [routingConfig, setRoutingConfig] = useState<AudioRoutingConfig>(
        () => {
            try {
                const saved = getPersistentItem(STORAGE_KEY_CONFIG);
                if (saved) {
                    const parsed = JSON.parse(saved) as Partial<AudioRoutingConfig>;
                    const loadedPrimaryId = parsed.primaryDeviceId || "default";
                    const loadedPrimaryLabel =
                        loadedPrimaryId === "default" &&
                        parsed.primaryDeviceLabel === "CABLE Input (VB-Audio Virtual Cable)"
                            ? "Varsayılan Sistem Çıkışı"
                            : parsed.primaryDeviceLabel || DEFAULT_CONFIG.primaryDeviceLabel;
                    return {
                        ...DEFAULT_CONFIG,
                        ...parsed,
                        primaryDeviceId: loadedPrimaryId,
                        primaryDeviceLabel: loadedPrimaryLabel,
                        muteMicOnPlay: parsed.muteMicOnPlay ?? true,
                        stopAllHotkey:
                            typeof parsed.stopAllHotkey === "string" &&
                            parsed.stopAllHotkey.trim() !== "" &&
                            normalizeHotkey(parsed.stopAllHotkey) !== "ESC"
                                ? parsed.stopAllHotkey
                                : DEFAULT_CONFIG.stopAllHotkey,
                    };
                }
            } catch {
                // fallback
            }
            return DEFAULT_CONFIG;
        },
    );

    const [voiceChangerConfig, setVoiceChangerConfig] =
        useState<VoiceChangerConfig>(() => {
            try {
                const saved = getPersistentItem(STORAGE_KEY_VOICE_CHANGER);
                if (saved) {
                    const parsed = JSON.parse(
                        saved,
                    ) as Partial<VoiceChangerConfig>;
                    return {
                        ...DEFAULT_VOICE_CHANGER_CONFIG,
                        ...parsed,
                    };
                }
            } catch {
                // fallback
            }
            return DEFAULT_VOICE_CHANGER_CONFIG;
        });

    const [currentTab, setCurrentTab] = useState<NavTab>("soundboard");
    const [makerInitialSoundId, setMakerInitialSoundId] = useState<string | null>(null);
    const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<SoundCategory>("Tümü");
    const [searchQuery, setSearchQuery] = useState("");
    const [activePlayingIds, setActivePlayingIds] = useState<string[]>([]);
    const [activePlaybackTracks, setActivePlaybackTracks] = useState<PlaybackTrackInfo[]>([]);
    const [hotkeyFilterConfig, setHotkeyFilterConfig] = useState<HotkeyFilterConfig>(() => {
        try {
            const saved = getPersistentItem(STORAGE_KEY_HOTKEY_FILTER);
            if (saved) {
                const parsed = JSON.parse(saved) as Partial<HotkeyFilterConfig>;
                return {
                    enabled: parsed.enabled ?? true,
                    manuallyPaused: parsed.manuallyPaused ?? false,
                    pauseInTextInputs: parsed.pauseInTextInputs ?? true,
                    allowedApps: Array.isArray(parsed.allowedApps) ? parsed.allowedApps : [],
                };
            }
        } catch {
            // fallback
        }
        return DEFAULT_HOTKEY_FILTER;
    });
    const [electronFilterStatus, setElectronFilterStatus] = useState<HotkeyFilterStatus>({
        paused: false,
    });
    const [remoteHostConnected, setRemoteHostConnected] = useState(false);
    const [remoteClients, setRemoteClients] = useState<RemoteConnectedClient[]>([]);
    const [relayBridgeConfig, setRelayBridgeConfig] = useState<RelayBridgeConfig>(() => {
        try {
            const raw = getPersistentItem(STORAGE_KEY_RELAY_BRIDGE);
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<RelayBridgeConfig>;
                return {
                    enabled: parsed.enabled ?? true,
                    relayUrl: parsed.relayUrl || DEFAULT_RELAY_URL,
                    roomCode: parsed.roomCode || generateRandomRoomCode(),
                    hostSecret: parsed.hostSecret || generateHostSecret(),
                    deviceName: parsed.deviceName || "Lir Masaüstü",
                    requirePin: parsed.requirePin ?? true,
                    pin: parsed.pin || generateRandomSixDigitPin(),
                };
            }
        } catch {
            // fallback to default
        }
        return createDefaultRelayBridgeConfig();
    });
    const [relayBridgeStatus, setRelayBridgeStatus] =
        useState<RelayBridgeConnectionState>("disabled");
    const [relayClients, setRelayClients] = useState<RemoteConnectedClient[]>([]);
    const [isCapturingStopHotkey, setIsCapturingStopHotkey] = useState(false);
    const [editingHotkeyTarget, setEditingHotkeyTarget] =
        useState<HotkeyTarget | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [lastTriggeredNotice, setLastTriggeredNotice] = useState<{
        key: string;
        label?: string;
    } | null>(null);
    const triggerToastTimeoutRef = useRef<number | null>(null);
    const [isVbCableInstalled, setIsVbCableInstalled] = useState<boolean>(false);
    const [discordStatus, setDiscordStatus] = useState<DiscordStatus>({
        connected: false,
        clientId: "1558769862053077114",
    });

    const isElectron =
        typeof window !== "undefined" && !!window.electronAPI?.isElectron;

    // Poll / listen for Discord RPC status
    useEffect(() => {
        if (!isElectron || !window.electronAPI) return;

        window.electronAPI.getDiscordRPCStatus?.().then((status) => {
            if (status) setDiscordStatus(status);
        });

        const unsub = window.electronAPI.onDiscordStatusChange?.((status) => {
            setDiscordStatus(status);
        });

        return () => {
            if (unsub) unsub();
        };
    }, [isElectron]);

    // Synchronize playback activity to Discord Rich Presence
    useEffect(() => {
        if (
            !isElectron ||
            !routingConfig.discordRpcEnabled ||
            !window.electronAPI?.updateDiscordActivity
        )
            return;

        if (activePlayingIds.length > 0) {
            const playingSounds = sounds.filter((s) =>
                activePlayingIds.includes(s.id),
            );
            const firstTitle = playingSounds[0]?.title || "Ses Efekti";
            const extraCount = playingSounds.length - 1;
            const titleDisplay =
                extraCount > 0 ? `${firstTitle} (+${extraCount})` : firstTitle;

            window.electronAPI.updateDiscordActivity({
                details: t("discordRpc.playing", {
                    title: titleDisplay,
                }),
                state: t("discordRpc.activeSounds", {
                    count: activePlayingIds.length,
                    volume: Math.round(routingConfig.masterVolume * 100),
                }),
                largeImageKey: "icon",
                largeImageText: "Lir - Modern Soundpad",
                smallImageKey: "play",
                smallImageText: t("discordRpc.playingShort"),
            });
        } else {
            window.electronAPI.updateDiscordActivity({
                details: t("discordRpc.idleDetails"),
                state: t("discordRpc.idleState", {
                    count: sounds.length,
                }),
                largeImageKey: "icon",
                largeImageText: "Lir - Modern Soundpad",
                smallImageKey: "mic",
                smallImageText: t("common.ready"),
            });
        }
    }, [
        isElectron,
        routingConfig.discordRpcEnabled,
        activePlayingIds,
        sounds,
        routingConfig.masterVolume,
    ]);

    useEffect(() => {
        if (!isElectron || !window.electronAPI?.setDiscordRPCEnabled) return;

        let isMounted = true;
        window.electronAPI
            .setDiscordRPCEnabled(routingConfig.discordRpcEnabled)
            .then((status) => {
                if (isMounted) setDiscordStatus(status);
            })
            .catch((error: unknown) => {
                console.error("Discord RPC ayarı uygulanamadı:", error);
            });

        return () => {
            isMounted = false;
        };
    }, [isElectron, routingConfig.discordRpcEnabled]);

    useEffect(() => {
        const { sounds: safeSounds, changed } = offloadSoundsArray(sounds);
        if (changed) {
            setSounds(safeSounds);
            return;
        }
        try {
            setPersistentItem(STORAGE_KEY_SOUNDS, JSON.stringify(safeSounds));
        } catch (e) {
            console.warn("Sounds save error:", e);
        }
    }, [sounds]);

    useEffect(() => {
        try {
            setPersistentItem(
                STORAGE_KEY_CONFIG,
                JSON.stringify(routingConfig),
            );
        } catch (e) {
            console.warn("Routing config save error:", e);
        }
        audioEngine.setRoutingConfig(
            routingConfig.primaryDeviceId,
            routingConfig.secondaryDeviceId,
            routingConfig.dualOutputEnabled,
            routingConfig.masterVolume,
            routingConfig.muteMicOnPlay,
        );
        audioEngine.setMicrophonePassThrough(
            routingConfig.micPassThrough,
            routingConfig.micDeviceId,
            routingConfig.micVolume,
        );
    }, [routingConfig]);

    useEffect(() => {
        try {
            setPersistentItem(
                STORAGE_KEY_VOICE_CHANGER,
                JSON.stringify(voiceChangerConfig),
            );
        } catch (e) {
            console.warn("Voice changer save error:", e);
        }
        audioEngine.setVoiceChangerConfig(voiceChangerConfig);
    }, [voiceChangerConfig]);

    const detectAndSyncAudioDevices = useCallback(async () => {
        try {
            if (!navigator.mediaDevices?.enumerateDevices) return;
            const devices = await navigator.mediaDevices.enumerateDevices();

            const outputs = devices.filter((d) => d.kind === "audiooutput");
            const inputs = devices.filter((d) => d.kind === "audioinput");

            const isVirtualOrLoopback = (label: string) => {
                const l = label.toLowerCase();
                return (
                    l.includes("cable") ||
                    l.includes("voicemeeter") ||
                    l.includes("stereo mix") ||
                    l.includes("stereo karışımı") ||
                    l.includes("what u hear") ||
                    l.includes("wave out")
                );
            };

            const vbCable = outputs.find(
                (d) =>
                    d.label.trim() !== "" &&
                    (d.label.toLowerCase().includes("cable input") ||
                        d.label.toLowerCase().includes("vb-audio")),
            );

            const physicalMic =
                inputs.find(
                    (d) =>
                        d.label.trim() !== "" &&
                        d.deviceId !== "default" &&
                        d.deviceId !== "communications" &&
                        !isVirtualOrLoopback(d.label),
                ) ||
                inputs.find(
                    (d) =>
                        d.label.trim() !== "" &&
                        !isVirtualOrLoopback(d.label),
                );

            setRoutingConfig((prev) => {
                let changed = false;
                const next = { ...prev };

                const primaryExists = outputs.some(
                    (d) => d.deviceId === next.primaryDeviceId,
                );
                if (
                    (next.primaryDeviceId === "default" ||
                        !next.primaryDeviceId ||
                        (outputs.length > 0 && !primaryExists)) &&
                    vbCable
                ) {
                    next.primaryDeviceId = vbCable.deviceId;
                    next.primaryDeviceLabel = vbCable.label;
                    changed = true;
                }

                const currentMicObj = inputs.find(
                    (d) => d.deviceId === next.micDeviceId,
                );
                const currentMicIsBad =
                    (currentMicObj?.label &&
                        isVirtualOrLoopback(currentMicObj.label)) ||
                    (inputs.length > 0 &&
                        next.micDeviceId !== "default" &&
                        !currentMicObj);

                if (
                    (next.micDeviceId === "default" ||
                        !next.micDeviceId ||
                        currentMicIsBad) &&
                    physicalMic
                ) {
                    next.micDeviceId = physicalMic.deviceId;
                    next.micDeviceLabel = physicalMic.label;
                    changed = true;
                }

                return changed ? next : prev;
            });
        } catch (err) {
            console.warn("Initial audio device detection error:", err);
        }
    }, []);

    const handleEnableMicFromVoiceChanger = useCallback(async () => {
        const res = await audioEngine.setMicrophonePassThrough(
            true,
            routingConfig.micDeviceId,
            routingConfig.micVolume,
        );
        if (res.success) {
            setRoutingConfig((prev) => ({
                ...prev,
                micPassThrough: true,
            }));
            void detectAndSyncAudioDevices();
        }
        return res;
    }, [
        routingConfig.micDeviceId,
        routingConfig.micVolume,
        detectAndSyncAudioDevices,
    ]);

    const isVoiceChangerActive =
        voiceChangerConfig.enabled && voiceChangerConfig.wetMix > 0;

    // Background audio device scan + devicechange listener to auto-assign VB-CABLE and physical mic
    useEffect(() => {
        void detectAndSyncAudioDevices();
        const handleDeviceChange = () => {
            void detectAndSyncAudioDevices();
        };
        navigator.mediaDevices?.addEventListener?.(
            "devicechange",
            handleDeviceChange,
        );
        return () => {
            navigator.mediaDevices?.removeEventListener?.(
                "devicechange",
                handleDeviceChange,
            );
        };
    }, [detectAndSyncAudioDevices]);

    useEffect(() => {
        try {
            setPersistentItem(
                STORAGE_KEY_HOTKEY_FILTER,
                JSON.stringify(hotkeyFilterConfig),
            );
        } catch (e) {
            console.warn("Hotkey filter save error:", e);
        }
        if (isElectron && window.electronAPI?.setHotkeyFilterConfig) {
            void window.electronAPI.setHotkeyFilterConfig(hotkeyFilterConfig);
        }
    }, [hotkeyFilterConfig, isElectron]);

    useEffect(() => {
        if (!isElectron || !window.electronAPI?.onHotkeyFilterStatus) return;
        const unsub = window.electronAPI.onHotkeyFilterStatus((status) => {
            setElectronFilterStatus(status);
        });
        return () => unsub?.();
    }, [isElectron]);

    useEffect(() => {
        audioEngine.setPlaybackListener((playingIds) => {
            setActivePlayingIds(playingIds);
        });
        audioEngine.setPlaybackDetailListener((tracks) => {
            setActivePlaybackTracks(tracks);
        });

        const handleUserGesture = () => {
            audioEngine.resumeContexts();
        };
        window.addEventListener("click", handleUserGesture);
        window.addEventListener("keydown", handleUserGesture);
        window.addEventListener("focus", handleUserGesture);
        return () => {
            window.removeEventListener("click", handleUserGesture);
            window.removeEventListener("keydown", handleUserGesture);
            window.removeEventListener("focus", handleUserGesture);
        };
    }, []);

    const handlePlaySound = useCallback(
        (sound: SoundItem) => {
            audioEngine.playSound(
                sound,
                routingConfig.masterVolume,
                routingConfig.playbackMode === "cutoff",
                routingConfig.primaryDeviceId,
                routingConfig.secondaryDeviceId,
                routingConfig.dualOutputEnabled,
            );
        },
        [routingConfig],
    );

    const handleStopSound = useCallback((soundId: string) => {
        audioEngine.stopSound(soundId);
    }, []);

    const handleStopAll = useCallback(() => {
        audioEngine.stopAll();
        setActivePlayingIds([]);
    }, []);

    const handleStopAllHotkeyCaptureChange = useCallback(
        async (capturing: boolean) => {
            if (capturing && isElectron && window.electronAPI) {
                try {
                    const result = await window.electronAPI.registerHotkeys([]);
                    if (!result.success) {
                        throw new Error("Global kısayollar kaldırılamadı.");
                    }
                } catch (error) {
                    console.error(
                        "Kısayol kaydı başlatılamadı:",
                        error,
                    );
                    throw error;
                }
            }
            setIsCapturingStopHotkey(capturing);
        },
        [isElectron],
    );

    const showTriggeredToast = useCallback((key: string, label?: string) => {
        setLastTriggeredNotice({ key, label });
        if (triggerToastTimeoutRef.current) {
            clearTimeout(triggerToastTimeoutRef.current);
        }
        triggerToastTimeoutRef.current = window.setTimeout(() => {
            setLastTriggeredNotice(null);
        }, 1400);
    }, []);

    const handleSelectVoicePreset = useCallback(
        (preset: VoicePresetDefinition) => {
            setVoiceChangerConfig((prev) => ({
                ...prev,
                preset: preset.id,
                enabled: preset.id !== "natural",
                ...preset.params,
            }));
        },
        [],
    );

    const handleToggleVoiceEngine = useCallback(() => {
        setVoiceChangerConfig((prev) => {
            const nextEnabled = !prev.enabled;
            if (nextEnabled && prev.wetMix === 0) {
                const fallbackPreset =
                    VOICE_PRESETS.find((p) => p.id === "studio") ??
                    VOICE_PRESETS[1];
                if (prev.preset === "natural") {
                    return {
                        ...prev,
                        enabled: true,
                        preset: fallbackPreset.id,
                        ...fallbackPreset.params,
                    };
                }
                return {
                    ...prev,
                    enabled: true,
                    wetMix: 0.75,
                };
            }
            return {
                ...prev,
                enabled: nextEnabled,
            };
        });
    }, []);

    const handleTriggerByKey = useCallback(
        (keyString: string): boolean => {
            if (!keyString) return false;
            const cleanKey = normalizeHotkey(keyString);

            if (cleanKey === normalizeHotkey(routingConfig.stopAllHotkey)) {
                handleStopAll();
                showTriggeredToast(cleanKey, t("soundboard.stopAll"));
                return true;
            }

            if (
                voiceChangerConfig.toggleHotkey &&
                cleanKey === normalizeHotkey(voiceChangerConfig.toggleHotkey)
            ) {
                const nextEnabled = !voiceChangerConfig.enabled;
                handleToggleVoiceEngine();
                if (nextEnabled && !routingConfig.micPassThrough) {
                    void handleEnableMicFromVoiceChanger();
                }
                showTriggeredToast(
                    cleanKey,
                    nextEnabled
                        ? `${t("voiceChanger.title")} (${t("common.active")})`
                        : `${t("voiceChanger.title")} (${t("common.inactive")})`,
                );
                return true;
            }

            const matchedPresetEntry = Object.entries(
                voiceChangerConfig.presetHotkeys ?? {},
            ).find(
                ([, assignedKey]) =>
                    Boolean(assignedKey) &&
                    normalizeHotkey(assignedKey as string) === cleanKey,
            );

            if (matchedPresetEntry) {
                const matchedPresetId = matchedPresetEntry[0] as VoicePresetId;
                const matchedPreset = VOICE_PRESETS.find(
                    (p) => p.id === matchedPresetId,
                );
                if (matchedPreset) {
                    const presetName = t(`voicePresets.${matchedPreset.id}_name`) || matchedPreset.name;
                    if (matchedPreset.id === "natural") {
                        setVoiceChangerConfig((prev) => ({
                            ...prev,
                            preset: "natural",
                            enabled: false,
                            ...matchedPreset.params,
                        }));
                        showTriggeredToast(cleanKey, presetName);
                    } else if (
                        voiceChangerConfig.enabled &&
                        voiceChangerConfig.preset === matchedPreset.id
                    ) {
                        setVoiceChangerConfig((prev) => ({
                            ...prev,
                            enabled: false,
                        }));
                        showTriggeredToast(
                            cleanKey,
                            `${presetName} (${t("common.inactive")})`,
                        );
                    } else {
                        setVoiceChangerConfig((prev) => ({
                            ...prev,
                            preset: matchedPreset.id,
                            enabled: true,
                            ...matchedPreset.params,
                        }));
                        if (!routingConfig.micPassThrough) {
                            void handleEnableMicFromVoiceChanger();
                        }
                        showTriggeredToast(
                            cleanKey,
                            `${presetName} (${t("common.active")})`,
                        );
                    }
                    return true;
                }
            }

            const matchedSound = sounds.find(
                (s) => s.hotkey.trim() !== "" && normalizeHotkey(s.hotkey) === cleanKey,
            );

            if (matchedSound) {
                showTriggeredToast(cleanKey, matchedSound.title);

                if (
                    activePlayingIds.includes(matchedSound.id) ||
                    audioEngine.isPlaying(matchedSound.id)
                ) {
                    handleStopSound(matchedSound.id);
                } else {
                    handlePlaySound(matchedSound);
                }
                return true;
            }

            return false;
        },
        [
            sounds,
            activePlayingIds,
            handlePlaySound,
            handleStopSound,
            handleStopAll,
            routingConfig.stopAllHotkey,
            routingConfig.micPassThrough,
            voiceChangerConfig.toggleHotkey,
            voiceChangerConfig.presetHotkeys,
            voiceChangerConfig.enabled,
            voiceChangerConfig.preset,
            handleToggleVoiceEngine,
            handleEnableMicFromVoiceChanger,
            showTriggeredToast,
            t,
        ],
    );

    const isHotkeyPausedForModal =
        isCapturingStopHotkey || editingHotkeyTarget !== null;
    const isHotkeysGloballyPaused =
        hotkeyFilterConfig.manuallyPaused ||
        (isElectron && electronFilterStatus.paused);

    useEffect(() => {
        let unsubscribeElectron: (() => void) | undefined;
        if (isElectron && !isVbCableInstalled) return;

        if (isElectron && window.electronAPI && !isHotkeyPausedForModal) {
            const seenKeys = new Set<string>();
            const hotkeyList: Array<{ hotkey: string; id: string }> = [];

            const pushHotkey = (raw: string | undefined, id: string) => {
                if (!raw || raw.trim() === "") return;
                const clean = normalizeHotkey(raw);
                if (seenKeys.has(clean)) return;
                seenKeys.add(clean);
                hotkeyList.push({ hotkey: clean, id });
            };

            pushHotkey(routingConfig.stopAllHotkey, "stop-all");
            pushHotkey(voiceChangerConfig.toggleHotkey, "voice-toggle");
            VOICE_PRESETS.forEach((p) =>
                pushHotkey(
                    voiceChangerConfig.presetHotkeys?.[p.id],
                    `voice-preset:${p.id}`,
                ),
            );
            sounds.forEach((s) => pushHotkey(s.hotkey, s.id));

            window.electronAPI.registerHotkeys(hotkeyList);

            unsubscribeElectron = window.electronAPI.onTriggerHotkey((key) => {
                if (isHotkeyPausedForModal || hotkeyFilterConfig.manuallyPaused) return;
                handleTriggerByKey(key);
            });
        } else if (isElectron && window.electronAPI && isHotkeyPausedForModal) {
            void window.electronAPI.registerHotkeys([]);
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.repeat) return;
            if (isHotkeyPausedForModal || isHotkeysGloballyPaused) return;
            if (
                hotkeyFilterConfig.pauseInTextInputs &&
                isTextEntryElement(e.target)
            ) {
                return;
            }

            const keyCombo = extractHotkeyFromKeyboardEvent(e);
            if (!keyCombo) return;
            if (handleTriggerByKey(keyCombo)) {
                e.preventDefault();
            }
        };

        window.addEventListener("keydown", handleKeyDown, true);
        return () => {
            if (unsubscribeElectron) unsubscribeElectron();
            window.removeEventListener("keydown", handleKeyDown, true);
        };
    }, [
        isElectron,
        isVbCableInstalled,
        sounds,
        routingConfig.stopAllHotkey,
        voiceChangerConfig.toggleHotkey,
        voiceChangerConfig.presetHotkeys,
        isHotkeyPausedForModal,
        isHotkeysGloballyPaused,
        hotkeyFilterConfig.manuallyPaused,
        hotkeyFilterConfig.pauseInTextInputs,
        handleTriggerByKey,
    ]);

    const handleToggleFavorite = useCallback((soundId: string) => {
        setSounds((prev) =>
            prev.map((s) =>
                s.id === soundId ? { ...s, isFavorite: !s.isFavorite } : s,
            ),
        );
    }, []);

    const handleToggleLoop = useCallback((soundId: string) => {
        setSounds((prev) =>
            prev.map((s) => {
                if (s.id !== soundId) return s;
                const nextLoop = !s.loop;
                audioEngine.updateSoundLoop(soundId, nextLoop);
                return { ...s, loop: nextLoop };
            }),
        );
    }, []);

    const handleVolumeChange = useCallback((soundId: string, volume: number) => {
        const clamped = Math.max(0, Math.min(1, volume));
        audioEngine.updateSoundVolume(soundId, clamped);
        setSounds((prev) =>
            prev.map((s) => (s.id === soundId ? { ...s, volume: clamped } : s)),
        );
    }, []);

    // Real-time Host WebSocket bridge for Android LAN companion clients
    const remoteWsRef = useRef<WebSocket | null>(null);
    const buildRemoteSnapshot = useCallback(() => {
        return {
            sounds: sounds.map((s) => ({
                id: s.id,
                title: s.title,
                category: s.category,
                hotkey: s.hotkey,
                duration: s.duration,
                volume: s.volume,
                isFavorite: s.isFavorite,
                loop: s.loop,
                addedAt: s.addedAt,
            })),
            activePlaying: activePlaybackTracks,
            routing: {
                masterVolume: routingConfig.masterVolume,
                playbackMode: routingConfig.playbackMode,
                primaryDeviceLabel: routingConfig.primaryDeviceLabel,
                dualOutputEnabled: routingConfig.dualOutputEnabled,
            },
            voiceChanger: {
                enabled: isVoiceChangerActive,
                preset: voiceChangerConfig.preset,
                presets: VOICE_PRESETS.map((p) => ({
                    id: p.id,
                    name: t(`voicePresets.${p.id}_name`) || p.name,
                    badge: t(`voicePresets.${p.id}_badge`) || p.badge,
                })),
            },
            updatedAt: Date.now(),
        };
    }, [
        sounds,
        activePlaybackTracks,
        routingConfig.masterVolume,
        routingConfig.playbackMode,
        routingConfig.primaryDeviceLabel,
        routingConfig.dualOutputEnabled,
        isVoiceChangerActive,
        voiceChangerConfig.preset,
        t,
    ]);

    const snapshotRef = useRef(buildRemoteSnapshot);
    snapshotRef.current = buildRemoteSnapshot;

    const remoteActionsRef = useRef({
        handlePlaySound,
        handleStopSound,
        handleStopAll,
        handleToggleFavorite,
        handleToggleLoop,
        handleVolumeChange,
        handleToggleVoiceEngine,
        handleSelectVoicePreset,
        handleEnableMicFromVoiceChanger,
        setRoutingConfig,
        sounds,
        routingConfig,
        voiceChangerConfig,
    });
    remoteActionsRef.current = {
        handlePlaySound,
        handleStopSound,
        handleStopAll,
        handleToggleFavorite,
        handleToggleLoop,
        handleVolumeChange,
        handleToggleVoiceEngine,
        handleSelectVoicePreset,
        handleEnableMicFromVoiceChanger,
        setRoutingConfig,
        sounds,
        routingConfig,
        voiceChangerConfig,
    };

    const relayWsRef = useRef<WebSocket | null>(null);
    const relayConfigRef = useRef(relayBridgeConfig);
    relayConfigRef.current = relayBridgeConfig;

    useEffect(() => {
        try {
            setPersistentItem(
                STORAGE_KEY_RELAY_BRIDGE,
                JSON.stringify(relayBridgeConfig),
            );
        } catch {
            // ignore storage errors
        }
    }, [relayBridgeConfig]);

    const executeRemoteCommand = useCallback((msg: Record<string, unknown>) => {
        const action = String(msg.action || "");
        const actions = remoteActionsRef.current;

        if (action === "sound:play" && typeof msg.soundId === "string") {
            const sound = actions.sounds.find((s) => s.id === msg.soundId);
            if (sound) actions.handlePlaySound(sound);
        } else if (action === "sound:stop" && typeof msg.soundId === "string") {
            actions.handleStopSound(msg.soundId);
        } else if (action === "sound:stopAll") {
            actions.handleStopAll();
        } else if (action === "sound:toggleFavorite" && typeof msg.soundId === "string") {
            actions.handleToggleFavorite(msg.soundId);
        } else if (action === "sound:toggleLoop" && typeof msg.soundId === "string") {
            actions.handleToggleLoop(msg.soundId);
        } else if (
            action === "sound:volume" &&
            typeof msg.soundId === "string" &&
            typeof msg.volume === "number"
        ) {
            actions.handleVolumeChange(msg.soundId, msg.volume);
        } else if (action === "master:volume" && typeof msg.volume === "number") {
            const vol = Math.max(0, Math.min(1, msg.volume));
            actions.setRoutingConfig((prev) => ({
                ...prev,
                masterVolume: vol,
            }));
        } else if (action === "voice:toggle") {
            const nextOn = !actions.voiceChangerConfig.enabled;
            actions.handleToggleVoiceEngine();
            if (nextOn && !actions.routingConfig.micPassThrough) {
                void actions.handleEnableMicFromVoiceChanger();
            }
        } else if (action === "voice:preset" && typeof msg.presetId === "string") {
            const preset = VOICE_PRESETS.find((p) => p.id === msg.presetId);
            if (preset) {
                actions.handleSelectVoicePreset(preset);
                if (preset.id !== "natural" && !actions.routingConfig.micPassThrough) {
                    void actions.handleEnableMicFromVoiceChanger();
                }
            }
        }
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const host = window.location.host;
        if (!host || window.location.protocol === "file:") return;

        let disposed = false;
        let reconnectTimer: number | null = null;

        const connect = () => {
            if (disposed) return;
            try {
                const ws = new WebSocket(`${protocol}//${host}/ws/remote?role=host`);
                remoteWsRef.current = ws;

                ws.onopen = () => {
                    if (disposed) {
                        ws.close();
                        return;
                    }
                    setRemoteHostConnected(true);
                    ws.send(
                        JSON.stringify({
                            type: "host:sync",
                            snapshot: snapshotRef.current(),
                        }),
                    );
                };

                ws.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(String(event.data)) as Record<string, unknown>;
                        if (msg.type === "host:clients" && Array.isArray(msg.connectedClients)) {
                            setRemoteClients(msg.connectedClients as RemoteConnectedClient[]);
                            return;
                        }
                        if (msg.type !== "remote:command") return;
                        executeRemoteCommand(msg);
                    } catch {
                        // ignore invalid remote payload
                    }
                };

                ws.onclose = () => {
                    setRemoteHostConnected(false);
                    if (remoteWsRef.current === ws) {
                        remoteWsRef.current = null;
                    }
                    if (!disposed) {
                        reconnectTimer = window.setTimeout(connect, 3500);
                    }
                };

                ws.onerror = () => {
                    // handled via onclose
                };
            } catch {
                if (!disposed) {
                    reconnectTimer = window.setTimeout(connect, 5000);
                }
            }
        };

        connect();
        return () => {
            disposed = true;
            if (reconnectTimer) window.clearTimeout(reconnectTimer);
            try {
                remoteWsRef.current?.close();
            } catch {
                // ignore
            }
            remoteWsRef.current = null;
        };
    }, [executeRemoteCommand]);

    // Outbound Cloud/Domain Bridge: supports BOTH Vercel Serverless WebRTC (/api/webrtc/signal)
    // AND optional Node WSS Relay (/ws/relay). Works everywhere including Electron file://
    const rtcPeersRef = useRef<
        Map<
            string,
            {
                pc: RTCPeerConnection;
                dc: RTCDataChannel | null;
                name: string;
                connectedAt: number;
            }
        >
    >(new Map());
    const pairedRtcTokensRef = useRef<Set<string>>(new Set());
    const [wsRelayClients, setWsRelayClients] = useState<RemoteConnectedClient[]>([]);
    const [rtcClients, setRtcClients] = useState<RemoteConnectedClient[]>([]);
    const [wsRelayStatus, setWsRelayStatus] = useState<RelayBridgeConnectionState>("disabled");
    const [rtcSignalStatus, setRtcSignalStatus] = useState<RelayBridgeConnectionState>("disabled");

    useEffect(() => {
        if (!relayBridgeConfig.enabled) {
            setRelayBridgeStatus("disabled");
            setRelayClients([]);
            return;
        }
        if (wsRelayStatus === "connected" || rtcSignalStatus === "connected") {
            setRelayBridgeStatus("connected");
        } else if (wsRelayStatus === "connecting" || rtcSignalStatus === "connecting") {
            setRelayBridgeStatus("connecting");
        } else {
            setRelayBridgeStatus("error");
        }
        setRelayClients([...rtcClients, ...wsRelayClients]);
    }, [relayBridgeConfig.enabled, wsRelayStatus, rtcSignalStatus, rtcClients, wsRelayClients]);

    // Clear paired WebRTC tokens if PIN or roomCode changes
    useEffect(() => {
        pairedRtcTokensRef.current.clear();
    }, [relayBridgeConfig.pin, relayBridgeConfig.roomCode]);

    // 1) WebRTC Host Signaling (works 100% serverless on Vercel + Upstash/KV)
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!relayBridgeConfig.enabled || typeof RTCPeerConnection === "undefined") {
            for (const entry of rtcPeersRef.current.values()) {
                try {
                    entry.dc?.close();
                    entry.pc.close();
                } catch {
                    // ignore
                }
            }
            rtcPeersRef.current.clear();
            setRtcClients([]);
            setRtcSignalStatus("disabled");
            return;
        }

        let signalEndpoint = "";
        try {
            const raw = relayBridgeConfig.relayUrl.trim() || DEFAULT_RELAY_URL;
            const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
            const parsed = new URL(normalized);
            signalEndpoint = `${parsed.origin}/api/webrtc/signal`;
        } catch {
            setRtcSignalStatus("error");
            return;
        }

        let disposed = false;
        let pollTimer: number | null = null;
        setRtcSignalStatus("connecting");

        const refreshRtcClientsList = () => {
            const list: RemoteConnectedClient[] = [];
            for (const [id, entry] of rtcPeersRef.current.entries()) {
                if (entry.dc && entry.dc.readyState === "open") {
                    list.push({
                        id,
                        name: entry.name,
                        ip: "WebRTC P2P",
                        connectedAt: entry.connectedAt,
                    });
                }
            }
            setRtcClients(list);
        };

        const handleIncomingOffer = async (offer: {
            sessionId: string;
            deviceName?: string;
            pin?: string;
            pairToken?: string;
            sdp: RTCSessionDescriptionInit;
        }) => {
            const cfg = relayConfigRef.current;
            const hasValidToken =
                typeof offer.pairToken === "string" &&
                pairedRtcTokensRef.current.has(offer.pairToken);
            const hasValidPin = (offer.pin || "").trim() === cfg.pin;

            if (cfg.requirePin && !hasValidToken && !hasValidPin) {
                await fetch(signalEndpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "host-answer",
                        roomCode: cfg.roomCode,
                        hostSecret: cfg.hostSecret,
                        sessionId: offer.sessionId,
                        status: "rejected",
                        reason: "Geçersiz eşleştirme PIN kodu.",
                    }),
                }).catch(() => {});
                return;
            }

            const existing = rtcPeersRef.current.get(offer.sessionId);
            if (existing) {
                try {
                    existing.dc?.close();
                    existing.pc.close();
                } catch {
                    // ignore
                }
                rtcPeersRef.current.delete(offer.sessionId);
            }

            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: "stun:stun.l.google.com:19302" },
                    { urls: "stun:stun1.l.google.com:19302" },
                ],
            });

            const entry = {
                pc,
                dc: null as RTCDataChannel | null,
                name: offer.deviceName?.trim().slice(0, 48) || "Android Web Kumanda",
                connectedAt: Date.now(),
            };
            rtcPeersRef.current.set(offer.sessionId, entry);

            const cleanupPeer = () => {
                const cur = rtcPeersRef.current.get(offer.sessionId);
                if (cur && cur.pc === pc) {
                    rtcPeersRef.current.delete(offer.sessionId);
                    refreshRtcClientsList();
                }
                try {
                    pc.close();
                } catch {
                    // ignore
                }
            };

            pc.onconnectionstatechange = () => {
                if (
                    pc.connectionState === "failed" ||
                    pc.connectionState === "closed" ||
                    pc.connectionState === "disconnected"
                ) {
                    cleanupPeer();
                }
            };

            pc.ondatachannel = (event) => {
                const dc = event.channel;
                entry.dc = dc;

                dc.onopen = () => {
                    const pairToken = generateHostSecret();
                    pairedRtcTokensRef.current.add(pairToken);
                    const currentCfg = relayConfigRef.current;
                    try {
                        dc.send(JSON.stringify({ type: "auth:paired", pairToken }));
                        dc.send(
                            JSON.stringify({
                                type: "state:init",
                                roomCode: currentCfg.roomCode,
                                deviceId: `lir-${currentCfg.roomCode}`,
                                deviceName: currentCfg.deviceName || "Lir Masaüstü",
                                hostConnected: true,
                                ...snapshotRef.current(),
                            }),
                        );
                    } catch {
                        // ignore send errors
                    }
                    refreshRtcClientsList();
                };

                dc.onmessage = (msgEvent) => {
                    try {
                        const msg = JSON.parse(String(msgEvent.data)) as Record<string, unknown>;
                        const msgType = typeof msg.type === "string" ? msg.type : "";
                        if (msgType === "ping") {
                            dc.send(JSON.stringify({ type: "pong", ts: Date.now() }));
                            return;
                        }
                        if (msgType === "state:request") {
                            const currentCfg = relayConfigRef.current;
                            dc.send(
                                JSON.stringify({
                                    type: "state:init",
                                    roomCode: currentCfg.roomCode,
                                    deviceId: `lir-${currentCfg.roomCode}`,
                                    deviceName: currentCfg.deviceName || "Lir Masaüstü",
                                    hostConnected: true,
                                    ...snapshotRef.current(),
                                }),
                            );
                            return;
                        }
                        const action = typeof msg.action === "string" ? msg.action : msgType;
                        if (action) {
                            executeRemoteCommand({ ...msg, action });
                        }
                    } catch {
                        // ignore invalid datachannel payloads
                    }
                };

                dc.onclose = cleanupPeer;
            };

            try {
                await pc.setRemoteDescription(offer.sdp);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                await new Promise<void>((resolve) => {
                    if (pc.iceGatheringState === "complete") {
                        resolve();
                        return;
                    }
                    const timeout = window.setTimeout(resolve, 1400);
                    const onState = () => {
                        if (pc.iceGatheringState === "complete") {
                            window.clearTimeout(timeout);
                            pc.removeEventListener("icegatheringstatechange", onState);
                            resolve();
                        }
                    };
                    pc.addEventListener("icegatheringstatechange", onState);
                });

                await fetch(signalEndpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "host-answer",
                        roomCode: cfg.roomCode,
                        hostSecret: cfg.hostSecret,
                        sessionId: offer.sessionId,
                        status: "ok",
                        sdp: pc.localDescription,
                    }),
                });
            } catch {
                cleanupPeer();
            }
        };

        const pollSignal = async () => {
            if (disposed) return;
            const cfg = relayConfigRef.current;
            try {
                const res = await fetch(signalEndpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "host-poll",
                        roomCode: cfg.roomCode,
                        hostSecret: cfg.hostSecret,
                        deviceId: `lir-${cfg.roomCode}`,
                        deviceName: cfg.deviceName || "Lir Masaüstü",
                        requirePin: cfg.requirePin,
                        soundCount: remoteActionsRef.current.sounds.length,
                    }),
                });
                if (!res.ok) {
                    if (!disposed) setRtcSignalStatus("error");
                } else {
                    if (!disposed) setRtcSignalStatus("connected");
                    const data = (await res.json()) as {
                        offers?: Array<{
                            sessionId: string;
                            deviceName?: string;
                            pin?: string;
                            pairToken?: string;
                            sdp: RTCSessionDescriptionInit;
                        }>;
                    };
                    if (Array.isArray(data.offers)) {
                        for (const offer of data.offers) {
                            void handleIncomingOffer(offer);
                        }
                    }
                }
            } catch {
                if (!disposed) setRtcSignalStatus("error");
            } finally {
                if (!disposed) {
                    pollTimer = window.setTimeout(() => void pollSignal(), 2800);
                }
            }
        };

        void pollSignal();

        return () => {
            disposed = true;
            if (pollTimer) window.clearTimeout(pollTimer);
            for (const entry of rtcPeersRef.current.values()) {
                try {
                    entry.dc?.close();
                    entry.pc.close();
                } catch {
                    // ignore
                }
            }
            rtcPeersRef.current.clear();
            setRtcClients([]);
        };
    }, [
        relayBridgeConfig.enabled,
        relayBridgeConfig.relayUrl,
        relayBridgeConfig.roomCode,
        relayBridgeConfig.hostSecret,
        executeRemoteCommand,
    ]);

    // 2) Optional WSS Relay (active when relayUrl hosts a persistent Node relay server)
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!relayBridgeConfig.enabled) {
            relayWsRef.current?.close();
            relayWsRef.current = null;
            setWsRelayStatus("disabled");
            setWsRelayClients([]);
            return;
        }

        let wsUrl = "";
        let healthUrl = "";
        try {
            const raw = relayBridgeConfig.relayUrl.trim() || DEFAULT_RELAY_URL;
            const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
            const parsed = new URL(normalized);
            const wsProto = parsed.protocol === "https:" ? "wss:" : "ws:";
            const params = new URLSearchParams({
                role: "host",
                room: relayBridgeConfig.roomCode,
                secret: relayBridgeConfig.hostSecret,
                deviceId: `lir-${relayBridgeConfig.roomCode}`,
                deviceName: relayBridgeConfig.deviceName || "Lir Masaüstü",
            });
            wsUrl = `${wsProto}//${parsed.host}/ws/relay?${params.toString()}`;
            healthUrl = `${parsed.origin}/api/relay/health`;
        } catch {
            setWsRelayStatus("error");
            return;
        }

        let disposed = false;
        let reconnectTimer: number | null = null;

        const connectRelay = async () => {
            if (disposed) return;
            setWsRelayStatus("connecting");

            // Avoid spurious WebSocket handshake errors on Vercel static/serverless deployments
            try {
                const probe = await fetch(healthUrl);
                const data = probe.ok ? ((await probe.json().catch(() => null)) as { ok?: boolean } | null) : null;
                if (!data?.ok) {
                    if (!disposed) setWsRelayStatus("disabled");
                    return;
                }
            } catch {
                if (!disposed) setWsRelayStatus("disabled");
                return;
            }

            if (disposed) return;

            try {
                const ws = new WebSocket(wsUrl);
                relayWsRef.current = ws;

                ws.onopen = () => {
                    if (disposed) {
                        ws.close();
                        return;
                    }
                    setWsRelayStatus("connected");
                    const cfg = relayConfigRef.current;
                    ws.send(
                        JSON.stringify({
                            type: "host:config",
                            deviceId: `lir-${cfg.roomCode}`,
                            deviceName: cfg.deviceName || "Lir Masaüstü",
                            requirePin: cfg.requirePin,
                            pin: cfg.pin,
                        }),
                    );
                    ws.send(
                        JSON.stringify({
                            type: "host:sync",
                            snapshot: snapshotRef.current(),
                        }),
                    );
                };

                ws.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(String(event.data)) as Record<string, unknown>;
                        if (msg.type === "ping") {
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
                            }
                            return;
                        }
                        if (msg.type === "host:clients" && Array.isArray(msg.connectedClients)) {
                            setWsRelayClients(msg.connectedClients as RemoteConnectedClient[]);
                            return;
                        }
                        if (msg.type === "remote:command") {
                            executeRemoteCommand(msg);
                        }
                    } catch {
                        // ignore invalid relay frames
                    }
                };

                ws.onclose = () => {
                    if (relayWsRef.current === ws) {
                        relayWsRef.current = null;
                    }
                    if (!disposed) {
                        setWsRelayStatus("error");
                        reconnectTimer = window.setTimeout(() => void connectRelay(), 8000);
                    }
                };

                ws.onerror = () => {
                    if (!disposed) {
                        setWsRelayStatus("error");
                    }
                };
            } catch {
                if (!disposed) {
                    setWsRelayStatus("error");
                    reconnectTimer = window.setTimeout(() => void connectRelay(), 10000);
                }
            }
        };

        void connectRelay();
        return () => {
            disposed = true;
            if (reconnectTimer) window.clearTimeout(reconnectTimer);
            try {
                relayWsRef.current?.close();
            } catch {
                // ignore
            }
            relayWsRef.current = null;
        };
    }, [
        relayBridgeConfig.enabled,
        relayBridgeConfig.relayUrl,
        relayBridgeConfig.roomCode,
        relayBridgeConfig.hostSecret,
        executeRemoteCommand,
    ]);

    useEffect(() => {
        const relayWs = relayWsRef.current;
        if (relayWs && relayWs.readyState === WebSocket.OPEN) {
            relayWs.send(
                JSON.stringify({
                    type: "host:config",
                    deviceId: `lir-${relayBridgeConfig.roomCode}`,
                    deviceName: relayBridgeConfig.deviceName || "Lir Masaüstü",
                    requirePin: relayBridgeConfig.requirePin,
                    pin: relayBridgeConfig.pin,
                }),
            );
        }
    }, [
        relayBridgeConfig.deviceName,
        relayBridgeConfig.requirePin,
        relayBridgeConfig.pin,
        relayBridgeConfig.roomCode,
    ]);

    useEffect(() => {
        const snapshot = buildRemoteSnapshot();
        const payload = JSON.stringify({
            type: "host:sync",
            snapshot,
        });
        const ws = remoteWsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(payload);
        }
        const relayWs = relayWsRef.current;
        if (relayWs && relayWs.readyState === WebSocket.OPEN) {
            relayWs.send(payload);
        }
        const rtcPayload = JSON.stringify({
            type: "state:update",
            roomCode: relayBridgeConfig.roomCode,
            deviceId: `lir-${relayBridgeConfig.roomCode}`,
            deviceName: relayBridgeConfig.deviceName || "Lir Masaüstü",
            hostConnected: true,
            ...snapshot,
        });
        for (const entry of rtcPeersRef.current.values()) {
            if (entry.dc && entry.dc.readyState === "open") {
                try {
                    entry.dc.send(rtcPayload);
                } catch {
                    // ignore closed channel
                }
            }
        }
    }, [buildRemoteSnapshot, relayBridgeConfig.roomCode, relayBridgeConfig.deviceName]);

    const handleDeleteSound = (soundId: string) => {
        audioEngine.stopSound(soundId);
        setSounds((prev) => prev.filter((s) => s.id !== soundId));
    };

    const handleSaveHotkey = (target: HotkeyTarget, newHotkey: string) => {
        const cleanNew = normalizeHotkey(newHotkey);

        setSounds((prev) =>
            prev.map((s) => {
                if (target.kind === "sound" && s.id === target.id) {
                    return { ...s, hotkey: cleanNew };
                }
                if (cleanNew && normalizeHotkey(s.hotkey) === cleanNew) {
                    return { ...s, hotkey: "" };
                }
                return s;
            }),
        );

        setVoiceChangerConfig((prev) => {
            const nextPresetHotkeys: Partial<Record<VoicePresetId, string>> = {
                ...(prev.presetHotkeys ?? {}),
            };
            let nextToggle = prev.toggleHotkey ?? "";

            if (cleanNew) {
                for (const key of Object.keys(nextPresetHotkeys) as VoicePresetId[]) {
                    const existing = nextPresetHotkeys[key];
                    if (existing && normalizeHotkey(existing) === cleanNew) {
                        delete nextPresetHotkeys[key];
                    }
                }
                if (nextToggle && normalizeHotkey(nextToggle) === cleanNew) {
                    nextToggle = "";
                }
            }

            if (target.kind === "voice-preset") {
                if (cleanNew) {
                    nextPresetHotkeys[target.presetId] = cleanNew;
                } else {
                    delete nextPresetHotkeys[target.presetId];
                }
            } else if (target.kind === "voice-toggle") {
                nextToggle = cleanNew;
            }

            return {
                ...prev,
                presetHotkeys: nextPresetHotkeys,
                toggleHotkey: nextToggle,
            };
        });
    };

    const existingBindings = useMemo<ExistingHotkeyBinding[]>(() => {
        const list: ExistingHotkeyBinding[] = [];
        sounds.forEach((s) => {
            if (s.hotkey.trim()) {
                list.push({
                    targetKey: `sound:${s.id}`,
                    label: s.title,
                    hotkey: s.hotkey,
                });
            }
        });
        VOICE_PRESETS.forEach((p) => {
            const hk = voiceChangerConfig.presetHotkeys?.[p.id];
            if (hk && hk.trim()) {
                list.push({
                    targetKey: `voice-preset:${p.id}`,
                    label: `Ses Efekti: ${p.name}`,
                    hotkey: hk,
                });
            }
        });
        if (voiceChangerConfig.toggleHotkey?.trim()) {
            list.push({
                targetKey: "voice-toggle",
                label: t("hotkeys.engineToggleTitle"),
                hotkey: voiceChangerConfig.toggleHotkey,
            });
        }
        if (routingConfig.stopAllHotkey?.trim()) {
            list.push({
                targetKey: "stop-all",
                label: t("settings.stopAllHotkeyTitle"),
                hotkey: routingConfig.stopAllHotkey,
            });
        }
        return list;
    }, [sounds, voiceChangerConfig, routingConfig.stopAllHotkey]);

    const handleAddSound = (
        newSoundData: Omit<SoundItem, "id" | "addedAt">,
    ): SoundItem => {
        const draft: SoundItem = {
            ...newSoundData,
            id: `snd-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            addedAt: Date.now(),
        };
        const newSound = offloadSoundItem(draft).sound;
        setSounds((prev) => [newSound, ...prev]);
        return newSound;
    };

    const handleUpdateSoundTrim = useCallback(
        (
            soundId: string,
            trimStart: number,
            trimEnd: number,
            nextTitle?: string,
            segments?: SoundSegment[],
        ) => {
            audioEngine.stopSound(soundId);
            const hasMulti = Boolean(segments && segments.length > 0);
            const clipDuration = hasMulti
                ? Math.max(
                      0.05,
                      Math.round(
                          segments!.reduce(
                              (sum, seg) => sum + Math.max(0.05, seg.end - seg.start),
                              0,
                          ) * 1000,
                      ) / 1000,
                  )
                : Math.max(
                      0.05,
                      Math.round((trimEnd - trimStart) * 1000) / 1000,
                  );
            setSounds((prev) =>
                prev.map((s) =>
                    s.id === soundId
                        ? {
                              ...s,
                              title: nextTitle?.trim() ? nextTitle.trim() : s.title,
                              trimStart: hasMulti ? undefined : trimStart,
                              trimEnd: hasMulti ? undefined : trimEnd,
                              segments: hasMulti ? segments : undefined,
                              duration: clipDuration,
                          }
                        : s,
                ),
            );
        },
        [],
    );

    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

    const handleResetToDefaults = () => {
        setIsResetConfirmOpen(true);
    };

    const handleConfirmReset = () => {
        audioEngine.stopAll();
        setSounds(STARTER_SOUNDS);
        setIsResetConfirmOpen(false);
    };

    const handleOpenElectronFilePicker = async () => {
        if (window.electronAPI) {
            const files = await window.electronAPI.openFileDialog();
            if (files && files.length > 0) {
                const added = files.map((f, i) => ({
                    id: `snd-${Date.now()}-${i}`,
                    title: f.name,
                    hotkey: `F${(sounds.length + i + 1) % 12 || 12}`,
                    duration: 2.0,
                    category: "Özel" as SoundCategory,
                    volume: 1.0,
                    isFavorite: false,
                    loop: false,
                    playMode: "overlap" as const,
                    dataUrl: f.fileUrl,
                    addedAt: Date.now(),
                }));
                setSounds((prev) => [...added, ...prev]);
                setIsAddModalOpen(false);
            }
        }
    };

    const filteredSounds = useMemo(() => {
        return sounds.filter((s) => {
            if (showOnlyFavorites && !s.isFavorite) {
                return false;
            }
            if (selectedCategory !== "Tümü" && s.category !== selectedCategory) {
                return false;
            }
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase();
                const matchTitle = s.title.toLowerCase().includes(query);
                const matchHotkey = s.hotkey.toLowerCase().includes(query);
                const matchCategory = s.category.toLowerCase().includes(query);
                if (!matchTitle && !matchHotkey && !matchCategory) return false;
            }
            return true;
        });
    }, [sounds, showOnlyFavorites, selectedCategory, searchQuery]);

    const favoriteCount = useMemo(
        () => sounds.filter((s) => s.isFavorite).length,
        [sounds],
    );

    return (
        <MotionConfig reducedMotion="user">
            <div
                className="relative flex h-screen w-screen overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)] font-sans select-none antialiased"
                data-background-image={appearance.backgroundImage ? "true" : undefined}
                style={{
                    "--card-transparency": `${appearance.cardTransparency}%`,
                    backgroundColor: appearance.backgroundImage
                        ? "transparent"
                        : "var(--bg-canvas)",
                } as React.CSSProperties}
            >
            {appearance.backgroundImage && (
                <div
                    className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
                    aria-hidden="true"
                >
                    <div
                        className="absolute inset-0 scale-[1.04] bg-cover bg-center"
                        style={{
                            backgroundImage: `url("${appearance.backgroundImage}")`,
                            filter:
                                appearance.backgroundBlur > 0
                                    ? `blur(${appearance.backgroundBlur}px)`
                                    : undefined,
                        }}
                    />
                    <div className="absolute inset-0 bg-black/45" />
                </div>
            )}

            {/* Sidebar */}
            <Sidebar
                currentTab={currentTab}
                onTabChange={setCurrentTab}
                soundCount={sounds.length}
                activePlayingCount={activePlayingIds.length}
                isVoiceChangerActive={isVoiceChangerActive}
                backgroundImageEnabled={Boolean(appearance.backgroundImage)}
                transparency={appearance.sidebarTransparency}
                uiStyle={uiStyle}
            />

            {/* Main View Area */}
            <div
                className="relative z-10 flex-1 flex flex-col min-w-0 overflow-hidden bg-[var(--bg-canvas)]"
                style={{
                    backgroundColor: appearance.backgroundImage
                        ? "transparent"
                        : "var(--bg-canvas)",
                }}
            >
                {/* Top Header */}
                <Header
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onAddNewSound={() => setIsAddModalOpen(true)}
                    onStopAll={handleStopAll}
                    routingConfig={routingConfig}
                    onRoutingConfigChange={setRoutingConfig}
                    voiceChangerConfig={voiceChangerConfig}
                    onSelectVoicePreset={handleSelectVoicePreset}
                    onToggleVoiceChanger={handleToggleVoiceEngine}
                    onOpenVoiceChangerTab={() => setCurrentTab("voice")}
                    activePlayingCount={activePlayingIds.length}
                    onOpenRoutingTab={() => setCurrentTab("routing")}
                    hotkeyManuallyPaused={hotkeyFilterConfig.manuallyPaused}
                    hotkeyFilterStatus={electronFilterStatus}
                    onTogglePauseHotkeys={() =>
                        setHotkeyFilterConfig((prev) => ({
                            ...prev,
                            manuallyPaused: !prev.manuallyPaused,
                        }))
                    }
                    backgroundImageEnabled={Boolean(appearance.backgroundImage)}
                    transparency={appearance.headerTransparency}
                    uiStyle={uiStyle}
                />

                {/* Scrollable Content (passes transparently behind floating Header in Gama & Win11) */}
                <main
                    className={`flex-1 overflow-y-auto px-4 sm:px-6 pb-8 flex flex-col gap-8 ${
                        uiStyle === "win10" ? "pt-5" : "pt-[76px]"
                    }`}
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentTab}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{
                                duration: 0.2,
                                ease: [0.22, 1, 0.36, 1],
                            }}
                            className="flex-1 flex flex-col w-full"
                        >
                            {currentTab === "soundboard" && (
                                <div className="flex-1 flex flex-col gap-5 w-full">
                                    {/* Soundboard Page Header */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex items-center gap-3.5">
                                            <div className="w-11 h-11 ui-inner bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
                                                <Volume2 className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                                                    {t("nav.soundboard")}
                                                </h1>
                                                <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] mt-0.5">
                                                    {t("soundboard.subtitle")}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Right Segmented Pill Switcher + Reset */}
                                        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                                            <div className="flex items-center gap-1 p-1 ui-control bg-[var(--bg-island)] border border-[var(--border-subtle)]">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowOnlyFavorites(false)}
                                                    className={`relative flex items-center gap-2 px-3.5 py-1.5 ui-control text-xs font-semibold transition-colors cursor-pointer ${
                                                        !showOnlyFavorites
                                                            ? ""
                                                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                                    }`}
                                                    style={
                                                        !showOnlyFavorites
                                                            ? { color: "var(--btn-primary-text)" }
                                                            : undefined
                                                    }
                                                >
                                                    {!showOnlyFavorites && (
                                                        <motion.span
                                                            layoutId="soundboardFilterPill"
                                                            transition={{
                                                                type: "spring",
                                                                stiffness: 480,
                                                                damping: 34,
                                                            }}
                                                            className="absolute inset-0 ui-control"
                                                            style={{
                                                                backgroundColor: "var(--btn-primary-bg)",
                                                            }}
                                                        />
                                                    )}
                                                    <span className="relative z-10">{t('common.all')}</span>
                                                    <span
                                                        className={`relative z-10 px-1.5 py-0.2 ui-control text-[11px] font-mono ${
                                                            !showOnlyFavorites
                                                                ? "bg-black/20 text-[var(--btn-primary-text)]"
                                                                : "bg-[var(--bg-inner)] text-[var(--text-muted)]"
                                                        }`}
                                                    >
                                                        {sounds.length}
                                                    </span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => setShowOnlyFavorites(true)}
                                                    className={`relative flex items-center gap-1.5 px-3.5 py-1.5 ui-control text-xs font-semibold transition-colors cursor-pointer ${
                                                        showOnlyFavorites
                                                            ? ""
                                                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                                    }`}
                                                    style={
                                                        showOnlyFavorites
                                                            ? { color: "var(--btn-primary-text)" }
                                                            : undefined
                                                    }
                                                >
                                                    {showOnlyFavorites && (
                                                        <motion.span
                                                            layoutId="soundboardFilterPill"
                                                            transition={{
                                                                type: "spring",
                                                                stiffness: 480,
                                                                damping: 34,
                                                            }}
                                                            className="absolute inset-0 ui-control"
                                                            style={{
                                                                backgroundColor: "var(--btn-primary-bg)",
                                                            }}
                                                        />
                                                    )}
                                                    <Heart
                                                        className={`relative z-10 w-3.5 h-3.5 ${showOnlyFavorites ? "fill-current" : ""}`}
                                                    />
                                                    <span className="relative z-10">{t('soundboard.favorites')}</span>
                                                    <span
                                                        className={`relative z-10 px-1.5 py-0.2 ui-control text-[11px] font-mono ${
                                                            showOnlyFavorites
                                                                ? "bg-black/20 text-[var(--btn-primary-text)]"
                                                                : "bg-[var(--bg-inner)] text-[var(--text-muted)]"
                                                        }`}
                                                    >
                                                        {favoriteCount}
                                                    </span>
                                                </button>
                                            </div>

                                            <motion.button
                                                type="button"
                                                whileHover={{ rotate: -25 }}
                                                whileTap={{ scale: 0.9, rotate: -90 }}
                                                transition={{
                                                    type: "spring",
                                                    stiffness: 420,
                                                    damping: 26,
                                                }}
                                                onClick={handleResetToDefaults}
                                                title={t('soundboard.loadStarterSounds')}
                                                className="p-2.5 ui-control bg-[var(--bg-island)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                            >
                                                <RotateCcw className="w-4 h-4" />
                                            </motion.button>
                                        </div>
                                    </div>

                                    {/* Announcement Carousel (Koru Store / Lir Mobile) */}
                                    <KoruBanner />

                                    {/* Category Filter Pills */}
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {CATEGORIES.map((category) => {
                                            const isActive = selectedCategory === category;
                                            return (
                                                <motion.button
                                                    key={category}
                                                    type="button"
                                                    whileHover={{ y: -1 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() => setSelectedCategory(category)}
                                                    className={`relative px-3.5 py-1.5 ui-control text-xs font-medium border transition-colors cursor-pointer ${
                                                        isActive
                                                            ? "border-[var(--accent-border)] text-[var(--accent-text)] font-semibold"
                                                            : "bg-[var(--bg-card)] border-[var(--border-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]"
                                                    }`}
                                                >
                                                    {isActive && (
                                                        <motion.span
                                                            layoutId="categoryFilterPill"
                                                            transition={{
                                                                type: "spring",
                                                                stiffness: 480,
                                                                damping: 34,
                                                            }}
                                                            className="absolute inset-0 ui-control bg-[var(--accent-subtle)]"
                                                        />
                                                    )}
                                                    <span className="relative z-10">{t(`categories.${category}`) || category}</span>
                                                </motion.button>
                                            );
                                        })}
                                    </div>

                                    {/* Sound Cards Grid */}
                                    {filteredSounds.length > 0 ? (
                                        <motion.div
                                            layout
                                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5"
                                        >
                                            <AnimatePresence mode="popLayout">
                                                {filteredSounds.map((sound) => (
                                                    <SoundCard
                                                        key={sound.id}
                                                        sound={sound}
                                                        isPlaying={activePlayingIds.includes(
                                                            sound.id,
                                                        )}
                                                        playbackTrack={activePlaybackTracks.find(
                                                            (track) => track.soundId === sound.id,
                                                        )}
                                                        onPlay={handlePlaySound}
                                                        onStop={handleStopSound}
                                                        onToggleFavorite={
                                                            handleToggleFavorite
                                                        }
                                                        onToggleLoop={handleToggleLoop}
                                                        onVolumeChange={handleVolumeChange}
                                                        onDelete={handleDeleteSound}
                                                        onOpenHotkeyModal={(sound) =>
                                                            setEditingHotkeyTarget({
                                                                kind: "sound",
                                                                id: sound.id,
                                                                title: sound.title,
                                                                hotkey: sound.hotkey,
                                                            })
                                                        }
                                                        onOpenInMaker={(sound) => {
                                                            setMakerInitialSoundId(sound.id);
                                                            setCurrentTab("maker");
                                                        }}
                                                    />
                                                ))}
                                            </AnimatePresence>
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.97 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ duration: 0.2 }}
                                            className="app-card ui-card flex-1 flex flex-col items-center justify-center p-12 text-center border border-[var(--border-card)] my-4"
                                        >
                                            <div className="w-12 h-12 ui-inner bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center mb-3 text-[var(--accent-text)]">
                                                <Music className="w-6 h-6" />
                                            </div>
                                            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                                                {t('soundboard.noSearchResultsTitle')}
                                            </h3>
                                            <p className="text-xs text-[var(--text-secondary)] max-w-xs mb-4">
                                                {searchQuery
                                                    ? t('soundboard.noSearchResultsSubtitle', { query: searchQuery })
                                                    : t('soundboard.noSoundsSubtitle')}
                                            </p>
                                            <motion.button
                                                type="button"
                                                whileHover={{ scale: 1.03 }}
                                                whileTap={{ scale: 0.95 }}
                                                onClick={() => setIsAddModalOpen(true)}
                                                className="btn-accent flex items-center gap-1.5 px-4 py-2 ui-control text-xs font-semibold transition-colors cursor-pointer"
                                            >
                                                <Plus className="w-4 h-4" />
                                                <span>{t('header.addNewSound')}</span>
                                            </motion.button>
                                        </motion.div>
                                    )}
                                </div>
                            )}

                            {currentTab === "voice" && (
                                <VoiceChangerView
                                    config={voiceChangerConfig}
                                    onChange={setVoiceChangerConfig}
                                    micPassThrough={routingConfig.micPassThrough}
                                    onEnableMicPassThrough={
                                        handleEnableMicFromVoiceChanger
                                    }
                                    routingConfig={routingConfig}
                                    onEditPresetHotkey={(preset) =>
                                        setEditingHotkeyTarget({
                                            kind: "voice-preset",
                                            presetId: preset.id,
                                            title: t("hotkeys.presetTargetTitle", {
                                                name:
                                                    t(`voicePresets.${preset.id}_name`) ||
                                                    preset.name,
                                            }),
                                            hotkey:
                                                voiceChangerConfig.presetHotkeys?.[
                                                    preset.id
                                                ] || "",
                                        })
                                    }
                                    onEditToggleHotkey={() =>
                                        setEditingHotkeyTarget({
                                            kind: "voice-toggle",
                                            title: t("hotkeys.engineToggleTitle"),
                                            hotkey:
                                                voiceChangerConfig.toggleHotkey ||
                                                "",
                                        })
                                    }
                                />
                            )}

                            {currentTab === "routing" && (
                                <AudioRoutingView
                                    routingConfig={routingConfig}
                                    onRoutingConfigChange={setRoutingConfig}
                                    isElectron={isElectron}
                                />
                            )}

                            {currentTab === "hotkeys" && (
                                <HotkeysView
                                    sounds={sounds}
                                    voiceChangerConfig={voiceChangerConfig}
                                    stopAllHotkey={routingConfig.stopAllHotkey}
                                    onOpenHotkeyModal={(sound) =>
                                        setEditingHotkeyTarget({
                                            kind: "sound",
                                            id: sound.id,
                                            title: sound.title,
                                            hotkey: sound.hotkey,
                                        })
                                    }
                                    onOpenVoicePresetHotkeyModal={(preset) =>
                                        setEditingHotkeyTarget({
                                            kind: "voice-preset",
                                            presetId: preset.id,
                                            title: t("hotkeys.presetTargetTitle", {
                                                name:
                                                    t(`voicePresets.${preset.id}_name`) ||
                                                    preset.name,
                                            }),
                                            hotkey:
                                                voiceChangerConfig.presetHotkeys?.[
                                                    preset.id
                                                ] || "",
                                        })
                                    }
                                    onOpenVoiceToggleHotkeyModal={() =>
                                        setEditingHotkeyTarget({
                                            kind: "voice-toggle",
                                            title: t("hotkeys.engineToggleTitle"),
                                            hotkey:
                                                voiceChangerConfig.toggleHotkey ||
                                                "",
                                        })
                                    }
                                    onActivateVoicePreset={
                                        handleSelectVoicePreset
                                    }
                                    onToggleVoiceEngine={handleToggleVoiceEngine}
                                    onPlaySound={handlePlaySound}
                                    hotkeyManuallyPaused={hotkeyFilterConfig.manuallyPaused}
                                    hotkeyFilterStatus={electronFilterStatus}
                                    onTogglePauseHotkeys={() =>
                                        setHotkeyFilterConfig((prev) => ({
                                            ...prev,
                                            manuallyPaused: !prev.manuallyPaused,
                                        }))
                                    }
                                    onOpenSettingsFilter={() => setCurrentTab("settings")}
                                    isElectron={isElectron}
                                />
                            )}

                            {currentTab === "translator" && <SubtitleTranslatorView />}

                            {currentTab === "recorder" && (
                                <RecorderView
                                    onAddRecordedSound={handleAddSound}
                                    routingConfig={routingConfig}
                                    voiceChangerConfig={voiceChangerConfig}
                                    onOpenVoiceChanger={() => setCurrentTab("voice")}
                                />
                            )}

                            {currentTab === "maker" && (
                                <LirMakerView
                                    sounds={sounds}
                                    initialSoundId={makerInitialSoundId}
                                    isElectron={isElectron}
                                    onAddCutToBoard={handleAddSound}
                                    onUpdateSoundTrim={handleUpdateSoundTrim}
                                    onGoToSoundboard={() => setCurrentTab("soundboard")}
                                />
                            )}

                            {currentTab === "spotify" && (
                                <SpotifyMusicView
                                    sounds={sounds}
                                    activePlayingIds={activePlayingIds}
                                    isVirtualCableOutput={
                                        routingConfig.primaryDeviceLabel
                                            .toLowerCase()
                                            .includes("cable") ||
                                        routingConfig.primaryDeviceLabel
                                            .toLowerCase()
                                            .includes("voicemeeter") ||
                                        routingConfig.primaryDeviceLabel
                                            .toLowerCase()
                                            .includes("virtual")
                                    }
                                    onAddSound={handleAddSound}
                                    onPlaySound={handlePlaySound}
                                    onStopSound={handleStopSound}
                                    onGoToSoundboard={() => setCurrentTab("soundboard")}
                                    onOpenRouting={() => setCurrentTab("routing")}
                                    onOpenInMaker={(sound) => {
                                        setMakerInitialSoundId(sound.id);
                                        setCurrentTab("maker");
                                    }}
                                />
                            )}

                            {currentTab === "settings" && (
                                <div className="flex-1 flex flex-col gap-8">
                                    <SettingsView
                                        routingConfig={routingConfig}
                                        onRoutingConfigChange={setRoutingConfig}
                                        onResetToDefaults={handleResetToDefaults}
                                        onStopAllHotkeyCaptureChange={
                                            handleStopAllHotkeyCaptureChange
                                        }
                                        isElectron={isElectron}
                                        discordStatus={discordStatus}
                                        onReconnectDiscord={async () => {
                                            if (!routingConfig.discordRpcEnabled) return;
                                            await window.electronAPI?.reconnectDiscordRPC?.();
                                        }}
                                        theme={theme}
                                        systemPrefersDark={systemPrefersDark}
                                        onThemeChange={setTheme}
                                        accentColor={accentColor}
                                        onAccentColorChange={setAccentColor}
                                        uiStyle={uiStyle}
                                        onUiStyleChange={setUiStyle}
                                        appearance={appearance}
                                        onAppearanceChange={handleAppearanceChange}
                                        hotkeyFilterConfig={hotkeyFilterConfig}
                                        onHotkeyFilterConfigChange={setHotkeyFilterConfig}
                                        hotkeyFilterStatus={electronFilterStatus}
                                        remoteHostConnected={remoteHostConnected}
                                        remoteClients={remoteClients}
                                        relayBridgeConfig={relayBridgeConfig}
                                        onRelayBridgeConfigChange={setRelayBridgeConfig}
                                        relayBridgeStatus={relayBridgeStatus}
                                        relayClients={relayClients}
                                    />
                                    <Footer />
                                </div>
                            )}

                            {currentTab === "guide" && <GuideView />}
                        </motion.div>
                    </AnimatePresence>
                </main>

                {/* Live Playback Bar */}
                <PlaybackBar
                    sounds={sounds}
                    activeTracks={activePlaybackTracks}
                    masterVolume={routingConfig.masterVolume}
                    stopAllHotkey={routingConfig.stopAllHotkey}
                    onMasterVolumeChange={(volume) =>
                        setRoutingConfig((prev) => ({
                            ...prev,
                            masterVolume: volume,
                        }))
                    }
                    onStopSound={handleStopSound}
                    onStopAll={handleStopAll}
                    onToggleLoop={handleToggleLoop}
                    backgroundImageEnabled={Boolean(appearance.backgroundImage)}
                    transparency={appearance.headerTransparency}
                    uiStyle={uiStyle}
                />
            </div>

            {/* Floating Hotkey Indicator */}
            <AnimatePresence>
                {lastTriggeredNotice && (
                    <motion.div
                        initial={{ opacity: 0, y: 16, scale: 0.92 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.94 }}
                        transition={{ type: "spring", stiffness: 460, damping: 30 }}
                        className={`fixed right-4 z-50 flex items-center gap-2 px-3.5 py-2 ui-control bg-[var(--bg-island)] backdrop-blur-xl border border-[var(--accent-border)] text-[var(--text-primary)] font-mono text-xs transition-all ${
                            activePlaybackTracks.length > 0 ? "bottom-24" : "bottom-4"
                        }`}
                    >
                        <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                        <span className="text-[var(--text-secondary)]">
                            {t("recorder.hotkeyLabel")}
                        </span>
                        <strong className="text-[var(--accent-text)] font-semibold">
                            {lastTriggeredNotice.key}
                        </strong>
                        {lastTriggeredNotice.label && (
                            <span className="text-[var(--text-primary)] font-sans font-medium">
                                · {lastTriggeredNotice.label}
                            </span>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Modals */}
            <AnimatePresence>
                {editingHotkeyTarget && (
                    <HotkeyModal
                        key={
                            editingHotkeyTarget.kind === "sound"
                                ? editingHotkeyTarget.id
                                : editingHotkeyTarget.kind === "voice-preset"
                                  ? editingHotkeyTarget.presetId
                                  : "voice-toggle"
                        }
                        target={editingHotkeyTarget}
                        existingBindings={existingBindings}
                        onClose={() => setEditingHotkeyTarget(null)}
                        onSaveHotkey={handleSaveHotkey}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isAddModalOpen && (
                    <AddSoundModal
                        onClose={() => setIsAddModalOpen(false)}
                        onAddSound={handleAddSound}
                        isElectron={isElectron}
                        onOpenElectronFilePicker={handleOpenElectronFilePicker}
                        existingSoundCount={sounds.length}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isResetConfirmOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.16 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                        style={{ backgroundColor: "var(--modal-backdrop)" }}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.94, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 8 }}
                            transition={{
                                type: "spring",
                                stiffness: 420,
                                damping: 30,
                            }}
                            className="w-full max-w-sm bg-[var(--bg-modal)] border border-[var(--border-card)] ui-modal p-6 flex flex-col gap-4"
                        >
                            <div className="flex items-center gap-2.5 text-rose-400">
                                <RotateCcw className="w-4 h-4" />
                                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                                    {t("soundboard.resetModalTitle")}
                                </h3>
                            </div>
                            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                {t("soundboard.resetModalDesc")}
                            </p>
                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                                <motion.button
                                    type="button"
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setIsResetConfirmOpen(false)}
                                    className="px-4 py-1.5 ui-control text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                >
                                    {t("soundboard.resetModalCancel")}
                                </motion.button>
                                <motion.button
                                    type="button"
                                    whileTap={{ scale: 0.95 }}
                                    onClick={handleConfirmReset}
                                    className="px-4 py-1.5 ui-control bg-rose-600 hover:bg-rose-500 text-white keep-white text-xs font-semibold transition-colors cursor-pointer"
                                >
                                    {t("soundboard.resetModalConfirm")}
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Non-dismissible VB-CABLE Audio Driver Startup Gate (Desktop/Electron only) */}
            <AnimatePresence>
                {isElectron && !isVbCableInstalled && (
                    <VbCableGuardOverlay
                        isElectron={isElectron}
                        onStatusChange={setIsVbCableInstalled}
                    />
                )}
            </AnimatePresence>
        </div>
        </MotionConfig>
    );
}
