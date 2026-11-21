import { useState, useRef, useEffect } from "react";
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
    Radio,
    AudioWaveform,
    ChevronDown,
    Check,
    Sliders,
} from "lucide-react";
import { useTranslation } from "../i18n";
import { AudioVisualizer } from "./AudioVisualizer";
import {
    AudioRoutingConfig,
    UIStyle,
    VoiceChangerConfig,
} from "../types/sound";
import { VOICE_PRESETS, VoicePresetDefinition } from "../utils/voicePresets";

interface HeaderProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    onAddNewSound: () => void;
    onStopAll: () => void;
    routingConfig: AudioRoutingConfig;
    onRoutingConfigChange: (newConfig: AudioRoutingConfig) => void;
    voiceChangerConfig: VoiceChangerConfig;
    onSelectVoicePreset: (preset: VoicePresetDefinition) => void;
    onToggleVoiceChanger: () => void;
    onOpenVoiceChangerTab: () => void;
    activePlayingCount: number;
    onOpenRoutingTab: () => void;
    backgroundImageEnabled: boolean;
    transparency: number;
    uiStyle: UIStyle;
}

export function Header({
    searchQuery,
    onSearchChange,
    onAddNewSound,
    onStopAll,
    routingConfig,
    onRoutingConfigChange,
    voiceChangerConfig,
    onSelectVoicePreset,
    onToggleVoiceChanger,
    onOpenVoiceChangerTab,
    activePlayingCount,
    onOpenRoutingTab,
    backgroundImageEnabled,
    transparency,
    uiStyle,
}: HeaderProps) {
    const { t } = useTranslation();
    const [isVolumeExpanded, setIsVolumeExpanded] = useState(false);
    const [isVoiceMenuOpen, setIsVoiceMenuOpen] = useState(false);
    const voiceMenuRef = useRef<HTMLDivElement | null>(null);
    const isMuted = routingConfig.masterVolume === 0;

    useEffect(() => {
        if (!isVoiceMenuOpen) return;
        const handleOutsideClick = (e: MouseEvent) => {
            if (
                voiceMenuRef.current &&
                !voiceMenuRef.current.contains(e.target as Node)
            ) {
                setIsVoiceMenuOpen(false);
            }
        };
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsVoiceMenuOpen(false);
        };
        window.addEventListener("mousedown", handleOutsideClick);
        window.addEventListener("keydown", handleEsc);
        return () => {
            window.removeEventListener("mousedown", handleOutsideClick);
            window.removeEventListener("keydown", handleEsc);
        };
    }, [isVoiceMenuOpen]);

    const activePreset = VOICE_PRESETS.find(
        (p) => p.id === voiceChangerConfig.preset,
    );
    const isVoiceEffectRunning =
        voiceChangerConfig.enabled && voiceChangerConfig.wetMix > 0;

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

    const islandOpacity = backgroundImageEnabled ? 100 - transparency : 82;
    const capsuleStyle = isWin10
        ? backgroundImageEnabled
            ? {
                  backgroundColor: `color-mix(in srgb, var(--bg-island) ${100 - transparency}%, transparent)`,
              }
            : undefined
        : {
              backgroundColor: `color-mix(in srgb, var(--bg-island) ${islandOpacity}%, transparent)`,
          };

    // Transparent floating overlay in Gama & Win11 so scrolled content passes visibly behind the navbar!
    const headerClass = isWin10
        ? "relative h-14 px-4 flex items-center justify-between gap-3 shrink-0 select-none window-drag-region border-b border-[var(--border-subtle)] bg-[var(--bg-island)] rounded-none z-30"
        : isWin11
          ? "absolute top-0 left-0 right-0 px-4 sm:px-6 pt-2.5 pb-2 flex items-center justify-between gap-2.5 shrink-0 select-none window-drag-region bg-transparent pointer-events-none z-30"
          : "absolute top-0 left-0 right-0 px-4 sm:px-6 pt-3 pb-2 flex items-center justify-between gap-3 shrink-0 select-none window-drag-region bg-transparent pointer-events-none z-30";

    const capsuleBaseClass = isWin10
        ? "h-10 flex items-center shrink-0 window-no-drag bg-transparent border-0 rounded-none"
        : isWin11
          ? "pointer-events-auto h-11 flex items-center rounded-xl border border-[var(--border-subtle)] backdrop-blur-xl shrink-0 window-no-drag transition-[border-radius,border-color] duration-200"
          : "pointer-events-auto h-11 flex items-center rounded-full border border-[var(--border-subtle)] backdrop-blur-xl shrink-0 window-no-drag transition-[border-radius,border-color] duration-200";

    const searchBoxClass = isWin10
        ? "h-9 flex-1 max-w-md px-3 flex items-center gap-2.5 rounded-[2px] border border-[var(--border-subtle)] bg-[var(--bg-input)] focus-within:border-[var(--accent-border)] transition-colors window-no-drag"
        : isWin11
          ? "pointer-events-auto h-11 flex-1 max-w-md px-3.5 flex items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] backdrop-blur-xl focus-within:border-[var(--accent-border)] transition-colors window-no-drag"
          : "pointer-events-auto h-11 flex-1 max-w-md px-3.5 flex items-center gap-2.5 rounded-full border border-[var(--border-subtle)] backdrop-blur-xl focus-within:border-[var(--accent-border)] transition-colors window-no-drag";

    const controlRadius = isWin10
        ? "rounded-[2px]"
        : isWin11
          ? "rounded-lg"
          : "rounded-full";

    return (
        <header
            className={headerClass}
            style={isWin10 ? capsuleStyle : undefined}
        >
            {/* Left Capsule / Section: Audio Output, Live Equalizer & Quick Voice Effect Switcher */}
            <div className="flex items-center gap-2 shrink-0">
                <motion.div
                    layout
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    className={`${capsuleBaseClass} ${isWin10 ? "px-0 gap-2" : "px-2.5 gap-2"}`}
                    style={!isWin10 ? capsuleStyle : undefined}
                >
                    <motion.button
                        type="button"
                        onClick={onOpenRoutingTab}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.96 }}
                        title={t("header.openRoutingTab")}
                        className={`flex items-center gap-2 px-2.5 py-1.5 ${controlRadius} hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer`}
                    >
                        <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                                activePlayingCount > 0
                                    ? "bg-[var(--accent)] animate-pulse"
                                    : "bg-[var(--accent)] opacity-80"
                            }`}
                        />
                        <Radio className="w-3.5 h-3.5 text-[var(--accent-text)] shrink-0 hidden sm:block" />
                        <span className="text-xs font-medium text-[var(--text-primary)] truncate max-w-[130px] hidden md:block">
                            {routingConfig.primaryDeviceLabel || "CABLE Input"}
                        </span>
                    </motion.button>

                    <div className="hidden xl:flex items-center pl-2 border-l border-[var(--border-subtle)]">
                        <AudioVisualizer
                            isPlaying={activePlayingCount > 0}
                            height={16}
                        />
                    </div>
                </motion.div>

                {/* Instant Voice Effect Quick Switcher */}
                <div ref={voiceMenuRef} className="relative pointer-events-auto window-no-drag">
                    <motion.button
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={() => setIsVoiceMenuOpen((prev) => !prev)}
                        title={t("header.voiceEffectSwitch")}
                        style={!isWin10 ? capsuleStyle : undefined}
                        className={`${
                            isWin10
                                ? "h-9 px-2.5 rounded-[2px] border border-[var(--border-subtle)] bg-[var(--bg-card)]"
                                : isWin11
                                  ? "h-11 px-3 rounded-xl border border-[var(--border-subtle)] backdrop-blur-xl"
                                  : "h-11 px-3.5 rounded-full border border-[var(--border-subtle)] backdrop-blur-xl"
                        } flex items-center gap-2 text-xs font-medium transition-colors cursor-pointer ${
                            isVoiceEffectRunning
                                ? "border-[var(--accent-border)] text-[var(--accent-text)]"
                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                    >
                        <AudioWaveform className="w-3.5 h-3.5 shrink-0" />
                        <span className="hidden sm:inline truncate max-w-[115px]">
                            {isVoiceEffectRunning
                                ? (activePreset ? t(`voicePresets.${activePreset.id}_name`) : t("header.voiceEngineActive"))
                                : t("header.voicePresetNatural")}
                        </span>
                        <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform ${
                                isVoiceMenuOpen ? "rotate-180" : ""
                            }`}
                        />
                    </motion.button>

                    <AnimatePresence>
                        {isVoiceMenuOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 4, scale: 0.97 }}
                                transition={{ duration: 0.14 }}
                                className="absolute left-0 top-full mt-2 w-72 bg-[var(--bg-modal)] border border-[var(--border-card)] ui-card p-3 flex flex-col gap-2.5 z-50"
                            >
                                <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                                    <div className="flex items-center gap-2">
                                        <AudioWaveform className="w-4 h-4 text-[var(--accent-text)]" />
                                        <span className="text-xs font-bold text-[var(--text-primary)]">
                                            {t("header.voiceEngine")}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={onToggleVoiceChanger}
                                        className={`px-2 py-0.5 ui-control text-[10px] font-mono font-semibold border cursor-pointer transition-colors ${
                                            isVoiceEffectRunning
                                                ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                                                : "bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-muted)]"
                                        }`}
                                    >
                                        {isVoiceEffectRunning ? t("nav.statusOn") : t("common.inactive").toUpperCase()}
                                    </button>
                                </div>

                                <div className="flex flex-col gap-1 max-h-72 overflow-y-auto pr-0.5">
                                    {VOICE_PRESETS.map((preset) => {
                                        const isCurrent =
                                            voiceChangerConfig.preset ===
                                                preset.id &&
                                            (preset.id === "natural"
                                                ? !isVoiceEffectRunning
                                                : isVoiceEffectRunning);
                                        const hk =
                                            voiceChangerConfig.presetHotkeys?.[
                                                preset.id
                                            ];
                                        const presetName = t(`voicePresets.${preset.id}_name`) || preset.name;
                                        const presetBadge = t(`voicePresets.${preset.id}_badge`) || preset.badge;
                                        return (
                                            <button
                                                key={preset.id}
                                                type="button"
                                                onClick={() => {
                                                    onSelectVoicePreset(preset);
                                                    setIsVoiceMenuOpen(false);
                                                }}
                                                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 ui-control text-xs border transition-colors cursor-pointer ${
                                                    isCurrent
                                                        ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)] font-semibold"
                                                        : "bg-transparent border-transparent hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)]"
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                                                        {isCurrent && (
                                                            <Check className="w-3.5 h-3.5" />
                                                        )}
                                                    </span>
                                                    <span className="truncate">
                                                        {presetName}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {hk && (
                                                        <span className="px-1.5 py-0.5 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--accent-text)]">
                                                            {hk}
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] font-mono text-[var(--text-muted)]">
                                                        {presetBadge}
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsVoiceMenuOpen(false);
                                        onOpenVoiceChangerTab();
                                    }}
                                    className="w-full flex items-center justify-center gap-1.5 py-1.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                >
                                    <Sliders className="w-3 h-3" />
                                    <span>{t("header.openVoiceTab")}</span>
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Center Capsule / Section: Search Bar */}
            <div
                className={searchBoxClass}
                style={!isWin10 ? capsuleStyle : undefined}
            >
                <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0 pointer-events-none" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
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
                            onClick={() => onSearchChange("")}
                            aria-label={t("header.searchClear")}
                            className={`p-1 ${controlRadius} text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer`}
                        >
                            <X className="w-3.5 h-3.5" />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>

            {/* Right Capsule / Section: Master Volume, Stop, Add Sound & Window Controls */}
            <motion.div
                layout
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className={`${capsuleBaseClass} ${isWin10 ? "px-0 gap-1.5" : "px-1.5 gap-1.5"}`}
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
                        title={isMuted ? t("header.unmute") : t("header.mute")}
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
                            max="1"
                            step="0.02"
                            value={routingConfig.masterVolume}
                            onChange={(e) =>
                                handleVolumeSlider(parseFloat(e.target.value))
                            }
                            className="w-16 shrink-0 cursor-pointer"
                            title={`${t("header.masterVolume")}: %${Math.round(routingConfig.masterVolume * 100)}`}
                        />
                        <span className="w-8 shrink-0 text-right text-[11px] font-mono tabular-nums text-[var(--text-secondary)]">
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
                    <span className="hidden xl:inline">{t("soundCard.stop")}</span>
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
                    <span className="hidden md:inline">{t("header.addNewSound")}</span>
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
