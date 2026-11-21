import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
    Radio,
    Headphones,
    Mic,
    ArrowRight,
    Sliders,
    Play,
    HelpCircle,
    Activity,
    AlertTriangle,
} from "lucide-react";
import { AudioRoutingConfig } from "../types/sound";
import { audioEngine } from "../utils/audioEngine";
import { useTranslation } from "../i18n";

interface AudioRoutingViewProps {
    routingConfig: AudioRoutingConfig;
    onRoutingConfigChange: (config: AudioRoutingConfig) => void;
    isElectron: boolean;
}

export function AudioRoutingView({
    routingConfig,
    onRoutingConfigChange,
}: AudioRoutingViewProps) {
    const { t } = useTranslation();
    const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
    const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
    const [isPlayingTestTone, setIsPlayingTestTone] = useState(false);
    const [micLevel, setMicLevel] = useState(0);
    const [micError, setMicError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        const scanDevices = async () => {
            try {
                if (!navigator.mediaDevices?.enumerateDevices) return;

                let allDevices =
                    await navigator.mediaDevices.enumerateDevices();

                if (allDevices.some((d) => !d.label)) {
                    try {
                        const stream =
                            await navigator.mediaDevices.getUserMedia({
                                audio: true,
                            });
                        stream.getTracks().forEach((t) => t.stop());
                        allDevices =
                            await navigator.mediaDevices.enumerateDevices();
                    } catch {
                        // User may not have granted yet
                    }
                }

                if (!isMounted) return;

                const outputs = allDevices.filter(
                    (d) => d.kind === "audiooutput",
                );
                const inputs = allDevices.filter(
                    (d) => d.kind === "audioinput",
                );

                setOutputDevices(outputs);
                setInputDevices(inputs);

                let updated = false;
                const newConfig = { ...routingConfig };

                const vbCableOutput = outputs.find(
                    (d) =>
                        d.label.toLowerCase().includes("cable input") ||
                        d.label.toLowerCase().includes("vb-audio"),
                );

                if (
                    vbCableOutput &&
                    (newConfig.primaryDeviceId === "default" ||
                        !newConfig.primaryDeviceId)
                ) {
                    newConfig.primaryDeviceId = vbCableOutput.deviceId;
                    newConfig.primaryDeviceLabel = vbCableOutput.label;
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
                    (!newConfig.micDeviceId ||
                        newConfig.micDeviceId === "default")
                ) {
                    newConfig.micDeviceId = physicalMic.deviceId;
                    newConfig.micDeviceLabel = physicalMic.label;
                    updated = true;
                }

                if (updated) {
                    onRoutingConfigChange(newConfig);
                }
            } catch (err) {
                console.warn("Audio device enumeration error:", err);
            }
        };

        void scanDevices();
        navigator.mediaDevices?.addEventListener?.("devicechange", scanDevices);

        return () => {
            isMounted = false;
            navigator.mediaDevices?.removeEventListener?.(
                "devicechange",
                scanDevices,
            );
        };
    }, []);

    const [micStatus, setMicStatus] = useState<{
        active: boolean;
        label: string;
        muted: boolean;
    }>({
        active: false,
        label: "",
        muted: false,
    });

    useEffect(() => {
        if (!routingConfig.micPassThrough) {
            setMicLevel(0);
            setMicStatus({ active: false, label: "", muted: false });
            return;
        }

        const interval = setInterval(() => {
            const info = audioEngine.getMicStatusInfo();
            setMicLevel(info.level);
            setMicStatus({
                active: info.active,
                label: info.label,
                muted: info.muted,
            });
        }, 50);

        return () => clearInterval(interval);
    }, [routingConfig.micPassThrough]);

    const handleTestTone = async () => {
        setIsPlayingTestTone(true);
        await audioEngine.playSound(
            {
                id: "test-tone",
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
        setTimeout(() => setIsPlayingTestTone(false), 900);
    };

    const isVbCableDetected = outputDevices.some(
        (d) =>
            d.label.toLowerCase().includes("cable") ||
            d.label.toLowerCase().includes("vb-audio"),
    );

    return (
        <div className="flex-1 flex flex-col gap-6 w-full">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 ui-inner bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
                        <Sliders className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                                {t("routing.title")}
                            </h1>
                            <span
                                className={`text-xs font-mono px-2.5 py-0.5 ui-control border font-semibold ${
                                    isVbCableDetected
                                        ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                        : "bg-[var(--bg-card)] border-[var(--border-card)] text-[var(--text-secondary)]"
                                }`}
                            >
                                {isVbCableDetected
                                    ? "VB-CABLE OK"
                                    : "WAITING CABLE"}
                            </span>
                        </div>
                        <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] mt-0.5">
                            {t("routing.subtitle")}
                        </p>
                    </div>
                </div>
            </div>

            {/* Pipeline Diagram */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] as const }}
                className="app-card ui-card p-5 border border-[var(--border-card)] flex flex-col gap-4"
            >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 items-center">
                    <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col items-center text-center gap-1.5 relative">
                        <Radio className="w-5 h-5 text-[var(--text-primary)]" />
                        <span className="text-xs sm:text-sm font-semibold text-[var(--text-primary)]">
                            {t("routing.pipeLirMic")}
                        </span>
                        <span className="text-xs text-[var(--text-secondary)] font-mono">
                            {t("routing.pipeLirMicSub")}
                        </span>
                        <div className="hidden md:block absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 text-[var(--text-muted)]">
                            <ArrowRight className="w-4 h-4" />
                        </div>
                    </div>

                    <div className="p-4 ui-inner bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex flex-col items-center text-center gap-1.5 relative">
                        <Sliders className="w-5 h-5 text-[var(--accent-text)]" />
                        <span className="text-xs sm:text-sm font-semibold text-[var(--accent-text)]">
                            CABLE Input
                        </span>
                        <span className="text-xs text-[var(--text-secondary)] font-mono">
                            {t("routing.pipeCableInputSub")}
                        </span>
                        <div className="hidden md:block absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 text-[var(--text-muted)]">
                            <ArrowRight className="w-4 h-4" />
                        </div>
                    </div>

                    <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col items-center text-center gap-1.5">
                        <Mic className="w-5 h-5 text-[var(--text-primary)]" />
                        <span className="text-xs sm:text-sm font-semibold text-[var(--text-primary)]">
                            {t("routing.pipeDiscord")}
                        </span>
                        <span className="text-xs text-[var(--text-secondary)] font-mono">
                            {t("routing.pipeDiscordSub")}
                        </span>
                    </div>
                </div>

                {/* Status Callout */}
                <div className="flex items-center justify-between px-4 py-3 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
                    <div className="flex items-center gap-2.5">
                        <Headphones className="w-4 h-4 text-[var(--accent-text)] shrink-0" />
                        <span>
                            {t("routing.dualOutputStatus")}{" "}
                            <strong
                                className={
                                    routingConfig.dualOutputEnabled
                                        ? "text-[var(--text-primary)]"
                                        : "text-[var(--text-muted)]"
                                }
                            >
                                {routingConfig.dualOutputEnabled
                                    ? t("routing.dualOutputActiveText")
                                    : t("routing.dualOutputInactiveText")}
                            </strong>
                        </span>
                    </div>
                    <span className="font-mono text-xs text-[var(--accent-text)] font-medium">
                        {routingConfig.dualOutputEnabled
                            ? t("routing.channelsActive2")
                            : t("routing.channelsActive1")}
                    </span>
                </div>
            </motion.div>

            {/* Main Grid: Device Configuration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Output Routing Box */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: 0.05, ease: [0.22, 1, 0.36, 1] as const }}
                    className="app-card ui-card p-5 border border-[var(--border-card)] flex flex-col gap-4"
                >
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                            <Radio className="w-4 h-4 text-[var(--accent-text)]" />
                            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                                {t("routing.primaryOutputTitle")}
                            </h2>
                        </div>
                        <motion.button
                            type="button"
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.94 }}
                            onClick={handleTestTone}
                            disabled={isPlayingTestTone}
                            className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)] text-xs font-mono border border-[var(--border-subtle)] hover:border-[var(--accent-border)] transition-colors cursor-pointer"
                        >
                            <Play className="w-3 h-3 fill-current text-[var(--accent-text)]" />
                            <span>
                                {isPlayingTestTone
                                    ? t("routing.playingTestTone")
                                    : t("routing.playTestTone")}
                            </span>
                        </motion.button>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-[var(--text-secondary)]">
                            {t("routing.primaryOutputDesc")}
                        </label>
                        <select
                            value={routingConfig.primaryDeviceId}
                            onChange={(e) => {
                                const newId = e.target.value;
                                const selected = outputDevices.find(
                                    (d) => d.deviceId === newId,
                                );
                                const nextConfig = {
                                    ...routingConfig,
                                    primaryDeviceId: newId,
                                    primaryDeviceLabel:
                                        selected?.label || "CABLE Input",
                                };
                                onRoutingConfigChange(nextConfig);
                                audioEngine.setRoutingConfig(
                                    newId,
                                    routingConfig.secondaryDeviceId,
                                    routingConfig.dualOutputEnabled,
                                    routingConfig.masterVolume,
                                );
                            }}
                            className="px-3 py-2.5 ui-input bg-[var(--bg-input)] border border-[var(--border-input)] text-xs sm:text-[13px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
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

                    {/* Dual Output Toggle */}
                    <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-3">
                        <div className="flex flex-col">
                            <span className="text-xs font-semibold text-[var(--text-primary)]">
                                {t("routing.dualOutputCardTitle")}
                            </span>
                            <span className="text-xs text-[var(--text-secondary)] mt-0.5">
                                {t("routing.dualOutputCardDesc")}
                            </span>
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
                                transition={{ type: "spring", stiffness: 520, damping: 32 }}
                                className="w-5 h-5 ui-control bg-white"
                            />
                        </motion.button>
                    </div>

                    {/* Secondary Device selection */}
                    <AnimatePresence initial={false}>
                        {routingConfig.dualOutputEnabled && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
                                className="overflow-hidden"
                            >
                                <div className="flex flex-col gap-2 pt-2">
                                    <label className="text-xs text-[var(--text-secondary)]">
                                        {t("routing.secondaryDeviceTitle")}
                                    </label>
                                    <select
                                        value={routingConfig.secondaryDeviceId}
                                        onChange={(e) => {
                                            const selected = outputDevices.find(
                                                (d) => d.deviceId === e.target.value,
                                            );
                                            onRoutingConfigChange({
                                                ...routingConfig,
                                                secondaryDeviceId: e.target.value,
                                                secondaryDeviceLabel:
                                                    selected?.label ||
                                                    t("routing.headphonesFallback"),
                                            });
                                        }}
                                        className="px-3 py-2.5 ui-input bg-[var(--bg-input)] border border-[var(--border-input)] text-xs sm:text-[13px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
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

                                    {(routingConfig.primaryDeviceId === routingConfig.secondaryDeviceId ||
                                        ((!routingConfig.primaryDeviceId || routingConfig.primaryDeviceId === "default") &&
                                            (!routingConfig.secondaryDeviceId || routingConfig.secondaryDeviceId === "default"))) && (
                                        <div className="mt-1 p-3 ui-inner bg-amber-950/30 border border-amber-800/60 text-xs text-amber-300 flex items-start gap-2 leading-relaxed">
                                            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                                            <span>
                                                <strong>
                                                    {t("routing.echoWarningTitle")}
                                                </strong>{" "}
                                                {t("routing.echoWarningBody")}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* Microphone Pass-Through Box */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const }}
                    className="app-card ui-card p-5 border border-[var(--border-card)] flex flex-col gap-4"
                >
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                            <Mic className="w-4 h-4 text-[var(--accent-text)]" />
                            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                                {t("routing.micPassthroughTitle")}
                            </h2>
                        </div>
                        <span
                            className={`text-[11px] font-mono px-2.5 py-0.5 ui-control border font-semibold ${
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

                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        {t("routing.micPassthroughDesc")}
                    </p>

                    {/* Toggle Switch */}
                    <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)] gap-3">
                        <span className="text-xs font-semibold text-[var(--text-primary)]">
                            {t("routing.micPassthroughToggle")}
                        </span>
                        <motion.button
                            type="button"
                            whileTap={{ scale: 0.92 }}
                            onClick={async () => {
                                const nextState = !routingConfig.micPassThrough;
                                if (nextState) {
                                    setMicError(null);
                                    const res =
                                        await audioEngine.setMicrophonePassThrough(
                                            true,
                                            routingConfig.micDeviceId,
                                            routingConfig.micVolume,
                                        );
                                    if (res.success) {
                                        let nextPrimaryId =
                                            routingConfig.primaryDeviceId;
                                        let nextPrimaryLabel =
                                            routingConfig.primaryDeviceLabel;

                                        if (
                                            navigator.mediaDevices
                                                ?.enumerateDevices
                                        ) {
                                            const all =
                                                await navigator.mediaDevices.enumerateDevices();
                                            const nextInputs = all.filter(
                                                (d) => d.kind === "audioinput",
                                            );
                                            const nextOutputs = all.filter(
                                                (d) => d.kind === "audiooutput",
                                            );
                                            setInputDevices(nextInputs);
                                            setOutputDevices(nextOutputs);

                                            if (
                                                !nextPrimaryId ||
                                                nextPrimaryId === "default"
                                            ) {
                                                const vbCable = nextOutputs.find(
                                                    (d) =>
                                                        d.label
                                                            .toLowerCase()
                                                            .includes("cable input") ||
                                                        d.label
                                                            .toLowerCase()
                                                            .includes("vb-audio"),
                                                );
                                                if (vbCable) {
                                                    nextPrimaryId =
                                                        vbCable.deviceId;
                                                    nextPrimaryLabel =
                                                        vbCable.label;
                                                }
                                            }
                                        }

                                        onRoutingConfigChange({
                                            ...routingConfig,
                                            micPassThrough: true,
                                            primaryDeviceId: nextPrimaryId,
                                            primaryDeviceLabel:
                                                nextPrimaryLabel,
                                        });
                                    } else {
                                        setMicError(
                                            res.error ||
                                                t("routing.micAccessError"),
                                        );
                                    }
                                } else {
                                    setMicError(null);
                                    await audioEngine.setMicrophonePassThrough(
                                        false,
                                    );
                                    onRoutingConfigChange({
                                        ...routingConfig,
                                        micPassThrough: false,
                                    });
                                }
                            }}
                            className={`w-10 h-6 flex items-center ui-control p-0.5 transition-colors cursor-pointer shrink-0 ${
                                routingConfig.micPassThrough
                                    ? "bg-[var(--accent)] justify-end"
                                    : "bg-zinc-700 justify-start"
                            }`}
                        >
                            <motion.div
                                layout
                                transition={{ type: "spring", stiffness: 520, damping: 32 }}
                                className="w-5 h-5 ui-control bg-white"
                            />
                        </motion.button>
                    </div>

                    <AnimatePresence initial={false}>
                        {micError && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.18 }}
                                className="overflow-hidden"
                            >
                                <div className="p-3 ui-inner bg-red-950/60 border border-red-800 text-red-300 text-xs flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                                    <span>{micError}</span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Physical Mic Selector */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-[var(--text-secondary)]">
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
                            className="px-3 py-2.5 ui-input bg-[var(--bg-input)] border border-[var(--border-input)] text-xs sm:text-[13px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
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

                        {routingConfig.micPassThrough && (
                            <div className="flex items-center gap-2 text-xs font-mono mt-1 px-3 py-1.5 ui-input bg-[var(--bg-inner)] border border-[var(--border-subtle)]">
                                <span
                                    className={`w-2 h-2 rounded-full ${micStatus.active ? "bg-[var(--accent)]" : "bg-amber-400 animate-pulse"}`}
                                />
                                <span
                                    className={
                                        micStatus.active
                                            ? "text-[var(--text-primary)]"
                                            : "text-amber-400"
                                    }
                                >
                                    {micStatus.active
                                        ? t("routing.hardwareLabel", {
                                              label:
                                                  micStatus.label ||
                                                  t("common.active"),
                                          })
                                        : t("routing.micScanning")}
                                </span>
                                {micStatus.muted && (
                                    <span className="text-red-400 bg-red-950 px-1.5 py-0.5 rounded ml-auto">
                                        {t("routing.windowsMuted")}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Live Mic VU Meter & Volume Slider */}
                    <AnimatePresence initial={false}>
                        {routingConfig.micPassThrough && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] as const }}
                                className="overflow-hidden flex flex-col gap-4"
                            >
                                <div className="flex flex-col gap-2 pt-1">
                                    <div className="flex items-center justify-between text-xs font-mono text-[var(--text-secondary)]">
                                        <span className="flex items-center gap-1.5">
                                            <Activity
                                                className={`w-3.5 h-3.5 ${micLevel > 0 ? "text-[var(--accent-text)] animate-pulse" : "text-[var(--text-muted)]"}`}
                                            />
                                            <span>{t("routing.micLevelLabel")}</span>
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <motion.button
                                                type="button"
                                                whileTap={{ scale: 0.94 }}
                                                onClick={async () => {
                                                    setMicError(null);
                                                    await audioEngine.setMicrophonePassThrough(
                                                        false,
                                                    );
                                                    const res =
                                                        await audioEngine.setMicrophonePassThrough(
                                                            true,
                                                            routingConfig.micDeviceId,
                                                            routingConfig.micVolume,
                                                        );
                                                    if (!res.success) {
                                                        setMicError(
                                                            res.error ||
                                                                t("routing.micConnectError"),
                                                        );
                                                    }
                                                }}
                                                className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2.5 py-1 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
                                            >
                                                {t("routing.restartMic")}
                                            </motion.button>
                                            <span className="text-[var(--accent-text)] tabular-nums font-bold">
                                                %{micLevel}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="w-full h-2.5 ui-control bg-[var(--bg-inner)] overflow-hidden border border-[var(--border-subtle)]">
                                        <div
                                            className="h-full bg-[var(--accent)] transition-all duration-75"
                                            style={{
                                                width: `${Math.max(micLevel > 0 ? 5 : 0, micLevel)}%`,
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1.5 pt-3 border-t border-[var(--border-subtle)]">
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
                                            audioEngine.setMicrophonePassThrough(
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

                    {/* Anti-Echo Mic Ducking Toggle */}
                    <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-3">
                        <div className="flex flex-col pr-2">
                            <span className="text-xs font-semibold text-[var(--text-primary)]">
                                {t("routing.antiEchoTitle")}
                            </span>
                            <span className="text-xs text-[var(--text-secondary)] leading-relaxed mt-0.5">
                                {t("routing.antiEchoDesc")}
                            </span>
                        </div>
                        <motion.button
                            type="button"
                            whileTap={{ scale: 0.92 }}
                            onClick={() => {
                                const nextVal = routingConfig.muteMicOnPlay === false;
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
                                transition={{ type: "spring", stiffness: 520, damping: 32 }}
                                className="w-5 h-5 ui-control bg-white"
                            />
                        </motion.button>
                    </div>
                </motion.div>
            </div>

            {/* Discord Quick Configuration Guide */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.14, ease: [0.22, 1, 0.36, 1] as const }}
                className="app-card ui-card p-5 border border-[var(--border-card)] flex flex-col gap-4"
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <HelpCircle className="w-4 h-4 text-[var(--accent-text)]" />
                        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                            {t("routing.guideTitle")}
                        </h2>
                    </div>
                    <span className="text-xs font-mono text-[var(--accent-text)] font-semibold">
                        {t("routing.guideStepsBadge")}
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs text-[var(--text-secondary)]">
                    <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-2">
                        <span className="font-mono text-[var(--text-primary)] font-bold">
                            {t("routing.guideStep1Title")}
                        </span>
                        <p className="leading-relaxed whitespace-pre-line">
                            {t("routing.guideStep1Body")}
                        </p>
                    </div>

                    <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-2">
                        <span className="font-mono text-[var(--text-primary)] font-bold">
                            {t("routing.guideStep2Title")}
                        </span>
                        <p className="leading-relaxed whitespace-pre-line">
                            {t("routing.guideStep2Body")}
                        </p>
                    </div>

                    <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-2">
                        <span className="font-mono text-[var(--text-primary)] font-bold">
                            {t("routing.guideStep3Title")}
                        </span>
                        <p className="leading-relaxed whitespace-pre-line">
                            {t("routing.guideStep3Body")}
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
