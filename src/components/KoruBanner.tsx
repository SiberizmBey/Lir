import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Smartphone } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "../i18n";

const KORU_URL = "https://koru.anticvalley.com.tr";
const KORU_ICON = "https://labs.anticvalley.com.tr/assets/img/koru.png";
const LIR_ANDROID_URL = "https://lirandroid.anticvalley.com.tr";

const ROTATE_INTERVAL = 7000;

type BannerSlide = {
    id: "koru" | "mobile";
    url: string;
    keyPrefix: string;
    icon: "koru" | "mobile";
};

const SLIDES: BannerSlide[] = [
    {
        id: "koru",
        url: KORU_URL,
        keyPrefix: "koruBanner",
        icon: "koru",
    },
    {
        id: "mobile",
        url: LIR_ANDROID_URL,
        keyPrefix: "mobileBanner",
        icon: "mobile",
    },
];

export function KoruBanner() {
    const { t } = useTranslation();
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

    const slideCount = SLIDES.length;

    const goToNext = useCallback(() => {
        setActiveIndex((current) => (current + 1) % slideCount);
    }, [slideCount]);

    useEffect(() => {
        if (isPaused || slideCount < 2) return;
        const timer = window.setInterval(goToNext, ROTATE_INTERVAL);
        return () => window.clearInterval(timer);
    }, [goToNext, isPaused, slideCount]);

    const slides = useMemo(
        () =>
            SLIDES.map((slide) => ({
                ...slide,
                badge: t(`${slide.keyPrefix}.badge`),
                title: t(`${slide.keyPrefix}.title`),
                subtitle: t(`${slide.keyPrefix}.subtitle`),
                cta: t(`${slide.keyPrefix}.cta`),
            })),
        [t],
    );

    return (
        <div
            className="flex flex-col gap-2"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onFocusCapture={() => setIsPaused(true)}
            onBlurCapture={() => setIsPaused(false)}
        >
            <div
                className="relative grid overflow-hidden app-card ui-card border border-[var(--accent-border)] bg-[var(--bg-card)]"
                aria-roledescription="carousel"
                aria-label={t("koruBanner.carouselLabel")}
            >
                {slides.map((slide, index) => {
                    const isActive = index === activeIndex;
                    return (
                        <motion.a
                            key={slide.id}
                            href={slide.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-hidden={!isActive}
                            tabIndex={isActive ? 0 : -1}
                            className="group relative col-start-1 row-start-1 flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:gap-4 transition-colors hover:bg-[var(--bg-card-hover)]"
                            initial={false}
                            animate={{
                                opacity: isActive ? 1 : 0,
                                x: isActive ? 0 : -12,
                            }}
                            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                            style={{ pointerEvents: isActive ? "auto" : "none" }}
                        >
                            <div
                                aria-hidden="true"
                                className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-[var(--accent-subtle)] opacity-70 blur-2xl"
                            />

                            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center ui-inner border border-[var(--border-subtle)] bg-[var(--bg-inner)] p-2 text-[var(--accent-text)]">
                                {slide.icon === "koru" ? (
                                    <img
                                        src={KORU_ICON}
                                        alt="Koru"
                                        className="h-full w-full object-contain"
                                        loading="lazy"
                                    />
                                ) : (
                                    <Smartphone className="h-6 w-6" />
                                )}
                            </span>

                            <div className="relative min-w-0 flex-1">
                                <span className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-[var(--accent-text)]">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                                    {slide.badge}
                                </span>
                                <p className="text-sm font-semibold leading-snug text-[var(--text-primary)]">
                                    {slide.title}
                                </p>
                                <p className="mt-0.5 text-xs leading-snug text-[var(--text-secondary)]">
                                    {slide.subtitle}
                                </p>
                            </div>

                            <span className="relative hidden shrink-0 items-center gap-1.5 ui-control border border-[var(--accent-border)] bg-[var(--accent-subtle)] px-3.5 py-2 text-xs font-semibold text-[var(--accent-text)] transition-colors group-hover:bg-[var(--accent)] group-hover:text-[var(--btn-primary-text)] sm:inline-flex">
                                {slide.cta}
                                <ArrowUpRight className="h-3.5 w-3.5" />
                            </span>
                        </motion.a>
                    );
                })}
            </div>

            <div className="flex items-center justify-center gap-1.5">
                {slides.map((slide, index) => {
                    const isActive = index === activeIndex;
                    return (
                        <button
                            key={slide.id}
                            type="button"
                            onClick={() => setActiveIndex(index)}
                            aria-label={slide.title}
                            aria-current={isActive}
                            className={`h-1.5 rounded-full transition-all cursor-pointer ${
                                isActive
                                    ? "w-5 bg-[var(--accent)]"
                                    : "w-1.5 bg-[var(--border-hover)] hover:bg-[var(--text-muted)]"
                            }`}
                        />
                    );
                })}
            </div>
        </div>
    );
}
