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
} from "./types/sound";
import { STARTER_SOUNDS } from "./utils/starterSounds";
import {
    DEFAULT_VOICE_CHANGER_CONFIG,
    VOICE_PRESETS,
    VoicePresetDefinition,
} from "./utils/voicePresets";
import { audioEngine } from "./utils/audioEngine";
import { Sidebar, NavTab } from "./components/Sidebar";
import { Header } from "./components/Header";
import { SoundCard } from "./components/SoundCard";
import { HotkeyModal, ExistingHotkeyBinding } from "./components/HotkeyModal";
import { AddSoundModal } from "./components/AddSoundModal";
import { AudioRoutingView } from "./components/AudioRoutingView";
import { VoiceChangerView } from "./components/VoiceChangerView";
import { HotkeysView } from "./components/HotkeysView";
import { RecorderView } from "./components/RecorderView";
import { GuideView } from "./components/GuideView";
import { SettingsView } from "./components/SettingsView";
import { SubtitleTranslatorView } from "./components/SubtitleTranslatorView";
import { Footer } from "./components/Footer";
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

const STORAGE_KEY_SOUNDS = "lir_soundboard_sounds_v1";
const STORAGE_KEY_CONFIG = "lir_soundboard_config_v1";
const STORAGE_KEY_VOICE_CHANGER = "lir_voice_changer_v1";
const STORAGE_KEY_THEME = "lir_theme_v1";
const STORAGE_KEY_ACCENT = "lir_accent_color_v1";
const STORAGE_KEY_UI_STYLE = "lir_ui_style_v1";
const STORAGE_KEY_APPEARANCE = "lir_appearance_v1";

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
    "Özel",
];

const normalizeHotkey = (hotkey: string) =>
    hotkey
        .trim()
        .toUpperCase()
        .replace(/^ESCAPE$/, "ESC")
        .replace(/\bNUMPAD\s+([0-9])\b/g, "NUMPAD$1");

