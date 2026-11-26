import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    Check,
    Cookie,
    Copy,
    Disc3,
    ExternalLink,
    Eye,
    EyeOff,
    Headphones,
    Heart,
    HelpCircle,
    ListMusic,
    Loader2,
    LogIn,
    LogOut,
    Mic,
    Music2,
    Pause,
    Play,
    Plus,
    Radio,
    RefreshCw,
    Scissors,
    Search,
    Settings2,
    ShieldCheck,
    Sliders,
    Square,
    Trash2,
    Upload,
    Volume2,
    VolumeX,
    X,
    Youtube,
} from "lucide-react";
import { getApiUrl } from "../utils/apiBase";
import { auditionStore } from "../utils/auditionStore";
import { SoundItem } from "../types/sound";
import {
    DEFAULT_SPOTIFY_REDIRECT_URI,
    SpotifyAuthState,
    SpotifyPlaylist,
    SpotifyTrack,
    spotifyService,
} from "../utils/spotifyService";
import {
    YouTubeConfig,
    YouTubeTrack,
    cancelYouTubeLogin,
    clearYouTubeCookie,
    getYouTubeAuthStatus,
    getYouTubeConfig,
    logoutYouTubeAccount,
    matchAndFetchYouTubeAudio,
    saveYouTubeCookie,
    searchYouTubeTracks,
    startYouTubeLogin,
} from "../utils/youtubeService";
import { audioEngine } from "../utils/audioEngine";
import { useTranslation } from "../i18n";
import { getPersistentItem, setPersistentItem } from "../utils/persistentStore";

interface SpotifyMusicViewProps {
    sounds: SoundItem[];
    activePlayingIds: string[];
    isVirtualCableOutput: boolean;
    onAddSound: (sound: Omit<SoundItem, "id" | "addedAt">) => SoundItem;
    onPlaySound: (sound: SoundItem) => void;
    onStopSound: (soundId: string) => void;
    onGoToSoundboard: () => void;
    onOpenRouting: () => void;
    onOpenInMaker: (sound: SoundItem) => void;
}

type MusicSourceTab =
    | "youtube-search"
    | "spotify-search"
    | "spotify-liked"
    | "spotify-playlists";

const SPOTIFY_TO_YOUTUBE_CACHE_KEY = "lir_spotify_yt_map_v1";

const QUICK_DISCOVERY_QUERIES = [
    "Lo-fi Beats",
    "Phonk",
    "Epic Cinematic",
    "Synthwave",
    "Meme Sound Effects",
];

function loadTrackVideoMap(): Record<string, string> {
    try {
        const raw = getPersistentItem(SPOTIFY_TO_YOUTUBE_CACHE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") {
                return parsed as Record<string, string>;
            }
        }
    } catch {
        // ignore
    }
    return {};
}

function saveTrackVideoMap(map: Record<string, string>) {
    try {
        setPersistentItem(SPOTIFY_TO_YOUTUBE_CACHE_KEY, JSON.stringify(map));
    } catch {
        // ignore
    }
}

function formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
    const total = Math.round(seconds);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

interface PreviewSession {
    key: string;
    kind: "youtube" | "spotify";
    title: string;
    artist: string;
    thumbnailUrl?: string;
    audioUrl: string;
    durationSec: number;
    youtubeTrack?: YouTubeTrack;
    spotifyTrack?: SpotifyTrack;
}

function TrackThumbnail({
    src,
    alt,
    wide = false,
    isPlaying = false,
    isReady = false,
    isLoading = false,
    coverMode = "mic",
    onCoverClick,
}: {
    src?: string;
    alt: string;
    wide?: boolean;
    isPlaying?: boolean;
    isReady?: boolean;
    isLoading?: boolean;
    coverMode?: "mic" | "preview";
    onCoverClick?: () => void;
}) {
    const [failed, setFailed] = useState(false);
    const sizeClass = wide ? "w-[88px] h-14" : "w-14 h-14";

    return (
        <motion.div
            onClick={onCoverClick}
            animate={isPlaying ? { scale: [1, 1.04, 1] } : { scale: 1 }}
            transition={
                isPlaying
                    ? { repeat: Infinity, duration: 1.5, ease: "easeInOut" }
                    : { duration: 0.2 }
            }
            whileTap={onCoverClick ? { scale: 0.94 } : undefined}
            className={`relative ${sizeClass} ui-inner overflow-hidden shrink-0 border ${
                isPlaying
                    ? "border-[var(--accent-border)]"
                    : "border-[var(--border-subtle)]"
            } bg-[var(--bg-inner)] ${onCoverClick ? "cursor-pointer group/cover" : ""}`}
        >
            {!src || failed ? (
                <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
                    <Music2 className="w-5 h-5" />
                </div>
            ) : (
                <img
                    src={src}
                    alt={alt}
                    referrerPolicy="no-referrer"
                    onError={() => setFailed(true)}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover/cover:scale-105"
                />
            )}

            {(isReady || isLoading) && onCoverClick && (
                <div
                    className={`absolute inset-0 bg-black/55 flex items-center justify-center transition-opacity duration-150 ${
                        isPlaying || isLoading
                            ? "opacity-100"
                            : "opacity-0 group-hover/cover:opacity-100"
                    }`}
                >
                    {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-text)]" />
                    ) : isPlaying ? (
                        coverMode === "preview" ? (
                            <Pause className="w-4 h-4 fill-current text-[var(--accent-text)]" />
                        ) : (
                            <Square className="w-4 h-4 fill-current text-[var(--accent-text)]" />
                        )
                    ) : (
                        <Play className="w-4 h-4 fill-current text-white keep-white ml-0.5" />
                    )}
                </div>
            )}
        </motion.div>
    );
}

