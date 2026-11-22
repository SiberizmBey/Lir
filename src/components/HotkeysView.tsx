import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
    Keyboard,
    Play,
    Edit2,
    AlertCircle,
    Search,
    AudioWaveform,
    Power,
    Check,
    Pause,
    ShieldAlert,
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

    const assignedVoiceCount = useMemo(() => {
        let count = voiceChangerConfig.toggleHotkey?.trim() ? 1 : 0;
        VOICE_PRESETS.forEach((p) => {
            if (voiceChangerConfig.presetHotkeys?.[p.id]?.trim()) count++;
        });
        return count;
    }, [voiceChangerConfig]);

    const assignedSounds = sounds.filter((s) => s.hotkey.trim() !== "");
    const totalActiveCount = assignedSounds.length + assignedVoiceCount;

    const queryLower = filterQuery.toLowerCase();

    const filteredVoicePresets = VOICE_PRESETS.filter((p) => {
        const hk = voiceChangerConfig.presetHotkeys?.[p.id] || "";
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

    const showToggleRow =
        t("hotkeys.engineToggleTitle").toLowerCase().includes(queryLower) ||
        (voiceChangerConfig.toggleHotkey || "")
            .toLowerCase()
            .includes(queryLower);

    const filteredSounds = sounds.filter(
        (s) =>
            s.title.toLowerCase().includes(queryLower) ||
            s.hotkey.toLowerCase().includes(queryLower),
    );

    const toggleHotkey = voiceChangerConfig.toggleHotkey || "";
    const isToggleDuplicate =
        Boolean(toggleHotkey) && hotkeyCounts[normKey(toggleHotkey)] > 1;
    const isVoiceActive =
        voiceChangerConfig.enabled && voiceChangerConfig.wetMix > 0;

    return (
        <div className="flex-1 flex flex-col gap-5 w-full">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 ui-inner bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
                        <Keyboard className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                                {t("hotkeys.title")}
                            </h1>
                            <span className="text-xs font-mono border border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--accent-text)] px-2.5 py-0.5 ui-control font-semibold">
                                {totalActiveCount} {t("common.active")}
                            </span>
                        </div>
                        <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] mt-0.5">
                            {t("hotkeys.subtitle")}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <motion.button
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={onTogglePauseHotkeys}
                        className={`flex items-center gap-2 px-3.5 py-2 ui-control text-xs font-semibold border transition-colors cursor-pointer ${
                            hotkeyManuallyPaused || hotkeyFilterStatus.paused
                                ? "bg-amber-950/40 border-amber-700 text-amber-300"
                                : "bg-[var(--bg-card)] border-[var(--border-card)] text-[var(--text-primary)] hover:border-[var(--accent-border)]"
                        }`}
                    >
                        {hotkeyManuallyPaused || hotkeyFilterStatus.paused ? (
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
                        className="flex items-center gap-1.5 px-3 py-2 ui-control bg-[var(--bg-card)] border border-[var(--border-card)] hover:border-[var(--border-hover)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                    >
                        <ShieldAlert className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                        <span>{t("hotkeyFilter.sectionTitle")}</span>
                    </motion.button>
                </div>
            </div>

            {/* Search toolbar */}
            <div className="flex items-center justify-between gap-3">
                <div className="relative max-w-sm w-full">
                    <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        value={filterQuery}
                        onChange={(e) => setFilterQuery(e.target.value)}
                        placeholder={t("hotkeys.searchPlaceholder")}
                        className="w-full pl-10 pr-4 py-2 ui-control bg-[var(--bg-card)] text-xs sm:text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-[var(--border-card)] focus:outline-none focus:border-[var(--accent-border)]"
                    />
                </div>

                <span className="text-xs font-mono text-[var(--text-secondary)]">
                    {t("hotkeys.recordsListed", {
                        count:
                            filteredSounds.length +
                            filteredVoicePresets.length +
                            (showToggleRow ? 1 : 0),
                    })}
                </span>
            </div>

            {/* Voice Changer Effects Matrix Card */}
            {(showToggleRow || filteredVoicePresets.length > 0) && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                        duration: 0.24,
                        ease: [0.22, 1, 0.36, 1] as const,
                    }}
                    className="app-card ui-card border border-[var(--border-card)] overflow-hidden"
                >
                    <div className="px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-inner)] flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
                        <div className="flex items-center gap-2">
                            <AudioWaveform className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                            <span>
                                {t("hotkeys.voiceMatrixTitle", {
                                    count: assignedVoiceCount,
                                })}
                            </span>
                        </div>
                        <span>{t("common.actions")}</span>
                    </div>

                    <div className="divide-y divide-[var(--border-subtle)]">
                        {showToggleRow && (
                            <div className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-[var(--bg-card-hover)] transition-colors">
                                <div className="flex items-center gap-3.5 min-w-0">
                                    <motion.button
                                        type="button"
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.94 }}
                                        onClick={onOpenVoiceToggleHotkeyModal}
                                        className={`min-w-[96px] text-center px-3 py-1 ui-control text-xs font-mono font-semibold border transition-colors cursor-pointer shrink-0 ${
                                            toggleHotkey
                                                ? isToggleDuplicate
                                                    ? "bg-amber-950/40 border-amber-700 text-amber-300"
                                                    : "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)] hover:brightness-110"
                                                : "bg-[var(--bg-inner)] border-dashed border-[var(--border-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                        }`}
                                    >
                                        {toggleHotkey || t("hotkeys.assignBtn")}
                                    </motion.button>

                                    <div className="flex flex-col min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                                                {t("hotkeys.engineToggleTitle")}
                                            </span>
                                            <span
                                                className={`text-[10px] font-mono px-2 py-0.5 ui-control border ${
                                                    isVoiceActive
                                                        ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                                        : "bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-muted)]"
                                                }`}
                                            >
                                                {isVoiceActive
                                                    ? t("nav.statusOn")
                                                    : t("common.inactive").toUpperCase()}
                                            </span>
                                        </div>
                                        <span className="text-xs text-[var(--text-secondary)] mt-0.5">
                                            {t("hotkeys.engineToggleDesc")}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    {isToggleDuplicate && (
                                        <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-950/30 border border-amber-800/50 px-2.5 py-1 ui-control">
                                            <AlertCircle className="w-3.5 h-3.5" />
                                            <span>{t("common.conflict")}</span>
                                        </div>
                                    )}

                                    <motion.button
                                        type="button"
                                        whileHover={{ scale: 1.06 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={onToggleVoiceEngine}
                                        className={`p-2 ui-control border transition-colors cursor-pointer ${
                                            isVoiceActive
                                                ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                                : "bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                        }`}
                                        title={t("hotkeys.toggleTitle")}
                                    >
                                        <Power className="w-3.5 h-3.5" />
                                    </motion.button>

                                    <motion.button
                                        type="button"
                                        whileHover={{ scale: 1.06 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={onOpenVoiceToggleHotkeyModal}
                                        className="p-2 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                        title={t("hotkeys.editTitle")}
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </motion.button>
                                </div>
                            </div>
                        )}

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
                                    className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-[var(--bg-card-hover)] transition-colors"
                                >
                                    <div className="flex items-center gap-3.5 min-w-0">
                                        <motion.button
                                            type="button"
                                            whileHover={{ scale: 1.03 }}
                                            whileTap={{ scale: 0.94 }}
                                            onClick={() =>
                                                onOpenVoicePresetHotkeyModal(
                                                    preset,
                                                )
                                            }
                                            className={`min-w-[96px] text-center px-3 py-1 ui-control text-xs font-mono font-semibold border transition-colors cursor-pointer shrink-0 ${
                                                hotkey
                                                    ? isDuplicate
                                                        ? "bg-amber-950/40 border-amber-700 text-amber-300"
                                                        : "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)] hover:brightness-110"
                                                    : "bg-[var(--bg-inner)] border-dashed border-[var(--border-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                            }`}
                                        >
                                            {hotkey || t("hotkeys.assignBtn")}
                                        </motion.button>

                                        <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                                                    {t(`voicePresets.${preset.id}_name`) || preset.name}
                                                </span>
                                                <span className="text-[10px] font-mono px-1.5 py-0.5 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                                                    {t(`voicePresets.${preset.id}_badge`) || preset.badge}
                                                </span>
                                                {isActivePreset && (
                                                    <span className="text-[10px] font-mono px-2 py-0.5 ui-control bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] font-semibold">
                                                        {t("voiceChanger.statusActive")}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                                                {t(`voicePresets.${preset.id}_subtitle`) || preset.subtitle}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {isDuplicate && (
                                            <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-950/30 border border-amber-800/50 px-2.5 py-1 ui-control">
                                                <AlertCircle className="w-3.5 h-3.5" />
                                                <span>{t("common.conflict")}</span>
                                            </div>
                                        )}

                                        <motion.button
                                            type="button"
                                            whileHover={{ scale: 1.06 }}
                                            whileTap={{ scale: 0.9 }}
                                            onClick={() =>
                                                onActivateVoicePreset(preset)
                                            }
                                            className={`p-2 ui-control border transition-colors cursor-pointer ${
                                                isActivePreset
                                                    ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                                    : "bg-[var(--bg-inner)] border-[var(--border-subtle)] hover:border-[var(--accent-border)] text-[var(--text-secondary)] hover:text-[var(--accent-text)]"
                                            }`}
                                            title={t("hotkeys.activatePresetTitle")}
                                        >
                                            {isActivePreset ? (
                                                <Check className="w-3.5 h-3.5" />
                                            ) : (
                                                <Play className="w-3.5 h-3.5 fill-current" />
                                            )}
                                        </motion.button>

                                        <motion.button
                                            type="button"
                                            whileHover={{ scale: 1.06 }}
                                            whileTap={{ scale: 0.9 }}
                                            onClick={() =>
                                                onOpenVoicePresetHotkeyModal(
                                                    preset,
                                                )
                                            }
                                            className="p-2 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                            title={t("hotkeys.editTitle")}
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </motion.button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            )}

            {/* Soundboard Hotkeys Matrix Card */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                    duration: 0.24,
                    delay: 0.04,
                    ease: [0.22, 1, 0.36, 1] as const,
                }}
                className="app-card ui-card border border-[var(--border-card)] overflow-hidden"
            >
                <div className="px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-inner)] flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
                    <span>{t("hotkeys.soundMatrixTitle")}</span>
                    <span>{t("common.actions")}</span>
                </div>

                <div className="divide-y divide-[var(--border-subtle)]">
                    <AnimatePresence initial={false}>
                        {filteredSounds.map((sound, index) => {
                            const isDuplicate =
                                Boolean(sound.hotkey) &&
                                hotkeyCounts[normKey(sound.hotkey)] > 1;

                            return (
                                <motion.div
                                    key={sound.id}
                                    layout
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{
                                        duration: 0.18,
                                        delay: Math.min(index * 0.02, 0.15),
                                    }}
                                    className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-[var(--bg-card-hover)] transition-colors"
                                >
                                    <div className="flex items-center gap-3.5 min-w-0">
                                        <motion.button
                                            type="button"
                                            whileHover={{ scale: 1.03 }}
                                            whileTap={{ scale: 0.94 }}
                                            onClick={() =>
                                                onOpenHotkeyModal(sound)
                                            }
                                            className={`min-w-[96px] text-center px-3 py-1 ui-control text-xs font-mono font-semibold border transition-colors cursor-pointer shrink-0 ${
                                                sound.hotkey
                                                    ? isDuplicate
                                                        ? "bg-amber-950/40 border-amber-700 text-amber-300"
                                                        : "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)] hover:brightness-110"
                                                    : "bg-[var(--bg-inner)] border-dashed border-[var(--border-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                            }`}
                                        >
                                            {sound.hotkey || t("hotkeys.assignBtn")}
                                        </motion.button>

                                        <div className="flex flex-col min-w-0">
                                            <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                                                {sound.title}
                                            </span>
                                            <span className="text-xs text-[var(--text-secondary)] mt-0.5">
                                                {sound.category} ·{" "}
                                                {sound.duration.toFixed(1)}s
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {isDuplicate && (
                                            <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-950/30 border border-amber-800/50 px-2.5 py-1 ui-control">
                                                <AlertCircle className="w-3.5 h-3.5" />
                                                <span>{t("common.conflict")}</span>
                                            </div>
                                        )}

                                        <motion.button
                                            type="button"
                                            whileHover={{ scale: 1.06 }}
                                            whileTap={{ scale: 0.9 }}
                                            onClick={() => onPlaySound(sound)}
                                            className="p-2 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] hover:border-[var(--accent-border)] text-[var(--text-secondary)] hover:text-[var(--accent-text)] transition-colors cursor-pointer"
                                            title={t("hotkeys.testTitle")}
                                        >
                                            <Play className="w-3.5 h-3.5 fill-current" />
                                        </motion.button>

                                        <motion.button
                                            type="button"
                                            whileHover={{ scale: 1.06 }}
                                            whileTap={{ scale: 0.9 }}
                                            onClick={() =>
                                                onOpenHotkeyModal(sound)
                                            }
                                            className="p-2 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                            title={t("hotkeys.editTitle")}
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </motion.button>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
}
