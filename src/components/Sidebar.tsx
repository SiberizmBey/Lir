import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
    Volume2,
    AudioWaveform,
    Sliders,
    Keyboard,
    Mic,
    HelpCircle,
    Settings,
    ScanText,
} from "lucide-react";
import { UIStyle } from "../types/sound";

export type NavTab =
    | "soundboard"
    | "voice"
    | "recorder"
    | "routing"
    | "hotkeys"
    | "translator"
    | "settings"
    | "guide";

interface SidebarProps {
    currentTab: NavTab;
    onTabChange: (tab: NavTab) => void;
    soundCount: number;
    activePlayingCount: number;
    isVoiceChangerActive: boolean;
    backgroundImageEnabled: boolean;
    transparency: number;
    uiStyle: UIStyle;
}

export function Sidebar({
    currentTab,
    onTabChange,
    soundCount,
    activePlayingCount,
    isVoiceChangerActive,
    backgroundImageEnabled,
    transparency,
    uiStyle,
}: SidebarProps) {
    const [isMenuHovered, setIsMenuHovered] = useState(false);

    const navItems = [
        {
            id: "soundboard" as NavTab,
            label: "Soundboard",
            icon: Volume2,
            badge: soundCount,
        },
        {
            id: "voice" as NavTab,
            label: "Ses Değiştirici",
            icon: AudioWaveform,
            badge: isVoiceChangerActive ? "AÇIK" : null,
        },
        {
            id: "recorder" as NavTab,
            label: "Ses Kaydedici",
            icon: Mic,
            badge: null,
        },
        {
            id: "routing" as NavTab,
            label: "Ses Yönlendirme",
            icon: Sliders,
            badge: null,
        },
        {
            id: "hotkeys" as NavTab,
            label: "Kısayol Matrisi",
            icon: Keyboard,
            badge: null,
        },
        {
            id: "translator" as NavTab,
            label: "Altyazı Çevirisi",
            icon: ScanText,
            badge: null,
        },
        {
            id: "guide" as NavTab,
            label: "Kullanım Kılavuzu",
            icon: HelpCircle,
            badge: null,
        },
    ];

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

    const asideClass = isWin10
        ? "relative w-16 h-screen shrink-0 p-0 flex flex-col justify-between items-stretch select-none z-40 overflow-visible bg-[var(--bg-island)] border-r border-[var(--border-subtle)] rounded-none"
        : isWin11
          ? "relative w-[74px] h-screen shrink-0 py-2.5 pl-2.5 pr-1 flex flex-col justify-between items-start select-none z-40 overflow-visible bg-transparent pointer-events-none"
          : "relative w-[78px] h-screen shrink-0 py-3 pl-3 pr-1 flex flex-col justify-between items-start select-none z-40 overflow-visible bg-transparent pointer-events-none";

    // Top, middle, and bottom capsules keep IDENTICAL border-radius open and closed:
    // Gama = rounded-[28px] (exact 56px circle/pill when collapsed, identical 28px when expanded)
    const topLogoClass = isWin10
        ? "w-full h-14 border-b border-[var(--border-subtle)] bg-transparent flex items-center justify-center shrink-0 transition-colors hover:bg-[var(--bg-card-hover)] rounded-none cursor-pointer"
        : isWin11
          ? "pointer-events-auto w-14 h-14 rounded-xl border border-[var(--border-card)] backdrop-blur-xl flex items-center justify-center shrink-0 transition-colors hover:border-[var(--accent-border)] cursor-pointer"
          : "pointer-events-auto w-14 h-14 rounded-[28px] border border-[var(--border-card)] backdrop-blur-xl flex items-center justify-center shrink-0 transition-colors hover:border-[var(--accent-border)] cursor-pointer";

    const navRadiusClass = isWin10
        ? "rounded-none"
        : isWin11
          ? "rounded-xl"
          : "rounded-[28px]";

    const navBorderBgClass = isWin10
        ? isMenuHovered
            ? "border border-[var(--border-hover)] bg-[var(--bg-island)]"
            : "border-0 bg-transparent"
        : isMenuHovered
          ? "border border-[var(--border-hover)] backdrop-blur-xl"
          : "border border-[var(--border-card)] backdrop-blur-xl";

    const itemRadiusClass = isWin10
        ? "rounded-[2px]"
        : isWin11
          ? "rounded-lg"
          : "rounded-[22px]";

    const bottomSettingsWrapperClass = isWin10
        ? "w-full h-14 border-t border-[var(--border-subtle)] p-1.5 flex items-center justify-center shrink-0 rounded-none"
        : isWin11
          ? "pointer-events-auto w-14 h-14 rounded-xl border border-[var(--border-card)] backdrop-blur-xl p-1.5 flex items-center justify-center shrink-0"
          : "pointer-events-auto w-14 h-14 rounded-[28px] border border-[var(--border-card)] backdrop-blur-xl p-1.5 flex items-center justify-center shrink-0";

    const bottomSettingsBtnClass = isWin10
        ? "w-full h-full rounded-[2px]"
        : isWin11
          ? "w-11 h-11 rounded-lg"
          : "w-11 h-11 rounded-[22px]";

    return (
        <aside className={asideClass} style={isWin10 ? capsuleStyle : undefined}>
            {/* Capsule 1 (Top): Brand Logo */}
            <motion.button
                type="button"
                onClick={() => onTabChange("soundboard")}
                title="Lir Soundboard"
                whileHover={{ scale: isWin10 ? 1 : 1.05 }}
                whileTap={{ scale: 0.94 }}
                transition={{ type: "spring", stiffness: 450, damping: 28 }}
                className={topLogoClass}
                style={!isWin10 ? capsuleStyle : undefined}
            >
                <img
                    src={`${import.meta.env.BASE_URL}assets/img/icon.png?v=1.3`}
                    alt="Lir Logo"
                    className="w-8 h-8 object-contain"
                />
            </motion.button>

            {/* Capsule 2 (Middle): Navigation Menus (same border-radius open and closed!) */}
            <div
                className={`relative ${isWin10 ? "w-16" : "w-14"} flex items-center justify-start my-auto overflow-visible`}
            >
                <motion.nav
                    aria-label="Ana menü"
                    onMouseEnter={() => setIsMenuHovered(true)}
                    onMouseLeave={() => setIsMenuHovered(false)}
                    initial={false}
                    animate={{
                        width: isMenuHovered ? 236 : isWin10 ? 64 : 56,
                    }}
                    transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 32,
                        mass: 0.85,
                    }}
                    className={`pointer-events-auto absolute left-0 top-1/2 -translate-y-1/2 p-1.5 flex flex-col gap-1 z-50 overflow-hidden ${navRadiusClass} ${navBorderBgClass}`}
                    style={capsuleStyle}
                >
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = currentTab === item.id;
                        const isItemPulsing =
                            (item.id === "soundboard" && activePlayingCount > 0) ||
                            (item.id === "voice" && isVoiceChangerActive);

                        return (
                            <motion.button
                                key={item.id}
                                type="button"
                                onClick={() => onTabChange(item.id)}
                                whileTap={{ scale: 0.96 }}
                                title={!isMenuHovered ? item.label : undefined}
                                className={`relative h-11 w-full flex items-center px-[12px] justify-start transition-colors cursor-pointer ${itemRadiusClass} ${
                                    isActive
                                        ? "font-semibold"
                                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] font-medium"
                                }`}
                                style={
                                    isActive
                                        ? { color: "var(--btn-primary-text)" }
                                        : undefined
                                }
                            >
                                {isActive && (
                                    <motion.span
                                        layoutId="sidebarActivePill"
                                        transition={{
                                            type: "spring",
                                            stiffness: 460,
                                            damping: 34,
                                        }}
                                        className={`absolute inset-0 ${itemRadiusClass}`}
                                        style={{
                                            backgroundColor:
                                                "var(--btn-primary-bg)",
                                        }}
                                    />
                                )}

                                <div className="relative z-10 shrink-0 flex items-center justify-center w-[18px] h-[18px]">
                                    <Icon className="w-[18px] h-[18px]" />
                                    {isItemPulsing && !isActive && (
                                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
                                    )}
                                </div>

                                <AnimatePresence>
                                    {isMenuHovered && (
                                        <motion.span
                                            key="label"
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -6 }}
                                            transition={{
                                                duration: 0.16,
                                                ease: [0.22, 1, 0.36, 1],
                                            }}
                                            className="relative z-10 ml-3 whitespace-nowrap text-[13px] truncate"
                                        >
                                            {item.label}
                                        </motion.span>
                                    )}
                                </AnimatePresence>

                                <AnimatePresence>
                                    {isMenuHovered && item.badge !== null && (
                                        <motion.span
                                            key="badge"
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.8 }}
                                            transition={{ duration: 0.15 }}
                                            className={`relative z-10 ml-auto px-2 py-0.5 whitespace-nowrap text-[11px] font-mono ${itemRadiusClass} ${
                                                isActive
                                                    ? "bg-black/20 text-[var(--btn-primary-text)]"
                                                    : "bg-[var(--bg-inner)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                                            }`}
                                        >
                                            {item.badge}
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                            </motion.button>
                        );
                    })}
                </motion.nav>
            </div>

            {/* Capsule 3 (Bottom): Settings */}
            <div
                className={bottomSettingsWrapperClass}
                style={!isWin10 ? capsuleStyle : undefined}
            >
                <motion.button
                    type="button"
                    data-tab="settings"
                    onClick={() => onTabChange("settings")}
                    whileHover={{ scale: isWin10 ? 1 : 1.05 }}
                    whileTap={{ scale: 0.92 }}
                    transition={{ type: "spring", stiffness: 450, damping: 28 }}
                    title="Ayarlar"
                    aria-label="Ayarlar"
                    className={`relative ${bottomSettingsBtnClass} flex items-center justify-center transition-colors cursor-pointer ${
                        currentTab === "settings"
                            ? "btn-accent"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
                    }`}
                >
                    <motion.span
                        animate={{ rotate: currentTab === "settings" ? 45 : 0 }}
                        transition={{
                            type: "spring",
                            stiffness: 350,
                            damping: 22,
                        }}
                        className="flex items-center justify-center"
                    >
                        <Settings className="w-[18px] h-[18px]" />
                    </motion.span>
                </motion.button>
            </div>
        </aside>
    );
}
