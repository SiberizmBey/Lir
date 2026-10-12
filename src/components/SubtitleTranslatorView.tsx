import { useEffect, useRef, useState } from "react";
import {
    AlertCircle,
    Languages,
    LoaderCircle,
    Monitor,
    ScanText,
    Square,
} from "lucide-react";
import { createWorker, PSM } from "tesseract.js";
import type { SubtitleOverlaySettings } from "../types/sound";

const OCR_LANGUAGES = {
    auto: { label: "Otomatik algıla", ocrCode: "eng", translationCode: "auto" },
    eng: { label: "İngilizce", ocrCode: "eng", translationCode: "en" },
    jpn: { label: "Japonca", ocrCode: "jpn", translationCode: "ja" },
    kor: { label: "Korece", ocrCode: "kor", translationCode: "ko" },
    chi_sim: {
        label: "Basitleştirilmiş Çince",
        ocrCode: "chi_sim",
        translationCode: "zh-CN",
    },
    spa: { label: "İspanyolca", ocrCode: "spa", translationCode: "es" },
    fra: { label: "Fransızca", ocrCode: "fra", translationCode: "fr" },
    deu: { label: "Almanca", ocrCode: "deu", translationCode: "de" },
} as const;

type OcrLanguage = keyof typeof OCR_LANGUAGES;
type Selection = { x: number; y: number; width: number; height: number };
type TranslationWorker = Awaited<ReturnType<typeof createWorker>>;

const normalizeText = (text: string) =>
    text.replace(/\s+/g, " ").trim().toLocaleLowerCase();

