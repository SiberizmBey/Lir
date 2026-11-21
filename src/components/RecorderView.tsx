import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
    Mic,
    Square,
    Play,
    Pause,
    Check,
    AlertCircle,
    Trash2,
    Download,
    Sparkles,
    Volume2,
    AudioWaveform,
    Plus,
    X,
    Clock,
} from "lucide-react";
import {
    AudioRoutingConfig,
    SavedRecording,
    SoundItem,
    VoiceChangerConfig,
} from "../types/sound";
import { audioEngine } from "../utils/audioEngine";
import { VOICE_PRESETS } from "../utils/voicePresets";
import {
    deleteSavedRecording,
    getAllSavedRecordings,
    putSavedRecording,
} from "../utils/recordingStorage";

interface RecorderViewProps {
    onAddRecordedSound: (sound: Omit<SoundItem, "id" | "addedAt">) => void;
    routingConfig: AudioRoutingConfig;
    voiceChangerConfig: VoiceChangerConfig;
    onOpenVoiceChanger?: () => void;
}

const formatDurationClock = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds % 1) * 10);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
};

const formatTimestamp = (ts: number) => {
    try {
        return new Date(ts).toLocaleString("tr-TR", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return "";
    }
};

export function RecorderView({
    onAddRecordedSound,
    routingConfig,
    voiceChangerConfig,
    onOpenVoiceChanger,
}: RecorderViewProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [includeVoiceEffects, setIncludeVoiceEffects] = useState(true);
    const [activeMicLabel, setActiveMicLabel] = useState<string>("");
    const [peakLevel, setPeakLevel] = useState(0);
    const [micError, setMicError] = useState<string | null>(null);

    const [savedRecordings, setSavedRecordings] = useState<SavedRecording[]>([]);
    const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [playProgress, setPlayProgress] = useState(0);
    const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
    const [isConfirmClearAll, setIsConfirmClearAll] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordingCleanupRef = useRef<(() => void) | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const previewAudioCtxRef = useRef<AudioContext | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<number | null>(null);
    const startWallClockRef = useRef<number>(0);
    const accumulatedMsRef = useRef<number>(0);
    const discardNextRef = useRef<boolean>(false);
    const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number | null>(null);

    const activePreset = useMemo(
        () => VOICE_PRESETS.find((p) => p.id === voiceChangerConfig.preset),
        [voiceChangerConfig.preset],
    );

    const isVoiceEffectReady =
        voiceChangerConfig.enabled && voiceChangerConfig.wetMix > 0;
    const willRecordWithEffect = includeVoiceEffects && isVoiceEffectReady;

    // Load saved recordings from IndexedDB
    useEffect(() => {
        let mounted = true;
        getAllSavedRecordings()
            .then((items) => {
                if (mounted) {
                    setSavedRecordings(items);
                }
            })
            .catch((err) => {
                console.warn("Kayıt geçmişi yüklenemedi:", err);
            })
            .finally(() => {
                if (mounted) setIsLoadingLibrary(false);
            });

        return () => {
            mounted = false;
        };
    }, []);

    const stopPlayback = useCallback(() => {
        if (audioPreviewRef.current) {
            try {
                audioPreviewRef.current.pause();
                audioPreviewRef.current.src = "";
            } catch { }
            audioPreviewRef.current = null;
        }
        if (previewAudioCtxRef.current) {
            try {
                void previewAudioCtxRef.current.close();
            } catch { }
            previewAudioCtxRef.current = null;
        }
        if (!isRecording) {
            analyserRef.current = null;
            setPeakLevel(0);
        }
        setPlayingId(null);
        setPlayProgress(0);
    }, [isRecording]);

    // Clean up on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            discardNextRef.current = true;
            if (
                mediaRecorderRef.current &&
                mediaRecorderRef.current.state !== "inactive"
            ) {
                try {
                    mediaRecorderRef.current.stop();
                } catch { }
            }
            recordingCleanupRef.current?.();
            recordingCleanupRef.current = null;
            if (audioPreviewRef.current) {
                try {
                    audioPreviewRef.current.pause();
                } catch { }
            }
            if (previewAudioCtxRef.current) {
                try {
                    void previewAudioCtxRef.current.close();
                } catch { }
            }
        };
    }, []);

    // Real-time 60fps Frequency Spectrum Renderer
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const barCount = 56;
        const smoothedBars = new Float32Array(barCount);
        const peakHoldBars = new Float32Array(barCount);

        let lastUiPeakUpdate = 0;

        const drawFrame = (timestamp: number) => {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            const targetWidth = Math.max(1, Math.floor(rect.width * dpr));
            const targetHeight = Math.max(1, Math.floor(rect.height * dpr));

            if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
                canvas.width = targetWidth;
                canvas.height = targetHeight;
            }

            ctx.clearRect(0, 0, targetWidth, targetHeight);

            const styles = getComputedStyle(document.documentElement);
            const accentColor =
                styles.getPropertyValue("--accent").trim() || "#22c55e";
            const accentText =
                styles.getPropertyValue("--accent-text").trim() || "#4ade80";
            const subtleBorder =
                styles.getPropertyValue("--border-subtle").trim() ||
                "rgba(255,255,255,0.08)";

            const analyser = analyserRef.current;
            let frameMax = 0;

            if (analyser && !(isRecording && isPaused)) {
                const bins = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(bins);
                // Focus mostly on voice frequency range (lower 70% of FFT bins)
                const usableBins = Math.max(barCount, Math.floor(bins.length * 0.72));
                const step = usableBins / barCount;

                for (let i = 0; i < barCount; i++) {
                    const start = Math.floor(i * step);
                    const end = Math.max(start + 1, Math.floor((i + 1) * step));
                    let sum = 0;
                    for (let j = start; j < end && j < bins.length; j++) {
                        sum += bins[j];
                    }
                    const raw = sum / (end - start) / 255;
                    if (raw > frameMax) frameMax = raw;

                    smoothedBars[i] =
                        raw > smoothedBars[i]
                            ? smoothedBars[i] * 0.35 + raw * 0.65
                            : smoothedBars[i] * 0.84 + raw * 0.16;

                    if (smoothedBars[i] > peakHoldBars[i]) {
                        peakHoldBars[i] = smoothedBars[i];
                    } else {
                        peakHoldBars[i] = Math.max(0, peakHoldBars[i] - 0.012);
                    }
                }
            } else {
                for (let i = 0; i < barCount; i++) {
                    smoothedBars[i] *= 0.82;
                    peakHoldBars[i] *= 0.85;
                }
            }

            if (timestamp - lastUiPeakUpdate > 65) {
                lastUiPeakUpdate = timestamp;
                setPeakLevel(Math.round(Math.min(1, frameMax * 1.15) * 100));
            }

            // Center reference line
            const midY = targetHeight / 2;
            ctx.fillStyle = subtleBorder;
            ctx.fillRect(0, midY - dpr * 0.5, targetWidth, dpr);

            // Draw symmetric spectrum bars
            const padX = 12 * dpr;
            const usableW = Math.max(10, targetWidth - padX * 2);
            const slotW = usableW / barCount;
            const barW = Math.max(2 * dpr, slotW * 0.62);
            const maxBarHalfH = targetHeight * 0.43;

            for (let i = 0; i < barCount; i++) {
                const level = smoothedBars[i];
                const barHalfH = Math.max(2 * dpr, level * maxBarHalfH);
                const x = padX + i * slotW + (slotW - barW) / 2;

                ctx.fillStyle =
                    isRecording && !isPaused
                        ? level > 0.55
                            ? accentText
                            : accentColor
                        : playingId
                          ? accentText
                          : subtleBorder;

                ctx.beginPath();
                if (typeof ctx.roundRect === "function") {
                    ctx.roundRect(
                        x,
                        midY - barHalfH,
                        barW,
                        barHalfH * 2,
                        barW / 2,
                    );
                } else {
                    ctx.rect(x, midY - barHalfH, barW, barHalfH * 2);
                }
                ctx.fill();

                // Peak caps when active
                const peak = peakHoldBars[i];
                if (peak > 0.08 && (isRecording || playingId)) {
                    const capY = midY - peak * maxBarHalfH - 3 * dpr;
                    ctx.fillStyle = accentText;
                    ctx.fillRect(x, Math.max(2 * dpr, capY), barW, 1.5 * dpr);
                }
            }

            rafRef.current = requestAnimationFrame(drawFrame);
        };

        rafRef.current = requestAnimationFrame(drawFrame);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [isRecording, isPaused, playingId]);

    const startRecording = async () => {
        setMicError(null);
        stopPlayback();
        discardNextRef.current = false;

        try {
            const session = await audioEngine.acquireRecordingSession(
                routingConfig.micDeviceId,
                includeVoiceEffects,
            );
            recordingCleanupRef.current = session.cleanup;
            analyserRef.current = session.analyser;
            setActiveMicLabel(session.micLabel);

            const preferredMime = MediaRecorder.isTypeSupported(
                "audio/webm;codecs=opus",
            )
                ? "audio/webm;codecs=opus"
                : MediaRecorder.isTypeSupported("audio/webm")
                  ? "audio/webm"
                  : "";

            const mediaRecorder = preferredMime
                ? new MediaRecorder(session.stream, { mimeType: preferredMime })
                : new MediaRecorder(session.stream);

            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            const capturedEffectName = willRecordWithEffect
                ? activePreset?.name || "Özel Efekt"
                : undefined;

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const shouldDiscard = discardNextRef.current;
                const finalDurationSec = Math.max(
                    0.4,
                    accumulatedMsRef.current / 1000,
                );
                const chunks = [...audioChunksRef.current];

                recordingCleanupRef.current?.();
                recordingCleanupRef.current = null;
                analyserRef.current = null;
                setPeakLevel(0);
                setIsRecording(false);
                setIsPaused(false);
                setRecordingTime(0);

                if (shouldDiscard || chunks.length === 0) return;

                const audioBlob = new Blob(chunks, {
                    type: preferredMime || "audio/webm",
                });
                const reader = new FileReader();
                reader.onloadend = async () => {
                    const dataUrl = reader.result;
                    if (typeof dataUrl !== "string") return;

                    const now = Date.now();
                    const nextNum = savedRecordings.length + 1;
                    const newRec: SavedRecording = {
                        id: `rec-${now}-${Math.random().toString(36).slice(2, 6)}`,
                        title: capturedEffectName
                            ? `${capturedEffectName} Kaydı #${nextNum}`
                            : `Mikrofon Kaydı #${nextNum}`,
                        hotkey: `F${((nextNum - 1) % 4) + 9}`,
                        duration: Number(finalDurationSec.toFixed(1)),
                        createdAt: now,
                        dataUrl,
                        effectName: capturedEffectName,
                        addedToSoundboard: false,
                    };

                    try {
                        await putSavedRecording(newRec);
                    } catch (err) {
                        console.warn("Kayıt veritabanına yazılamadı:", err);
                    }
                    setSavedRecordings((prev) => [newRec, ...prev]);
                };
                reader.readAsDataURL(audioBlob);
            };

            accumulatedMsRef.current = 0;
            startWallClockRef.current = performance.now();
            setRecordingTime(0);
            setIsPaused(false);
            setIsRecording(true);

            mediaRecorder.start(100);

            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = window.setInterval(() => {
                const elapsed =
                    accumulatedMsRef.current +
                    (performance.now() - startWallClockRef.current);
                setRecordingTime(elapsed / 1000);
            }, 60);
        } catch (err) {
            console.error("Mikrofon kayıt hatası:", err);
            recordingCleanupRef.current?.();
            recordingCleanupRef.current = null;
            analyserRef.current = null;
            setMicError(
                err instanceof Error
                    ? err.message
                    : "Mikrofona erişilemedi. Lütfen mikrofon izinlerini kontrol edin.",
            );
        }
    };

    const togglePauseRecording = () => {
        const recorder = mediaRecorderRef.current;
        if (!recorder || !isRecording) return;

        if (!isPaused && recorder.state === "recording") {
            recorder.pause();
            accumulatedMsRef.current +=
                performance.now() - startWallClockRef.current;
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            setIsPaused(true);
        } else if (isPaused && recorder.state === "paused") {
            startWallClockRef.current = performance.now();
            recorder.resume();
            timerRef.current = window.setInterval(() => {
                const elapsed =
                    accumulatedMsRef.current +
                    (performance.now() - startWallClockRef.current);
                setRecordingTime(elapsed / 1000);
            }, 60);
            setIsPaused(false);
        }
    };

    const finishRecording = (discard: boolean = false) => {
        discardNextRef.current = discard;
        if (!isPaused) {
            accumulatedMsRef.current +=
                performance.now() - startWallClockRef.current;
        }
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (
            mediaRecorderRef.current &&
            mediaRecorderRef.current.state !== "inactive"
        ) {
            mediaRecorderRef.current.stop();
        }
    };

    const handlePlayRecording = async (rec: SavedRecording) => {
        if (isRecording) return;
        if (playingId === rec.id) {
            stopPlayback();
            return;
        }

        stopPlayback();

        try {
            const audio = new Audio(rec.dataUrl);
            audioPreviewRef.current = audio;
            setPlayingId(rec.id);
            setPlayProgress(0);

            // Hook preview playback into live spectrum canvas
            try {
                const AudioCtx =
                    window.AudioContext ||
                    (window as unknown as {
                        webkitAudioContext: typeof AudioContext;
                    }).webkitAudioContext;
                const ctx = new AudioCtx();
                previewAudioCtxRef.current = ctx;
                const src = ctx.createMediaElementSource(audio);
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 256;
                analyser.smoothingTimeConstant = 0.72;
                src.connect(analyser);
                analyser.connect(ctx.destination);
                analyserRef.current = analyser;
            } catch {
                // fallback: playback still runs without spectrum tap
            }

            audio.ontimeupdate = () => {
                const dur =
                    Number.isFinite(audio.duration) && audio.duration > 0
                        ? audio.duration
                        : rec.duration;
                if (dur > 0) {
                    setPlayProgress(
                        Math.min(100, (audio.currentTime / dur) * 100),
                    );
                }
            };
            audio.onended = () => {
                stopPlayback();
            };
            audio.onerror = () => {
                stopPlayback();
            };

            await audio.play();
        } catch (err) {
            console.warn("Kayıt oynatma hatası:", err);
            stopPlayback();
        }
    };

    const handleUpdateRecording = async (
        id: string,
        patch: Partial<SavedRecording>,
    ) => {
        const target = savedRecordings.find((item) => item.id === id);
        if (!target) return;
        const updatedItem: SavedRecording = { ...target, ...patch };
        setSavedRecordings((prev) =>
            prev.map((item) => (item.id === id ? updatedItem : item)),
        );
        try {
            await putSavedRecording(updatedItem);
        } catch (err) {
            console.warn("Kayıt güncellenemedi:", err);
        }
    };

    const handleDeleteRecording = async (id: string) => {
        if (playingId === id) {
            stopPlayback();
        }
        setSavedRecordings((prev) => prev.filter((r) => r.id !== id));
        try {
            await deleteSavedRecording(id);
        } catch (err) {
            console.warn("Kayıt silinemedi:", err);
        }
    };

    const handleClearAllRecordings = async () => {
        stopPlayback();
        const ids = savedRecordings.map((r) => r.id);
        setSavedRecordings([]);
        setIsConfirmClearAll(false);
        await Promise.all(ids.map((id) => deleteSavedRecording(id).catch(() => {})));
    };

    const handleAddToSoundboard = async (rec: SavedRecording) => {
        onAddRecordedSound({
            title: rec.title.trim() || "Mikrofon Kaydı",
            category: "Özel",
            hotkey: rec.hotkey.trim().toUpperCase() || "F9",
            duration: Math.max(0.5, rec.duration),
            volume: 1.0,
            isFavorite: false,
            loop: false,
            playMode: "overlap",
            dataUrl: rec.dataUrl,
        });
        await handleUpdateRecording(rec.id, { addedToSoundboard: true });
        setRecentlyAddedId(rec.id);
        setTimeout(() => {
            setRecentlyAddedId((curr) => (curr === rec.id ? null : curr));
        }, 1800);
    };

    const handleDownloadRecording = (rec: SavedRecording) => {
        const a = document.createElement("a");
        a.href = rec.dataUrl;
        const safeName = (rec.title.trim() || "kayit")
            .toLowerCase()
            .replace(/[^a-z0-9çğıöşü_-]+/gi, "-");
        a.download = `${safeName}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div className="flex-1 flex flex-col gap-6 w-full">
            {/* Page Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 ui-inner bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
                        <Mic className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                                Mikrofon Kaydedici
                            </h1>
                            <span
                                className={`text-xs font-mono border px-2.5 py-0.5 ui-control font-semibold ${
                                    isRecording
                                        ? isPaused
                                            ? "border-amber-700/70 bg-amber-950/40 text-amber-300"
                                            : "border-rose-700 bg-rose-950/50 text-rose-300"
                                        : "border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--accent-text)]"
                                }`}
                            >
                                {isRecording
                                    ? isPaused
                                        ? "DURAKLATILDI"
                                        : "KAYITTA"
                                    : `${savedRecordings.length} KAYIT`}
                            </span>
                        </div>
                        <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] mt-0.5">
                            Canlı ses spektrumuyla kayıt alın, aktif ses değiştirici efektlerini kayda işleyin ve dilediğiniz zaman Soundboard&apos;a ekleyin.
                        </p>
                    </div>
                </div>

                {/* Voice Effect Integration Switch */}
                <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto shrink-0">
                    {onOpenVoiceChanger && (
                        <motion.button
                            type="button"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={onOpenVoiceChanger}
                            className={`flex items-center gap-1.5 px-3 py-2 ui-control border text-xs font-medium transition-colors cursor-pointer ${
                                isVoiceEffectReady
                                    ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                    : "bg-[var(--bg-island)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            }`}
                        >
                            <AudioWaveform className="w-3.5 h-3.5" />
                            <span>
                                {isVoiceEffectReady
                                    ? `Efekt: ${activePreset?.name ?? "Özel"}`
                                    : "Ses Değiştirici Kapalı"}
                            </span>
                        </motion.button>
                    )}

                    <div className="flex items-center gap-2.5 px-3.5 py-1.5 ui-control bg-[var(--bg-island)] border border-[var(--border-card)]">
                        <span className="text-xs font-medium text-[var(--text-primary)]">
                            Kayda Efekti Uygula
                        </span>
                        <motion.button
                            type="button"
                            disabled={isRecording}
                            whileTap={{ scale: 0.92 }}
                            onClick={() =>
                                setIncludeVoiceEffects((prev) => !prev)
                            }
                            aria-label="Kayda aktif ses efektlerini uygula"
                            className={`w-10 h-6 flex items-center ui-control p-0.5 transition-colors cursor-pointer shrink-0 disabled:opacity-50 ${
                                includeVoiceEffects
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

            {/* Error Banner */}
            <AnimatePresence initial={false}>
                {micError && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="p-3.5 ui-inner bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                                <span>{micError}</span>
                            </div>
                            <motion.button
                                type="button"
                                whileTap={{ scale: 0.94 }}
                                onClick={() => setMicError(null)}
                                className="text-rose-300 hover:text-white text-xs px-3 py-1 ui-control bg-rose-900/50 hover:bg-rose-900 transition-colors cursor-pointer"
                            >
                                Kapat
                            </motion.button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Studio Recording Deck */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] as const }}
                className="app-card ui-card card-ambient-glow p-5 sm:p-6 border border-[var(--border-card)] flex flex-col gap-5"
            >
                {/* Deck Top Telemetry */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="flex items-center gap-1.5 px-3 py-1 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                            <Mic className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                            <span className="truncate max-w-[220px] text-[var(--text-primary)] font-medium">
                                {activeMicLabel ||
                                    routingConfig.micDeviceLabel ||
                                    "Varsayılan Mikrofon"}
                            </span>
                        </span>

                        {willRecordWithEffect ? (
                            <span className="flex items-center gap-1.5 px-3 py-1 ui-control bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] font-medium">
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>
                                    İşlenmiş Kayıt:{" "}
                                    {activePreset?.name ?? "Özel Efekt"}
                                </span>
                            </span>
                        ) : (
                            <span className="px-3 py-1 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                                {isVoiceEffectReady && !includeVoiceEffects
                                    ? "Ham Mikrofon (Efekt Hariç)"
                                    : "Doğal Temiz Kayıt"}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-[var(--text-secondary)] tabular-nums">
                            Pik:{" "}
                            <strong className="text-[var(--accent-text)]">
                                %{peakLevel}
                            </strong>
                        </span>
                        <span className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">
                            {formatDurationClock(recordingTime)}
                        </span>
                    </div>
                </div>

                {/* Live Spectrum Canvas */}
                <div className="relative h-36 sm:h-44 w-full ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] overflow-hidden flex items-center justify-center">
                    <canvas
                        ref={canvasRef}
                        className="w-full h-full block"
                    />
                    {!isRecording && !playingId && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <span className="px-3.5 py-1.5 ui-control bg-[var(--bg-card)]/85 border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-muted)]">
                                Kayda başladığınızda ses spektrumu burada canlı görünür
                            </span>
                        </div>
                    )}
                </div>

                {/* Transport Controls */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-[var(--text-secondary)]">
                        {isRecording
                            ? isPaused
                                ? "Kayıt duraklatıldı — devam edebilir veya kaydedip bitirebilirsiniz."
                                : willRecordWithEffect
                                  ? "Sesiniz aktif efekt zincirinden geçerek kaydediliyor..."
                                  : "Mikrofonunuz doğrudan kaydediliyor..."
                            : "Kayıt tamamlandığında aşağıdaki Kaydedilen Sesler listesine eklenir."}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        {!isRecording ? (
                            <motion.button
                                type="button"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.95 }}
                                transition={{
                                    type: "spring",
                                    stiffness: 450,
                                    damping: 28,
                                }}
                                onClick={startRecording}
                                className="btn-accent flex items-center gap-2 px-5 py-2.5 ui-control text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                            >
                                <Mic className="w-4 h-4" />
                                <span>Kaydı Başlat</span>
                            </motion.button>
                        ) : (
                            <>
                                <motion.button
                                    type="button"
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => finishRecording(true)}
                                    className="flex items-center gap-1.5 px-4 py-2.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                    <span>İptal</span>
                                </motion.button>

                                <motion.button
                                    type="button"
                                    whileTap={{ scale: 0.95 }}
                                    onClick={togglePauseRecording}
                                    className="flex items-center gap-1.5 px-4 py-2.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-card)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
                                >
                                    {isPaused ? (
                                        <>
                                            <Play className="w-3.5 h-3.5 fill-current text-[var(--accent-text)]" />
                                            <span>Devam Et</span>
                                        </>
                                    ) : (
                                        <>
                                            <Pause className="w-3.5 h-3.5 text-amber-400" />
                                            <span>Duraklat</span>
                                        </>
                                    )}
                                </motion.button>

                                <motion.button
                                    type="button"
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => finishRecording(false)}
                                    className="flex items-center gap-2 px-5 py-2.5 ui-control bg-rose-600 hover:bg-rose-500 text-white keep-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                                >
                                    <Square className="w-3.5 h-3.5 fill-current" />
                                    <span>Durdur ve Kaydet</span>
                                </motion.button>
                            </>
                        )}
                    </div>
                </div>
            </motion.div>

            {/* Saved Recordings Library */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                    duration: 0.25,
                    delay: 0.05,
                    ease: [0.22, 1, 0.36, 1] as const,
                }}
                className="app-card ui-card p-5 border border-[var(--border-card)] flex flex-col gap-4"
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <Volume2 className="w-4 h-4 text-[var(--accent-text)]" />
                        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                            Kaydedilen Sesler
                        </h2>
                        <span className="text-[11px] font-mono px-2 py-0.5 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                            {savedRecordings.length}
                        </span>
                    </div>

                    {savedRecordings.length > 0 && (
                        <div className="flex items-center gap-2">
                            {isConfirmClearAll ? (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-rose-300">
                                        Tümünü sil?
                                    </span>
                                    <button
                                        type="button"
                                        onClick={handleClearAllRecordings}
                                        className="px-2.5 py-1 ui-control bg-rose-600 hover:bg-rose-500 text-white keep-white text-xs font-semibold cursor-pointer"
                                    >
                                        Evet, Sil
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setIsConfirmClearAll(false)
                                        }
                                        className="px-2.5 py-1 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] cursor-pointer"
                                    >
                                        Vazgeç
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setIsConfirmClearAll(true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-[var(--bg-inner)] hover:bg-rose-950/40 border border-[var(--border-subtle)] hover:border-rose-800/60 text-xs text-[var(--text-secondary)] hover:text-rose-300 transition-colors cursor-pointer"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Geçmişi Temizle</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {isLoadingLibrary ? (
                    <div className="p-8 text-center text-xs text-[var(--text-muted)] font-mono">
                        Kayıtlar yükleniyor...
                    </div>
                ) : savedRecordings.length === 0 ? (
                    <div className="p-8 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col items-center justify-center text-center gap-2">
                        <div className="w-10 h-10 ui-inner bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)]">
                            <Mic className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-medium text-[var(--text-primary)]">
                            Henüz kaydedilmiş bir ses yok
                        </p>
                        <p className="text-xs text-[var(--text-secondary)] max-w-md">
                            Yukarıdan kayıt aldığınızda sesler burada saklanır; istediğiniz zaman dinleyebilir, silebilir veya Soundboard&apos;a ekleyebilirsiniz.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                        <AnimatePresence mode="popLayout">
                            {savedRecordings.map((rec) => {
                                const isPlayingThis = playingId === rec.id;
                                const isJustAdded = recentlyAddedId === rec.id;

                                return (
                                    <motion.div
                                        key={rec.id}
                                        layout
                                        initial={{ opacity: 0, scale: 0.97 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ duration: 0.18 }}
                                        className={`p-4 ui-inner bg-[var(--bg-inner)] border flex flex-col gap-3 transition-colors ${
                                            isPlayingThis
                                                ? "border-[var(--accent-border)]"
                                                : "border-[var(--border-subtle)] hover:border-[var(--border-hover)]"
                                        }`}
                                    >
                                        {/* Top Row: Play + Editable Title + Metadata */}
                                        <div className="flex items-start gap-3">
                                            <motion.button
                                                type="button"
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() =>
                                                    handlePlayRecording(rec)
                                                }
                                                disabled={isRecording}
                                                title={
                                                    isPlayingThis
                                                        ? "Durdur"
                                                        : "Dinle"
                                                }
                                                className={`w-10 h-10 ui-control flex items-center justify-center shrink-0 border transition-colors cursor-pointer disabled:opacity-40 ${
                                                    isPlayingThis
                                                        ? "btn-accent border-transparent"
                                                        : "bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border-[var(--border-card)] text-[var(--accent-text)]"
                                                }`}
                                            >
                                                {isPlayingThis ? (
                                                    <Square className="w-3.5 h-3.5 fill-current" />
                                                ) : (
                                                    <Play className="w-4 h-4 fill-current ml-0.5" />
                                                )}
                                            </motion.button>

                                            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                                                <input
                                                    type="text"
                                                    value={rec.title}
                                                    onChange={(e) =>
                                                        void handleUpdateRecording(
                                                            rec.id,
                                                            {
                                                                title: e.target
                                                                    .value,
                                                            },
                                                        )
                                                    }
                                                    aria-label="Kayıt başlığı"
                                                    className="w-full bg-transparent text-xs sm:text-sm font-semibold text-[var(--text-primary)] border-b border-transparent focus:border-[var(--accent)] focus:outline-none pb-0.5 truncate"
                                                />

                                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-[var(--text-muted)]">
                                                    <span className="flex items-center gap-1 text-[var(--text-secondary)]">
                                                        <Clock className="w-3 h-3" />
                                                        {rec.duration.toFixed(1)}s
                                                    </span>
                                                    <span>·</span>
                                                    <span>
                                                        {formatTimestamp(
                                                            rec.createdAt,
                                                        )}
                                                    </span>
                                                    {rec.effectName && (
                                                        <span className="px-1.5 py-0.2 ui-control bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)]">
                                                            {rec.effectName}
                                                        </span>
                                                    )}
                                                    {rec.addedToSoundboard && (
                                                        <span className="px-1.5 py-0.2 ui-control bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                                                            Soundboard&apos;da
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Playback Progress Bar */}
                                        <div className="w-full h-1.5 ui-control bg-[var(--bg-card)] overflow-hidden">
                                            <div
                                                className="h-full bg-[var(--accent)] transition-all duration-100"
                                                style={{
                                                    width: `${isPlayingThis ? playProgress : 0}%`,
                                                }}
                                            />
                                        </div>

                                        {/* Action Bar: Hotkey + Add + Download + Delete */}
                                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[11px] text-[var(--text-muted)]">
                                                    Kısayol:
                                                </span>
                                                <input
                                                    type="text"
                                                    value={rec.hotkey}
                                                    onChange={(e) =>
                                                        void handleUpdateRecording(
                                                            rec.id,
                                                            {
                                                                hotkey: e.target.value.toUpperCase(),
                                                            },
                                                        )
                                                    }
                                                    maxLength={12}
                                                    className="w-20 px-2 py-1 ui-input bg-[var(--bg-input)] border border-[var(--border-input)] text-xs font-mono text-center text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                                                />
                                            </div>

                                            <div className="flex items-center gap-1.5">
                                                <motion.button
                                                    type="button"
                                                    whileTap={{ scale: 0.94 }}
                                                    onClick={() =>
                                                        handleDownloadRecording(
                                                            rec,
                                                        )
                                                    }
                                                    title="Bilgisayara İndir (.webm)"
                                                    className="p-2 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                                >
                                                    <Download className="w-3.5 h-3.5" />
                                                </motion.button>

                                                <motion.button
                                                    type="button"
                                                    whileTap={{ scale: 0.94 }}
                                                    onClick={() =>
                                                        void handleDeleteRecording(
                                                            rec.id,
                                                        )
                                                    }
                                                    title="Kaydı Sil"
                                                    className="p-2 ui-control bg-[var(--bg-card)] hover:bg-rose-950/50 border border-[var(--border-subtle)] hover:border-rose-800/60 text-[var(--text-secondary)] hover:text-rose-300 transition-colors cursor-pointer"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </motion.button>

                                                <motion.button
                                                    type="button"
                                                    whileHover={{ scale: 1.02 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() =>
                                                        void handleAddToSoundboard(
                                                            rec,
                                                        )
                                                    }
                                                    className="btn-accent flex items-center gap-1.5 px-3 py-1.5 ui-control text-xs font-semibold transition-colors cursor-pointer"
                                                >
                                                    {isJustAdded ? (
                                                        <>
                                                            <Check className="w-3.5 h-3.5" />
                                                            <span>Eklendi</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Plus className="w-3.5 h-3.5" />
                                                            <span>
                                                                {rec.addedToSoundboard
                                                                    ? "Tekrar Ekle"
                                                                    : "Soundboard'a Ekle"}
                                                            </span>
                                                        </>
                                                    )}
                                                </motion.button>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
