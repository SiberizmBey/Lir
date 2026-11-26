import { useEffect, useId, useLayoutEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from "lucide-react";
import { NavTab } from "./Sidebar";
import { useTranslation } from "../i18n";

export interface TourStepDefinition {
    selector: string;
    tab: NavTab;
    expandSidebar?: boolean;
    titleKey: string;
    descKey: string;
    preferredPlacement?: "top" | "bottom" | "left" | "right";
}

export const TOUR_STEPS: TourStepDefinition[] = [
    {
        selector: '[data-tour="dynamic-island"]',
        tab: "soundboard",
        titleKey: "tour.step1Title",
        descKey: "tour.step1Desc",
        preferredPlacement: "bottom",
    },
    {
        selector: '[data-tour="header-actions"]',
        tab: "soundboard",
        titleKey: "tour.step2Title",
        descKey: "tour.step2Desc",
        preferredPlacement: "bottom",
    },
    {
        selector: '[data-tour="soundboard-controls"]',
        tab: "soundboard",
        titleKey: "tour.step3Title",
        descKey: "tour.step3Desc",
        preferredPlacement: "bottom",
    },
    {
        selector: '[data-tour="sidebar-nav"]',
        tab: "soundboard",
        expandSidebar: true,
        titleKey: "tour.step4Title",
        descKey: "tour.step4Desc",
        preferredPlacement: "right",
    },
    {
        selector: '[data-tour="sidebar-tab-maker"]',
        tab: "maker",
        expandSidebar: true,
        titleKey: "tour.step5Title",
        descKey: "tour.step5Desc",
        preferredPlacement: "right",
    },
    {
        selector: '[data-tour="sidebar-tab-spotify"]',
        tab: "spotify",
        expandSidebar: true,
        titleKey: "tour.step6Title",
        descKey: "tour.step6Desc",
        preferredPlacement: "right",
    },
    {
        selector: '[data-tour="sidebar-tab-recorder"]',
        tab: "recorder",
        expandSidebar: true,
        titleKey: "tour.step7Title",
        descKey: "tour.step7Desc",
        preferredPlacement: "right",
    },
    {
        selector: '[data-tour="sidebar-tab-voice"]',
        tab: "voice",
        expandSidebar: true,
        titleKey: "tour.step8Title",
        descKey: "tour.step8Desc",
        preferredPlacement: "right",
    },
    {
        selector: '[data-tour="sidebar-tab-translator"]',
        tab: "translator",
        expandSidebar: true,
        titleKey: "tour.step9Title",
        descKey: "tour.step9Desc",
        preferredPlacement: "right",
    },
    {
        selector: '[data-tour="bottom-utility-bar"]',
        tab: "soundboard",
        titleKey: "tour.step10Title",
        descKey: "tour.step10Desc",
        preferredPlacement: "top",
    },
    {
        selector: '[data-tour="sidebar-settings"]',
        tab: "settings",
        titleKey: "tour.step11Title",
        descKey: "tour.step11Desc",
        preferredPlacement: "right",
    },
];

interface SpotlightTourProps {
    isOpen: boolean;
    currentStepIndex: number;
    onStepChange: (index: number) => void;
    onClose: () => void;
    onNavigateTab: (tab: NavTab) => void;
    onSetSidebarExpanded: (expanded: boolean) => void;
}

interface SpotlightRect {
    left: number;
    top: number;
    width: number;
    height: number;
    radius: number;
}

const POPOVER_WIDTH = 350;
const POPOVER_EST_HEIGHT = 210;
const VIEWPORT_MARGIN = 16;
const SPOTLIGHT_PADDING = 8;

export function SpotlightTour({
    isOpen,
    currentStepIndex,
    onStepChange,
    onClose,
    onNavigateTab,
    onSetSidebarExpanded,
}: SpotlightTourProps) {
    const { t } = useTranslation();
    const maskId = useId();
    const [targetRect, setTargetRect] = useState<SpotlightRect | null>(null);
    const [viewport, setViewport] = useState(() => ({
        w: typeof window !== "undefined" ? window.innerWidth : 1280,
        h: typeof window !== "undefined" ? window.innerHeight : 800,
    }));

    const safeIndex = Math.max(0, Math.min(TOUR_STEPS.length - 1, currentStepIndex));
    const step = TOUR_STEPS[safeIndex];

    // Navigate tab + expand sidebar when step activates
    useEffect(() => {
        if (!isOpen) {
            onSetSidebarExpanded(false);
            return;
        }
        onNavigateTab(step.tab);
        onSetSidebarExpanded(Boolean(step.expandSidebar));
    }, [isOpen, safeIndex, step.tab, step.expandSidebar, onNavigateTab, onSetSidebarExpanded]);

    // Measure target element continuously during spring transitions
    useLayoutEffect(() => {
        if (!isOpen) return;

        let activeEl: Element | null = null;
        let resizeObserver: ResizeObserver | null = null;

        const measure = () => {
            setViewport({ w: window.innerWidth, h: window.innerHeight });
            const el = document.querySelector(step.selector);
            if (!el) {
                setTargetRect(null);
                return;
            }
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const computed = window.getComputedStyle(el);
            const rawRadius = parseFloat(computed.borderRadius) || 14;
            const radius = Math.min(
                28,
                Math.max(8, rawRadius + SPOTLIGHT_PADDING / 2),
            );
            setTargetRect({
                left: rect.left - SPOTLIGHT_PADDING,
                top: rect.top - SPOTLIGHT_PADDING,
                width: rect.width + SPOTLIGHT_PADDING * 2,
                height: rect.height + SPOTLIGHT_PADDING * 2,
                radius,
            });

            if (el !== activeEl) {
                activeEl = el;
                resizeObserver?.disconnect();
                resizeObserver = new ResizeObserver(measure);
                resizeObserver.observe(el);
            }
        };

        measure();
        const raf = window.requestAnimationFrame(measure);
        const t1 = window.setTimeout(measure, 90);
        const t2 = window.setTimeout(measure, 230);
        const t3 = window.setTimeout(measure, 420);

        window.addEventListener("resize", measure);
        window.addEventListener("scroll", measure, true);

        return () => {
            window.cancelAnimationFrame(raf);
            window.clearTimeout(t1);
            window.clearTimeout(t2);
            window.clearTimeout(t3);
            resizeObserver?.disconnect();
            window.removeEventListener("resize", measure);
            window.removeEventListener("scroll", measure, true);
        };
    }, [isOpen, safeIndex, step.selector]);

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            } else if (e.key === "ArrowRight" || e.key === "Enter") {
                e.preventDefault();
                if (safeIndex >= TOUR_STEPS.length - 1) {
                    onClose();
                } else {
                    onStepChange(safeIndex + 1);
                }
            } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                if (safeIndex > 0) {
                    onStepChange(safeIndex - 1);
                }
            }
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [isOpen, safeIndex, onStepChange, onClose]);

    if (!isOpen) return null;

    // Compute smart popover coordinates clamped cleanly inside the viewport
    const cardWidth = Math.min(POPOVER_WIDTH, viewport.w - VIEWPORT_MARGIN * 2);
    let cardLeft = (viewport.w - cardWidth) / 2;
    let cardTop = (viewport.h - POPOVER_EST_HEIGHT) / 2;

    if (targetRect) {
        const gap = 14;
        const spaceRight = viewport.w - (targetRect.left + targetRect.width);
        const spaceBottom = viewport.h - (targetRect.top + targetRect.height);
        const spaceTop = targetRect.top;
        const spaceLeft = targetRect.left;

        const pref = step.preferredPlacement || "bottom";

        if (pref === "right" && spaceRight >= cardWidth + gap + VIEWPORT_MARGIN) {
            cardLeft = targetRect.left + targetRect.width + gap;
            cardTop = targetRect.top + targetRect.height / 2 - POPOVER_EST_HEIGHT / 2;
        } else if (
            pref === "left" &&
            spaceLeft >= cardWidth + gap + VIEWPORT_MARGIN
        ) {
            cardLeft = targetRect.left - cardWidth - gap;
            cardTop = targetRect.top + targetRect.height / 2 - POPOVER_EST_HEIGHT / 2;
        } else if (
            pref === "top" &&
            spaceTop >= POPOVER_EST_HEIGHT + gap + VIEWPORT_MARGIN
        ) {
            cardLeft = targetRect.left + targetRect.width / 2 - cardWidth / 2;
            cardTop = targetRect.top - POPOVER_EST_HEIGHT - gap;
        } else if (spaceBottom >= POPOVER_EST_HEIGHT + gap + VIEWPORT_MARGIN) {
            cardLeft = targetRect.left + targetRect.width / 2 - cardWidth / 2;
            cardTop = targetRect.top + targetRect.height + gap;
        } else if (spaceTop >= POPOVER_EST_HEIGHT + gap + VIEWPORT_MARGIN) {
            cardLeft = targetRect.left + targetRect.width / 2 - cardWidth / 2;
            cardTop = targetRect.top - POPOVER_EST_HEIGHT - gap;
        } else if (spaceRight >= cardWidth + gap + VIEWPORT_MARGIN) {
            cardLeft = targetRect.left + targetRect.width + gap;
            cardTop = targetRect.top;
        } else {
            cardLeft = (viewport.w - cardWidth) / 2;
            cardTop = Math.max(
                VIEWPORT_MARGIN,
                Math.min(
                    viewport.h - POPOVER_EST_HEIGHT - VIEWPORT_MARGIN,
                    targetRect.top + targetRect.height + gap,
                ),
            );
        }

        cardLeft = Math.max(
            VIEWPORT_MARGIN,
            Math.min(viewport.w - cardWidth - VIEWPORT_MARGIN, cardLeft),
        );
        cardTop = Math.max(
            VIEWPORT_MARGIN,
            Math.min(viewport.h - POPOVER_EST_HEIGHT - VIEWPORT_MARGIN, cardTop),
        );
    }

    const isLastStep = safeIndex === TOUR_STEPS.length - 1;

    return (
        <div
            className="fixed inset-0 z-[90] pointer-events-auto select-none"
            role="dialog"
            aria-modal="true"
            aria-label={t(step.titleKey)}
        >
            {/* Darkened Backdrop with Animated SVG Cutout */}
            <svg
                className="absolute inset-0 w-full h-full pointer-events-auto"
                width={viewport.w}
                height={viewport.h}
            >
                <defs>
                    <mask id={maskId}>
                        <rect
                            x="0"
                            y="0"
                            width={viewport.w}
                            height={viewport.h}
                            fill="white"
                        />
                        {targetRect && (
                            <motion.rect
                                initial={false}
                                animate={{
                                    x: targetRect.left,
                                    y: targetRect.top,
                                    width: targetRect.width,
                                    height: targetRect.height,
                                    rx: targetRect.radius,
                                    ry: targetRect.radius,
                                }}
                                transition={{
                                    type: "spring",
                                    stiffness: 380,
                                    damping: 32,
                                }}
                                fill="black"
                            />
                        )}
                    </mask>
                </defs>
                <rect
                    x="0"
                    y="0"
                    width={viewport.w}
                    height={viewport.h}
                    fill="rgba(4, 4, 8, 0.72)"
                    mask={`url(#${maskId})`}
                />
            </svg>

            {/* Glowing Accent Focus Ring Around Target */}
            {targetRect && (
                <motion.div
                    initial={false}
                    animate={{
                        left: targetRect.left,
                        top: targetRect.top,
                        width: targetRect.width,
                        height: targetRect.height,
                        borderRadius: targetRect.radius,
                    }}
                    transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 32,
                    }}
                    className="pointer-events-none fixed border-2 border-[var(--accent)]"
                    style={{
                        boxShadow:
                            "0 0 0 4px rgba(var(--accent-rgb), 0.18), 0 0 28px rgba(var(--accent-rgb), 0.28)",
                    }}
                />
            )}

            {/* Floating Step Popover */}
            <motion.div
                initial={false}
                animate={{
                    left: cardLeft,
                    top: cardTop,
                }}
                transition={{
                    type: "spring",
                    stiffness: 360,
                    damping: 30,
                }}
                style={{ width: cardWidth }}
                className="fixed z-10 ui-modal bg-[var(--bg-modal)] border border-[var(--accent-border)] p-5 shadow-2xl flex flex-col gap-3.5"
            >
                <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 ui-control bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[11px] font-mono font-semibold text-[var(--accent-text)]">
                        <Sparkles className="w-3 h-3" />
                        <span>
                            {t("tour.stepCounter", {
                                current: safeIndex + 1,
                                total: TOUR_STEPS.length,
                            })}
                        </span>
                    </span>

                    <button
                        type="button"
                        onClick={onClose}
                        className="flex items-center gap-1 px-2 py-1 ui-control text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-inner)] transition-colors cursor-pointer"
                    >
                        <span>{t("tour.skip")}</span>
                        <X className="w-3 h-3" />
                    </button>
                </div>

                {/* Progress Bar */}
                <div className="h-1 w-full bg-[var(--bg-inner)] rounded-full overflow-hidden">
                    <motion.div
                        initial={false}
                        animate={{
                            width: `${((safeIndex + 1) / TOUR_STEPS.length) * 100}%`,
                        }}
                        transition={{ duration: 0.25 }}
                        className="h-full bg-[var(--accent)]"
                    />
                </div>

                <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={safeIndex}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18 }}
                        className="flex flex-col gap-1.5"
                    >
                        <h3 className="text-sm font-bold text-[var(--text-primary)] leading-snug">
                            {t(step.titleKey)}
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                            {t(step.descKey)}
                        </p>
                    </motion.div>
                </AnimatePresence>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
                    <button
                        type="button"
                        disabled={safeIndex === 0}
                        onClick={() => onStepChange(safeIndex - 1)}
                        className="flex items-center gap-1 px-3 py-1.5 ui-control bg-[var(--bg-inner)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>{t("tour.back")}</span>
                    </button>

                    <motion.button
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                            if (isLastStep) {
                                onClose();
                            } else {
                                onStepChange(safeIndex + 1);
                            }
                        }}
                        className="btn-accent flex items-center gap-1.5 px-3.5 py-1.5 ui-control text-xs font-semibold cursor-pointer"
                    >
                        <span>
                            {isLastStep ? t("tour.finish") : t("tour.next")}
                        </span>
                        {isLastStep ? (
                            <Check className="w-3.5 h-3.5" />
                        ) : (
                            <ArrowRight className="w-3.5 h-3.5" />
                        )}
                    </motion.button>
                </div>
            </motion.div>
        </div>
    );
}
