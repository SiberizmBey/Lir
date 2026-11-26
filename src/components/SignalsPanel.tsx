import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { RefreshCw, X } from "lucide-react";
import { useTranslation } from "../i18n";
import { getApiUrl } from "../utils/apiBase";
import { getPersistentItem, setPersistentItem } from "../utils/persistentStore";

export interface SignalEntry {
    id: string;
    code: string;
    badge: string;
    title: string;
    summary: string;
    category: string;
    publishedAt?: string;
}

export interface SignalsFeed {
    schemaVersion?: number;
    headerLabel: string;
    eyebrow: string;
    title: string;
    footerNote: string;
    updatedAt?: string;
    signals: SignalEntry[];
}

const DIRECT_SIGNALS_URL =
    "https://raw.githubusercontent.com/SiberizmBey/Koru/main/signals.json";
const SEEN_SIGNALS_STORAGE_KEY = "lir_seen_signals_v1";
const POLL_INTERVAL_MS = 5 * 60 * 1000;

const DEFAULT_FEED_META: Omit<SignalsFeed, "signals"> = {
    headerLabel: "ANTIC VALLEY / SİNYAL",
    eyebrow: "GÜNCEL YAYIN",
    title: "Not defteri",
    footerNote: "YENİ NOTLAR BURADA YAYINLANIR",
};

function normalizeFeed(raw: unknown): SignalsFeed {
    const obj =
        raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const rawSignals = Array.isArray(obj.signals) ? obj.signals : [];

    const signals: SignalEntry[] = rawSignals
        .filter((item): item is Record<string, unknown> =>
            Boolean(item && typeof item === "object"),
        )
        .map((item, idx) => ({
            id: String(item.id || item.code || `signal-${idx}`),
            code: String(item.code || `AV-${String(idx + 1).padStart(2, "0")}`),
            badge: String(item.badge || item.category || "Sinyal"),
            title: String(item.title || ""),
            summary: String(item.summary || ""),
            category: String(item.category || "RESMİ"),
            publishedAt:
                typeof item.publishedAt === "string"
                    ? item.publishedAt
                    : undefined,
        }))
        .filter((item) => item.title || item.summary);

    return {
        schemaVersion:
            typeof obj.schemaVersion === "number"
                ? obj.schemaVersion
                : undefined,
        headerLabel:
            typeof obj.headerLabel === "string" && obj.headerLabel.trim()
                ? obj.headerLabel
                : DEFAULT_FEED_META.headerLabel,
        eyebrow:
            typeof obj.eyebrow === "string" && obj.eyebrow.trim()
                ? obj.eyebrow
                : DEFAULT_FEED_META.eyebrow,
        title:
            typeof obj.title === "string" && obj.title.trim()
                ? obj.title
                : DEFAULT_FEED_META.title,
        footerNote:
            typeof obj.footerNote === "string" && obj.footerNote.trim()
                ? obj.footerNote
                : DEFAULT_FEED_META.footerNote,
        updatedAt:
            typeof obj.updatedAt === "string" ? obj.updatedAt : undefined,
        signals,
    };
}