const decodeOcrEntities = (text: string) =>
    text
        .replace(/&nbsp;|&#160;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'");

function prepareSubtitleImage(
    video: HTMLVideoElement,
    selection: Selection,
): HTMLCanvasElement {
    const pixelBudgetScale = Math.sqrt(
        350_000 / (selection.width * selection.height),
    );
    const scale = Math.min(1, pixelBudgetScale);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(selection.width * scale);
    canvas.height = Math.round(selection.height * scale);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || canvas.width < 1 || canvas.height < 1) {
        throw new Error("Altyazı görüntüsü işlenemedi.");
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.filter = "grayscale(1) contrast(1.35)";
    context.drawImage(
        video,
        selection.x,
        selection.y,
        selection.width,
        selection.height,
        0,
        0,
        canvas.width,
        canvas.height,
    );
    return canvas;
}

const OVERLAY_SETTINGS_KEY = "lir_subtitle_overlay_settings_v2";
const DEFAULT_OVERLAY_SETTINGS = {
    x: 100,
    y: 4,
    width: 400,
    height: 510,
    fontSize: 17,
};
const FRAME_SAMPLE_WIDTH = 48;
const FRAME_SAMPLE_HEIGHT = 24;
const FRAME_SAMPLE_INTERVAL_MS = 100;
const MIN_OCR_INTERVAL_MS = 0;

function hasSubtitleFrameChanged(
    video: HTMLVideoElement,
    selection: Selection,
    canvas: HTMLCanvasElement,
    previousFrame: Uint8ClampedArray | null,
): { changed: boolean; frame: Uint8ClampedArray } {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Ekran örneklemesi başlatılamadı.");

    context.drawImage(
        video,
        selection.x,
        selection.y,
        selection.width,
        selection.height,
        0,
        0,
        FRAME_SAMPLE_WIDTH,
        FRAME_SAMPLE_HEIGHT,
    );
    const frame = context.getImageData(
        0,
        0,
        FRAME_SAMPLE_WIDTH,
        FRAME_SAMPLE_HEIGHT,
    ).data;
    if (!previousFrame) return { changed: true, frame };

    let changedPixels = 0;
    let totalDifference = 0;
    const pixelCount = FRAME_SAMPLE_WIDTH * FRAME_SAMPLE_HEIGHT;
    for (let index = 0; index < frame.length; index += 4) {
        const difference =
            Math.abs(frame[index] - previousFrame[index]) +
            Math.abs(frame[index + 1] - previousFrame[index + 1]) +
            Math.abs(frame[index + 2] - previousFrame[index + 2]);
        totalDifference += difference;
        if (difference > 75) changedPixels++;
    }

    return {
        changed:
            changedPixels > pixelCount * 0.015 ||
            totalDifference / pixelCount > 5,
        frame,
    };
}

export function SubtitleTranslatorView() {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [selection, setSelection] = useState<Selection | null>(null);
    const [language, setLanguage] = useState<OcrLanguage>("auto");
    const [isTranslating, setIsTranslating] = useState(false);
    const [isLoadingOcr, setIsLoadingOcr] = useState(false);
    const [progress, setProgress] = useState(0);
    const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
    const [recognizedText, setRecognizedText] = useState("");
    const [translatedText, setTranslatedText] = useState("");
    const [isOverlayVisible, setIsOverlayVisible] = useState(false);
    const [overlaySettings, setOverlaySettings] =
        useState<SubtitleOverlaySettings>(() => {
        try {
            const saved = localStorage.getItem(OVERLAY_SETTINGS_KEY);
            return saved
                ? { ...DEFAULT_OVERLAY_SETTINGS, ...JSON.parse(saved) }
                : DEFAULT_OVERLAY_SETTINGS;
        } catch (settingsError) {
            console.error("Altyazı penceresi ayarları okunamadı:", settingsError);
            return DEFAULT_OVERLAY_SETTINGS;
        }
    });
    const [error, setError] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const workerRef = useRef<TranslationWorker | null>(null);
    const translationControllerRef = useRef<AbortController | null>(null);
    const lastTranslatedTextRef = useRef("");
    const lastTranslationAttemptRef = useRef({ text: "", at: 0 });
    const isRecognizingRef = useRef(false);
    const dragStartRef = useRef<{ x: number; y: number } | null>(null);
    const selectionRef = useRef<Selection | null>(null);
    const drawFrameRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        selectionRef.current = selection;
        drawFrameRef.current?.();
    }, [selection]);

    useEffect(() => {
        const video = videoRef.current;
        if (!stream || !video) return;

        video.srcObject = stream;
        void video.play().catch((playError: unknown) => {
            console.error("Ekran önizlemesi başlatılamadı:", playError);
            setError("Ekran görüntüsü gösterilemedi. Ekran paylaşımını yeniden başlatın.");
        });

        const drawFrame = () => {
            const canvas = canvasRef.current;
            const context = canvas?.getContext("2d");
            if (!canvas || !context || !video.videoWidth || !video.videoHeight) return;

            if (
                canvas.width !== video.videoWidth ||
                canvas.height !== video.videoHeight
            ) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }

            const currentSelection = selectionRef.current;
            if (
                !currentSelection ||
                currentSelection.width < 20 ||
                currentSelection.height < 12
            ) {
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
            } else {
                context.drawImage(
                    video,
                    currentSelection.x,
                    currentSelection.y,
                    currentSelection.width,
                    currentSelection.height,
                    currentSelection.x,
                    currentSelection.y,
                    currentSelection.width,
                    currentSelection.height,
                );
            }
            if (currentSelection) {
                context.fillStyle = "rgba(0, 0, 0, 0.38)";
                if (
                    currentSelection.width < 20 ||
                    currentSelection.height < 12
                ) {
                    context.fillRect(0, 0, canvas.width, canvas.height);
                } else {
                    context.fillRect(
                        currentSelection.x,
                        currentSelection.y,
                        currentSelection.width,
                        currentSelection.height,
                    );
                    context.clearRect(
                        currentSelection.x,
                        currentSelection.y,
                        currentSelection.width,
                        currentSelection.height,
                    );
                    context.drawImage(
                        video,
                        currentSelection.x,
                        currentSelection.y,
                        currentSelection.width,
                        currentSelection.height,
                        currentSelection.x,
                        currentSelection.y,
                        currentSelection.width,
                        currentSelection.height,
                    );
                }
                context.strokeStyle = "#34d399";
                context.lineWidth = Math.max(2, canvas.width / 600);
                context.strokeRect(
                    currentSelection.x,
                    currentSelection.y,
                    currentSelection.width,
                    currentSelection.height,
                );
            }
        };

        drawFrameRef.current = drawFrame;
        drawFrame();
        const frameTimer = window.setInterval(drawFrame, 1000);
        const track = stream.getVideoTracks()[0];
        const handleEnded = () => stopCapture();
        track?.addEventListener("ended", handleEnded);

        return () => {
            window.clearInterval(frameTimer);
            drawFrameRef.current = null;
            track?.removeEventListener("ended", handleEnded);
            video.srcObject = null;
        };
    }, [stream]);

    useEffect(() => {
        if (!isTranslating || !stream || !selection) return;

        let cancelled = false;
        let sampleIntervalId: number | null = null;
        let recognitionTimeoutId: number | null = null;
        let worker: TranslationWorker | null = null;
        let previousSample: Uint8ClampedArray | null = null;
        let observedFrameVersion = 0;
        let processedFrameVersion = 0;
        let lastOcrStartedAt = 0;
        let isWorkerBusy = false;
        let isTranslationRunning = false;
        let pendingTranslation: { text: string; normalizedText: string } | null =
            null;
        const frameSampleCanvas = document.createElement("canvas");
        frameSampleCanvas.width = FRAME_SAMPLE_WIDTH;
        frameSampleCanvas.height = FRAME_SAMPLE_HEIGHT;
        setError(null);
        setIsLoadingOcr(true);
        setProgress(0);

        const drainTranslationQueue = async () => {
            if (isTranslationRunning || cancelled) return;
            isTranslationRunning = true;

            try {
                while (pendingTranslation && !cancelled) {
                    const currentTranslation = pendingTranslation;
                    pendingTranslation = null;
                    const query = new URLSearchParams({
                        client: "gtx",
                        sl: OCR_LANGUAGES[language].translationCode,
                        tl: "tr",
                        dt: "t",
                        q: currentTranslation.text.slice(0, 1000),
                    });
                    const controller = new AbortController();
                    translationControllerRef.current = controller;
                    const timeout = window.setTimeout(
                        () => controller.abort(),
                        10000,
                    );

                    try {
                        const response = await fetch(
                            `https://translate.googleapis.com/translate_a/single?${query.toString()}`,
                            { signal: controller.signal },
                        );
                        if (!response.ok) {
                            throw new Error(
                                `Çeviri servisi HTTP ${response.status} hatası döndürdü.`,
                            );
                        }

                        const result: unknown = await response.json();
                        if (!Array.isArray(result) || !Array.isArray(result[0])) {
                            throw new Error(
                                "Çeviri servisi beklenmeyen bir yanıt döndürdü.",
                            );
                        }
                        const translation = result[0]
                            .map((segment: unknown) =>
                                Array.isArray(segment) &&
                                typeof segment[0] === "string"
                                    ? segment[0]
                                    : "",
                            )
                            .join("")
                            .trim();
                        if (!translation) {
                            throw new Error(
                                "Çeviri servisi bu metni çeviremedi.",
                            );
                        }

                        lastTranslatedTextRef.current =
                            currentTranslation.normalizedText;
                        setError(null);
                        setTranslatedText(translation);
                        window.electronAPI?.updateSubtitleOverlay(translation);
                    } catch (translationError) {
                        if (
                            !cancelled &&
                            !(translationError instanceof DOMException &&
                                translationError.name === "AbortError")
                        ) {
                            console.error(
                                "Altyazı çevirisi başarısız oldu:",
                                translationError,
                            );
                            window.electronAPI?.updateSubtitleOverlay(
                                "Çeviri alınamadı. Bağlantı kontrol ediliyor…",
                            );
                            setError(
                                translationError instanceof Error
                                    ? translationError.message
                                    : "Çeviri sırasında beklenmeyen bir hata oluştu.",
                            );
                        }
                    } finally {
                        window.clearTimeout(timeout);
                        if (translationControllerRef.current === controller) {
                            translationControllerRef.current = null;
                        }
                    }
                }
            } finally {
                isTranslationRunning = false;
                if (pendingTranslation && !cancelled) {
                    void drainTranslationQueue();
                }
            }
        };

        const recognizeLatestFrame = async (
            ocrWorker: TranslationWorker,
            frameVersion: number,
        ) => {
            if (isWorkerBusy || cancelled) return;
            const video = videoRef.current;
            if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

            isWorkerBusy = true;
            isRecognizingRef.current = true;
            processedFrameVersion = frameVersion;
            lastOcrStartedAt = Date.now();
            let ocrSlotReleased = false;
            try {
                const crop = prepareSubtitleImage(video, selection);
                const {
                    data: { text, confidence },
                } = await ocrWorker.recognize(crop);
                if (cancelled) return;

                isWorkerBusy = false;
                isRecognizingRef.current = false;
                ocrSlotReleased = true;
                if (observedFrameVersion > processedFrameVersion) {
                    scheduleRecognition();
                }

                const cleanedText = decodeOcrEntities(text)
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .join("\n")
                    .trim();
                setRecognizedText((current) =>
                    current === cleanedText ? current : cleanedText,
                );
                const roundedConfidence = Math.round(confidence);
                setOcrConfidence((current) =>
                    current === roundedConfidence ? current : roundedConfidence,
                );
                if (cleanedText) {
                    window.electronAPI?.updateSubtitleOverlay(
                        confidence >= 20
                            ? cleanedText
                            : "Altyazı net okunamadı. Alanı daraltıp yeniden deneyin.",
                    );
                } else {
                    window.electronAPI?.updateSubtitleOverlay(
                        "Seçili alanda altyazı aranıyor…",
                    );
                }
                const normalizedText = normalizeText(cleanedText);
                if (
                    !cleanedText ||
                    confidence < 20 ||
                    !/[a-zA-Z\u00c0-\u024f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(
                        cleanedText,
                    ) ||
                    normalizedText === lastTranslatedTextRef.current
                ) {
                    return;
                }

                const lastAttempt = lastTranslationAttemptRef.current;
                if (
                    lastAttempt.text === normalizedText &&
                    Date.now() - lastAttempt.at < 1000
                ) {
                    return;
                }
                lastTranslationAttemptRef.current = {
                    text: normalizedText,
                    at: Date.now(),
                };

                pendingTranslation = {
                    text: cleanedText,
                    normalizedText,
                };
                void drainTranslationQueue();
            } catch (recognitionError) {
                if (
                    !cancelled &&
                    !(recognitionError instanceof DOMException &&
                        recognitionError.name === "AbortError")
                ) {
                    console.error("OCR veya çeviri başarısız oldu:", recognitionError);
                    window.electronAPI?.updateSubtitleOverlay(
                        "Çeviri alınamadı. Bağlantı kontrol ediliyor…",
                    );
                    setError(
                        recognitionError instanceof Error
                            ? recognitionError.message
                            : "OCR veya çeviri sırasında beklenmeyen bir hata oluştu.",
                    );
                }
            } finally {
                if (!ocrSlotReleased) {
                    isWorkerBusy = false;
                    isRecognizingRef.current = false;
                }
                if (
                    !cancelled &&
                    observedFrameVersion > processedFrameVersion
                ) {
                    scheduleRecognition();
                }
            }
        };

        const scheduleRecognition = () => {
            if (
                cancelled ||
                isWorkerBusy ||
                recognitionTimeoutId !== null ||
                !worker
            ) {
                return;
            }
            const timeUntilNextOcr = Math.max(
                0,
                MIN_OCR_INTERVAL_MS - (Date.now() - lastOcrStartedAt),
            );
            recognitionTimeoutId = window.setTimeout(() => {
                recognitionTimeoutId = null;
                if (!worker || cancelled) return;
                void recognizeLatestFrame(worker, observedFrameVersion);
            }, timeUntilNextOcr);
        };

        const sampleSubtitleFrame = () => {
            const video = videoRef.current;
            if (
                cancelled ||
                !video ||
                video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
            ) {
                return;
            }
            try {
                const sample = hasSubtitleFrameChanged(
                    video,
                    selection,
                    frameSampleCanvas,
                    previousSample,
                );
                previousSample = sample.frame;
                if (sample.changed) {
                    observedFrameVersion++;
                    scheduleRecognition();
                }
            } catch (samplingError) {
                if (!cancelled) {
                    console.error("Altyazı kare değişimi algılanamadı:", samplingError);
                    window.electronAPI?.updateSubtitleOverlay(
                        "Ekran görüntüsü okunamadı.",
                    );
                    setError("Altyazı görüntüsü analiz edilemedi.");
                }
            }
        };

        const initializeWorker = async () => {
            try {
                worker = await createWorker(OCR_LANGUAGES[language].ocrCode, 1, {
                    logger: (message) => {
                        if (message.status === "recognizing text") {
                            setProgress(message.progress);
                        }
                    },
                });
                await worker.setParameters({
                    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
                    preserve_interword_spaces: "1",
                });
                if (cancelled) {
                    await worker.terminate();
                    return;
                }
                workerRef.current = worker;
                setIsLoadingOcr(false);
                const video = videoRef.current;
                if (
                    video &&
                    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
                ) {
                    previousSample = hasSubtitleFrameChanged(
                        video,
                        selection,
                        frameSampleCanvas,
                        null,
                    ).frame;
                }
                observedFrameVersion = 1;
                await recognizeLatestFrame(worker, observedFrameVersion);
                sampleIntervalId = window.setInterval(
                    sampleSubtitleFrame,
                    FRAME_SAMPLE_INTERVAL_MS,
                );
            } catch (workerError) {
                if (!cancelled) {
                    console.error("OCR motoru başlatılamadı:", workerError);
                    window.electronAPI?.updateSubtitleOverlay(
                        "OCR yüklenemedi. İnternet bağlantısını kontrol edin.",
                    );
                    setError(
                        "OCR motoru yüklenemedi. İlk kullanımda dil modeli için internet bağlantısı gerekir.",
                    );
                    setIsTranslating(false);
                    setIsLoadingOcr(false);
                }
            }
        };

        void initializeWorker();
        return () => {
            cancelled = true;
            translationControllerRef.current?.abort();
            translationControllerRef.current = null;
            if (sampleIntervalId !== null) window.clearInterval(sampleIntervalId);
            if (recognitionTimeoutId !== null) {
                window.clearTimeout(recognitionTimeoutId);
            }
            if (workerRef.current === worker) workerRef.current = null;
            if (worker) void worker.terminate();
            isRecognizingRef.current = false;
        };
    }, [isTranslating, language, selection, stream]);

    useEffect(() => {
        return () => {
            stream?.getTracks().forEach((track) => track.stop());
        };
    }, [stream]);

    useEffect(() => {
        return window.electronAPI?.onSubtitleOverlayVisibilityChange(
            setIsOverlayVisible,
        );
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(
                OVERLAY_SETTINGS_KEY,
                JSON.stringify(overlaySettings),
            );
        } catch (settingsError) {
            console.error("Altyazı penceresi ayarları kaydedilemedi:", settingsError);
            setError("Altyazı penceresi ayarları kaydedilemedi.");
        }

        const timeout = window.setTimeout(() => {
            void window.electronAPI
                ?.setSubtitleOverlaySettings(overlaySettings)
                .then((updated) => {
                    if (!updated) {
                        setError("Altyazı penceresi ayarları uygulanamadı.");
                    }
                })
                .catch((settingsError: unknown) => {
                    console.error("Altyazı penceresi ayarları uygulanamadı:", settingsError);
                    setError("Altyazı penceresi ayarları uygulanamadı.");
                });
        }, 300);

        return () => window.clearTimeout(timeout);
    }, [overlaySettings]);

    const setOverlayVisibility = async (visible: boolean) => {
        const setVisible = window.electronAPI?.setSubtitleOverlayVisible;
        if (!setVisible) {
            setError("Oyun üstü çeviri penceresi yalnızca masaüstü uygulamasında kullanılabilir.");
            return false;
        }

        try {
            const updated = await setVisible(visible);
            if (!updated) {
                throw new Error("Oyun üstü çeviri penceresi açılamadı.");
            }
            setIsOverlayVisible(visible);
            return true;
        } catch (overlayError) {
            console.error("Oyun üstü çeviri penceresi güncellenemedi:", overlayError);
            setError(
                overlayError instanceof Error
                    ? overlayError.message
                    : "Oyun üstü çeviri penceresi güncellenemedi.",
            );
            return false;
        }
    };

    const stopCapture = () => {
        setIsTranslating(false);
        translationControllerRef.current?.abort();
        void setOverlayVisibility(false);
        setStream(null);
        setSelection(null);
        setRecognizedText("");
        setTranslatedText("");
        setOcrConfidence(null);
        lastTranslatedTextRef.current = "";
        lastTranslationAttemptRef.current = {
            text: "",
            at: 0,
        };
    };

    const startCapture = async () => {
        setError(null);
        try {
            const nextStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    frameRate: { ideal: 15, max: 15 },
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 },
                },
                audio: false,
            });
            setSelection(null);
            setStream(nextStream);
        } catch (captureError) {
            if (captureError instanceof Error && captureError.name === "NotAllowedError") {
                return;
            }
            console.error("Ekran paylaşımı başlatılamadı:", captureError);
            setError(
                "Ekran görüntüsü alınamadı. Uygulamanın ekran yakalama iznini kontrol edip yeniden deneyin.",
            );
        }
    };

    const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = event.currentTarget;
        const bounds = canvas.getBoundingClientRect();
        return {
            x: Math.max(
                0,
                Math.min(canvas.width, (event.clientX - bounds.left) * (canvas.width / bounds.width)),
            ),
            y: Math.max(
                0,
                Math.min(canvas.height, (event.clientY - bounds.top) * (canvas.height / bounds.height)),
            ),
        };
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!stream) return;
        const point = getCanvasPoint(event);
        dragStartRef.current = point;
        setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!dragStartRef.current) return;
        const point = getCanvasPoint(event);
        const start = dragStartRef.current;
        const nextSelection = {
            x: Math.min(start.x, point.x),
            y: Math.min(start.y, point.y),
            width: Math.abs(point.x - start.x),
            height: Math.abs(point.y - start.y),
        };
        selectionRef.current = nextSelection;
        setSelection(nextSelection);
        drawFrameRef.current?.();
    };

    const finishSelection = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!dragStartRef.current) return;
        handlePointerMove(event);
        dragStartRef.current = null;
        drawFrameRef.current?.();
    };

    const hasValidSelection =
        selection !== null && selection.width >= 20 && selection.height >= 12;

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                    <h1 className="text-base font-semibold tracking-tight text-white">
                        Oyun Altyazı Çevirisi
                    </h1>
                    <span className="rounded border border-emerald-900/80 bg-emerald-950/40 px-1.5 py-0.5 text-[10px] font-mono text-emerald-300">
                        OCR · CANLI
                    </span>
                </div>
                <p className="text-xs text-zinc-400">
                    Ekranda bir alan seçin; altyazılar cihazınızda okunup Türkçeye çevrilsin.
                </p>
                <p className="text-[11px] text-zinc-500">
                    Altyazı alanındaki her değişiklikte OCR hazır olur olmaz başlar; çeviri istekleri sırayla tamamlanır.
                </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)]">
                <section className="app-card flex min-h-72 flex-col gap-3 rounded-xl border border-zinc-800 bg-[#090909] p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
                            <Monitor className="h-4 w-4 text-zinc-400" />
                            Ekran alanı
                        </div>
                        {stream ? (
                            <button
                                type="button"
                                onClick={stopCapture}
                                className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
                            >
                                <Square className="h-3 w-3" />
                                Ekran paylaşımını durdur
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => void startCapture()}
                                className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-zinc-200"
                            >
                                <Monitor className="h-3.5 w-3.5" />
                                Ekran seç
                            </button>
                        )}
                    </div>

                    <div className="flex min-h-56 flex-1 items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-black">
                        {stream ? (
                            <canvas
                                ref={canvasRef}
                                onPointerDown={handlePointerDown}
                                onPointerMove={handlePointerMove}
                                onPointerUp={finishSelection}
                                onPointerCancel={finishSelection}
                                aria-label="Altyazı alanını seçmek için ekran önizlemesine sürükleyin"
                                className="max-h-[55vh] max-w-full cursor-crosshair touch-none"
                                style={{ width: "100%", height: "auto" }}
                            />
                        ) : (
                            <div className="flex max-w-xs flex-col items-center gap-2 p-6 text-center">
                                <Monitor className="h-7 w-7 text-zinc-600" />
                                <p className="text-xs text-zinc-400">
                                    Ekran paylaşımını başlatın, ardından altyazıların bulunduğu alanı sürükleyerek seçin.
                                </p>
                            </div>
                        )}
                    </div>
                    <video ref={videoRef} className="hidden" muted playsInline />
                    {stream && (
                        <p className="text-[11px] text-zinc-500">
                            {hasValidSelection
                                ? "Altyazı alanı seçildi."
                                : "Altyazıların etrafında bir dikdörtgen çizerek alanı seçin."}
                        </p>
                    )}
                </section>

                <section className="app-card flex flex-col gap-4 rounded-xl border border-zinc-800 bg-[#090909] p-4">
                    <div className="flex flex-col gap-1">
                        <label
                            htmlFor="subtitle-source-language"
                            className="text-xs font-medium text-zinc-200"
                        >
                            Altyazı dili
                        </label>
                        <select
                            id="subtitle-source-language"
                            value={language}
                            disabled={isTranslating || isLoadingOcr}
                            onChange={(event) => {
                                setLanguage(event.target.value as OcrLanguage);
                                lastTranslatedTextRef.current = "";
                            }}
                            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white outline-none focus:border-zinc-500 disabled:opacity-50"
                        >
                            {Object.entries(OCR_LANGUAGES).map(([code, item]) => (
                                <option key={code} value={code}>
                                    {item.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {isTranslating ? (
                        <button
                            type="button"
                            onClick={() => setIsTranslating(false)}
                            className="flex items-center justify-center gap-2 rounded-lg border border-rose-900/80 bg-rose-950/40 px-3 py-2 text-xs font-medium text-rose-200 transition-colors hover:bg-rose-950"
                        >
                            <Square className="h-3.5 w-3.5" />
                            Çeviriyi durdur
                        </button>
                    ) : (
                        <button
                            type="button"
                            disabled={!stream || !hasValidSelection || isLoadingOcr}
                            onClick={() => {
                                setRecognizedText("");
                                setTranslatedText("");
                                lastTranslatedTextRef.current = "";
                                window.electronAPI?.updateSubtitleOverlay(
                                    "Ekran metni aranıyor…",
                                );
                                void setOverlayVisibility(true);
                                setIsTranslating(true);
                            }}
                            className="flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                        >
                            {isLoadingOcr ? (
                                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <ScanText className="h-3.5 w-3.5" />
                            )}
                            Canlı çeviriyi başlat
                        </button>
                    )}

                    {isLoadingOcr && (
                        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            OCR motoru ve dil modeli yükleniyor…
                        </div>
                    )}

                    {isTranslating && !isLoadingOcr && (
                        <div className="flex items-center gap-2 text-[11px] text-emerald-300">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                            Ekran altyazıları izleniyor · %{Math.round(progress * 100)}
                        </div>
                    )}

                    {error && (
                        <div
                            role="alert"
                            className="flex items-start gap-2 rounded-lg border border-rose-900/70 bg-rose-950/30 p-2.5 text-xs text-rose-200"
                        >
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="flex min-h-24 flex-col gap-2 border-t border-zinc-800 pt-3">
                        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                            <ScanText className="h-3 w-3" />
                            Algılanan altyazı
                        </div>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">
                            {recognizedText || "Altyazı algılandığında burada görünür."}
                        </p>
                        {ocrConfidence !== null && ocrConfidence < 20 && (
                            <p className="text-[10px] text-amber-300">
                                OCR metni okuyamadı (%{Math.round(ocrConfidence)} güven). Yalnızca altyazı satırını kapsayan alanı seçin.
                            </p>
                        )}
                    </div>

                    <div className="flex min-h-28 flex-col gap-3 border-t border-zinc-800 pt-3">
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-300">
                            <Languages className="h-3 w-3" />
                            Oyun üstü altyazı
                        </div>
                        <p className="text-xs leading-relaxed text-zinc-400">
                            {translatedText
                                ? "Türkçe çeviri ekranınızın sağ üst köşesindeki yapışkan notta gösteriliyor."
                                : "Çeviri, oyun veya diğer uygulamaların üzerinde ayrı bir pencerede gösterilecek."}
                        </p>
                        <button
                            type="button"
                            onClick={() =>
                                void setOverlayVisibility(!isOverlayVisible)
                            }
                            className="flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 transition-colors hover:bg-zinc-800"
                        >
                            {isOverlayVisible
                                ? "Yapışkan notu gizle"
                                : "Yapışkan notu göster"}
                        </button>
                        <p className="text-[10px] text-zinc-500">
                            Not tıklamaları oyuna geçirir. Ctrl + Shift + Y ile gösterip gizleyebilirsiniz.
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-zinc-800 pt-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-zinc-200">
                                Yapışkan not görünümü
                            </span>
                            <button
                                type="button"
                                onClick={() =>
                                    setOverlaySettings(DEFAULT_OVERLAY_SETTINGS)
                                }
                                className="text-[10px] text-zinc-500 transition-colors hover:text-zinc-200"
                            >
                                Sıfırla
                            </button>
                        </div>

                        <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
                            Yatay konum · {overlaySettings.x}%
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={overlaySettings.x}
                                onChange={(event) =>
                                    setOverlaySettings((current) => ({
                                        ...current,
                                        x: Number(event.target.value),
                                    }))
                                }
                            />
                        </label>

                        <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
                            Dikey konum · {overlaySettings.y}%
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={overlaySettings.y}
                                onChange={(event) =>
                                    setOverlaySettings((current) => ({
                                        ...current,
                                        y: Number(event.target.value),
                                    }))
                                }
                            />
                        </label>

                        <div className="grid grid-cols-2 gap-3">
                            <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
                                Genişlik · {overlaySettings.width}px
                                <input
                                    type="range"
                                    min="360"
                                    max="1200"
                                    step="20"
                                    value={overlaySettings.width}
                                    onChange={(event) =>
                                        setOverlaySettings((current) => ({
                                            ...current,
                                            width: Number(event.target.value),
                                        }))
                                    }
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
                                Yükseklik · {overlaySettings.height}px
                                <input
                                    type="range"
                                    min="120"
                                    max="700"
                                    step="10"
                                    value={overlaySettings.height}
                                    onChange={(event) =>
                                        setOverlaySettings((current) => ({
                                            ...current,
                                            height: Number(event.target.value),
                                        }))
                                    }
                                />
                            </label>
                        </div>

                        <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
                            Yazı boyutu · {overlaySettings.fontSize}px
                            <input
                                type="range"
                                min="14"
                                max="48"
                                value={overlaySettings.fontSize}
                                onChange={(event) =>
                                    setOverlaySettings((current) => ({
                                        ...current,
                                        fontSize: Number(event.target.value),
                                    }))
                                }
                            />
                        </label>
                    </div>
                </section>
            </div>

            <aside className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-3 py-2.5 text-[11px] leading-relaxed text-amber-100/80">
                OCR cihazınızda çalışır. Dil modeli ilk kullanımda internetten indirilir; çeviri için yalnızca algılanan altyazı metni ücretsiz Google Translate endpoint’ine gönderilir. İnternet gerekir; bu anahtarsız endpoint’in kullanım koşulları ve erişilebilirliği değişebilir. Daha iyi sonuç için yalnızca altyazıları kapsayan dar bir alan seçin.
            </aside>
        </div>
    );
}
