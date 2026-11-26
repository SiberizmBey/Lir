import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
    RefreshCw,
    Sliders,
    AlertCircle,
    Bot,
    Image as ImageIcon,
    Upload,
    Trash2,
    Settings,
    Palette,
    Layers,
    AppWindow,
    Square,
    Check,
    Monitor,
    Sparkles,
    Moon,
    Sun,
    Languages,
    ShieldAlert,
    Plus,
    Search,
    Smartphone,
    Wifi,
    Copy,
    KeyRound,
    X,
    Globe,
    Link2,
    Compass,
    Wand2,
} from "lucide-react";
import { useTranslation } from "../i18n";
import {
    AudioRoutingConfig,
    AppearanceSettings,
    AppTheme,
    UIStyle,
    DiscordStatus,
    HotkeyFilterConfig,
    HotkeyFilterStatus,
    InstalledAppInfo,
    RemoteConnectedClient,
    RemoteHostStatus,
    RelayBridgeConfig,
    RelayBridgeConnectionState,
} from "../types/sound";
import {
    ACCENT_PRESETS,
    DEFAULT_ACCENT_COLOR,
    normalizeHexColor,
} from "../utils/accentColors";
import { extractHotkeyFromKeyboardEvent } from "../utils/hotkeys";

interface SettingsViewProps {
    routingConfig: AudioRoutingConfig;
    onRoutingConfigChange: (config: AudioRoutingConfig) => void;
    onResetToDefaults: () => void;
    onStopAllHotkeyCaptureChange: (capturing: boolean) => Promise<void>;
    isElectron: boolean;
    discordStatus: DiscordStatus;
    onReconnectDiscord: () => Promise<void>;
    theme: AppTheme;
    systemPrefersDark: boolean;
    onThemeChange: (theme: AppTheme) => void;
    accentColor: string;
    onAccentColorChange: (color: string) => void;
    uiStyle: UIStyle;
    onUiStyleChange: (style: UIStyle) => void;
    appearance: AppearanceSettings;
    onAppearanceChange: (appearance: AppearanceSettings) => Promise<boolean>;
    hotkeyFilterConfig: HotkeyFilterConfig;
    onHotkeyFilterConfigChange: (config: HotkeyFilterConfig) => void;
    hotkeyFilterStatus: HotkeyFilterStatus;
    remoteHostConnected: boolean;
    remoteClients: RemoteConnectedClient[];
    relayBridgeConfig: RelayBridgeConfig;
    onRelayBridgeConfigChange: (config: RelayBridgeConfig) => void;
    relayBridgeStatus: RelayBridgeConnectionState;
    relayClients: RemoteConnectedClient[];
    onOpenSetupWizard: () => void;
    onStartTour: () => void;
}

const MAX_BACKGROUND_FILE_SIZE = 20 * 1024 * 1024;
const MAX_BACKGROUND_DATA_SIZE = 1.5 * 1024 * 1024;

async function prepareBackgroundImage(file: File): Promise<string> {
    if (!file.type.startsWith("image/")) {
        throw new Error("Lütfen geçerli bir görsel dosyası seçin.");
    }
    if (file.size > MAX_BACKGROUND_FILE_SIZE) {
        throw new Error("Görsel dosyası 20 MB sınırını aşamaz.");
    }

    const source = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
            typeof reader.result === "string"
                ? resolve(reader.result)
                : reject(new Error("Görsel dosyası okunamadı."));
        reader.onerror = () => reject(new Error("Görsel dosyası okunamadı."));
        reader.readAsDataURL(file);
    });

    if (
        file.type.toLowerCase() === "image/gif" ||
        file.name.toLowerCase().endsWith(".gif")
    ) {
        return source.replace(/^data:[^;,]*/, "data:image/gif");
    }

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("Görsel dosyası açılamadı."));
        element.src = source;
    });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error("Görsel işlemek için canvas başlatılamadı.");
    }

    let scale = Math.min(
        1,
        1920 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    let quality = 0.82;
    let compressed = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        context.fillStyle = "#000";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        compressed = canvas.toDataURL("image/jpeg", quality);
        if (compressed.length * 0.75 <= MAX_BACKGROUND_DATA_SIZE) {
            return compressed;
        }
        scale *= 0.8;
        quality = Math.max(0.5, quality - 0.08);
    }

    throw new Error("Bu görsel saklama alanı için küçültülemiyor.");
}