export function SpotifyMusicView({
    sounds,
    activePlayingIds,
    isVirtualCableOutput,
    onAddSound,
    onPlaySound,
    onStopSound,
    onGoToSoundboard,
    onOpenRouting,
    onOpenInMaker,
}: SpotifyMusicViewProps) {
    const { t } = useTranslation();

    const [spotifyState, setSpotifyState] = useState<SpotifyAuthState>(() =>
        spotifyService.getState(),
    );
    const [clientIdDraft, setClientIdDraft] = useState(spotifyState.clientId);
    const [showConfigBox, setShowConfigBox] = useState(false);
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
    const [showCookieBox, setShowCookieBox] = useState(false);
    const [ytAuthMethodTab, setYtAuthMethodTab] = useState<"account" | "cookie">(
        "account",
    );
    const [isStartingYtAuth, setIsStartingYtAuth] = useState(false);
    const [copiedYtCode, setCopiedYtCode] = useState(false);
    const [cookieInput, setCookieInput] = useState("");
    const [showCookieText, setShowCookieText] = useState(false);
    const [isSavingCookie, setIsSavingCookie] = useState(false);
    const [cookieFeedback, setCookieFeedback] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);
    const [cookieGuideTab, setCookieGuideTab] = useState<"extension" | "devtools">(
        "extension",
    );
    const cookieFileRef = useRef<HTMLInputElement | null>(null);

    const [sourceTab, setSourceTab] = useState<MusicSourceTab>(
        spotifyState.isConnected ? "spotify-liked" : "youtube-search",
    );

    const [spotifyQuery, setSpotifyQuery] = useState("");
    const [spotifySearchResults, setSpotifySearchResults] = useState<SpotifyTrack[]>([]);
    const [likedTracks, setLikedTracks] = useState<SpotifyTrack[]>([]);
    const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
    const [selectedPlaylist, setSelectedPlaylist] = useState<SpotifyPlaylist | null>(
        null,
    );
    const [playlistTracks, setPlaylistTracks] = useState<SpotifyTrack[]>([]);
    const [libraryFilterQuery, setLibraryFilterQuery] = useState("");

    const [youtubeQuery, setYoutubeQuery] = useState("");
    const [youtubeResults, setYoutubeResults] = useState<YouTubeTrack[]>([]);
    const [isSearchFocused, setIsSearchFocused] = useState(false);

    const [isLoadingList, setIsLoadingList] = useState(false);
    const [listError, setListError] = useState<string | null>(null);
    const [importingKeys, setImportingKeys] = useState<Record<string, boolean>>({});
    const [batchImporting, setBatchImporting] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [trackToVideoId, setTrackToVideoId] = useState<Record<string, string>>(
        loadTrackVideoMap,
    );

    // Local pre-add listening / preview player state (headphones monitor only, never mic)
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);
    const previewRequestIdRef = useRef(0);
    const previewUrlCacheRef = useRef<
        Record<string, { audioUrl: string; durationSec: number; videoId: string }>
    >({});
    const [loadingPreviewKey, setLoadingPreviewKey] = useState<string | null>(null);
    const [previewSession, setPreviewSession] = useState<PreviewSession | null>(null);
    const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
    const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
    const [previewDuration, setPreviewDuration] = useState(0);
    const [previewVolume, setPreviewVolume] = useState(0.85);
    const [isPreviewMuted, setIsPreviewMuted] = useState(false);

    useEffect(() => {
        const unsub = spotifyService.subscribe((next) => {
            setSpotifyState(next);
            if (next.clientId) {
                setClientIdDraft((prev) => prev || next.clientId);
            }
        });
        void getYouTubeConfig().then((cfg) => setYoutubeConfig(cfg));
        return unsub;
    }, []);

    useEffect(() => {
        if (youtubeConfig.authStatus !== "pending") return;
        const interval = window.setInterval(() => {
            void getYouTubeAuthStatus().then((next) => {
                setYoutubeConfig(next);
                if (next.authStatus === "connected") {
                    setListError(null);
                    setToastMessage(t("spotify.ytAuthConnectedToast"));
                }
            });
        }, 2500);
        return () => window.clearInterval(interval);
    }, [youtubeConfig.authStatus, t]);

    useEffect(() => {
        if (!spotifyState.isConnected) return;
        setShowConfigBox(false);
        if (sourceTab === "youtube-search") {
            setSourceTab("spotify-liked");
        }
    }, [spotifyState.isConnected]);

    useEffect(() => {
        if (!toastMessage) return;
        const timer = window.setTimeout(() => setToastMessage(null), 4000);
        return () => window.clearTimeout(timer);
    }, [toastMessage]);

    const applyPreviewMonitorSink = useCallback(async (audio: HTMLAudioElement) => {
        try {
            const monitorDeviceId = audioEngine.getMonitorDeviceId();
            if (
                monitorDeviceId &&
                monitorDeviceId !== "default" &&
                "setSinkId" in audio
            ) {
                const setSink = (
                    audio as HTMLAudioElement & {
                        setSinkId?: (id: string) => Promise<void>;
                    }
                ).setSinkId;
                if (typeof setSink === "function") {
                    await setSink.call(audio, monitorDeviceId);
                }
            }
        } catch {
            // fallback to default audio output
        }
    }, []);

    useEffect(() => {
        const audio = new Audio();
        audio.preload = "auto";
        previewAudioRef.current = audio;

        const onTimeUpdate = () => setPreviewCurrentTime(audio.currentTime || 0);
        const onDurationChange = () => {
            if (Number.isFinite(audio.duration) && audio.duration > 0) {
                setPreviewDuration(audio.duration);
            }
        };
        const onPlay = () => setIsPreviewPlaying(true);
        const onPause = () => setIsPreviewPlaying(false);
        const onEnded = () => {
            setIsPreviewPlaying(false);
            setPreviewCurrentTime(0);
        };
        const onError = () => {
            setIsPreviewPlaying(false);
        };

        audio.addEventListener("timeupdate", onTimeUpdate);
        audio.addEventListener("loadedmetadata", onDurationChange);
        audio.addEventListener("durationchange", onDurationChange);
        audio.addEventListener("play", onPlay);
        audio.addEventListener("pause", onPause);
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("error", onError);

        return () => {
            previewRequestIdRef.current++;
            audio.pause();
            audio.src = "";
            audio.removeEventListener("timeupdate", onTimeUpdate);
            audio.removeEventListener("loadedmetadata", onDurationChange);
            audio.removeEventListener("durationchange", onDurationChange);
            audio.removeEventListener("play", onPlay);
            audio.removeEventListener("pause", onPause);
            audio.removeEventListener("ended", onEnded);
            audio.removeEventListener("error", onError);
            previewAudioRef.current = null;
        };
    }, []);

    useEffect(() => {
        const audio = previewAudioRef.current;
        if (!audio) return;
        audio.volume = isPreviewMuted ? 0 : Math.max(0, Math.min(1, previewVolume));
    }, [previewVolume, isPreviewMuted]);

    useEffect(() => {
        if (activePlayingIds.length > 0 && previewAudioRef.current && !previewAudioRef.current.paused) {
            previewAudioRef.current.pause();
        }
    }, [activePlayingIds.length]);

    const pausePreviewOnly = useCallback(() => {
        const audio = previewAudioRef.current;
        if (audio && !audio.paused) {
            audio.pause();
        }
    }, []);

    const stopAndClosePreview = useCallback(() => {
        previewRequestIdRef.current++;
        setLoadingPreviewKey(null);
        const audio = previewAudioRef.current;
        if (audio) {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
        }
        setPreviewSession(null);
        setIsPreviewPlaying(false);
        setPreviewCurrentTime(0);
        setPreviewDuration(0);
    }, []);

    const handleTogglePreviewPlayPause = useCallback(async () => {
        const audio = previewAudioRef.current;
        if (!audio || !previewSession) return;
        if (audio.paused) {
            await applyPreviewMonitorSink(audio);
            try {
                await audio.play();
            } catch (err) {
                setListError(
                    err instanceof Error ? err.message : t("spotify.errorGeneric"),
                );
            }
        } else {
            audio.pause();
        }
    }, [applyPreviewMonitorSink, previewSession, t]);

    // Mirror the local audition (Dinle) into the global header dynamic island
    useEffect(() => {
        auditionStore.publish(
            previewSession
                ? {
                      id: previewSession.key,
                      title: previewSession.title,
                      artist: previewSession.artist,
                      thumbnailUrl: previewSession.thumbnailUrl,
                      isPlaying: isPreviewPlaying,
                      currentTime: previewCurrentTime,
                      duration:
                          previewDuration || previewSession.durationSec || 0,
                  }
                : null,
        );
    }, [previewSession, isPreviewPlaying, previewCurrentTime, previewDuration]);

    useEffect(() => {
        auditionStore.setControls({
            toggle: () => {
                void handleTogglePreviewPlayPause();
            },
            stop: stopAndClosePreview,
        });
    }, [handleTogglePreviewPlayPause, stopAndClosePreview]);

    useEffect(() => {
        return () => {
            auditionStore.setControls(null);
            auditionStore.publish(null);
        };
    }, []);

    const playMicSoundCleanly = useCallback(
        (sound: SoundItem) => {
            pausePreviewOnly();
            onPlaySound(sound);
        },
        [onPlaySound, pausePreviewOnly],
    );

    const loadLikedTracks = useCallback(async () => {
        if (!spotifyState.isConnected) return;
        setIsLoadingList(true);
        setListError(null);
        try {
            const tracks = await spotifyService.getSavedTracks();
            setLikedTracks(tracks);
        } catch (err) {
            setListError(
                err instanceof Error ? err.message : t("spotify.errorGeneric"),
            );
        } finally {
            setIsLoadingList(false);
        }
    }, [spotifyState.isConnected, t]);

    const loadPlaylists = useCallback(async () => {
        if (!spotifyState.isConnected) return;
        setIsLoadingList(true);
        setListError(null);
        try {
            const items = await spotifyService.getUserPlaylists();
            setPlaylists(items);
        } catch (err) {
            setListError(
                err instanceof Error ? err.message : t("spotify.errorGeneric"),
            );
        } finally {
            setIsLoadingList(false);
        }
    }, [spotifyState.isConnected, t]);

    useEffect(() => {
        if (!spotifyState.isConnected) return;
        if (sourceTab === "spotify-liked" && likedTracks.length === 0) {
            void loadLikedTracks();
        } else if (sourceTab === "spotify-playlists" && playlists.length === 0) {
            void loadPlaylists();
        }
    }, [
        spotifyState.isConnected,
        sourceTab,
        likedTracks.length,
        playlists.length,
        loadLikedTracks,
        loadPlaylists,
    ]);

    const handleOpenPlaylist = async (playlist: SpotifyPlaylist) => {
        setSelectedPlaylist(playlist);
        setPlaylistTracks([]);
        setLibraryFilterQuery("");
        setIsLoadingList(true);
        setListError(null);
        try {
            const items = await spotifyService.getPlaylistTracks(playlist.id);
            setPlaylistTracks(items);
        } catch (err) {
            setListError(
                err instanceof Error ? err.message : t("spotify.errorGeneric"),
            );
        } finally {
            setIsLoadingList(false);
        }
    };

    const handleSpotifySearch = async (e?: React.FormEvent, overrideQuery?: string) => {
        e?.preventDefault();
        const q = (overrideQuery ?? spotifyQuery).trim();
        if (!q) return;
        setIsLoadingList(true);
        setListError(null);
        try {
            const items = await spotifyService.searchTracks(q);
            setSpotifySearchResults(items);
        } catch (err) {
            setListError(
                err instanceof Error ? err.message : t("spotify.errorGeneric"),
            );
        } finally {
            setIsLoadingList(false);
        }
    };

    const handleYouTubeSearch = async (e?: React.FormEvent, overrideQuery?: string) => {
        e?.preventDefault();
        const q = (overrideQuery ?? youtubeQuery).trim();
        if (!q) return;
        setIsLoadingList(true);
        setListError(null);
        try {
            const items = await searchYouTubeTracks(q, 12);
            setYoutubeResults(items);
        } catch (err) {
            setListError(
                err instanceof Error ? err.message : t("spotify.errorGeneric"),
            );
        } finally {
            setIsLoadingList(false);
        }
    };

    const handleSearchOnYouTubeForTrack = async (track: SpotifyTrack) => {
        const artists = track.artists?.map((a) => a.name).join(" ") || "";
        const q = artists ? `${artists} ${track.name}` : track.name;
        setYoutubeQuery(q);
        setSourceTab("youtube-search");
        setIsLoadingList(true);
        setListError(null);
        try {
            const items = await searchYouTubeTracks(q, 12);
            setYoutubeResults(items);
        } catch (err) {
            setListError(
                err instanceof Error ? err.message : t("spotify.errorGeneric"),
            );
        } finally {
            setIsLoadingList(false);
        }
    };

    const handleConnectSpotify = async () => {
        setListError(null);
        if (clientIdDraft.trim() !== spotifyState.clientId) {
            spotifyService.updateState({ clientId: clientIdDraft.trim() });
        }
        try {
            await spotifyService.initiateLogin();
        } catch (err) {
            setListError(
                err instanceof Error ? err.message : t("spotify.errorGeneric"),
            );
            setShowConfigBox(true);
        }
    };

    const handleCopyRedirectUri = async () => {
        const uri = spotifyService.getRedirectUri();
        try {
            await navigator.clipboard.writeText(uri);
            setCopiedRedirect(true);
            window.setTimeout(() => setCopiedRedirect(false), 1800);
        } catch {
            // fallback ignored
        }
    };

    const handleStartYouTubeLogin = async () => {
        setShowCookieBox(true);
        setShowConfigBox(false);
        setYtAuthMethodTab("account");
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

    const handleCancelYouTubeLogin = async () => {
        const next = await cancelYouTubeLogin();
        setYoutubeConfig(next);
    };

    const handleLogoutYouTube = async () => {
        setIsStartingYtAuth(true);
        try {
            const next = await logoutYouTubeAccount();
            setYoutubeConfig(next);
        } catch (err) {
            setListError(
                err instanceof Error ? err.message : t("spotify.errorGeneric"),
            );
        } finally {
            setIsStartingYtAuth(false);
        }
    };

    const handleCopyYouTubeCode = async (code: string) => {
        try {
            await navigator.clipboard.writeText(code);
            setCopiedYtCode(true);
            window.setTimeout(() => setCopiedYtCode(false), 1800);
        } catch {
            // fallback ignored
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
            setShowCookieText(false);
            setCookieFeedback({
                type: "success",
                text: t("spotify.cookieSavedSuccess", {
                    count: updated.cookieCount || 1,
                }),
            });
            setListError(null);
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
            const text = await file.text();
            await handleSaveCookie(text);
        } catch {
            setCookieFeedback({
                type: "error",
                text: t("spotify.cookieFileReadError"),
            });
        }
    };

    const handleClearCookie = async () => {
        setIsSavingCookie(true);
        setCookieFeedback(null);
        try {
            const updated = await clearYouTubeCookie();
            setYoutubeConfig(updated);
            setCookieInput("");
            setCookieFeedback({
                type: "success",
                text: t("spotify.cookieClearedSuccess"),
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

    const soundByAudioUrl = useMemo(() => {
        const map = new Map<string, SoundItem>();
        for (const s of sounds) {
            if (s.dataUrl) map.set(s.dataUrl, s);
        }
        return map;
    }, [sounds]);

    const findExistingSoundForSpotifyTrack = useCallback(
        (track: SpotifyTrack): SoundItem | undefined => {
            const mappedVideoId = trackToVideoId[track.id];
            if (mappedVideoId) {
                const byUrl = soundByAudioUrl.get(
                    `/api/youtube/audio/${mappedVideoId}`,
                );
                if (byUrl) return byUrl;
            }
            const artists = track.artists?.map((a) => a.name).join(", ") || "";
            const expectedTitle = artists
                ? `${artists} - ${track.name}`
                : track.name;
            return sounds.find(
                (s) => s.title.toLowerCase() === expectedTitle.toLowerCase(),
            );
        },
        [sounds, soundByAudioUrl, trackToVideoId],
    );

    const findExistingSoundForYouTubeTrack = useCallback(
        (yt: YouTubeTrack): SoundItem | undefined => {
            return soundByAudioUrl.get(`/api/youtube/audio/${yt.videoId}`);
        },
        [soundByAudioUrl],
    );

    const handlePreviewYouTubeTrack = useCallback(
        async (yt: YouTubeTrack) => {
            const key = `yt:${yt.videoId}`;
            const audio = previewAudioRef.current;
            if (!audio) return;

            if (previewSession?.key === key) {
                await handleTogglePreviewPlayPause();
                return;
            }

            const requestId = ++previewRequestIdRef.current;
            audio.pause();
            setIsPreviewPlaying(false);
            setLoadingPreviewKey(key);
            setListError(null);

            try {
                const existing = findExistingSoundForYouTubeTrack(yt);
                const cached = previewUrlCacheRef.current[key];
                let resolvedAudioUrl = existing?.dataUrl || cached?.audioUrl;
                let resolvedDuration = existing?.duration || cached?.durationSec || yt.durationSec || 0;

                if (!resolvedAudioUrl) {
                    const matched = await matchAndFetchYouTubeAudio({
                        trackName: yt.title,
                        artistName: yt.channelTitle,
                        durationSec: yt.durationSec,
                        videoId: yt.videoId,
                    });
                    resolvedAudioUrl = matched.audioUrl;
                    resolvedDuration =
                        matched.track.durationSec || yt.durationSec || 0;
                    previewUrlCacheRef.current[key] = {
                        audioUrl: resolvedAudioUrl,
                        durationSec: resolvedDuration,
                        videoId: matched.track.videoId,
                    };
                }

                if (previewRequestIdRef.current !== requestId) return;

                audio.src = getApiUrl(resolvedAudioUrl);
                audio.currentTime = 0;
                await applyPreviewMonitorSink(audio);

                if (previewRequestIdRef.current !== requestId) return;

                setPreviewSession({
                    key,
                    kind: "youtube",
                    title: yt.title,
                    artist: yt.channelTitle,
                    thumbnailUrl: yt.thumbnailUrl,
                    audioUrl: resolvedAudioUrl,
                    durationSec: resolvedDuration,
                    youtubeTrack: yt,
                });
                setPreviewCurrentTime(0);
                setPreviewDuration(resolvedDuration);
                await audio.play();
            } catch (err) {
                if (previewRequestIdRef.current === requestId) {
                    setListError(
                        err instanceof Error
                            ? err.message
                            : t("spotify.errorGeneric"),
                    );
                }
            } finally {
                if (previewRequestIdRef.current === requestId) {
                    setLoadingPreviewKey(null);
                }
            }
        },
        [
            applyPreviewMonitorSink,
            findExistingSoundForYouTubeTrack,
            handleTogglePreviewPlayPause,
            previewSession?.key,
            t,
        ],
    );

    const handlePreviewSpotifyTrack = useCallback(
        async (track: SpotifyTrack) => {
            const key = `sp:${track.id}`;
            const audio = previewAudioRef.current;
            if (!audio) return;

            if (previewSession?.key === key) {
                await handleTogglePreviewPlayPause();
                return;
            }

            const artists = track.artists?.map((a) => a.name).join(", ") || "";
            const thumb =
                track.album?.images?.[1]?.url ||
                track.album?.images?.[2]?.url ||
                track.album?.images?.[0]?.url;
            const durationSec = track.duration_ms
                ? track.duration_ms / 1000
                : 0;

            const requestId = ++previewRequestIdRef.current;
            audio.pause();
            setIsPreviewPlaying(false);
            setLoadingPreviewKey(key);
            setListError(null);

            try {
                const existing = findExistingSoundForSpotifyTrack(track);
                const cached = previewUrlCacheRef.current[key];
                let resolvedAudioUrl = existing?.dataUrl || cached?.audioUrl;
                let resolvedDuration =
                    existing?.duration || cached?.durationSec || durationSec;

                if (!resolvedAudioUrl) {
                    const mappedVideoId = trackToVideoId[track.id];
                    const matched = await matchAndFetchYouTubeAudio({
                        trackName: track.name,
                        artistName: artists,
                        durationSec: durationSec || undefined,
                        videoId: mappedVideoId,
                    });
                    resolvedAudioUrl = matched.audioUrl;
                    resolvedDuration =
                        matched.track.durationSec || durationSec || 0;
                    previewUrlCacheRef.current[key] = {
                        audioUrl: resolvedAudioUrl,
                        durationSec: resolvedDuration,
                        videoId: matched.track.videoId,
                    };
                    setTrackToVideoId((prev) => {
                        if (prev[track.id] === matched.track.videoId) return prev;
                        const next = { ...prev, [track.id]: matched.track.videoId };
                        saveTrackVideoMap(next);
                        return next;
                    });
                }

                if (previewRequestIdRef.current !== requestId) return;

                audio.src = getApiUrl(resolvedAudioUrl);
                audio.currentTime = 0;
                await applyPreviewMonitorSink(audio);

                if (previewRequestIdRef.current !== requestId) return;

                setPreviewSession({
                    key,
                    kind: "spotify",
                    title: track.name,
                    artist: artists,
                    thumbnailUrl: thumb,
                    audioUrl: resolvedAudioUrl,
                    durationSec: resolvedDuration,
                    spotifyTrack: track,
                });
                setPreviewCurrentTime(0);
                setPreviewDuration(resolvedDuration);
                await audio.play();
            } catch (err) {
                if (previewRequestIdRef.current === requestId) {
                    setListError(
                        err instanceof Error
                            ? err.message
                            : t("spotify.errorGeneric"),
                    );
                }
            } finally {
                if (previewRequestIdRef.current === requestId) {
                    setLoadingPreviewKey(null);
                }
            }
        },
        [
            applyPreviewMonitorSink,
            findExistingSoundForSpotifyTrack,
            handleTogglePreviewPlayPause,
            previewSession?.key,
            t,
            trackToVideoId,
        ],
    );

    const importSpotifyTrack = useCallback(
        async (track: SpotifyTrack, playImmediately = false) => {
            const existing = findExistingSoundForSpotifyTrack(track);
            if (existing) {
                if (playImmediately) playMicSoundCleanly(existing);
                return existing;
            }

            const artists = track.artists?.map((a) => a.name).join(", ") || "";
            const displayTitle = artists
                ? `${artists} - ${track.name}`
                : track.name;
            const durationSec = track.duration_ms
                ? track.duration_ms / 1000
                : undefined;
            const itemKey = `sp:${track.id}`;

            setImportingKeys((prev) => ({ ...prev, [itemKey]: true }));
            setListError(null);

            try {
                const matched = await matchAndFetchYouTubeAudio({
                    trackName: track.name,
                    artistName: artists,
                    durationSec,
                    videoId: trackToVideoId[track.id],
                });

                const decoded = await audioEngine.decodeDataUrlToBuffer(
                    matched.audioUrl,
                );
                const resolvedDuration =
                    decoded?.duration ||
                    matched.track.durationSec ||
                    durationSec ||
                    30;

                const createdSound = onAddSound({
                    title: displayTitle,
                    hotkey: "",
                    duration: resolvedDuration,
                    category: "Müzik",
                    volume: 0.9,
                    isFavorite: false,
                    loop: false,
                    playMode: "overlap",
                    dataUrl: matched.audioUrl,
                });

                setTrackToVideoId((prev) => {
                    const next = { ...prev, [track.id]: matched.track.videoId };
                    saveTrackVideoMap(next);
                    return next;
                });

                setToastMessage(
                    t("spotify.addedToBoardToast", { title: displayTitle }),
                );

                if (playImmediately) {
                    playMicSoundCleanly(createdSound);
                }
                return createdSound;
            } catch (err) {
                setListError(
                    err instanceof Error ? err.message : t("spotify.errorGeneric"),
                );
                return null;
            } finally {
                setImportingKeys((prev) => {
                    const next = { ...prev };
                    delete next[itemKey];
                    return next;
                });
            }
        },
        [findExistingSoundForSpotifyTrack, onAddSound, playMicSoundCleanly, t, trackToVideoId],
    );

    const importYouTubeTrack = useCallback(
        async (yt: YouTubeTrack, playImmediately = false) => {
            const existing = findExistingSoundForYouTubeTrack(yt);
            if (existing) {
                if (playImmediately) playMicSoundCleanly(existing);
                return existing;
            }

            const itemKey = `yt:${yt.videoId}`;
            setImportingKeys((prev) => ({ ...prev, [itemKey]: true }));
            setListError(null);

            try {
                const matched = await matchAndFetchYouTubeAudio({
                    trackName: yt.title,
                    artistName: yt.channelTitle,
                    durationSec: yt.durationSec,
                    videoId: yt.videoId,
                });

                const decoded = await audioEngine.decodeDataUrlToBuffer(
                    matched.audioUrl,
                );
                const resolvedDuration =
                    decoded?.duration || yt.durationSec || 30;

                const createdSound = onAddSound({
                    title: yt.title,
                    hotkey: "",
                    duration: resolvedDuration,
                    category: "Müzik",
                    volume: 0.9,
                    isFavorite: false,
                    loop: false,
                    playMode: "overlap",
                    dataUrl: matched.audioUrl,
                });
                setToastMessage(
                    t("spotify.addedToBoardToast", { title: yt.title }),
                );

                if (playImmediately) {
                    playMicSoundCleanly(createdSound);
                }
                return createdSound;
            } catch (err) {
                setListError(
                    err instanceof Error ? err.message : t("spotify.errorGeneric"),
                );
                return null;
            } finally {
                setImportingKeys((prev) => {
                    const next = { ...prev };
                    delete next[itemKey];
                    return next;
                });
            }
        },
        [findExistingSoundForYouTubeTrack, onAddSound, playMicSoundCleanly, t],
    );

    const handleBatchImportList = async (tracks: SpotifyTrack[]) => {
        const toAdd = tracks
            .filter((tr) => !findExistingSoundForSpotifyTrack(tr))
            .slice(0, 12);
        if (toAdd.length === 0) return;

        setBatchImporting(true);
        let addedCount = 0;
        for (const tr of toAdd) {
            const res = await importSpotifyTrack(tr, false);
            if (res) addedCount++;
        }
        setBatchImporting(false);
        if (addedCount > 0) {
            setToastMessage(t("spotify.batchAddedToast", { count: addedCount }));
        }
    };

    const filteredLikedTracks = useMemo(() => {
        const q = libraryFilterQuery.trim().toLowerCase();
        if (!q) return likedTracks;
        return likedTracks.filter((tr) => {
            const artists = tr.artists?.map((a) => a.name).join(" ") || "";
            return (
                tr.name.toLowerCase().includes(q) ||
                artists.toLowerCase().includes(q)
            );
        });
    }, [likedTracks, libraryFilterQuery]);

    const filteredPlaylists = useMemo(() => {
        const q = libraryFilterQuery.trim().toLowerCase();
        if (!q) return playlists;
        return playlists.filter((pl) => pl.name.toLowerCase().includes(q));
    }, [playlists, libraryFilterQuery]);

    const filteredPlaylistTracks = useMemo(() => {
        const q = libraryFilterQuery.trim().toLowerCase();
        if (!q) return playlistTracks;
        return playlistTracks.filter((tr) => {
            const artists = tr.artists?.map((a) => a.name).join(" ") || "";
            return (
                tr.name.toLowerCase().includes(q) ||
                artists.toLowerCase().includes(q)
            );
        });
    }, [playlistTracks, libraryFilterQuery]);

    const activeSearchValue =
        sourceTab === "youtube-search"
            ? youtubeQuery
            : sourceTab === "spotify-search"
              ? spotifyQuery
              : libraryFilterQuery;

    const handleActiveSearchChange = (value: string) => {
        if (sourceTab === "youtube-search") {
            setYoutubeQuery(value);
        } else if (sourceTab === "spotify-search") {
            setSpotifyQuery(value);
        } else {
            setLibraryFilterQuery(value);
        }
    };

    const handleActiveSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (sourceTab === "youtube-search") {
            void handleYouTubeSearch();
        } else if (sourceTab === "spotify-search") {
            void handleSpotifySearch();
        }
    };

    const activeSearchPlaceholder =
        sourceTab === "youtube-search"
            ? t("spotify.youtubeSearchPlaceholder")
            : sourceTab === "spotify-search"
              ? t("spotify.spotifySearchPlaceholder")
              : t("header.searchPlaceholder");

    const isCatalogSearchTab =
        sourceTab === "youtube-search" || sourceTab === "spotify-search";

    const sourceTabs: Array<{
        id: MusicSourceTab;
        label: string;
        icon: typeof Youtube;
        disabled?: boolean;
    }> = [
        {
            id: "youtube-search",
            label: t("spotify.tabYouTubeSearch"),
            icon: Youtube,
        },
        {
            id: "spotify-search",
            label: t("spotify.tabSpotifySearch"),
            icon: Search,
            disabled: !spotifyState.isConnected,
        },
        {
            id: "spotify-liked",
            label: t("spotify.tabLiked"),
            icon: Heart,
            disabled: !spotifyState.isConnected,
        },
        {
            id: "spotify-playlists",
            label: t("spotify.tabPlaylists"),
            icon: ListMusic,
            disabled: !spotifyState.isConnected,
        },
    ];

    const renderSkeletonGrid = () => (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="grid grid-cols-1 xl:grid-cols-2 gap-3.5"
        >
            {Array.from({ length: 6 }).map((_, idx) => (
                <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                        duration: 0.2,
                        delay: idx * 0.04,
                        ease: [0.22, 1, 0.36, 1],
                    }}
                    className="app-card ui-card p-3.5 border border-[var(--border-card)] flex items-center justify-between gap-4 animate-pulse"
                >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <div className="w-14 h-14 ui-inner bg-[var(--bg-inner)] shrink-0" />
                        <div className="flex-1 space-y-2 min-w-0">
                            <div className="h-3.5 w-3/5 rounded bg-[var(--bg-inner)]" />
                            <div className="h-3 w-2/5 rounded bg-[var(--bg-inner)]" />
                        </div>
                    </div>
                    <div className="h-8 w-24 ui-control bg-[var(--bg-inner)] shrink-0" />
                </motion.div>
            ))}
        </motion.div>
    );

    const renderEmptyState = (
        title: string,
        subtitle?: string,
        showSuggestions = false,
    ) => (
        <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
            className="app-card ui-card card-ambient-glow flex-1 flex flex-col items-center justify-center p-10 sm:p-14 text-center border border-[var(--border-card)]"
        >
            <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                whileHover={{ scale: 1.08, rotate: 6 }}
                transition={{ type: "spring", stiffness: 400, damping: 24 }}
                className="w-12 h-12 ui-inner bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center mb-3.5 text-[var(--accent-text)]"
            >
                {sourceTab === "youtube-search" ? (
                    <Youtube className="w-6 h-6" />
                ) : (
                    <Disc3 className="w-6 h-6" />
                )}
            </motion.div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                {title}
            </h3>
            {subtitle && (
                <p className="text-xs text-[var(--text-secondary)] max-w-md leading-relaxed">
                    {subtitle}
                </p>
            )}
            {showSuggestions && (
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2 max-w-lg">
                    {QUICK_DISCOVERY_QUERIES.map((query, idx) => (
                        <motion.button
                            key={query}
                            type="button"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                                type: "spring",
                                stiffness: 400,
                                damping: 28,
                                delay: 0.05 + idx * 0.035,
                            }}
                            whileHover={{ y: -2, scale: 1.03 }}
                            whileTap={{ scale: 0.94 }}
                            onClick={() => {
                                setYoutubeQuery(query);
                                void handleYouTubeSearch(undefined, query);
                            }}
                            className="px-3 py-1.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] hover:border-[var(--accent-border)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                        >
                            {query}
                        </motion.button>
                    ))}
                </div>
            )}
        </motion.div>
    );

    const renderSpotifyTrackGrid = (tracks: SpotifyTrack[]) => {
        if (tracks.length === 0 && !isLoadingList) {
            return renderEmptyState(
                t("spotify.noTracks"),
                sourceTab === "spotify-search"
                    ? t("spotify.spotifySearchPlaceholder")
                    : undefined,
            );
        }

        return (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                {tracks.map((track, idx) => {
                    const artists =
                        track.artists?.map((a) => a.name).join(", ") || "";
                    const thumb =
                        track.album?.images?.[1]?.url ||
                        track.album?.images?.[2]?.url ||
                        track.album?.images?.[0]?.url;
                    const existing = findExistingSoundForSpotifyTrack(track);
                    const isPlaying = existing
                        ? activePlayingIds.includes(existing.id)
                        : false;
                    const itemKey = `sp:${track.id}`;
                    const isBusy = Boolean(importingKeys[itemKey]);
                    const isLoadingPreview = loadingPreviewKey === itemKey;
                    const isCurrentPreview = previewSession?.key === itemKey;
                    const isPreviewPlayingHere =
                        isCurrentPreview && isPreviewPlaying;
                    const isHighlighted = isPlaying || isPreviewPlayingHere;

                    return (
                        <motion.div
                            key={track.id}
                            layout
                            initial={{ opacity: 0, scale: 0.96, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.94, y: -6 }}
                            whileHover={{ y: -2 }}
                            transition={{
                                type: "spring",
                                stiffness: 380,
                                damping: 28,
                                delay: Math.min(idx * 0.025, 0.25),
                            }}
                            className={`app-card ui-card ${
                                isHighlighted ? "" : "card-ambient-glow"
                            } group relative overflow-hidden p-3.5 border flex items-center justify-between gap-3.5 transition-colors ${
                                isHighlighted
                                    ? "border-[var(--accent)] ring-1 ring-[var(--accent-border)]"
                                    : isCurrentPreview
                                      ? "border-[var(--accent-border)]"
                                      : "border-[var(--border-card)] hover:border-[var(--border-hover)]"
                            }`}
                        >
                            <AnimatePresence>
                                {isHighlighted && (
                                    <motion.div
                                        aria-hidden="true"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.25 }}
                                        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
                                    >
                                        <motion.div
                                            animate={{ opacity: [0.82, 1, 0.86] }}
                                            transition={{
                                                repeat: Infinity,
                                                duration: 2.2,
                                                ease: "easeInOut",
                                            }}
                                            className="absolute inset-0 card-spotlight-beam"
                                        />
                                        <div className="absolute inset-0 card-spotlight-floor" />
                                        <div className="absolute top-0 left-0 right-0 h-[1.5px] card-spotlight-rim" />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <div className="relative z-10 flex items-center gap-3.5 min-w-0 flex-1">
                                <TrackThumbnail
                                    src={thumb}
                                    alt={track.name}
                                    isPlaying={
                                        existing ? isPlaying : isPreviewPlayingHere
                                    }
                                    isReady
                                    isLoading={isLoadingPreview}
                                    coverMode={existing ? "mic" : "preview"}
                                    onCoverClick={
                                        existing
                                            ? () =>
                                                  isPlaying
                                                      ? onStopSound(existing.id)
                                                      : playMicSoundCleanly(
                                                            existing,
                                                        )
                                            : () =>
                                                  void handlePreviewSpotifyTrack(
                                                      track,
                                                  )
                                    }
                                />
                                <div className="min-w-0 flex-1">
                                    <h3
                                        className="text-sm font-semibold text-[var(--text-primary)] truncate"
                                        title={track.name}
                                    >
                                        {track.name}
                                    </h3>
                                    <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5 tabular-nums">
                                        {artists}
                                        {track.duration_ms
                                            ? ` · ${formatDuration(track.duration_ms / 1000)}`
                                            : ""}
                                    </p>
                                </div>
                            </div>

                            <div className="relative z-10 flex items-center gap-1.5 shrink-0">
                                {existing ? (
                                    <>
                                        <motion.button
                                            type="button"
                                            whileTap={{ scale: 0.91 }}
                                            onClick={() =>
                                                isPlaying
                                                    ? onStopSound(existing.id)
                                                    : playMicSoundCleanly(
                                                          existing,
                                                      )
                                            }
                                            className={`flex items-center gap-1.5 px-3 py-1.5 ui-control text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                                                isPlaying
                                                    ? "bg-rose-950/60 border border-rose-700 text-rose-300 hover:bg-rose-950/80"
                                                    : "btn-accent"
                                            }`}
                                        >
                                            {isPlaying ? (
                                                <>
                                                    <Square className="w-3.5 h-3.5 fill-current" />
                                                    <span>{t("soundCard.stop")}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Play className="w-3.5 h-3.5 fill-current" />
                                                    <span className="hidden sm:inline">
                                                        {t("spotify.playToMicBtn")}
                                                    </span>
                                                </>
                                            )}
                                        </motion.button>

                                        <motion.button
                                            type="button"
                                            whileTap={{ scale: 0.9 }}
                                            onClick={() => onOpenInMaker(existing)}
                                            title={t("soundCard.trimInMaker")}
                                            className="p-2 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                        >
                                            <Scissors className="w-3.5 h-3.5" />
                                        </motion.button>
                                    </>
                                ) : (
                                    <>
                                        <motion.button
                                            type="button"
                                            whileTap={{ scale: 0.91 }}
                                            disabled={isBusy}
                                            onClick={() =>
                                                void handlePreviewSpotifyTrack(
                                                    track,
                                                )
                                            }
                                            title={
                                                isPreviewPlayingHere
                                                    ? t("spotify.previewPauseTitle")
                                                    : t("spotify.previewTitle")
                                            }
                                            className={`flex items-center gap-1.5 px-2.5 py-1.5 ui-control border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 ${
                                                isCurrentPreview
                                                    ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                                    : "bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border-[var(--border-subtle)] hover:border-[var(--accent-border)] text-[var(--text-primary)]"
                                            }`}
                                        >
                                            {isLoadingPreview ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-text)]" />
                                            ) : isPreviewPlayingHere ? (
                                                <Pause className="w-3.5 h-3.5 fill-current" />
                                            ) : (
                                                <Headphones className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                            )}
                                            <span className="hidden md:inline">
                                                {isLoadingPreview
                                                    ? t("spotify.previewLoading")
                                                    : isPreviewPlayingHere
                                                      ? t("spotify.previewPauseBtn")
                                                      : t("spotify.previewBtn")}
                                            </span>
                                        </motion.button>

                                        <motion.button
                                            type="button"
                                            whileTap={{ scale: 0.9 }}
                                            disabled={isBusy}
                                            onClick={() =>
                                                void handleSearchOnYouTubeForTrack(
                                                    track,
                                                )
                                            }
                                            title={t("spotify.altVersionsTitle")}
                                            className="p-2 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 transition-colors cursor-pointer"
                                        >
                                            <Youtube className="w-3.5 h-3.5" />
                                        </motion.button>

                                        <motion.button
                                            type="button"
                                            whileTap={{ scale: 0.91 }}
                                            disabled={isBusy}
                                            onClick={() =>
                                                void importSpotifyTrack(track, false)
                                            }
                                            title={t("spotify.addToSoundpadBtn")}
                                            className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] hover:border-[var(--accent-border)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                                        >
                                            {isBusy ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-text)]" />
                                            ) : (
                                                <Plus className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                            )}
                                            <span className="hidden sm:inline">
                                                {isBusy
                                                    ? t("spotify.fetchingAudio")
                                                    : t("spotify.addToSoundpadBtn")}
                                            </span>
                                        </motion.button>

                                        <motion.button
                                            type="button"
                                            whileTap={{ scale: 0.9 }}
                                            disabled={isBusy}
                                            onClick={() =>
                                                void importSpotifyTrack(track, true)
                                            }
                                            title={t("spotify.addAndPlayTitle")}
                                            className="btn-accent p-2 ui-control disabled:opacity-50 transition-colors cursor-pointer"
                                        >
                                            <Mic className="w-3.5 h-3.5" />
                                        </motion.button>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        );
    };

    const redirectUri = spotifyService.getRedirectUri();

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1 flex flex-col gap-5 w-full"
        >
            {/* Page Header: Matches Soundboard Header Structure */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
                <div className="flex items-center gap-3.5">
                    <motion.div
                        whileHover={{ scale: 1.06, rotate: 12 }}
                        transition={{ type: "spring", stiffness: 420, damping: 24 }}
                        className="w-11 h-11 ui-inner bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] flex items-center justify-center shrink-0"
                    >
                        <Disc3
                            className={`w-5 h-5 ${
                                isPreviewPlaying || isLoadingList
                                    ? "animate-spin"
                                    : ""
                            }`}
                            style={
                                isPreviewPlaying && !isLoadingList
                                    ? { animationDuration: "4s" }
                                    : undefined
                            }
                        />
                    </motion.div>
                    <div>
                        <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                            {t("spotify.title")}
                        </h1>
                        <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] mt-0.5">
                            {t("spotify.subtitle")}
                        </p>
                    </div>
                </div>

                {/* Right Segmented Source Switcher (just like Soundboard's Tümü / Favoriler) */}
                <div className="flex flex-wrap items-center gap-1 p-1 ui-control bg-[var(--bg-island)] border border-[var(--border-subtle)] self-start lg:self-auto shrink-0">
                    {sourceTabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = sourceTab === tab.id;
                        return (
                            <motion.button
                                key={tab.id}
                                type="button"
                                whileTap={tab.disabled ? undefined : { scale: 0.96 }}
                                disabled={tab.disabled}
                                onClick={() => {
                                    setSourceTab(tab.id);
                                    setLibraryFilterQuery("");
                                }}
                                className={`relative flex items-center gap-1.5 px-3.5 py-1.5 ui-control text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                    isActive
                                        ? ""
                                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                }`}
                                style={
                                    isActive
                                        ? { color: "var(--btn-primary-text)" }
                                        : undefined
                                }
                            >
                                {isActive && (
                                    <motion.span
                                        layoutId="externalSourceTabPill"
                                        transition={{
                                            type: "spring",
                                            stiffness: 480,
                                            damping: 34,
                                        }}
                                        className="absolute inset-0 ui-control"
                                        style={{
                                            backgroundColor:
                                                "var(--btn-primary-bg)",
                                        }}
                                    />
                                )}
                                <Icon className="relative z-10 w-3.5 h-3.5" />
                                <span className="relative z-10">{tab.label}</span>
                            </motion.button>
                        );
                    })}
                </div>
            </motion.div>

            {/* Unified Connection Strip */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                    duration: 0.24,
                    delay: 0.04,
                    ease: [0.22, 1, 0.36, 1],
                }}
                className="app-card ui-card px-4 py-3 border border-[var(--border-card)] flex flex-wrap items-center justify-between gap-3"
            >
                {/* Left: Spotify Status & Connect */}
                <div className="flex flex-wrap items-center gap-2.5">
                    {spotifyState.isConnected ? (
                        <>
                            <div className="flex items-center gap-2.5">
                                {spotifyState.user?.images?.[0]?.url ? (
                                    <img
                                        src={spotifyState.user.images[0].url}
                                        alt={
                                            spotifyState.user.display_name ||
                                            "Spotify"
                                        }
                                        referrerPolicy="no-referrer"
                                        className="w-7 h-7 rounded-full object-cover border border-[var(--accent-border)]"
                                    />
                                ) : (
                                    <div className="w-7 h-7 rounded-full bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent-text)]">
                                        <Disc3 className="w-3.5 h-3.5" />
                                    </div>
                                )}
                                <div className="flex items-center gap-1.5 text-xs">
                                    <span className="font-semibold text-[var(--text-primary)]">
                                        {spotifyState.user?.display_name ||
                                            t("spotify.connectedUser")}
                                    </span>
                                    <span className="text-[var(--text-muted)]">·</span>
                                    <span className="text-[var(--accent-text)] font-medium">
                                        {t("spotify.connectedBadge")}
                                    </span>
                                </div>
                            </div>
                            <motion.button
                                type="button"
                                whileTap={{ scale: 0.94 }}
                                onClick={() => spotifyService.logout()}
                                className="flex items-center gap-1 px-2.5 py-1 ui-control bg-[var(--bg-inner)] hover:bg-rose-950/50 border border-[var(--border-subtle)] hover:border-rose-700 text-[11px] font-medium text-[var(--text-secondary)] hover:text-rose-300 transition-colors cursor-pointer"
                            >
                                <LogOut className="w-3 h-3" />
                                <span>{t("spotify.disconnectBtn")}</span>
                            </motion.button>
                        </>
                    ) : (
                        <div className="flex items-center gap-3">
                            <motion.button
                                type="button"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => void handleConnectSpotify()}
                                className="btn-accent flex items-center gap-1.5 px-3.5 py-1.5 ui-control text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                            >
                                <Disc3 className="w-3.5 h-3.5" />
                                <span>{t("spotify.connectBtn")}</span>
                            </motion.button>
                            <span className="hidden sm:inline text-xs text-[var(--text-secondary)]">
                                {t("spotify.connectTitle")}
                            </span>
                        </div>
                    )}

                    <motion.button
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        onClick={() => {
                            setShowConfigBox((v) => !v);
                            setShowCookieBox(false);
                        }}
                        title={t("spotify.showOAuthSettings")}
                        className={`p-1.5 ui-control border transition-colors cursor-pointer ${
                            showConfigBox
                                ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                : "bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                    >
                        <Settings2 className="w-3.5 h-3.5" />
                    </motion.button>
                </div>

                {/* Right: YouTube Session & Mic Routing */}
                <div className="flex flex-wrap items-center gap-2">
                    <motion.button
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                            setShowCookieBox((v) => !v);
                            setShowConfigBox(false);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 ui-control border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                            showCookieBox ||
                            youtubeConfig.hasOAuth ||
                            youtubeConfig.hasCookie
                                ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                : "bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                    >
                        {youtubeConfig.authStatus === "pending" ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : youtubeConfig.hasOAuth || youtubeConfig.hasCookie ? (
                            <ShieldCheck className="w-3.5 h-3.5" />
                        ) : (
                            <Youtube className="w-3.5 h-3.5" />
                        )}
                        <span>
                            {youtubeConfig.authStatus === "pending"
                                ? t("spotify.ytAuthPendingBadge")
                                : youtubeConfig.hasOAuth
                                  ? t("spotify.ytAuthConnectedBadge")
                                  : youtubeConfig.hasCookie
                                    ? t("spotify.cookieActiveBadge")
                                    : t("spotify.ytAuthSetupBadge")}
                        </span>
                    </motion.button>

                    <motion.button
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={onOpenRouting}
                        className={`flex items-center gap-1.5 px-3 py-1.5 ui-control border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                            isVirtualCableOutput
                                ? "bg-[var(--bg-inner)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                : "bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                    >
                        <Radio className="w-3.5 h-3.5 shrink-0" />
                        <span>
                            {isVirtualCableOutput
                                ? t("spotify.micRouteReady")
                                : t("spotify.micRouteCheck")}
                        </span>
                        <Sliders className="w-3 h-3 opacity-70" />
                    </motion.button>
                </div>
            </motion.div>

            {/* Collapsible Spotify OAuth Settings Drawer */}
            <AnimatePresence>
                {showConfigBox && (
                    <motion.section
                        initial={{ opacity: 0, y: -8, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.985 }}
                        transition={{ type: "spring", stiffness: 420, damping: 32 }}
                        className="app-card ui-card p-5 border border-[var(--border-card)] flex flex-col gap-4"
                    >
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                                    {t("spotify.showOAuthSettings")}
                                </h2>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                    {t("spotify.connectDesc")}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowConfigBox(false)}
                                className="p-1.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                                title={t("spotify.hideOAuthSettings")}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="pt-4 border-t border-[var(--border-subtle)] grid grid-cols-1 lg:grid-cols-2 gap-5">
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="text-xs font-semibold text-[var(--text-primary)]">
                                        {t("spotify.clientIdLabel")}
                                    </label>
                                    {spotifyState.hasEnvClientId && (
                                        <span className="text-[11px] font-mono text-[var(--accent-text)]">
                                            {t("spotify.envConfigured")}
                                        </span>
                                    )}
                                </div>
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
                                    className="w-full ui-input border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-border)]"
                                />
                                <p className="text-[11px] text-[var(--text-muted)]">
                                    {t("spotify.clientIdHelp")}
                                </p>
                            </div>

                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="text-xs font-semibold text-[var(--text-primary)]">
                                        {t("spotify.redirectUriLabel")}
                                    </label>
                                    {redirectUri !== DEFAULT_SPOTIFY_REDIRECT_URI && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                spotifyService.updateState({
                                                    redirectUri:
                                                        DEFAULT_SPOTIFY_REDIRECT_URI,
                                                })
                                            }
                                            className="text-[11px] font-medium text-[var(--accent-text)] hover:underline cursor-pointer"
                                        >
                                            lir.anticvalley.com.tr
                                        </button>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="url"
                                        value={redirectUri}
                                        onChange={(e) =>
                                            spotifyService.updateState({
                                                redirectUri: e.target.value,
                                            })
                                        }
                                        placeholder={DEFAULT_SPOTIFY_REDIRECT_URI}
                                        className="flex-1 ui-input border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-border)]"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => void handleCopyRedirectUri()}
                                        className="flex items-center gap-1.5 px-3 py-2 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] shrink-0 cursor-pointer"
                                    >
                                        {copiedRedirect ? (
                                            <>
                                                <Check className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                                <span>{t("remoteControl.copied")}</span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="w-3.5 h-3.5" />
                                                <span>{t("spotify.copyUriBtn")}</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                                <p className="text-[11px] text-[var(--text-muted)]">
                                    {t("spotify.redirectUriHelp")}
                                </p>
                            </div>
                        </div>
                    </motion.section>
                )}
            </AnimatePresence>

            {/* Collapsible YouTube Account Login & Cookie Drawer */}
            <AnimatePresence>
                {showCookieBox && (
                    <motion.section
                        initial={{ opacity: 0, y: -8, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.985 }}
                        transition={{ type: "spring", stiffness: 420, damping: 32 }}
                        className="app-card ui-card p-5 border border-[var(--border-card)] flex flex-col gap-4"
                    >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                                    {t("spotify.ytAuthPanelTitle")}
                                </h2>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                    {t("spotify.ytAuthPanelDesc")}
                                </p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <div className="flex items-center gap-1 p-1 ui-control bg-[var(--bg-island)] border border-[var(--border-subtle)]">
                                    <motion.button
                                        type="button"
                                        whileTap={{ scale: 0.96 }}
                                        onClick={() => setYtAuthMethodTab("account")}
                                        className={`relative inline-flex items-center gap-1.5 px-3 py-1 ui-control text-xs font-semibold transition-colors cursor-pointer ${
                                            ytAuthMethodTab === "account"
                                                ? ""
                                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                        }`}
                                        style={
                                            ytAuthMethodTab === "account"
                                                ? { color: "var(--btn-primary-text)" }
                                                : undefined
                                        }
                                    >
                                        {ytAuthMethodTab === "account" && (
                                            <motion.span
                                                layoutId="ytAuthMethodPill"
                                                transition={{
                                                    type: "spring",
                                                    stiffness: 480,
                                                    damping: 34,
                                                }}
                                                className="absolute inset-0 ui-control"
                                                style={{
                                                    backgroundColor:
                                                        "var(--btn-primary-bg)",
                                                }}
                                            />
                                        )}
                                        <LogIn className="relative z-10 w-3.5 h-3.5" />
                                        <span className="relative z-10">
                                            {t("spotify.ytAuthTabAccount")}
                                        </span>
                                    </motion.button>
                                    <motion.button
                                        type="button"
                                        whileTap={{ scale: 0.96 }}
                                        onClick={() => setYtAuthMethodTab("cookie")}
                                        className={`relative inline-flex items-center gap-1.5 px-3 py-1 ui-control text-xs font-semibold transition-colors cursor-pointer ${
                                            ytAuthMethodTab === "cookie"
                                                ? ""
                                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                        }`}
                                        style={
                                            ytAuthMethodTab === "cookie"
                                                ? { color: "var(--btn-primary-text)" }
                                                : undefined
                                        }
                                    >
                                        {ytAuthMethodTab === "cookie" && (
                                            <motion.span
                                                layoutId="ytAuthMethodPill"
                                                transition={{
                                                    type: "spring",
                                                    stiffness: 480,
                                                    damping: 34,
                                                }}
                                                className="absolute inset-0 ui-control"
                                                style={{
                                                    backgroundColor:
                                                        "var(--btn-primary-bg)",
                                                }}
                                            />
                                        )}
                                        <Cookie className="relative z-10 w-3.5 h-3.5" />
                                        <span className="relative z-10">
                                            {t("spotify.ytAuthTabCookie")}
                                        </span>
                                    </motion.button>
                                </div>

                                <motion.button
                                    type="button"
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => setShowCookieBox(false)}
                                    className="p-1.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                                    title={t("spotify.hideOAuthSettings")}
                                >
                                    <X className="w-4 h-4" />
                                </motion.button>
                            </div>
                        </div>

                        <AnimatePresence mode="wait">
                        {ytAuthMethodTab === "account" && (
                            <motion.div
                                key="yt-auth-account"
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                                className="pt-4 border-t border-[var(--border-subtle)] flex flex-col gap-3"
                            >
                                {youtubeConfig.hasOAuth ? (
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="flex items-start gap-2.5">
                                            <ShieldCheck className="w-5 h-5 text-[var(--accent-text)] shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-xs font-bold text-[var(--text-primary)]">
                                                    {t("spotify.ytAuthConnectedTitle")}
                                                </p>
                                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                                    {t("spotify.ytAuthConnectedDesc")}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            disabled={isStartingYtAuth}
                                            onClick={() => void handleLogoutYouTube()}
                                            className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-rose-950/60 hover:bg-rose-950/80 border border-rose-700 text-xs font-semibold text-rose-300 shrink-0 cursor-pointer"
                                        >
                                            <LogOut className="w-3.5 h-3.5" />
                                            <span>{t("spotify.disconnectBtn")}</span>
                                        </button>
                                    </div>
                                ) : youtubeConfig.authStatus === "pending" &&
                                  youtubeConfig.pendingAuth ? (
                                    <div className="flex flex-col gap-3">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                            <div className="space-y-1">
                                                <p className="text-xs font-bold text-[var(--text-primary)]">
                                                    {t("spotify.ytAuthPendingTitle")}
                                                </p>
                                                <p className="text-xs text-[var(--text-secondary)]">
                                                    {t("spotify.ytAuthPendingDesc")}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    void handleCancelYouTubeLogin()
                                                }
                                                className="self-start px-3 py-1.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] cursor-pointer"
                                            >
                                                {t("common.cancel")}
                                            </button>
                                        </div>

                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[var(--border-subtle)]">
                                            <div className="flex items-center gap-2.5 flex-1">
                                                <span className="text-xs text-[var(--text-secondary)]">
                                                    {t("spotify.ytAuthCodeLabel")}:
                                                </span>
                                                <code className="px-3 py-1.5 ui-input bg-[var(--bg-input)] border border-[var(--accent-border)] text-base font-mono font-bold tracking-widest text-[var(--accent-text)]">
                                                    {youtubeConfig.pendingAuth.userCode}
                                                </code>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void handleCopyYouTubeCode(
                                                            youtubeConfig.pendingAuth!
                                                                .userCode,
                                                        )
                                                    }
                                                    className="flex items-center gap-1 px-2.5 py-1.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                                                >
                                                    {copiedYtCode ? (
                                                        <>
                                                            <Check className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                                            <span>
                                                                {t("remoteControl.copied")}
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Copy className="w-3.5 h-3.5" />
                                                            <span>
                                                                {t("spotify.copyUriBtn")}
                                                            </span>
                                                        </>
                                                    )}
                                                </button>
                                            </div>

                                            <a
                                                href={
                                                    youtubeConfig.pendingAuth
                                                        .verificationUrl
                                                }
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={() =>
                                                    void handleCopyYouTubeCode(
                                                        youtubeConfig.pendingAuth!
                                                            .userCode,
                                                    )
                                                }
                                                className="btn-accent inline-flex items-center justify-center gap-2 px-4 py-2 ui-control text-xs font-semibold"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                                <span>
                                                    {t("spotify.ytAuthOpenGoogleBtn")}
                                                </span>
                                            </a>
                                        </div>

                                        <div className="flex items-center gap-2 text-xs text-amber-400">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                            <span>{t("spotify.ytAuthWaitingConfirm")}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="space-y-1">
                                            <p className="text-xs font-semibold text-[var(--text-primary)]">
                                                {t("spotify.ytAuthReadyTitle")}
                                            </p>
                                            <p className="text-xs text-[var(--text-secondary)]">
                                                {t("spotify.ytAuthReadyDesc")}
                                            </p>
                                            {youtubeConfig.authError && (
                                                <p className="text-xs text-rose-400 mt-1">
                                                    {youtubeConfig.authError}
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            disabled={isStartingYtAuth}
                                            onClick={() => void handleStartYouTubeLogin()}
                                            className="btn-accent flex items-center justify-center gap-2 px-4 py-2 ui-control text-xs font-semibold shrink-0 disabled:opacity-50 cursor-pointer"
                                        >
                                            {isStartingYtAuth ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <LogIn className="w-4 h-4" />
                                            )}
                                            <span>{t("spotify.ytAuthSignInBtn")}</span>
                                        </button>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {ytAuthMethodTab === "cookie" && (
                            <motion.div
                                key="yt-auth-cookie"
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                                className="pt-4 border-t border-[var(--border-subtle)] flex flex-col gap-4"
                            >
                                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                    {t("spotify.cookieIsMandatoryAnswer")}
                                </p>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                    <div className="flex flex-col gap-2.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                                                <HelpCircle className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                                <span>{t("spotify.cookieGuideTitle")}</span>
                                            </span>
                                            <div className="flex items-center gap-1 p-0.5 ui-control bg-[var(--bg-island)] border border-[var(--border-subtle)]">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setCookieGuideTab("extension")
                                                    }
                                                    className={`px-2.5 py-1 ui-control text-[11px] font-semibold cursor-pointer ${
                                                        cookieGuideTab === "extension"
                                                            ? "btn-accent"
                                                            : "text-[var(--text-secondary)]"
                                                    }`}
                                                >
                                                    {t("spotify.cookieMethodTxt")}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setCookieGuideTab("devtools")
                                                    }
                                                    className={`px-2.5 py-1 ui-control text-[11px] font-semibold cursor-pointer ${
                                                        cookieGuideTab === "devtools"
                                                            ? "btn-accent"
                                                            : "text-[var(--text-secondary)]"
                                                    }`}
                                                >
                                                    {t("spotify.cookieMethodDevtools")}
                                                </button>
                                            </div>
                                        </div>

                                        {cookieGuideTab === "extension" ? (
                                            <ol className="text-xs text-[var(--text-secondary)] space-y-1.5 list-decimal list-inside leading-relaxed">
                                                <li>{t("spotify.cookieExtStep1")}</li>
                                                <li>{t("spotify.cookieExtStep2")}</li>
                                                <li>{t("spotify.cookieExtStep3")}</li>
                                            </ol>
                                        ) : (
                                            <ol className="text-xs text-[var(--text-secondary)] space-y-1.5 list-decimal list-inside leading-relaxed">
                                                <li>{t("spotify.cookieDevStep1")}</li>
                                                <li>{t("spotify.cookieDevStep2")}</li>
                                                <li>{t("spotify.cookieDevStep3")}</li>
                                            </ol>
                                        )}

                                        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                                            {t("spotify.cookieSecurityTip")}
                                        </p>
                                    </div>

                                    <div className="flex flex-col gap-2.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <label className="text-xs font-semibold text-[var(--text-primary)]">
                                                {t("spotify.cookieInputLabel")}
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setShowCookieText((v) => !v)
                                                }
                                                className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                                            >
                                                {showCookieText ? (
                                                    <>
                                                        <EyeOff className="w-3.5 h-3.5" />
                                                        <span>
                                                            {t("spotify.cookieHideText")}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Eye className="w-3.5 h-3.5" />
                                                        <span>
                                                            {t("spotify.cookieShowText")}
                                                        </span>
                                                    </>
                                                )}
                                            </button>
                                        </div>

                                        <input
                                            ref={cookieFileRef}
                                            type="file"
                                            accept=".txt,text/plain"
                                            className="hidden"
                                            onChange={(e) =>
                                                void handleCookieFileChange(e)
                                            }
                                        />

                                        <textarea
                                            rows={4}
                                            value={cookieInput}
                                            onChange={(e) =>
                                                setCookieInput(e.target.value)
                                            }
                                            autoComplete="off"
                                            spellCheck={false}
                                            placeholder={
                                                youtubeConfig.hasCookie
                                                    ? t(
                                                          "spotify.cookieAlreadySavedPlaceholder",
                                                      )
                                                    : t("spotify.cookieInputPlaceholder")
                                            }
                                            className={`w-full ui-input border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-border)] resize-none ${
                                                !showCookieText &&
                                                cookieInput.length > 0
                                                    ? "blur-[4px] focus:blur-0 transition-[filter]"
                                                    : ""
                                            }`}
                                        />

                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    disabled={isSavingCookie}
                                                    onClick={() =>
                                                        cookieFileRef.current?.click()
                                                    }
                                                    className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] disabled:opacity-50 cursor-pointer"
                                                >
                                                    <Upload className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                                    <span>
                                                        {t("spotify.cookieUploadTxtBtn")}
                                                    </span>
                                                </button>

                                                {youtubeConfig.cookieSource ===
                                                    "runtime" && (
                                                    <button
                                                        type="button"
                                                        disabled={isSavingCookie}
                                                        onClick={() =>
                                                            void handleClearCookie()
                                                        }
                                                        className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-rose-950/60 hover:bg-rose-950/80 border border-rose-700 text-xs font-medium text-rose-300 disabled:opacity-50 cursor-pointer"
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
                                                disabled={
                                                    isSavingCookie || !cookieInput.trim()
                                                }
                                                onClick={() => void handleSaveCookie()}
                                                className="btn-accent flex items-center gap-1.5 px-4 py-1.5 ui-control text-xs font-semibold disabled:opacity-50 cursor-pointer"
                                            >
                                                {isSavingCookie ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Check className="w-3.5 h-3.5" />
                                                )}
                                                <span>{t("spotify.cookieSaveBtn")}</span>
                                            </button>
                                        </div>

                                        {cookieFeedback && (
                                            <p
                                                className={`text-xs ${
                                                    cookieFeedback.type === "success"
                                                        ? "text-[var(--accent-text)]"
                                                        : "text-rose-400"
                                                }`}
                                            >
                                                {cookieFeedback.text}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                        </AnimatePresence>
                    </motion.section>
                )}
            </AnimatePresence>

            {/* Error Banner */}
            <AnimatePresence>
                {(spotifyState.error || listError) && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.985 }}
                        transition={{ type: "spring", stiffness: 420, damping: 30 }}
                        className="p-3.5 ui-card bg-rose-950/40 border border-rose-700/60 text-xs text-rose-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                            <span>{spotifyState.error || listError}</span>
                        </div>
                        {/bot|cookie|YOUTUBE_COOKIE|doğrulama|login|giriş|ses/i.test(
                            spotifyState.error || listError || "",
                        ) && (
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                                <motion.button
                                    type="button"
                                    whileTap={{ scale: 0.94 }}
                                    onClick={() => void handleStartYouTubeLogin()}
                                    className="px-3 py-1.5 ui-control bg-rose-950/70 hover:bg-rose-900/70 border border-rose-600 text-xs font-semibold text-rose-200 cursor-pointer"
                                >
                                    {t("spotify.ytAuthSignInBtn")}
                                </motion.button>
                                <motion.button
                                    type="button"
                                    whileTap={{ scale: 0.94 }}
                                    onClick={() => {
                                        setYtAuthMethodTab("cookie");
                                        setShowCookieBox(true);
                                    }}
                                    className="px-3 py-1.5 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] cursor-pointer"
                                >
                                    {t("spotify.ytAuthOrCookieBtn")}
                                </motion.button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Toast Notice */}
            <AnimatePresence>
                {toastMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.985 }}
                        transition={{ type: "spring", stiffness: 420, damping: 30 }}
                        className="p-3.5 ui-card bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-between gap-3 text-xs text-[var(--text-primary)]"
                    >
                        <div className="flex items-center gap-2">
                            <Check className="w-4 h-4 shrink-0 text-[var(--accent-text)]" />
                            <span>{toastMessage}</span>
                        </div>
                        <motion.button
                            type="button"
                            whileTap={{ scale: 0.94 }}
                            onClick={onGoToSoundboard}
                            className="btn-accent px-3 py-1 ui-control text-xs font-semibold shrink-0 cursor-pointer"
                        >
                            {t("lirMaker.goToBoard")}
                        </motion.button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Centered Animated Search Bar + Contextual Controls */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                    duration: 0.24,
                    delay: 0.08,
                    ease: [0.22, 1, 0.36, 1],
                }}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
                {/* Left context info or back button */}
                <div className="flex items-center gap-2 min-w-0 sm:min-w-[140px]">
                    <AnimatePresence>
                        {sourceTab === "spotify-playlists" && selectedPlaylist && (
                            <motion.button
                                type="button"
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -8 }}
                                whileTap={{ scale: 0.94 }}
                                transition={{ duration: 0.16 }}
                                onClick={() => {
                                    setSelectedPlaylist(null);
                                    setPlaylistTracks([]);
                                    setLibraryFilterQuery("");
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-[var(--bg-island)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] cursor-pointer shrink-0"
                            >
                                <ArrowLeft className="w-3.5 h-3.5" />
                                <span>{t("spotify.backToPlaylists")}</span>
                            </motion.button>
                        )}
                    </AnimatePresence>
                </div>

                {/* Center: Animated Expanding Search Bar (narrow/low idle -> expands on focus) */}
                <form
                    onSubmit={handleActiveSearchSubmit}
                    className="flex-1 flex items-center justify-center min-w-0"
                >
                    <motion.div
                        initial={false}
                        animate={{
                            maxWidth: isSearchFocused ? 520 : 300,
                            height: isSearchFocused ? 44 : 36,
                        }}
                        transition={{
                            type: "spring",
                            stiffness: 420,
                            damping: 32,
                        }}
                        className={`w-full px-3.5 flex items-center gap-2 ui-control border bg-[var(--bg-island)] transition-colors ${
                            isSearchFocused
                                ? "border-[var(--accent-border)]"
                                : "border-[var(--border-subtle)]"
                        }`}
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
                            value={activeSearchValue}
                            onChange={(e) =>
                                handleActiveSearchChange(e.target.value)
                            }
                            onFocus={() => setIsSearchFocused(true)}
                            onBlur={() => setIsSearchFocused(false)}
                            placeholder={activeSearchPlaceholder}
                            className="w-full bg-transparent text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none min-w-0"
                        />
                        <AnimatePresence>
                            {activeSearchValue && (
                                <motion.button
                                    type="button"
                                    initial={{ opacity: 0, scale: 0.6 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.6 }}
                                    transition={{ duration: 0.14 }}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => handleActiveSearchChange("")}
                                    aria-label={t("header.searchClear")}
                                    className="p-1 ui-control text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer shrink-0"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </motion.button>
                            )}
                        </AnimatePresence>
                        {isCatalogSearchTab && (
                            <button
                                type="submit"
                                disabled={
                                    isLoadingList || !activeSearchValue.trim()
                                }
                                onMouseDown={(e) => e.preventDefault()}
                                title={t("spotify.searchBtn")}
                                className={`w-7 h-7 flex items-center justify-center ui-control transition-colors cursor-pointer shrink-0 disabled:opacity-35 ${
                                    activeSearchValue.trim()
                                        ? "btn-accent"
                                        : "bg-[var(--bg-inner)] text-[var(--text-muted)]"
                                }`}
                            >
                                {isLoadingList ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <ArrowRight className="w-3.5 h-3.5" />
                                )}
                            </button>
                        )}
                    </motion.div>
                </form>

                {/* Right: Contextual Library Actions */}
                <div className="flex items-center justify-end gap-2 sm:min-w-[140px]">
                    {sourceTab === "spotify-liked" && (
                        <>
                            {likedTracks.length > 0 && (
                                <motion.button
                                    type="button"
                                    whileTap={{ scale: 0.94 }}
                                    disabled={batchImporting}
                                    onClick={() =>
                                        void handleBatchImportList(likedTracks)
                                    }
                                    className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-[var(--bg-island)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50 cursor-pointer whitespace-nowrap"
                                >
                                    {batchImporting ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Plus className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                    )}
                                    <span className="hidden lg:inline">
                                        {t("spotify.importAllBtn")}
                                    </span>
                                </motion.button>
                            )}
                            <motion.button
                                type="button"
                                whileTap={{ scale: 0.9, rotate: 90 }}
                                disabled={isLoadingList}
                                onClick={() => void loadLikedTracks()}
                                className="p-2 ui-control bg-[var(--bg-island)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
                                title={t("hotkeyFilter.refreshApps")}
                            >
                                <RefreshCw
                                    className={`w-4 h-4 ${
                                        isLoadingList ? "animate-spin" : ""
                                    }`}
                                />
                            </motion.button>
                        </>
                    )}

                    {sourceTab === "spotify-playlists" && (
                        <>
                            {selectedPlaylist && playlistTracks.length > 0 && (
                                <motion.button
                                    type="button"
                                    whileTap={{ scale: 0.94 }}
                                    disabled={batchImporting}
                                    onClick={() =>
                                        void handleBatchImportList(playlistTracks)
                                    }
                                    className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-[var(--bg-island)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50 cursor-pointer whitespace-nowrap"
                                >
                                    {batchImporting ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Plus className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                    )}
                                    <span className="hidden lg:inline">
                                        {t("spotify.importAllBtn")}
                                    </span>
                                </motion.button>
                            )}
                            {!selectedPlaylist && (
                                <motion.button
                                    type="button"
                                    whileTap={{ scale: 0.9, rotate: 90 }}
                                    disabled={isLoadingList}
                                    onClick={() => void loadPlaylists()}
                                    className="p-2 ui-control bg-[var(--bg-island)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
                                >
                                    <RefreshCw
                                        className={`w-4 h-4 ${
                                            isLoadingList ? "animate-spin" : ""
                                        }`}
                                    />
                                </motion.button>
                            )}
                        </>
                    )}
                </div>
            </motion.div>

            {/* Active Tab Content */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={`${sourceTab}:${sourceTab === "spotify-playlists" ? selectedPlaylist?.id || "list" : "main"}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="flex-1 flex flex-col"
                >
                    {sourceTab === "spotify-liked" &&
                        (isLoadingList && likedTracks.length === 0
                            ? renderSkeletonGrid()
                            : renderSpotifyTrackGrid(filteredLikedTracks))}

                    {sourceTab === "spotify-playlists" && (
                        <div className="flex-1 flex flex-col gap-4">
                            {selectedPlaylist && (
                                <div className="flex items-center gap-2 min-w-0">
                                    <h2 className="text-sm font-bold text-[var(--text-primary)] truncate">
                                        {selectedPlaylist.name}
                                    </h2>
                                    <span className="text-xs text-[var(--text-secondary)] tabular-nums shrink-0">
                                        ·{" "}
                                        {t("spotify.playlistTracksCount", {
                                            count: playlistTracks.length,
                                        })}
                                    </span>
                                </div>
                            )}

                            {selectedPlaylist ? (
                                isLoadingList ? (
                                    renderSkeletonGrid()
                                ) : (
                                    renderSpotifyTrackGrid(filteredPlaylistTracks)
                                )
                            ) : isLoadingList && playlists.length === 0 ? (
                                renderSkeletonGrid()
                            ) : filteredPlaylists.length === 0 ? (
                                renderEmptyState(t("spotify.noPlaylists"))
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                                    {filteredPlaylists.map((pl, idx) => (
                                        <motion.button
                                            key={pl.id}
                                            type="button"
                                            initial={{ opacity: 0, scale: 0.96, y: 10 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            whileHover={{ y: -2 }}
                                            whileTap={{ scale: 0.97 }}
                                            transition={{
                                                type: "spring",
                                                stiffness: 380,
                                                damping: 28,
                                                delay: Math.min(idx * 0.025, 0.25),
                                            }}
                                            onClick={() => void handleOpenPlaylist(pl)}
                                            className="app-card ui-card card-ambient-glow p-4 border border-[var(--border-card)] hover:border-[var(--accent-border)] flex items-center gap-3.5 text-left transition-colors cursor-pointer"
                                        >
                                            <TrackThumbnail
                                                src={pl.images?.[0]?.url}
                                                alt={pl.name}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                                                    {pl.name}
                                                </p>
                                                <p className="text-xs text-[var(--text-secondary)] mt-0.5 tabular-nums">
                                                    {t("spotify.playlistTracksCount", {
                                                        count:
                                                            pl.tracks?.total ??
                                                            pl.items?.total ??
                                                            0,
                                                    })}
                                                </p>
                                            </div>
                                        </motion.button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {sourceTab === "spotify-search" &&
                        (isLoadingList
                            ? renderSkeletonGrid()
                            : renderSpotifyTrackGrid(spotifySearchResults))}

                    {sourceTab === "youtube-search" &&
                        (isLoadingList ? (
                            renderSkeletonGrid()
                        ) : youtubeResults.length === 0 ? (
                            renderEmptyState(
                                t("spotify.youtubeEmpty"),
                                t("spotify.youtubeSearchHint"),
                                true,
                            )
                        ) : (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                                {youtubeResults.map((yt, idx) => {
                                    const existing =
                                        findExistingSoundForYouTubeTrack(yt);
                                    const isPlaying = existing
                                        ? activePlayingIds.includes(existing.id)
                                        : false;
                                    const itemKey = `yt:${yt.videoId}`;
                                    const isBusy = Boolean(importingKeys[itemKey]);
                                    const isLoadingPreview =
                                        loadingPreviewKey === itemKey;
                                    const isCurrentPreview =
                                        previewSession?.key === itemKey;
                                    const isPreviewPlayingHere =
                                        isCurrentPreview && isPreviewPlaying;
                                    const isHighlighted =
                                        isPlaying || isPreviewPlayingHere;

                                    return (
                                        <motion.div
                                            key={yt.videoId}
                                            layout
                                            initial={{ opacity: 0, scale: 0.96, y: 10 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.94, y: -6 }}
                                            whileHover={{ y: -2 }}
                                            transition={{
                                                type: "spring",
                                                stiffness: 380,
                                                damping: 28,
                                                delay: Math.min(idx * 0.025, 0.25),
                                            }}
                                            className={`app-card ui-card ${
                                                isHighlighted ? "" : "card-ambient-glow"
                                            } group relative overflow-hidden p-3.5 border flex items-center justify-between gap-3.5 transition-colors ${
                                                isHighlighted
                                                    ? "border-[var(--accent)] ring-1 ring-[var(--accent-border)]"
                                                    : isCurrentPreview
                                                      ? "border-[var(--accent-border)]"
                                                      : "border-[var(--border-card)] hover:border-[var(--border-hover)]"
                                            }`}
                                        >
                                            <AnimatePresence>
                                                {isHighlighted && (
                                                    <motion.div
                                                        aria-hidden="true"
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        transition={{ duration: 0.25 }}
                                                        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
                                                    >
                                                        <motion.div
                                                            animate={{
                                                                opacity: [0.82, 1, 0.86],
                                                            }}
                                                            transition={{
                                                                repeat: Infinity,
                                                                duration: 2.2,
                                                                ease: "easeInOut",
                                                            }}
                                                            className="absolute inset-0 card-spotlight-beam"
                                                        />
                                                        <div className="absolute inset-0 card-spotlight-floor" />
                                                        <div className="absolute top-0 left-0 right-0 h-[1.5px] card-spotlight-rim" />
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

                                            <div className="relative z-10 flex items-center gap-3.5 min-w-0 flex-1">
                                                <TrackThumbnail
                                                    src={yt.thumbnailUrl}
                                                    alt={yt.title}
                                                    wide
                                                    isPlaying={
                                                        existing
                                                            ? isPlaying
                                                            : isPreviewPlayingHere
                                                    }
                                                    isReady
                                                    isLoading={isLoadingPreview}
                                                    coverMode={
                                                        existing ? "mic" : "preview"
                                                    }
                                                    onCoverClick={
                                                        existing
                                                            ? () =>
                                                                  isPlaying
                                                                      ? onStopSound(
                                                                            existing.id,
                                                                        )
                                                                      : playMicSoundCleanly(
                                                                            existing,
                                                                        )
                                                            : () =>
                                                                  void handlePreviewYouTubeTrack(
                                                                      yt,
                                                                  )
                                                    }
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <h3
                                                        className="text-sm font-semibold text-[var(--text-primary)] truncate"
                                                        title={yt.title}
                                                    >
                                                        {yt.title}
                                                    </h3>
                                                    <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5 tabular-nums">
                                                        {yt.channelTitle}
                                                        {yt.durationSec > 0
                                                            ? ` · ${formatDuration(yt.durationSec)}`
                                                            : ""}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="relative z-10 flex items-center gap-1.5 shrink-0">
                                                {existing ? (
                                                    <>
                                                        <motion.button
                                                            type="button"
                                                            whileTap={{ scale: 0.91 }}
                                                            onClick={() =>
                                                                isPlaying
                                                                    ? onStopSound(
                                                                          existing.id,
                                                                      )
                                                                    : playMicSoundCleanly(
                                                                          existing,
                                                                      )
                                                            }
                                                            className={`flex items-center gap-1.5 px-3 py-1.5 ui-control text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                                                                isPlaying
                                                                    ? "bg-rose-950/60 border border-rose-700 text-rose-300 hover:bg-rose-950/80"
                                                                    : "btn-accent"
                                                            }`}
                                                        >
                                                            {isPlaying ? (
                                                                <>
                                                                    <Square className="w-3.5 h-3.5 fill-current" />
                                                                    <span>
                                                                        {t("soundCard.stop")}
                                                                    </span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Play className="w-3.5 h-3.5 fill-current" />
                                                                    <span className="hidden sm:inline">
                                                                        {t(
                                                                            "spotify.playToMicBtn",
                                                                        )}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </motion.button>

                                                        <motion.button
                                                            type="button"
                                                            whileTap={{ scale: 0.9 }}
                                                            onClick={() =>
                                                                onOpenInMaker(existing)
                                                            }
                                                            title={t(
                                                                "soundCard.trimInMaker",
                                                            )}
                                                            className="p-2 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                                        >
                                                            <Scissors className="w-3.5 h-3.5" />
                                                        </motion.button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <motion.button
                                                            type="button"
                                                            whileTap={{ scale: 0.91 }}
                                                            disabled={isBusy}
                                                            onClick={() =>
                                                                void handlePreviewYouTubeTrack(
                                                                    yt,
                                                                )
                                                            }
                                                            title={
                                                                isPreviewPlayingHere
                                                                    ? t(
                                                                          "spotify.previewPauseTitle",
                                                                      )
                                                                    : t(
                                                                          "spotify.previewTitle",
                                                                      )
                                                            }
                                                            className={`flex items-center gap-1.5 px-2.5 py-1.5 ui-control border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 ${
                                                                isCurrentPreview
                                                                    ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                                                    : "bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border-[var(--border-subtle)] hover:border-[var(--accent-border)] text-[var(--text-primary)]"
                                                            }`}
                                                        >
                                                            {isLoadingPreview ? (
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-text)]" />
                                                            ) : isPreviewPlayingHere ? (
                                                                <Pause className="w-3.5 h-3.5 fill-current" />
                                                            ) : (
                                                                <Headphones className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                                            )}
                                                            <span className="hidden md:inline">
                                                                {isLoadingPreview
                                                                    ? t(
                                                                          "spotify.previewLoading",
                                                                      )
                                                                    : isPreviewPlayingHere
                                                                      ? t(
                                                                            "spotify.previewPauseBtn",
                                                                        )
                                                                      : t(
                                                                            "spotify.previewBtn",
                                                                        )}
                                                            </span>
                                                        </motion.button>

                                                        <motion.button
                                                            type="button"
                                                            whileTap={{ scale: 0.91 }}
                                                            disabled={isBusy}
                                                            onClick={() =>
                                                                void importYouTubeTrack(
                                                                    yt,
                                                                    false,
                                                                )
                                                            }
                                                            title={t(
                                                                "spotify.addToSoundpadBtn",
                                                            )}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] hover:border-[var(--accent-border)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                                                        >
                                                            {isBusy ? (
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-text)]" />
                                                            ) : (
                                                                <Plus className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                                            )}
                                                            <span className="hidden sm:inline">
                                                                {isBusy
                                                                    ? t(
                                                                          "spotify.fetchingAudio",
                                                                      )
                                                                    : t(
                                                                          "spotify.addToSoundpadBtn",
                                                                      )}
                                                            </span>
                                                        </motion.button>

                                                        <motion.button
                                                            type="button"
                                                            whileTap={{ scale: 0.91 }}
                                                            disabled={isBusy}
                                                            onClick={() =>
                                                                void importYouTubeTrack(
                                                                    yt,
                                                                    true,
                                                                )
                                                            }
                                                            title={t(
                                                                "spotify.addAndPlayTitle",
                                                            )}
                                                            className="btn-accent flex items-center gap-1.5 px-3 py-1.5 ui-control text-xs font-semibold disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                                                        >
                                                            <Mic className="w-3.5 h-3.5" />
                                                            <span className="hidden md:inline">
                                                                {t(
                                                                    "spotify.addAndPlayBtn",
                                                                )}
                                                            </span>
                                                        </motion.button>
                                                    </>
                                                )}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        ))}
                </motion.div>
            </AnimatePresence>
        </motion.div>
    );
}
