import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
    Scissors,
    Play,
    Square,
    Repeat,
    Upload,
    FolderOpen,
    Plus,
    Check,
    RotateCcw,
    Volume2,
    ZoomIn,
    ZoomOut,
    Music,
    ArrowRight,
    Sparkles,
    Save,
    Layers,
    ChevronUp,
    ChevronDown,
    Copy,
    Trash2,
    Split,
    ArrowUpDown,
    X,
    Tag,
    Keyboard,
    Disc3,
    RefreshCw,
} from "lucide-react";
import { SoundCategory, SoundItem, SoundSegment } from "../types/sound";
import { audioEngine } from "../utils/audioEngine";
import { extractHotkeyFromKeyboardEvent } from "../utils/hotkeys";
import {
    CachedYouTubeTrack,
    listCachedYouTubeTracks,
} from "../utils/youtubeService";
import { useTranslation } from "../i18n";
import { LirSelect, LirSelectOption } from "./LirSelect";
import { offloadDataUrlSync } from "../utils/audioAssetStorage";

interface LirMakerViewProps {
    sounds: SoundItem[];
    initialSoundId?: string | null;
    isElectron: boolean;
    onAddCutToBoard: (cutSound: Omit<SoundItem, "id" | "addedAt">) => SoundItem;
    onUpdateSoundTrim: (
        soundId: string,
        trimStart: number,
        trimEnd: number,
        nextTitle?: string,
        segments?: SoundSegment[],
    ) => void;
    onGoToSoundboard: () => void;
}

interface WaveformRegion {
    id: string;
    start: number;
    end: number;
    label?: string;
    hotkey?: string;
    selectedForExport?: boolean;
    addedToLibrary?: boolean;
    isPristineFull?: boolean;
}

interface QueuedSegment extends SoundSegment {
    buffer: AudioBuffer;
    sourceKey: string;
    sourceTitle: string;
}

const CATEGORIES: SoundCategory[] = [
    "Meme & Eğlence",
    "Oyun SFX",
    "Reaksiyon",
    "Anime & Dizi",
    "Müzik",
    "Özel",
];

const REGION_PALETTE = [
    { hex: "#38bdf8", rgb: "56, 189, 248" },   // Sky
    { hex: "#f59e0b", rgb: "245, 158, 11" },  // Amber
    { hex: "#a855f7", rgb: "168, 85, 247" },  // Violet
    { hex: "#fb7185", rgb: "251, 113, 133" }, // Rose
    { hex: "#2dd4bf", rgb: "45, 212, 191" },  // Teal
];

const MIN_CLIP_SECONDS = 0.05;
const WAVEFORM_BUCKETS = 1400;