function loadSeenSignalIds(): string[] {
    try {
        const raw = getPersistentItem(SEEN_SIGNALS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
            ? parsed.filter((id): id is string => typeof id === "string")
            : [];
    } catch {
        return [];
    }
}

export function useSignalsFeed() {
    const [feed, setFeed] = useState<SignalsFeed>({
        ...DEFAULT_FEED_META,
        signals: [],
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState(false);
    const [seenIds, setSeenIds] = useState<string[]>(() => loadSeenSignalIds());

    const fetchFeed = useCallback(async (manualRefresh = false) => {
        if (manualRefresh) {
            setIsRefreshing(true);
        }
        setError(false);

        const tryUrls = [
            getApiUrl(`/api/signals${manualRefresh ? "?refresh=1" : ""}`),
            `${DIRECT_SIGNALS_URL}${manualRefresh ? `?ts=${Date.now()}` : ""}`,
        ];

        for (const url of tryUrls) {
            try {
                const res = await fetch(url, {
                    headers: { Accept: "application/json" },
                    cache: "no-store",
                });
                if (!res.ok) continue;
                const data: unknown = await res.json();
                const normalized = normalizeFeed(data);
                setFeed(normalized);
                setIsLoading(false);
                setIsRefreshing(false);
                return;
            } catch {
                // try next source
            }
        }

        setError(true);
        setIsLoading(false);
        setIsRefreshing(false);
    }, []);

    useEffect(() => {
        void fetchFeed(false);
        const timer = window.setInterval(() => {
            void fetchFeed(false);
        }, POLL_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [fetchFeed]);

    const markAllSeen = useCallback(() => {
        if (feed.signals.length === 0) return;
        setSeenIds((prev) => {
            const merged = Array.from(
                new Set([...prev, ...feed.signals.map((s) => s.id)]),
            );
            setPersistentItem(SEEN_SIGNALS_STORAGE_KEY, JSON.stringify(merged));
            return merged;
        });
    }, [feed.signals]);

    const unreadCount = feed.signals.filter(
        (signal) => !seenIds.includes(signal.id),
    ).length;

    return {
        feed,
        isLoading,
        isRefreshing,
        error,
        unreadCount,
        refresh: () => void fetchFeed(true),
        markAllSeen,
    };
}

interface SignalsPanelProps {
    feed: SignalsFeed;
    isLoading: boolean;
    isRefreshing: boolean;
    error: boolean;
    onRefresh: () => void;
    onClose: () => void;
}

export function SignalsPanel({
    feed,
    isLoading,
    isRefreshing,
    error,
    onRefresh,
    onClose,
}: SignalsPanelProps) {
    const { t } = useTranslation();
    const formattedCount = String(feed.signals.length).padStart(2, "0");

    return (
        <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 440, damping: 32 }}
            role="dialog"
            aria-label={feed.title}
            className="pointer-events-auto relative w-[360px] sm:w-[396px] max-w-[calc(100vw-2rem)] rounded-[24px] border border-[var(--border-card)] bg-[var(--bg-modal)] backdrop-blur-xl overflow-hidden flex flex-col select-none"
        >
            {/* Top-Right Decorative Concentric Signal Rings */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-12 -right-12 w-44 h-44 flex items-center justify-center"
            >
                <div className="absolute w-44 h-44 rounded-full border border-[var(--accent-border)] opacity-20" />
                <div className="absolute w-32 h-32 rounded-full border border-[var(--accent-border)] opacity-30" />
                <div className="absolute w-20 h-20 rounded-full border border-[var(--accent-border)] opacity-45" />
            </div>

            {/* Header */}
            <div className="relative z-10 px-5 pt-5 pb-4 border-b border-[var(--border-subtle)]">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-[var(--accent)] shrink-0" />
                        <span className="text-[11px] font-mono tracking-[0.2em] uppercase text-[var(--text-secondary)] truncate">
                            {feed.headerLabel}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        <button
                            type="button"
                            onClick={onRefresh}
                            disabled={isRefreshing}
                            title={t("signals.refreshTitle")}
                            aria-label={t("signals.refreshTitle")}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer disabled:opacity-50"
                        >
                            <RefreshCw
                                className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                            />
                        </button>

                        <button
                            type="button"
                            onClick={onClose}
                            title={t("signals.closeTitle")}
                            aria-label={t("signals.closeTitle")}
                            className="w-8 h-8 rounded-full flex items-center justify-center border border-[var(--border-subtle)] bg-[var(--bg-inner)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-colors cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="mt-3.5 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[11px] font-mono font-semibold tracking-[0.16em] uppercase text-[var(--accent-text)]">
                            {feed.eyebrow}
                        </p>
                        <h2 className="text-[22px] font-bold tracking-tight text-[var(--text-primary)] leading-tight mt-0.5 truncate">
                            {feed.title}
                        </h2>
                    </div>

                    <span className="text-2xl font-bold font-mono tabular-nums text-[var(--text-primary)] leading-none shrink-0">
                        {formattedCount}
                    </span>
                </div>
            </div>

            {/* Signal Cards List */}
            <div className="relative z-10 max-h-[min(380px,calc(100vh-280px))] overflow-y-auto p-4 flex flex-col gap-3">
                {isLoading ? (
                    <div className="py-10 text-center text-xs text-[var(--text-secondary)]">
                        {t("signals.loading")}
                    </div>
                ) : error && feed.signals.length === 0 ? (
                    <div className="py-8 px-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-inner)]/70 flex flex-col items-center gap-3 text-center">
                        <p className="text-xs text-[var(--text-secondary)]">
                            {t("signals.error")}
                        </p>
                        <button
                            type="button"
                            onClick={onRefresh}
                            className="px-3.5 py-1.5 rounded-full border border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--accent-text)] text-xs font-semibold hover:brightness-110 transition-all cursor-pointer"
                        >
                            {t("signals.retry")}
                        </button>
                    </div>
                ) : feed.signals.length === 0 ? (
                    <div className="py-10 text-center text-xs text-[var(--text-secondary)]">
                        {t("signals.empty")}
                    </div>
                ) : (
                    feed.signals.map((signal) => (
                        <article
                            key={signal.id}
                            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-inner)]/75 p-4 flex flex-col gap-3"
                        >
                            {/* Card Header: Pill Badge + Signal Code */}
                            <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center px-3 py-1 rounded-full border border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[11px] font-semibold text-[var(--accent-text)]">
                                    {signal.badge}
                                </span>
                                <span className="text-xs font-mono tracking-wider text-[var(--text-muted)] uppercase shrink-0">
                                    {signal.code}
                                </span>
                            </div>

                            {/* Card Body */}
                            <div className="flex flex-col gap-1.5">
                                <h3 className="text-[15px] font-bold leading-snug text-[var(--text-primary)]">
                                    {signal.title}
                                </h3>
                                <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                                    {signal.summary}
                                </p>
                            </div>

                            {/* Card Footer */}
                            <div className="pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                                <span className="text-[11px] font-mono tracking-[0.18em] uppercase text-[var(--text-muted)]">
                                    {signal.category}
                                </span>

                                <div
                                    aria-hidden="true"
                                    className="flex items-center gap-1 shrink-0"
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                                    <span className="w-4 h-1.5 rounded-full bg-[var(--accent)] opacity-75" />
                                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] opacity-30" />
                                </div>
                            </div>
                        </article>
                    ))
                )}
            </div>

            {/* Panel Footer */}
            <div className="relative z-10 px-4 py-3 border-t border-[var(--border-subtle)] text-center">
                <p className="text-[10px] font-mono tracking-[0.22em] uppercase text-[var(--text-muted)]">
                    {feed.footerNote}
                </p>
            </div>
        </motion.div>
    );
}