export default function App() {
    const [theme, setTheme] = useState<AppTheme>(() => {
        try {
            const savedTheme = localStorage.getItem(STORAGE_KEY_THEME);
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
        return "amoled";
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
            const saved = localStorage.getItem(STORAGE_KEY_ACCENT);
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
            localStorage.setItem(STORAGE_KEY_THEME, theme);
        } catch (error) {
            console.warn("Tema tercihi kaydedilemedi:", error);
        }
        try {
            localStorage.setItem(
                STORAGE_KEY_ACCENT,
                normalizeHexColor(accentColor) ?? DEFAULT_ACCENT_COLOR,
            );
        } catch (error) {
            console.warn("Aksan rengi kaydedilemedi:", error);
        }
    }, [theme, effectiveTheme, accentColor]);

    const [uiStyle, setUiStyle] = useState<UIStyle>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_UI_STYLE);
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
            localStorage.setItem(STORAGE_KEY_UI_STYLE, uiStyle);
        } catch (error) {
            console.warn("Tasarım dili kaydedilemedi:", error);
        }
    }, [uiStyle]);

    const [appearance, setAppearance] = useState<AppearanceSettings>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_APPEARANCE);
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
                        const saved = localStorage.getItem(STORAGE_KEY_APPEARANCE);
                        if (saved) {
                            const parsed = JSON.parse(saved) as AppearanceSettings;
                            localStorage.setItem(
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
                localStorage.setItem(
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
            const saved = localStorage.getItem(STORAGE_KEY_SOUNDS);
            if (saved) {
                const parsed: unknown = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    const cleaned = parsed.filter(
                        (item): item is SoundItem =>
                            Boolean(item) &&
                            typeof item === "object" &&
                            (item as { category?: unknown }).category !== "Spotify" &&
                            !("spotifyUri" in item && (item as { spotifyUri?: unknown }).spotifyUri),
                    );
                    if (cleaned.length > 0) return cleaned;
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
                const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
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
                const saved = localStorage.getItem(STORAGE_KEY_VOICE_CHANGER);
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
    const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<SoundCategory>("Tümü");
    const [searchQuery, setSearchQuery] = useState("");
    const [activePlayingIds, setActivePlayingIds] = useState<string[]>([]);
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
                details: `Çalıyor: ${titleDisplay}`,
                state: `${activePlayingIds.length} aktif ses · %${Math.round(routingConfig.masterVolume * 100)} ses`,
                largeImageKey: "icon",
                largeImageText: "Lir - Modern Soundpad",
                smallImageKey: "play",
                smallImageText: "Oynatılıyor",
            });
        } else {
            window.electronAPI.updateDiscordActivity({
                details: "Lir • Gelişmiş Soundpad",
                state: `${sounds.length} ses hazır · Boşta`,
                largeImageKey: "icon",
                largeImageText: "Lir - Modern Soundpad",
                smallImageKey: "mic",
                smallImageText: "Hazır",
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
        try {
            localStorage.setItem(STORAGE_KEY_SOUNDS, JSON.stringify(sounds));
        } catch (e) {
            console.warn("LocalStorage save error:", e);
        }
    }, [sounds]);

    useEffect(() => {
        try {
            localStorage.setItem(
                STORAGE_KEY_CONFIG,
                JSON.stringify(routingConfig),
            );
        } catch (e) {
            console.warn("LocalStorage save error:", e);
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
            localStorage.setItem(
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
        audioEngine.setPlaybackListener((playingIds) => {
            setActivePlayingIds(playingIds);
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
            if (
                nextEnabled &&
                prev.preset === "natural" &&
                prev.wetMix === 0
            ) {
                const fallbackPreset =
                    VOICE_PRESETS.find((p) => p.id === "studio") ??
                    VOICE_PRESETS[1];
                return {
                    ...prev,
                    enabled: true,
                    preset: fallbackPreset.id,
                    ...fallbackPreset.params,
                };
            }
            return {
                ...prev,
                enabled: nextEnabled,
            };
        });
    }, []);

    const handleTriggerByKey = useCallback(
        (keyString: string) => {
            if (!keyString) return;
            const cleanKey = normalizeHotkey(keyString);

            if (cleanKey === normalizeHotkey(routingConfig.stopAllHotkey)) {
                handleStopAll();
                showTriggeredToast(cleanKey, "Tüm Sesler Durduruldu");
                return;
            }

            if (
                voiceChangerConfig.toggleHotkey &&
                cleanKey === normalizeHotkey(voiceChangerConfig.toggleHotkey)
            ) {
                const nextEnabled = !voiceChangerConfig.enabled;
                handleToggleVoiceEngine();
                showTriggeredToast(
                    cleanKey,
                    nextEnabled
                        ? "Efekt Motoru Açık"
                        : "Efekt Motoru Kapalı",
                );
                return;
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
                    if (matchedPreset.id === "natural") {
                        setVoiceChangerConfig((prev) => ({
                            ...prev,
                            preset: "natural",
                            enabled: false,
                            ...matchedPreset.params,
                        }));
                        showTriggeredToast(cleanKey, "Doğal Ses");
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
                            `${matchedPreset.name} (Kapalı)`,
                        );
                    } else {
                        setVoiceChangerConfig((prev) => ({
                            ...prev,
                            preset: matchedPreset.id,
                            enabled: true,
                            ...matchedPreset.params,
                        }));
                        showTriggeredToast(
                            cleanKey,
                            `${matchedPreset.name} (Aktif)`,
                        );
                    }
                    return;
                }
            }

            const matchedSound = sounds.find(
                (s) => normalizeHotkey(s.hotkey) === cleanKey,
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
            }
        },
        [
            sounds,
            activePlayingIds,
            handlePlaySound,
            handleStopSound,
            handleStopAll,
            routingConfig.stopAllHotkey,
            voiceChangerConfig.toggleHotkey,
            voiceChangerConfig.presetHotkeys,
            voiceChangerConfig.enabled,
            voiceChangerConfig.preset,
            handleToggleVoiceEngine,
            showTriggeredToast,
        ],
    );

    const isHotkeyPausedForModal =
        isCapturingStopHotkey || editingHotkeyTarget !== null;

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
                if (isHotkeyPausedForModal) return;
                handleTriggerByKey(key);
            });
        } else if (isElectron && window.electronAPI && isHotkeyPausedForModal) {
            void window.electronAPI.registerHotkeys([]);
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (isHotkeyPausedForModal) return;

            const target = e.target as HTMLElement;
            if (
                target &&
                (target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA" ||
                    target.tagName === "SELECT")
            ) {
                return;
            }

            const modifiers: string[] = [];
            if (e.ctrlKey) modifiers.push("CTRL");
            if (e.altKey) modifiers.push("ALT");
            if (e.shiftKey) modifiers.push("SHIFT");

            let mainKey = e.key.toUpperCase();
            if (e.code.startsWith("F") && !isNaN(parseInt(e.code.slice(1)))) {
                mainKey = e.code.toUpperCase();
            } else if (e.code.startsWith("Numpad")) {
                mainKey = e.code.toUpperCase();
            } else if (mainKey === " " || e.code === "Space") {
                mainKey = "SPACE";
            } else if (["CONTROL", "ALT", "SHIFT", "META"].includes(mainKey)) {
                return;
            }

            const keyCombo =
                modifiers.length > 0
                    ? `${modifiers.join("+")}+${mainKey}`
                    : mainKey;
            handleTriggerByKey(keyCombo);
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
        handleTriggerByKey,
    ]);

    const handleToggleFavorite = (soundId: string) => {
        setSounds((prev) =>
            prev.map((s) =>
                s.id === soundId ? { ...s, isFavorite: !s.isFavorite } : s,
            ),
        );
    };

    const handleToggleLoop = (soundId: string) => {
        setSounds((prev) =>
            prev.map((s) => (s.id === soundId ? { ...s, loop: !s.loop } : s)),
        );
    };

    const handleVolumeChange = (soundId: string, volume: number) => {
        setSounds((prev) =>
            prev.map((s) => (s.id === soundId ? { ...s, volume } : s)),
        );
    };

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
                label: "Efekt Motoru Aç / Kapat",
                hotkey: voiceChangerConfig.toggleHotkey,
            });
        }
        if (routingConfig.stopAllHotkey?.trim()) {
            list.push({
                targetKey: "stop-all",
                label: "Tüm Sesleri Durdur",
                hotkey: routingConfig.stopAllHotkey,
            });
        }
        return list;
    }, [sounds, voiceChangerConfig, routingConfig.stopAllHotkey]);

    const handleAddSound = (
        newSoundData: Omit<SoundItem, "id" | "addedAt">,
    ) => {
        const newSound: SoundItem = {
            ...newSoundData,
            id: `snd-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            addedAt: Date.now(),
        };
        setSounds((prev) => [newSound, ...prev]);
    };

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
                                                    Soundboard
                                                </h1>
                                                <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] mt-0.5">
                                                    Ses efektlerini kısayollarla tetikleyin, ses düzeylerini ayarlayın ve favorilerinizi yönetin.
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
                                                    <span className="relative z-10">Tümü</span>
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
                                                    <span className="relative z-10">Favoriler</span>
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
                                                title="Varsayılan sesleri geri yükle"
                                                className="p-2.5 ui-control bg-[var(--bg-island)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                            >
                                                <RotateCcw className="w-4 h-4" />
                                            </motion.button>
                                        </div>
                                    </div>

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
                                                    <span className="relative z-10">{category}</span>
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
                                                Ses Bulunamadı
                                            </h3>
                                            <p className="text-xs text-[var(--text-secondary)] max-w-xs mb-4">
                                                Arama veya filtre kriterinizle eşleşen bir ses bulunamadı.
                                            </p>
                                            <motion.button
                                                type="button"
                                                whileHover={{ scale: 1.03 }}
                                                whileTap={{ scale: 0.95 }}
                                                onClick={() => setIsAddModalOpen(true)}
                                                className="btn-accent flex items-center gap-1.5 px-4 py-2 ui-control text-xs font-semibold transition-colors cursor-pointer"
                                            >
                                                <Plus className="w-4 h-4" />
                                                <span>Yeni Ses Ekle</span>
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
                                            title: `Ses Efekti: ${preset.name}`,
                                            hotkey:
                                                voiceChangerConfig.presetHotkeys?.[
                                                    preset.id
                                                ] || "",
                                        })
                                    }
                                    onEditToggleHotkey={() =>
                                        setEditingHotkeyTarget({
                                            kind: "voice-toggle",
                                            title: "Efekt Motoru Aç / Kapat",
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
                                            title: `Ses Efekti: ${preset.name}`,
                                            hotkey:
                                                voiceChangerConfig.presetHotkeys?.[
                                                    preset.id
                                                ] || "",
                                        })
                                    }
                                    onOpenVoiceToggleHotkeyModal={() =>
                                        setEditingHotkeyTarget({
                                            kind: "voice-toggle",
                                            title: "Efekt Motoru Aç / Kapat",
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
                                    />
                                    <Footer />
                                </div>
                            )}

                            {currentTab === "guide" && <GuideView />}
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>

            {/* Floating Hotkey Indicator */}
            <AnimatePresence>
                {lastTriggeredNotice && (
                    <motion.div
                        initial={{ opacity: 0, y: 16, scale: 0.92 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.94 }}
                        transition={{ type: "spring", stiffness: 460, damping: 30 }}
                        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3.5 py-2 ui-control bg-[var(--bg-island)] backdrop-blur-xl border border-[var(--accent-border)] text-[var(--text-primary)] font-mono text-xs"
                    >
                        <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                        <span className="text-[var(--text-secondary)]">Kısayol:</span>
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
                                    Sesleri Sıfırla
                                </h3>
                            </div>
                            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                Tüm eklenen veya özelleştirilen sesler silinip varsayılan başlangıç sesleri geri yüklenecektir. Emin misiniz?
                            </p>
                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                                <motion.button
                                    type="button"
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setIsResetConfirmOpen(false)}
                                    className="px-4 py-1.5 ui-control text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                >
                                    Vazgeç
                                </motion.button>
                                <motion.button
                                    type="button"
                                    whileTap={{ scale: 0.95 }}
                                    onClick={handleConfirmReset}
                                    className="px-4 py-1.5 ui-control bg-rose-600 hover:bg-rose-500 text-white keep-white text-xs font-semibold transition-colors cursor-pointer"
                                >
                                    Sıfırla
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
