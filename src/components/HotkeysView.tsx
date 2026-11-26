import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
    AlertTriangle,
    AudioWaveform,
    Check,
    Edit2,
    Keyboard,
    Pause,
    Play,
    Power,
    Search,
    ShieldAlert,
    SlidersHorizontal,
    Square,
    Volume2,
    X,
} from "lucide-react";
import { HotkeyFilterStatus, SoundItem, VoiceChangerConfig } from "../types/sound";
import { VOICE_PRESETS, VoicePresetDefinition } from "../utils/voicePresets";
import { normalizeHotkey as normKey } from "../utils/hotkeys";
import { useTranslation } from "../i18n";

interface HotkeysViewProps {
    sounds: SoundItem[];
    voiceChangerConfig: VoiceChangerConfig;
    stopAllHotkey: string;
    onOpenHotkeyModal: (sound: SoundItem) => void;
    onOpenVoicePresetHotkeyModal: (preset: VoicePresetDefinition) => void;
    onOpenVoiceToggleHotkeyModal: () => void;
    onActivateVoicePreset: (preset: VoicePresetDefinition) => void;
    onToggleVoiceEngine: () => void;
    onPlaySound: (sound: SoundItem) => void;
    hotkeyManuallyPaused: boolean;
    hotkeyFilterStatus: HotkeyFilterStatus;
    onTogglePauseHotkeys: () => void;
    onOpenSettingsFilter: () => void;
    isElectron: boolean;
}

type HotkeyFilterTab = "all" | "sounds" | "voice" | "conflicts" | "unassigned";