export function SettingsView({
    routingConfig,
    onRoutingConfigChange,
    onResetToDefaults,
    onStopAllHotkeyCaptureChange,
    isElectron,
    discordStatus,
    onReconnectDiscord,
    theme,
    systemPrefersDark,
    onThemeChange,
    accentColor,
    onAccentColorChange,
    uiStyle,
    onUiStyleChange,
    appearance,
    onAppearanceChange,
    hotkeyFilterConfig,
    onHotkeyFilterConfigChange,
    hotkeyFilterStatus,
    remoteHostConnected,
    remoteClients,
    relayBridgeConfig,
    onRelayBridgeConfigChange,
    relayBridgeStatus,
    relayClients,
    onOpenSetupWizard,
    onStartTour,
}: SettingsViewProps) {
    const { t, language, setLanguage, languages } = useTranslation();
    const [feedbackMessage, setFeedbackMessage] = useState<{
        type: "success" | "error" | "info";
        text: string;
    } | null>(null);
    const [isPreparingBackground, setIsPreparingBackground] = useState(false);
    const [isCapturingStopHotkey, setIsCapturingStopHotkey] = useState(false);

    // Hotkey App Filter states
    const [isAppsModalOpen, setIsAppsModalOpen] = useState(false);
    const [installedApps, setInstalledApps] = useState<InstalledAppInfo[]>([]);
    const [isLoadingApps, setIsLoadingApps] = useState(false);
    const [appSearchQuery, setAppSearchQuery] = useState("");
    const [manualRuleName, setManualRuleName] = useState("");
    const [manualRuleProcess, setManualRuleProcess] = useState("");
    const [manualRuleTitle, setManualRuleTitle] = useState("");

    // Remote Companion LAN Bridge states
    const [remoteStatus, setRemoteStatus] = useState<RemoteHostStatus | null>(null);
    const [remoteDeviceNameDraft, setRemoteDeviceNameDraft] = useState("");
    const [isUpdatingRemote, setIsUpdatingRemote] = useState(false);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    const loadRemoteHostStatus = async () => {
        try {
            const res = await fetch("/api/remote/host-status");
            if (!res.ok) return;
            const data = (await res.json()) as RemoteHostStatus;
            setRemoteStatus(data);
            setRemoteDeviceNameDraft((prev) => prev || data.deviceName);
        } catch {
            // Backend remote API may not be running in pure static mode
        }
    };

    useEffect(() => {
        void loadRemoteHostStatus();
    }, [remoteHostConnected]);

    const updateRemoteHostConfig = async (patch: {
        enabled?: boolean;
        deviceName?: string;
        requirePin?: boolean;
        regeneratePin?: boolean;
    }) => {
        setIsUpdatingRemote(true);
        try {
            const res = await fetch("/api/remote/host-config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
            });
            if (res.ok) {
                const data = (await res.json()) as RemoteHostStatus;
                setRemoteStatus(data);
                setRemoteDeviceNameDraft(data.deviceName);
            }
        } catch (err) {
            console.warn("Remote host config update failed:", err);
        } finally {
            setIsUpdatingRemote(false);
        }
    };

    const handleCopyText = (key: string, value: string) => {
        void navigator.clipboard?.writeText(value);
        setCopiedField(key);
        window.setTimeout(() => {
            setCopiedField((cur) => (cur === key ? null : cur));
        }, 1600);
    };

    const loadSystemApps = async () => {
        setIsLoadingApps(true);
        try {
            if (isElectron && window.electronAPI?.getInstalledApps) {
                const list = await window.electronAPI.getInstalledApps();
                setInstalledApps(Array.isArray(list) ? list : []);
            } else {
                const res = await fetch("/api/system/apps");
                if (res.ok) {
                    const data = (await res.json()) as { apps?: InstalledAppInfo[] };
                    setInstalledApps(Array.isArray(data.apps) ? data.apps : []);
                }
            }
        } catch (err) {
            console.warn("System apps scan failed:", err);
        } finally {
            setIsLoadingApps(false);
        }
    };

    const handleOpenAppsModal = () => {
        setIsAppsModalOpen(true);
        void loadSystemApps();
    };

    const handleAddAppRule = (
        name: string,
        processName: string,
        titleMatch?: string,
    ) => {
        const cleanProc = processName.trim();
        if (!cleanProc) return;
        const cleanTitle = titleMatch?.trim() || undefined;
        const norm = (v: string) => v.trim().toLowerCase().replace(/\.exe$/, "");

        const exists = hotkeyFilterConfig.allowedApps.some(
            (r) =>
                norm(r.processName) === norm(cleanProc) &&
                (r.titleMatch || "").toLowerCase() === (cleanTitle || "").toLowerCase(),
        );
        if (exists) return;

        onHotkeyFilterConfigChange({
            ...hotkeyFilterConfig,
            allowedApps: [
                {
                    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    name: name.trim() || cleanProc,
                    processName: cleanProc,
                    titleMatch: cleanTitle,
                    enabled: true,
                    addedAt: Date.now(),
                },
                ...hotkeyFilterConfig.allowedApps,
            ],
        });
    };

    useEffect(() => {
        if (!isCapturingStopHotkey) return;

        const handleStopHotkeyCapture = (event: KeyboardEvent) => {
            event.preventDefault();
            event.stopPropagation();

            const hotkey = extractHotkeyFromKeyboardEvent(event);
            if (!hotkey) return;

            onRoutingConfigChange({ ...routingConfig, stopAllHotkey: hotkey });
            setIsCapturingStopHotkey(false);
            void onStopAllHotkeyCaptureChange(false);
        };

        window.addEventListener("keydown", handleStopHotkeyCapture, true);
        return () => {
            window.removeEventListener(
                "keydown",
                handleStopHotkeyCapture,
                true,
            );
        };
    }, [
        isCapturingStopHotkey,
        onRoutingConfigChange,
        onStopAllHotkeyCaptureChange,
        routingConfig,
    ]);

    useEffect(
        () => () => void onStopAllHotkeyCaptureChange(false),
        [onStopAllHotkeyCaptureChange],
    );

    const updateAppearance = async (next: AppearanceSettings) => {
        if (await onAppearanceChange(next)) {
            setFeedbackMessage(null);
        } else {
            setFeedbackMessage({
                type: "error",
                text: t("settings.errorAppearanceSave"),
            });
        }
    };

    const handleBackgroundImage = async (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (!file) return;

        setIsPreparingBackground(true);
        try {
            const backgroundImage = await prepareBackgroundImage(file);
            await updateAppearance({ ...appearance, backgroundImage });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            setFeedbackMessage({ type: "error", text: message });
        } finally {
            setIsPreparingBackground(false);
        }
    };

    const designLanguages: Array<{
        id: UIStyle;
        title: string;
        description: string;
        icon: typeof Layers;
        iconClass: string;
    }> = [
        {
            id: "gama",
            title: t("settings.gamaTitle"),
            description: t("settings.gamaDesc"),
            icon: Layers,
            iconClass: "text-[var(--accent-text)]",
        },
        {
            id: "win11",
            title: t("settings.win11Title"),
            description: t("settings.win11Desc"),
            icon: AppWindow,
            iconClass: "text-sky-400",
        },
        {
            id: "win10",
            title: t("settings.win10Title"),
            description: t("settings.win10Desc"),
            icon: Square,
            iconClass: "text-[var(--text-secondary)]",
        },
    ];

    const sectionTransition = (delay: number) => ({
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.25, delay, ease: [0.22, 1, 0.36, 1] as const },
    });

    return (
        <div className="flex-1 flex flex-col gap-6 w-full">
            {/* Page Header */}
            <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 ui-inner bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
                    <Settings className="w-5 h-5" />
                </div>
                <div>
                    <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                        {t('settings.title')}
                    </h1>
                    <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] mt-0.5">
                        {t('settings.subtitle')}
                    </p>
                </div>
            </div>

            <AnimatePresence>
                {feedbackMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        className={`p-3.5 ui-inner border text-xs flex items-center justify-between gap-3 ${
                            feedbackMessage.type === "success"
                                ? "bg-emerald-950/40 border-emerald-700/80 text-emerald-200"
                                : feedbackMessage.type === "error"
                                  ? "bg-rose-950/40 border-rose-700/80 text-rose-200"
                                  : "bg-blue-950/40 border-blue-700/80 text-blue-200"
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{feedbackMessage.text}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setFeedbackMessage(null)}
                            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs px-1.5 cursor-pointer"
                        >
                            ✕
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 0. LANGUAGE SELECTION */}
            <motion.section
                {...sectionTransition(0.01)}
                className="app-card ui-card border border-[var(--border-card)] p-5 sm:p-6 flex flex-col gap-4"
            >
                <div className="flex items-center gap-2.5 pb-3 border-b border-[var(--border-subtle)]">
                    <Languages className="w-4 h-4 text-[var(--accent-text)]" />
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                        {t('settings.languageSectionTitle')}
                    </h2>
                </div>

                <p className="text-xs text-[var(--text-secondary)]">
                    {t('settings.languageSectionDesc')}
                </p>

                <div
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
                    role="radiogroup"
                    aria-label={t('settings.languageSectionTitle')}
                >
                    {languages.map((lang) => {
                        const isSelected = language === lang.code;
                        return (
                            <motion.button
                                key={lang.code}
                                type="button"
                                role="radio"
                                aria-checked={isSelected}
                                whileHover={{ y: -2 }}
                                whileTap={{ scale: 0.985 }}
                                transition={{
                                    type: "spring",
                                    stiffness: 420,
                                    damping: 30,
                                }}
                                onClick={() => setLanguage(lang.code)}
                                className={`ui-inner border p-4 text-left transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                                    isSelected
                                        ? "border-[var(--accent)] bg-[var(--accent-subtle)]"
                                        : "border-[var(--border-subtle)] bg-[var(--bg-inner)] hover:border-[var(--border-hover)]"
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl select-none">{lang.flag}</span>
                                    <div>
                                        <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                                            <span>{lang.nativeName}</span>
                                            <span className="text-xs font-mono text-[var(--text-muted)] uppercase">({lang.code})</span>
                                        </div>
                                        <span className="text-xs text-[var(--text-secondary)]">
                                            {t(`settings.language_${lang.code}Desc`)}
                                        </span>
                                    </div>
                                </div>
                                <AnimatePresence>
                                    {isSelected && (
                                        <motion.span
                                            initial={{ scale: 0.5, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ scale: 0.5, opacity: 0 }}
                                            transition={{
                                                type: "spring",
                                                stiffness: 500,
                                                damping: 26,
                                            }}
                                        >
                                            <Check className="w-4 h-4 text-[var(--accent-text)] shrink-0" />
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                            </motion.button>
                        );
                    })}
                </div>
            </motion.section>

            {/* 0.5 ONBOARDING WIZARD & INTERACTIVE TUTORIAL */}
            <motion.section
                {...sectionTransition(0.015)}
                className="app-card ui-card border border-[var(--border-card)] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 ui-inner bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
                        <Compass className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                            {t("settings.onboardingSectionTitle")}
                        </h2>
                        <p className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed max-w-xl">
                            {t("settings.onboardingSectionDesc")}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <motion.button
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={onOpenSetupWizard}
                        className="flex items-center gap-1.5 px-3.5 py-2 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] hover:border-[var(--accent-border)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
                    >
                        <Wand2 className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                        <span>{t("settings.restartWizardBtn")}</span>
                    </motion.button>

                    <motion.button
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={onStartTour}
                        className="btn-accent flex items-center gap-1.5 px-3.5 py-2 ui-control text-xs font-semibold transition-colors cursor-pointer"
                    >
                        <Compass className="w-3.5 h-3.5" />
                        <span>{t("settings.restartTourBtn")}</span>
                    </motion.button>
                </div>
            </motion.section>

            {/* 1. DESIGN LANGUAGE & UI THEME */}
            <motion.section
                {...sectionTransition(0.02)}
                className="app-card ui-card border border-[var(--border-card)] p-5 sm:p-6 flex flex-col gap-4"
            >
                <div>
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                        {t("settings.designLanguageTitle")}
                    </h2>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {t("settings.designLanguageDesc")}
                    </p>
                </div>

                <div
                    className="grid grid-cols-1 md:grid-cols-3 gap-2.5"
                    role="radiogroup"
                    aria-label={t("settings.designLanguageTitle")}
                >
                    {designLanguages.map((item) => {
                        const Icon = item.icon;
                        const isSelected = uiStyle === item.id;
                        return (
                            <motion.button
                                key={item.id}
                                type="button"
                                role="radio"
                                aria-checked={isSelected}
                                whileHover={{ y: -2 }}
                                whileTap={{ scale: 0.985 }}
                                transition={{
                                    type: "spring",
                                    stiffness: 420,
                                    damping: 30,
                                }}
                                onClick={() => onUiStyleChange(item.id)}
                                className={`relative ui-inner border p-4 text-left transition-colors cursor-pointer flex flex-col gap-1.5 ${
                                    isSelected
                                        ? "border-[var(--accent)] bg-[var(--accent-subtle)]"
                                        : "border-[var(--border-subtle)] bg-[var(--bg-inner)] hover:border-[var(--border-hover)]"
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                                        <Icon
                                            className={`w-4 h-4 shrink-0 ${item.iconClass}`}
                                        />
                                        <span>{item.title}</span>
                                    </span>
                                    <AnimatePresence>
                                        {isSelected && (
                                            <motion.span
                                                initial={{ scale: 0.5, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                                exit={{ scale: 0.5, opacity: 0 }}
                                                transition={{
                                                    type: "spring",
                                                    stiffness: 500,
                                                    damping: 26,
                                                }}
                                            >
                                                <Check className="w-4 h-4 text-[var(--accent-text)] shrink-0" />
                                            </motion.span>
                                        )}
                                    </AnimatePresence>
                                </div>
                                <span className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                    {item.description}
                                </span>
                            </motion.button>
                        );
                    })}
                </div>
            </motion.section>

            {/* 2. APPEARANCE SETTINGS */}
            <motion.section
                {...sectionTransition(0.06)}
                className="app-card ui-card border border-[var(--border-card)] p-5 sm:p-6 flex flex-col gap-5"
            >
                <div className="flex items-center gap-2.5 pb-3 border-b border-[var(--border-subtle)]">
                    <Palette className="w-4 h-4 text-[var(--accent-text)]" />
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                        {t("settings.themeTitle")}
                    </h2>
                </div>

                <div>
                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                        {t("settings.themeColorHeader")}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {t("settings.themeColorDesc")}
                    </p>
                    <div
                        className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5"
                        role="radiogroup"
                        aria-label={t("settings.themeColorHeader")}
                    >
                        {(
                            [
                                {
                                    value: "system",
                                    label: t("settings.themeSystemLabel"),
                                    description: t("settings.themeSystemDesc", {
                                        state: systemPrefersDark
                                            ? t("settings.dark")
                                            : t("settings.light"),
                                    }),
                                    icon: Monitor,
                                    iconClass: "text-fuchsia-400",
                                },
                                {
                                    value: "amoled",
                                    label: t("settings.themeAmoledLabel"),
                                    description: t("settings.themeAmoledDesc"),
                                    icon: Sparkles,
                                    iconClass: "text-purple-400",
                                },
                                {
                                    value: "dark",
                                    label: t("settings.themeDarkLabel"),
                                    description: t("settings.themeDarkDesc"),
                                    icon: Moon,
                                    iconClass: "text-sky-400",
                                },
                                {
                                    value: "light",
                                    label: t("settings.themeLightLabel"),
                                    description: t("settings.themeLightDesc"),
                                    icon: Sun,
                                    iconClass: "text-amber-400",
                                },
                            ] as const
                        ).map((item) => {
                            const Icon = item.icon;
                            const isSelected = theme === item.value;
                            return (
                                <motion.button
                                    key={item.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={isSelected}
                                    whileHover={{ y: -2 }}
                                    whileTap={{ scale: 0.985 }}
                                    transition={{
                                        type: "spring",
                                        stiffness: 420,
                                        damping: 30,
                                    }}
                                    onClick={() => onThemeChange(item.value)}
                                    className={`ui-inner border p-3.5 text-left transition-colors cursor-pointer flex flex-col gap-1 ${
                                        isSelected
                                            ? "border-[var(--accent)] bg-[var(--accent-subtle)]"
                                            : "border-[var(--border-subtle)] bg-[var(--bg-inner)] hover:border-[var(--border-hover)]"
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                                            <Icon className={`w-4 h-4 shrink-0 ${item.iconClass}`} />
                                            <span>{item.label}</span>
                                        </span>
                                        <AnimatePresence>
                                            {isSelected && (
                                                <motion.span
                                                    initial={{ scale: 0.5, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    exit={{ scale: 0.5, opacity: 0 }}
                                                    transition={{
                                                        type: "spring",
                                                        stiffness: 500,
                                                        damping: 26,
                                                    }}
                                                >
                                                    <Check className="w-4 h-4 text-[var(--accent-text)] shrink-0" />
                                                </motion.span>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                    <span className="text-xs text-[var(--text-secondary)]">
                                        {item.description}
                                    </span>
                                </motion.button>
                            );
                        })}
                    </div>
                </div>

                {/* Accent Color Picker */}
                <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold text-[var(--text-primary)]">
                                {t("settings.accentColorTitle")}
                            </p>
                            <p className="mt-1 text-xs text-[var(--text-secondary)]">
                                {t("settings.accentColorDesc")}
                            </p>
                        </div>

                        <label
                            className="flex items-center gap-2 px-3 py-1.5 ui-control border border-[var(--border-input)] bg-[var(--bg-inner)] hover:border-[var(--accent-border)] text-xs font-medium text-[var(--text-primary)] transition-colors cursor-pointer"
                            title={t("settings.pickCustomColorTitle")}
                        >
                            <span
                                className="w-4 h-4 rounded-full border border-white/20 shrink-0"
                                style={{ backgroundColor: accentColor }}
                            />
                            <span>{t("settings.customColor")}</span>
                            <span className="font-mono text-[11px] text-[var(--text-muted)] uppercase">
                                {normalizeHexColor(accentColor) ?? DEFAULT_ACCENT_COLOR}
                            </span>
                            <input
                                type="color"
                                value={normalizeHexColor(accentColor) ?? DEFAULT_ACCENT_COLOR}
                                onChange={(e) => onAccentColorChange(e.target.value)}
                                className="sr-only"
                            />
                        </label>
                    </div>

                    <div
                        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-9 gap-2.5"
                        role="radiogroup"
                        aria-label={t("settings.accentColorTitle")}
                    >
                        {ACCENT_PRESETS.map((preset) => {
                            const isSelected =
                                (normalizeHexColor(accentColor) ?? DEFAULT_ACCENT_COLOR) ===
                                preset.hex;
                            return (
                                <motion.button
                                    key={preset.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={isSelected}
                                    whileHover={{ y: -2 }}
                                    whileTap={{ scale: 0.97 }}
                                    transition={{
                                        type: "spring",
                                        stiffness: 420,
                                        damping: 30,
                                    }}
                                    onClick={() => onAccentColorChange(preset.hex)}
                                    className={`ui-inner border px-3 py-2.5 text-left transition-colors cursor-pointer flex items-center gap-2.5 ${
                                        isSelected
                                            ? "border-[var(--accent)] bg-[var(--accent-subtle)]"
                                            : "border-[var(--border-subtle)] bg-[var(--bg-inner)] hover:border-[var(--border-hover)]"
                                    }`}
                                >
                                    <span
                                        className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center border border-white/15"
                                        style={{ backgroundColor: preset.hex }}
                                    >
                                        {isSelected && (
                                            <Check className="w-3.5 h-3.5 text-white" />
                                        )}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block truncate text-xs font-semibold text-[var(--text-primary)]">
                                            {preset.name}
                                        </span>
                                        <span className="block font-mono text-[11px] text-[var(--text-muted)]">
                                            {preset.hex}
                                        </span>
                                    </span>
                                </motion.button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex flex-col gap-3.5 border-t border-[var(--border-subtle)] pt-4">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold text-[var(--text-primary)]">
                                {t("settings.wallpaperTitle")}
                            </p>
                            <p className="mt-1 text-xs text-[var(--text-secondary)]">
                                {t("settings.wallpaperDesc")}
                            </p>
                        </div>
                        {appearance.backgroundImage && (
                            <motion.button
                                type="button"
                                whileTap={{ scale: 0.95 }}
                                onClick={() => {
                                    void updateAppearance({
                                        ...appearance,
                                        backgroundImage: null,
                                    });
                                }}
                                className="flex shrink-0 items-center gap-1.5 ui-control border border-[var(--border-subtle)] bg-[var(--bg-inner)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:border-rose-800 hover:text-rose-300 cursor-pointer"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                                {t("settings.removeWallpaper")}
                            </motion.button>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <label className="flex cursor-pointer items-center gap-2 ui-control border border-[var(--border-input)] bg-[var(--bg-inner)] px-4 py-2 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-border)]">
                            {appearance.backgroundImage ? (
                                <ImageIcon className="h-4 w-4 text-[var(--accent-text)]" />
                            ) : (
                                <Upload className="h-4 w-4 text-[var(--accent-text)]" />
                            )}
                            {isPreparingBackground
                                ? t("settings.preparingImage")
                                : appearance.backgroundImage
                                  ? t("settings.changeImage")
                                  : t("settings.selectImage")}
                            <input
                                type="file"
                                accept="image/*,.gif"
                                onChange={handleBackgroundImage}
                                disabled={isPreparingBackground}
                                className="sr-only"
                            />
                        </label>
                        <span className="text-xs text-[var(--text-muted)]">
                            {t("settings.wallpaperFormats")}
                        </span>
                    </div>

                    <AnimatePresence>
                        {appearance.backgroundImage && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                                className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2 overflow-hidden"
                            >
                                <label className="flex flex-col gap-1.5 text-xs text-[var(--text-secondary)]">
                                    <span className="flex justify-between">
                                        <span>{t("settings.backgroundBlur")}</span>
                                        <span className="font-mono text-[var(--text-primary)]">
                                            {appearance.backgroundBlur}px
                                        </span>
                                    </span>
                                    <input
                                        type="range"
                                        min="0"
                                        max="20"
                                        step="1"
                                        value={appearance.backgroundBlur}
                                        onChange={(event) =>
                                            void updateAppearance({
                                                ...appearance,
                                                backgroundBlur: Number(
                                                    event.target.value,
                                                ),
                                            })
                                        }
                                        aria-label={t("settings.backgroundBlur")}
                                    />
                                </label>
                                {(
                                    [
                                        [
                                            "sidebarTransparency",
                                            t("settings.sidebarTransparency"),
                                        ],
                                        [
                                            "cardTransparency",
                                            t("settings.cardTransparency"),
                                        ],
                                        [
                                            "headerTransparency",
                                            t("settings.headerTransparency"),
                                        ],
                                    ] as const
                                ).map(([key, label]) => (
                                    <label
                                        key={key}
                                        className="flex flex-col gap-1.5 text-xs text-[var(--text-secondary)]"
                                    >
                                        <span className="flex justify-between">
                                            <span>{label}</span>
                                            <span className="font-mono text-[var(--text-primary)]">
                                                %{appearance[key]}
                                            </span>
                                        </span>
                                        <input
                                            type="range"
                                            min="0"
                                            max="90"
                                            step="5"
                                            value={appearance[key]}
                                            onChange={(event) =>
                                                void updateAppearance({
                                                    ...appearance,
                                                    [key]: Number(
                                                        event.target.value,
                                                    ),
                                                })
                                            }
                                            aria-label={label}
                                        />
                                    </label>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.section>

            {/* 3. GENERAL SOUNDPAD AUDIO SETTINGS */}
            <motion.section
                {...sectionTransition(0.1)}
                className="app-card ui-card border border-[var(--border-card)] p-5 sm:p-6 flex flex-col gap-5"
            >
                <div className="flex items-center gap-2.5 pb-3 border-b border-[var(--border-subtle)]">
                    <Sliders className="w-4 h-4 text-[var(--accent-text)]" />
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                        {t("settings.generalSoundpadTitle")}
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Stop All Hotkey */}
                    <div className="flex flex-col gap-2 p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)]">
                        <label className="text-xs font-semibold text-[var(--text-primary)]">
                            {t("settings.stopAllHotkeyTitle")}
                        </label>
                        <p className="text-xs text-[var(--text-secondary)]">
                            {t("settings.stopAllHotkeyDesc")}
                        </p>
                        <motion.button
                            type="button"
                            whileTap={{ scale: 0.985 }}
                            onClick={() => {
                                const next = !isCapturingStopHotkey;
                                if (!next) {
                                    setIsCapturingStopHotkey(false);
                                    void onStopAllHotkeyCaptureChange(false);
                                    return;
                                }
                                void onStopAllHotkeyCaptureChange(true)
                                    .then(() => {
                                        setFeedbackMessage(null);
                                        setIsCapturingStopHotkey(true);
                                    })
                                    .catch(() => {
                                        setFeedbackMessage({
                                            type: "error",
                                            text: t("settings.errorHotkeyCapture"),
                                        });
                                    });
                            }}
                            className="mt-1 w-full ui-input border border-[var(--border-input)] bg-[var(--bg-card)] px-3.5 py-2.5 text-left font-mono text-xs font-semibold text-[var(--accent-text)] transition-colors hover:border-[var(--accent-border)] cursor-pointer"
                        >
                            {isCapturingStopHotkey
                                ? t("settings.capturingStopHotkey")
                                : routingConfig.stopAllHotkey ||
                                  t("common.noHotkey")}
                        </motion.button>
                    </div>

                    {/* Playback Mode */}
                    <div className="flex flex-col gap-2 p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)]">
                        <label className="text-xs font-semibold text-[var(--text-primary)]">
                            {t("settings.playbackModeTitle")}
                        </label>
                        <p className="text-xs text-[var(--text-secondary)]">
                            {t("settings.playbackModeDesc")}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                            <motion.button
                                type="button"
                                whileTap={{ scale: 0.96 }}
                                onClick={() =>
                                    onRoutingConfigChange({
                                        ...routingConfig,
                                        playbackMode: "overlap",
                                    })
                                }
                                className={`flex-1 py-2 px-3 ui-input text-xs font-medium border text-center transition-colors cursor-pointer ${
                                    routingConfig.playbackMode === "overlap"
                                        ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)] font-semibold"
                                        : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                }`}
                            >
                                {t("settings.overlapMode")}
                            </motion.button>
                            <motion.button
                                type="button"
                                whileTap={{ scale: 0.96 }}
                                onClick={() =>
                                    onRoutingConfigChange({
                                        ...routingConfig,
                                        playbackMode: "cutoff",
                                    })
                                }
                                className={`flex-1 py-2 px-3 ui-input text-xs font-medium border text-center transition-colors cursor-pointer ${
                                    routingConfig.playbackMode === "cutoff"
                                        ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)] font-semibold"
                                        : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                }`}
                            >
                                {t("settings.cutoffMode")}
                            </motion.button>
                        </div>
                    </div>

                    {/* Master Volume */}
                    <div className="flex flex-col gap-2 p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] md:col-span-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-[var(--text-primary)]">
                                {t("settings.masterVolumeTitle")}
                            </label>
                            <span className="text-xs font-mono font-semibold text-[var(--accent-text)]">
                                %{Math.round(routingConfig.masterVolume * 100)}
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="1.5"
                            step="0.05"
                            value={routingConfig.masterVolume}
                            onChange={(e) =>
                                onRoutingConfigChange({
                                    ...routingConfig,
                                    masterVolume: parseFloat(e.target.value),
                                })
                            }
                            className="w-full mt-1 cursor-pointer"
                        />
                        <p className="text-xs text-[var(--text-secondary)]">
                            {t("settings.masterVolumeDesc")}
                        </p>
                    </div>

                    {/* Headphone Monitoring Volume */}
                    <div className="flex flex-col gap-2 p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] md:col-span-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-[var(--text-primary)]">
                                {t("settings.monitorVolumeTitle")}
                            </label>
                            <span className="text-xs font-mono font-semibold text-[var(--accent-text)]">
                                %{Math.round(routingConfig.monitorVolume * 100)}
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="1.5"
                            step="0.05"
                            value={routingConfig.monitorVolume}
                            onChange={(e) =>
                                onRoutingConfigChange({
                                    ...routingConfig,
                                    monitorVolume: parseFloat(e.target.value),
                                })
                            }
                            className="w-full mt-1 cursor-pointer"
                        />
                        <p className="text-xs text-[var(--text-secondary)]">
                            {t("settings.monitorVolumeDesc")}
                        </p>
                    </div>
                </div>

                {/* Reset to Defaults */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-[var(--border-subtle)]">
                    <div>
                        <p className="text-xs font-semibold text-[var(--text-primary)]">
                            {t("settings.factoryResetTitle")}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                            {t("settings.factoryResetDesc")}
                        </p>
                    </div>
                    <motion.button
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={onResetToDefaults}
                        className="px-4 py-2 ui-control bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800 text-rose-300 text-xs font-semibold transition-colors cursor-pointer shrink-0"
                    >
                        {t("settings.resetSoundsBtn")}
                    </motion.button>
                </div>
            </motion.section>

            {/* 4. DISCORD RICH PRESENCE */}
            <motion.section
                {...sectionTransition(0.14)}
                className="app-card ui-card border border-[var(--border-card)] p-5 sm:p-6 flex flex-col gap-4"
            >
                <div className="flex items-center gap-2.5 pb-3 border-b border-[var(--border-subtle)]">
                    <Bot className="w-4 h-4 text-[var(--accent-text)]" />
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                        {t("settings.discordRpcHeader")}
                    </h2>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold text-[var(--text-primary)]">
                            {t("settings.discordRpcShowActivity")}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                            {t("settings.discordRpcShowActivityDesc")}
                        </p>
                        <p className="mt-2 text-xs text-[var(--text-muted)]">
                            {!isElectron
                                ? t("settings.discordDesktopOnly")
                                : !routingConfig.discordRpcEnabled
                                  ? t("settings.discordOff")
                                  : discordStatus.connected
                                    ? t("settings.discordConnected", {
                                          user:
                                              discordStatus.username || "",
                                      })
                                    : t("settings.discordWaiting")}
                        </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        {routingConfig.discordRpcEnabled &&
                            isElectron &&
                            !discordStatus.connected && (
                                <motion.button
                                    type="button"
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => void onReconnectDiscord()}
                                    className="flex items-center gap-1.5 px-3.5 py-2 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-medium transition-colors cursor-pointer"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    {t("settings.reconnect")}
                                </motion.button>
                            )}
                        <button
                            type="button"
                            role="switch"
                            aria-checked={routingConfig.discordRpcEnabled}
                            aria-label="Discord Rich Presence"
                            disabled={!isElectron}
                            onClick={() =>
                                onRoutingConfigChange({
                                    ...routingConfig,
                                    discordRpcEnabled:
                                        !routingConfig.discordRpcEnabled,
                                })
                            }
                            className={`relative h-6 w-11 p-0.5 flex items-center ui-control transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer ${
                                routingConfig.discordRpcEnabled
                                    ? "bg-[var(--accent)] justify-end"
                                    : "bg-zinc-700 justify-start"
                            }`}
                        >
                            <motion.span
                                layout
                                transition={{
                                    type: "spring",
                                    stiffness: 500,
                                    damping: 32,
                                }}
                                className="h-5 w-5 ui-control bg-white"
                            />
                        </button>
                    </div>
                </div>
            </motion.section>

            {/* 5. APP HOTKEY FILTER */}
            <motion.section
                {...sectionTransition(0.16)}
                className="app-card ui-card border border-[var(--border-card)] p-5 sm:p-6 flex flex-col gap-5"
            >
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2.5">
                        <ShieldAlert className="w-4 h-4 text-[var(--accent-text)]" />
                        <div>
                            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                                {t("hotkeyFilter.sectionTitle")}
                            </h2>
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                {t("hotkeyFilter.sectionDesc")}
                            </p>
                        </div>
                    </div>

                    <motion.button
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={handleOpenAppsModal}
                        className="btn-accent flex items-center gap-1.5 px-3.5 py-2 ui-control text-xs font-semibold cursor-pointer"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t("hotkeyFilter.browseAppsBtn")}</span>
                    </motion.button>
                </div>

                {/* Live Filter Status Banner */}
                {(() => {
                    const enabledAllowedCount = hotkeyFilterConfig.allowedApps.filter(
                        (r) => r.enabled,
                    ).length;
                    const isPaused =
                        hotkeyFilterConfig.manuallyPaused ||
                        hotkeyFilterStatus.paused;
                    return (
                        <div
                            className={`px-3.5 py-2.5 ui-inner border text-xs flex flex-wrap items-center justify-between gap-2 ${
                                isPaused
                                    ? "bg-amber-950/30 border-amber-700/60 text-amber-200"
                                    : "bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-secondary)]"
                            }`}
                        >
                            <span>
                                {hotkeyFilterConfig.manuallyPaused
                                    ? t("hotkeyFilter.statusPausedManual")
                                    : hotkeyFilterStatus.paused
                                      ? t("hotkeyFilter.statusPausedByApp", {
                                            app:
                                                hotkeyFilterStatus.activeProcess ||
                                                "—",
                                        })
                                      : hotkeyFilterStatus.matchedRuleName
                                        ? t("hotkeyFilter.statusAllowedActive", {
                                              rule: hotkeyFilterStatus.matchedRuleName,
                                          })
                                        : enabledAllowedCount > 0 &&
                                            hotkeyFilterConfig.enabled
                                          ? t("hotkeyFilter.statusWatching", {
                                                count: enabledAllowedCount,
                                            })
                                          : t("hotkeyFilter.statusAllApps")}
                            </span>
                            {!isElectron && (
                                <span className="text-[11px] text-[var(--text-muted)]">
                                    {t("hotkeyFilter.webDesktopNotice")}
                                </span>
                            )}
                        </div>
                    );
                })()}

                {/* Quick Filter Switches */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {(
                        [
                            {
                                key: "enabled",
                                title: t("hotkeyFilter.enableFilterTitle"),
                                desc: t("hotkeyFilter.enableFilterDesc"),
                                value: hotkeyFilterConfig.enabled,
                            },
                            {
                                key: "manuallyPaused",
                                title: t("hotkeyFilter.manualPauseTitle"),
                                desc: t("hotkeyFilter.manualPauseDesc"),
                                value: hotkeyFilterConfig.manuallyPaused,
                            },
                            {
                                key: "pauseInTextInputs",
                                title: t("hotkeyFilter.pauseInInputsTitle"),
                                desc: t("hotkeyFilter.pauseInInputsDesc"),
                                value: hotkeyFilterConfig.pauseInTextInputs,
                            },
                        ] as const
                    ).map((item) => (
                        <div
                            key={item.key}
                            className="p-3.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex items-start justify-between gap-3"
                        >
                            <div>
                                <p className="text-xs font-semibold text-[var(--text-primary)]">
                                    {item.title}
                                </p>
                                <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                                    {item.desc}
                                </p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={item.value}
                                onClick={() =>
                                    onHotkeyFilterConfigChange({
                                        ...hotkeyFilterConfig,
                                        [item.key]: !item.value,
                                    })
                                }
                                className={`relative shrink-0 h-6 w-11 p-0.5 flex items-center ui-control transition-colors cursor-pointer ${
                                    item.value
                                        ? "bg-[var(--accent)] justify-end"
                                        : "bg-zinc-700 justify-start"
                                }`}
                            >
                                <motion.span
                                    layout
                                    transition={{ type: "spring", stiffness: 500, damping: 32 }}
                                    className="h-5 w-5 ui-control bg-white"
                                />
                            </button>
                        </div>
                    ))}
                </div>

                {/* Manual Rule Form */}
                <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-3">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                        {t("hotkeyFilter.addRuleTitle")}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                        <input
                            type="text"
                            value={manualRuleName}
                            onChange={(e) => setManualRuleName(e.target.value)}
                            placeholder={t("hotkeyFilter.ruleNamePlaceholder")}
                            className="ui-input border border-[var(--border-input)] bg-[var(--bg-card)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-border)]"
                        />
                        <input
                            type="text"
                            value={manualRuleProcess}
                            onChange={(e) => setManualRuleProcess(e.target.value)}
                            placeholder={t("hotkeyFilter.processPlaceholder")}
                            className="ui-input border border-[var(--border-input)] bg-[var(--bg-card)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-border)]"
                        />
                        <input
                            type="text"
                            value={manualRuleTitle}
                            onChange={(e) => setManualRuleTitle(e.target.value)}
                            placeholder={t("hotkeyFilter.titleMatchPlaceholder")}
                            className="ui-input border border-[var(--border-input)] bg-[var(--bg-card)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-border)]"
                        />
                        <button
                            type="button"
                            disabled={!manualRuleProcess.trim()}
                            onClick={() => {
                                handleAddAppRule(
                                    manualRuleName || manualRuleProcess,
                                    manualRuleProcess,
                                    manualRuleTitle,
                                );
                                setManualRuleName("");
                                setManualRuleProcess("");
                                setManualRuleTitle("");
                            }}
                            className="btn-accent px-3 py-2 ui-control text-xs font-semibold disabled:opacity-40 cursor-pointer"
                        >
                            {t("hotkeyFilter.addRuleBtn")}
                        </button>
                    </div>
                </div>

                {/* Allowed Apps Rules List */}
                <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                        {t("hotkeyFilter.rulesListTitle", {
                            count: hotkeyFilterConfig.allowedApps.length,
                        })}
                    </p>
                    {hotkeyFilterConfig.allowedApps.length === 0 ? (
                        <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-dashed border-[var(--border-subtle)] text-xs text-[var(--text-muted)] text-center">
                            {t("hotkeyFilter.noRules")}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            {hotkeyFilterConfig.allowedApps.map((rule) => (
                                <div
                                    key={rule.id}
                                    className="px-3.5 py-2.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex items-center justify-between gap-3"
                                >
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                            {rule.name}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-[var(--text-muted)] font-mono">
                                            <span className="truncate">{rule.processName}</span>
                                            <span>·</span>
                                            <span className="font-sans">
                                                {rule.titleMatch
                                                    ? `"${rule.titleMatch}"`
                                                    : t("hotkeyFilter.allTitleMatch")}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={rule.enabled}
                                            onClick={() =>
                                                onHotkeyFilterConfigChange({
                                                    ...hotkeyFilterConfig,
                                                    allowedApps: hotkeyFilterConfig.allowedApps.map((r) =>
                                                        r.id === rule.id
                                                            ? { ...r, enabled: !r.enabled }
                                                            : r,
                                                    ),
                                                })
                                            }
                                            className={`relative h-5 w-9 p-0.5 flex items-center ui-control transition-colors cursor-pointer ${
                                                rule.enabled
                                                    ? "bg-[var(--accent)] justify-end"
                                                    : "bg-zinc-700 justify-start"
                                            }`}
                                        >
                                            <span className="h-4 w-4 ui-control bg-white" />
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                onHotkeyFilterConfigChange({
                                                    ...hotkeyFilterConfig,
                                                    allowedApps: hotkeyFilterConfig.allowedApps.filter(
                                                        (r) => r.id !== rule.id,
                                                    ),
                                                })
                                            }
                                            className="p-1.5 ui-control text-[var(--text-muted)] hover:text-rose-400 hover:bg-[var(--bg-card-hover)] cursor-pointer"
                                            title={t("common.remove")}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </motion.section>

            {/* 6. ANDROID COMPANION & LAN BRIDGE */}
            <motion.section
                {...sectionTransition(0.18)}
                className="app-card ui-card border border-[var(--border-card)] p-5 sm:p-6 flex flex-col gap-5"
            >
                {/* Android Companion Bridge (Web Relay + Local LAN) */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2.5">
                        <Globe className="w-4 h-4 text-[var(--accent-text)]" />
                        <div>
                            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                                {t("remoteControl.relayTitle")}
                            </h2>
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                {t("remoteControl.relayDesc")}
                            </p>
                        </div>
                    </div>

                    <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 ui-control text-[11px] font-mono border ${
                            relayBridgeStatus === "connected"
                                ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                : relayBridgeStatus === "error"
                                  ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                                  : "bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-muted)]"
                        }`}
                    >
                        <Wifi className="w-3 h-3" />
                        <span>
                            {relayBridgeStatus === "connected"
                                ? t("remoteControl.relayStatusConnected")
                                : relayBridgeStatus === "connecting"
                                  ? t("remoteControl.relayStatusConnecting")
                                  : relayBridgeStatus === "error"
                                    ? t("remoteControl.relayStatusError")
                                    : t("remoteControl.relayStatusDisabled")}
                        </span>
                    </span>
                </div>

                <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold text-[var(--text-primary)]">
                                    {t("remoteControl.relayTitle")}
                                </p>
                                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 font-mono">
                                    {relayBridgeConfig.relayUrl}
                                </p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={relayBridgeConfig.enabled}
                                onClick={() =>
                                    onRelayBridgeConfigChange({
                                        ...relayBridgeConfig,
                                        enabled: !relayBridgeConfig.enabled,
                                    })
                                }
                                className={`relative shrink-0 h-6 w-11 p-0.5 flex items-center ui-control transition-colors cursor-pointer ${
                                    relayBridgeConfig.enabled
                                        ? "bg-[var(--accent)] justify-end"
                                        : "bg-zinc-700 justify-start"
                                }`}
                            >
                                <span className="h-5 w-5 ui-control bg-white" />
                            </button>
                        </div>

                        <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold text-[var(--text-primary)]">
                                    {t("remoteControl.requirePinTitle")}
                                </p>
                                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                                    {t("remoteControl.requirePinDesc")}
                                </p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={relayBridgeConfig.requirePin}
                                onClick={() =>
                                    onRelayBridgeConfigChange({
                                        ...relayBridgeConfig,
                                        requirePin: !relayBridgeConfig.requirePin,
                                    })
                                }
                                className={`relative shrink-0 h-6 w-11 p-0.5 flex items-center ui-control transition-colors cursor-pointer ${
                                    relayBridgeConfig.requirePin
                                        ? "bg-[var(--accent)] justify-end"
                                        : "bg-zinc-700 justify-start"
                                }`}
                            >
                                <span className="h-5 w-5 ui-control bg-white" />
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Relay Room Code */}
                        <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold text-[var(--text-primary)]">
                                    {t("remoteControl.relayRoomCodeLabel")}
                                </p>
                                <p className="mt-1 text-xl font-mono font-bold tracking-[0.22em] text-[var(--accent-text)]">
                                    {relayBridgeConfig.roomCode}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={() =>
                                        handleCopyText("relay-code", relayBridgeConfig.roomCode)
                                    }
                                    className="flex items-center gap-1 px-2.5 py-1.5 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] cursor-pointer"
                                >
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>
                                        {copiedField === "relay-code"
                                            ? t("remoteControl.copied")
                                            : t("remoteControl.relayCopyCode")}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
                                        let nextCode = "";
                                        for (let i = 0; i < 6; i += 1) {
                                            nextCode +=
                                                alphabet[Math.floor(Math.random() * alphabet.length)];
                                        }
                                        onRelayBridgeConfigChange({
                                            ...relayBridgeConfig,
                                            roomCode: nextCode,
                                        });
                                    }}
                                    className="flex items-center gap-1 px-2.5 py-1.5 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] cursor-pointer"
                                    title={t("remoteControl.relayNewCode")}
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        {/* Relay 6-Digit PIN */}
                        <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                                    <KeyRound className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                    <span>{t("remoteControl.pairingPinLabel")}</span>
                                </p>
                                <p className="mt-1 text-xl font-mono font-bold tracking-[0.22em] text-[var(--accent-text)]">
                                    {relayBridgeConfig.pin}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => handleCopyText("relay-pin", relayBridgeConfig.pin)}
                                    className="flex items-center gap-1 px-2.5 py-1.5 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] cursor-pointer"
                                >
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>
                                        {copiedField === "relay-pin"
                                            ? t("remoteControl.copied")
                                            : t("remoteControl.copyPin")}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        onRelayBridgeConfigChange({
                                            ...relayBridgeConfig,
                                            pin: String(Math.floor(100000 + Math.random() * 900000)),
                                        })
                                    }
                                    className="flex items-center gap-1 px-2.5 py-1.5 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] cursor-pointer"
                                    title={t("remoteControl.regeneratePin")}
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Quick Mobile URL + Host Settings */}
                    {(() => {
                        const base = relayBridgeConfig.relayUrl.trim().replace(/\/+$/, "") || "https://lirandroid.anticvalley.com.tr";
                        const quickUrl = relayBridgeConfig.requirePin
                            ? `${base}/?room=${encodeURIComponent(relayBridgeConfig.roomCode)}&pin=${encodeURIComponent(relayBridgeConfig.pin)}`
                            : `${base}/?room=${encodeURIComponent(relayBridgeConfig.roomCode)}`;
                        return (
                            <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                                        <Link2 className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                        <span>{t("remoteControl.relayQuickLinkLabel")}</span>
                                    </p>
                                    <p className="mt-1 text-xs font-mono text-[var(--text-secondary)] truncate">
                                        {quickUrl}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleCopyText("relay-link", quickUrl)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] shrink-0 cursor-pointer"
                                >
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>
                                        {copiedField === "relay-link"
                                            ? t("remoteControl.copied")
                                            : t("remoteControl.relayCopyLink")}
                                    </span>
                                </button>
                            </div>
                        );
                    })()}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-2">
                            <label className="text-xs font-semibold text-[var(--text-primary)]">
                                {t("remoteControl.deviceNameLabel")}
                            </label>
                            <input
                                type="text"
                                value={relayBridgeConfig.deviceName}
                                onChange={(e) =>
                                    onRelayBridgeConfigChange({
                                        ...relayBridgeConfig,
                                        deviceName: e.target.value,
                                    })
                                }
                                className="w-full ui-input border border-[var(--border-input)] bg-[var(--bg-card)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-border)]"
                            />
                        </div>

                        <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-2">
                            <label className="text-xs font-semibold text-[var(--text-primary)]">
                                {t("remoteControl.relayServerUrlLabel")}
                            </label>
                            <input
                                type="url"
                                value={relayBridgeConfig.relayUrl}
                                onChange={(e) =>
                                    onRelayBridgeConfigChange({
                                        ...relayBridgeConfig,
                                        relayUrl: e.target.value,
                                    })
                                }
                                className="w-full ui-input border border-[var(--border-input)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-border)]"
                            />
                        </div>
                    </div>

                    {/* Connected Mobile Clients via Relay */}
                    <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-2">
                        <p className="text-xs font-semibold text-[var(--text-primary)]">
                            {t("remoteControl.connectedClientsLabel", {
                                count: relayClients.length,
                            })}
                        </p>
                        {relayClients.length === 0 ? (
                            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                                {t("remoteControl.relayNoClients")}
                            </p>
                        ) : (
                            <div className="flex flex-col gap-1.5">
                                {relayClients.map((client) => (
                                    <div
                                        key={client.id}
                                        className="flex items-center justify-between px-2.5 py-1.5 ui-control bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs"
                                    >
                                        <span className="font-medium text-[var(--text-primary)]">
                                            {client.name}
                                        </span>
                                        <span className="font-mono text-[11px] text-[var(--accent-text)]">
                                            {client.ip}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {remoteStatus && (
                    <div className="pt-4 border-t border-[var(--border-subtle)] flex flex-col gap-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                                <Smartphone className="w-4 h-4 text-[var(--accent-text)]" />
                                <div>
                                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                                        {t("remoteControl.sectionTitle")}
                                    </h3>
                                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                        {t("remoteControl.sectionDesc")}
                                    </p>
                                </div>
                            </div>

                            <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 ui-control text-[11px] font-mono border ${
                                    remoteHostConnected
                                        ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                        : "bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-muted)]"
                                }`}
                            >
                                <Wifi className="w-3 h-3" />
                                <span>
                                    {remoteHostConnected
                                        ? t("remoteControl.hostBridgeOnline")
                                        : t("remoteControl.hostBridgeConnecting")}
                                </span>
                            </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* Enable LAN Bridge */}
                            <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                                        {t("remoteControl.enableBridgeTitle")}
                                    </p>
                                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                                        {t("remoteControl.enableBridgeDesc")}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    disabled={isUpdatingRemote}
                                    aria-checked={remoteStatus.enabled}
                                    onClick={() =>
                                        void updateRemoteHostConfig({
                                            enabled: !remoteStatus.enabled,
                                        })
                                    }
                                    className={`relative shrink-0 h-6 w-11 p-0.5 flex items-center ui-control transition-colors cursor-pointer ${
                                        remoteStatus.enabled
                                            ? "bg-[var(--accent)] justify-end"
                                            : "bg-zinc-700 justify-start"
                                    }`}
                                >
                                    <span className="h-5 w-5 ui-control bg-white" />
                                </button>
                            </div>

                            {/* Require Pairing PIN */}
                            <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                                        {t("remoteControl.requirePinTitle")}
                                    </p>
                                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                                        {t("remoteControl.requirePinDesc")}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    disabled={isUpdatingRemote}
                                    aria-checked={remoteStatus.requirePin}
                                    onClick={() =>
                                        void updateRemoteHostConfig({
                                            requirePin: !remoteStatus.requirePin,
                                        })
                                    }
                                    className={`relative shrink-0 h-6 w-11 p-0.5 flex items-center ui-control transition-colors cursor-pointer ${
                                        remoteStatus.requirePin
                                            ? "bg-[var(--accent)] justify-end"
                                            : "bg-zinc-700 justify-start"
                                    }`}
                                >
                                    <span className="h-5 w-5 ui-control bg-white" />
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* Device Name */}
                            <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-2">
                                <label className="text-xs font-semibold text-[var(--text-primary)]">
                                    {t("remoteControl.deviceNameLabel")}
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={remoteDeviceNameDraft}
                                        onChange={(e) => setRemoteDeviceNameDraft(e.target.value)}
                                        className="flex-1 ui-input border border-[var(--border-input)] bg-[var(--bg-card)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-border)]"
                                    />
                                    <button
                                        type="button"
                                        disabled={
                                            isUpdatingRemote ||
                                            !remoteDeviceNameDraft.trim() ||
                                            remoteDeviceNameDraft.trim() === remoteStatus.deviceName
                                        }
                                        onClick={() =>
                                            void updateRemoteHostConfig({
                                                deviceName: remoteDeviceNameDraft.trim(),
                                            })
                                        }
                                        className="px-3 py-1.5 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
                                    >
                                        {t("common.save")}
                                    </button>
                                </div>
                            </div>

                            {/* 6-Digit Pairing PIN */}
                            <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                                        <KeyRound className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                        <span>{t("remoteControl.pairingPinLabel")}</span>
                                    </p>
                                    <p className="mt-1 text-xl font-mono font-bold tracking-[0.22em] text-[var(--accent-text)]">
                                        {remoteStatus.pin}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => handleCopyText("pin", remoteStatus.pin)}
                                        className="flex items-center gap-1 px-2.5 py-1.5 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] cursor-pointer"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                        <span>
                                            {copiedField === "pin"
                                                ? t("remoteControl.copied")
                                                : t("remoteControl.copyPin")}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isUpdatingRemote}
                                        onClick={() =>
                                            void updateRemoteHostConfig({
                                                regeneratePin: true,
                                            })
                                        }
                                        className="flex items-center gap-1 px-2.5 py-1.5 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] cursor-pointer"
                                        title={t("remoteControl.regeneratePin")}
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* LAN Endpoints & Connected Android Clients */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-2">
                                <p className="text-xs font-semibold text-[var(--text-primary)]">
                                    {t("remoteControl.lanAddressesLabel")}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {(remoteStatus.lanIps.length > 0
                                        ? remoteStatus.lanIps
                                        : ["127.0.0.1"]
                                    ).map((ip) => {
                                        const url = `http://${ip}:${remoteStatus.port}`;
                                        return (
                                            <button
                                                key={ip}
                                                type="button"
                                                onClick={() => handleCopyText(`ip-${ip}`, url)}
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 ui-control bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-border)] text-[11px] font-mono text-[var(--text-primary)] cursor-pointer"
                                            >
                                                <span>{url}</span>
                                                <Copy className="w-3 h-3 text-[var(--text-muted)]" />
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="text-[11px] font-mono text-[var(--text-muted)]">
                                    mDNS: {remoteStatus.mdnsService} · UDP: {remoteStatus.udpDiscoveryPort} · WS: {remoteStatus.wsPath}
                                </p>
                            </div>

                            <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-2">
                                <p className="text-xs font-semibold text-[var(--text-primary)]">
                                    {t("remoteControl.connectedClientsLabel", {
                                        count: (remoteClients.length > 0
                                            ? remoteClients
                                            : remoteStatus.connectedClients
                                        ).length,
                                    })}
                                </p>
                                {(remoteClients.length > 0
                                    ? remoteClients
                                    : remoteStatus.connectedClients
                                ).length === 0 ? (
                                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                                        {t("remoteControl.noClients")}
                                    </p>
                                ) : (
                                    <div className="flex flex-col gap-1.5">
                                        {(remoteClients.length > 0
                                            ? remoteClients
                                            : remoteStatus.connectedClients
                                        ).map((client) => (
                                            <div
                                                key={client.id}
                                                className="flex items-center justify-between px-2.5 py-1.5 ui-control bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs"
                                            >
                                                <span className="font-medium text-[var(--text-primary)]">
                                                    {client.name}
                                                </span>
                                                <span className="font-mono text-[11px] text-[var(--accent-text)]">
                                                    {client.ip}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </motion.section>

            {/* Installed Apps Picker Modal */}
            <AnimatePresence>
                {isAppsModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                        style={{ backgroundColor: "var(--modal-backdrop)" }}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.94, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 8 }}
                            className="w-full max-w-2xl max-h-[82vh] bg-[var(--bg-modal)] border border-[var(--border-card)] ui-modal p-5 sm:p-6 flex flex-col gap-4"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-bold text-[var(--text-primary)]">
                                        {t("hotkeyFilter.modalTitle")}
                                    </h3>
                                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                        {t("hotkeyFilter.modalSubtitle")}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsAppsModalOpen(false)}
                                    className="p-1.5 ui-control text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        value={appSearchQuery}
                                        onChange={(e) => setAppSearchQuery(e.target.value)}
                                        placeholder={t("hotkeyFilter.modalSearchPlaceholder")}
                                        className="w-full pl-9 pr-3 py-2 ui-input border border-[var(--border-input)] bg-[var(--bg-input)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-border)]"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void loadSystemApps()}
                                    disabled={isLoadingApps}
                                    className="flex items-center gap-1.5 px-3 py-2 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                                >
                                    <RefreshCw
                                        className={`w-3.5 h-3.5 ${isLoadingApps ? "animate-spin" : ""}`}
                                    />
                                    <span>{t("hotkeyFilter.refreshApps")}</span>
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] ui-inner bg-[var(--bg-inner)]">
                                {isLoadingApps ? (
                                    <div className="p-8 text-center text-xs text-[var(--text-secondary)]">
                                        {t("hotkeyFilter.scanningApps")}
                                    </div>
                                ) : (
                                    (() => {
                                        const q = appSearchQuery.trim().toLowerCase();
                                        const filtered = installedApps.filter(
                                            (app) =>
                                                !q ||
                                                app.name.toLowerCase().includes(q) ||
                                                app.processName.toLowerCase().includes(q) ||
                                                (app.windowTitle || "").toLowerCase().includes(q),
                                        );
                                        if (filtered.length === 0) {
                                            return (
                                                <div className="p-8 text-center text-xs text-[var(--text-muted)]">
                                                    {t("hotkeyFilter.noAppsFound")}
                                                </div>
                                            );
                                        }
                                        return filtered.map((app) => {
                                            const norm = (v: string) =>
                                                v.trim().toLowerCase().replace(/\.exe$/, "");
                                            const isAdded = hotkeyFilterConfig.allowedApps.some(
                                                (r) => norm(r.processName) === norm(app.processName),
                                            );
                                            const sourceLabel =
                                                app.source === "running"
                                                    ? t("hotkeyFilter.sourceRunning")
                                                    : app.source === "installed"
                                                      ? t("hotkeyFilter.sourceInstalled")
                                                      : t("hotkeyFilter.sourceCatalog");

                                            return (
                                                <div
                                                    key={`${app.source}-${app.processName}-${app.name}`}
                                                    className="px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-[var(--bg-card-hover)] transition-colors"
                                                >
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                                                {app.name}
                                                            </span>
                                                            <span
                                                                className={`text-[10px] font-mono px-1.5 py-0.2 ui-control border ${
                                                                    app.source === "running"
                                                                        ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                                                        : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-muted)]"
                                                                }`}
                                                            >
                                                                {sourceLabel}
                                                            </span>
                                                        </div>
                                                        <p className="text-[11px] font-mono text-[var(--text-muted)] truncate mt-0.5">
                                                            {app.processName}
                                                            {app.windowTitle ? ` · ${app.windowTitle}` : ""}
                                                        </p>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        disabled={isAdded}
                                                        onClick={() =>
                                                            handleAddAppRule(
                                                                app.name,
                                                                app.processName,
                                                            )
                                                        }
                                                        className={`px-3 py-1.5 ui-control text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
                                                            isAdded
                                                                ? "bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] opacity-75 cursor-default"
                                                                : "btn-accent"
                                                        }`}
                                                    >
                                                        {isAdded
                                                            ? t("hotkeyFilter.alreadyAdded")
                                                            : t("hotkeyFilter.addApp")}
                                                    </button>
                                                </div>
                                            );
                                        });
                                    })()
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
