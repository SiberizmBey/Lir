import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
    AudioWaveform,
    Activity,
    AlertTriangle,
    Check,
    Headphones,
    Keyboard,
    Mic,
    RotateCcw,
    Sliders,
    Sparkles,
    Volume2,
    Waves,
} from "lucide-react";
import { AudioRoutingConfig, VoiceChangerConfig } from "../types/sound";
import {
    DEFAULT_VOICE_CHANGER_CONFIG,
    VOICE_PRESETS,
    VoicePresetDefinition,
} from "../utils/voicePresets";
import { audioEngine } from "../utils/audioEngine";

interface VoiceChangerViewProps {
    config: VoiceChangerConfig;
    onChange: (next: VoiceChangerConfig) => void;
    micPassThrough: boolean;
    onEnableMicPassThrough: () => Promise<{ success: boolean; error?: string }>;
    routingConfig: AudioRoutingConfig;
    onEditPresetHotkey: (preset: VoicePresetDefinition) => void;
    onEditToggleHotkey: () => void;
}

interface SliderRowProps {
    label: string;
    valueText: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
}

function SliderRow({
    label,
    valueText,
    value,
    min,
    max,
    step,
    onChange,
}: SliderRowProps) {
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">{label}</span>
                <span className="font-mono font-semibold text-[var(--accent-text)] tabular-nums">
                    {valueText}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full cursor-pointer"
            />
        </div>
    );
}