function formatTimePrecise(seconds: number): string {
    const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const mins = Math.floor(safe / 60);
    const secs = Math.floor(safe % 60);
    const hundredths = Math.floor((safe * 100) % 100);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}.${hundredths < 10 ? "0" : ""}${hundredths}`;
}

function buildWaveformPeaks(buffer: AudioBuffer, bucketCount: number): Float32Array {
    const peaks = new Float32Array(bucketCount);
    const length = buffer.length;
    if (length === 0) return peaks;

    const channels = Math.max(1, buffer.numberOfChannels);
    const channelDataList: Float32Array[] = [];
    for (let c = 0; c < channels; c += 1) {
        channelDataList.push(buffer.getChannelData(c));
    }

    const samplesPerBucket = Math.max(1, Math.floor(length / bucketCount));
    let globalMax = 0.0001;

    for (let i = 0; i < bucketCount; i += 1) {
        const startSample = Math.floor((i / bucketCount) * length);
        const endSample = Math.min(length, Math.max(startSample + 1, startSample + samplesPerBucket));
        const stride = Math.max(1, Math.floor((endSample - startSample) / 64));
        let peak = 0;

        for (let s = startSample; s < endSample; s += stride) {
            let mixed = 0;
            for (let c = 0; c < channels; c += 1) {
                mixed += Math.abs(channelDataList[c][s] || 0);
            }
            mixed /= channels;
            if (mixed > peak) peak = mixed;
        }
        peaks[i] = peak;
        if (peak > globalMax) globalMax = peak;
    }

    const normFactor = globalMax > 0.001 ? 1 / globalMax : 1;
    for (let i = 0; i < bucketCount; i += 1) {
        peaks[i] = Math.min(1, peaks[i] * normFactor);
    }
    return peaks;
}

function makeUid(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function toPersistedSegments(
    list: Array<Pick<SoundSegment, "id" | "start" | "end" | "dataUrl" | "synthPreset" | "sourceSoundId" | "label">>,
): SoundSegment[] {
    return list.map(({ id, start, end, dataUrl, synthPreset, sourceSoundId, label }) => ({
        id,
        start: Math.round(start * 1000) / 1000,
        end: Math.round(end * 1000) / 1000,
        dataUrl,
        synthPreset,
        sourceSoundId,
        label,
    }));
}

type PointerDragState =
    | { type: "resize-start"; regionId: string }
    | { type: "resize-end"; regionId: string }
    | {
          type: "move-region";
          regionId: string;
          startClientX: number;
          initialStart: number;
          initialEnd: number;
          moved: boolean;
      }
    | {
          type: "new-region";
          anchorTime: number;
          createdRegionId: string | null;
      }
    | null;

type PreviewMode = "regions" | "single-region" | "combined-queue" | "single-queue";

export function LirMakerView({
    sounds,
    initialSoundId,
    isElectron,
    onAddCutToBoard,
    onUpdateSoundTrim,
    onGoToSoundboard,
}: LirMakerViewProps) {
    const { t } = useTranslation();

    const [sourceMode, setSourceMode] = useState<"board" | "file">("board");
    const [selectedBoardId, setSelectedBoardId] = useState<string>(
        () => initialSoundId || sounds[0]?.id || "",
    );
    const [selectedCacheVideoId, setSelectedCacheVideoId] = useState<string | null>(null);
    const [cachedYouTubeTracks, setCachedYouTubeTracks] = useState<CachedYouTubeTrack[]>([]);
    const [isRefreshingCache, setIsRefreshingCache] = useState(false);

    const [activeBuffer, setActiveBuffer] = useState<AudioBuffer | null>(null);
    const [waveformPeaks, setWaveformPeaks] = useState<Float32Array | null>(null);
    const [isDecoding, setIsDecoding] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [fileSource, setFileSource] = useState<{
        title: string;
        dataUrl: string;
    } | null>(null);

    // Multi-selection regions directly on the waveform
    const [regions, setRegions] = useState<WaveformRegion[]>([
        { id: "reg-init", start: 0, end: 1, selectedForExport: true, isPristineFull: true },
    ]);
    const [activeRegionId, setActiveRegionId] = useState<string>("reg-init");
    const [cursorTime, setCursorTime] = useState(0);

    // Cross-sound multi-segment queue
    const [cutSegments, setCutSegments] = useState<QueuedSegment[]>([]);
    const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);

    // Zoom & pan
    const [zoom, setZoom] = useState<1 | 2 | 4 | 8>(1);
    const [scrollRatio, setScrollRatio] = useState(0);

    // Preview playback state
    const [isPlaying, setIsPlaying] = useState(false);
    const [previewMode, setPreviewMode] = useState<PreviewMode>("regions");
    const [loopPreview, setLoopPreview] = useState(false);
    const [previewVolume, setPreviewVolume] = useState(0.85);
    const [playheadTime, setPlayheadTime] = useState<number | null>(null);

    // Export-to-board fields (zero re-render)
    const [cutTitle, setCutTitle] = useState("");
    const [cutCategory, setCutCategory] = useState<SoundCategory>("Özel");
    const [cutHotkey, setCutHotkey] = useState(
        `F${(sounds.length % 12) + 1}`,
    );
    const [isCapturingHotkey, setIsCapturingHotkey] = useState(false);
    const [capturingRegionHotkeyId, setCapturingRegionHotkeyId] = useState<string | null>(null);
    const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

    const [isDraggingFile, setIsDraggingFile] = useState(false);
    const [canvasSizeTick, setCanvasSizeTick] = useState(0);

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const waveBoxRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const dragStateRef = useRef<PointerDragState>(null);
    const loadedInitialSegmentsForIdRef = useRef<string | null>(null);

    const selectedBoardSound = useMemo(
        () =>
            selectedCacheVideoId
                ? null
                : sounds.find((s) => s.id === selectedBoardId) || null,
        [sounds, selectedBoardId, selectedCacheVideoId],
    );

    const selectedCacheTrack = useMemo(
        () =>
            selectedCacheVideoId
                ? cachedYouTubeTracks.find((tr) => tr.videoId === selectedCacheVideoId) ||
                  null
                : null,
        [cachedYouTubeTracks, selectedCacheVideoId],
    );

    const activeAudioPayload = useMemo(() => {
        if (sourceMode === "board") {
            if (selectedCacheTrack) {
                return {
                    dataUrl: selectedCacheTrack.audioUrl,
                    synthPreset: undefined,
                    sourceSoundId: undefined,
                };
            }
            if (selectedBoardSound) {
                return {
                    dataUrl: selectedBoardSound.dataUrl,
                    synthPreset: selectedBoardSound.synthPreset,
                    sourceSoundId: selectedBoardSound.id,
                };
            }
        }
        if (sourceMode === "file" && fileSource) {
            return {
                dataUrl: fileSource.dataUrl,
                synthPreset: undefined,
                sourceSoundId: undefined,
            };
        }
        return {
            dataUrl: undefined,
            synthPreset: undefined,
            sourceSoundId: undefined,
        };
    }, [sourceMode, selectedCacheTrack, selectedBoardSound, fileSource]);

    const activeSourceKey = useMemo(() => {
        if (sourceMode === "board" && selectedCacheTrack) {
            return `ytcache:${selectedCacheTrack.videoId}`;
        }
        if (sourceMode === "board" && selectedBoardSound) {
            return `board:${selectedBoardSound.id}`;
        }
        if (sourceMode === "file" && fileSource) {
            return `file:${fileSource.dataUrl.slice(0, 80)}:${fileSource.title}`;
        }
        return "";
    }, [sourceMode, selectedCacheTrack, selectedBoardSound, fileSource]);

    const activeSourceTitle = useMemo(() => {
        if (sourceMode === "board" && selectedCacheTrack) {
            return selectedCacheTrack.title;
        }
        if (sourceMode === "board" && selectedBoardSound) {
            return selectedBoardSound.title;
        }
        if (sourceMode === "file" && fileSource) {
            return fileSource.title;
        }
        return "Makara";
    }, [sourceMode, selectedCacheTrack, selectedBoardSound, fileSource]);

    const fullDuration = useMemo(
        () => (activeBuffer ? Math.max(MIN_CLIP_SECONDS, activeBuffer.duration) : 0),
        [activeBuffer],
    );

    const activeRegionIndex = useMemo(() => {
        const idx = regions.findIndex((r) => r.id === activeRegionId);
        return idx >= 0 ? idx : 0;
    }, [regions, activeRegionId]);

    const activeRegion = regions[activeRegionIndex] || {
        id: activeRegionId,
        start: 0,
        end: fullDuration || 1,
    };

    const trimStart = activeRegion.start;
    const trimEnd = activeRegion.end;

    const totalRegionsDuration = useMemo(
        () =>
            regions.reduce(
                (sum, r) => sum + Math.max(MIN_CLIP_SECONDS, r.end - r.start),
                0,
            ),
        [regions],
    );

    const totalCombinedQueueDuration = useMemo(
        () =>
            cutSegments.reduce(
                (sum, seg) => sum + Math.max(MIN_CLIP_SECONDS, seg.end - seg.start),
                0,
            ),
        [cutSegments],
    );

    // Visible time window based on zoom & scrollRatio
    const { viewStart, viewEnd } = useMemo(() => {
        if (fullDuration <= 0) return { viewStart: 0, viewEnd: 1 };
        const span = fullDuration / zoom;
        const maxOffset = Math.max(0, fullDuration - span);
        const start = maxOffset * scrollRatio;
        return { viewStart: start, viewEnd: start + span };
    }, [fullDuration, zoom, scrollRatio]);

    // Observe waveform box resizes so canvas always redraws crisply
    useEffect(() => {
        const el = waveBoxRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(() => {
            setCanvasSizeTick((tTick) => tTick + 1);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const refreshCachedTracks = useCallback(async () => {
        setIsRefreshingCache(true);
        try {
            const tracks = await listCachedYouTubeTracks();
            setCachedYouTubeTracks(tracks);
        } finally {
            setIsRefreshingCache(false);
        }
    }, []);

    useEffect(() => {
        void refreshCachedTracks();
    }, [refreshCachedTracks]);

    // Sync when user clicks "Cut in Makara" on a SoundCard or Music tab
    useEffect(() => {
        if (initialSoundId && sounds.some((s) => s.id === initialSoundId)) {
            loadedInitialSegmentsForIdRef.current = null;
            setSourceMode("board");
            setSelectedCacheVideoId(null);
            setSelectedBoardId(initialSoundId);
        }
    }, [initialSoundId, sounds]);

    // Ensure selected board/cache source stays valid
    useEffect(() => {
        if (sourceMode !== "board") return;
        if (selectedCacheVideoId && selectedCacheTrack) return;
        if (!selectedBoardSound && sounds.length > 0) {
            setSelectedCacheVideoId(null);
            setSelectedBoardId(sounds[0].id);
        } else if (!selectedBoardSound && !selectedCacheTrack && cachedYouTubeTracks.length > 0) {
            setSelectedCacheVideoId(cachedYouTubeTracks[0].videoId);
        }
    }, [
        sourceMode,
        selectedCacheVideoId,
        selectedCacheTrack,
        selectedBoardSound,
        sounds,
        cachedYouTubeTracks,
    ]);

    const applyLoadedBuffer = useCallback(
        (
            buffer: AudioBuffer,
            opts: {
                defaultTitle: string;
                defaultCategory?: SoundCategory;
                initialRegions?: Array<{ start: number; end: number; label?: string }>;
            },
        ) => {
            audioEngine.stopPreviewBuffer();
            setIsPlaying(false);
            setPlayingSegmentId(null);
            setPlayheadTime(null);
            setCapturingRegionHotkeyId(null);

            const dur = Math.max(MIN_CLIP_SECONDS, buffer.duration);
            const rawList =
                opts.initialRegions && opts.initialRegions.length > 0
                    ? opts.initialRegions
                    : [{ start: 0, end: dur }];

            const nextRegions: WaveformRegion[] = rawList.map((r) => {
                const start = Math.max(0, Math.min(dur - MIN_CLIP_SECONDS, r.start));
                const end = Math.max(start + MIN_CLIP_SECONDS, Math.min(dur, r.end));
                return {
                    id: makeUid("reg"),
                    start,
                    end,
                    label: r.label,
                    selectedForExport: true,
                    addedToLibrary: false,
                    isPristineFull:
                        rawList.length === 1 &&
                        start <= 0.001 &&
                        end >= dur - 0.001,
                };
            });

            setActiveBuffer(buffer);
            setWaveformPeaks(buildWaveformPeaks(buffer, WAVEFORM_BUCKETS));
            setRegions(nextRegions);
            setActiveRegionId(nextRegions[0].id);
            setCursorTime(nextRegions[0].start);
            setZoom(1);
            setScrollRatio(0);
            setCutTitle(opts.defaultTitle);
            if (opts.defaultCategory) {
                setCutCategory(opts.defaultCategory);
            }
            setLoadError(null);
            setFeedbackBanner(null);
        },
        [],
    );

    // Decode selected board sound whenever selection changes in board mode
    useEffect(() => {
        if (sourceMode !== "board" || !selectedBoardSound) return;

        let cancelled = false;
        setIsDecoding(true);
        setLoadError(null);

        void audioEngine
            .getOrGenerateBuffer(selectedBoardSound)
            .then(async (buffer) => {
                if (cancelled) return;
                if (!buffer) {
                    setIsDecoding(false);
                    setActiveBuffer(null);
                    setWaveformPeaks(null);
                    setLoadError("Ses verisi çözümlenemedi.");
                    return;
                }
                const suffix = t("lirMaker.cutSuffix");
                const baseTitle = selectedBoardSound.title.endsWith(suffix)
                    ? selectedBoardSound.title
                    : `${selectedBoardSound.title} ${suffix}`;

                // Check if this sound has multiple segments referencing same/other sources
                const savedSegments = selectedBoardSound.segments;
                const allSameSource =
                    savedSegments &&
                    savedSegments.length > 0 &&
                    savedSegments.every(
                        (s) =>
                            (!s.sourceSoundId ||
                                s.sourceSoundId === selectedBoardSound.id) &&
                            (!s.dataUrl || s.dataUrl === selectedBoardSound.dataUrl),
                    );

                setIsDecoding(false);
                applyLoadedBuffer(buffer, {
                    defaultTitle: baseTitle,
                    defaultCategory: selectedBoardSound.category,
                    initialRegions: allSameSource
                        ? savedSegments!.map((s) => ({
                              start: s.start,
                              end: s.end,
                              label:
                                  s.label &&
                                  s.label.trim() !== selectedBoardSound.title.trim()
                                      ? s.label.trim()
                                      : undefined,
                          }))
                        : [
                              {
                                  start: selectedBoardSound.trimStart ?? 0,
                                  end:
                                      selectedBoardSound.trimEnd ??
                                      buffer.duration,
                              },
                          ],
                });

                // If cross-source segments exist when opened directly from SoundCard, load into cross-sound queue
                if (
                    initialSoundId === selectedBoardSound.id &&
                    savedSegments &&
                    savedSegments.length > 0 &&
                    !allSameSource &&
                    loadedInitialSegmentsForIdRef.current !== selectedBoardSound.id
                ) {
                    loadedInitialSegmentsForIdRef.current = selectedBoardSound.id;
                    const loadedSegs: QueuedSegment[] = [];
                    for (const seg of savedSegments) {
                        const segBuf =
                            (await audioEngine.resolveBufferForRef(
                                {
                                    dataUrl: seg.dataUrl,
                                    synthPreset: seg.synthPreset,
                                    sourceSoundId: seg.sourceSoundId,
                                },
                                seg.label,
                            )) || buffer;
                        if (cancelled) return;
                        loadedSegs.push({
                            ...seg,
                            buffer: segBuf,
                            sourceKey: `board:${seg.sourceSoundId || selectedBoardSound.id}`,
                            sourceTitle: seg.label || selectedBoardSound.title,
                        });
                    }
                    if (!cancelled && loadedSegs.length > 0) {
                        setCutSegments(loadedSegs);
                    }
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setIsDecoding(false);
                    setLoadError(
                        err instanceof Error
                            ? err.message
                            : "Ses yüklenemedi.",
                    );
                }
            });

        return () => {
            cancelled = true;
        };
    }, [sourceMode, selectedBoardSound, initialSoundId, applyLoadedBuffer, t]);

    // Decode selected cached Spotify/YouTube track when chosen directly from cache
    useEffect(() => {
        if (sourceMode !== "board" || !selectedCacheTrack) return;

        let cancelled = false;
        setIsDecoding(true);
        setLoadError(null);

        void audioEngine
            .decodeDataUrlToBuffer(selectedCacheTrack.audioUrl)
            .then((buffer) => {
                if (cancelled) return;
                if (!buffer) {
                    setIsDecoding(false);
                    setActiveBuffer(null);
                    setWaveformPeaks(null);
                    setLoadError("Ses verisi çözümlenemedi.");
                    return;
                }
                const suffix = t("lirMaker.cutSuffix");
                const baseTitle = selectedCacheTrack.title.endsWith(suffix)
                    ? selectedCacheTrack.title
                    : `${selectedCacheTrack.title} ${suffix}`;
                setIsDecoding(false);
                applyLoadedBuffer(buffer, {
                    defaultTitle: baseTitle,
                    defaultCategory: "Müzik",
                    initialRegions: [{ start: 0, end: buffer.duration }],
                });
            })
            .catch((err) => {
                if (!cancelled) {
                    setIsDecoding(false);
                    setLoadError(
                        err instanceof Error ? err.message : "Ses yüklenemedi.",
                    );
                }
            });

        return () => {
            cancelled = true;
        };
    }, [sourceMode, selectedCacheTrack, applyLoadedBuffer, t]);

    // Cleanup preview playback on unmount
    useEffect(() => {
        return () => {
            audioEngine.stopPreviewBuffer();
        };
    }, []);

    // Reset active waveform if user switches to file mode without a file yet
    useEffect(() => {
        if (sourceMode === "file" && !fileSource) {
            audioEngine.stopPreviewBuffer();
            setIsPlaying(false);
            setPlayingSegmentId(null);
            setPlayheadTime(null);
            setActiveBuffer(null);
            setWaveformPeaks(null);
        }
    }, [sourceMode, fileSource]);

    const handleLoadLocalDataUrl = useCallback(
        async (title: string, dataUrl: string) => {
            const persistedRef = offloadDataUrlSync(dataUrl) || dataUrl;
            setSourceMode("file");
            setFileSource({ title, dataUrl: persistedRef });
            setIsDecoding(true);
            setLoadError(null);
            try {
                const buffer = await audioEngine.decodeDataUrlToBuffer(persistedRef);
                if (!buffer) {
                    setActiveBuffer(null);
                    setWaveformPeaks(null);
                    setLoadError("Ses dosyası çözümlenemedi.");
                    return;
                }
                setIsDecoding(false);
                applyLoadedBuffer(buffer, {
                    defaultTitle: title,
                    defaultCategory: "Özel",
                    initialRegions: [{ start: 0, end: buffer.duration }],
                });
            } catch (err) {
                setLoadError(
                    err instanceof Error ? err.message : "Dosya okunamadı.",
                );
            } finally {
                setIsDecoding(false);
            }
        },
        [applyLoadedBuffer],
    );

    const handleFileSelected = (file: File) => {
        if (!file) return;
        const cleanName = file.name.replace(/\.[^/.]+$/, "");
        const reader = new FileReader();
        reader.onload = (ev) => {
            const result = ev.target?.result;
            if (typeof result === "string") {
                void handleLoadLocalDataUrl(cleanName, result);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleElectronFileOpen = async () => {
        if (!window.electronAPI?.openFileDialog) return;
        const files = await window.electronAPI.openFileDialog();
        if (files && files[0]) {
            void handleLoadLocalDataUrl(files[0].name, files[0].fileUrl);
        }
    };

    const startAllRegionsPreview = useCallback(() => {
        if (!activeBuffer || regions.length === 0) return;
        setPreviewMode("regions");
        setIsPlaying(true);
        setPlayingSegmentId(regions[0].id);
        setPlayheadTime(regions[0].start);
        audioEngine.playPreviewSegments(
            regions.map((r) => ({
                segmentId: r.id,
                buffer: activeBuffer,
                startSec: r.start,
                endSec: r.end,
            })),
            loopPreview,
            previewVolume,
            () => {
                setIsPlaying(false);
                setPlayingSegmentId(null);
                setPlayheadTime(null);
            },
        );
    }, [activeBuffer, regions, loopPreview, previewVolume]);

    const startSingleRegionPreview = useCallback(
        (reg: WaveformRegion) => {
            if (!activeBuffer) return;
            setActiveRegionId(reg.id);
            setPreviewMode("single-region");
            setIsPlaying(true);
            setPlayingSegmentId(reg.id);
            setPlayheadTime(reg.start);
            audioEngine.playPreviewSegments(
                [
                    {
                        segmentId: reg.id,
                        buffer: activeBuffer,
                        startSec: reg.start,
                        endSec: reg.end,
                    },
                ],
                loopPreview,
                previewVolume,
                () => {
                    setIsPlaying(false);
                    setPlayingSegmentId(null);
                    setPlayheadTime(null);
                },
            );
        },
        [activeBuffer, loopPreview, previewVolume],
    );

    const startCombinedQueuePreview = useCallback(() => {
        if (cutSegments.length === 0) return;
        setPreviewMode("combined-queue");
        setIsPlaying(true);
        setPlayingSegmentId(cutSegments[0].id);
        setPlayheadTime(null);
        audioEngine.playPreviewSegments(
            cutSegments.map((seg) => ({
                segmentId: seg.id,
                buffer: seg.buffer,
                startSec: seg.start,
                endSec: seg.end,
            })),
            loopPreview,
            previewVolume,
            () => {
                setIsPlaying(false);
                setPlayingSegmentId(null);
                setPlayheadTime(null);
            },
        );
    }, [cutSegments, loopPreview, previewVolume]);

    const startSingleQueuePreview = useCallback(
        (seg: QueuedSegment) => {
            setPreviewMode("single-queue");
            setIsPlaying(true);
            setPlayingSegmentId(seg.id);
            setPlayheadTime(seg.sourceKey === activeSourceKey ? seg.start : null);
            audioEngine.playPreviewSegments(
                [
                    {
                        segmentId: seg.id,
                        buffer: seg.buffer,
                        startSec: seg.start,
                        endSec: seg.end,
                    },
                ],
                false,
                previewVolume,
                () => {
                    setIsPlaying(false);
                    setPlayingSegmentId(null);
                    setPlayheadTime(null);
                },
            );
        },
        [activeSourceKey, previewVolume],
    );

    const stopPreview = useCallback(() => {
        audioEngine.stopPreviewBuffer();
        setIsPlaying(false);
        setPlayingSegmentId(null);
        setPlayheadTime(null);
    }, []);

    const toggleRegionsPreview = useCallback(() => {
        if (isPlaying && (previewMode === "regions" || previewMode === "single-region")) {
            stopPreview();
        } else {
            startAllRegionsPreview();
        }
    }, [isPlaying, previewMode, startAllRegionsPreview, stopPreview]);

    const toggleCombinedQueuePreview = useCallback(() => {
        if (isPlaying && previewMode === "combined-queue") {
            stopPreview();
        } else {
            startCombinedQueuePreview();
        }
    }, [isPlaying, previewMode, startCombinedQueuePreview, stopPreview]);

    // Sync loop toggle with active preview
    useEffect(() => {
        if (isPlaying) {
            audioEngine.updatePreviewLoop(loopPreview, trimStart, trimEnd);
        }
    }, [loopPreview, isPlaying, trimStart, trimEnd]);

    // Sync preview volume
    useEffect(() => {
        audioEngine.updatePreviewVolume(previewVolume);
    }, [previewVolume]);

    const handleRemoveRegion = useCallback(
        (id: string) => {
            if (isPlaying && playingSegmentId === id) {
                stopPreview();
            }
            setRegions((prev) => {
                if (prev.length <= 1) {
                    const reset: WaveformRegion = {
                        id: prev[0]?.id || makeUid("reg"),
                        start: 0,
                        end: fullDuration || 1,
                        isPristineFull: true,
                    };
                    setActiveRegionId(reset.id);
                    return [reset];
                }
                const filtered = prev.filter((r) => r.id !== id);
                if (activeRegionId === id && filtered.length > 0) {
                    setActiveRegionId(filtered[0].id);
                }
                return filtered;
            });
        },
        [isPlaying, playingSegmentId, stopPreview, fullDuration, activeRegionId],
    );

    // Spacebar to toggle preview, Delete/Backspace to remove focused selection
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (isCapturingHotkey || capturingRegionHotkeyId) return;
            const target = e.target as HTMLElement | null;
            if (
                target &&
                (target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA" ||
                    target.tagName === "SELECT" ||
                    target.isContentEditable)
            ) {
                return;
            }
            if (e.code === "Space" && activeBuffer) {
                e.preventDefault();
                e.stopPropagation();
                toggleRegionsPreview();
            } else if (
                (e.code === "Delete" || e.code === "Backspace") &&
                activeBuffer &&
                regions.length > 1
            ) {
                e.preventDefault();
                handleRemoveRegion(activeRegion.id);
            }
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [
        activeBuffer,
        isCapturingHotkey,
        capturingRegionHotkeyId,
        toggleRegionsPreview,
        regions.length,
        activeRegion.id,
        handleRemoveRegion,
    ]);

    // Hotkey capture for cutHotkey or per-region hotkey fields
    useEffect(() => {
        if (!isCapturingHotkey && !capturingRegionHotkeyId) return;
        const onCapture = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === "Escape") {
                setIsCapturingHotkey(false);
                setCapturingRegionHotkeyId(null);
                return;
            }
            const hk = extractHotkeyFromKeyboardEvent(e);
            if (hk) {
                if (capturingRegionHotkeyId) {
                    const targetRegionId = capturingRegionHotkeyId;
                    setRegions((prev) =>
                        prev.map((r) =>
                            r.id === targetRegionId
                                ? { ...r, hotkey: hk, addedToLibrary: false }
                                : r,
                        ),
                    );
                    setCapturingRegionHotkeyId(null);
                } else {
                    setCutHotkey(hk);
                    setIsCapturingHotkey(false);
                }
            }
        };
        window.addEventListener("keydown", onCapture, true);
        return () => window.removeEventListener("keydown", onCapture, true);
    }, [isCapturingHotkey, capturingRegionHotkeyId]);

    // 60fps Canvas Waveform + Multi-Selection Renderer + Live Playhead
    useEffect(() => {
        let rafId = 0;

        const render = () => {
            let liveTime: number | null = null;
            if (isPlaying) {
                const status = audioEngine.getPreviewStatus();
                if (status) {
                    if (status.segmentId) {
                        setPlayingSegmentId((prev) =>
                            prev === status.segmentId ? prev : status.segmentId,
                        );
                    }
                    if (
                        previewMode === "regions" ||
                        previewMode === "single-region"
                    ) {
                        liveTime = status.timeInBuffer;
                        setPlayheadTime(liveTime);
                    } else {
                        const matched = cutSegments.find(
                            (s) => s.id === status.segmentId,
                        );
                        if (matched && matched.sourceKey === activeSourceKey) {
                            liveTime = status.timeInBuffer;
                            setPlayheadTime(liveTime);
                        } else {
                            setPlayheadTime(null);
                        }
                    }
                }
            }

            const canvas = canvasRef.current;
            if (canvas) {
                const ctx = canvas.getContext("2d");
                if (ctx) {
                    const dpr = window.devicePixelRatio || 1;
                    const rect = canvas.getBoundingClientRect();
                    const w = Math.max(1, Math.floor(rect.width * dpr));
                    const h = Math.max(1, Math.floor(rect.height * dpr));

                    if (canvas.width !== w || canvas.height !== h) {
                        canvas.width = w;
                        canvas.height = h;
                    }

                    ctx.clearRect(0, 0, w, h);

                    const styles = getComputedStyle(document.documentElement);
                    const accentRgb =
                        styles.getPropertyValue("--accent-rgb").trim() ||
                        "34, 197, 94";
                    const accentHex =
                        styles.getPropertyValue("--accent").trim() || "#22c55e";
                    const accentText =
                        styles.getPropertyValue("--accent-text").trim() ||
                        "#4ade80";
                    const textPrimary =
                        styles.getPropertyValue("--text-primary").trim() ||
                        "#ededed";
                    const textMuted =
                        styles.getPropertyValue("--text-muted").trim() ||
                        "#71717a";
                    const subtleBorder =
                        styles.getPropertyValue("--border-subtle").trim() ||
                        "rgba(255,255,255,0.08)";

                    const rulerH = 22 * dpr;
                    const waveTop = rulerH;
                    const waveH = Math.max(20, h - rulerH);
                    const midY = waveTop + waveH / 2;

                    // Center line
                    ctx.fillStyle = subtleBorder;
                    ctx.fillRect(0, midY - 0.5 * dpr, w, dpr);

                    if (waveformPeaks && fullDuration > 0) {
                        const visibleSpan = Math.max(0.02, viewEnd - viewStart);
                        const timeToX = (sec: number) =>
                            ((sec - viewStart) / visibleSpan) * w;

                        const getRegionColors = (reg: WaveformRegion, idx: number) => {
                            const isActive = reg.id === activeRegion.id;
                            if (isActive) {
                                return {
                                    hex: accentHex,
                                    bright: accentText,
                                    rgb: accentRgb,
                                    isActive: true,
                                };
                            }
                            const pal = REGION_PALETTE[(idx - 1 + REGION_PALETTE.length) % REGION_PALETTE.length];
                            return {
                                hex: pal.hex,
                                bright: pal.hex,
                                rgb: pal.rgb,
                                isActive: false,
                            };
                        };

                        // 1. Draw shaded backgrounds for each selected region
                        regions.forEach((reg, idx) => {
                            const sx = Math.max(0, timeToX(reg.start));
                            const ex = Math.min(w, timeToX(reg.end));
                            if (ex <= sx) return;
                            const col = getRegionColors(reg, idx);
                            const isPlayingThis = isPlaying && playingSegmentId === reg.id;
                            ctx.fillStyle = `rgba(${col.rgb}, ${
                                isPlayingThis ? 0.28 : col.isActive ? 0.16 : 0.12
                            })`;
                            ctx.fillRect(sx, waveTop, ex - sx, waveH);

                            // Top accent bar on each region
                            ctx.fillStyle = col.bright;
                            ctx.fillRect(sx, waveTop, ex - sx, col.isActive ? 2.5 * dpr : 1.5 * dpr);
                        });

                        // 2. Draw waveform bars colored by whichever region covers that time
                        const pxStep = Math.max(2 * dpr, 2.5 * dpr);
                        const barWidth = Math.max(1.4 * dpr, pxStep * 0.68);
                        const totalBuckets = waveformPeaks.length;

                        for (let px = 0; px < w; px += pxStep) {
                            const sec = viewStart + (px / w) * visibleSpan;
                            const bucketIdx = Math.min(
                                totalBuckets - 1,
                                Math.max(
                                    0,
                                    Math.floor((sec / fullDuration) * totalBuckets),
                                ),
                            );
                            const amp = waveformPeaks[bucketIdx] || 0;
                            const barHalf = Math.max(
                                1.5 * dpr,
                                amp * (waveH * 0.41),
                            );

                            // Prefer active region color if overlapping
                            let barColor = "rgba(161, 161, 170, 0.28)";
                            let matchedActive = false;
                            for (let rIdx = 0; rIdx < regions.length; rIdx += 1) {
                                const r = regions[rIdx];
                                if (sec >= r.start && sec <= r.end) {
                                    const col = getRegionColors(r, rIdx);
                                    if (col.isActive) {
                                        barColor = amp > 0.72 ? col.bright : col.hex;
                                        matchedActive = true;
                                        break;
                                    } else if (!matchedActive) {
                                        barColor = col.hex;
                                    }
                                }
                            }

                            ctx.fillStyle = barColor;
                            ctx.fillRect(
                                px,
                                midY - barHalf,
                                barWidth,
                                barHalf * 2,
                            );
                        }

                        // 3. Time Ruler
                        ctx.fillStyle = subtleBorder;
                        ctx.fillRect(0, rulerH - dpr, w, dpr);

                        const tickCount = 6;
                        ctx.fillStyle = textMuted;
                        ctx.font = `${Math.round(10 * dpr)}px "JetBrains Mono", monospace`;
                        ctx.textBaseline = "middle";
                        for (let tIdx = 0; tIdx <= tickCount; tIdx += 1) {
                            const tickSec =
                                viewStart + (tIdx / tickCount) * visibleSpan;
                            const tx = (tIdx / tickCount) * w;
                            ctx.fillRect(tx, rulerH - 5 * dpr, dpr, 5 * dpr);
                            const label = formatTimePrecise(tickSec);
                            ctx.textAlign =
                                tIdx === 0
                                    ? "left"
                                    : tIdx === tickCount
                                      ? "right"
                                      : "center";
                            ctx.fillText(
                                label,
                                tIdx === 0
                                    ? 6 * dpr
                                    : tIdx === tickCount
                                      ? w - 6 * dpr
                                      : tx,
                                rulerH / 2,
                            );
                        }

                        const drawHandlePill = (hx: number, fill: string) => {
                            ctx.fillStyle = fill;
                            const pillX = hx - 6.5 * dpr;
                            const pillY = waveTop;
                            const pillW = 13 * dpr;
                            const pillH = 15 * dpr;
                            ctx.beginPath();
                            if (typeof ctx.roundRect === "function") {
                                ctx.roundRect(pillX, pillY, pillW, pillH, 4 * dpr);
                            } else {
                                ctx.rect(pillX, pillY, pillW, pillH);
                            }
                            ctx.fill();
                        };

                        // 4. Draw Handles + #N Labels for non-active first, then active on top
                        const orderedIndices = regions
                            .map((_, idx) => idx)
                            .sort((a, b) => {
                                if (regions[a].id === activeRegion.id) return 1;
                                if (regions[b].id === activeRegion.id) return -1;
                                return a - b;
                            });

                        for (const idx of orderedIndices) {
                            const reg = regions[idx];
                            const col = getRegionColors(reg, idx);
                            const sx = timeToX(reg.start);
                            const ex = timeToX(reg.end);
                            const lineW = col.isActive ? 3 * dpr : 2 * dpr;

                            if (sx >= -10 * dpr && sx <= w + 10 * dpr) {
                                ctx.fillStyle = col.bright;
                                ctx.fillRect(sx - lineW / 2, waveTop, lineW, waveH);
                                drawHandlePill(sx, col.bright);
                            }

                            if (ex >= -10 * dpr && ex <= w + 10 * dpr) {
                                ctx.fillStyle = col.bright;
                                ctx.fillRect(ex - lineW / 2, waveTop, lineW, waveH);
                                drawHandlePill(ex, col.bright);
                            }

                            // #N (+ optional custom label) badge at bottom-left of region
                            if (regions.length > 1 || !reg.isPristineFull || Boolean(reg.label?.trim())) {
                                const clampedSx = Math.max(2 * dpr, sx + 4 * dpr);
                                const clampedEx = Math.min(w, ex);
                                const availW = Math.max(0, clampedEx - clampedSx - 2 * dpr);
                                const cleanLabel = reg.label?.trim();
                                const fullBadgeText = cleanLabel
                                    ? `#${idx + 1} · ${cleanLabel}`
                                    : `#${idx + 1}`;
                                const shortBadgeText = `#${idx + 1}`;
                                ctx.font = `700 ${Math.round(10 * dpr)}px "JetBrains Mono", monospace`;
                                const fullW = ctx.measureText(fullBadgeText).width + 10 * dpr;
                                const shortW = ctx.measureText(shortBadgeText).width + 10 * dpr;
                                const badgeText =
                                    fullW <= availW || !cleanLabel
                                        ? fullBadgeText
                                        : shortBadgeText;
                                const badgeW =
                                    badgeText === fullBadgeText ? fullW : shortW;
                                if (clampedEx - clampedSx >= badgeW * 0.75) {
                                    ctx.fillStyle = "rgba(9, 9, 11, 0.85)";
                                    ctx.beginPath();
                                    if (typeof ctx.roundRect === "function") {
                                        ctx.roundRect(
                                            clampedSx,
                                            h - 19 * dpr,
                                            badgeW,
                                            15 * dpr,
                                            4 * dpr,
                                        );
                                    } else {
                                        ctx.rect(clampedSx, h - 19 * dpr, badgeW, 15 * dpr);
                                    }
                                    ctx.fill();
                                    ctx.fillStyle = col.bright;
                                    ctx.textAlign = "left";
                                    ctx.textBaseline = "middle";
                                    ctx.fillText(badgeText, clampedSx + 5 * dpr, h - 11.5 * dpr);
                                }
                            }
                        }

                        // 5. Draw Cursor / Live Playhead
                        const markerSec =
                            liveTime !== null ? liveTime : cursorTime;
                        if (markerSec >= viewStart && markerSec <= viewEnd) {
                            const mx = timeToX(markerSec);
                            ctx.fillStyle =
                                liveTime !== null
                                    ? textPrimary
                                    : "rgba(255,255,255,0.45)";
                            ctx.fillRect(mx - dpr, waveTop, 2 * dpr, waveH);
                        }
                    }
                }
            }

            if (isPlaying) {
                rafId = requestAnimationFrame(render);
            }
        };

        render();
        return () => {
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [
        isDecoding,
        activeBuffer,
        waveformPeaks,
        fullDuration,
        viewStart,
        viewEnd,
        regions,
        activeRegion.id,
        cursorTime,
        isPlaying,
        previewMode,
        cutSegments,
        activeSourceKey,
        playingSegmentId,
        canvasSizeTick,
    ]);

    const xToTime = useCallback(
        (clientX: number): number => {
            const canvas = canvasRef.current;
            if (!canvas || fullDuration <= 0) return 0;
            const rect = canvas.getBoundingClientRect();
            const ratio = Math.max(
                0,
                Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)),
            );
            return viewStart + ratio * (viewEnd - viewStart);
        },
        [fullDuration, viewStart, viewEnd],
    );

    const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!activeBuffer || fullDuration <= 0) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const span = Math.max(0.02, viewEnd - viewStart);
        const timeToPx = (sec: number) =>
            rect.left + ((sec - viewStart) / span) * rect.width;

        // 1. Check edge handles across all regions (prefer activeRegion on tie)
        const checkOrder = [...regions].sort((a, b) => {
            if (a.id === activeRegion.id) return -1;
            if (b.id === activeRegion.id) return 1;
            return 0;
        });

        let bestHandle: { type: "resize-start" | "resize-end"; regionId: string; dist: number } | null = null;
        for (const reg of checkOrder) {
            const distS = Math.abs(e.clientX - timeToPx(reg.start));
            const distE = Math.abs(e.clientX - timeToPx(reg.end));
            if (distS <= 13 && (!bestHandle || distS < bestHandle.dist)) {
                bestHandle = { type: "resize-start", regionId: reg.id, dist: distS };
            }
            if (distE <= 13 && (!bestHandle || distE < bestHandle.dist)) {
                bestHandle = { type: "resize-end", regionId: reg.id, dist: distE };
            }
        }

        canvas.setPointerCapture(e.pointerId);

        if (bestHandle) {
            setActiveRegionId(bestHandle.regionId);
            dragStateRef.current = {
                type: bestHandle.type,
                regionId: bestHandle.regionId,
            };
            return;
        }

        const clickedTime = xToTime(e.clientX);
        const forceNewRegion = e.shiftKey || e.ctrlKey || e.metaKey;

        // 2. Check if clicked inside an existing non-pristine region (focus & allow sliding it)
        if (!forceNewRegion) {
            const hitRegion = checkOrder.find(
                (r) => !r.isPristineFull && clickedTime >= r.start && clickedTime <= r.end,
            );
            if (hitRegion) {
                setActiveRegionId(hitRegion.id);
                setCursorTime(clickedTime);
                dragStateRef.current = {
                    type: "move-region",
                    regionId: hitRegion.id,
                    startClientX: e.clientX,
                    initialStart: hitRegion.start,
                    initialEnd: hitRegion.end,
                    moved: false,
                };
                return;
            }
        }

        // 3. Otherwise, dragging creates a NEW selection region (Multi-Select!)
        setCursorTime(clickedTime);
        dragStateRef.current = {
            type: "new-region",
            anchorTime: clickedTime,
            createdRegionId: null,
        };
    };

    const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const drag = dragStateRef.current;
        if (!drag || fullDuration <= 0) return;

        const tSec = xToTime(e.clientX);

        if (drag.type === "resize-start") {
            setRegions((prev) =>
                prev.map((r) => {
                    if (r.id !== drag.regionId) return r;
                    const clamped = Math.max(
                        0,
                        Math.min(r.end - MIN_CLIP_SECONDS, tSec),
                    );
                    setCursorTime(clamped);
                    return { ...r, start: clamped, isPristineFull: false, addedToLibrary: false };
                }),
            );
        } else if (drag.type === "resize-end") {
            setRegions((prev) =>
                prev.map((r) => {
                    if (r.id !== drag.regionId) return r;
                    const clamped = Math.min(
                        fullDuration,
                        Math.max(r.start + MIN_CLIP_SECONDS, tSec),
                    );
                    return { ...r, end: clamped, isPristineFull: false, addedToLibrary: false };
                }),
            );
        } else if (drag.type === "move-region") {
            if (!drag.moved && Math.abs(e.clientX - drag.startClientX) < 4) {
                return;
            }
            drag.moved = true;
            const anchorSec = xToTime(drag.startClientX);
            const deltaSec = tSec - anchorSec;
            const width = drag.initialEnd - drag.initialStart;
            const nextStart = Math.max(
                0,
                Math.min(fullDuration - width, drag.initialStart + deltaSec),
            );
            const nextEnd = nextStart + width;
            setRegions((prev) =>
                prev.map((r) =>
                    r.id === drag.regionId
                        ? { ...r, start: nextStart, end: nextEnd, isPristineFull: false, addedToLibrary: false }
                        : r,
                ),
            );
        } else if (drag.type === "new-region") {
            const anchor = drag.anchorTime;
            if (Math.abs(tSec - anchor) >= 0.03) {
                const nextStart = Math.max(0, Math.min(anchor, tSec));
                const nextEnd = Math.min(fullDuration, Math.max(anchor, tSec));
                if (nextEnd - nextStart >= MIN_CLIP_SECONDS) {
                    if (!drag.createdRegionId) {
                        const newId = makeUid("reg");
                        drag.createdRegionId = newId;
                        setActiveRegionId(newId);
                        setRegions((prev) => {
                            const hasOnlyPristine =
                                prev.length === 1 && prev[0].isPristineFull;
                            const nextReg: WaveformRegion = {
                                id: newId,
                                start: nextStart,
                                end: nextEnd,
                                selectedForExport: true,
                                addedToLibrary: false,
                                isPristineFull: false,
                            };
                            return hasOnlyPristine
                                ? [nextReg]
                                : [...prev, nextReg];
                        });
                    } else {
                        const targetId = drag.createdRegionId;
                        setRegions((prev) =>
                            prev.map((r) =>
                                r.id === targetId
                                    ? {
                                          ...r,
                                          start: nextStart,
                                          end: nextEnd,
                                          isPristineFull: false,
                                          addedToLibrary: false,
                                      }
                                    : r,
                            ),
                        );
                    }
                }
            }
        }
    };

    const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!dragStateRef.current) return;
        try {
            canvasRef.current?.releasePointerCapture(e.pointerId);
        } catch {
            // ignore
        }
        dragStateRef.current = null;
    };

    const nudgeActiveStart = (delta: number) => {
        if (fullDuration <= 0) return;
        setRegions((prev) =>
            prev.map((r) => {
                if (r.id !== activeRegion.id) return r;
                const next = Math.max(
                    0,
                    Math.min(r.end - MIN_CLIP_SECONDS, r.start + delta),
                );
                return { ...r, start: next, isPristineFull: false, addedToLibrary: false };
            }),
        );
    };

    const nudgeActiveEnd = (delta: number) => {
        if (fullDuration <= 0) return;
        setRegions((prev) =>
            prev.map((r) => {
                if (r.id !== activeRegion.id) return r;
                const next = Math.min(
                    fullDuration,
                    Math.max(r.start + MIN_CLIP_SECONDS, r.end + delta),
                );
                return { ...r, end: next, isPristineFull: false, addedToLibrary: false };
            }),
        );
    };

    const handleAddNewRegionButton = () => {
        if (!activeBuffer || fullDuration <= 0) return;

        // If still untouched full range, trim first region to first 35% and add a second region at 55%-90%
        if (regions.length === 1 && regions[0].isPristineFull) {
            const firstEnd = Math.max(MIN_CLIP_SECONDS, fullDuration * 0.35);
            const secondStart = Math.min(fullDuration - MIN_CLIP_SECONDS * 2, fullDuration * 0.55);
            const secondEnd = Math.min(fullDuration, fullDuration * 0.9);
            const id1 = regions[0].id;
            const id2 = makeUid("reg");
            setRegions([
                {
                    ...regions[0],
                    id: id1,
                    start: 0,
                    end: firstEnd,
                    selectedForExport: true,
                    addedToLibrary: false,
                    isPristineFull: false,
                },
                {
                    id: id2,
                    start: secondStart,
                    end: Math.max(secondStart + MIN_CLIP_SECONDS, secondEnd),
                    selectedForExport: true,
                    addedToLibrary: false,
                    isPristineFull: false,
                },
            ]);
            setActiveRegionId(id2);
            return;
        }

        // Find largest unselected gap in [0, fullDuration]
        const sorted = [...regions].sort((a, b) => a.start - b.start);
        let bestGapStart = 0;
        let bestGapLen = 0;
        let cursor = 0;

        for (const r of sorted) {
            if (r.start > cursor) {
                const gap = r.start - cursor;
                if (gap > bestGapLen) {
                    bestGapLen = gap;
                    bestGapStart = cursor;
                }
            }
            if (r.end > cursor) cursor = r.end;
        }
        if (fullDuration - cursor > bestGapLen) {
            bestGapLen = fullDuration - cursor;
            bestGapStart = cursor;
        }

        const newId = makeUid("reg");
        let newStart = 0;
        let newEnd = Math.min(fullDuration, 0.25);

        if (bestGapLen >= MIN_CLIP_SECONDS * 2) {
            const pad = Math.min(bestGapLen * 0.1, 0.05);
            newStart = bestGapStart + pad;
            newEnd = Math.max(
                newStart + MIN_CLIP_SECONDS,
                bestGapStart + bestGapLen - pad,
            );
        } else {
            // Split the active region in half so user always gets a clean second selection
            const target = activeRegion;
            const span = target.end - target.start;
            if (span >= MIN_CLIP_SECONDS * 3) {
                const mid = target.start + span * 0.45;
                const gap = Math.min(span * 0.1, 0.05);
                newStart = mid + gap;
                newEnd = target.end;
                setRegions((prev) => [
                    ...prev.map((r) =>
                        r.id === target.id
                            ? {
                                  ...r,
                                  end: Math.max(r.start + MIN_CLIP_SECONDS, mid - gap),
                                  isPristineFull: false,
                                  addedToLibrary: false,
                              }
                            : r,
                    ),
                    {
                        id: newId,
                        start: newStart,
                        end: newEnd,
                        selectedForExport: true,
                        addedToLibrary: false,
                        isPristineFull: false,
                    },
                ]);
                setActiveRegionId(newId);
                return;
            }
            newStart = Math.max(0, Math.min(fullDuration - MIN_CLIP_SECONDS, cursorTime));
            newEnd = Math.min(fullDuration, Math.max(newStart + MIN_CLIP_SECONDS, newStart + Math.min(0.4, fullDuration * 0.25)));
        }

        setRegions((prev) => [
            ...prev,
            {
                id: newId,
                start: newStart,
                end: newEnd,
                selectedForExport: true,
                addedToLibrary: false,
                isPristineFull: false,
            },
        ]);
        setActiveRegionId(newId);
    };

    const handleInvertActiveSelection = () => {
        if (!activeBuffer || fullDuration <= 0) return;
        const leftValid = trimStart >= MIN_CLIP_SECONDS;
        const rightValid = fullDuration - trimEnd >= MIN_CLIP_SECONDS;
        const nextList: WaveformRegion[] = [];
        if (leftValid) {
            nextList.push({
                id: makeUid("reg"),
                start: 0,
                end: trimStart,
                selectedForExport: true,
                isPristineFull: false,
            });
        }
        if (rightValid) {
            nextList.push({
                id: makeUid("reg"),
                start: trimEnd,
                end: fullDuration,
                selectedForExport: true,
                isPristineFull: false,
            });
        }
        if (nextList.length === 0) return;
        setRegions(nextList);
        setActiveRegionId(nextList[0].id);
        setCursorTime(nextList[0].start);
    };

    const handleSortRegionsByTime = () => {
        setRegions((prev) => [...prev].sort((a, b) => a.start - b.start));
    };

    const handleResetTrim = () => {
        if (fullDuration <= 0) return;
        const resetId = makeUid("reg");
        setRegions([
            {
                id: resetId,
                start: 0,
                end: fullDuration,
                selectedForExport: true,
                isPristineFull: true,
            },
        ]);
        setActiveRegionId(resetId);
        setCursorTime(0);
    };

    const handleUpdateRegionLabel = (regionId: string, nextLabel: string) => {
        setRegions((prev) =>
            prev.map((r) =>
                r.id === regionId
                    ? { ...r, label: nextLabel, addedToLibrary: false }
                    : r,
            ),
        );
    };

    const handleToggleRegionSelectedForExport = (regionId: string) => {
        setRegions((prev) =>
            prev.map((r) =>
                r.id === regionId
                    ? { ...r, selectedForExport: r.selectedForExport === false }
                    : r,
            ),
        );
    };

    const handleToggleAllRegionsSelectedForExport = () => {
        const allSelected = regions.every((r) => r.selectedForExport !== false);
        setRegions((prev) =>
            prev.map((r) => ({ ...r, selectedForExport: !allSelected })),
        );
    };

    const handleAddWaveformRegionsToQueue = () => {
        if (!activeBuffer || regions.length === 0) return;
        const newSegs: QueuedSegment[] = regions.map((r) => ({
            id: makeUid("seg"),
            start: Math.round(r.start * 1000) / 1000,
            end: Math.round(r.end * 1000) / 1000,
            dataUrl: activeAudioPayload.dataUrl,
            synthPreset: activeAudioPayload.synthPreset,
            sourceSoundId: activeAudioPayload.sourceSoundId,
            label: r.label?.trim() || activeSourceTitle,
            buffer: activeBuffer,
            sourceKey: activeSourceKey,
            sourceTitle: activeSourceTitle,
        }));
        setCutSegments((prev) => [...prev, ...newSegs]);
        setFeedbackBanner(null);
    };

    const handleMoveSegment = (index: number, delta: -1 | 1) => {
        const targetIndex = index + delta;
        if (targetIndex < 0 || targetIndex >= cutSegments.length) return;
        setCutSegments((prev) => {
            const copy = [...prev];
            const [item] = copy.splice(index, 1);
            copy.splice(targetIndex, 0, item);
            return copy;
        });
    };

    const handleDuplicateSegment = (index: number) => {
        const seg = cutSegments[index];
        if (!seg) return;
        setCutSegments((prev) => {
            const copy = [...prev];
            copy.splice(index + 1, 0, { ...seg, id: makeUid("seg") });
            return copy;
        });
    };

    const handleRemoveQueueSegment = (id: string) => {
        setCutSegments((prev) => prev.filter((s) => s.id !== id));
    };

    const handleClearSegments = () => {
        if (isPlaying && (previewMode === "combined-queue" || previewMode === "single-queue")) {
            stopPreview();
        }
        setCutSegments([]);
    };

    const canInvertCut = useMemo(() => {
        if (!activeBuffer) return false;
        return (
            trimStart >= MIN_CLIP_SECONDS ||
            activeBuffer.duration - trimEnd >= MIN_CLIP_SECONDS
        );
    }, [activeBuffer, trimStart, trimEnd]);

    // Build persisted segments from either cross-sound queue OR current waveform multi-selection
    const effectiveExportList = useMemo<
        Array<Pick<SoundSegment, "id" | "start" | "end" | "dataUrl" | "synthPreset" | "sourceSoundId" | "label">>
    >(() => {
        if (cutSegments.length > 0) {
            return toPersistedSegments(cutSegments);
        }
        return toPersistedSegments(
            regions.map((r) => ({
                id: r.id,
                start: r.start,
                end: r.end,
                dataUrl: activeAudioPayload.dataUrl,
                synthPreset: activeAudioPayload.synthPreset,
                sourceSoundId: activeAudioPayload.sourceSoundId,
                label: r.label?.trim() || activeSourceTitle,
            })),
        );
    }, [
        cutSegments,
        regions,
        activeAudioPayload,
        activeSourceTitle,
    ]);

    const presetLabelTags = useMemo(
        () => [
            t("lirMaker.presetIntro"),
            t("lirMaker.presetChorus"),
            t("lirMaker.presetOutro"),
            t("lirMaker.presetDrop"),
            t("lirMaker.presetBridge"),
            t("lirMaker.presetSolo"),
        ],
        [t],
    );

    const stripMakerSuffix = useCallback(
        (raw: string): string => {
            const suffix = t("lirMaker.cutSuffix").trim();
            const trimmed = raw.trim();
            if (!trimmed || !suffix) return trimmed;
            if (trimmed.endsWith(suffix)) {
                return trimmed.slice(0, trimmed.length - suffix.length).trim();
            }
            return trimmed;
        },
        [t],
    );

    const buildSliceTitle = useCallback(
        (
            customLabel: string | undefined,
            fallbackIndex: number,
            sourceTitleFallback?: string,
        ): string => {
            const cleanLabel = customLabel?.trim();
            const cleanBase = stripMakerSuffix(cutTitle);
            if (cleanLabel) {
                return cleanBase ? `${cleanBase} - ${cleanLabel}` : cleanLabel;
            }
            const base = cleanBase || sourceTitleFallback || activeSourceTitle;
            return `${base} #${fallbackIndex + 1}`;
        },
        [stripMakerSuffix, cutTitle, activeSourceTitle],
    );

    const selectedRegionsForSeparate = useMemo(
        () =>
            regions
                .map((reg, index) => ({ reg, index }))
                .filter(({ reg }) => reg.selectedForExport !== false),
        [regions],
    );

    const separateExportCount =
        cutSegments.length > 0
            ? cutSegments.length
            : selectedRegionsForSeparate.length;

    const handleAddSingleRegionToBoard = (reg: WaveformRegion, idx: number) => {
        if (!activeBuffer) return;
        const clipDur = Math.max(
            MIN_CLIP_SECONDS,
            Math.round((reg.end - reg.start) * 1000) / 1000,
        );
        const title = buildSliceTitle(reg.label, idx);
        const regionHotkey = (reg.hotkey ?? "").trim().toUpperCase();

        onAddCutToBoard({
            title,
            category: cutCategory,
            hotkey: regionHotkey,
            duration: clipDur,
            volume:
                sourceMode === "board" && selectedBoardSound
                    ? selectedBoardSound.volume ?? 1.0
                    : 1.0,
            isFavorite: false,
            loop: false,
            playMode:
                sourceMode === "board" && selectedBoardSound
                    ? selectedBoardSound.playMode ?? "overlap"
                    : "overlap",
            dataUrl: activeAudioPayload.dataUrl,
            synthPreset: activeAudioPayload.synthPreset,
            sourceSoundId: activeAudioPayload.sourceSoundId,
            trimStart: Math.round(reg.start * 1000) / 1000,
            trimEnd: Math.round(reg.end * 1000) / 1000,
        });

        setRegions((prev) =>
            prev.map((r) =>
                r.id === reg.id ? { ...r, addedToLibrary: true } : r,
            ),
        );
        setFeedbackBanner(t("lirMaker.savedNewToast", { title }));
    };

    const handleAddCut = () => {
        if (effectiveExportList.length === 0) return;
        const first = effectiveExportList[0];
        const totalDur = Math.max(
            MIN_CLIP_SECONDS,
            Math.round(
                effectiveExportList.reduce(
                    (sum, s) => sum + Math.max(MIN_CLIP_SECONDS, s.end - s.start),
                    0,
                ) * 1000,
            ) / 1000,
        );

        const singleRegionCustomLabel =
            cutSegments.length === 0 && regions.length === 1
                ? regions[0]?.label?.trim()
                : undefined;

        const title = singleRegionCustomLabel
            ? buildSliceTitle(singleRegionCustomLabel, 0)
            : cutTitle.trim() ||
              `${first.label || activeSourceTitle} ${t("lirMaker.cutSuffix")}`;

        onAddCutToBoard({
            title,
            category: cutCategory,
            hotkey: cutHotkey.trim().toUpperCase(),
            duration: totalDur,
            volume:
                cutSegments.length === 0 && sourceMode === "board" && selectedBoardSound
                    ? selectedBoardSound.volume ?? 1.0
                    : 1.0,
            isFavorite: false,
            loop: false,
            playMode:
                cutSegments.length === 0 && sourceMode === "board" && selectedBoardSound
                    ? selectedBoardSound.playMode ?? "overlap"
                    : "overlap",
            dataUrl: first.dataUrl,
            synthPreset: first.synthPreset,
            sourceSoundId: first.sourceSoundId,
            trimStart: effectiveExportList.length === 1 ? first.start : undefined,
            trimEnd: effectiveExportList.length === 1 ? first.end : undefined,
            segments: effectiveExportList.length > 1 ? effectiveExportList : undefined,
        });

        setFeedbackBanner(t("lirMaker.savedNewToast", { title }));
    };

    const handleAddAsSeparateSounds = () => {
        if (cutSegments.length > 0) {
            const reversed = [...cutSegments].reverse();
            reversed.forEach((seg, revIdx) => {
                const idx = cutSegments.length - revIdx - 1;
                const clipDur = Math.max(
                    MIN_CLIP_SECONDS,
                    Math.round((seg.end - seg.start) * 1000) / 1000,
                );
                const customLabel =
                    seg.label && seg.label.trim() !== seg.sourceTitle.trim()
                        ? seg.label.trim()
                        : undefined;
                const title = buildSliceTitle(customLabel, idx, seg.sourceTitle);
                onAddCutToBoard({
                    title,
                    category: cutCategory,
                    hotkey: idx === 0 ? cutHotkey.trim().toUpperCase() : "",
                    duration: clipDur,
                    volume: 1.0,
                    isFavorite: false,
                    loop: false,
                    playMode: "overlap",
                    dataUrl: seg.dataUrl,
                    synthPreset: seg.synthPreset,
                    sourceSoundId: seg.sourceSoundId,
                    trimStart: seg.start,
                    trimEnd: seg.end,
                });
            });

            setFeedbackBanner(
                t("lirMaker.savedSeparateToast", {
                    count: cutSegments.length,
                }),
            );
            return;
        }

        if (selectedRegionsForSeparate.length === 0 || !activeBuffer) return;

        const anyRegionHasHotkey = selectedRegionsForSeparate.some(({ reg }) =>
            Boolean(reg.hotkey?.trim()),
        );
        const exportedIds = new Set<string>();
        const reversed = [...selectedRegionsForSeparate].reverse();

        reversed.forEach(({ reg, index }, revIdx) => {
            const orderPos = selectedRegionsForSeparate.length - 1 - revIdx;
            const clipDur = Math.max(
                MIN_CLIP_SECONDS,
                Math.round((reg.end - reg.start) * 1000) / 1000,
            );
            const title = buildSliceTitle(reg.label, index);
            const resolvedHotkey =
                reg.hotkey?.trim().toUpperCase() ||
                (orderPos === 0 && !anyRegionHasHotkey
                    ? cutHotkey.trim().toUpperCase()
                    : "");

            exportedIds.add(reg.id);
            onAddCutToBoard({
                title,
                category: cutCategory,
                hotkey: resolvedHotkey,
                duration: clipDur,
                volume:
                    sourceMode === "board" && selectedBoardSound
                        ? selectedBoardSound.volume ?? 1.0
                        : 1.0,
                isFavorite: false,
                loop: false,
                playMode:
                    sourceMode === "board" && selectedBoardSound
                        ? selectedBoardSound.playMode ?? "overlap"
                        : "overlap",
                dataUrl: activeAudioPayload.dataUrl,
                synthPreset: activeAudioPayload.synthPreset,
                sourceSoundId: activeAudioPayload.sourceSoundId,
                trimStart: Math.round(reg.start * 1000) / 1000,
                trimEnd: Math.round(reg.end * 1000) / 1000,
            });
        });

        setRegions((prev) =>
            prev.map((r) =>
                exportedIds.has(r.id) ? { ...r, addedToLibrary: true } : r,
            ),
        );
        setFeedbackBanner(
            t("lirMaker.savedSeparateToast", {
                count: selectedRegionsForSeparate.length,
            }),
        );
    };

    const handleUpdateOriginal = () => {
        if (sourceMode !== "board" || !selectedBoardSound) return;
        if (effectiveExportList.length > 1) {
            onUpdateSoundTrim(
                selectedBoardSound.id,
                effectiveExportList[0].start,
                effectiveExportList[0].end,
                undefined,
                effectiveExportList,
            );
        } else if (effectiveExportList.length === 1) {
            onUpdateSoundTrim(
                selectedBoardSound.id,
                effectiveExportList[0].start,
                effectiveExportList[0].end,
            );
        }
        setFeedbackBanner(
            t("lirMaker.updatedToast", { title: selectedBoardSound.title }),
        );
    };

    const boardSourceOptions = useMemo<LirSelectOption[]>(() => {
        const musicBoardSounds: LirSelectOption[] = [];
        const regularBoardSounds: LirSelectOption[] = [];
        const boardAudioUrls = new Set<string>();

        for (const s of sounds) {
            const isYtAudio = Boolean(s.dataUrl?.startsWith("/api/youtube/audio/"));
            if (s.dataUrl) {
                boardAudioUrls.add(s.dataUrl);
            }
            const opt: LirSelectOption = {
                value: `board:${s.id}`,
                label: s.title,
                sublabel: isYtAudio
                    ? t("lirMaker.sourceBadgeMusic")
                    : t(`categories.${s.category}`) || s.category,
                meta: formatTimePrecise(s.duration),
                hotkey: s.hotkey || undefined,
                group: isYtAudio
                    ? t("lirMaker.groupSpotifyYouTube")
                    : t("lirMaker.groupSoundboard"),
                icon: isYtAudio ? (
                    <Disc3 className="w-3.5 h-3.5" />
                ) : (
                    <Music className="w-3.5 h-3.5" />
                ),
                keywords: `${s.title} ${s.category} ${s.hotkey || ""} ${isYtAudio ? "spotify youtube müzik" : ""}`,
            };
            if (isYtAudio) {
                musicBoardSounds.push(opt);
            } else {
                regularBoardSounds.push(opt);
            }
        }

        const cachedOnlyOptions: LirSelectOption[] = cachedYouTubeTracks
            .filter((tr) => !boardAudioUrls.has(tr.audioUrl))
            .map((tr) => ({
                value: `ytcache:${tr.videoId}`,
                label: tr.title,
                sublabel: `${tr.channelTitle} · ${t("lirMaker.cachedNotOnBoard")}`,
                meta: tr.durationSec > 0 ? formatTimePrecise(tr.durationSec) : undefined,
                group: t("lirMaker.groupSpotifyYouTube"),
                icon: <Disc3 className="w-3.5 h-3.5" />,
                keywords: `${tr.title} ${tr.channelTitle} spotify youtube cache`,
            }));

        return [...musicBoardSounds, ...cachedOnlyOptions, ...regularBoardSounds];
    }, [sounds, cachedYouTubeTracks, t]);

    const selectedDropdownValue = selectedCacheVideoId
        ? `ytcache:${selectedCacheVideoId}`
        : selectedBoardId
          ? `board:${selectedBoardId}`
          : "";

    const categoryOptions = useMemo<LirSelectOption[]>(
        () =>
            CATEGORIES.map((cat) => ({
                value: cat,
                label: t(`categories.${cat}`) || cat,
            })),
        [t],
    );

    const showExportSection = Boolean(activeBuffer || cutSegments.length > 0);
    const activeBadgeColor =
        activeRegionIndex === 0
            ? null
            : REGION_PALETTE[(activeRegionIndex - 1 + REGION_PALETTE.length) % REGION_PALETTE.length];

    return (
        <div className="flex-1 flex flex-col gap-5 w-full">
            {/* Page Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 ui-inner bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
                        <Scissors className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                                {t("lirMaker.title")}
                            </h1>
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono border border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--accent-text)] px-2.5 py-0.5 ui-control font-semibold">
                                <Sparkles className="w-3 h-3" />
                                <span>{t("lirMaker.noRenderBadge")}</span>
                            </span>
                        </div>
                        <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] mt-0.5">
                            {t("lirMaker.subtitle")}
                        </p>
                    </div>
                </div>
            </div>

            {/* Feedback Banner */}
            <AnimatePresence>
                {feedbackBanner && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        className="p-3.5 ui-inner border bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--text-primary)] text-xs flex flex-wrap items-center justify-between gap-3"
                    >
                        <div className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-[var(--accent-text)] shrink-0" />
                            <span className="font-medium">{feedbackBanner}</span>
                        </div>
                        <button
                            type="button"
                            onClick={onGoToSoundboard}
                            className="btn-accent inline-flex items-center gap-1.5 px-3 py-1.5 ui-control text-xs font-semibold cursor-pointer"
                        >
                            <span>{t("lirMaker.goToBoard")}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 1. Source Selection Card */}
            <section className="app-card ui-card border border-[var(--border-card)] p-5 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Music className="w-4 h-4 text-[var(--accent-text)]" />
                        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                            {t("lirMaker.sourceTitle")}
                        </h2>
                    </div>

                    <div className="inline-flex p-1 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] gap-1">
                        <button
                            type="button"
                            onClick={() => setSourceMode("board")}
                            className={`px-3 py-1.5 ui-control text-xs font-semibold transition-colors cursor-pointer ${
                                sourceMode === "board"
                                    ? "btn-accent"
                                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            }`}
                        >
                            {t("lirMaker.fromBoard")}
                        </button>
                        <button
                            type="button"
                            onClick={() => setSourceMode("file")}
                            className={`px-3 py-1.5 ui-control text-xs font-semibold transition-colors cursor-pointer ${
                                sourceMode === "file"
                                    ? "btn-accent"
                                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            }`}
                        >
                            {t("lirMaker.fromFile")}
                        </button>
                    </div>
                </div>

                {sourceMode === "board" ? (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <LirSelect
                            value={selectedDropdownValue}
                            onChange={(nextVal) => {
                                if (nextVal.startsWith("ytcache:")) {
                                    setSelectedCacheVideoId(
                                        nextVal.slice("ytcache:".length),
                                    );
                                } else if (nextVal.startsWith("board:")) {
                                    setSelectedCacheVideoId(null);
                                    setSelectedBoardId(nextVal.slice("board:".length));
                                }
                            }}
                            options={boardSourceOptions}
                            placeholder={t("lirMaker.selectSoundPlaceholder")}
                            searchable
                            searchPlaceholder={t("lirMaker.searchSourcePlaceholder")}
                            emptyMessage={t("lirMaker.noSourceMatch")}
                            ariaLabel={t("lirMaker.sourceTitle")}
                            className="flex-1"
                            headerAction={
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        void refreshCachedTracks();
                                    }}
                                    title={t("lirMaker.refreshCachedTooltip")}
                                    className="p-1.5 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-text)] transition-colors cursor-pointer"
                                >
                                    <RefreshCw
                                        className={`w-3.5 h-3.5 ${
                                            isRefreshingCache ? "animate-spin" : ""
                                        }`}
                                    />
                                </button>
                            }
                        />
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        <div
                            onDragOver={(e) => {
                                e.preventDefault();
                                setIsDraggingFile(true);
                            }}
                            onDragLeave={() => setIsDraggingFile(false)}
                            onDrop={(e) => {
                                e.preventDefault();
                                setIsDraggingFile(false);
                                const file = e.dataTransfer.files?.[0];
                                if (file) handleFileSelected(file);
                            }}
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-2 border-dashed ui-inner p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                                isDraggingFile
                                    ? "border-[var(--accent)] bg-[var(--accent-subtle)]"
                                    : "border-[var(--border-input)] bg-[var(--bg-inner)] hover:border-[var(--border-hover)]"
                            }`}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="audio/*"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileSelected(file);
                                    e.currentTarget.value = "";
                                }}
                            />
                            <Upload className="w-5 h-5 text-[var(--accent-text)] mb-1.5" />
                            <p className="text-xs sm:text-sm font-medium text-[var(--text-primary)]">
                                {fileSource
                                    ? fileSource.title
                                    : t("lirMaker.dropzoneTitle")}
                            </p>
                            <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                                {t("lirMaker.dropzoneHint")}
                            </p>
                        </div>

                        {isElectron && (
                            <button
                                type="button"
                                onClick={() => void handleElectronFileOpen()}
                                className="flex items-center justify-center gap-2 py-2 px-4 ui-input bg-[var(--bg-inner)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] text-xs font-medium text-[var(--text-primary)] transition-colors cursor-pointer"
                            >
                                <FolderOpen className="w-4 h-4 text-[var(--accent-text)]" />
                                <span>{t("addSoundModal.browseComputer")}</span>
                            </button>
                        )}
                    </div>
                )}
            </section>

            {/* 2. Waveform & Multi-Selection Editor */}
            <section className="app-card ui-card border border-[var(--border-card)] p-5 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                                {t("lirMaker.waveformTitle")}
                            </h2>
                            <span className="inline-flex items-center px-2 py-0.5 ui-control text-[10px] font-mono font-semibold bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)]">
                                {t("lirMaker.multiSelectBadge")}
                            </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                            {t("lirMaker.dragHint")}
                        </p>
                    </div>

                    {/* Zoom Controls */}
                    <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-[var(--text-muted)] mr-1 flex items-center gap-1">
                            {zoom > 1 ? (
                                <ZoomIn className="w-3.5 h-3.5" />
                            ) : (
                                <ZoomOut className="w-3.5 h-3.5" />
                            )}
                            <span>{t("lirMaker.zoomLabel")}:</span>
                        </span>
                        {([1, 2, 4, 8] as const).map((z) => (
                            <button
                                key={z}
                                type="button"
                                disabled={!activeBuffer}
                                onClick={() => {
                                    setZoom(z);
                                    if (z === 1) setScrollRatio(0);
                                }}
                                className={`px-2.5 py-1 ui-control text-[11px] font-mono font-semibold border transition-colors cursor-pointer disabled:opacity-40 ${
                                    zoom === z
                                        ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                        : "bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                }`}
                            >
                                {z}x
                            </button>
                        ))}
                    </div>
                </div>

                {/* Waveform Canvas Box */}
                <div
                    ref={waveBoxRef}
                    className="relative w-full h-52 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] overflow-hidden"
                >
                    <canvas
                        ref={canvasRef}
                        onPointerDown={handleCanvasPointerDown}
                        onPointerMove={handleCanvasPointerMove}
                        onPointerUp={handleCanvasPointerUp}
                        onPointerCancel={handleCanvasPointerUp}
                        className={`w-full h-full block touch-none ${
                            activeBuffer && !isDecoding && !loadError
                                ? "cursor-crosshair opacity-100"
                                : "opacity-0 pointer-events-none"
                        }`}
                    />
                    {(isDecoding || loadError || !activeBuffer) && (
                        <div className="absolute inset-0 flex items-center justify-center px-6 text-center pointer-events-none">
                            {isDecoding ? (
                                <p className="text-xs text-[var(--text-secondary)] animate-pulse">
                                    {t("lirMaker.loadingWaveform")}
                                </p>
                            ) : loadError ? (
                                <p className="text-xs text-rose-400">{loadError}</p>
                            ) : (
                                <p className="text-xs text-[var(--text-muted)]">
                                    {t("lirMaker.emptyWaveform")}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Zoom Horizontal Pan Slider */}
                {activeBuffer && zoom > 1 && (
                    <div className="flex items-center gap-3 px-1">
                        <span className="text-[11px] font-mono text-[var(--text-muted)] shrink-0">
                            {formatTimePrecise(viewStart)}
                        </span>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.005}
                            value={scrollRatio}
                            onChange={(e) =>
                                setScrollRatio(parseFloat(e.target.value))
                            }
                            className="w-full"
                        />
                        <span className="text-[11px] font-mono text-[var(--text-muted)] shrink-0">
                            {formatTimePrecise(viewEnd)}
                        </span>
                    </div>
                )}

                {/* Interactive Multi-Selection Chips Bar */}
                {activeBuffer && (
                    <div className="flex flex-wrap items-center gap-2 p-3 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)]">
                        {regions.map((reg, idx) => {
                            const isFocus = reg.id === activeRegion.id;
                            const isPlayingThis =
                                isPlaying && playingSegmentId === reg.id;
                            const pal =
                                idx === 0
                                    ? null
                                    : REGION_PALETTE[
                                          (idx - 1 + REGION_PALETTE.length) %
                                              REGION_PALETTE.length
                                      ];
                            return (
                                <div
                                    key={reg.id}
                                    onClick={() => {
                                        setActiveRegionId(reg.id);
                                        setCursorTime(reg.start);
                                    }}
                                    className={`inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 ui-control border text-xs font-mono transition-all cursor-pointer ${
                                        isFocus
                                            ? "bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--text-primary)] ring-1 ring-[var(--accent-border)]"
                                            : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
                                    }`}
                                >
                                    <span
                                        className="font-bold"
                                        style={
                                            !isFocus && pal
                                                ? { color: pal.hex }
                                                : undefined
                                        }
                                    >
                                        #{idx + 1}
                                        {reg.label?.trim() ? ` · ${reg.label.trim()}` : ""}
                                    </span>
                                    <span className="tabular-nums text-[11px]">
                                        {formatTimePrecise(reg.start)} →{" "}
                                        {formatTimePrecise(reg.end)}
                                    </span>
                                    <button
                                        type="button"
                                        title={t("lirMaker.previewSegmentTitle")}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (
                                                isPlayingThis &&
                                                previewMode === "single-region"
                                            ) {
                                                stopPreview();
                                            } else {
                                                startSingleRegionPreview(reg);
                                            }
                                        }}
                                        className="p-0.5 rounded hover:bg-white/10 text-[var(--accent-text)] cursor-pointer"
                                    >
                                        {isPlayingThis &&
                                        previewMode === "single-region" ? (
                                            <Square className="w-3 h-3 fill-current" />
                                        ) : (
                                            <Play className="w-3 h-3 fill-current" />
                                        )}
                                    </button>
                                    {regions.length > 1 && (
                                        <button
                                            type="button"
                                            title={t("lirMaker.removeSegmentTitle")}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRemoveRegion(reg.id);
                                            }}
                                            className="p-0.5 rounded hover:bg-rose-500/20 text-[var(--text-muted)] hover:text-rose-400 cursor-pointer"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            );
                        })}

                        <button
                            type="button"
                            onClick={handleAddNewRegionButton}
                            className="inline-flex items-center gap-1.5 px-3 py-1 ui-control bg-[var(--accent-subtle)] hover:brightness-110 border border-[var(--accent-border)] text-[var(--accent-text)] text-xs font-semibold cursor-pointer"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{t("lirMaker.addRegionBtn").replace(/^\+\s*/, "")}</span>
                        </button>

                        <button
                            type="button"
                            disabled={!canInvertCut}
                            onClick={handleInvertActiveSelection}
                            className="inline-flex items-center gap-1.5 px-3 py-1 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
                        >
                            <Split className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                            <span>{t("lirMaker.invertCutBtn")}</span>
                        </button>

                        {regions.length > 1 && (
                            <button
                                type="button"
                                onClick={handleSortRegionsByTime}
                                className="inline-flex items-center gap-1.5 px-3 py-1 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                            >
                                <ArrowUpDown className="w-3.5 h-3.5" />
                                <span>{t("lirMaker.sortRegionsBtn")}</span>
                            </button>
                        )}
                    </div>
                )}

                {/* Playback & Precision Time Controls */}
                {activeBuffer && (
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)]">
                            <div className="flex flex-wrap items-center gap-2">
                                <motion.button
                                    type="button"
                                    whileTap={{ scale: 0.94 }}
                                    onClick={toggleRegionsPreview}
                                    className={`flex items-center gap-2 px-4 py-2 ui-control text-xs font-semibold cursor-pointer ${
                                        isPlaying &&
                                        (previewMode === "regions" ||
                                            previewMode === "single-region")
                                            ? "bg-rose-950/80 hover:bg-rose-900 border border-rose-700 text-rose-200"
                                            : "btn-accent"
                                    }`}
                                >
                                    {isPlaying &&
                                    (previewMode === "regions" ||
                                        previewMode === "single-region") ? (
                                        <>
                                            <Square className="w-3.5 h-3.5 fill-current" />
                                            <span>{t("lirMaker.stopSelection")}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Play className="w-3.5 h-3.5 fill-current" />
                                            <span>
                                                {regions.length > 1
                                                    ? t("lirMaker.playAllSelections", {
                                                          count: regions.length,
                                                      })
                                                    : t("lirMaker.playSelection")}
                                            </span>
                                        </>
                                    )}
                                </motion.button>

                                <button
                                    type="button"
                                    onClick={() => setLoopPreview((v) => !v)}
                                    className={`flex items-center gap-1.5 px-3 py-2 ui-control text-xs font-medium border transition-colors cursor-pointer ${
                                        loopPreview
                                            ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                            : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                    }`}
                                >
                                    <Repeat className="w-3.5 h-3.5" />
                                    <span>{t("lirMaker.loopSelection")}</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={handleResetTrim}
                                    className="flex items-center gap-1.5 px-3 py-2 ui-control text-xs font-medium bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>{t("lirMaker.resetTrim")}</span>
                                </button>
                            </div>

                            {/* Preview Volume + Live Readout */}
                            <div className="flex flex-wrap items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <Volume2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                                    <input
                                        type="range"
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        value={previewVolume}
                                        onChange={(e) =>
                                            setPreviewVolume(
                                                parseFloat(e.target.value),
                                            )
                                        }
                                        title={t("lirMaker.previewVolume")}
                                        className="w-24"
                                    />
                                </div>

                                <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                                    <span className="text-[var(--text-secondary)]">
                                        {t("lirMaker.selectedDuration")}:{" "}
                                        <strong className="text-[var(--accent-text)]">
                                            {formatTimePrecise(totalRegionsDuration)}
                                        </strong>
                                    </span>
                                    <span className="text-[var(--text-muted)]">
                                        / {formatTimePrecise(fullDuration)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Active Region Start / End Nudge Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* Start Time Box */}
                            <div className="p-3.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                                        <span>{t("lirMaker.startTime")}</span>
                                        <span
                                            className="px-1.5 py-0.2 ui-control text-[10px] font-mono bg-[var(--accent-subtle)] text-[var(--accent-text)]"
                                            style={
                                                activeBadgeColor
                                                    ? { color: activeBadgeColor.hex }
                                                    : undefined
                                            }
                                        >
                                            #{activeRegionIndex + 1}
                                        </span>
                                    </span>
                                    <span className="text-sm font-mono font-bold tabular-nums text-[var(--accent-text)]">
                                        {formatTimePrecise(trimStart)}
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {[-0.5, -0.1, -0.01, 0.01, 0.1, 0.5].map(
                                        (d) => (
                                            <button
                                                key={`s-${d}`}
                                                type="button"
                                                onClick={() => nudgeActiveStart(d)}
                                                className="px-2 py-1 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                                            >
                                                {d > 0 ? `+${d}s` : `${d}s`}
                                            </button>
                                        ),
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const refSec =
                                                playheadTime !== null
                                                    ? playheadTime
                                                    : cursorTime;
                                            setRegions((prev) =>
                                                prev.map((r) =>
                                                    r.id === activeRegion.id
                                                        ? {
                                                              ...r,
                                                              start: Math.max(
                                                                  0,
                                                                  Math.min(
                                                                      r.end - MIN_CLIP_SECONDS,
                                                                      refSec,
                                                                  ),
                                                              ),
                                                              isPristineFull: false,
                                                              addedToLibrary: false,
                                                          }
                                                        : r,
                                                ),
                                            );
                                        }}
                                        className="ml-auto px-2.5 py-1 ui-control bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] text-[11px] font-medium cursor-pointer"
                                    >
                                        {t("lirMaker.markStartHere")}
                                    </button>
                                </div>
                            </div>

                            {/* End Time Box */}
                            <div className="p-3.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                                        <span>{t("lirMaker.endTime")}</span>
                                        <span
                                            className="px-1.5 py-0.2 ui-control text-[10px] font-mono bg-[var(--accent-subtle)] text-[var(--accent-text)]"
                                            style={
                                                activeBadgeColor
                                                    ? { color: activeBadgeColor.hex }
                                                    : undefined
                                            }
                                        >
                                            #{activeRegionIndex + 1}
                                        </span>
                                    </span>
                                    <span className="text-sm font-mono font-bold tabular-nums text-[var(--accent-text)]">
                                        {formatTimePrecise(trimEnd)}
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {[-0.5, -0.1, -0.01, 0.01, 0.1, 0.5].map(
                                        (d) => (
                                            <button
                                                key={`e-${d}`}
                                                type="button"
                                                onClick={() => nudgeActiveEnd(d)}
                                                className="px-2 py-1 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                                            >
                                                {d > 0 ? `+${d}s` : `${d}s`}
                                            </button>
                                        ),
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const refSec =
                                                playheadTime !== null
                                                    ? playheadTime
                                                    : cursorTime;
                                            setRegions((prev) =>
                                                prev.map((r) =>
                                                    r.id === activeRegion.id
                                                        ? {
                                                              ...r,
                                                              end: Math.min(
                                                                  fullDuration,
                                                                  Math.max(
                                                                      r.start + MIN_CLIP_SECONDS,
                                                                      refSec,
                                                                  ),
                                                              ),
                                                              isPristineFull: false,
                                                              addedToLibrary: false,
                                                          }
                                                        : r,
                                                ),
                                            );
                                        }}
                                        className="ml-auto px-2.5 py-1 ui-control bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] text-[11px] font-medium cursor-pointer"
                                    >
                                        {t("lirMaker.markEndHere")}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Labeled Slice Selections & Direct Add-to-Library List */}
                        <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-start gap-2">
                                    <Tag className="w-4 h-4 text-[var(--accent-text)] mt-0.5 shrink-0" />
                                    <div>
                                        <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                                            {t("lirMaker.regionsListTitle", {
                                                count: regions.length,
                                            })}
                                        </h3>
                                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                                            {t("lirMaker.regionsListHint")}
                                        </p>
                                    </div>
                                </div>

                                {regions.length > 1 && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-[11px] font-mono text-[var(--text-muted)]">
                                            {t("lirMaker.regionSelectedCount", {
                                                selected: selectedRegionsForSeparate.length,
                                                total: regions.length,
                                            })}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleToggleAllRegionsSelectedForExport}
                                            className="px-2.5 py-1 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                                        >
                                            {regions.every(
                                                (r) => r.selectedForExport !== false,
                                            )
                                                ? t("lirMaker.regionToggleAllDeselect")
                                                : t("lirMaker.regionToggleAllSelect")}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={
                                                selectedRegionsForSeparate.length === 0
                                            }
                                            onClick={handleAddAsSeparateSounds}
                                            className="btn-accent inline-flex items-center gap-1.5 px-3 py-1.5 ui-control text-[11px] font-semibold cursor-pointer disabled:opacity-40"
                                        >
                                            <Layers className="w-3.5 h-3.5" />
                                            <span>
                                                {t("lirMaker.addSeparateToBoardBtn", {
                                                    count: selectedRegionsForSeparate.length,
                                                })}
                                            </span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col gap-2">
                                {regions.map((reg, idx) => {
                                    const isFocus = reg.id === activeRegion.id;
                                    const isPlayingThis =
                                        isPlaying && playingSegmentId === reg.id;
                                    const isCapturingThisHk =
                                        capturingRegionHotkeyId === reg.id;
                                    const dur = Math.max(
                                        MIN_CLIP_SECONDS,
                                        reg.end - reg.start,
                                    );
                                    const pal =
                                        idx === 0
                                            ? null
                                            : REGION_PALETTE[
                                                  (idx - 1 + REGION_PALETTE.length) %
                                                      REGION_PALETTE.length
                                              ];
                                    const previewTitle = buildSliceTitle(
                                        reg.label,
                                        idx,
                                    );

                                    return (
                                        <div
                                            key={reg.id}
                                            onClick={() => {
                                                setActiveRegionId(reg.id);
                                                setCursorTime(reg.start);
                                            }}
                                            className={`flex flex-col gap-2 p-3 ui-inner border transition-colors cursor-pointer ${
                                                isFocus
                                                    ? "bg-[var(--accent-subtle)]/40 border-[var(--accent)]"
                                                    : "bg-[var(--bg-card)] border-[var(--border-subtle)] hover:border-[var(--border-hover)]"
                                            }`}
                                        >
                                            <div className="flex flex-wrap items-center gap-2.5">
                                                {regions.length > 1 && (
                                                    <input
                                                        type="checkbox"
                                                        checked={
                                                            reg.selectedForExport !==
                                                            false
                                                        }
                                                        onClick={(e) =>
                                                            e.stopPropagation()
                                                        }
                                                        onChange={() =>
                                                            handleToggleRegionSelectedForExport(
                                                                reg.id,
                                                            )
                                                        }
                                                        className="w-4 h-4 accent-[var(--accent)] cursor-pointer shrink-0"
                                                    />
                                                )}

                                                <span
                                                    className="px-2 py-0.5 ui-control text-[11px] font-mono font-bold bg-[var(--bg-inner)] border border-[var(--border-subtle)] shrink-0"
                                                    style={
                                                        !isFocus && pal
                                                            ? { color: pal.hex }
                                                            : undefined
                                                    }
                                                >
                                                    #{idx + 1}
                                                </span>

                                                <div
                                                    className="flex-1 min-w-[180px]"
                                                    onClick={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                >
                                                    <input
                                                        type="text"
                                                        value={reg.label ?? ""}
                                                        onFocus={() => {
                                                            setActiveRegionId(
                                                                reg.id,
                                                            );
                                                            setCursorTime(
                                                                reg.start,
                                                            );
                                                        }}
                                                        onChange={(e) =>
                                                            handleUpdateRegionLabel(
                                                                reg.id,
                                                                e.target.value,
                                                            )
                                                        }
                                                        placeholder={t(
                                                            "lirMaker.regionLabelPlaceholder",
                                                        )}
                                                        className="w-full px-3 py-1.5 ui-input bg-[var(--bg-input)] border border-[var(--border-input)] text-xs font-medium text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                                                    />
                                                </div>

                                                <div className="text-[11px] font-mono tabular-nums text-[var(--text-secondary)] shrink-0">
                                                    {formatTimePrecise(reg.start)}{" "}
                                                    → {formatTimePrecise(reg.end)}{" "}
                                                    <span className="text-[var(--accent-text)] font-semibold">
                                                        ({formatTimePrecise(dur)})
                                                    </span>
                                                </div>

                                                {/* Per-region Hotkey Capture */}
                                                <div
                                                    className="flex items-center gap-1 shrink-0"
                                                    onClick={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setIsCapturingHotkey(
                                                                false,
                                                            );
                                                            setCapturingRegionHotkeyId(
                                                                isCapturingThisHk
                                                                    ? null
                                                                    : reg.id,
                                                            );
                                                        }}
                                                        className={`inline-flex items-center gap-1 px-2 py-1 ui-control text-[11px] font-mono border cursor-pointer ${
                                                            isCapturingThisHk
                                                                ? "bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--accent-text)] animate-pulse"
                                                                : reg.hotkey
                                                                  ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)] font-semibold"
                                                                  : "bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                                        }`}
                                                    >
                                                        <Keyboard className="w-3 h-3" />
                                                        <span>
                                                            {isCapturingThisHk
                                                                ? t(
                                                                      "common.pressKey",
                                                                  )
                                                                : reg.hotkey ||
                                                                  t(
                                                                      "lirMaker.regionHotkeyAssign",
                                                                  )}
                                                        </span>
                                                    </button>
                                                    {reg.hotkey &&
                                                        !isCapturingThisHk && (
                                                            <button
                                                                type="button"
                                                                title={t(
                                                                    "lirMaker.regionHotkeyClear",
                                                                )}
                                                                onClick={() =>
                                                                    setRegions(
                                                                        (prev) =>
                                                                            prev.map(
                                                                                (
                                                                                    r,
                                                                                ) =>
                                                                                    r.id ===
                                                                                    reg.id
                                                                                        ? {
                                                                                              ...r,
                                                                                              hotkey: undefined,
                                                                                              addedToLibrary: false,
                                                                                          }
                                                                                        : r,
                                                                            ),
                                                                    )
                                                                }
                                                                className="p-1 ui-control text-[var(--text-muted)] hover:text-rose-400 cursor-pointer"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                </div>

                                                {/* Preview Single Region */}
                                                <button
                                                    type="button"
                                                    title={t(
                                                        "lirMaker.previewSegmentTitle",
                                                    )}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (
                                                            isPlayingThis &&
                                                            previewMode ===
                                                                "single-region"
                                                        ) {
                                                            stopPreview();
                                                        } else {
                                                            startSingleRegionPreview(
                                                                reg,
                                                            );
                                                        }
                                                    }}
                                                    className="p-1.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--accent-text)] cursor-pointer shrink-0"
                                                >
                                                    {isPlayingThis &&
                                                    previewMode ===
                                                        "single-region" ? (
                                                        <Square className="w-3.5 h-3.5 fill-current" />
                                                    ) : (
                                                        <Play className="w-3.5 h-3.5 fill-current" />
                                                    )}
                                                </button>

                                                {/* Direct Add THIS Slice Alone to Library */}
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleAddSingleRegionToBoard(
                                                            reg,
                                                            idx,
                                                        );
                                                    }}
                                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 ui-control text-[11px] font-semibold border transition-colors cursor-pointer shrink-0 ${
                                                        reg.addedToLibrary
                                                            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
                                                            : "bg-[var(--accent-subtle)] hover:brightness-110 border-[var(--accent-border)] text-[var(--accent-text)]"
                                                    }`}
                                                >
                                                    {reg.addedToLibrary ? (
                                                        <Check className="w-3.5 h-3.5" />
                                                    ) : (
                                                        <Plus className="w-3.5 h-3.5" />
                                                    )}
                                                    <span>
                                                        {reg.addedToLibrary
                                                            ? t(
                                                                  "lirMaker.regionAddedToLibrary",
                                                              )
                                                            : t(
                                                                  "lirMaker.regionAddToLibrary",
                                                              )}
                                                    </span>
                                                </button>

                                                {regions.length > 1 && (
                                                    <button
                                                        type="button"
                                                        title={t(
                                                            "lirMaker.removeSegmentTitle",
                                                        )}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleRemoveRegion(
                                                                reg.id,
                                                            );
                                                        }}
                                                        className="p-1.5 ui-control bg-[var(--bg-inner)] hover:bg-rose-500/15 border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-rose-400 cursor-pointer shrink-0"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Quick Tag Presets + Library Title Preview for Active/Focused Region */}
                                            <div
                                                className="flex flex-wrap items-center justify-between gap-2 pl-1"
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                            >
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    {presetLabelTags.map(
                                                        (preset) => {
                                                            const isActiveTag =
                                                                (
                                                                    reg.label ??
                                                                    ""
                                                                ).trim() ===
                                                                preset;
                                                            return (
                                                                <button
                                                                    key={preset}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setActiveRegionId(
                                                                            reg.id,
                                                                        );
                                                                        handleUpdateRegionLabel(
                                                                            reg.id,
                                                                            isActiveTag
                                                                                ? ""
                                                                                : preset,
                                                                        );
                                                                    }}
                                                                    className={`px-2 py-0.5 ui-control text-[10px] font-medium border transition-colors cursor-pointer ${
                                                                        isActiveTag
                                                                            ? "bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--accent-text)] font-semibold"
                                                                            : "bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]"
                                                                    }`}
                                                                >
                                                                    {preset}
                                                                </button>
                                                            );
                                                        },
                                                    )}
                                                </div>

                                                <span className="text-[11px] text-[var(--text-muted)] truncate max-w-xs">
                                                    {t(
                                                        "lirMaker.regionLibraryTitlePreview",
                                                        {
                                                            title: previewTitle,
                                                        },
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Push Selections to Cross-Sound Queue */}
                        <div className="flex flex-wrap items-center gap-2.5 pt-1">
                            <motion.button
                                type="button"
                                whileTap={{ scale: 0.96 }}
                                onClick={handleAddWaveformRegionsToQueue}
                                className="flex items-center gap-2 px-3.5 py-2 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                            >
                                <Layers className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                <span>{t("lirMaker.addSegmentBtn")}</span>
                            </motion.button>
                        </div>
                    </div>
                )}
            </section>

            {/* 3. Cross-Sound Multi-Segment Stitch Queue (Optional) */}
            {(activeBuffer || cutSegments.length > 0) && (
                <section className="app-card ui-card border border-[var(--border-card)] p-5 flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                            <Layers className="w-4 h-4 text-[var(--accent-text)] mt-0.5 shrink-0" />
                            <div>
                                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                                    {t("lirMaker.segmentsSectionTitle", {
                                        count: cutSegments.length,
                                    })}
                                </h2>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                    {t("lirMaker.segmentsSectionDesc")}
                                </p>
                            </div>
                        </div>

                        {cutSegments.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-mono tabular-nums text-[var(--text-secondary)] mr-1">
                                    {t("lirMaker.totalCombinedDuration")}:{" "}
                                    <strong className="text-[var(--accent-text)]">
                                        {formatTimePrecise(totalCombinedQueueDuration)}
                                    </strong>
                                </span>

                                <button
                                    type="button"
                                    onClick={toggleCombinedQueuePreview}
                                    className={`flex items-center gap-1.5 px-3.5 py-1.5 ui-control text-xs font-semibold cursor-pointer ${
                                        isPlaying && previewMode === "combined-queue"
                                            ? "bg-rose-950/80 hover:bg-rose-900 border border-rose-700 text-rose-200"
                                            : "btn-accent"
                                    }`}
                                >
                                    {isPlaying && previewMode === "combined-queue" ? (
                                        <>
                                            <Square className="w-3 h-3 fill-current" />
                                            <span>{t("lirMaker.stopSelection")}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Play className="w-3 h-3 fill-current" />
                                            <span>{t("lirMaker.playCombined")}</span>
                                        </>
                                    )}
                                </button>

                                <button
                                    type="button"
                                    onClick={handleClearSegments}
                                    className="px-3 py-1.5 ui-control text-xs font-medium bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-rose-400 cursor-pointer"
                                >
                                    {t("lirMaker.clearSegments")}
                                </button>
                            </div>
                        )}
                    </div>

                    {cutSegments.length === 0 ? (
                        <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-dashed border-[var(--border-subtle)] text-xs text-[var(--text-muted)] text-center">
                            {t("lirMaker.segmentsEmpty")}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {cutSegments.map((seg, index) => {
                                const isActiveSeg =
                                    isPlaying && playingSegmentId === seg.id;
                                const dur = Math.max(0.05, seg.end - seg.start);
                                return (
                                    <div
                                        key={seg.id}
                                        className={`flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 ui-inner border transition-colors ${
                                            isActiveSeg
                                                ? "bg-[var(--accent-subtle)] border-[var(--accent)]"
                                                : "bg-[var(--bg-inner)] border-[var(--border-subtle)] hover:border-[var(--border-hover)]"
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <span className="px-2 py-0.5 ui-control text-[11px] font-mono font-bold bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] shrink-0">
                                                #{index + 1}
                                            </span>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                                        {seg.sourceTitle}
                                                    </p>
                                                    {seg.label &&
                                                        seg.label.trim() !==
                                                            seg.sourceTitle.trim() && (
                                                            <span className="px-2 py-0.5 ui-control text-[10px] font-semibold bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] shrink-0">
                                                                {seg.label}
                                                            </span>
                                                        )}
                                                </div>
                                                <p className="text-[11px] font-mono text-[var(--text-secondary)] tabular-nums">
                                                    {formatTimePrecise(seg.start)}{" "}
                                                    → {formatTimePrecise(seg.end)}{" "}
                                                    <span className="text-[var(--accent-text)] font-semibold">
                                                        ({formatTimePrecise(dur)})
                                                    </span>
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                title={t("lirMaker.previewSegmentTitle")}
                                                onClick={() =>
                                                    isActiveSeg &&
                                                    previewMode === "single-queue"
                                                        ? stopPreview()
                                                        : startSingleQueuePreview(seg)
                                                }
                                                className="p-1.5 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--accent-text)] cursor-pointer"
                                            >
                                                {isActiveSeg &&
                                                previewMode === "single-queue" ? (
                                                    <Square className="w-3.5 h-3.5 fill-current" />
                                                ) : (
                                                    <Play className="w-3.5 h-3.5 fill-current" />
                                                )}
                                            </button>

                                            <button
                                                type="button"
                                                disabled={index === 0}
                                                title={t("lirMaker.moveUpTitle")}
                                                onClick={() =>
                                                    handleMoveSegment(index, -1)
                                                }
                                                className="p-1.5 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-35 cursor-pointer"
                                            >
                                                <ChevronUp className="w-3.5 h-3.5" />
                                            </button>

                                            <button
                                                type="button"
                                                disabled={
                                                    index === cutSegments.length - 1
                                                }
                                                title={t("lirMaker.moveDownTitle")}
                                                onClick={() =>
                                                    handleMoveSegment(index, 1)
                                                }
                                                className="p-1.5 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-35 cursor-pointer"
                                            >
                                                <ChevronDown className="w-3.5 h-3.5" />
                                            </button>

                                            <button
                                                type="button"
                                                title={t("lirMaker.duplicateSegmentTitle")}
                                                onClick={() =>
                                                    handleDuplicateSegment(index)
                                                }
                                                className="p-1.5 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                            </button>

                                            <button
                                                type="button"
                                                title={t("lirMaker.removeSegmentTitle")}
                                                onClick={() =>
                                                    handleRemoveQueueSegment(seg.id)
                                                }
                                                className="p-1.5 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-rose-400 cursor-pointer"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}

            {/* 4. Save Cut(s) to Board (Zero Re-Render) */}
            {showExportSection && (
                <section className="app-card ui-card border border-[var(--border-card)] p-5 flex flex-col gap-4">
                    <div>
                        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                            {t("lirMaker.outputSectionTitle")}
                        </h2>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                            {t("lirMaker.outputSectionDesc")}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-[var(--text-secondary)]">
                                {t("lirMaker.cutTitleLabel")}
                            </label>
                            <input
                                type="text"
                                value={cutTitle}
                                onChange={(e) => setCutTitle(e.target.value)}
                                placeholder={t("lirMaker.cutTitlePlaceholder")}
                                className="px-3.5 py-2 ui-input bg-[var(--bg-input)] border border-[var(--border-input)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-[var(--text-secondary)]">
                                {t("lirMaker.categoryLabel")}
                            </label>
                            <LirSelect
                                value={cutCategory}
                                onChange={(val) =>
                                    setCutCategory(val as SoundCategory)
                                }
                                options={categoryOptions}
                                ariaLabel={t("lirMaker.categoryLabel")}
                                buttonClassName="py-2"
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-[var(--text-secondary)]">
                                {t("lirMaker.hotkeyLabel")}
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={cutHotkey}
                                    onChange={(e) =>
                                        setCutHotkey(e.target.value.toUpperCase())
                                    }
                                    placeholder={t("lirMaker.hotkeyPlaceholder")}
                                    className="flex-1 px-3.5 py-2 ui-input bg-[var(--bg-input)] border border-[var(--border-input)] text-sm font-mono uppercase text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        setCapturingRegionHotkeyId(null);
                                        setIsCapturingHotkey((v) => !v);
                                    }}
                                    className={`px-3 py-2 ui-control text-xs font-semibold border cursor-pointer shrink-0 ${
                                        isCapturingHotkey
                                            ? "bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--accent-text)] animate-pulse"
                                            : "bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                    }`}
                                >
                                    {isCapturingHotkey
                                        ? t("common.pressKey")
                                        : t("common.noHotkey")}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
                        {sourceMode === "board" && selectedBoardSound && (
                            <motion.button
                                type="button"
                                whileTap={{ scale: 0.96 }}
                                onClick={handleUpdateOriginal}
                                className="flex items-center gap-2 px-4 py-2.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
                            >
                                <Save className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                <span>{t("lirMaker.updateOriginalBtn")}</span>
                            </motion.button>
                        )}

                        {effectiveExportList.length > 1 && (
                            <motion.button
                                type="button"
                                whileTap={{ scale: 0.96 }}
                                disabled={separateExportCount === 0}
                                onClick={handleAddAsSeparateSounds}
                                className="flex items-center gap-2 px-4 py-2.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer disabled:opacity-40"
                            >
                                <Layers className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                <span>
                                    {t("lirMaker.addSeparateToBoardBtn", {
                                        count: separateExportCount,
                                    })}
                                </span>
                            </motion.button>
                        )}

                        <motion.button
                            type="button"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={handleAddCut}
                            className="btn-accent flex items-center gap-2 px-5 py-2.5 ui-control text-xs font-semibold cursor-pointer"
                        >
                            <Plus className="w-4 h-4" />
                            <span>
                                {effectiveExportList.length > 1
                                    ? t("lirMaker.addCombinedToBoardBtn", {
                                          count: effectiveExportList.length,
                                      })
                                    : t("lirMaker.addToBoardBtn")}
                            </span>
                        </motion.button>
                    </div>
                </section>
            )}
        </div>
    );
}
