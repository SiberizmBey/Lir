import { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { Keyboard, X, Check, AlertCircle } from "lucide-react";
import { HotkeyTarget } from "../types/sound";

export interface ExistingHotkeyBinding {
    targetKey: string;
    label: string;
    hotkey: string;
}

interface HotkeyModalProps {
    target: HotkeyTarget | null;
    existingBindings: ExistingHotkeyBinding[];
    onClose: () => void;
    onSaveHotkey: (target: HotkeyTarget, newHotkey: string) => void;
}

const getTargetKey = (t: HotkeyTarget) => {
    if (t.kind === "sound") return `sound:${t.id}`;
    if (t.kind === "voice-preset") return `voice-preset:${t.presetId}`;
    return "voice-toggle";
};

const normalizeShortcutString = (raw: string) =>
    raw
        .trim()
        .toUpperCase()
        .replace(/^ESCAPE$/, "ESC")
        .replace(/\bNUMPAD\s+([0-9])\b/g, "NUMPAD$1");

export function HotkeyModal({
    target,
    existingBindings,
    onClose,
    onSaveHotkey,
}: HotkeyModalProps) {
    const [currentHotkey, setCurrentHotkey] = useState(target?.hotkey || "");

    useEffect(() => {
        if (target) {
            setCurrentHotkey(target.hotkey);
        }
    }, [target]);

    const conflictBinding = useMemo(() => {
        if (!currentHotkey || !target) return null;
        const normalizedCurrent = normalizeShortcutString(currentHotkey);
        const selfKey = getTargetKey(target);
        return (
            existingBindings.find(
                (b) =>
                    b.targetKey !== selfKey &&
                    b.hotkey.trim() !== "" &&
                    normalizeShortcutString(b.hotkey) === normalizedCurrent,
            ) || null
        );
    }, [currentHotkey, target, existingBindings]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                onClose();
                return;
            }

            const modifiers: string[] = [];
            if (e.ctrlKey) modifiers.push("CTRL");
            if (e.altKey) modifiers.push("ALT");
            if (e.shiftKey) modifiers.push("SHIFT");

            let mainKey = e.key.toUpperCase();

            if (e.code.startsWith("F") && !isNaN(parseInt(e.code.slice(1)))) {
                mainKey = e.code.toUpperCase();
            } else if (e.code.startsWith("Numpad")) {
                mainKey = e.code.toUpperCase();
            } else if (mainKey === " " || e.code === "Space") {
                mainKey = "SPACE";
            } else if (["CONTROL", "ALT", "SHIFT", "META"].includes(mainKey)) {
                return;
            }

            const combined =
                modifiers.length > 0
                    ? `${modifiers.join("+")}+${mainKey}`
                    : mainKey;
            setCurrentHotkey(combined);
        };

        window.addEventListener("keydown", handleKeyDown, true);
        return () => {
            window.removeEventListener("keydown", handleKeyDown, true);
        };
    }, [onClose]);

    if (!target) return null;

    const handleSave = () => {
        onSaveHotkey(target, normalizeShortcutString(currentHotkey));
        onClose();
    };

    const commonPresets =
        target.kind === "sound"
            ? [
                  "F1",
                  "F2",
                  "F3",
                  "F4",
                  "F5",
                  "F6",
                  "F7",
                  "F8",
                  "F9",
                  "F10",
                  "NUMPAD1",
                  "NUMPAD2",
              ]
            : [
                  "CTRL+ALT+1",
                  "CTRL+ALT+2",
                  "CTRL+ALT+3",
                  "CTRL+ALT+4",
                  "CTRL+ALT+0",
                  "F9",
                  "F10",
                  "F11",
                  "F12",
                  "NUMPAD1",
                  "NUMPAD2",
                  "NUMPAD3",
              ];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
            style={{ backgroundColor: "var(--modal-backdrop)" }}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
                className="w-full max-w-md bg-[var(--bg-modal)] border border-[var(--border-card)] ui-modal p-6 flex flex-col gap-4"
            >
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 ui-input bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
                            <Keyboard className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-sm font-bold text-[var(--text-primary)]">
                                {target.kind === "sound"
                                    ? "Kısayol Tuşu Ata"
                                    : target.kind === "voice-toggle"
                                      ? "Efekt Motoru Kısayolu"
                                      : "Ses Efekti Kısayolu"}
                            </h2>
                            <p className="text-xs text-[var(--text-secondary)] truncate">
                                {target.title}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Kapat"
                        className="p-1.5 ui-control text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Listening Box */}
                <div className="flex flex-col items-center justify-center py-6 px-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] text-center gap-2.5">
                    <span className="text-xs text-[var(--text-secondary)]">
                        Herhangi bir tuşa veya tuş kombinasyonuna basın:
                    </span>
                    <div className="px-5 py-2.5 ui-input bg-[var(--bg-card)] border border-[var(--accent-border)] text-[var(--accent-text)] text-lg font-mono font-semibold tracking-wide">
                        {currentHotkey || "Bir Tuşa Basın..."}
                    </div>
                    <span className="text-xs text-[var(--text-muted)] font-mono">
                        F1-F12 · Numpad · CTRL / ALT / SHIFT Kombinasyonları
                    </span>
                </div>

                {/* Conflict Warning */}
                {conflictBinding && (
                    <div className="flex items-start gap-2.5 p-3 ui-inner bg-amber-950/30 border border-amber-800/60 text-amber-300 text-xs">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                            <strong>Çakışma:</strong> Bu kısayol{" "}
                            <span className="underline">
                                {conflictBinding.label}
                            </span>{" "}
                            için kullanılıyor. Kaydedilirse önceki atamadan
                            kaldırılıp buraya atanır.
                        </div>
                    </div>
                )}

                {/* Presets */}
                <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">
                        Hızlı Seçim
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                        {commonPresets.map((preset) => (
                            <button
                                key={preset}
                                type="button"
                                onClick={() => setCurrentHotkey(preset)}
                                className={`px-2.5 py-1 ui-control text-xs font-mono transition-colors cursor-pointer ${
                                    normalizeShortcutString(currentHotkey) ===
                                    normalizeShortcutString(preset)
                                        ? "btn-accent font-semibold"
                                        : "bg-[var(--bg-inner)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]"
                                }`}
                            >
                                {preset}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                    <button
                        type="button"
                        onClick={() => setCurrentHotkey("")}
                        className="px-3 py-1.5 ui-control text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                    >
                        Kaldır
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-3.5 py-1.5 ui-control text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
                    >
                        İptal
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        className="btn-accent flex items-center gap-1.5 px-4 py-1.5 ui-control text-xs font-semibold transition-colors cursor-pointer"
                    >
                        <Check className="w-3.5 h-3.5" />
                        <span>Kaydet</span>
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
