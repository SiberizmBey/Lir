import { useState, useEffect, useMemo, useCallback, useLayoutEffect, useRef } from "react";
import {
    RotateCcw,
    Heart,
    Music,
    Plus,
    AlertCircle,
    ExternalLink,
    RefreshCw,
    X,
} from "lucide-react";
import {
    SoundItem,
    SoundCategory,
    AudioRoutingConfig,
    AppTheme,
    AppearanceSettings,
    UpdateInfo,
    DiscordStatus,
} from "./types/sound";
import { STARTER_SOUNDS } from "./utils/starterSounds";
import { audioEngine } from "./utils/audioEngine";
import { Sidebar, NavTab } from "./components/Sidebar";
import { Header } from "./components/Header";
import { SoundCard } from "./components/SoundCard";
import { HotkeyModal } from "./components/HotkeyModal";
import { AddSoundModal } from "./components/AddSoundModal";
import { AudioRoutingView } from "./components/AudioRoutingView";
import { HotkeysView } from "./components/HotkeysView";
import { RecorderView } from "./components/RecorderView";
import { GuideView } from "./components/GuideView";
import { SettingsView } from "./components/SettingsView";
import { SubtitleTranslatorView } from "./components/SubtitleTranslatorView";
import { spotifyService } from "./utils/spotifyService";
import {
    getStoredBackgroundImage,
    storeBackgroundImage,
} from "./utils/appearanceStorage";

const STORAGE_KEY_SOUNDS = "lir_soundboard_sounds_v1";
const STORAGE_KEY_CONFIG = "lir_soundboard_config_v1";
const STORAGE_KEY_THEME = "lir_theme_v1";
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
    primaryDeviceLabel: "CABLE Input (VB-Audio Virtual Cable)",
    primaryDeviceId: "default",
    secondaryDeviceLabel: "Varsayılan Kulaklık",
    secondaryDeviceId: "default",
    dualOutputEnabled: false,
    micPassThrough: false,
    micDeviceId: "default",
    micDeviceLabel: "Varsayılan Mikrofon",
    micVolume: 1.0,
    playbackMode: "overlap",
    stopAllHotkey: "Escape",
    discordRpcEnabled: true,
};

