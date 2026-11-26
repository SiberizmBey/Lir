import { useMemo, useState } from "react";
import {
    AudioWaveform,
    Disc3,
    HelpCircle,
    Keyboard,
    Mic,
    Palette,
    ScanText,
    Scissors,
    Sliders,
    Smartphone,
    Volume2,
} from "lucide-react";
import { useTranslation } from "../i18n";

type GuideCategory = "all" | "audio" | "makerMusic" | "hotkeysTranslator" | "mobileTheme";

interface GuideModuleItem {
    id: string;
    category: Exclude<GuideCategory, "all">;
    icon: React.ComponentType<{ className?: string }>;
    titleKey: string;
    summaryKey: string;
    points: string[];
}

export function GuideView() {
    const { t } = useTranslation();
    const [activeCategory, setActiveCategory] = useState<GuideCategory>("all");

    const filterTabs: Array<{ id: GuideCategory; label: string }> = [
        { id: "all", label: t("guide.tabAll") },
        { id: "audio", label: t("guide.tabAudio") },
        { id: "makerMusic", label: t("guide.tabMakerMusic") },
        { id: "hotkeysTranslator", label: t("guide.tabHotkeysTranslator") },
        { id: "mobileTheme", label: t("guide.tabMobileTheme") },
    ];

    const modules = useMemo<GuideModuleItem[]>(
        () => [
            {
                id: "soundboard-routing",
                category: "audio",
                icon: Volume2,
                titleKey: "guide.modSoundboardTitle",
                summaryKey: "guide.modSoundboardSummary",
                points: [
                    "guide.modSoundboardP1",
                    "guide.modSoundboardP2",
                    "guide.modSoundboardP3",
                ],
            },
            {
                id: "voice-recorder",
                category: "audio",
                icon: AudioWaveform,
                titleKey: "guide.modVoiceTitle",
                summaryKey: "guide.modVoiceSummary",
                points: [
                    "guide.modVoiceP1",
                    "guide.modVoiceP2",
                    "guide.modVoiceP3",
                ],
            },
            {
                id: "makara",
                category: "makerMusic",
                icon: Scissors,
                titleKey: "guide.modMakaraTitle",
                summaryKey: "guide.modMakaraSummary",
                points: [
                    "guide.modMakaraP1",
                    "guide.modMakaraP2",
                    "guide.modMakaraP3",
                ],
            },
            {
                id: "spotify-youtube",
                category: "makerMusic",
                icon: Disc3,
                titleKey: "guide.modMusicTitle",
                summaryKey: "guide.modMusicSummary",
                points: [
                    "guide.modMusicP1",
                    "guide.modMusicP2",
                    "guide.modMusicP3",
                ],
            },
            {
                id: "hotkeys-filter",
                category: "hotkeysTranslator",
                icon: Keyboard,
                titleKey: "guide.modHotkeysTitle",
                summaryKey: "guide.modHotkeysSummary",
                points: [
                    "guide.modHotkeysP1",
                    "guide.modHotkeysP2",
                    "guide.modHotkeysP3",
                ],
            },
            {
                id: "subtitle-translator",
                category: "hotkeysTranslator",
                icon: ScanText,
                titleKey: "guide.modTranslatorTitle",
                summaryKey: "guide.modTranslatorSummary",
                points: [
                    "guide.modTranslatorP1",
                    "guide.modTranslatorP2",
                    "guide.modTranslatorP3",
                ],
            },
            {
                id: "mobile-remote",
                category: "mobileTheme",
                icon: Smartphone,
                titleKey: "guide.modRemoteTitle",
                summaryKey: "guide.modRemoteSummary",
                points: [
                    "guide.modRemoteP1",
                    "guide.modRemoteP2",
                    "guide.modRemoteP3",
                ],
            },
            {
                id: "themes-rpc",
                category: "mobileTheme",
                icon: Palette,
                titleKey: "guide.modAppearanceTitle",
                summaryKey: "guide.modAppearanceSummary",
                points: [
                    "guide.modAppearanceP1",
                    "guide.modAppearanceP2",
                    "guide.modAppearanceP3",
                ],
            },
        ],
        [],
    );

    const visibleModules = useMemo(
        () =>
            activeCategory === "all"
                ? modules
                : modules.filter((m) => m.category === activeCategory),
        [activeCategory, modules],
    );

    const setupSteps = [
        { num: "01", titleKey: "guide.step1Title", descKey: "guide.step1Desc" },
        { num: "02", titleKey: "guide.step2Title", descKey: "guide.step2Desc" },
        { num: "03", titleKey: "guide.step3Title", descKey: "guide.step3Desc" },
        { num: "04", titleKey: "guide.step4Title", descKey: "guide.step4Desc" },
        { num: "05", titleKey: "guide.step5Title", descKey: "guide.step5Desc" },
    ];

    const quickKeys = [
        { keycap: "Space", descKey: "guide.keySpaceDesc" },
        { keycap: "Ctrl + Shift + Y", descKey: "guide.keyOverlayDesc" },
        { keycap: "F1 – F12 / Ctrl+...", descKey: "guide.keyTriggerDesc" },
        { keycap: "Stop All", descKey: "guide.keyStopAllDesc" },
    ];

    return (
        <div className="flex-1 flex flex-col gap-5 w-full">
            {/* Page Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3.5">
                    <div className="w-11 h-11 ui-inner bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
                        <HelpCircle className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                            {t("guide.title")}
                        </h1>
                        <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] mt-0.5">
                            {t("guide.subtitle")}
                        </p>
                    </div>
                </div>

                {/* Category Filter Tabs */}
                <div className="inline-flex flex-wrap items-center p-1 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] gap-1 self-start lg:self-auto">
                    {filterTabs.map((tab) => {
                        const isActive = activeCategory === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveCategory(tab.id)}
                                className={`px-3 py-1.5 ui-control text-xs font-semibold transition-colors cursor-pointer ${
                                    isActive
                                        ? "btn-accent"
                                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                }`}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* First-Time Audio & Discord Setup Checklist */}
            {(activeCategory === "all" || activeCategory === "audio") && (
                <section className="app-card ui-card border border-[var(--border-card)] overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-inner)] flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Sliders className="w-4 h-4 text-[var(--accent-text)]" />
                            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                                {t("guide.gameSetupTitle")}
                            </h2>
                        </div>
                        <span className="text-xs font-mono tabular-nums text-[var(--text-muted)]">
                            5 {t("guide.stepsCountLabel")}
                        </span>
                    </div>

                    <div className="divide-y divide-[var(--border-subtle)]">
                        {setupSteps.map((step) => (
                            <div
                                key={step.num}
                                className="px-5 py-3.5 flex items-start gap-3.5 text-xs sm:text-[13px] hover:bg-[var(--bg-card-hover)] transition-colors"
                            >
                                <span className="font-mono tabular-nums font-bold text-[var(--accent-text)] pt-0.5 shrink-0">
                                    {step.num}
                                </span>
                                <div className="min-w-0 leading-relaxed text-[var(--text-secondary)]">
                                    <strong className="text-[var(--text-primary)] font-semibold">
                                        {t(step.titleKey)}
                                    </strong>{" "}
                                    {t(step.descKey)}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Feature Modules Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                {visibleModules.map((mod) => {
                    const Icon = mod.icon;
                    return (
                        <section
                            key={mod.id}
                            className="app-card ui-card border border-[var(--border-card)] p-5 flex flex-col gap-3"
                        >
                            <div className="flex items-start gap-3">
                                <div className="w-9 h-9 ui-inner bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
                                    <Icon className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                                        {t(mod.titleKey)}
                                    </h3>
                                    <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                                        {t(mod.summaryKey)}
                                    </p>
                                </div>
                            </div>

                            <ul className="flex flex-col gap-2 pt-2 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] leading-relaxed">
                                {mod.points.map((pointKey) => (
                                    <li key={pointKey} className="flex items-start gap-2">
                                        <span className="text-[var(--accent-text)] font-bold shrink-0">
                                            ·
                                        </span>
                                        <span>{t(pointKey)}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    );
                })}
            </div>

            {/* Key Combinations Reference */}
            <section className="app-card ui-card border border-[var(--border-card)] p-5 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-[var(--accent-text)]" />
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                        {t("guide.shortcutsRefTitle")}
                    </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {quickKeys.map((item) => (
                        <div
                            key={item.keycap}
                            className="flex items-center justify-between gap-3 px-3.5 py-2.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)]"
                        >
                            <span className="text-xs text-[var(--text-secondary)]">
                                {t(item.descKey)}
                            </span>
                            <kbd className="px-2 py-0.5 ui-control bg-[var(--bg-card)] border border-[var(--border-subtle)] font-mono text-[11px] font-semibold text-[var(--text-primary)] shrink-0">
                                {item.keycap}
                            </kbd>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