export function HotkeysView({
    sounds,
    voiceChangerConfig,
    stopAllHotkey,
    onOpenHotkeyModal,
    onOpenVoicePresetHotkeyModal,
    onOpenVoiceToggleHotkeyModal,
    onActivateVoicePreset,
    onToggleVoiceEngine,
    onPlaySound,
    hotkeyManuallyPaused,
    hotkeyFilterStatus,
    onTogglePauseHotkeys,
    onOpenSettingsFilter,
    isElectron,
}: HotkeysViewProps) {
    const { t } = useTranslation();
    const [filterQuery, setFilterQuery] = useState("");
    const [activeTab, setActiveTab] = useState<HotkeyFilterTab>("all");

    const hotkeyCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        const addCount = (raw?: string) => {
            if (!raw || raw.trim() === "") return;
            const k = normKey(raw);
            counts[k] = (counts[k] || 0) + 1;
        };

        sounds.forEach((s) => addCount(s.hotkey));
        addCount(stopAllHotkey);
        addCount(voiceChangerConfig.toggleHotkey);
        VOICE_PRESETS.forEach((p) =>
            addCount(voiceChangerConfig.presetHotkeys?.[p.id]),
        );
        return counts;
    }, [sounds, stopAllHotkey, voiceChangerConfig]);

    const conflictKeyCount = useMemo(
        () => Object.values(hotkeyCounts).filter((c) => c > 1).length,
        [hotkeyCounts],
    );

    const assignedVoiceCount = useMemo(() => {
        let count = voiceChangerConfig.toggleHotkey?.trim() ? 1 : 0;
        VOICE_PRESETS.forEach((p) => {
            if (voiceChangerConfig.presetHotkeys?.[p.id]?.trim()) count++;
        });
        return count;
    }, [voiceChangerConfig]);

    const assignedSoundsCount = useMemo(
        () => sounds.filter((s) => s.hotkey.trim() !== "").length,
        [sounds],
    );

    const totalActiveCount =
        assignedSoundsCount + assignedVoiceCount + (stopAllHotkey.trim() ? 1 : 0);

    const queryLower = filterQuery.trim().toLowerCase();

    const toggleHotkey = voiceChangerConfig.toggleHotkey || "";
    const isToggleDuplicate =
        Boolean(toggleHotkey) && hotkeyCounts[normKey(toggleHotkey)] > 1;
    const isStopAllDuplicate =
        Boolean(stopAllHotkey) && hotkeyCounts[normKey(stopAllHotkey)] > 1;
    const isVoiceActive =
        voiceChangerConfig.enabled && voiceChangerConfig.wetMix > 0;

    const filteredVoicePresets = useMemo(() => {
        return VOICE_PRESETS.filter((p) => {
            const hk = voiceChangerConfig.presetHotkeys?.[p.id] || "";
            const isDuplicate = Boolean(hk) && hotkeyCounts[normKey(hk)] > 1;

            if (activeTab === "sounds") return false;
            if (activeTab === "conflicts" && !isDuplicate) return false;
            if (activeTab === "unassigned" && hk.trim() !== "") return false;

            if (!queryLower) return true;
            const localizedName = t(`voicePresets.${p.id}_name`).toLowerCase();
            const localizedSubtitle = t(
                `voicePresets.${p.id}_subtitle`,
            ).toLowerCase();
            return (
                localizedName.includes(queryLower) ||
                localizedSubtitle.includes(queryLower) ||
                p.name.toLowerCase().includes(queryLower) ||
                p.subtitle.toLowerCase().includes(queryLower) ||
                hk.toLowerCase().includes(queryLower)
            );
        });
    }, [
        activeTab,
        queryLower,
        voiceChangerConfig.presetHotkeys,
        hotkeyCounts,
        t,
    ]);

    const showSystemSection = useMemo(() => {
        if (activeTab === "sounds") return false;
        if (activeTab === "conflicts") {
            return isToggleDuplicate || isStopAllDuplicate;
        }
        if (activeTab === "unassigned") {
            return !toggleHotkey.trim() || !stopAllHotkey.trim();
        }
        if (!queryLower) return true;
        return (
            t("hotkeys.engineToggleTitle").toLowerCase().includes(queryLower) ||
            t("settings.stopAllHotkeyTitle").toLowerCase().includes(queryLower) ||
            toggleHotkey.toLowerCase().includes(queryLower) ||
            stopAllHotkey.toLowerCase().includes(queryLower)
        );
    }, [
        activeTab,
        queryLower,
        isToggleDuplicate,
        isStopAllDuplicate,
        toggleHotkey,
        stopAllHotkey,
        t,
    ]);

    const filteredSounds = useMemo(() => {
        return sounds.filter((s) => {
            const isDuplicate =
                Boolean(s.hotkey) && hotkeyCounts[normKey(s.hotkey)] > 1;

            if (activeTab === "voice") return false;
            if (activeTab === "conflicts" && !isDuplicate) return false;
            if (activeTab === "unassigned" && s.hotkey.trim() !== "") return false;

            if (!queryLower) return true;
            return (
                s.title.toLowerCase().includes(queryLower) ||
                s.category.toLowerCase().includes(queryLower) ||
                s.hotkey.toLowerCase().includes(queryLower)
            );
        });
    }, [sounds, activeTab, queryLower, hotkeyCounts]);

    const isPausedState = hotkeyManuallyPaused || hotkeyFilterStatus.paused;
    const totalVisibleCount =
        filteredSounds.length +
        filteredVoicePresets.length +
        (showSystemSection ? 1 : 0);

    const tabs: Array<{ id: HotkeyFilterTab; label: string; count?: number }> = [
        { id: "all", label: t("hotkeys.filterAll") },
        { id: "sounds", label: t("hotkeys.filterSounds"), count: sounds.length },
        { id: "voice", label: t("hotkeys.filterVoice"), count: VOICE_PRESETS.length },
        {
            id: "conflicts",
            label: t("hotkeys.filterConflicts"),
            count: conflictKeyCount,
        },
        { id: "unassigned", label: t("hotkeys.filterUnassigned") },
    ];

    return (
        <div className="flex-1 flex flex-col gap-5 w-full">
            {/* Page Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3.5">
                    <div className="w-11 h-11 ui-inner bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
                        <Keyboard className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                            {t("hotkeys.title")}
                        </h1>
                        <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] mt-0.5">
                            {t("hotkeys.subtitle")}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <motion.button
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={onTogglePauseHotkeys}
                        className={`flex items-center gap-2 px-3.5 py-2 ui-control text-xs font-semibold border transition-colors cursor-pointer ${
                            isPausedState
                                ? "bg-amber-950/35 border-amber-700/80 text-amber-300"
                                : "bg-[var(--bg-card)] border-[var(--border-card)] text-[var(--text-primary)] hover:border-[var(--accent-border)]"
                        }`}
                    >
                        {isPausedState ? (
                            <>
                                <Pause className="w-3.5 h-3.5" />
                                <span>{t("header.hotkeysPaused")}</span>
                            </>
                        ) : (
                            <>
                                <Keyboard className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                                <span>{t("header.pauseHotkeysTitle")}</span>
                            </>
                        )}
                    </motion.button>

                    <motion.button
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={onOpenSettingsFilter}
                        className="flex items-center gap-1.5 px-3.5 py-2 ui-control bg-[var(--bg-card)] border border-[var(--border-card)] hover:border-[var(--border-hover)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                    >
                        <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                        <span>{t("hotkeyFilter.sectionTitle")}</span>
                    </motion.button>
                </div>
            </div>

            {/* Unboxed Status & Metrics Strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-[var(--text-secondary)]">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono tabular-nums">
                    <span className="text-[var(--text-primary)] font-semibold">
                        {t("hotkeys.keysActive", { count: totalActiveCount })}
                    </span>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span>
                        {t("hotkeys.summarySounds", {
                            assigned: assignedSoundsCount,
                            total: sounds.length,
                        })}
                    </span>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span>
                        {t("hotkeys.summaryVoice", { count: assignedVoiceCount })}
                    </span>
                    {conflictKeyCount > 0 && (
                        <>
                            <span className="text-[var(--text-muted)]">·</span>
                            <button
                                type="button"
                                onClick={() => setActiveTab("conflicts")}
                                className="inline-flex items-center gap-1 text-amber-400 hover:underline font-semibold cursor-pointer"
                            >
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>
                                    {t("hotkeys.summaryConflicts", {
                                        count: conflictKeyCount,
                                    })}
                                </span>
                            </button>
                        </>
                    )}
                </div>

                {isElectron && hotkeyFilterStatus.paused && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                        <span>
                            {hotkeyFilterStatus.activeProcess
                                ? t("hotkeyFilter.statusPausedByApp", {
                                      app: hotkeyFilterStatus.activeProcess,
                                  })
                                : t("hotkeyFilter.statusPausedManual")}
                        </span>
                    </div>
                )}
            </div>

            {/* Filter Tabs & Search Toolbar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="inline-flex flex-wrap items-center p-1 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] gap-1">
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-3 py-1.5 ui-control text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                                    isActive
                                        ? "btn-accent"
                                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                }`}
                            >
                                <span>{tab.label}</span>
                                {tab.count !== undefined && (
                                    <span
                                        className={`font-mono tabular-nums text-[11px] ${
                                            isActive
                                                ? "opacity-90"
                                                : tab.id === "conflicts" && tab.count > 0
                                                  ? "text-amber-400"
                                                  : "text-[var(--text-muted)]"
                                        }`}
                                    >
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className="relative w-full md:max-w-xs">
                    <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                        type="text"
                        value={filterQuery}
                        onChange={(e) => setFilterQuery(e.target.value)}
                        placeholder={t("hotkeys.searchPlaceholder")}
                        className="w-full pl-9 pr-8 py-2 ui-input bg-[var(--bg-input)] text-xs sm:text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-[var(--border-input)] focus:outline-none focus:border-[var(--accent)]"
                    />
                    {filterQuery && (
                        <button
                            type="button"
                            onClick={() => setFilterQuery("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                            aria-label="Clear"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* System & Engine Quick Bindings */}
            {showSystemSection && (
                <section className="app-card ui-card border border-[var(--border-card)] overflow-hidden">
                    <div className="px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-inner)] flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--text-secondary)]">
                            {t("hotkeys.systemControlsTitle")}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border-subtle)]">
                        {/* Voice Engine Toggle */}
                        <div className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-[var(--bg-card-hover)] transition-colors">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <AudioWaveform className="w-4 h-4 text-[var(--accent-text)] shrink-0" />
                                    <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                                        {t("hotkeys.engineToggleTitle")}
                                    </span>
                                    <span
                                        className={`text-[11px] font-medium ${
                                            isVoiceActive
                                                ? "text-[var(--accent-text)]"
                                                : "text-[var(--text-muted)]"
                                        }`}
                                    >
                                        ·{" "}
                                        {isVoiceActive
                                            ? t("nav.statusOn")
                                            : t("common.inactive")}
                                    </span>
                                </div>
                                <p className="text-xs text-[var(--text-secondary)] mt-1">
                                    {t("hotkeys.engineToggleDesc")}
                                </p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={onToggleVoiceEngine}
                                    title={t("hotkeys.toggleTitle")}
                                    className={`p-2 ui-control border transition-colors cursor-pointer ${
                                        isVoiceActive
                                            ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                            : "bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                    }`}
                                >
                                    <Power className="w-3.5 h-3.5" />
                                </button>

                                <button
                                    type="button"
                                    onClick={onOpenVoiceToggleHotkeyModal}
                                    className={`min-w-[88px] px-3 py-1.5 ui-control text-xs font-mono font-semibold border transition-colors cursor-pointer ${
                                        toggleHotkey
                                            ? isToggleDuplicate
                                                ? "bg-amber-950/35 border-amber-700 text-amber-300"
                                                : "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)] hover:brightness-110"
                                            : "bg-[var(--bg-inner)] border-dashed border-[var(--border-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                    }`}
                                >
                                    {toggleHotkey || t("hotkeys.assignBtn")}
                                </button>
                            </div>
                        </div>

                        {/* Stop All Sounds Hotkey */}
                        <div className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-[var(--bg-card-hover)] transition-colors">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <Square className="w-3.5 h-3.5 text-[var(--accent-text)] shrink-0" />
                                    <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                                        {t("settings.stopAllHotkeyTitle")}
                                    </span>
                                </div>
                                <p className="text-xs text-[var(--text-secondary)] mt-1">
                                    {t("settings.stopAllHotkeyDesc")}
                                </p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={onOpenSettingsFilter}
                                    className={`min-w-[88px] px-3 py-1.5 ui-control text-xs font-mono font-semibold border transition-colors cursor-pointer ${
                                        stopAllHotkey
                                            ? isStopAllDuplicate
                                                ? "bg-amber-950/35 border-amber-700 text-amber-300"
                                                : "bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-border)]"
                                            : "bg-[var(--bg-inner)] border-dashed border-[var(--border-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                    }`}
                                >
                                    {stopAllHotkey || t("hotkeys.assignBtn")}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Voice Presets Matrix */}
            {filteredVoicePresets.length > 0 && (
                <section className="app-card ui-card border border-[var(--border-card)] overflow-hidden">
                    <div className="px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-inner)] flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
                        <div className="flex items-center gap-2">
                            <AudioWaveform className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                            <span>
                                {t("hotkeys.voiceMatrixTitle", {
                                    count: assignedVoiceCount,
                                })}
                            </span>
                        </div>
                        <span className="font-mono tabular-nums text-[var(--text-muted)]">
                            {filteredVoicePresets.length}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[var(--border-subtle)]">
                        {filteredVoicePresets.map((preset) => {
                            const hotkey =
                                voiceChangerConfig.presetHotkeys?.[preset.id] ||
                                "";
                            const isDuplicate =
                                Boolean(hotkey) &&
                                hotkeyCounts[normKey(hotkey)] > 1;
                            const isActivePreset =
                                voiceChangerConfig.preset === preset.id &&
                                (preset.id === "natural"
                                    ? !voiceChangerConfig.enabled
                                    : voiceChangerConfig.enabled);

                            return (
                                <div
                                    key={preset.id}
                                    className="bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] px-5 py-3.5 flex items-center justify-between gap-3 transition-colors"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`text-sm font-semibold truncate ${
                                                    isActivePreset
                                                        ? "text-[var(--accent-text)]"
                                                        : "text-[var(--text-primary)]"
                                                }`}
                                            >
                                                {t(`voicePresets.${preset.id}_name`) ||
                                                    preset.name}
                                            </span>
                                            {isActivePreset && (
                                                <span className="text-[11px] font-medium text-[var(--accent-text)] shrink-0">
                                                    · {t("voiceChanger.statusActive")}
                                                </span>
                                            )}
                                            {isDuplicate && (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 shrink-0">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    <span>{t("common.conflict")}</span>
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                                            {t(
                                                `voicePresets.${preset.id}_subtitle`,
                                            ) || preset.subtitle}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onActivateVoicePreset(preset)
                                            }
                                            title={t("hotkeys.activatePresetTitle")}
                                            className={`p-2 ui-control border transition-colors cursor-pointer ${
                                                isActivePreset
                                                    ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                                    : "bg-[var(--bg-inner)] border-[var(--border-subtle)] hover:border-[var(--accent-border)] text-[var(--text-secondary)] hover:text-[var(--accent-text)]"
                                            }`}
                                        >
                                            {isActivePreset ? (
                                                <Check className="w-3.5 h-3.5" />
                                            ) : (
                                                <Play className="w-3.5 h-3.5 fill-current" />
                                            )}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                onOpenVoicePresetHotkeyModal(
                                                    preset,
                                                )
                                            }
                                            className={`min-w-[84px] text-center px-2.5 py-1.5 ui-control text-xs font-mono font-semibold border transition-colors cursor-pointer ${
                                                hotkey
                                                    ? isDuplicate
                                                        ? "bg-amber-950/35 border-amber-700 text-amber-300"
                                                        : "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)] hover:brightness-110"
                                                    : "bg-[var(--bg-inner)] border-dashed border-[var(--border-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                            }`}
                                        >
                                            {hotkey || t("hotkeys.assignBtn")}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Soundboard Hotkeys Matrix */}
            {filteredSounds.length > 0 && (
                <section className="app-card ui-card border border-[var(--border-card)] overflow-hidden">
                    <div className="px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-inner)] flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
                        <div className="flex items-center gap-2">
                            <Volume2 className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                            <span>{t("hotkeys.soundMatrixTitle")}</span>
                        </div>
                        <span className="font-mono tabular-nums text-[var(--text-muted)]">
                            {filteredSounds.length}
                        </span>
                    </div>

                    <div className="divide-y divide-[var(--border-subtle)]">
                        {filteredSounds.map((sound) => {
                            const isDuplicate =
                                Boolean(sound.hotkey) &&
                                hotkeyCounts[normKey(sound.hotkey)] > 1;

                            return (
                                <div
                                    key={sound.id}
                                    className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-[var(--bg-card-hover)] transition-colors"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                                                {sound.title}
                                            </span>
                                            {isDuplicate && (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 shrink-0">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    <span>{t("common.conflict")}</span>
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-[var(--text-muted)] mt-0.5 font-mono tabular-nums">
                                            {t(`categories.${sound.category}`) ||
                                                sound.category}{" "}
                                            · {sound.duration.toFixed(1)}s
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => onPlaySound(sound)}
                                            className="p-2 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] hover:border-[var(--accent-border)] text-[var(--text-secondary)] hover:text-[var(--accent-text)] transition-colors cursor-pointer"
                                            title={t("hotkeys.testTitle")}
                                        >
                                            <Play className="w-3.5 h-3.5 fill-current" />
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => onOpenHotkeyModal(sound)}
                                            className={`min-w-[88px] text-center px-3 py-1.5 ui-control text-xs font-mono font-semibold border transition-colors cursor-pointer ${
                                                sound.hotkey
                                                    ? isDuplicate
                                                        ? "bg-amber-950/35 border-amber-700 text-amber-300"
                                                        : "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)] hover:brightness-110"
                                                    : "bg-[var(--bg-inner)] border-dashed border-[var(--border-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                            }`}
                                        >
                                            {sound.hotkey || t("hotkeys.assignBtn")}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => onOpenHotkeyModal(sound)}
                                            className="p-2 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                            title={t("hotkeys.editTitle")}
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Empty State when filtered */}
            {totalVisibleCount === 0 && (
                <div className="app-card ui-card border border-[var(--border-card)] p-10 flex flex-col items-center justify-center text-center gap-2">
                    <Keyboard className="w-7 h-7 text-[var(--text-muted)]" />
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                        {t("hotkeys.emptyTitle")}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                        {t("hotkeys.emptyDesc")}
                    </p>
                </div>
            )}
        </div>
    );
}
