import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export interface LirSelectOption {
    value: string;
    label: string;
    sublabel?: string;
    meta?: string;
    hotkey?: string;
    group?: string;
    icon?: ReactNode;
    keywords?: string;
}

interface LirSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: LirSelectOption[];
    placeholder?: string;
    searchable?: boolean;
    searchPlaceholder?: string;
    emptyMessage?: string;
    disabled?: boolean;
    className?: string;
    buttonClassName?: string;
    dropdownFooter?: ReactNode;
    headerAction?: ReactNode;
    ariaLabel?: string;
}

export function LirSelect({
    value,
    onChange,
    options,
    placeholder = "Seçin...",
    searchable = false,
    searchPlaceholder = "Ara...",
    emptyMessage = "Sonuç bulunamadı.",
    disabled = false,
    className = "",
    buttonClassName = "",
    dropdownFooter,
    headerAction,
    ariaLabel,
}: LirSelectProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [highlightedIdx, setHighlightedIdx] = useState(0);

    const rootRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);

    const selectedOption = useMemo(
        () => options.find((opt) => opt.value === value) || null,
        [options, value],
    );

    const filteredOptions = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter((opt) => {
            const haystack = [
                opt.label,
                opt.sublabel,
                opt.meta,
                opt.hotkey,
                opt.group,
                opt.keywords,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return haystack.includes(q);
        });
    }, [options, query]);

    // Group options while preserving order of groups as they first appear
    const groupedSections = useMemo(() => {
        const sections: Array<{ group: string; items: LirSelectOption[] }> = [];
        const map = new Map<string, LirSelectOption[]>();

        for (const opt of filteredOptions) {
            const groupKey = opt.group || "";
            let bucket = map.get(groupKey);
            if (!bucket) {
                bucket = [];
                map.set(groupKey, bucket);
                sections.push({ group: groupKey, items: bucket });
            }
            bucket.push(opt);
        }
        return sections;
    }, [filteredOptions]);

    const flatVisibleOptions = useMemo(
        () => groupedSections.flatMap((s) => s.items),
        [groupedSections],
    );

    useEffect(() => {
        if (!open) {
            setQuery("");
            return;
        }
        const selectedIndex = flatVisibleOptions.findIndex((o) => o.value === value);
        setHighlightedIdx(selectedIndex >= 0 ? selectedIndex : 0);

        if (searchable) {
            const timer = window.setTimeout(() => {
                searchInputRef.current?.focus();
            }, 30);
            return () => window.clearTimeout(timer);
        }
    }, [open, searchable]);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setOpen(false);
            }
        };
        window.addEventListener("mousedown", onPointerDown);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("mousedown", onPointerDown);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    const handleSelect = (optValue: string) => {
        onChange(optValue);
        setOpen(false);
    };

    const handleKeyNavigation = (e: React.KeyboardEvent) => {
        if (!open) {
            if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (!disabled) setOpen(true);
            }
            return;
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedIdx((prev) =>
                flatVisibleOptions.length === 0
                    ? 0
                    : (prev + 1) % flatVisibleOptions.length,
            );
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedIdx((prev) =>
                flatVisibleOptions.length === 0
                    ? 0
                    : (prev - 1 + flatVisibleOptions.length) % flatVisibleOptions.length,
            );
        } else if (e.key === "Enter") {
            const chosen = flatVisibleOptions[highlightedIdx];
            if (chosen) {
                e.preventDefault();
                handleSelect(chosen.value);
            }
        }
    };

    let runningFlatIndex = -1;

    return (
        <div
            ref={rootRef}
            className={`relative ${open ? "z-50" : "z-10"} ${className}`}
            onKeyDown={handleKeyNavigation}
        >
            <button
                type="button"
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={ariaLabel}
                onClick={() => !disabled && setOpen((prev) => !prev)}
                className={`w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 ui-input bg-[var(--bg-input)] border text-left transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    open
                        ? "border-[var(--accent)] ring-1 ring-[var(--accent-border)]"
                        : "border-[var(--border-input)] hover:border-[var(--border-hover)]"
                } ${buttonClassName}`}
            >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {selectedOption?.icon && (
                        <span className="shrink-0 text-[var(--accent-text)] flex items-center">
                            {selectedOption.icon}
                        </span>
                    )}
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                        <span
                            className={`text-sm truncate ${
                                selectedOption
                                    ? "text-[var(--text-primary)] font-medium"
                                    : "text-[var(--text-muted)]"
                            }`}
                        >
                            {selectedOption ? selectedOption.label : placeholder}
                        </span>
                        {selectedOption?.sublabel && (
                            <span className="hidden sm:inline text-xs text-[var(--text-muted)] truncate">
                                · {selectedOption.sublabel}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {selectedOption?.meta && (
                        <span className="text-[11px] font-mono tabular-nums text-[var(--text-secondary)]">
                            {selectedOption.meta}
                        </span>
                    )}
                    {selectedOption?.hotkey && (
                        <kbd className="px-1.5 py-0.5 text-[10px] font-mono uppercase ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                            {selectedOption.hotkey}
                        </kbd>
                    )}
                    <ChevronDown
                        className={`w-4 h-4 text-[var(--text-secondary)] transition-transform duration-150 ${
                            open ? "rotate-180 text-[var(--accent-text)]" : ""
                        }`}
                    />
                </div>
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.99 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.99 }}
                        transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                        role="listbox"
                        className="absolute left-0 right-0 mt-1.5 ui-card bg-[var(--bg-card)] border border-[var(--border-card)] shadow-2xl overflow-hidden backdrop-blur-xl"
                    >
                        {(searchable || headerAction) && (
                            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-inner)]">
                                {searchable && (
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            value={query}
                                            onChange={(e) => {
                                                setQuery(e.target.value);
                                                setHighlightedIdx(0);
                                            }}
                                            placeholder={searchPlaceholder}
                                            className="w-full bg-transparent text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
                                        />
                                        {query && (
                                            <button
                                                type="button"
                                                onClick={() => setQuery("")}
                                                className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                )}
                                {headerAction && (
                                    <div className="shrink-0">{headerAction}</div>
                                )}
                            </div>
                        )}

                        <div
                            ref={listRef}
                            className="max-h-72 overflow-y-auto py-1 divide-y divide-[var(--border-subtle)]/40"
                        >
                            {flatVisibleOptions.length === 0 ? (
                                <div className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">
                                    {emptyMessage}
                                </div>
                            ) : (
                                groupedSections.map((section) => (
                                    <div key={section.group || "__ungrouped"} className="py-1">
                                        {section.group && (
                                            <div className="px-3.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                                                {section.group}
                                            </div>
                                        )}
                                        <div className="flex flex-col gap-0.5 px-1.5">
                                            {section.items.map((opt) => {
                                                runningFlatIndex += 1;
                                                const flatIndex = runningFlatIndex;
                                                const isSelected = opt.value === value;
                                                const isHighlighted = flatIndex === highlightedIdx;

                                                return (
                                                    <button
                                                        key={opt.value}
                                                        type="button"
                                                        role="option"
                                                        aria-selected={isSelected}
                                                        onMouseEnter={() =>
                                                            setHighlightedIdx(flatIndex)
                                                        }
                                                        onClick={() => handleSelect(opt.value)}
                                                        className={`w-full flex items-center justify-between gap-3 px-2.5 py-2 ui-inner text-left transition-colors cursor-pointer ${
                                                            isSelected
                                                                ? "bg-[var(--accent-subtle)] text-[var(--text-primary)]"
                                                                : isHighlighted
                                                                  ? "bg-[var(--bg-card-hover)] text-[var(--text-primary)]"
                                                                  : "text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                            <span
                                                                className={`w-4 h-4 flex items-center justify-center shrink-0 ${
                                                                    isSelected
                                                                        ? "text-[var(--accent-text)]"
                                                                        : "text-[var(--text-muted)]"
                                                                }`}
                                                            >
                                                                {isSelected ? (
                                                                    <Check className="w-3.5 h-3.5" />
                                                                ) : (
                                                                    opt.icon || null
                                                                )}
                                                            </span>
                                                            <div className="min-w-0 flex-1">
                                                                <p
                                                                    className={`text-xs sm:text-[13px] truncate ${
                                                                        isSelected
                                                                            ? "font-semibold text-[var(--accent-text)]"
                                                                            : "font-medium text-[var(--text-primary)]"
                                                                    }`}
                                                                >
                                                                    {opt.label}
                                                                </p>
                                                                {opt.sublabel && (
                                                                    <p className="text-[11px] text-[var(--text-muted)] truncate">
                                                                        {opt.sublabel}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2 shrink-0">
                                                            {opt.meta && (
                                                                <span className="text-[11px] font-mono tabular-nums text-[var(--text-secondary)]">
                                                                    {opt.meta}
                                                                </span>
                                                            )}
                                                            {opt.hotkey && (
                                                                <kbd className="px-1.5 py-0.5 text-[10px] font-mono uppercase ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                                                                    {opt.hotkey}
                                                                </kbd>
                                                            )}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {dropdownFooter && (
                            <div className="px-3 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-inner)] text-[11px] text-[var(--text-muted)]">
                                {dropdownFooter}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
