import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
    Sparkles,
    Radio,
    Mic,
    Disc3,
    CheckCircle2,
    ArrowRight,
    ArrowLeft,
    Headphones,
    Play,
    AlertTriangle,
    Activity,
    RefreshCw,
    ExternalLink,
    Copy,
    Check,
    LogIn,
    LogOut,
    Youtube,
    Cookie,
    Upload,
    Trash2,
    ShieldCheck,
    Sliders,
    Globe,
    X,
} from "lucide-react";
import { AudioRoutingConfig } from "../types/sound";
import { audioEngine } from "../utils/audioEngine";
import { useTranslation } from "../i18n";
import { SpotifyAuthState, spotifyService } from "../utils/spotifyService";
import {
    YouTubeConfig,
    cancelYouTubeLogin,
    clearYouTubeCookie,
    getYouTubeAuthStatus,
    getYouTubeConfig,
    logoutYouTubeAccount,
    saveYouTubeCookie,
    startYouTubeLogin,
} from "../utils/youtubeService";

interface SetupWizardProps {
    isOpen: boolean;
    routingConfig: AudioRoutingConfig;
    onRoutingConfigChange: (config: AudioRoutingConfig) => void;
    isElectron: boolean;
    onComplete: (startTour: boolean) => void;
    onSkip: () => void;
}

const TOTAL_STEPS = 5;

const slideVariants = {
    enter: (direction: number) => ({
        x: direction > 0 ? 44 : -44,
        opacity: 0,
        scale: 0.985,
    }),
    center: {
        x: 0,
        opacity: 1,
        scale: 1,
    },
    exit: (direction: number) => ({
        x: direction > 0 ? -44 : 44,
        opacity: 0,
        scale: 0.985,
    }),
};