export default function App() {
    const [theme, setTheme] = useState<AppTheme>(() => {
        try {
            const savedTheme = localStorage.getItem(STORAGE_KEY_THEME);
            if (
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

    useLayoutEffect(() => {
        document.documentElement.dataset.theme = theme;
        try {
            localStorage.setItem(STORAGE_KEY_THEME, theme);
        } catch (error) {
            console.warn("Tema tercihi kaydedilemedi:", error);
        }
    }, [theme]);

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
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) {
            // fallback
        }
        return STARTER_SOUNDS;
    });

    const [routingConfig, setRoutingConfig] = useState<AudioRoutingConfig>(
        () => {
            try {
                const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
                if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
            } catch (e) {
                // fallback
            }
            return DEFAULT_CONFIG;
        },
    );

    const [currentTab, setCurrentTab] = useState<NavTab>("soundboard");
    const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [activePlayingIds, setActivePlayingIds] = useState<string[]>([]);
    const [editingHotkeySound, setEditingHotkeySound] =
        useState<SoundItem | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [lastTriggeredKey, setLastTriggeredKey] = useState<string | null>(
        null,
    );
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [updateCheckStatus, setUpdateCheckStatus] = useState<
        "idle" | "checking" | "error" | "current" | "available"
    >("idle");
    const [discordStatus, setDiscordStatus] = useState<DiscordStatus>({
        connected: false,
        clientId: "1558769862053077114",
    });

    const [spotifyState, setSpotifyState] = useState(() =>
        spotifyService.getState()
    );

    useEffect(() => {
        const unsub = spotifyService.subscribe((s) => {
            setSpotifyState(s);
        });
        return () => unsub();
    }, []);

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

    const handleCheckForUpdates = useCallback(async () => {
        if (!window.electronAPI) return;

        setUpdateCheckStatus("checking");
        try {
            const availableUpdate = await window.electronAPI.checkForUpdates();
            setUpdateInfo(availableUpdate);
            setUpdateCheckStatus(availableUpdate ? "available" : "current");
        } catch (error) {
            console.error("GitHub sürüm kontrolü başarısız oldu:", error);
            setUpdateCheckStatus("error");
        }
    }, []);

    useEffect(() => {
        if (!isElectron) return;
        void handleCheckForUpdates();
    }, [isElectron, handleCheckForUpdates]);

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
        );
        audioEngine.setMicrophonePassThrough(
            routingConfig.micPassThrough,
            routingConfig.micDeviceId,
            routingConfig.micVolume,
        );
    }, [routingConfig]);

    useEffect(() => {
        audioEngine.setPlaybackListener((playingIds) => {
            setActivePlayingIds((prev) => {
                const spotifyActive = prev.filter((id) => {
                    const s = sounds.find((item) => item.id === id);
                    return s && (s.category === "Spotify" || s.spotifyUri);
                });
                return Array.from(new Set([...playingIds, ...spotifyActive]));
            });
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
    }, [sounds]);

    const handlePlaySound = useCallback(
        async (sound: SoundItem) => {
            if (sound.category === "Spotify" || sound.spotifyUri) {
                if (routingConfig.playbackMode === "cutoff") {
                    audioEngine.stopAll();
                    await spotifyService.pauseTrack();
                }
                const trackUri =
                    sound.spotifyUri ||
                    `spotify:track:${sound.spotifyTrackId || ""}`;
                await spotifyService.playTrack(
                    trackUri,
                    sound.spotifyPreviewUrl,
                    (playing) => {
                        if (playing) {
                            setActivePlayingIds((prev) => [
                                ...prev.filter((id) => id !== sound.id),
                                sound.id,
                            ]);
                        } else {
                            setActivePlayingIds((prev) =>
                                prev.filter((id) => id !== sound.id),
                            );
                        }
                    },
                );
                setActivePlayingIds((prev) => [
                    ...prev.filter((id) => id !== sound.id),
                    sound.id,
                ]);
                return;
            }

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

    const handleStopSound = useCallback(
        (soundId: string) => {
            const sound = sounds.find((s) => s.id === soundId);
            if (sound?.category === "Spotify" || sound?.spotifyUri) {
                spotifyService.pauseTrack();
                setActivePlayingIds((prev) =>
                    prev.filter((id) => id !== soundId),
                );
            }
            audioEngine.stopSound(soundId);
        },
        [sounds],
    );

    const handleStopAll = useCallback(() => {
        spotifyService.pauseTrack();
        audioEngine.stopAll();
        setActivePlayingIds([]);
    }, []);

    const handleTriggerByKey = useCallback(
        (keyString: string) => {
            if (!keyString) return;
            const cleanKey = keyString.trim().toUpperCase();

            if (cleanKey === "ESCAPE" || cleanKey === "ESC") {
                handleStopAll();
                return;
            }

            const matchedSound = sounds.find(
                (s) => s.hotkey.trim().toUpperCase() === cleanKey,
            );

            if (matchedSound) {
                setLastTriggeredKey(cleanKey);
                setTimeout(() => setLastTriggeredKey(null), 1200);

                // Toggle behavior: if this sound is already playing, stop it!
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
        ],
    );

    useEffect(() => {
        // 1. Electron Global Hotkeys (when running as desktop app)
        let unsubscribeElectron: (() => void) | undefined;
        if (isElectron && window.electronAPI) {
            const hotkeyList = sounds
                .filter((s) => s.hotkey && s.hotkey.trim() !== "")
                .map((s) => ({ hotkey: s.hotkey, id: s.id }));

            // Add ESC as global stop shortcut in Electron
            hotkeyList.push({ hotkey: "Escape", id: "stop-all-global-esc" });

            window.electronAPI.registerHotkeys(hotkeyList);

            unsubscribeElectron = window.electronAPI.onTriggerHotkey((key) => {
                handleTriggerByKey(key);
            });
        }

        // 2. Window keydown listener (ALWAYS ACTIVE in both Electron and Web mode)
        const handleKeyDown = (e: KeyboardEvent) => {
            // ESCAPE key stops all playing sounds immediately
            if (e.key === "Escape" || e.code === "Escape") {
                e.preventDefault();
                handleStopAll();
                return;
            }

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
    }, [isElectron, sounds, handleTriggerByKey, handleStopAll]);

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

    const handleSaveHotkey = (soundId: string, newHotkey: string) => {
        setSounds((prev) =>
            prev.map((s) =>
                s.id === soundId ? { ...s, hotkey: newHotkey } : s,
            ),
        );
    };

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
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase();
                const matchTitle = s.title.toLowerCase().includes(query);
                const matchHotkey = s.hotkey.toLowerCase().includes(query);
                const matchCategory = s.category.toLowerCase().includes(query);
                if (!matchTitle && !matchHotkey && !matchCategory) return false;
            }
            return true;
        });
    }, [sounds, showOnlyFavorites, searchQuery]);

    const favoriteCount = useMemo(
        () => sounds.filter((s) => s.isFavorite).length,
        [sounds],
    );

    return (
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
                    <div className="absolute inset-0 bg-black/40" />
                </div>
            )}
            {/* Vercel-Style Sidebar */}
            <Sidebar
                currentTab={currentTab}
                onTabChange={setCurrentTab}
                soundCount={sounds.length}
                favoriteCount={favoriteCount}
                isElectron={isElectron}
                activePlayingCount={activePlayingIds.length}
                spotifyConnected={spotifyState.isConnected}
                backgroundImageEnabled={Boolean(appearance.backgroundImage)}
                transparency={appearance.sidebarTransparency}
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
                {/* Precision Header */}
                <Header
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onAddNewSound={() => setIsAddModalOpen(true)}
                    onStopAll={handleStopAll}
                    routingConfig={routingConfig}
                    onRoutingConfigChange={setRoutingConfig}
                    activePlayingCount={activePlayingIds.length}
                    onOpenRoutingTab={() => setCurrentTab("routing")}
                    discordStatus={discordStatus}
                    backgroundImageEnabled={Boolean(appearance.backgroundImage)}
                    transparency={appearance.headerTransparency}
                />

                {/* Dynamic Tab Views */}
                <main className="flex-1 overflow-y-auto px-6 py-5 flex flex-col">
                    {currentTab === "soundboard" && (
                        <div className="flex-1 flex flex-col gap-4 max-w-7xl mx-auto w-full">
                            {/* Soundboard utilities */}
                            <div className="flex items-center justify-end gap-2.5 pb-2 border-b border-zinc-800/80">
                                {/* Sub-toggles */}
                                <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                                    <button
                                        onClick={() =>
                                            setShowOnlyFavorites(
                                                !showOnlyFavorites,
                                            )
                                        }
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                                            showOnlyFavorites
                                                ? "bg-rose-950/40 border-rose-800 text-rose-300"
                                                : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900"
                                        }`}
                                    >
                                        <Heart
                                            className={`w-3 h-3 ${showOnlyFavorites ? "fill-current" : ""}`}
                                        />
                                        <span>Favoriler ({favoriteCount})</span>
                                    </button>

                                    <button
                                        onClick={handleResetToDefaults}
                                        title="Varsayılan sesleri geri yükle"
                                        className="p-1 rounded-md bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            {/* Sound Cards Grid */}
                            {filteredSounds.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 pb-8">
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
                                            onOpenHotkeyModal={
                                                setEditingHotkeySound
                                            }
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="app-card flex-1 flex flex-col items-center justify-center p-12 text-center rounded-xl bg-[#0a0a0a] border border-zinc-800/80 my-6">
                                    <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-2.5 text-zinc-400">
                                        <Music className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-xs font-semibold text-white mb-1">
                                        Ses Bulunamadı
                                    </h3>
                                    <p className="text-xs text-zinc-500 max-w-xs mb-3">
                                        Arama kriterinizle eşleşen bir ses
                                        bulunamadı.
                                    </p>
                                    <button
                                        onClick={() => setIsAddModalOpen(true)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white hover:bg-zinc-200 text-black text-xs font-medium transition-colors cursor-pointer"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Yeni Ses Ekle</span>
                                    </button>
                                </div>
                            )}
                        </div>
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
                            onOpenHotkeyModal={setEditingHotkeySound}
                            onPlaySound={handlePlaySound}
                            isElectron={isElectron}
                        />
                    )}

                    {currentTab === "translator" && <SubtitleTranslatorView />}

                    {currentTab === "recorder" && (
                        <RecorderView onAddRecordedSound={handleAddSound} />
                    )}

                    {currentTab === "settings" && (
                        <SettingsView
                            routingConfig={routingConfig}
                            onRoutingConfigChange={setRoutingConfig}
                            onResetToDefaults={handleResetToDefaults}
                            isElectron={isElectron}
                            discordStatus={discordStatus}
                            onReconnectDiscord={async () => {
                                if (!routingConfig.discordRpcEnabled) return;
                                await window.electronAPI?.reconnectDiscordRPC?.();
                            }}
                            updateInfo={updateInfo}
                            updateCheckStatus={updateCheckStatus}
                            onCheckForUpdates={handleCheckForUpdates}
                            theme={theme}
                            onThemeChange={setTheme}
                            appearance={appearance}
                            onAppearanceChange={handleAppearanceChange}
                        />
                    )}

                    {currentTab === "guide" && <GuideView />}
                </main>
            </div>

            {/* Floating Hotkey Indicator */}
            {lastTriggeredKey && (
                <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-200 font-mono text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Kısayol:</span>
                    <strong className="text-white font-semibold">
                        {lastTriggeredKey}
                    </strong>
                </div>
            )}

            {(updateInfo || updateCheckStatus === "error") && (
                <aside
                    role={updateInfo ? "status" : "alert"}
                    className="fixed bottom-4 right-4 z-[60] w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-zinc-700 bg-zinc-950/95 p-4 backdrop-blur"
                >
                    <button
                        onClick={() => {
                            setUpdateInfo(null);
                            setUpdateCheckStatus("idle");
                        }}
                        aria-label="Bildirimi kapat"
                        className="absolute right-3 top-3 rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
                    >
                        <X className="h-4 w-4" />
                    </button>

                    {updateInfo ? (
                        <>
                            <div className="mb-2 flex items-center gap-2 pr-6">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                                    <ExternalLink className="h-4 w-4" />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-white">
                                        Yeni Lir güncellemesi
                                    </p>
                                    <p className="text-xs text-zinc-400">
                                        {updateInfo.title} ·{" "}
                                        {updateInfo.version}
                                    </p>
                                </div>
                            </div>
                            {updateInfo.notes && (
                                <p className="mb-3 max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-400">
                                    {updateInfo.notes}
                                </p>
                            )}
                            <button
                                onClick={() =>
                                    window.electronAPI?.openUpdateRelease(
                                        updateInfo.url,
                                    )
                                }
                                className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black transition-colors hover:bg-zinc-200"
                            >
                                GitHub sürümünü aç
                                <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                        </>
                    ) : (
                        <div className="flex items-center gap-3 pr-6">
                            <AlertCircle className="h-5 w-5 shrink-0 text-amber-400" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-white">
                                    Güncelleme kontrol edilemedi
                                </p>
                                <p className="text-xs text-zinc-400">
                                    GitHub bağlantınızı kontrol edip yeniden
                                    deneyin.
                                </p>
                            </div>
                            <button
                                onClick={() => void handleCheckForUpdates()}
                                disabled={updateCheckStatus === "checking"}
                                aria-label="Yeniden dene"
                                className="rounded-lg border border-zinc-700 p-2 text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
                            >
                                <RefreshCw
                                    className={`h-4 w-4 ${updateCheckStatus === "checking" ? "animate-spin" : ""}`}
                                />
                            </button>
                        </div>
                    )}
                </aside>
            )}

            {/* Modals */}
            {editingHotkeySound && (
                <HotkeyModal
                    sound={editingHotkeySound}
                    allSounds={sounds}
                    onClose={() => setEditingHotkeySound(null)}
                    onSaveHotkey={handleSaveHotkey}
                />
            )}

            {isAddModalOpen && (
                <AddSoundModal
                    onClose={() => setIsAddModalOpen(false)}
                    onAddSound={handleAddSound}
                    isElectron={isElectron}
                    onOpenElectronFilePicker={handleOpenElectronFilePicker}
                    existingSoundCount={sounds.length}
                />
            )}

            {isResetConfirmOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="w-full max-w-sm bg-[#0a0a0a] border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
                        <div className="flex items-center gap-2 text-rose-400">
                            <RotateCcw className="w-4 h-4" />
                            <h3 className="text-xs font-semibold text-white">
                                Sesleri Sıfırla
                            </h3>
                        </div>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                            Tüm eklenen veya özelleştirilen sesler silinip
                            varsayılan başlangıç sesleri geri yüklenecektir.
                            Emin misiniz?
                        </p>
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/80">
                            <button
                                type="button"
                                onClick={() => setIsResetConfirmOpen(false)}
                                className="px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:text-white transition-colors"
                            >
                                Vazgeç
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmReset}
                                className="px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition-colors cursor-pointer"
                            >
                                Sıfırla
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