export function VoiceChangerView({
    config,
    onChange,
    micPassThrough,
    onEnableMicPassThrough,
    routingConfig,
    onEditPresetHotkey,
    onEditToggleHotkey,
}: VoiceChangerViewProps) {
    const [micLevel, setMicLevel] = useState(0);
    const [micStatus, setMicStatus] = useState<{
        active: boolean;
        label: string;
        muted: boolean;
    }>({
        active: false,
        label: "",
        muted: false,
    });
    const [isStartingMic, setIsStartingMic] = useState(false);
    const [micError, setMicError] = useState<string | null>(null);

    useEffect(() => {
        if (!micPassThrough) {
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
    }, [micPassThrough]);

    const activePreset = useMemo(
        () => VOICE_PRESETS.find((p) => p.id === config.preset),
        [config.preset],
    );

    const isPresetCustomized = useMemo(() => {
        if (!activePreset) return false;
        const p = activePreset.params;
        return (
            Math.abs((config.pitchSemitones ?? 0) - p.pitchSemitones) > 0.2 ||
            Math.abs(config.highpassHz - p.highpassHz) > 0.5 ||
            Math.abs(config.lowpassHz - p.lowpassHz) > 5 ||
            Math.abs(config.bassBoostDb - p.bassBoostDb) > 0.1 ||
            Math.abs(config.clarityBoostDb - p.clarityBoostDb) > 0.1 ||
            Math.abs(config.distortionAmount - p.distortionAmount) > 0.5 ||
            Math.abs(config.ringModHz - p.ringModHz) > 0.5 ||
            Math.abs(config.ringModMix - p.ringModMix) > 0.01 ||
            Math.abs(config.echoDelayMs - p.echoDelayMs) > 1 ||
            Math.abs(config.echoFeedback - p.echoFeedback) > 0.01 ||
            Math.abs(config.echoMix - p.echoMix) > 0.01 ||
            Math.abs(config.reverbMix - p.reverbMix) > 0.01 ||
            Math.abs(config.wetMix - p.wetMix) > 0.01
        );
    }, [activePreset, config]);

    const isEffectRunning = config.enabled && config.wetMix > 0;
    const isSameMonitorDevice =
        routingConfig.primaryDeviceId === routingConfig.secondaryDeviceId ||
        ((!routingConfig.primaryDeviceId ||
            routingConfig.primaryDeviceId === "default") &&
            (!routingConfig.secondaryDeviceId ||
                routingConfig.secondaryDeviceId === "default"));

    const handleSelectPreset = (preset: VoicePresetDefinition) => {
        onChange({
            ...config,
            preset: preset.id,
            enabled: preset.id !== "natural",
            ...preset.params,
        });
    };

    const handleResetToNatural = () => {
        onChange({
            ...DEFAULT_VOICE_CHANGER_CONFIG,
            selfMonitor: config.selfMonitor,
        });
    };

    const updateParam = <K extends keyof VoiceChangerConfig>(
        key: K,
        value: VoiceChangerConfig[K],
    ) => {
        onChange({
            ...config,
            enabled: true,
            [key]: value,
        });
    };

    const handleStartMic = async () => {
        setIsStartingMic(true);
        setMicError(null);
        try {
            const res = await onEnableMicPassThrough();
            if (!res.success) {
                setMicError(
                    res.error ||
                        "Mikrofona erişilemedi. Lütfen mikrofon izinlerini kontrol edin.",
                );
            }
        } catch (err) {
            setMicError(
                err instanceof Error
                    ? err.message
                    : "Mikrofon başlatılırken beklenmeyen bir hata oluştu.",
            );
        } finally {
            setIsStartingMic(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col gap-6 w-full">
            {/* Page Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 ui-inner bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
                        <AudioWaveform className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                                Ses Değiştirici
                            </h1>
                            <span
                                className={`text-xs font-mono px-2.5 py-0.5 ui-control border font-semibold ${
                                    isEffectRunning
                                        ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                        : "bg-[var(--bg-card)] border-[var(--border-card)] text-[var(--text-secondary)]"
                                }`}
                            >
                                {isEffectRunning
                                    ? `AKTİF · ${activePreset?.name ?? "Özel"}${isPresetCustomized ? " *" : ""}`
                                    : "DEVRE DIŞI"}
                            </span>
                        </div>
                        <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] mt-0.5">
                            Gerçek zamanlı Web Audio DSP motoruyla mikrofon tonunu telsiz, robot, mağara veya stüdyo sesine dönüştürün.
                        </p>
                    </div>
                </div>

                {/* Master Controls */}
                <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto shrink-0">
                    <motion.button
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={handleResetToNatural}
                        className="flex items-center gap-1.5 px-3.5 py-2 ui-control bg-[var(--bg-island)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Doğala Sıfırla</span>
                    </motion.button>

                    <motion.button
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={onEditToggleHotkey}
                        title="Efekt motorunu açıp kapatmak için kısayol tuşu ata"
                        className={`flex items-center gap-1.5 px-3 py-2 ui-control border text-xs font-mono transition-colors cursor-pointer ${
                            config.toggleHotkey
                                ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)] font-semibold"
                                : "bg-[var(--bg-island)] hover:bg-[var(--bg-card-hover)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                    >
                        <Keyboard className="w-3.5 h-3.5" />
                        <span>
                            {config.toggleHotkey
                                ? `Aç/Kapat: ${config.toggleHotkey}`
                                : "Aç/Kapat Kısayolu"}
                        </span>
                    </motion.button>

                    <div className="flex items-center gap-3 px-3.5 py-1.5 ui-control bg-[var(--bg-island)] border border-[var(--border-card)]">
                        <span className="text-xs font-semibold text-[var(--text-primary)]">
                            Efekt Motoru
                        </span>
                        <motion.button
                            type="button"
                            whileTap={{ scale: 0.92 }}
                            onClick={() => {
                                const nextEnabled = !config.enabled;
                                if (
                                    nextEnabled &&
                                    config.preset === "natural" &&
                                    config.wetMix === 0
                                ) {
                                    const fallbackPreset =
                                        VOICE_PRESETS.find(
                                            (p) => p.id === "studio",
                                        ) ?? VOICE_PRESETS[1];
                                    handleSelectPreset(fallbackPreset);
                                    return;
                                }
                                onChange({
                                    ...config,
                                    enabled: nextEnabled,
                                });
                            }}
                            aria-label="Ses değiştiriciyi aç veya kapat"
                            className={`w-10 h-6 flex items-center ui-control p-0.5 transition-colors cursor-pointer shrink-0 ${
                                config.enabled
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
                </div>
            </div>

            {/* Mic Pass-Through Status & Self-Monitor */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] as const }}
                className="app-card ui-card p-5 border border-[var(--border-card)] flex flex-col gap-4"
            >
                {!micPassThrough ? (
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 ui-inner bg-amber-950/25 border border-amber-700/50">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                            <div className="flex flex-col gap-1">
                                <span className="text-xs sm:text-sm font-semibold text-amber-200">
                                    Mikrofon Geçişi Kapalı
                                </span>
                                <p className="text-xs text-amber-200/80 leading-relaxed">
                                    Ses değiştiricinin sesinizi işleyip sanal kabloya (veya kulaklık monitörüne) aktarabilmesi için Mikrofon Geçişi açık olmalıdır.
                                </p>
                            </div>
                        </div>
                        <motion.button
                            type="button"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.96 }}
                            disabled={isStartingMic}
                            onClick={handleStartMic}
                            className="btn-accent flex items-center justify-center gap-2 px-4 py-2.5 ui-control text-xs font-semibold shrink-0 cursor-pointer disabled:opacity-60"
                        >
                            <Mic className="w-4 h-4" />
                            <span>
                                {isStartingMic
                                    ? "Bağlanıyor..."
                                    : "Mikrofon Geçişini Başlat"}
                            </span>
                        </motion.button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                        {/* Live Signal Meter */}
                        <div className="lg:col-span-7 flex flex-col gap-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                                <div className="flex items-center gap-2">
                                    <Activity
                                        className={`w-4 h-4 ${
                                            micLevel > 0
                                                ? "text-[var(--accent-text)] animate-pulse"
                                                : "text-[var(--text-muted)]"
                                        }`}
                                    />
                                    <span className="text-[var(--text-primary)] font-semibold">
                                        İşlenen Mikrofon Çıkışı
                                    </span>
                                    <span className="text-[11px] text-[var(--text-secondary)] truncate max-w-[240px]">
                                        ({micStatus.label || routingConfig.micDeviceLabel})
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {micStatus.muted && (
                                        <span className="text-red-400 bg-red-950/70 border border-red-800/60 px-2 py-0.5 ui-control text-[11px]">
                                            Windows Sessizde
                                        </span>
                                    )}
                                    <span className="text-[var(--accent-text)] font-bold tabular-nums">
                                        %{micLevel}
                                    </span>
                                </div>
                            </div>
                            <div className="w-full h-2.5 ui-control bg-[var(--bg-inner)] overflow-hidden border border-[var(--border-subtle)]">
                                <div
                                    className="h-full bg-[var(--accent)] transition-all duration-75"
                                    style={{
                                        width: `${Math.max(micLevel > 0 ? 4 : 0, micLevel)}%`,
                                    }}
                                />
                            </div>
                        </div>

                        {/* Self Monitor Toggle */}
                        <div className="lg:col-span-5 p-3.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex items-center justify-between gap-3">
                            <div className="flex items-start gap-2.5">
                                <Headphones className="w-4 h-4 text-[var(--accent-text)] shrink-0 mt-0.5" />
                                <div className="flex flex-col">
                                    <span className="text-xs font-semibold text-[var(--text-primary)]">
                                        Kendimi Dinle (Monitör)
                                    </span>
                                    <span className="text-[11px] text-[var(--text-secondary)] leading-snug mt-0.5">
                                        {isSameMonitorDevice
                                            ? "Hoparlör/birincil aygıtla aynı; yankı yapabilir."
                                            : `Sesini "${routingConfig.secondaryDeviceLabel}" üzerinden test et.`}
                                    </span>
                                </div>
                            </div>
                            <motion.button
                                type="button"
                                whileTap={{ scale: 0.92 }}
                                onClick={() =>
                                    onChange({
                                        ...config,
                                        selfMonitor: !config.selfMonitor,
                                    })
                                }
                                aria-label="Kendimi dinleme monitörünü aç veya kapat"
                                className={`w-10 h-6 flex items-center ui-control p-0.5 transition-colors cursor-pointer shrink-0 ${
                                    config.selfMonitor
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
                    </div>
                )}

                <AnimatePresence initial={false}>
                    {micPassThrough &&
                        audioEngine.isPrimaryRoutedToSpeakersOnly() && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.18 }}
                                className="overflow-hidden"
                            >
                                <div className="p-3 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs flex items-start gap-2 leading-relaxed">
                                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                                    <span>
                                        Birincil çıkış şu an{" "}
                                        <strong className="text-[var(--text-primary)]">
                                            Varsayılan Hoparlör/Kulaklık
                                        </strong>{" "}
                                        olarak görünüyor (VB-CABLE seçili değil). Kendinizi duymamanız ve yankı oluşmaması için mikrofon hoparlöre kapalı tutuluyor; kulaklıkta test için{" "}
                                        <strong className="text-[var(--text-primary)]">
                                            Kendimi Dinle
                                        </strong>{" "}
                                        anahtarını açabilir veya Discord&apos;a aktarmak için{" "}
                                        <strong className="text-[var(--text-primary)]">
                                            Ses Yönlendirme
                                        </strong>{" "}
                                        sekmesinden <strong>CABLE Input</strong> seçebilirsiniz.
                                    </span>
                                </div>
                            </motion.div>
                        )}
                </AnimatePresence>

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
            </motion.div>

            {/* Presets Grid */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.04, ease: [0.22, 1, 0.36, 1] as const }}
                className="app-card ui-card p-5 border border-[var(--border-card)] flex flex-col gap-4"
            >
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                        <Sparkles className="w-4 h-4 text-[var(--accent-text)]" />
                        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                            Hazır Ses Profilleri
                        </h2>
                    </div>
                    <span className="text-xs font-mono text-[var(--text-muted)]">
                        Tıkla veya Kısayolla Anlık Geçiş Yap
                    </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {VOICE_PRESETS.map((preset) => {
                        const isSelected = config.preset === preset.id;
                        const assignedHotkey =
                            config.presetHotkeys?.[preset.id] || "";
                        return (
                            <motion.div
                                key={preset.id}
                                role="button"
                                tabIndex={0}
                                whileHover={{ y: -2 }}
                                whileTap={{ scale: 0.985 }}
                                onClick={() => handleSelectPreset(preset)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        handleSelectPreset(preset);
                                    }
                                }}
                                className={`text-left p-4 ui-inner border transition-colors cursor-pointer flex flex-col justify-between gap-2.5 focus:outline-none focus-visible:border-[var(--accent)] ${
                                    isSelected
                                        ? "bg-[var(--accent-subtle)] border-[var(--accent-border)]"
                                        : "bg-[var(--bg-inner)] border-[var(--border-subtle)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-card-hover)]"
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2 w-full">
                                    <span
                                        className={`text-[10px] font-mono font-semibold px-2 py-0.5 ui-control border ${
                                            isSelected
                                                ? "bg-[var(--bg-card)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                                : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-muted)]"
                                        }`}
                                    >
                                        {preset.badge}
                                    </span>

                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEditPresetHotkey(preset);
                                            }}
                                            title="Bu ses efektine kısayol tuşu ata"
                                            className={`flex items-center gap-1 px-2 py-0.5 ui-control text-[10px] font-mono border transition-colors cursor-pointer ${
                                                assignedHotkey
                                                    ? "bg-[var(--bg-card)] border-[var(--accent-border)] text-[var(--accent-text)] font-semibold hover:brightness-110"
                                                    : "bg-[var(--bg-card)] border-dashed border-[var(--border-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                            }`}
                                        >
                                            <Keyboard className="w-2.5 h-2.5" />
                                            <span>
                                                {assignedHotkey || "+ Kısayol"}
                                            </span>
                                        </button>

                                        {isSelected && (
                                            <span className="w-5 h-5 ui-control bg-[var(--accent)] text-[var(--btn-primary-text)] flex items-center justify-center shrink-0">
                                                <Check className="w-3 h-3" />
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs sm:text-[13px] font-semibold text-[var(--text-primary)]">
                                        {preset.name}
                                    </div>
                                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed mt-1">
                                        {preset.subtitle}
                                    </p>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </motion.div>

            {/* Fine-Tuning DSP Controls */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.08, ease: [0.22, 1, 0.36, 1] as const }}
                className="app-card ui-card p-5 border border-[var(--border-card)] flex flex-col gap-4"
            >
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                        <Sliders className="w-4 h-4 text-[var(--accent-text)]" />
                        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                            İnce Ayarlar (Gerçek Zamanlı DSP Parametreleri)
                        </h2>
                    </div>
                    <span className="text-xs text-[var(--text-secondary)]">
                        Herhangi bir kaydırıcıyı oynattığınızda efekt otomatik aktifleşir
                    </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Block 1: EQ & Filters */}
                    <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-3.5">
                        <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
                            <Waves className="w-4 h-4 text-[var(--accent-text)]" />
                            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                                Frekans Bandı &amp; Ekolayzer
                            </h3>
                        </div>

                        <SliderRow
                            label="Alt Frekans Kesimi (High-Pass)"
                            valueText={`${Math.round(config.highpassHz)} Hz`}
                            value={config.highpassHz}
                            min={20}
                            max={1200}
                            step={10}
                            onChange={(v) => updateParam("highpassHz", v)}
                        />
                        <SliderRow
                            label="Üst Frekans Kesimi (Low-Pass)"
                            valueText={`${Math.round(config.lowpassHz)} Hz`}
                            value={config.lowpassHz}
                            min={800}
                            max={20000}
                            step={100}
                            onChange={(v) => updateParam("lowpassHz", v)}
                        />
                        <SliderRow
                            label="Bas / Tokluk (140 Hz)"
                            valueText={`${config.bassBoostDb > 0 ? "+" : ""}${config.bassBoostDb.toFixed(1)} dB`}
                            value={config.bassBoostDb}
                            min={-12}
                            max={14}
                            step={0.5}
                            onChange={(v) => updateParam("bassBoostDb", v)}
                        />
                        <SliderRow
                            label="Vokal Netliği (2.4 kHz)"
                            valueText={`${config.clarityBoostDb > 0 ? "+" : ""}${config.clarityBoostDb.toFixed(1)} dB`}
                            value={config.clarityBoostDb}
                            min={-6}
                            max={12}
                            step={0.5}
                            onChange={(v) => updateParam("clarityBoostDb", v)}
                        />
                    </div>

                    {/* Block 2: Pitch, Saturation & Ring Mod */}
                    <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-3.5">
                        <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
                            <AudioWaveform className="w-4 h-4 text-[var(--accent-text)]" />
                            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                                Ses Perdesi (Pitch), Doygunluk &amp; Modülasyon
                            </h3>
                        </div>

                        <SliderRow
                            label="Ses Perdesi (İnce / Kalın)"
                            valueText={
                                (config.pitchSemitones ?? 0) === 0
                                    ? "Doğal (0)"
                                    : `${(config.pitchSemitones ?? 0) > 0 ? "+" : ""}${(config.pitchSemitones ?? 0).toFixed(1)} yarım ton`
                            }
                            value={config.pitchSemitones ?? 0}
                            min={-12}
                            max={12}
                            step={0.5}
                            onChange={(v) => updateParam("pitchSemitones", v)}
                        />
                        <SliderRow
                            label="Doygunluk / Telsiz Kirliliği"
                            valueText={`%${Math.round(config.distortionAmount)}`}
                            value={config.distortionAmount}
                            min={0}
                            max={100}
                            step={1}
                            onChange={(v) => updateParam("distortionAmount", v)}
                        />
                        <SliderRow
                            label="Halka Modülasyon Frekansı"
                            valueText={
                                config.ringModHz > 0
                                    ? `${Math.round(config.ringModHz)} Hz`
                                    : "Kapalı"
                            }
                            value={config.ringModHz}
                            min={0}
                            max={160}
                            step={1}
                            onChange={(v) => updateParam("ringModHz", v)}
                        />
                        <SliderRow
                            label="Robotik Modülasyon Oranı"
                            valueText={`%${Math.round(config.ringModMix * 100)}`}
                            value={Math.round(config.ringModMix * 100)}
                            min={0}
                            max={100}
                            step={1}
                            onChange={(v) => updateParam("ringModMix", v / 100)}
                        />
                    </div>

                    {/* Block 3: Echo & Reverb */}
                    <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-3.5">
                        <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
                            <Volume2 className="w-4 h-4 text-[var(--accent-text)]" />
                            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                                Yankı &amp; Oda Akustiği
                            </h3>
                        </div>

                        <SliderRow
                            label="Yankı Gecikmesi (Echo)"
                            valueText={`${Math.round(config.echoDelayMs)} ms`}
                            value={config.echoDelayMs}
                            min={0}
                            max={450}
                            step={5}
                            onChange={(v) => updateParam("echoDelayMs", v)}
                        />
                        <SliderRow
                            label="Yankı Geri Beslemesi"
                            valueText={`%${Math.round(config.echoFeedback * 100)}`}
                            value={Math.round(config.echoFeedback * 100)}
                            min={0}
                            max={72}
                            step={1}
                            onChange={(v) => updateParam("echoFeedback", v / 100)}
                        />
                        <SliderRow
                            label="Yankı Seviyesi"
                            valueText={`%${Math.round(config.echoMix * 100)}`}
                            value={Math.round(config.echoMix * 100)}
                            min={0}
                            max={85}
                            step={1}
                            onChange={(v) => updateParam("echoMix", v / 100)}
                        />
                        <SliderRow
                            label="Oda / Mağara Yankısı (Reverb)"
                            valueText={`%${Math.round(config.reverbMix * 100)}`}
                            value={Math.round(config.reverbMix * 100)}
                            min={0}
                            max={85}
                            step={1}
                            onChange={(v) => updateParam("reverbMix", v / 100)}
                        />
                    </div>

                    {/* Block 4: Master Wet/Dry Mix & Info */}
                    <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col justify-between gap-4">
                        <div className="flex flex-col gap-3.5">
                            <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
                                <Sparkles className="w-4 h-4 text-[var(--accent-text)]" />
                                <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                                    Genel Efekt Miksajı (Wet / Dry)
                                </h3>
                            </div>

                            <SliderRow
                                label="Efekt Yoğunluğu (Wet Mix)"
                                valueText={`%${Math.round(config.wetMix * 100)}`}
                                value={Math.round(config.wetMix * 100)}
                                min={0}
                                max={100}
                                step={1}
                                onChange={(v) =>
                                    onChange({
                                        ...config,
                                        enabled: v > 0,
                                        wetMix: v / 100,
                                    })
                                }
                            />
                        </div>

                        <div className="p-3 ui-inner bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] leading-relaxed">
                            <strong className="text-[var(--text-primary)]">İpucu:</strong>{" "}
                            Efekt yoğunluğu ham sesinizle işlenmiş ses arasındaki karışımı belirler. Ses efekti oynatırken{" "}
                            <span className="text-[var(--accent-text)] font-medium">
                                Yankı Önleyici
                            </span>{" "}
                            aktifse mikrofonunuz otomatik kısılır.
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