export function SetupWizard({
    isOpen,
    routingConfig,
    onRoutingConfigChange,
    onComplete,
    onSkip,
}: SetupWizardProps) {
    const { t, language, setLanguage, languages } = useTranslation();
    const [stepIndex, setStepIndex] = useState(0);
    const [direction, setDirection] = useState(1);

    // Audio devices & test tone
    const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
    const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
    const [isScanningDevices, setIsScanningDevices] = useState(false);
    const [isPlayingTestTone, setIsPlayingTestTone] = useState(false);

    // Mic live status
    const [micLevel, setMicLevel] = useState(0);
    const [micError, setMicError] = useState<string | null>(null);
    const [micStatus, setMicStatus] = useState<{
        active: boolean;
        label: string;
        muted: boolean;
    }>({ active: false, label: "", muted: false });

    // Spotify & YouTube auth
    const [spotifyState, setSpotifyState] = useState<SpotifyAuthState>(() =>
        spotifyService.getState(),
    );
    const [clientIdDraft, setClientIdDraft] = useState(spotifyState.clientId);
    const [spotifyError, setSpotifyError] = useState<string | null>(null);
    const [copiedRedirect, setCopiedRedirect] = useState(false);

    const [youtubeConfig, setYoutubeConfig] = useState<YouTubeConfig>({
        hasApiKey: false,
        hasCookie: false,
        cookieSource: "none",
        hasOAuth: false,
        authStatus: "idle",
        pendingAuth: null,
        authError: null,
    });
    const [isStartingYtAuth, setIsStartingYtAuth] = useState(false);
    const [copiedYtCode, setCopiedYtCode] = useState(false);
    const [showYtCookieSection, setShowYtCookieSection] = useState(false);
    const [cookieInput, setCookieInput] = useState("");
    const [isSavingCookie, setIsSavingCookie] = useState(false);
    const [cookieFeedback, setCookieFeedback] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);
    const cookieFileRef = useRef<HTMLInputElement | null>(null);

    const routingRef = useRef(routingConfig);
    routingRef.current = routingConfig;

    useEffect(() => {
        if (!isOpen) return;
        setStepIndex(0);
        setDirection(1);
    }, [isOpen]);

    const scanDevices = useCallback(
        async (requestPermission: boolean) => {
            if (!navigator.mediaDevices?.enumerateDevices) return;
            setIsScanningDevices(true);
            try {
                let allDevices =
                    await navigator.mediaDevices.enumerateDevices();

                if (requestPermission || allDevices.some((d) => !d.label)) {
                    try {
                        const stream =
                            await navigator.mediaDevices.getUserMedia({
                                audio: true,
                            });
                        stream.getTracks().forEach((tr) => tr.stop());
                        allDevices =
                            await navigator.mediaDevices.enumerateDevices();
                    } catch {
                        // Permission declined or unavailable
                    }
                }

                const outputs = allDevices.filter(
                    (d) => d.kind === "audiooutput",
                );
                const inputs = allDevices.filter(
                    (d) => d.kind === "audioinput",
                );
                setOutputDevices(outputs);
                setInputDevices(inputs);

                const current = routingRef.current;
                let updated = false;
                const nextConfig = { ...current };

                const vbCableOutput = outputs.find(
                    (d) =>
                        d.label.toLowerCase().includes("cable input") ||
                        d.label.toLowerCase().includes("vb-audio"),
                );
                if (
                    vbCableOutput &&
                    (nextConfig.primaryDeviceId === "default" ||
                        !nextConfig.primaryDeviceId)
                ) {
                    nextConfig.primaryDeviceId = vbCableOutput.deviceId;
                    nextConfig.primaryDeviceLabel = vbCableOutput.label;
                    updated = true;
                }

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

                if (
                    physicalMic &&
                    (!nextConfig.micDeviceId ||
                        nextConfig.micDeviceId === "default")
                ) {
                    nextConfig.micDeviceId = physicalMic.deviceId;
                    nextConfig.micDeviceLabel = physicalMic.label;
                    updated = true;
                }

                if (updated) {
                    onRoutingConfigChange(nextConfig);
                }
            } finally {
                setIsScanningDevices(false);
            }
        },
        [onRoutingConfigChange],
    );

    useEffect(() => {
        if (!isOpen) return;
        void scanDevices(false);
        const onChange = () => void scanDevices(false);
        navigator.mediaDevices?.addEventListener?.("devicechange", onChange);
        return () => {
            navigator.mediaDevices?.removeEventListener?.(
                "devicechange",
                onChange,
            );
        };
    }, [isOpen, scanDevices]);

    // Poll mic VU meter when enabled
    useEffect(() => {
        if (!isOpen || !routingConfig.micPassThrough) {
            setMicLevel(0);
            setMicStatus({ active: false, label: "", muted: false });
            return;
        }
        const interval = window.setInterval(() => {
            const info = audioEngine.getMicStatusInfo();
            setMicLevel(info.level);
            setMicStatus({
                active: info.active,
                label: info.label,
                muted: info.muted,
            });
        }, 50);
        return () => window.clearInterval(interval);
    }, [isOpen, routingConfig.micPassThrough]);

    // Subscribe Spotify + fetch YouTube config
    useEffect(() => {
        if (!isOpen) return;
        const unsub = spotifyService.subscribe((next) => {
            setSpotifyState(next);
            if (next.clientId) {
                setClientIdDraft((prev) => prev || next.clientId);
            }
            if (next.error) {
                setSpotifyError(next.error);
            }
        });
        void getYouTubeConfig().then(setYoutubeConfig);
        return unsub;
    }, [isOpen]);

    // Poll YouTube device-code status when pending
    useEffect(() => {
        if (!isOpen || youtubeConfig.authStatus !== "pending") return;
        const interval = window.setInterval(() => {
            void getYouTubeAuthStatus().then(setYoutubeConfig);
        }, 2500);
        return () => window.clearInterval(interval);
    }, [isOpen, youtubeConfig.authStatus]);

    const goToStep = (next: number) => {
        const clamped = Math.max(0, Math.min(TOTAL_STEPS - 1, next));
        setDirection(clamped >= stepIndex ? 1 : -1);
        setStepIndex(clamped);
    };

    const handleTestTone = async () => {
        setIsPlayingTestTone(true);
        await audioEngine.playSound(
            {
                id: "wizard-test-tone",
                title: "Test Sinyali",
                hotkey: "",
                duration: 0.8,
                category: "Özel",
                volume: 1.0,
                isFavorite: false,
                loop: false,
                playMode: "overlap",
                synthPreset: "coin",
                addedAt: Date.now(),
            },
            routingConfig.masterVolume,
            false,
            routingConfig.primaryDeviceId,
            routingConfig.secondaryDeviceId,
            true,
        );
        window.setTimeout(() => setIsPlayingTestTone(false), 900);
    };

    const handleToggleMicPassThrough = async () => {
        const nextState = !routingConfig.micPassThrough;
        setMicError(null);
        if (nextState) {
            const res = await audioEngine.setMicrophonePassThrough(
                true,
                routingConfig.micDeviceId,
                routingConfig.micVolume,
            );
            if (res.success) {
                onRoutingConfigChange({
                    ...routingConfig,
                    micPassThrough: true,
                });
                void scanDevices(false);
            } else {
                setMicError(res.error || t("routing.micAccessError"));
            }
        } else {
            await audioEngine.setMicrophonePassThrough(false);
            onRoutingConfigChange({
                ...routingConfig,
                micPassThrough: false,
            });
        }
    };

    const handleConnectSpotify = async () => {
        setSpotifyError(null);
        if (clientIdDraft.trim() !== spotifyState.clientId) {
            spotifyService.updateState({ clientId: clientIdDraft.trim() });
        }
        try {
            await spotifyService.initiateLogin();
        } catch (err) {
            setSpotifyError(
                err instanceof Error ? err.message : t("spotify.errorGeneric"),
            );
        }
    };

    const handleCopyRedirectUri = async () => {
        try {
            await navigator.clipboard.writeText(spotifyService.getRedirectUri());
            setCopiedRedirect(true);
            window.setTimeout(() => setCopiedRedirect(false), 1800);
        } catch {
            // ignore
        }
    };

    const handleStartYtLogin = async () => {
        setIsStartingYtAuth(true);
        try {
            const next = await startYouTubeLogin();
            setYoutubeConfig(next);
        } catch (err) {
            setYoutubeConfig((prev) => ({
                ...prev,
                authStatus: "error",
                authError:
                    err instanceof Error ? err.message : t("spotify.errorGeneric"),
            }));
        } finally {
            setIsStartingYtAuth(false);
        }
    };

    const handleCopyYtCode = async (code: string) => {
        try {
            await navigator.clipboard.writeText(code);
            setCopiedYtCode(true);
            window.setTimeout(() => setCopiedYtCode(false), 1800);
        } catch {
            // ignore
        }
    };

    const handleSaveCookie = async (rawCookie?: string) => {
        const target = (rawCookie ?? cookieInput).trim();
        if (!target) {
            setCookieFeedback({
                type: "error",
                text: t("spotify.cookieEmptyError"),
            });
            return;
        }
        setIsSavingCookie(true);
        setCookieFeedback(null);
        try {
            const updated = await saveYouTubeCookie(target);
            setYoutubeConfig(updated);
            setCookieInput("");
            setCookieFeedback({
                type: "success",
                text: t("spotify.cookieSavedSuccess", {
                    count: updated.cookieCount || 1,
                }),
            });
        } catch (err) {
            setCookieFeedback({
                type: "error",
                text:
                    err instanceof Error ? err.message : t("spotify.errorGeneric"),
            });
        } finally {
            setIsSavingCookie(false);
        }
    };

    const handleCookieFileChange = async (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        try {
            const content = await file.text();
            setCookieInput(content);
            await handleSaveCookie(content);
        } catch {
            setCookieFeedback({
                type: "error",
                text: t("spotify.cookieFileReadError"),
            });
        }
    };

    const isVbCableDetected = outputDevices.some(
        (d) =>
            d.label.toLowerCase().includes("cable") ||
            d.label.toLowerCase().includes("vb-audio"),
    );

    const isYouTubeConnected =
        youtubeConfig.hasOAuth ||
        youtubeConfig.authStatus === "connected" ||
        youtubeConfig.hasCookie;

    if (!isOpen) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-[var(--bg-canvas)]"
        >
            {/* Full-screen ambient accent field */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
            >
                <div
                    className="absolute -top-48 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full blur-[150px] opacity-25"
                    style={{ background: "var(--accent)" }}
                />
                <div
                    className="absolute -bottom-56 -right-44 h-[520px] w-[620px] rounded-full blur-[160px] opacity-[0.12]"
                    style={{ background: "var(--accent)" }}
                />
                <div
                    className="absolute inset-0"
                    style={{
                        background:
                            "radial-gradient(ellipse 120% 90% at 50% -18%, rgba(var(--accent-rgb), 0.10), transparent 62%)",
                    }}
                />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ type: "spring", stiffness: 320, damping: 32 }}
                className="relative z-10 flex h-full w-full flex-col overflow-hidden"
            >

                {/* Top Stepper Header */}
                <div className="relative z-10 px-6 sm:px-10 py-5 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/60 backdrop-blur-xl flex items-center justify-between gap-4 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <img
                            src={`${import.meta.env.BASE_URL}assets/img/icon.png?v=1.3`}
                            alt="Lir"
                            referrerPolicy="no-referrer"
                            className="w-7 h-7 object-contain shrink-0"
                        />
                        <div className="flex flex-col gap-1.5 min-w-0">
                            <span className="text-[11px] font-mono font-semibold text-[var(--accent-text)] uppercase tracking-wider">
                                {t("onboarding.stepProgress", {
                                    current: stepIndex + 1,
                                    total: TOTAL_STEPS,
                                })}
                            </span>
                            <div className="flex items-center gap-1.5">
                                {Array.from({ length: TOTAL_STEPS }).map((_, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => goToStep(idx)}
                                        aria-label={t("onboarding.stepProgress", {
                                            current: idx + 1,
                                            total: TOTAL_STEPS,
                                        })}
                                        className="h-1.5 rounded-full transition-all duration-300 cursor-pointer overflow-hidden bg-[var(--bg-inner)] border border-[var(--border-subtle)]"
                                        style={{
                                            width: idx === stepIndex ? 32 : 14,
                                        }}
                                    >
                                        <div
                                            className="h-full w-full transition-opacity duration-200"
                                            style={{
                                                backgroundColor: "var(--accent)",
                                                opacity: idx <= stepIndex ? 1 : 0,
                                            }}
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onSkip}
                        className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
                    >
                        <span>{t("onboarding.skipSetup")}</span>
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* Animated Sequential Step Body */}
                <div className="relative z-10 flex-1 overflow-y-auto px-6 sm:px-10 py-8 sm:py-10">
                    <div className="mx-auto flex w-full max-w-4xl flex-col">
                    <AnimatePresence mode="wait" custom={direction} initial={false}>
                        {stepIndex === 0 && (
                            <motion.div
                                key="wizard-step-0"
                                custom={direction}
                                variants={slideVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                                className="flex flex-col gap-5"
                            >
                                <div className="flex flex-col items-start gap-2.5">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 ui-control bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[11px] font-mono font-semibold text-[var(--accent-text)]">
                                        <Sparkles className="w-3.5 h-3.5" />
                                        <span>{t("onboarding.welcomeBadge")}</span>
                                    </span>
                                    <h2 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight leading-snug">
                                        {t("onboarding.welcomeTitle")}
                                    </h2>
                                    <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] leading-relaxed">
                                        {t("onboarding.welcomeDesc")}
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-2">
                                        <div className="w-8 h-8 ui-control bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] flex items-center justify-center">
                                            <Sliders className="w-4 h-4" />
                                        </div>
                                        <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                                            {t("onboarding.welcomeFeature1Title")}
                                        </h3>
                                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                                            {t("onboarding.welcomeFeature1Desc")}
                                        </p>
                                    </div>

                                    <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-2">
                                        <div className="w-8 h-8 ui-control bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] flex items-center justify-center">
                                            <Mic className="w-4 h-4" />
                                        </div>
                                        <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                                            {t("onboarding.welcomeFeature2Title")}
                                        </h3>
                                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                                            {t("onboarding.welcomeFeature2Desc")}
                                        </p>
                                    </div>

                                    <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-2">
                                        <div className="w-8 h-8 ui-control bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] flex items-center justify-center">
                                            <Disc3 className="w-4 h-4" />
                                        </div>
                                        <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                                            {t("onboarding.welcomeFeature3Title")}
                                        </h3>
                                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                                            {t("onboarding.welcomeFeature3Desc")}
                                        </p>
                                    </div>
                                </div>

                                {/* Language selector */}
                                <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)]">
                                    <span className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                                        <Globe className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                        <span>{t("settings.languageSectionTitle")}</span>
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        {languages.map((lang) => (
                                            <button
                                                key={lang.code}
                                                type="button"
                                                onClick={() => setLanguage(lang.code)}
                                                className={`px-3 py-1.5 ui-control text-xs font-medium border transition-colors cursor-pointer flex items-center gap-1.5 ${
                                                    language === lang.code
                                                        ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)] font-semibold"
                                                        : "bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                                }`}
                                            >
                                                <span>{lang.flag}</span>
                                                <span>{lang.nativeName}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {stepIndex === 1 && (
                            <motion.div
                                key="wizard-step-1"
                                custom={direction}
                                variants={slideVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                                className="flex flex-col gap-4"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h2 className="text-lg font-bold text-[var(--text-primary)]">
                                            {t("onboarding.routingTitle")}
                                        </h2>
                                        <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                                            {t("onboarding.routingDesc")}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void scanDevices(true)}
                                        disabled={isScanningDevices}
                                        className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] cursor-pointer shrink-0"
                                    >
                                        <RefreshCw
                                            className={`w-3.5 h-3.5 ${isScanningDevices ? "animate-spin" : ""}`}
                                        />
                                        <span>
                                            {isScanningDevices
                                                ? t("onboarding.scanningDevices")
                                                : t("onboarding.scanDevicesBtn")}
                                        </span>
                                    </button>
                                </div>

                                {/* VB-CABLE Status Banner */}
                                <div className="p-3.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5">
                                        <span
                                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                                isVbCableDetected
                                                    ? "bg-[var(--accent)]"
                                                    : "bg-amber-400"
                                            }`}
                                        />
                                        <span className="text-xs font-semibold text-[var(--text-primary)]">
                                            {isVbCableDetected
                                                ? t("onboarding.vbCableDetected")
                                                : t("onboarding.vbCableNotDetected")}
                                        </span>
                                    </div>
                                    {!isVbCableDetected && (
                                        <a
                                            href="https://vb-audio.com/Cable/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 ui-control bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-border)] text-xs text-[var(--accent-text)] font-medium"
                                        >
                                            <span>{t("onboarding.vbCableDownloadLink")}</span>
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                    )}
                                </div>

                                {/* Primary Output Selector + Test Tone */}
                                <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <Radio className="w-4 h-4 text-[var(--accent-text)]" />
                                            <span className="text-xs font-semibold text-[var(--text-primary)]">
                                                {t("routing.primaryOutputTitle")}
                                            </span>
                                        </div>
                                        <motion.button
                                            type="button"
                                            whileTap={{ scale: 0.94 }}
                                            onClick={handleTestTone}
                                            disabled={isPlayingTestTone}
                                            className="flex items-center gap-1.5 px-2.5 py-1 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] cursor-pointer"
                                        >
                                            <Play className="w-3 h-3 fill-current text-[var(--accent-text)]" />
                                            <span>
                                                {isPlayingTestTone
                                                    ? t("routing.playingTestTone")
                                                    : t("routing.playTestTone")}
                                            </span>
                                        </motion.button>
                                    </div>
                                    <p className="text-[11px] text-[var(--text-secondary)]">
                                        {t("routing.primaryOutputDesc")}
                                    </p>
                                    <select
                                        value={routingConfig.primaryDeviceId}
                                        onChange={(e) => {
                                            const newId = e.target.value;
                                            const selected = outputDevices.find(
                                                (d) => d.deviceId === newId,
                                            );
                                            onRoutingConfigChange({
                                                ...routingConfig,
                                                primaryDeviceId: newId,
                                                primaryDeviceLabel:
                                                    selected?.label ||
                                                    t("routing.defaultSystemOutput"),
                                            });
                                        }}
                                        className="px-3 py-2.5 ui-input bg-[var(--bg-input)] border border-[var(--border-input)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                                    >
                                        <option value="default">
                                            {t("routing.defaultSystemOutput")}
                                        </option>
                                        {outputDevices.map((device) => (
                                            <option
                                                key={device.deviceId}
                                                value={device.deviceId}
                                            >
                                                {device.label ||
                                                    t("routing.deviceItem", {
                                                        id: device.deviceId.slice(0, 8),
                                                    })}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Dual Output & Secondary Device */}
                                <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-start gap-2.5">
                                            <Headphones className="w-4 h-4 text-[var(--accent-text)] mt-0.5 shrink-0" />
                                            <div>
                                                <p className="text-xs font-semibold text-[var(--text-primary)]">
                                                    {t("routing.dualOutputCardTitle")}
                                                </p>
                                                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                                                    {t("routing.dualOutputCardDesc")}
                                                </p>
                                            </div>
                                        </div>
                                        <motion.button
                                            type="button"
                                            whileTap={{ scale: 0.92 }}
                                            onClick={() =>
                                                onRoutingConfigChange({
                                                    ...routingConfig,
                                                    dualOutputEnabled:
                                                        !routingConfig.dualOutputEnabled,
                                                })
                                            }
                                            className={`w-10 h-6 flex items-center ui-control p-0.5 transition-colors cursor-pointer shrink-0 ${
                                                routingConfig.dualOutputEnabled
                                                    ? "bg-[var(--accent)] justify-end"
                                                    : "bg-zinc-700 justify-start"
                                            }`}
                                        >
                                            <motion.div
                                                layout
                                                transition={{
                                                    type: "spring",
                                                    stiffness: 520,
                                                    damping: 32,
                                                }}
                                                className="w-5 h-5 ui-control bg-white"
                                            />
                                        </motion.button>
                                    </div>

                                    <AnimatePresence initial={false}>
                                        {routingConfig.dualOutputEnabled && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: "auto" }}
                                                exit={{ opacity: 0, height: 0 }}
                                                transition={{ duration: 0.18 }}
                                                className="overflow-hidden flex flex-col gap-2 pt-2 border-t border-[var(--border-subtle)]"
                                            >
                                                <label className="text-[11px] text-[var(--text-secondary)]">
                                                    {t("routing.secondaryDeviceTitle")}
                                                </label>
                                                <select
                                                    value={routingConfig.secondaryDeviceId}
                                                    onChange={(e) => {
                                                        const selected = outputDevices.find(
                                                            (d) =>
                                                                d.deviceId === e.target.value,
                                                        );
                                                        onRoutingConfigChange({
                                                            ...routingConfig,
                                                            secondaryDeviceId: e.target.value,
                                                            secondaryDeviceLabel:
                                                                selected?.label ||
                                                                t("routing.headphonesFallback"),
                                                        });
                                                    }}
                                                    className="px-3 py-2 ui-input bg-[var(--bg-input)] border border-[var(--border-input)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                                                >
                                                    <option value="default">
                                                        {t("routing.secondaryDeviceDefault")}
                                                    </option>
                                                    {outputDevices.map((device) => (
                                                        <option
                                                            key={device.deviceId}
                                                            value={device.deviceId}
                                                        >
                                                            {device.label ||
                                                                t("routing.headphonesItem", {
                                                                    id: device.deviceId.slice(
                                                                        0,
                                                                        8,
                                                                    ),
                                                                })}
                                                        </option>
                                                    ))}
                                                </select>

                                                {(routingConfig.primaryDeviceId ===
                                                    routingConfig.secondaryDeviceId ||
                                                    ((!routingConfig.primaryDeviceId ||
                                                        routingConfig.primaryDeviceId ===
                                                            "default") &&
                                                        (!routingConfig.secondaryDeviceId ||
                                                            routingConfig.secondaryDeviceId ===
                                                                "default"))) && (
                                                    <div className="p-2.5 ui-inner bg-amber-950/30 border border-amber-800/60 text-[11px] text-amber-300 flex items-start gap-2 leading-relaxed">
                                                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                                                        <span>
                                                            <strong>
                                                                {t("routing.echoWarningTitle")}
                                                            </strong>{" "}
                                                            {t("routing.echoWarningBody")}
                                                        </span>
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </motion.div>
                        )}

                        {stepIndex === 2 && (
                            <motion.div
                                key="wizard-step-2"
                                custom={direction}
                                variants={slideVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                                className="flex flex-col gap-4"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h2 className="text-lg font-bold text-[var(--text-primary)]">
                                            {t("onboarding.micTitle")}
                                        </h2>
                                        <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                                            {t("onboarding.micDesc")}
                                        </p>
                                    </div>
                                    <span
                                        className={`text-[11px] font-mono px-2.5 py-0.5 ui-control border font-semibold shrink-0 ${
                                            routingConfig.micPassThrough
                                                ? "border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--accent-text)]"
                                                : "border-[var(--border-subtle)] bg-[var(--bg-inner)] text-[var(--text-muted)]"
                                        }`}
                                    >
                                        {routingConfig.micPassThrough
                                            ? t("routing.micPassthroughActiveBadge")
                                            : t("routing.micPassthroughInactiveBadge")}
                                    </span>
                                </div>

                                <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-3.5">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2.5">
                                            <Mic className="w-4 h-4 text-[var(--accent-text)]" />
                                            <span className="text-xs font-semibold text-[var(--text-primary)]">
                                                {t("routing.micPassthroughToggle")}
                                            </span>
                                        </div>
                                        <motion.button
                                            type="button"
                                            whileTap={{ scale: 0.92 }}
                                            onClick={() => void handleToggleMicPassThrough()}
                                            className={`w-10 h-6 flex items-center ui-control p-0.5 transition-colors cursor-pointer shrink-0 ${
                                                routingConfig.micPassThrough
                                                    ? "bg-[var(--accent)] justify-end"
                                                    : "bg-zinc-700 justify-start"
                                            }`}
                                        >
                                            <motion.div
                                                layout
                                                transition={{
                                                    type: "spring",
                                                    stiffness: 520,
                                                    damping: 32,
                                                }}
                                                className="w-5 h-5 ui-control bg-white"
                                            />
                                        </motion.button>
                                    </div>

                                    {micError && (
                                        <div className="p-2.5 ui-inner bg-red-950/60 border border-red-800 text-red-300 text-xs flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                                            <span>{micError}</span>
                                        </div>
                                    )}

                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[11px] text-[var(--text-secondary)]">
                                            {t("routing.physicalMicLabel")}
                                        </label>
                                        <select
                                            value={routingConfig.micDeviceId}
                                            onChange={(e) => {
                                                const newId = e.target.value;
                                                const selected = inputDevices.find(
                                                    (d) => d.deviceId === newId,
                                                );
                                                onRoutingConfigChange({
                                                    ...routingConfig,
                                                    micDeviceId: newId,
                                                    micDeviceLabel:
                                                        selected?.label ||
                                                        t("routing.micFallback"),
                                                });
                                            }}
                                            className="px-3 py-2 ui-input bg-[var(--bg-input)] border border-[var(--border-input)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                                        >
                                            <option value="default">
                                                {t("routing.defaultMicOption")}
                                            </option>
                                            {inputDevices.map((device) => (
                                                <option
                                                    key={device.deviceId}
                                                    value={device.deviceId}
                                                >
                                                    {device.label ||
                                                        t("routing.micItem", {
                                                            id: device.deviceId.slice(0, 8),
                                                        })}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <AnimatePresence initial={false}>
                                        {routingConfig.micPassThrough && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: "auto" }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="overflow-hidden flex flex-col gap-3 pt-2 border-t border-[var(--border-subtle)]"
                                            >
                                                <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-secondary)]">
                                                    <span className="flex items-center gap-1.5">
                                                        <Activity
                                                            className={`w-3.5 h-3.5 ${
                                                                micLevel > 0
                                                                    ? "text-[var(--accent-text)] animate-pulse"
                                                                    : "text-[var(--text-muted)]"
                                                            }`}
                                                        />
                                                        <span>
                                                            {micStatus.active
                                                                ? micStatus.label ||
                                                                  t("onboarding.micConnectedHint")
                                                                : t("routing.micScanning")}
                                                        </span>
                                                    </span>
                                                    <span className="font-bold text-[var(--accent-text)] tabular-nums">
                                                        %{micLevel}
                                                    </span>
                                                </div>

                                                <div className="w-full h-2 ui-control bg-[var(--bg-card)] overflow-hidden border border-[var(--border-subtle)]">
                                                    <div
                                                        className="h-full bg-[var(--accent)] transition-all duration-75"
                                                        style={{
                                                            width: `${Math.max(micLevel > 0 ? 5 : 0, micLevel)}%`,
                                                        }}
                                                    />
                                                </div>

                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="text-[var(--text-secondary)]">
                                                            {t("routing.micVolumeSlider")}
                                                        </span>
                                                        <span className="font-mono text-[var(--accent-text)] font-semibold">
                                                            %{Math.round((routingConfig.micVolume ?? 1.0) * 100)}
                                                        </span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="1.5"
                                                        step="0.05"
                                                        value={routingConfig.micVolume ?? 1.0}
                                                        onChange={(e) => {
                                                            const vol = parseFloat(e.target.value);
                                                            onRoutingConfigChange({
                                                                ...routingConfig,
                                                                micVolume: vol,
                                                            });
                                                            void audioEngine.setMicrophonePassThrough(
                                                                true,
                                                                routingConfig.micDeviceId,
                                                                vol,
                                                            );
                                                        }}
                                                        className="w-full cursor-pointer"
                                                    />
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Anti-Echo Ducking */}
                                <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold text-[var(--text-primary)]">
                                            {t("routing.antiEchoTitle")}
                                        </p>
                                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                                            {t("routing.antiEchoDesc")}
                                        </p>
                                    </div>
                                    <motion.button
                                        type="button"
                                        whileTap={{ scale: 0.92 }}
                                        onClick={() => {
                                            const nextVal =
                                                routingConfig.muteMicOnPlay === false;
                                            onRoutingConfigChange({
                                                ...routingConfig,
                                                muteMicOnPlay: nextVal,
                                            });
                                            audioEngine.setMuteMicOnPlay(nextVal);
                                        }}
                                        className={`w-10 h-6 flex items-center ui-control p-0.5 transition-colors cursor-pointer shrink-0 ${
                                            routingConfig.muteMicOnPlay !== false
                                                ? "bg-[var(--accent)] justify-end"
                                                : "bg-zinc-700 justify-start"
                                        }`}
                                    >
                                        <motion.div
                                            layout
                                            transition={{
                                                type: "spring",
                                                stiffness: 520,
                                                damping: 32,
                                            }}
                                            className="w-5 h-5 ui-control bg-white"
                                        />
                                    </motion.button>
                                </div>
                            </motion.div>
                        )}

                        {stepIndex === 3 && (
                            <motion.div
                                key="wizard-step-3"
                                custom={direction}
                                variants={slideVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                                className="flex flex-col gap-4"
                            >
                                <div>
                                    <h2 className="text-lg font-bold text-[var(--text-primary)]">
                                        {t("onboarding.accountsTitle")}
                                    </h2>
                                    <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                                        {t("onboarding.accountsDesc")}
                                    </p>
                                </div>

                                {/* Spotify Account Card */}
                                <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 ui-control bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                                                <Disc3 className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-[var(--text-primary)]">
                                                        Spotify
                                                    </span>
                                                    <span
                                                        className={`text-[10px] font-mono px-2 py-0.5 ui-control border ${
                                                            spotifyState.isConnected
                                                                ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                                                : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-muted)]"
                                                        }`}
                                                    >
                                                        {spotifyState.isConnected
                                                            ? t("onboarding.connected")
                                                            : t("onboarding.notConnected")}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-[var(--text-secondary)]">
                                                    {spotifyState.isConnected
                                                        ? spotifyState.user?.display_name ||
                                                          t("spotify.connectedUser")
                                                        : t("spotify.connectDesc")}
                                                </p>
                                            </div>
                                        </div>

                                        {spotifyState.isConnected ? (
                                            <button
                                                type="button"
                                                onClick={() => spotifyService.logout()}
                                                className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-[var(--bg-card)] hover:border-rose-700 text-xs text-[var(--text-secondary)] hover:text-rose-300 border border-[var(--border-subtle)] cursor-pointer"
                                            >
                                                <LogOut className="w-3.5 h-3.5" />
                                                <span>{t("spotify.disconnectBtn")}</span>
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => void handleConnectSpotify()}
                                                className="btn-accent flex items-center gap-1.5 px-3.5 py-1.5 ui-control text-xs font-semibold cursor-pointer"
                                            >
                                                <LogIn className="w-3.5 h-3.5" />
                                                <span>{t("spotify.connectBtn")}</span>
                                            </button>
                                        )}
                                    </div>

                                    {!spotifyState.isConnected && !spotifyState.hasEnvClientId && (
                                        <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border-subtle)]">
                                            <div className="flex flex-col sm:flex-row gap-2">
                                                <input
                                                    type="text"
                                                    value={clientIdDraft}
                                                    onChange={(e) => {
                                                        setClientIdDraft(e.target.value);
                                                        spotifyService.updateState({
                                                            clientId: e.target.value.trim(),
                                                        });
                                                    }}
                                                    placeholder={t("spotify.clientIdPlaceholder")}
                                                    className="flex-1 px-3 py-2 ui-input bg-[var(--bg-input)] border border-[var(--border-input)] text-xs font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => void handleCopyRedirectUri()}
                                                    className="flex items-center justify-center gap-1.5 px-3 py-2 ui-control bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-border)] text-[11px] font-mono text-[var(--text-secondary)] cursor-pointer shrink-0"
                                                    title={spotifyService.getRedirectUri()}
                                                >
                                                    {copiedRedirect ? (
                                                        <Check className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                                    ) : (
                                                        <Copy className="w-3.5 h-3.5" />
                                                    )}
                                                    <span>Redirect URI</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {spotifyError && (
                                        <p className="text-[11px] text-rose-300 bg-rose-950/40 border border-rose-800/70 px-3 py-2 ui-inner">
                                            {spotifyError}
                                        </p>
                                    )}
                                </div>

                                {/* YouTube Account & Optional Cookie Card */}
                                <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 ui-control bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center">
                                                <Youtube className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-[var(--text-primary)]">
                                                        YouTube
                                                    </span>
                                                    <span
                                                        className={`text-[10px] font-mono px-2 py-0.5 ui-control border ${
                                                            isYouTubeConnected
                                                                ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                                                : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-muted)]"
                                                        }`}
                                                    >
                                                        {isYouTubeConnected
                                                            ? t("onboarding.connected")
                                                            : t("onboarding.notConnected")}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-[var(--text-secondary)]">
                                                    {t("onboarding.youtubeOptionalHint")}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1.5">
                                            {youtubeConfig.hasOAuth ||
                                            youtubeConfig.authStatus === "connected" ? (
                                                <button
                                                    type="button"
                                                    disabled={isStartingYtAuth}
                                                    onClick={() =>
                                                        void logoutYouTubeAccount().then(
                                                            setYoutubeConfig,
                                                        )
                                                    }
                                                    className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-[var(--bg-card)] hover:border-rose-700 text-xs text-[var(--text-secondary)] hover:text-rose-300 border border-[var(--border-subtle)] cursor-pointer"
                                                >
                                                    <LogOut className="w-3.5 h-3.5" />
                                                    <span>{t("spotify.disconnectBtn")}</span>
                                                </button>
                                            ) : youtubeConfig.authStatus !== "pending" ? (
                                                <button
                                                    type="button"
                                                    disabled={isStartingYtAuth}
                                                    onClick={() => void handleStartYtLogin()}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-[var(--bg-card)] hover:border-[var(--accent-border)] text-xs font-semibold text-[var(--text-primary)] border border-[var(--border-subtle)] cursor-pointer"
                                                >
                                                    <LogIn className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                                    <span>{t("spotify.ytAuthSignInBtn")}</span>
                                                </button>
                                            ) : null}

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setShowYtCookieSection((prev) => !prev)
                                                }
                                                className={`flex items-center gap-1 px-2.5 py-1.5 ui-control border text-xs cursor-pointer ${
                                                    showYtCookieSection || youtubeConfig.hasCookie
                                                        ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                                        : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)]"
                                                }`}
                                                title={t("spotify.ytAuthTabCookie")}
                                            >
                                                <Cookie className="w-3.5 h-3.5" />
                                                <span className="hidden sm:inline">Cookie</span>
                                            </button>
                                        </div>
                                    </div>

                                    {youtubeConfig.authStatus === "pending" &&
                                        youtubeConfig.pendingAuth && (
                                            <div className="p-3 ui-inner bg-[var(--bg-card)] border border-[var(--accent-border)] flex flex-col gap-2">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div>
                                                        <span className="text-[11px] text-[var(--text-secondary)] block">
                                                            {t("spotify.ytAuthCodeLabel")}
                                                        </span>
                                                        <span className="text-lg font-mono font-bold tracking-widest text-[var(--accent-text)]">
                                                            {youtubeConfig.pendingAuth.userCode}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                void handleCopyYtCode(
                                                                    youtubeConfig.pendingAuth!
                                                                        .userCode,
                                                                )
                                                            }
                                                            className="flex items-center gap-1 px-2.5 py-1.5 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] cursor-pointer"
                                                        >
                                                            {copiedYtCode ? (
                                                                <Check className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                                            ) : (
                                                                <Copy className="w-3.5 h-3.5" />
                                                            )}
                                                            <span>{t("spotify.copyUriBtn")}</span>
                                                        </button>
                                                        <a
                                                            href={
                                                                youtubeConfig.pendingAuth
                                                                    .verificationUrl
                                                            }
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="btn-accent flex items-center gap-1 px-3 py-1.5 ui-control text-xs font-semibold"
                                                        >
                                                            <span>google.com/device</span>
                                                            <ExternalLink className="w-3 h-3" />
                                                        </a>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                void cancelYouTubeLogin().then(
                                                                    setYoutubeConfig,
                                                                )
                                                            }
                                                            className="p-1.5 ui-control text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                                                            title={t("common.cancel")}
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                                <p className="text-[11px] text-[var(--text-muted)]">
                                                    {t("spotify.ytAuthWaitingConfirm")}
                                                </p>
                                            </div>
                                        )}

                                    {youtubeConfig.authError && (
                                        <p className="text-[11px] text-rose-300 bg-rose-950/40 border border-rose-800/70 px-3 py-2 ui-inner">
                                            {youtubeConfig.authError}
                                        </p>
                                    )}

                                    <AnimatePresence initial={false}>
                                        {showYtCookieSection && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: "auto" }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="overflow-hidden flex flex-col gap-2 pt-2 border-t border-[var(--border-subtle)]"
                                            >
                                                <textarea
                                                    rows={3}
                                                    value={cookieInput}
                                                    onChange={(e) =>
                                                        setCookieInput(e.target.value)
                                                    }
                                                    placeholder={
                                                        youtubeConfig.hasCookie
                                                            ? t(
                                                                  "spotify.cookieAlreadySavedPlaceholder",
                                                              )
                                                            : t("spotify.cookieInputPlaceholder")
                                                    }
                                                    className="w-full px-3 py-2 ui-input bg-[var(--bg-input)] border border-[var(--border-input)] text-[11px] font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] resize-none"
                                                />
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            ref={cookieFileRef}
                                                            type="file"
                                                            accept=".txt"
                                                            onChange={(e) =>
                                                                void handleCookieFileChange(e)
                                                            }
                                                            className="sr-only"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                cookieFileRef.current?.click()
                                                            }
                                                            className="flex items-center gap-1.5 px-2.5 py-1.5 ui-control bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                                                        >
                                                            <Upload className="w-3.5 h-3.5" />
                                                            <span>
                                                                {t("spotify.cookieUploadTxtBtn")}
                                                            </span>
                                                        </button>
                                                        {youtubeConfig.hasCookie && (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    void clearYouTubeCookie().then(
                                                                        setYoutubeConfig,
                                                                    )
                                                                }
                                                                className="flex items-center gap-1 px-2.5 py-1.5 ui-control bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs text-rose-300 cursor-pointer"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                <span>
                                                                    {t("spotify.cookieClearBtn")}
                                                                </span>
                                                            </button>
                                                        )}
                                                    </div>

                                                    <button
                                                        type="button"
                                                        disabled={isSavingCookie}
                                                        onClick={() => void handleSaveCookie()}
                                                        className="btn-accent px-3 py-1.5 ui-control text-xs font-semibold cursor-pointer"
                                                    >
                                                        {t("spotify.cookieSaveBtn")}
                                                    </button>
                                                </div>
                                                {cookieFeedback && (
                                                    <p
                                                        className={`text-[11px] px-2.5 py-1.5 ui-inner border ${
                                                            cookieFeedback.type === "success"
                                                                ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                                                                : "bg-rose-950/40 border-rose-800 text-rose-300"
                                                        }`}
                                                    >
                                                        {cookieFeedback.text}
                                                    </p>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </motion.div>
                        )}

                        {stepIndex === 4 && (
                            <motion.div
                                key="wizard-step-4"
                                custom={direction}
                                variants={slideVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                                className="flex flex-col gap-5"
                            >
                                <div className="flex flex-col items-start gap-2.5">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 ui-control bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[11px] font-mono font-semibold text-[var(--accent-text)]">
                                        <ShieldCheck className="w-3.5 h-3.5" />
                                        <span>{t("onboarding.readyBadge")}</span>
                                    </span>
                                    <h2 className="text-xl font-bold text-[var(--text-primary)]">
                                        {t("onboarding.readyTitle")}
                                    </h2>
                                    <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] leading-relaxed">
                                        {t("onboarding.readyDesc")}
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <div className="p-3.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex items-center justify-between gap-2">
                                        <span className="text-xs text-[var(--text-secondary)]">
                                            {t("onboarding.summaryPrimaryOutput")}
                                        </span>
                                        <span className="text-xs font-semibold text-[var(--text-primary)] truncate max-w-[160px]">
                                            {routingConfig.primaryDeviceLabel}
                                        </span>
                                    </div>

                                    <div className="p-3.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex items-center justify-between gap-2">
                                        <span className="text-xs text-[var(--text-secondary)]">
                                            {t("onboarding.summaryDualOutput")}
                                        </span>
                                        <span
                                            className={`text-xs font-mono font-semibold ${
                                                routingConfig.dualOutputEnabled
                                                    ? "text-[var(--accent-text)]"
                                                    : "text-[var(--text-muted)]"
                                            }`}
                                        >
                                            {routingConfig.dualOutputEnabled
                                                ? t("common.active")
                                                : t("common.inactive")}
                                        </span>
                                    </div>

                                    <div className="p-3.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex items-center justify-between gap-2">
                                        <span className="text-xs text-[var(--text-secondary)]">
                                            {t("onboarding.summaryMicPass")}
                                        </span>
                                        <span
                                            className={`text-xs font-mono font-semibold ${
                                                routingConfig.micPassThrough
                                                    ? "text-[var(--accent-text)]"
                                                    : "text-[var(--text-muted)]"
                                            }`}
                                        >
                                            {routingConfig.micPassThrough
                                                ? t("common.active")
                                                : t("common.inactive")}
                                        </span>
                                    </div>

                                    <div className="p-3.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex items-center justify-between gap-2">
                                        <span className="text-xs text-[var(--text-secondary)]">
                                            {t("onboarding.summarySpotify")} /{" "}
                                            {t("onboarding.summaryYouTube")}
                                        </span>
                                        <span className="text-xs font-mono font-semibold text-[var(--accent-text)]">
                                            {(spotifyState.isConnected ? 1 : 0) +
                                                (isYouTubeConnected ? 1 : 0)}{" "}
                                            / 2 {t("onboarding.connected")}
                                        </span>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    </div>
                </div>

                {/* Wizard Navigation Footer */}
                <div className="relative z-10 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 backdrop-blur-xl shrink-0">
                <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-6 sm:px-10 py-4">
                    {stepIndex === 0 ? (
                        <button
                            type="button"
                            onClick={onSkip}
                            className="px-3.5 py-2 ui-control text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                            {t("onboarding.skipSetup")}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => goToStep(stepIndex - 1)}
                            className="flex items-center gap-1.5 px-3.5 py-2 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                        >
                            <ArrowLeft className="w-3.5 h-3.5" />
                            <span>{t("onboarding.back")}</span>
                        </button>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                        {stepIndex < TOTAL_STEPS - 1 ? (
                            <motion.button
                                type="button"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.96 }}
                                onClick={() => goToStep(stepIndex + 1)}
                                className="btn-accent flex items-center gap-1.5 px-4 py-2 ui-control text-xs font-semibold cursor-pointer"
                            >
                                <span>
                                    {stepIndex === 0
                                        ? t("onboarding.startSetup")
                                        : t("onboarding.next")}
                                </span>
                                <ArrowRight className="w-3.5 h-3.5" />
                            </motion.button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => onComplete(false)}
                                    className="px-3.5 py-2 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                                >
                                    {t("onboarding.launchSkipTour")}
                                </button>
                                <motion.button
                                    type="button"
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.96 }}
                                    onClick={() => onComplete(true)}
                                    className="btn-accent flex items-center gap-1.5 px-4 py-2 ui-control text-xs font-semibold cursor-pointer"
                                >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>{t("onboarding.launchWithTour")}</span>
                                </motion.button>
                            </>
                        )}
                    </div>
                </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
