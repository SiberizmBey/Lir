import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
    Volume2,
    VolumeX,
    Plus,
    Search,
    Square,
    Minus,
    Maximize2,
    X,
    Repeat,
    AudioLines,
    ChevronDown,
    Music2,
    Pause,
    Play,
} from "lucide-react";
import { useTranslation } from "../i18n";
import {
    AudioRoutingConfig,
    PlaybackTrackInfo,
    SoundItem,
    UIStyle,
} from "../types/sound";
import { AudioVisualizer } from "./AudioVisualizer";
import { AuditionSnapshot, auditionStore } from "../utils/auditionStore";

interface HeaderProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    onAddNewSound: () => void;
    onStopAll: () => void;
    routingConfig: AudioRoutingConfig;
    onRoutingConfigChange: (newConfig: AudioRoutingConfig) => void;
    activePlayingCount: number;
    sounds: SoundItem[];
    activeTracks: PlaybackTrackInfo[];
    onStopSound: (soundId: string) => void;
    onToggleLoop: (soundId: string) => void;
    backgroundImageEnabled: boolean;
    transparency: number;
    uiStyle: UIStyle;
}

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
    const totalSecs = Math.floor(seconds);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export function Header({
    searchQuery,
    onSearchChange,
    onAddNewSound,
    onStopAll,
    routingConfig,
    onRoutingConfigChange,
    activePlayingCount,
    sounds,
    activeTracks,
    onStopSound,
    onToggleLoop,
    backgroundImageEnabled,
    transparency,
    uiStyle,
}: HeaderProps) {
    const { t } = useTranslation();
    const [isVolumeExpanded, setIsVolumeExpanded] = useState(false);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [manualSearchWhilePlaying, setManualSearchWhilePlaying] =
        useState(false);
    const [isTracksDrawerOpen, setIsTracksDrawerOpen] = useState(false);
    const [isIslandCompact, setIsIslandCompact] = useState(false);
    const [isIslandHovered, setIsIslandHovered] = useState(false);
    const [audition, setAudition] = useState<AuditionSnapshot | null>(() =>
        auditionStore.getSnapshot(),
    );
    const [now, setNow] = useState(() => Date.now());
    const isMuted = routingConfig.masterVolume === 0;

    // Auditions from the Dış Kaynak tab feed the same island
    useEffect(() => auditionStore.subscribe(setAudition), []);

    const isPlayingAny = activeTracks.length > 0;
    const auditionId = audition?.id ?? null;
    const hasAudition = Boolean(audition) && !isPlayingAny;
    const hasPlayback = isPlayingAny || hasAudition;
    // The island owns the search bar whenever anything is audible
    const isPlayerMode = hasPlayback && !manualSearchWhilePlaying;
    const isAuditionMode = isPlayerMode && hasAudition;

    useEffect(() => {
        if (!hasPlayback) {
            setManualSearchWhilePlaying(false);
            setIsTracksDrawerOpen(false);
            return;
        }
        if (!isPlayingAny) return;
        setNow(Date.now());
        const timer = window.setInterval(() => {
            setNow(Date.now());
        }, 80);
        return () => window.clearInterval(timer);
    }, [hasPlayback, isPlayingAny]);

    // Every new playback session / track re-expands the capsule
    useEffect(() => {
        setIsIslandCompact(false);
    }, [hasPlayback, activeTracks.length, auditionId]);

    // After 1.5s the player capsule settles back to the default search-bar size.
    // Hovering keeps it expanded, opening the track list pins it open.
    useEffect(() => {
        if (!isPlayerMode || isIslandHovered || isTracksDrawerOpen) return;
        const timer = window.setTimeout(() => {
            setIsIslandCompact(true);
        }, 1500);
        return () => window.clearTimeout(timer);
    }, [
        isPlayerMode,
        activeTracks.length,
        auditionId,
        isIslandHovered,
        isTracksDrawerOpen,
    ]);

    useEffect(() => {
        if (activeTracks.length <= 1) {
            setIsTracksDrawerOpen(false);
        }
    }, [activeTracks.length]);

    const hoverCloseTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (hoverCloseTimeoutRef.current) {
                window.clearTimeout(hoverCloseTimeoutRef.current);
            }
        };
    }, []);

    // Shared hover zone: the island and the track stack below it behave as one surface
    const handleIslandMouseEnter = () => {
        if (!isPlayerMode) return;
        if (hoverCloseTimeoutRef.current) {
            window.clearTimeout(hoverCloseTimeoutRef.current);
            hoverCloseTimeoutRef.current = null;
        }
        setIsIslandHovered(true);
        setIsIslandCompact(false);
    };

    const handleIslandMouseLeave = () => {
        if (hoverCloseTimeoutRef.current) {
            window.clearTimeout(hoverCloseTimeoutRef.current);
        }
        // Small grace period so the pointer can travel from the island into the track stack
        hoverCloseTimeoutRef.current = window.setTimeout(() => {
            hoverCloseTimeoutRef.current = null;
            setIsIslandHovered(false);
            if (!isTracksDrawerOpen) {
                setIsIslandCompact(true);
            }
        }, 150);
    };

    const handleToggleMute = () => {
        onRoutingConfigChange({
            ...routingConfig,
            masterVolume: isMuted ? 0.85 : 0,
        });
    };

    const handleVolumeSlider = (val: number) => {
        onRoutingConfigChange({
            ...routingConfig,
            masterVolume: val,
        });
    };

    const handleMinimize = () => {
        if (window.electronAPI?.minimizeWindow) {
            window.electronAPI.minimizeWindow();
        }
    };

    const handleMaximize = () => {
        if (window.electronAPI?.maximizeWindow) {
            window.electronAPI.maximizeWindow();
        }
    };

    const handleClose = () => {
        if (window.electronAPI?.closeWindow) {
            window.electronAPI.closeWindow();
        }
    };

    const isWin10 = uiStyle === "win10";
    const isWin11 = uiStyle === "win11";

    const islandOpacity = backgroundImageEnabled ? 100 - transparency : 84;
    const capsuleStyle = isWin10
        ? backgroundImageEnabled
            ? {
                  backgroundColor: `color-mix(in srgb, var(--bg-island) ${100 - transparency}%, transparent)`,
              }
            : undefined
        : {
              backgroundColor: `color-mix(in srgb, var(--bg-island) ${islandOpacity}%, transparent)`,
          };

    const headerClass = isWin10
        ? "relative h-14 px-4 flex items-center justify-between gap-2 sm:grid sm:grid-cols-[1fr_minmax(200px,34rem)_1fr] sm:items-center sm:gap-3 shrink-0 select-none window-drag-region border-b border-[var(--border-subtle)] bg-[var(--bg-island)] rounded-none z-30"
        : isWin11
          ? "absolute top-0 left-0 right-0 pl-[82px] pr-4 sm:px-6 pt-2.5 pb-2 flex items-center justify-between gap-2 sm:grid sm:grid-cols-[1fr_minmax(200px,34rem)_1fr] sm:items-center sm:gap-2.5 shrink-0 select-none window-drag-region bg-transparent pointer-events-none z-30"
          : "absolute top-0 left-0 right-0 pl-[86px] pr-4 sm:px-6 pt-3 pb-2 flex items-center justify-between gap-2 sm:grid sm:grid-cols-[1fr_minmax(200px,34rem)_1fr] sm:items-center sm:gap-3 shrink-0 select-none window-drag-region bg-transparent pointer-events-none z-30";

    const capsuleBaseClass = isWin10
        ? "h-10 flex items-center shrink-0 window-no-drag bg-transparent border-0 rounded-none"
        : isWin11
          ? "pointer-events-auto h-11 flex items-center rounded-xl border border-[var(--border-subtle)] backdrop-blur-xl shrink-0 window-no-drag transition-[border-radius,border-color] duration-200"
          : "pointer-events-auto h-11 flex items-center rounded-full border border-[var(--border-subtle)] backdrop-blur-xl shrink-0 window-no-drag transition-[border-radius,border-color] duration-200";

    const dynamicIslandClass = isWin10
        ? "relative w-full mx-auto px-3 flex items-center gap-2.5 rounded-[2px] border bg-[var(--bg-input)] transition-colors window-no-drag overflow-hidden"
        : isWin11
          ? "relative pointer-events-auto w-full mx-auto px-3.5 flex items-center gap-2.5 rounded-xl border backdrop-blur-xl transition-colors window-no-drag overflow-hidden"
          : "relative pointer-events-auto w-full mx-auto px-3.5 flex items-center gap-2.5 rounded-full border backdrop-blur-xl transition-colors window-no-drag overflow-hidden";

    const controlRadius = isWin10
        ? "rounded-[2px]"
        : isWin11
          ? "rounded-lg"
          : "rounded-full";

    const primaryTrack = activeTracks[0];
    const primarySound = primaryTrack
        ? sounds.find((s) => s.id === primaryTrack.soundId)
        : undefined;

    const isCompactPlayer = isPlayerMode && isIslandCompact;

    const targetMaxWidth = isPlayerMode
        ? isCompactPlayer
            ? 288
            : 536
        : isSearchFocused
          ? 448
          : 288;
    const targetHeight = isWin10
        ? isPlayerMode
            ? isCompactPlayer
                ? 32
                : 42
            : isSearchFocused
              ? 36
              : 32
        : isPlayerMode
          ? isCompactPlayer
              ? 36
              : 50
          : isSearchFocused
            ? 44
            : 36;

    return (
        <header
            className={headerClass}
            style={isWin10 ? capsuleStyle : undefined}
        >
            {/* Left Spacer: reserves Sidebar width on small screens while keeping Dynamic Island centered */}
            <div
                className={
                    isWin10
                        ? "hidden sm:block"
                        : "hidden sm:block sm:min-w-[68px]"
                }
                aria-hidden="true"
            />

            {/* Center Dynamic Island: Morphs seamlessly between Search Capsule & Live Playback Bar */}
            <div className="relative flex-1 sm:w-full flex flex-col items-center justify-center min-w-0">
                <motion.div
                    data-tour="dynamic-island"
                    initial={false}
                    onMouseEnter={handleIslandMouseEnter}
                    onMouseLeave={handleIslandMouseLeave}
                    animate={{
                        maxWidth: targetMaxWidth,
                        height: targetHeight,
                    }}
                    transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 32,
                    }}
                    className={`${dynamicIslandClass} ${
                        isPlayerMode || isSearchFocused
                            ? "border-[var(--accent-border)]"
                            : "border-[var(--border-subtle)]"
                    }`}
                    style={!isWin10 ? capsuleStyle : undefined}
                >
                    {/* Accent Sheen when Playback is active */}
                    <AnimatePresence>
                        {isPlayerMode && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 0.75 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.25 }}
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-0"
                                style={{
                                    background:
                                        "radial-gradient(ellipse 65% 130% at 15% 0%, rgba(var(--accent-rgb), 0.18), transparent 72%)",
                                }}
                            />
                        )}
                    </AnimatePresence>

                    <AnimatePresence mode="wait" initial={false}>
                        {isPlayerMode && primaryTrack ? (
                            <motion.div
                                key="dynamic-island-player"
                                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                                transition={{
                                    duration: 0.2,
                                    ease: [0.22, 1, 0.36, 1],
                                }}
                                className="relative z-10 flex w-full items-center gap-2.5 min-w-0"
                            >
                                {isCompactPlayer ? (
                                    <motion.div
                                        key="dynamic-island-player-compact"
                                        initial={{ opacity: 0, y: 3 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.14 }}
                                        className="flex w-full items-center gap-2 min-w-0"
                                    >
                                        <div
                                            className={`w-6 h-6 ${controlRadius} bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent-text)] shrink-0`}
                                        >
                                            <AudioLines className="w-3 h-3 animate-pulse" />
                                        </div>
                                        <span className="flex-1 min-w-0 text-xs font-semibold text-[var(--text-primary)] truncate">
                                            {primarySound?.title ||
                                                primaryTrack.soundId}
                                        </span>
                                        {activeTracks.length > 1 && (
                                            <motion.button
                                                type="button"
                                                whileTap={{ scale: 0.92 }}
                                                onClick={() =>
                                                    setIsTracksDrawerOpen(
                                                        (prev) => !prev,
                                                    )
                                                }
                                                title={t(
                                                    "playbackBar.expandTracks",
                                                )}
                                                aria-label={t(
                                                    "playbackBar.expandTracks",
                                                )}
                                                className={`h-6 px-1.5 flex items-center gap-0.5 ${controlRadius} border text-[10px] font-mono font-semibold transition-colors cursor-pointer shrink-0 ${
                                                    isTracksDrawerOpen
                                                        ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                                        : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                                }`}
                                            >
                                                <span>
                                                    +{activeTracks.length - 1}
                                                </span>
                                                <ChevronDown
                                                    className={`w-3 h-3 transition-transform ${isTracksDrawerOpen ? "rotate-180" : ""}`}
                                                />
                                            </motion.button>
                                        )}
                                        <motion.button
                                            type="button"
                                            whileTap={{ scale: 0.9 }}
                                            onClick={() =>
                                                onStopSound(primaryTrack.soundId)
                                            }
                                            title={t("soundCard.stop")}
                                            aria-label={t("soundCard.stop")}
                                            className={`w-6 h-6 flex items-center justify-center ${controlRadius} bg-[var(--bg-card)] hover:bg-rose-950/60 border border-[var(--border-subtle)] hover:border-rose-700 text-[var(--text-primary)] hover:text-rose-200 transition-colors cursor-pointer shrink-0`}
                                        >
                                            <Square className="w-2.5 h-2.5 fill-current" />
                                        </motion.button>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="dynamic-island-player-full"
                                        initial={{ opacity: 0, y: -3 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.14 }}
                                        className="flex w-full items-center gap-2.5 min-w-0"
                                    >
                                {/* Live Visualizer + Pulse Icon */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <div
                                        className={`w-7 h-7 ${controlRadius} bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent-text)]`}
                                    >
                                        <AudioLines className="w-3.5 h-3.5 animate-pulse" />
                                    </div>
                                    <div className="hidden md:flex items-center">
                                        <AudioVisualizer
                                            isPlaying={true}
                                            height={16}
                                        />
                                    </div>
                                </div>

                                {/* Track Title & Live Progress */}
                                {(() => {
                                    const dur = Math.max(
                                        0.5,
                                        primaryTrack.duration ||
                                            primarySound?.duration ||
                                            1,
                                    );
                                    const rawElapsed = Math.max(
                                        0,
                                        (now - primaryTrack.startedAt) / 1000,
                                    );
                                    const elapsed = primaryTrack.loop
                                        ? rawElapsed % dur
                                        : Math.min(dur, rawElapsed);
                                    const pct = Math.min(
                                        100,
                                        Math.max(0, (elapsed / dur) * 100),
                                    );

                                    return (
                                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                                    {primarySound?.title ||
                                                        primaryTrack.soundId}
                                                </span>
                                                {primarySound?.hotkey && (
                                                    <kbd
                                                        className={`hidden lg:inline-block px-1.5 py-0.2 ${controlRadius} bg-[var(--bg-inner)] border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--accent-text)] shrink-0`}
                                                    >
                                                        {primarySound.hotkey}
                                                    </kbd>
                                                )}
                                                <span className="ml-auto text-[10px] font-mono tabular-nums text-[var(--text-muted)] shrink-0">
                                                    {formatTime(elapsed)}/
                                                    {formatTime(dur)}
                                                </span>
                                            </div>

                                            <div className="mt-1 h-1 w-full bg-[var(--bg-inner)] border border-[var(--border-subtle)] rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-[var(--accent)] transition-[width] duration-75"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Quick Playback Actions */}
                                <div className="flex items-center gap-1 shrink-0">
                                    {activeTracks.length > 1 && (
                                        <motion.button
                                            type="button"
                                            whileTap={{ scale: 0.92 }}
                                            onClick={() =>
                                                setIsTracksDrawerOpen(
                                                    (prev) => !prev,
                                                )
                                            }
                                            title={t(
                                                "playbackBar.expandTracks",
                                            )}
                                            className={`h-7 px-2 flex items-center gap-1 ${controlRadius} border text-[11px] font-mono font-semibold transition-colors cursor-pointer ${
                                                isTracksDrawerOpen
                                                    ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                                    : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                            }`}
                                        >
                                            <span>+{activeTracks.length - 1}</span>
                                            <ChevronDown
                                                className={`w-3 h-3 transition-transform ${isTracksDrawerOpen ? "rotate-180" : ""}`}
                                            />
                                        </motion.button>
                                    )}

                                    {primarySound && (
                                        <motion.button
                                            type="button"
                                            whileTap={{ scale: 0.9 }}
                                            onClick={() =>
                                                onToggleLoop(primarySound.id)
                                            }
                                            title={
                                                primarySound.loop
                                                    ? t("soundCard.loopOn")
                                                    : t("soundCard.loopOff")
                                            }
                                            aria-label={
                                                primarySound.loop
                                                    ? t("soundCard.loopOn")
                                                    : t("soundCard.loopOff")
                                            }
                                            className={`w-7 h-7 flex items-center justify-center ${controlRadius} border transition-colors cursor-pointer ${
                                                primarySound.loop
                                                    ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                                    : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                            }`}
                                        >
                                            <Repeat className="w-3.5 h-3.5" />
                                        </motion.button>
                                    )}

                                    <motion.button
                                        type="button"
                                        whileTap={{ scale: 0.9 }}
                                        onClick={() =>
                                            onStopSound(primaryTrack.soundId)
                                        }
                                        title={t("soundCard.stop")}
                                        aria-label={t("soundCard.stop")}
                                        className={`w-7 h-7 flex items-center justify-center ${controlRadius} bg-[var(--bg-card)] hover:bg-rose-950/60 border border-[var(--border-subtle)] hover:border-rose-700 text-[var(--text-primary)] hover:text-rose-200 transition-colors cursor-pointer`}
                                    >
                                        <Square className="w-3 h-3 fill-current" />
                                    </motion.button>

                                    <motion.button
                                        type="button"
                                        whileTap={{ scale: 0.9 }}
                                        onClick={() => {
                                            setIsTracksDrawerOpen(false);
                                            setManualSearchWhilePlaying(true);
                                        }}
                                        title={t("playbackBar.switchToSearch")}
                                        aria-label={t(
                                            "playbackBar.switchToSearch",
                                        )}
                                        className={`w-7 h-7 flex items-center justify-center ${controlRadius} bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-colors cursor-pointer`}
                                    >
                                        <Search className="w-3.5 h-3.5" />
                                    </motion.button>
                                </div>
                                    </motion.div>
                                )}
                            </motion.div>
                        ) : isAuditionMode && audition ? (
                            <motion.div
                                key="dynamic-island-audition"
                                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                                transition={{
                                    duration: 0.2,
                                    ease: [0.22, 1, 0.36, 1],
                                }}
                                className="relative z-10 flex w-full items-center gap-2.5 min-w-0"
                            >
                                {isCompactPlayer ? (
                                    <div className="flex w-full items-center gap-2 min-w-0">
                                        <div
                                            className={`w-6 h-6 ${controlRadius} overflow-hidden shrink-0 border bg-[var(--bg-inner)] flex items-center justify-center ${
                                                audition.isPlaying
                                                    ? "border-[var(--accent-border)]"
                                                    : "border-[var(--border-subtle)]"
                                            }`}
                                        >
                                            {audition.thumbnailUrl ? (
                                                <img
                                                    src={audition.thumbnailUrl}
                                                    alt=""
                                                    referrerPolicy="no-referrer"
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <Music2 className="w-3 h-3 text-[var(--text-muted)]" />
                                            )}
                                        </div>
                                        <span className="flex-1 min-w-0 text-xs font-semibold text-[var(--text-primary)] truncate">
                                            {audition.title}
                                        </span>
                                        <motion.button
                                            type="button"
                                            whileTap={{ scale: 0.9 }}
                                            onClick={() => auditionStore.toggle()}
                                            title={
                                                audition.isPlaying
                                                    ? t(
                                                          "spotify.previewPauseTitle",
                                                      )
                                                    : t(
                                                          "spotify.previewResumeTitle",
                                                      )
                                            }
                                            aria-label={
                                                audition.isPlaying
                                                    ? t(
                                                          "spotify.previewPauseTitle",
                                                      )
                                                    : t(
                                                          "spotify.previewResumeTitle",
                                                      )
                                            }
                                            className={`w-6 h-6 flex items-center justify-center ${controlRadius} border transition-colors cursor-pointer shrink-0 ${
                                                audition.isPlaying
                                                    ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                                    : "btn-accent border-transparent"
                                            }`}
                                        >
                                            {audition.isPlaying ? (
                                                <Pause className="w-3 h-3 fill-current" />
                                            ) : (
                                                <Play className="w-3 h-3 fill-current" />
                                            )}
                                        </motion.button>
                                        <motion.button
                                            type="button"
                                            whileTap={{ scale: 0.9 }}
                                            onClick={() => auditionStore.stop()}
                                            title={t(
                                                "spotify.previewStopTitle",
                                            )}
                                            aria-label={t(
                                                "spotify.previewStopTitle",
                                            )}
                                            className={`w-6 h-6 flex items-center justify-center ${controlRadius} bg-[var(--bg-card)] hover:bg-rose-950/60 border border-[var(--border-subtle)] hover:border-rose-700 text-[var(--text-primary)] hover:text-rose-200 transition-colors cursor-pointer shrink-0`}
                                        >
                                            <Square className="w-2.5 h-2.5 fill-current" />
                                        </motion.button>
                                    </div>
                                ) : (
                                    <div className="flex w-full items-center gap-2.5 min-w-0">
                                        <div
                                            className={`w-7 h-7 ${controlRadius} overflow-hidden shrink-0 border bg-[var(--bg-inner)] flex items-center justify-center ${
                                                audition.isPlaying
                                                    ? "border-[var(--accent-border)]"
                                                    : "border-[var(--border-subtle)]"
                                            }`}
                                        >
                                            {audition.thumbnailUrl ? (
                                                <img
                                                    src={audition.thumbnailUrl}
                                                    alt=""
                                                    referrerPolicy="no-referrer"
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <Music2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                                    {audition.title}
                                                </span>
                                                <span className="hidden lg:inline text-[10px] text-[var(--text-secondary)] truncate">
                                                    {audition.artist}
                                                </span>
                                                <span className="ml-auto text-[10px] font-mono tabular-nums text-[var(--text-muted)] shrink-0">
                                                    {formatTime(
                                                        audition.currentTime,
                                                    )}
                                                    /
                                                    {formatTime(
                                                        audition.duration,
                                                    )}
                                                </span>
                                            </div>
                                            <div className="mt-1 h-1 w-full bg-[var(--bg-inner)] border border-[var(--border-subtle)] rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-[var(--accent)] transition-[width] duration-150"
                                                    style={{
                                                        width: `${Math.min(
                                                            100,
                                                            Math.max(
                                                                0,
                                                                (audition.currentTime /
                                                                    Math.max(
                                                                        audition.duration,
                                                                        0.1,
                                                                    )) *
                                                                    100,
                                                            ),
                                                        )}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                            <motion.button
                                                type="button"
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() =>
                                                    setManualSearchWhilePlaying(
                                                        true,
                                                    )
                                                }
                                                title={t(
                                                    "playbackBar.switchToSearch",
                                                )}
                                                aria-label={t(
                                                    "playbackBar.switchToSearch",
                                                )}
                                                className={`w-7 h-7 flex items-center justify-center ${controlRadius} bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-colors cursor-pointer`}
                                            >
                                                <Search className="w-3.5 h-3.5" />
                                            </motion.button>

                                            <motion.button
                                                type="button"
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() =>
                                                    auditionStore.toggle()
                                                }
                                                title={
                                                    audition.isPlaying
                                                        ? t(
                                                              "spotify.previewPauseTitle",
                                                          )
                                                        : t(
                                                              "spotify.previewResumeTitle",
                                                          )
                                                }
                                                aria-label={
                                                    audition.isPlaying
                                                        ? t(
                                                              "spotify.previewPauseTitle",
                                                          )
                                                        : t(
                                                              "spotify.previewResumeTitle",
                                                          )
                                                }
                                                className={`w-7 h-7 flex items-center justify-center ${controlRadius} border transition-colors cursor-pointer ${
                                                    audition.isPlaying
                                                        ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                                        : "btn-accent border-transparent"
                                                }`}
                                            >
                                                {audition.isPlaying ? (
                                                    <Pause className="w-3 h-3 fill-current" />
                                                ) : (
                                                    <Play className="w-3 h-3 fill-current" />
                                                )}
                                            </motion.button>

                                            <motion.button
                                                type="button"
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() =>
                                                    auditionStore.stop()
                                                }
                                                title={t(
                                                    "spotify.previewStopTitle",
                                                )}
                                                aria-label={t(
                                                    "spotify.previewStopTitle",
                                                )}
                                                className={`w-7 h-7 flex items-center justify-center ${controlRadius} bg-[var(--bg-card)] hover:bg-rose-950/60 border border-[var(--border-subtle)] hover:border-rose-700 text-[var(--text-primary)] hover:text-rose-200 transition-colors cursor-pointer`}
                                            >
                                                <Square className="w-3 h-3 fill-current" />
                                            </motion.button>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="dynamic-island-search"
                                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                                transition={{
                                    duration: 0.18,
                                    ease: [0.22, 1, 0.36, 1],
                                }}
                                className="relative z-10 flex w-full items-center gap-2 min-w-0"
                            >
                                <Search
                                    className={`w-4 h-4 shrink-0 pointer-events-none transition-colors ${
                                        isSearchFocused
                                            ? "text-[var(--accent-text)]"
                                            : "text-[var(--text-muted)]"
                                    }`}
                                />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) =>
                                        onSearchChange(e.target.value)
                                    }
                                    onFocus={() => setIsSearchFocused(true)}
                                    onBlur={() => setIsSearchFocused(false)}
                                    placeholder={t("header.searchPlaceholder")}
                                    className="w-full bg-transparent text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
                                />
                                <AnimatePresence>
                                    {searchQuery && (
                                        <motion.button
                                            type="button"
                                            initial={{ opacity: 0, scale: 0.6 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.6 }}
                                            transition={{ duration: 0.14 }}
                                            onMouseDown={(e) =>
                                                e.preventDefault()
                                            }
                                            onClick={() => onSearchChange("")}
                                            aria-label={t("header.searchClear")}
                                            className={`p-1 ${controlRadius} text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer`}
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </motion.button>
                                    )}
                                </AnimatePresence>

                                {hasPlayback && (
                                    <motion.button
                                        type="button"
                                        initial={{ opacity: 0, scale: 0.85 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        whileTap={{ scale: 0.92 }}
                                        onClick={() =>
                                            setManualSearchWhilePlaying(false)
                                        }
                                        title={t("playbackBar.backToPlayer")}
                                        className={`h-6 px-2 flex items-center gap-1 ${controlRadius} bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[11px] font-medium text-[var(--accent-text)] shrink-0 cursor-pointer`}
                                    >
                                        {isPlayingAny ? (
                                            <AudioLines className="w-3 h-3 animate-pulse" />
                                        ) : (
                                            <Music2 className="w-3 h-3" />
                                        )}
                                        {isPlayingAny && (
                                            <span className="hidden md:inline">
                                                {activeTracks.length}
                                            </span>
                                        )}
                                    </motion.button>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* Floating Multi-Track Drawer anchored beneath Dynamic Island */}
                <AnimatePresence>
                    {isPlayerMode &&
                        (isTracksDrawerOpen || isIslandHovered) &&
                        activeTracks.length > 1 && (
                            <motion.div
                                onMouseEnter={handleIslandMouseEnter}
                                onMouseLeave={handleIslandMouseLeave}
                                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                                transition={{
                                    type: "spring",
                                    stiffness: 440,
                                    damping: 32,
                                }}
                                style={!isWin10 ? capsuleStyle : undefined}
                                className={`pointer-events-auto window-no-drag absolute top-full mt-2 w-full max-w-[536px] z-50 border border-[var(--accent-border)] backdrop-blur-xl p-2.5 flex flex-col gap-1.5 ${
                                    isWin10
                                        ? "bg-[var(--bg-island)] rounded-[2px]"
                                        : isWin11
                                          ? "rounded-xl"
                                          : "rounded-2xl"
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2 px-1 pb-0.5">
                                    <span className="flex items-center gap-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-[var(--accent-text)]">
                                        <AudioLines className="w-3 h-3 animate-pulse" />
                                        <span>
                                            {t("playbackBar.playingCount", {
                                                count: activeTracks.length,
                                            })}
                                        </span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={onStopAll}
                                        className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:text-rose-300 transition-colors cursor-pointer"
                                    >
                                        {t("header.stopAll")}
                                    </button>
                                </div>
                                {activeTracks.slice(0, 3).map((track) => {
                                    const s = sounds.find(
                                        (item) => item.id === track.soundId,
                                    );
                                    const dur = Math.max(
                                        0.5,
                                        track.duration || s?.duration || 1,
                                    );
                                    const rawElapsed = Math.max(
                                        0,
                                        (now - track.startedAt) / 1000,
                                    );
                                    const elapsed = track.loop
                                        ? rawElapsed % dur
                                        : Math.min(dur, rawElapsed);
                                    const pct = Math.min(
                                        100,
                                        Math.max(0, (elapsed / dur) * 100),
                                    );

                                    return (
                                        <div
                                            key={track.soundId}
                                            className="px-3 py-2 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-1"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                                                    {s?.title || track.soundId}
                                                </span>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <span className="text-[10px] font-mono tabular-nums text-[var(--text-muted)] mr-1">
                                                        {formatTime(elapsed)}/
                                                        {formatTime(dur)}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            onToggleLoop(
                                                                track.soundId,
                                                            )
                                                        }
                                                        className={`p-1 ${controlRadius} cursor-pointer ${
                                                            track.loop
                                                                ? "text-[var(--accent-text)]"
                                                                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                                        }`}
                                                        title={
                                                            track.loop
                                                                ? t(
                                                                      "soundCard.loopOn",
                                                                  )
                                                                : t(
                                                                      "soundCard.loopOff",
                                                                  )
                                                        }
                                                    >
                                                        <Repeat className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            onStopSound(
                                                                track.soundId,
                                                            )
                                                        }
                                                        className={`p-1 ${controlRadius} text-rose-300 hover:bg-rose-950/60 cursor-pointer`}
                                                        title={t(
                                                            "soundCard.stop",
                                                        )}
                                                    >
                                                        <Square className="w-3 h-3 fill-current" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="h-1 bg-[var(--bg-card)] rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-[var(--accent)] transition-[width] duration-75"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </motion.div>
                        )}
                </AnimatePresence>
            </div>

            {/* Right Capsule / Section: Master Volume, Stop, Add Sound & Window Controls */}
            <motion.div
                data-tour="header-actions"
                layout
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className={`${capsuleBaseClass} sm:justify-self-end ${isWin10 ? "px-0 gap-1.5" : "px-1.5 gap-1.5"}`}
                style={!isWin10 ? capsuleStyle : undefined}
            >
                {/* Master Volume Control with smooth spring expand */}
                <motion.div
                    onMouseEnter={() => setIsVolumeExpanded(true)}
                    onMouseLeave={() => setIsVolumeExpanded(false)}
                    onFocus={() => setIsVolumeExpanded(true)}
                    onBlur={() => setIsVolumeExpanded(false)}
                    animate={{ width: isVolumeExpanded ? 148 : 32 }}
                    transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 32,
                    }}
                    className={`hidden sm:flex h-8 items-center gap-2 overflow-hidden ${controlRadius} border border-[var(--border-subtle)] bg-[var(--bg-card)] px-1.5`}
                >
                    <motion.button
                        type="button"
                        whileTap={{ scale: 0.88 }}
                        onClick={handleToggleMute}
                        className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] cursor-pointer"
                        title={
                            isMuted ? t("header.unmute") : t("header.mute")
                        }
                    >
                        {isMuted ? (
                            <VolumeX className="w-4 h-4 text-rose-400" />
                        ) : (
                            <Volume2 className="w-4 h-4 text-[var(--text-primary)]" />
                        )}
                    </motion.button>
                    <motion.div
                        animate={{
                            opacity: isVolumeExpanded ? 1 : 0,
                        }}
                        transition={{ duration: 0.16 }}
                        className="flex w-[104px] shrink-0 items-center gap-2"
                    >
                        <input
                            type="range"
                            min="0"
                            max="1.5"
                            step="0.05"
                            value={routingConfig.masterVolume}
                            onChange={(e) =>
                                handleVolumeSlider(parseFloat(e.target.value))
                            }
                            className="w-16 shrink-0 cursor-pointer"
                            title={`${t("header.masterVolume")}: %${Math.round(routingConfig.masterVolume * 100)}`}
                        />
                        <span className="w-10 shrink-0 text-right text-[11px] font-mono tabular-nums text-[var(--text-secondary)]">
                            %{Math.round(routingConfig.masterVolume * 100)}
                        </span>
                    </motion.div>
                </motion.div>

                {/* Stop All Button */}
                <motion.button
                    type="button"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={onStopAll}
                    title={`${t("header.stopAll")} (${routingConfig.stopAllHotkey})`}
                    className={`h-8 flex items-center gap-1.5 px-3 ${controlRadius} text-xs font-medium border transition-colors cursor-pointer ${
                        activePlayingCount > 0
                            ? "bg-rose-950/60 border-rose-700 text-rose-300 hover:bg-rose-950/80"
                            : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]"
                    }`}
                >
                    <Square className="w-3 h-3 fill-current" />
                    <span className="hidden xl:inline">
                        {t("soundCard.stop")}
                    </span>
                </motion.button>

                {/* Primary Green Accent CTA: Yeni Ses */}
                <motion.button
                    type="button"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={onAddNewSound}
                    className={`btn-accent h-8 flex items-center gap-1.5 px-3.5 ${controlRadius} text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap`}
                >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span className="hidden md:inline">
                        {t("header.addNewSound")}
                    </span>
                </motion.button>

                {/* Electron Window Controls */}
                {window.electronAPI?.isElectron && (
                    <div className="flex items-center pl-1.5 ml-0.5 border-l border-[var(--border-subtle)] gap-0.5">
                        <motion.button
                            type="button"
                            whileTap={{ scale: 0.88 }}
                            onClick={handleMinimize}
                            title={t("header.minimize")}
                            className={`w-7 h-7 flex items-center justify-center ${controlRadius} text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer`}
                        >
                            <Minus className="w-3.5 h-3.5" />
                        </motion.button>

                        <motion.button
                            type="button"
                            whileTap={{ scale: 0.88 }}
                            onClick={handleMaximize}
                            title={t("header.maximize")}
                            className={`w-7 h-7 flex items-center justify-center ${controlRadius} text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer`}
                        >
                            <Maximize2 className="w-3 h-3" />
                        </motion.button>

                        <motion.button
                            type="button"
                            whileTap={{ scale: 0.88 }}
                            onClick={handleClose}
                            title={t("header.close")}
                            className={`w-7 h-7 flex items-center justify-center ${controlRadius} text-[var(--text-secondary)] hover:text-white hover:bg-rose-600 transition-colors cursor-pointer`}
                        >
                            <X className="w-3.5 h-3.5" />
                        </motion.button>
                    </div>
                )}
            </motion.div>
        </header>
    );
}
