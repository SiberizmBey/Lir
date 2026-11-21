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
} from "lucide-react";
import { SoundItem, VoiceChangerConfig } from "../types/sound";
import { VOICE_PRESETS, VoicePresetDefinition } from "../utils/voicePresets";

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
    isElectron: boolean;
}

const normKey = (key: string) =>
    key
        .trim()
        .toUpperCase()
        .replace(/^ESCAPE$/, "ESC")
        .replace(/\bNUMPAD\s+([0-9])\b/g, "NUMPAD$1");

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
    isElectron,
}: HotkeysViewProps) {
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
        return (
            p.name.toLowerCase().includes(queryLower) ||
            p.subtitle.toLowerCase().includes(queryLower) ||
            hk.toLowerCase().includes(queryLower)
        );
    });

    const showToggleRow =
        "efekt motoru aç kapat ses değiştirici"
            .includes(queryLower) ||
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
                                Kısayol Matrisi
                            </h1>
                            <span className="text-xs font-mono border border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--accent-text)] px-2.5 py-0.5 ui-control font-semibold">
                                {totalActiveCount} Tuş Aktif
                            </span>
                        </div>
                        <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] mt-0.5">
                            {isElectron
                                ? "Ses efektleri ve ses değiştirici profilleri Electron arka plan servisiyle oyun ve Discord arkasında da anında tetiklenir."
                                : "Web önizlemesinde klavye tuşlarıyla sesleri çalabilir ve ses efektlerini anlık olarak değiştirebilirsiniz."}
                        </p>
                    </div>
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
                        placeholder="Kısayol, ses veya ses efekti ara..."
                        className="w-full pl-10 pr-4 py-2 ui-control bg-[var(--bg-card)] text-xs sm:text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-[var(--border-card)] focus:outline-none focus:border-[var(--accent-border)]"
                    />
                </div>

                <span className="text-xs font-mono text-[var(--text-secondary)]">
                    {filteredSounds.length +
                        filteredVoicePresets.length +
                        (showToggleRow ? 1 : 0)}{" "}
                    kayıt listelendi
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
                                Anlık Ses Efekti Kısayolları ({assignedVoiceCount}{" "}
                                atandı)
                            </span>
                        </div>
                        <span>İşlemler</span>
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
                                        {toggleHotkey || "+ Ata"}
                                    </motion.button>

                                    <div className="flex flex-col min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                                                Efekt Motoru Aç / Kapat
                                            </span>
                                            <span
                                                className={`text-[10px] font-mono px-2 py-0.5 ui-control border ${
                                                    isVoiceActive
                                                        ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                                        : "bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-muted)]"
                                                }`}
                                            >
                                                {isVoiceActive
                                                    ? "AÇIK"
                                                    : "KAPALI"}
                                            </span>
                                        </div>
                                        <span className="text-xs text-[var(--text-secondary)] mt-0.5">
                                            Seçili ses efektini tek tuşla anında açar veya devre dışı bırakır.
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    {isToggleDuplicate && (
                                        <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-950/30 border border-amber-800/50 px-2.5 py-1 ui-control">
                                            <AlertCircle className="w-3.5 h-3.5" />
                                            <span>Çakışma</span>
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
                                        title="Aç / Kapat"
                                    >
                                        <Power className="w-3.5 h-3.5" />
                                    </motion.button>

                                    <motion.button
                                        type="button"
                                        whileHover={{ scale: 1.06 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={onOpenVoiceToggleHotkeyModal}
                                        className="p-2 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                        title="Düzenle"
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
                                            {hotkey || "+ Ata"}
                                        </motion.button>

                                        <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                                                    {preset.name}
                                                </span>
                                                <span className="text-[10px] font-mono px-1.5 py-0.5 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                                                    {preset.badge}
                                                </span>
                                                {isActivePreset && (
                                                    <span className="text-[10px] font-mono px-2 py-0.5 ui-control bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] font-semibold">
                                                        AKTİF
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                                                {preset.subtitle}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {isDuplicate && (
                                            <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-950/30 border border-amber-800/50 px-2.5 py-1 ui-control">
                                                <AlertCircle className="w-3.5 h-3.5" />
                                                <span>Çakışma</span>
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
                                            title="Bu Efekti Anında Aktif Et"
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
                                            title="Düzenle"
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
                    <span>Kısayol Tuşu &amp; Ses Dosyası</span>
                    <span>İşlemler</span>
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
                                            {sound.hotkey || "+ Ata"}
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
                                                <span>Çakışma</span>
                                            </div>
                                        )}

                                        <motion.button
                                            type="button"
                                            whileHover={{ scale: 1.06 }}
                                            whileTap={{ scale: 0.9 }}
                                            onClick={() => onPlaySound(sound)}
                                            className="p-2 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] hover:border-[var(--accent-border)] text-[var(--text-secondary)] hover:text-[var(--accent-text)] transition-colors cursor-pointer"
                                            title="Test Et"
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
                                            title="Düzenle"
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
