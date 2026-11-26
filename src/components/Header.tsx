import { useState } from "react";
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
} from "lucide-react";
import { useTranslation } from "../i18n";
import { AudioRoutingConfig, UIStyle } from "../types/sound";

interface HeaderProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    onAddNewSound: () => void;
    onStopAll: () => void;
    routingConfig: AudioRoutingConfig;
    onRoutingConfigChange: (newConfig: AudioRoutingConfig) => void;
    activePlayingCount: number;
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
    activePlayingCount,
    backgroundImageEnabled,
    transparency,
    uiStyle,
}: HeaderProps) {
    const { t } = useTranslation();
    const [isVolumeExpanded, setIsVolumeExpanded] = useState(false);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const isMuted = routingConfig.masterVolume === 0;

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

    // Transparent floating overlay in Gama & Win11 (rendered across full window width so search stays dead-center)
    const headerClass = isWin10
        ? "relative h-14 px-4 flex items-center justify-between gap-2 sm:grid sm:grid-cols-[1fr_minmax(180px,28rem)_1fr] sm:items-center sm:gap-3 shrink-0 select-none window-drag-region border-b border-[var(--border-subtle)] bg-[var(--bg-island)] rounded-none z-30"
        : isWin11
          ? "absolute top-0 left-0 right-0 pl-[82px] pr-4 sm:px-6 pt-2.5 pb-2 flex items-center justify-between gap-2 sm:grid sm:grid-cols-[1fr_minmax(180px,28rem)_1fr] sm:items-center sm:gap-2.5 shrink-0 select-none window-drag-region bg-transparent pointer-events-none z-30"
          : "absolute top-0 left-0 right-0 pl-[86px] pr-4 sm:px-6 pt-3 pb-2 flex items-center justify-between gap-2 sm:grid sm:grid-cols-[1fr_minmax(180px,28rem)_1fr] sm:items-center sm:gap-3 shrink-0 select-none window-drag-region bg-transparent pointer-events-none z-30";

    const capsuleBaseClass = isWin10
        ? "h-10 flex items-center shrink-0 window-no-drag bg-transparent border-0 rounded-none"
        : isWin11
          ? "pointer-events-auto h-11 flex items-center rounded-xl border border-[var(--border-subtle)] backdrop-blur-xl shrink-0 window-no-drag transition-[border-radius,border-color] duration-200"
          : "pointer-events-auto h-11 flex items-center rounded-full border border-[var(--border-subtle)] backdrop-blur-xl shrink-0 window-no-drag transition-[border-radius,border-color] duration-200";

    const searchBoxClass = isWin10
        ? "w-full mx-auto px-3 flex items-center gap-2.5 rounded-[2px] border bg-[var(--bg-input)] transition-colors window-no-drag"
        : isWin11
          ? "pointer-events-auto w-full mx-auto px-3.5 flex items-center gap-2.5 rounded-xl border backdrop-blur-xl transition-colors window-no-drag"
          : "pointer-events-auto w-full mx-auto px-3.5 flex items-center gap-2.5 rounded-full border backdrop-blur-xl transition-colors window-no-drag";

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
            {/* Left Spacer: reserves Sidebar width on small screens while keeping Search Bar dead-center in full window */}
            <div
                className={isWin10 ? "hidden sm:block" : "hidden sm:block sm:min-w-[68px]"}
                aria-hidden="true"
            />

            {/* Center Capsule / Section: Animated Search Bar */}
            <div className="flex-1 sm:w-full flex items-center justify-center min-w-0">
                <motion.div
                    initial={false}
                    animate={{
                        maxWidth: isSearchFocused ? 448 : 288,
                        height: isWin10
                            ? isSearchFocused
                                ? 36
                                : 30
                            : isSearchFocused
                              ? 44
                              : 36,
                    }}
                    transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 32,
                    }}
                    className={`${searchBoxClass} ${
                        isSearchFocused
                            ? "border-[var(--accent-border)]"
                            : "border-[var(--border-subtle)]"
                    }`}
                    style={!isWin10 ? capsuleStyle : undefined}
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
                        onChange={(e) => onSearchChange(e.target.value)}
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
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => onSearchChange("")}
                                aria-label={t("header.searchClear")}
                                className={`p-1 ${controlRadius} text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer`}
                            >
                                <X className="w-3.5 h-3.5" />
                            </motion.button>
                        )}
                    </AnimatePresence>
                </motion.div>
            </div>

            {/* Right Capsule / Section: Master Volume, Stop, Add Sound & Window Controls */}
            <motion.div
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
