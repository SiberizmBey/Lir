import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
    AlertTriangle,
    Check,
    ChevronDown,
    ChevronUp,
    Cookie,
    Copy,
    Disc3,
    ExternalLink,
    Eye,
    EyeOff,
    Heart,
    HelpCircle,
    ListMusic,
    Loader2,
    LogIn,
    LogOut,
    Mic,
    Music2,
    Play,
    Plus,
    Radio,
    RefreshCw,
    Scissors,
    Search,
    ShieldCheck,
    Sliders,
    Square,
    Trash2,
    Upload,
    X,
    Youtube,
} from "lucide-react";
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

type MusicSourceTab = "spotify-search" | "spotify-liked" | "spotify-playlists" | "youtube-search";

const SPOTIFY_TO_YOUTUBE_CACHE_KEY = "lir_spotify_yt_map_v1";

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
    const [showConfigBox, setShowConfigBox] = useState(!spotifyState.isConnected);
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
    const [ytAuthMethodTab, setYtAuthMethodTab] = useState<"account" | "cookie">("account");
    const [isStartingYtAuth, setIsStartingYtAuth] = useState(false);
    const [copiedYtCode, setCopiedYtCode] = useState(false);
    const [cookieInput, setCookieInput] = useState("");
    const [showCookieText, setShowCookieText] = useState(false);
    const [isSavingCookie, setIsSavingCookie] = useState(false);
    const [cookieFeedback, setCookieFeedback] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);
    const [cookieGuideTab, setCookieGuideTab] = useState<"extension" | "devtools">("extension");
    const cookieFileRef = useRef<HTMLInputElement | null>(null);

    const [sourceTab, setSourceTab] = useState<MusicSourceTab>(
        spotifyState.isConnected ? "spotify-liked" : "youtube-search",
    );

    const [spotifyQuery, setSpotifyQuery] = useState("");
    const [spotifySearchResults, setSpotifySearchResults] = useState<SpotifyTrack[]>([]);
    const [likedTracks, setLikedTracks] = useState<SpotifyTrack[]>([]);
    const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
    const [selectedPlaylist, setSelectedPlaylist] = useState<SpotifyPlaylist | null>(null);
    const [playlistTracks, setPlaylistTracks] = useState<SpotifyTrack[]>([]);

    const [youtubeQuery, setYoutubeQuery] = useState("");
    const [youtubeResults, setYoutubeResults] = useState<YouTubeTrack[]>([]);

    const [isLoadingList, setIsLoadingList] = useState(false);
    const [listError, setListError] = useState<string | null>(null);
    const [importingKeys, setImportingKeys] = useState<Record<string, boolean>>({});
    const [batchImporting, setBatchImporting] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [trackToVideoId, setTrackToVideoId] = useState<Record<string, string>>(
        loadTrackVideoMap,
    );

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

    const loadLikedTracks = useCallback(async () => {
        if (!spotifyState.isConnected) return;
        setIsLoadingList(true);
        setListError(null);
        try {
            const tracks = await spotifyService.getSavedTracks();
            setLikedTracks(tracks);
        } catch (err) {
            setListError(err instanceof Error ? err.message : t("spotify.errorGeneric"));
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
            setListError(err instanceof Error ? err.message : t("spotify.errorGeneric"));
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
        setIsLoadingList(true);
        setListError(null);
        try {
            const items = await spotifyService.getPlaylistTracks(playlist.id);
            setPlaylistTracks(items);
        } catch (err) {
            setListError(err instanceof Error ? err.message : t("spotify.errorGeneric"));
        } finally {
            setIsLoadingList(false);
        }
    };

    const handleSpotifySearch = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!spotifyQuery.trim()) return;
        setIsLoadingList(true);
        setListError(null);
        try {
            const items = await spotifyService.searchTracks(spotifyQuery);
            setSpotifySearchResults(items);
        } catch (err) {
            setListError(err instanceof Error ? err.message : t("spotify.errorGeneric"));
        } finally {
            setIsLoadingList(false);
        }
    };

    const handleYouTubeSearch = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!youtubeQuery.trim()) return;
        setIsLoadingList(true);
        setListError(null);
        try {
            const items = await searchYouTubeTracks(youtubeQuery, 12);
            setYoutubeResults(items);
        } catch (err) {
            setListError(err instanceof Error ? err.message : t("spotify.errorGeneric"));
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
            setListError(err instanceof Error ? err.message : t("spotify.errorGeneric"));
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
            setListError(err instanceof Error ? err.message : t("spotify.errorGeneric"));
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
        setYtAuthMethodTab("account");
        setIsStartingYtAuth(true);
        try {
            const next = await startYouTubeLogin();
            setYoutubeConfig(next);
        } catch (err) {
            setYoutubeConfig((prev) => ({
                ...prev,
                authStatus: "error",
                authError: err instanceof Error ? err.message : t("spotify.errorGeneric"),
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
            setListError(err instanceof Error ? err.message : t("spotify.errorGeneric"));
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
                text: err instanceof Error ? err.message : t("spotify.errorGeneric"),
            });
        } finally {
            setIsSavingCookie(false);
        }
    };

    const handleCookieFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
                text: err instanceof Error ? err.message : t("spotify.errorGeneric"),
            });
        } finally {
            setIsSavingCookie(false);
        }
    };

    // Map audioUrl -> SoundItem for instant lookup
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
                const byUrl = soundByAudioUrl.get(`/api/youtube/audio/${mappedVideoId}`);
                if (byUrl) return byUrl;
            }
            const artists = track.artists?.map((a) => a.name).join(", ") || "";
            const expectedTitle = artists ? `${artists} - ${track.name}` : track.name;
            return sounds.find((s) => s.title.toLowerCase() === expectedTitle.toLowerCase());
        },
        [sounds, soundByAudioUrl, trackToVideoId],
    );

    const findExistingSoundForYouTubeTrack = useCallback(
        (yt: YouTubeTrack): SoundItem | undefined => {
            return soundByAudioUrl.get(`/api/youtube/audio/${yt.videoId}`);
        },
        [soundByAudioUrl],
    );

    const importSpotifyTrack = useCallback(
        async (track: SpotifyTrack, playImmediately = false) => {
            const existing = findExistingSoundForSpotifyTrack(track);
            if (existing) {
                if (playImmediately) onPlaySound(existing);
                return existing;
            }

            const artists = track.artists?.map((a) => a.name).join(", ") || "";
            const displayTitle = artists ? `${artists} - ${track.name}` : track.name;
            const durationSec = track.duration_ms ? track.duration_ms / 1000 : undefined;
            const itemKey = `sp:${track.id}`;

            setImportingKeys((prev) => ({ ...prev, [itemKey]: true }));
            setListError(null);

            try {
                const matched = await matchAndFetchYouTubeAudio({
                    trackName: track.name,
                    artistName: artists,
                    durationSec,
                });

                const decoded = await audioEngine.decodeDataUrlToBuffer(matched.audioUrl);
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
                    onPlaySound(createdSound);
                }
                return createdSound;
            } catch (err) {
                setListError(err instanceof Error ? err.message : t("spotify.errorGeneric"));
                return null;
            } finally {
                setImportingKeys((prev) => {
                    const next = { ...prev };
                    delete next[itemKey];
                    return next;
                });
            }
        },
        [findExistingSoundForSpotifyTrack, onAddSound, onPlaySound, t],
    );

    const importYouTubeTrack = useCallback(
        async (yt: YouTubeTrack, playImmediately = false) => {
            const existing = findExistingSoundForYouTubeTrack(yt);
            if (existing) {
                if (playImmediately) onPlaySound(existing);
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

                const decoded = await audioEngine.decodeDataUrlToBuffer(matched.audioUrl);
                const resolvedDuration = decoded?.duration || yt.durationSec || 30;

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
                setToastMessage(t("spotify.addedToBoardToast", { title: yt.title }));

                if (playImmediately) {
                    onPlaySound(createdSound);
                }
                return createdSound;
            } catch (err) {
                setListError(err instanceof Error ? err.message : t("spotify.errorGeneric"));
                return null;
            } finally {
                setImportingKeys((prev) => {
                    const next = { ...prev };
                    delete next[itemKey];
                    return next;
                });
            }
        },
        [findExistingSoundForYouTubeTrack, onAddSound, onPlaySound, t],
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

    const renderSpotifyTrackList = (tracks: SpotifyTrack[]) => {
        if (tracks.length === 0 && !isLoadingList) {
            return (
                <div className="p-8 text-center text-xs text-[var(--text-secondary)]">
                    {t("spotify.noTracks")}
                </div>
            );
        }

        return (
            <div className="divide-y divide-[var(--border-subtle)]">
                {tracks.map((track) => {
                    const artists = track.artists?.map((a) => a.name).join(", ") || "";
                    const thumb =
                        track.album?.images?.[2]?.url ||
                        track.album?.images?.[1]?.url ||
                        track.album?.images?.[0]?.url;
                    const existing = findExistingSoundForSpotifyTrack(track);
                    const isPlaying = existing ? activePlayingIds.includes(existing.id) : false;
                    const isBusy = Boolean(importingKeys[`sp:${track.id}`]);

                    return (
                        <div
                            key={track.id}
                            className="p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--bg-card-hover)] transition-colors"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                {thumb ? (
                                    <img
                                        src={thumb}
                                        alt={track.name}
                                        className="w-11 h-11 ui-control object-cover shrink-0 border border-[var(--border-subtle)]"
                                    />
                                ) : (
                                    <div className="w-11 h-11 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0 text-[var(--text-muted)]">
                                        <Music2 className="w-5 h-5" />
                                    </div>
                                )}

                                <div className="min-w-0">
                                    <p className="text-xs sm:text-[13px] font-semibold text-[var(--text-primary)] truncate">
                                        {track.name}
                                    </p>
                                    <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                                        {artists}
                                        {track.duration_ms
                                            ? ` · ${formatDuration(track.duration_ms / 1000)}`
                                            : ""}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                {existing ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                isPlaying
                                                    ? onStopSound(existing.id)
                                                    : onPlaySound(existing)
                                            }
                                            className={`flex items-center gap-1.5 px-3 py-1.5 ui-control text-xs font-semibold transition-colors cursor-pointer ${
                                                isPlaying
                                                    ? "bg-rose-500/20 border border-rose-500/40 text-rose-400"
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
                                                    <span>{t("spotify.playToMicBtn")}</span>
                                                </>
                                            )}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => onOpenInMaker(existing)}
                                            title={t("soundCard.trimInMaker")}
                                            className="p-2 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                        >
                                            <Scissors className="w-3.5 h-3.5" />
                                        </button>

                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 ui-control bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-medium text-emerald-400">
                                            <Check className="w-3 h-3" />
                                            <span>{t("spotify.onBoardBadge")}</span>
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() => void importSpotifyTrack(track, false)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-border)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50 transition-colors cursor-pointer"
                                        >
                                            {isBusy ? (
                                                <>
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-text)]" />
                                                    <span>{t("spotify.fetchingAudio")}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Plus className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                                    <span>{t("spotify.addToSoundpadBtn")}</span>
                                                </>
                                            )}
                                        </button>

                                        <button
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() => void handleSearchOnYouTubeForTrack(track)}
                                            title={t("spotify.altVersionsTitle")}
                                            className="p-2 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-rose-400 disabled:opacity-50 transition-colors cursor-pointer"
                                        >
                                            <Youtube className="w-3.5 h-3.5" />
                                        </button>

                                        <button
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() => void importSpotifyTrack(track, true)}
                                            title={t("spotify.addAndPlayTitle")}
                                            className="btn-accent flex items-center gap-1.5 px-3 py-1.5 ui-control text-xs font-semibold disabled:opacity-50 cursor-pointer"
                                        >
                                            <Mic className="w-3.5 h-3.5" />
                                            <span className="hidden md:inline">
                                                {t("spotify.addAndPlayBtn")}
                                            </span>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const redirectUri = spotifyService.getRedirectUri();

    return (
        <div className="flex-1 flex flex-col gap-5 max-w-6xl w-full mx-auto">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 ui-inner bg-[#1db954]/15 border border-[#1db954]/35 text-[#1db954] flex items-center justify-center shrink-0">
                        <Disc3 className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                                {t("spotify.title")}
                            </h1>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 ui-control bg-rose-500/15 border border-rose-500/30 text-[11px] font-medium text-rose-400">
                                <Youtube className="w-3 h-3" />
                                <span>
                                    {youtubeConfig.hasApiKey
                                        ? t("spotify.youtubeApiBadge")
                                        : t("spotify.youtubeReadyBadge")}
                                </span>
                            </span>
                            <button
                                type="button"
                                onClick={() => setShowCookieBox((v) => !v)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 ui-control border text-[11px] font-medium transition-colors cursor-pointer ${
                                    youtubeConfig.hasOAuth || youtubeConfig.hasCookie
                                        ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-400 hover:bg-emerald-500/20"
                                        : "bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                                }`}
                            >
                                {youtubeConfig.authStatus === "pending" ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                ) : youtubeConfig.hasOAuth || youtubeConfig.hasCookie ? (
                                    <ShieldCheck className="w-3 h-3" />
                                ) : (
                                    <LogIn className="w-3 h-3" />
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
                                {showCookieBox ? (
                                    <ChevronUp className="w-3 h-3 opacity-75" />
                                ) : (
                                    <ChevronDown className="w-3 h-3 opacity-75" />
                                )}
                            </button>
                        </div>
                        <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] mt-0.5">
                            {t("spotify.subtitle")}
                        </p>
                    </div>
                </div>

                {/* Routing to Mic Status Button */}
                <button
                    type="button"
                    onClick={onOpenRouting}
                    className={`self-start sm:self-auto flex items-center gap-2 px-3 py-2 ui-control border text-xs font-medium transition-colors cursor-pointer ${
                        isVirtualCableOutput
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                            : "bg-[var(--bg-card)] border-[var(--border-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                >
                    <Radio className="w-3.5 h-3.5 shrink-0" />
                    <span>
                        {isVirtualCableOutput
                            ? t("spotify.micRouteReady")
                            : t("spotify.micRouteCheck")}
                    </span>
                    <Sliders className="w-3 h-3 opacity-70" />
                </button>
            </div>

            {/* Spotify Account & OAuth Connection Card */}
            <motion.section
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="app-card ui-card p-4 sm:p-5 border border-[var(--border-card)] flex flex-col gap-4"
            >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {spotifyState.isConnected ? (
                        <div className="flex items-center gap-3">
                            {spotifyState.user?.images?.[0]?.url ? (
                                <img
                                    src={spotifyState.user.images[0].url}
                                    alt={spotifyState.user.display_name || "Spotify"}
                                    className="w-10 h-10 rounded-full object-cover border border-[#1db954]/50"
                                />
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-[#1db954]/20 border border-[#1db954]/40 flex items-center justify-center text-[#1db954]">
                                    <Disc3 className="w-5 h-5" />
                                </div>
                            )}
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-[var(--text-primary)]">
                                        {spotifyState.user?.display_name || t("spotify.connectedUser")}
                                    </span>
                                    <span className="px-2 py-0.5 ui-control bg-[#1db954]/15 border border-[#1db954]/30 text-[10px] font-semibold text-[#1db954]">
                                        {t("spotify.connectedBadge")}
                                    </span>
                                </div>
                                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                                    {t("spotify.connectedHint")}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <h2 className="text-sm font-bold text-[var(--text-primary)]">
                                {t("spotify.connectTitle")}
                            </h2>
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                {t("spotify.connectDesc")}
                            </p>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setShowConfigBox((v) => !v)}
                            className="px-3 py-1.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                            {showConfigBox
                                ? t("spotify.hideOAuthSettings")
                                : t("spotify.showOAuthSettings")}
                        </button>

                        {spotifyState.isConnected ? (
                            <button
                                type="button"
                                onClick={() => spotifyService.logout()}
                                className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-semibold text-rose-400 cursor-pointer"
                            >
                                <LogOut className="w-3.5 h-3.5" />
                                <span>{t("spotify.disconnectBtn")}</span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => void handleConnectSpotify()}
                                className="flex items-center gap-2 px-4 py-2 ui-control bg-[#1db954] hover:bg-[#1ed760] text-black font-bold text-xs transition-colors cursor-pointer"
                            >
                                <Disc3 className="w-4 h-4" />
                                <span>{t("spotify.connectBtn")}</span>
                            </button>
                        )}
                    </div>
                </div>

                {showConfigBox && (
                    <div className="pt-3 border-t border-[var(--border-subtle)] grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <div className="p-3.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-xs font-semibold text-[var(--text-primary)]">
                                    {t("spotify.clientIdLabel")}
                                </label>
                                {spotifyState.hasEnvClientId && (
                                    <span className="text-[10px] font-mono text-emerald-400">
                                        {t("spotify.envConfigured")}
                                    </span>
                                )}
                            </div>
                            <input
                                type="text"
                                value={clientIdDraft}
                                onChange={(e) => {
                                    setClientIdDraft(e.target.value);
                                    spotifyService.updateState({ clientId: e.target.value.trim() });
                                }}
                                placeholder={t("spotify.clientIdPlaceholder")}
                                className="w-full ui-input border border-[var(--border-input)] bg-[var(--bg-card)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-border)]"
                            />
                            <p className="text-[11px] text-[var(--text-muted)]">
                                {t("spotify.clientIdHelp")}
                            </p>
                        </div>

                        <div className="p-3.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-xs font-semibold text-[var(--text-primary)]">
                                    {t("spotify.redirectUriLabel")}
                                </label>
                                {redirectUri !== DEFAULT_SPOTIFY_REDIRECT_URI && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            spotifyService.updateState({
                                                redirectUri: DEFAULT_SPOTIFY_REDIRECT_URI,
                                            })
                                        }
                                        className="text-[10px] font-medium text-[var(--accent-text)] hover:underline cursor-pointer"
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
                                    className="flex-1 ui-input border border-[var(--border-input)] bg-[var(--bg-card)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-border)]"
                                />
                                <button
                                    type="button"
                                    onClick={() => void handleCopyRedirectUri()}
                                    className="flex items-center gap-1.5 px-3 py-2 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] shrink-0 cursor-pointer"
                                >
                                    {copiedRedirect ? (
                                        <>
                                            <Check className="w-3.5 h-3.5 text-emerald-400" />
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
                )}

                {(spotifyState.error || listError) && (
                    <div className="p-3 ui-inner bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                            <span>{spotifyState.error || listError}</span>
                        </div>
                        {/bot|cookie|YOUTUBE_COOKIE|doğrulama|login|giriş|ses/i.test(
                            spotifyState.error || listError || "",
                        ) && (
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => void handleStartYouTubeLogin()}
                                    className="px-3 py-1.5 ui-control bg-rose-500/25 hover:bg-rose-500/35 border border-rose-400/50 text-xs font-semibold text-white cursor-pointer"
                                >
                                    {t("spotify.ytAuthSignInBtn")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setYtAuthMethodTab("cookie");
                                        setShowCookieBox(true);
                                    }}
                                    className="px-3 py-1.5 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] cursor-pointer"
                                >
                                    {t("spotify.ytAuthOrCookieBtn")}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </motion.section>

            {/* Collapsible YouTube Account Login & Cookie Panel */}
            {showCookieBox && (
                <motion.section
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="app-card ui-card p-4 sm:p-5 border border-[var(--border-card)] flex flex-col gap-4"
                >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 ui-inner bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                                <Youtube className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-sm font-bold text-[var(--text-primary)]">
                                        {t("spotify.ytAuthPanelTitle")}
                                    </h2>
                                    {youtubeConfig.hasOAuth && (
                                        <span className="px-2 py-0.5 ui-control border bg-emerald-500/15 border-emerald-500/35 text-[10px] font-semibold text-emerald-400">
                                            {t("spotify.ytAuthConnectedBadge")}
                                        </span>
                                    )}
                                    {youtubeConfig.hasCookie && (
                                        <span className="px-2 py-0.5 ui-control border bg-emerald-500/15 border-emerald-500/35 text-[10px] font-semibold text-emerald-400">
                                            {youtubeConfig.cookieSource === "env"
                                                ? t("spotify.cookieSourceEnv")
                                                : t("spotify.cookieSourceRuntime")}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                                    {t("spotify.ytAuthPanelDesc")}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => setYtAuthMethodTab("account")}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 ui-control border text-xs font-semibold cursor-pointer ${
                                    ytAuthMethodTab === "account"
                                        ? "btn-accent border-transparent"
                                        : "bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-secondary)]"
                                }`}
                            >
                                <LogIn className="w-3.5 h-3.5" />
                                <span>{t("spotify.ytAuthTabAccount")}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setYtAuthMethodTab("cookie")}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 ui-control border text-xs font-semibold cursor-pointer ${
                                    ytAuthMethodTab === "cookie"
                                        ? "btn-accent border-transparent"
                                        : "bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-secondary)]"
                                }`}
                            >
                                <Cookie className="w-3.5 h-3.5" />
                                <span>{t("spotify.ytAuthTabCookie")}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowCookieBox(false)}
                                className="p-1.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] cursor-pointer"
                                title={t("spotify.hideOAuthSettings")}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Tab A: YouTube Account Sign-In (TV/Device OAuth2) */}
                    {ytAuthMethodTab === "account" && (
                        <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-3">
                            {youtubeConfig.hasOAuth ? (
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="flex items-start gap-2.5">
                                        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-xs font-bold text-emerald-300">
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
                                        className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-semibold text-rose-400 shrink-0 cursor-pointer"
                                    >
                                        <LogOut className="w-3.5 h-3.5" />
                                        <span>{t("spotify.disconnectBtn")}</span>
                                    </button>
                                </div>
                            ) : youtubeConfig.authStatus === "pending" && youtubeConfig.pendingAuth ? (
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
                                            onClick={() => void handleCancelYouTubeLogin()}
                                            className="self-start px-3 py-1.5 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] cursor-pointer"
                                        >
                                            {t("common.cancel")}
                                        </button>
                                    </div>

                                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 ui-card bg-[var(--bg-card)] border border-[var(--border-card)]">
                                        <div className="flex items-center gap-2.5 flex-1">
                                            <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
                                                {t("spotify.ytAuthCodeLabel")}
                                            </span>
                                            <code className="px-3 py-1.5 ui-control bg-[var(--bg-inner)] border border-[var(--accent-border)] text-base font-mono font-bold tracking-widest text-[var(--accent-text)]">
                                                {youtubeConfig.pendingAuth.userCode}
                                            </code>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    void handleCopyYouTubeCode(
                                                        youtubeConfig.pendingAuth!.userCode,
                                                    )
                                                }
                                                className="flex items-center gap-1 px-2.5 py-1.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                                            >
                                                {copiedYtCode ? (
                                                    <>
                                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
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

                                        <a
                                            href={youtubeConfig.pendingAuth.verificationUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={() =>
                                                void handleCopyYouTubeCode(
                                                    youtubeConfig.pendingAuth!.userCode,
                                                )
                                            }
                                            className="btn-accent inline-flex items-center justify-center gap-2 px-4 py-2 ui-control text-xs font-bold"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            <span>{t("spotify.ytAuthOpenGoogleBtn")}</span>
                                        </a>
                                    </div>

                                    <div className="flex items-center gap-2 text-[11px] text-amber-300">
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
                                        className="btn-accent flex items-center justify-center gap-2 px-4 py-2 ui-control text-xs font-bold shrink-0 disabled:opacity-50 cursor-pointer"
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
                        </div>
                    )}

                    {/* Tab B: Cookie Guide + Upload / Paste */}
                    {ytAuthMethodTab === "cookie" && (
                        <>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                            {t("spotify.cookieIsMandatoryAnswer")}
                        </p>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            <div className="p-3.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                                        <HelpCircle className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                        <span>{t("spotify.cookieGuideTitle")}</span>
                                    </span>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setCookieGuideTab("extension")}
                                        className={`px-2 py-1 ui-control text-[11px] font-semibold border cursor-pointer ${
                                            cookieGuideTab === "extension"
                                                ? "btn-accent border-transparent"
                                                : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)]"
                                        }`}
                                    >
                                        {t("spotify.cookieMethodTxt")}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCookieGuideTab("devtools")}
                                        className={`px-2 py-1 ui-control text-[11px] font-semibold border cursor-pointer ${
                                            cookieGuideTab === "devtools"
                                                ? "btn-accent border-transparent"
                                                : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)]"
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

                            <p className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 px-2.5 py-2 ui-control">
                                {t("spotify.cookieSecurityTip")}
                            </p>
                        </div>

                        {/* Paste / Upload Control */}
                        <div className="p-3.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-xs font-semibold text-[var(--text-primary)]">
                                    {t("spotify.cookieInputLabel")}
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setShowCookieText((v) => !v)}
                                    className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                                >
                                    {showCookieText ? (
                                        <>
                                            <EyeOff className="w-3.5 h-3.5" />
                                            <span>{t("spotify.cookieHideText")}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Eye className="w-3.5 h-3.5" />
                                            <span>{t("spotify.cookieShowText")}</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            <input
                                ref={cookieFileRef}
                                type="file"
                                accept=".txt,text/plain"
                                className="hidden"
                                onChange={(e) => void handleCookieFileChange(e)}
                            />

                            <textarea
                                rows={4}
                                value={cookieInput}
                                onChange={(e) => setCookieInput(e.target.value)}
                                autoComplete="off"
                                spellCheck={false}
                                placeholder={
                                    youtubeConfig.hasCookie
                                        ? t("spotify.cookieAlreadySavedPlaceholder")
                                        : t("spotify.cookieInputPlaceholder")
                                }
                                className={`w-full ui-input border border-[var(--border-input)] bg-[var(--bg-card)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-border)] resize-none ${
                                    !showCookieText && cookieInput.length > 0
                                        ? "blur-[4px] focus:blur-0 transition-[filter]"
                                        : ""
                                }`}
                            />

                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={isSavingCookie}
                                        onClick={() => cookieFileRef.current?.click()}
                                        className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] disabled:opacity-50 cursor-pointer"
                                    >
                                        <Upload className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                        <span>{t("spotify.cookieUploadTxtBtn")}</span>
                                    </button>

                                    {youtubeConfig.cookieSource === "runtime" && (
                                        <button
                                            type="button"
                                            disabled={isSavingCookie}
                                            onClick={() => void handleClearCookie()}
                                            className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-medium text-rose-400 disabled:opacity-50 cursor-pointer"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            <span>{t("spotify.cookieClearBtn")}</span>
                                        </button>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    disabled={isSavingCookie || !cookieInput.trim()}
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
                                <div
                                    className={`px-2.5 py-2 ui-control text-[11px] border ${
                                        cookieFeedback.type === "success"
                                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                            : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                                    }`}
                                >
                                    {cookieFeedback.text}
                                </div>
                            )}
                        </div>
                        </div>
                        </>
                    )}
                </motion.section>
            )}

            {/* Toast notice with quick Soundboard jump */}
            {toastMessage && (
                <div className="p-3 ui-card bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-between gap-3 text-xs text-emerald-300">
                    <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 shrink-0" />
                        <span>{toastMessage}</span>
                    </div>
                    <button
                        type="button"
                        onClick={onGoToSoundboard}
                        className="px-3 py-1 ui-control bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs font-semibold text-emerald-200 shrink-0 cursor-pointer"
                    >
                        {t("lirMaker.goToBoard")}
                    </button>
                </div>
            )}

            {/* Source Selector Tabs */}
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    disabled={!spotifyState.isConnected}
                    onClick={() => setSourceTab("spotify-liked")}
                    className={`flex items-center gap-2 px-3.5 py-2 ui-control border text-xs font-semibold transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                        sourceTab === "spotify-liked"
                            ? "btn-accent border-transparent"
                            : "bg-[var(--bg-card)] border-[var(--border-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                >
                    <Heart className="w-3.5 h-3.5" />
                    <span>{t("spotify.tabLiked")}</span>
                </button>

                <button
                    type="button"
                    disabled={!spotifyState.isConnected}
                    onClick={() => setSourceTab("spotify-playlists")}
                    className={`flex items-center gap-2 px-3.5 py-2 ui-control border text-xs font-semibold transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                        sourceTab === "spotify-playlists"
                            ? "btn-accent border-transparent"
                            : "bg-[var(--bg-card)] border-[var(--border-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                >
                    <ListMusic className="w-3.5 h-3.5" />
                    <span>{t("spotify.tabPlaylists")}</span>
                </button>

                <button
                    type="button"
                    disabled={!spotifyState.isConnected}
                    onClick={() => setSourceTab("spotify-search")}
                    className={`flex items-center gap-2 px-3.5 py-2 ui-control border text-xs font-semibold transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                        sourceTab === "spotify-search"
                            ? "btn-accent border-transparent"
                            : "bg-[var(--bg-card)] border-[var(--border-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                >
                    <Search className="w-3.5 h-3.5" />
                    <span>{t("spotify.tabSpotifySearch")}</span>
                </button>

                <button
                    type="button"
                    onClick={() => setSourceTab("youtube-search")}
                    className={`flex items-center gap-2 px-3.5 py-2 ui-control border text-xs font-semibold transition-colors cursor-pointer ${
                        sourceTab === "youtube-search"
                            ? "btn-accent border-transparent"
                            : "bg-[var(--bg-card)] border-[var(--border-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                >
                    <Youtube className="w-3.5 h-3.5" />
                    <span>{t("spotify.tabYouTubeSearch")}</span>
                </button>
            </div>

            {/* Tab Content */}
            <div className="app-card ui-card border border-[var(--border-card)] overflow-hidden flex flex-col">
                {/* 1. Spotify Liked Tracks */}
                {sourceTab === "spotify-liked" && (
                    <>
                        <div className="p-4 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                                    {t("spotify.likedHeader")}
                                </h3>
                                <p className="text-xs text-[var(--text-secondary)]">
                                    {t("spotify.likedSub")}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {likedTracks.length > 0 && (
                                    <button
                                        type="button"
                                        disabled={batchImporting}
                                        onClick={() => void handleBatchImportList(likedTracks)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50 cursor-pointer"
                                    >
                                        {batchImporting ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <Plus className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                        )}
                                        <span>{t("spotify.importAllBtn")}</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    disabled={isLoadingList}
                                    onClick={() => void loadLikedTracks()}
                                    className="p-2 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                                    title={t("hotkeyFilter.refreshApps")}
                                >
                                    <RefreshCw
                                        className={`w-4 h-4 ${isLoadingList ? "animate-spin" : ""}`}
                                    />
                                </button>
                            </div>
                        </div>
                        {isLoadingList && likedTracks.length === 0 ? (
                            <div className="p-10 flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>{t("common.loading")}</span>
                            </div>
                        ) : (
                            renderSpotifyTrackList(likedTracks)
                        )}
                    </>
                )}

                {/* 2. Spotify Playlists */}
                {sourceTab === "spotify-playlists" && (
                    <div className="flex flex-col">
                        <div className="p-4 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                {selectedPlaylist && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedPlaylist(null);
                                            setPlaylistTracks([]);
                                        }}
                                        className="px-2.5 py-1 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] hover:border-[var(--accent-border)] cursor-pointer"
                                    >
                                        ← {t("spotify.backToPlaylists")}
                                    </button>
                                )}
                                <div>
                                    <h3 className="text-sm font-bold text-[var(--text-primary)]">
                                        {selectedPlaylist
                                            ? selectedPlaylist.name
                                            : t("spotify.playlistsHeader")}
                                    </h3>
                                    <p className="text-xs text-[var(--text-secondary)]">
                                        {selectedPlaylist
                                            ? t("spotify.playlistTracksCount", {
                                                  count: playlistTracks.length,
                                              })
                                            : t("spotify.playlistsSub")}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {selectedPlaylist && playlistTracks.length > 0 && (
                                    <button
                                        type="button"
                                        disabled={batchImporting}
                                        onClick={() => void handleBatchImportList(playlistTracks)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50 cursor-pointer"
                                    >
                                        {batchImporting ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <Plus className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                        )}
                                        <span>{t("spotify.importAllBtn")}</span>
                                    </button>
                                )}
                                {!selectedPlaylist && (
                                    <button
                                        type="button"
                                        disabled={isLoadingList}
                                        onClick={() => void loadPlaylists()}
                                        className="p-2 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] cursor-pointer"
                                    >
                                        <RefreshCw
                                            className={`w-4 h-4 ${isLoadingList ? "animate-spin" : ""}`}
                                        />
                                    </button>
                                )}
                            </div>
                        </div>

                        {selectedPlaylist ? (
                            isLoadingList ? (
                                <div className="p-10 flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>{t("common.loading")}</span>
                                </div>
                            ) : (
                                renderSpotifyTrackList(playlistTracks)
                            )
                        ) : isLoadingList && playlists.length === 0 ? (
                            <div className="p-10 flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>{t("common.loading")}</span>
                            </div>
                        ) : playlists.length === 0 ? (
                            <div className="p-8 text-center text-xs text-[var(--text-secondary)]">
                                {t("spotify.noPlaylists")}
                            </div>
                        ) : (
                            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {playlists.map((pl) => (
                                    <button
                                        key={pl.id}
                                        type="button"
                                        onClick={() => void handleOpenPlaylist(pl)}
                                        className="p-3 ui-inner bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] hover:border-[var(--accent-border)] flex items-center gap-3 text-left transition-colors cursor-pointer"
                                    >
                                        {pl.images?.[0]?.url ? (
                                            <img
                                                src={pl.images[0].url}
                                                alt={pl.name}
                                                className="w-12 h-12 ui-control object-cover shrink-0"
                                            />
                                        ) : (
                                            <div className="w-12 h-12 ui-control bg-[var(--bg-card)] flex items-center justify-center shrink-0 text-[var(--text-muted)]">
                                                <ListMusic className="w-5 h-5" />
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                                                {pl.name}
                                            </p>
                                            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                                                {t("spotify.playlistTracksCount", {
                                                    count: pl.tracks?.total ?? pl.items?.total ?? 0,
                                                })}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* 3. Spotify Catalog Search */}
                {sourceTab === "spotify-search" && (
                    <div className="flex flex-col">
                        <form
                            onSubmit={(e) => void handleSpotifySearch(e)}
                            className="p-4 border-b border-[var(--border-subtle)] flex items-center gap-2"
                        >
                            <div className="relative flex-1">
                                <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={spotifyQuery}
                                    onChange={(e) => setSpotifyQuery(e.target.value)}
                                    placeholder={t("spotify.spotifySearchPlaceholder")}
                                    className="w-full pl-9 pr-3 py-2 ui-input border border-[var(--border-input)] bg-[var(--bg-input)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-border)]"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isLoadingList || !spotifyQuery.trim()}
                                className="btn-accent px-4 py-2 ui-control text-xs font-semibold disabled:opacity-50 cursor-pointer"
                            >
                                {isLoadingList ? t("common.loading") : t("spotify.searchBtn")}
                            </button>
                        </form>
                        {isLoadingList ? (
                            <div className="p-10 flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>{t("common.loading")}</span>
                            </div>
                        ) : (
                            renderSpotifyTrackList(spotifySearchResults)
                        )}
                    </div>
                )}

                {/* 4. Direct YouTube Music Search */}
                {sourceTab === "youtube-search" && (
                    <div className="flex flex-col">
                        <form
                            onSubmit={(e) => void handleYouTubeSearch(e)}
                            className="p-4 border-b border-[var(--border-subtle)] flex flex-col gap-2"
                        >
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        value={youtubeQuery}
                                        onChange={(e) => setYoutubeQuery(e.target.value)}
                                        placeholder={t("spotify.youtubeSearchPlaceholder")}
                                        className="w-full pl-9 pr-3 py-2 ui-input border border-[var(--border-input)] bg-[var(--bg-input)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-border)]"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={isLoadingList || !youtubeQuery.trim()}
                                    className="btn-accent px-4 py-2 ui-control text-xs font-semibold disabled:opacity-50 cursor-pointer"
                                >
                                    {isLoadingList ? t("common.loading") : t("spotify.searchBtn")}
                                </button>
                            </div>
                            <p className="text-[11px] text-[var(--text-muted)]">
                                {t("spotify.youtubeSearchHint")}
                            </p>
                        </form>

                        {isLoadingList ? (
                            <div className="p-10 flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>{t("common.loading")}</span>
                            </div>
                        ) : youtubeResults.length === 0 ? (
                            <div className="p-8 text-center text-xs text-[var(--text-secondary)]">
                                {t("spotify.youtubeEmpty")}
                            </div>
                        ) : (
                            <div className="divide-y divide-[var(--border-subtle)]">
                                {youtubeResults.map((yt) => {
                                    const existing = findExistingSoundForYouTubeTrack(yt);
                                    const isPlaying = existing
                                        ? activePlayingIds.includes(existing.id)
                                        : false;
                                    const isBusy = Boolean(importingKeys[`yt:${yt.videoId}`]);

                                    return (
                                        <div
                                            key={yt.videoId}
                                            className="p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--bg-card-hover)] transition-colors"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <img
                                                    src={yt.thumbnailUrl}
                                                    alt={yt.title}
                                                    className="w-14 h-10 ui-control object-cover shrink-0 border border-[var(--border-subtle)]"
                                                />
                                                <div className="min-w-0">
                                                    <p className="text-xs sm:text-[13px] font-semibold text-[var(--text-primary)] truncate">
                                                        {yt.title}
                                                    </p>
                                                    <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                                                        {yt.channelTitle}
                                                        {yt.durationSec > 0
                                                            ? ` · ${formatDuration(yt.durationSec)}`
                                                            : ""}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                                {existing ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                isPlaying
                                                                    ? onStopSound(existing.id)
                                                                    : onPlaySound(existing)
                                                            }
                                                            className={`flex items-center gap-1.5 px-3 py-1.5 ui-control text-xs font-semibold transition-colors cursor-pointer ${
                                                                isPlaying
                                                                    ? "bg-rose-500/20 border border-rose-500/40 text-rose-400"
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
                                                                    <span>{t("spotify.playToMicBtn")}</span>
                                                                </>
                                                            )}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => onOpenInMaker(existing)}
                                                            title={t("soundCard.trimInMaker")}
                                                            className="p-2 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                                        >
                                                            <Scissors className="w-3.5 h-3.5" />
                                                        </button>

                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 ui-control bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-medium text-emerald-400">
                                                            <Check className="w-3 h-3" />
                                                            <span>{t("spotify.onBoardBadge")}</span>
                                                        </span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            disabled={isBusy}
                                                            onClick={() =>
                                                                void importYouTubeTrack(yt, false)
                                                            }
                                                            className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-border)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50 transition-colors cursor-pointer"
                                                        >
                                                            {isBusy ? (
                                                                <>
                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-text)]" />
                                                                    <span>{t("spotify.fetchingAudio")}</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Plus className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                                                    <span>
                                                                        {t("spotify.addToSoundpadBtn")}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            disabled={isBusy}
                                                            onClick={() =>
                                                                void importYouTubeTrack(yt, true)
                                                            }
                                                            title={t("spotify.addAndPlayTitle")}
                                                            className="btn-accent flex items-center gap-1.5 px-3 py-1.5 ui-control text-xs font-semibold disabled:opacity-50 cursor-pointer"
                                                        >
                                                            <Mic className="w-3.5 h-3.5" />
                                                            <span className="hidden md:inline">
                                                                {t("spotify.addAndPlayBtn")}
                                                            </span>
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
