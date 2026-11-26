import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sliders, Keyboard, HelpCircle, Pause, Bell } from "lucide-react";
import { HotkeyFilterStatus, UIStyle } from "../types/sound";
import { NavTab } from "./Sidebar";
import { useTranslation } from "../i18n";
import { SignalsPanel, useSignalsFeed } from "./SignalsPanel";

interface BottomUtilityBarProps {
    currentTab: NavTab;
    onTabChange: (tab: NavTab) => void;
    hotkeyManuallyPaused: boolean;
    hotkeyFilterStatus: HotkeyFilterStatus;
    onTogglePauseHotkeys: () => void;
    backgroundImageEnabled: boolean;
    transparency: number;
    uiStyle: UIStyle;
}

export function BottomUtilityBar({
    currentTab,
    onTabChange,
    hotkeyManuallyPaused,
    hotkeyFilterStatus,
    onTogglePauseHotkeys,
    backgroundImageEnabled,
    transparency,
    uiStyle,
}: BottomUtilityBarProps) {
    const { t } = useTranslation();
    const isWin10 = uiStyle === "win10";
    const isPaused = hotkeyManuallyPaused || hotkeyFilterStatus.paused;
    const [isSignalsOpen, setIsSignalsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const {
        feed,
        isLoading,
        isRefreshing,
        error,
        unreadCount,
        refresh,
        markAllSeen,
    } = useSignalsFeed();

    useEffect(() => {
        if (!isSignalsOpen) return;
        markAllSeen();

        const handleOutsideClick = (e: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(e.target as Node)
            ) {
                setIsSignalsOpen(false);
            }
        };
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsSignalsOpen(false);
        };
        window.addEventListener("mousedown", handleOutsideClick);
        window.addEventListener("keydown", handleEsc);
        return () => {
            window.removeEventListener("mousedown", handleOutsideClick);
            window.removeEventListener("keydown", handleEsc);
        };
    }, [isSignalsOpen, markAllSeen]);

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

    const utilityTabs: Array<{
        id: NavTab;
        label: string;
        icon: typeof Sliders;
    }> = [
        {
            id: "hotkeys",
            label: t("nav.hotkeys"),
            icon: Keyboard,
        },
        {
            id: "routing",
            label: t("nav.routing"),
            icon: Sliders,
        },
        {
            id: "guide",
            label: t("nav.guide"),
            icon: HelpCircle,
        },
    ];

    return (
        <div ref={containerRef} className="relative flex flex-col items-end">
            {/* Signals Popover anchored above the Bottom Utility Bar */}
            <AnimatePresence>
                {isSignalsOpen && (
                    <div className="absolute bottom-full right-0 mb-3 z-50">
                        <SignalsPanel
                            feed={feed}
                            isLoading={isLoading}
                            isRefreshing={isRefreshing}
                            error={error}
                            onRefresh={refresh}
                            onClose={() => setIsSignalsOpen(false)}
                        />
                    </div>
                )}
            </AnimatePresence>

            <div
                data-tour="bottom-utility-bar"
                style={capsuleStyle}
                className={`pointer-events-auto flex items-center gap-1.5 p-1.5 rounded-full border select-none ${
                    isWin10
                        ? "border-[var(--border-subtle)] bg-[var(--bg-island)]"
                        : "border-[var(--border-card)] backdrop-blur-xl"
                }`}
            >
                {/* Pause / Resume Hotkeys Circular Icon Toggle */}
                <motion.button
                    type="button"
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={onTogglePauseHotkeys}
                    title={
                        isPaused
                            ? t("header.resumeHotkeysTitle")
                            : t("header.pauseHotkeysTitle")
                    }
                    aria-label={
                        isPaused
                            ? t("header.resumeHotkeysTitle")
                            : t("header.pauseHotkeysTitle")
                    }
                    className={`w-9 h-9 flex items-center justify-center rounded-full border transition-colors cursor-pointer shrink-0 ${
                        isPaused
                            ? "bg-amber-950/40 border-amber-700/80 text-amber-300 hover:bg-amber-950/60"
                            : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]"
                    }`}
                >
                    <Pause
                        className={`w-4 h-4 ${isPaused ? "fill-current" : ""}`}
                    />
                </motion.button>

                <div className="w-px h-5 bg-[var(--border-subtle)] mx-0.5 shrink-0" />

                {/* Circular Icon-Only Utility Navigation */}
                <nav
                    aria-label={t("nav.mainMenu")}
                    className="flex items-center gap-1"
                >
                    {utilityTabs.map((item) => {
                        const Icon = item.icon;
                        const isActive = currentTab === item.id;
                        return (
                            <motion.button
                                key={item.id}
                                type="button"
                                whileHover={{ scale: 1.06 }}
                                whileTap={{ scale: 0.92 }}
                                onClick={() => onTabChange(item.id)}
                                title={item.label}
                                aria-label={item.label}
                                className={`relative w-9 h-9 flex items-center justify-center rounded-full transition-colors cursor-pointer shrink-0 ${
                                    isActive
                                        ? ""
                                        : "bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]"
                                }`}
                                style={
                                    isActive
                                        ? { color: "var(--btn-primary-text)" }
                                        : undefined
                                }
                            >
                                {isActive && (
                                    <motion.span
                                        layoutId="bottomUtilityActivePill"
                                        transition={{
                                            type: "spring",
                                            stiffness: 460,
                                            damping: 34,
                                        }}
                                        className="absolute inset-0 rounded-full"
                                        style={{
                                            backgroundColor:
                                                "var(--btn-primary-bg)",
                                        }}
                                    />
                                )}
                                <Icon className="relative z-10 w-4 h-4 shrink-0" />
                            </motion.button>
                        );
                    })}
                </nav>

                <div className="w-px h-5 bg-[var(--border-subtle)] mx-0.5 shrink-0" />

                {/* Signals Notification Bell Circular Button */}
                <motion.button
                    type="button"
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setIsSignalsOpen((prev) => !prev)}
                    title={t("signals.buttonTitle")}
                    aria-label={t("signals.buttonTitle")}
                    aria-expanded={isSignalsOpen}
                    className={`relative w-9 h-9 flex items-center justify-center rounded-full border transition-colors cursor-pointer shrink-0 ${
                        isSignalsOpen
                            ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]"
                            : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]"
                    }`}
                >
                    <Bell className="w-4 h-4 shrink-0" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-[var(--accent)] text-[var(--btn-primary-text)] text-[10px] font-bold font-mono tabular-nums flex items-center justify-center leading-none border border-[var(--bg-island)]">
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                    )}
                </motion.button>
            </div>
        </div>
    );
}
