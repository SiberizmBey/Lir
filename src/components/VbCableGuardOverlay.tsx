import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import {
    AlertTriangle,
    Download,
    RefreshCw,
    Cable,
    ShieldAlert,
    Minus,
    X,
} from "lucide-react";
import { useTranslation } from "../i18n";

export type VbCableStatus =
    | "checking"
    | "installed"
    | "missing"
    | "permission-needed";

interface VbCableGuardOverlayProps {
    isElectron: boolean;
    onStatusChange: (installed: boolean) => void;
}

const VB_CABLE_DOWNLOAD_URL = "https://vb-audio.com/Cable/";

export function isVbCableDeviceLabel(label: string): boolean {
    const lower = label.toLowerCase();
    return (
        lower.includes("vb-audio") ||
        lower.includes("cable input") ||
        lower.includes("cable output") ||
        lower.includes("vb-cable") ||
        lower.includes("virtual cable")
    );
}

export function VbCableGuardOverlay({
    isElectron,
    onStatusChange,
}: VbCableGuardOverlayProps) {
    const { t } = useTranslation();
    const [status, setStatus] = useState<VbCableStatus>("checking");
    const [isScanning, setIsScanning] = useState(false);
    const [detectedOutputsCount, setDetectedOutputsCount] = useState(0);
    const [errorDetail, setErrorDetail] = useState<string | null>(null);

    const checkDevices = useCallback(
        async (requestPermission = false) => {
            setIsScanning(true);
            setErrorDetail(null);

            try {
                if (!navigator.mediaDevices?.enumerateDevices) {
                    setStatus("missing");
                    onStatusChange(false);
                    return;
                }

                if (requestPermission && navigator.mediaDevices.getUserMedia) {
                    try {
                        const tempStream =
                            await navigator.mediaDevices.getUserMedia({
                                audio: true,
                            });
                        tempStream.getTracks().forEach((track) => track.stop());
                    } catch {
                        setErrorDetail(t("vbCableGuard.micPermissionNeeded"));
                    }
                }

                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioDevices = devices.filter(
                    (d) => d.kind === "audiooutput" || d.kind === "audioinput",
                );
                setDetectedOutputsCount(
                    devices.filter((d) => d.kind === "audiooutput").length,
                );

                const hasVbCable = audioDevices.some((d) =>
                    isVbCableDeviceLabel(d.label),
                );

                if (hasVbCable) {
                    setStatus("installed");
                    onStatusChange(true);
                    return;
                }

                const allLabelsHidden =
                    audioDevices.length > 0 &&
                    audioDevices.every((d) => !d.label.trim());

                if (allLabelsHidden && !requestPermission) {
                    setStatus("permission-needed");
                } else {
                    setStatus("missing");
                }
                onStatusChange(false);
            } catch (err) {
                console.warn("VB-CABLE sürücü kontrol hatası:", err);
                setStatus("missing");
                onStatusChange(false);
            } finally {
                setIsScanning(false);
            }
        },
        [onStatusChange],
    );

    useEffect(() => {
        void checkDevices(false);

        const handleDeviceChange = () => {
            void checkDevices(false);
        };

        navigator.mediaDevices?.addEventListener?.(
            "devicechange",
            handleDeviceChange,
        );

        const interval = window.setInterval(() => {
            if (status !== "installed") {
                void checkDevices(false);
            }
        }, 2500);

        return () => {
            navigator.mediaDevices?.removeEventListener?.(
                "devicechange",
                handleDeviceChange,
            );
            window.clearInterval(interval);
        };
    }, [checkDevices, status]);

    if (status === "installed") {
        return null;
    }

    const handleDownloadClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
        if (isElectron && window.electronAPI?.openExternal) {
            event.preventDefault();
            window.electronAPI.openExternal(VB_CABLE_DOWNLOAD_URL);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="vb-cable-gate-title"
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 backdrop-blur-xl select-none"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.88)" }}
        >
            {/* Electron window close/minimize controls in case user needs to close app before installing */}
            {isElectron && (
                <div className="fixed top-4 right-4 flex items-center gap-1.5 window-no-drag">
                    <button
                        type="button"
                        onClick={() => window.electronAPI?.minimizeWindow?.()}
                        title={t("header.minimize")}
                        className="w-8 h-8 flex items-center justify-center ui-control border border-[var(--border-subtle)] bg-[var(--bg-island)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                        <Minus className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => window.electronAPI?.closeWindow?.()}
                        title={t("header.close")}
                        className="w-8 h-8 flex items-center justify-center ui-control border border-[var(--border-subtle)] bg-[var(--bg-island)] text-[var(--text-secondary)] hover:bg-rose-600 hover:text-white cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                className="w-full max-w-xl bg-[var(--bg-modal)] border border-[var(--border-card)] ui-modal p-6 sm:p-7 flex flex-col gap-5"
            >
                {/* Header */}
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 ui-inner bg-amber-950/50 border border-amber-700/60 text-amber-400 flex items-center justify-center shrink-0">
                        <ShieldAlert className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2
                                id="vb-cable-gate-title"
                                className="text-base sm:text-lg font-bold text-[var(--text-primary)] tracking-tight"
                            >
                                {t("vbCableGuard.title")}
                            </h2>
                            <span className="text-[11px] font-mono font-semibold px-2.5 py-0.5 ui-control bg-amber-950/40 border border-amber-700/50 text-amber-300">
                                {status === "checking"
                                    ? t("common.loading").toUpperCase()
                                    : status === "permission-needed"
                                      ? t("vbCableGuard.permissionNeeded")
                                      : t("vbCableGuard.missing")}
                            </span>
                        </div>
                        <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                            {t("vbCableGuard.description")}
                        </p>
                    </div>
                </div>

                {/* Live detection info */}
                <div className="p-4 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-3">
                    <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                            <Cable className="w-4 h-4 text-[var(--accent-text)]" />
                            {t("guide.title")}
                        </span>
                        <span className="font-mono text-[11px] text-[var(--text-muted)]">
                            {t("vbCableGuard.outputsScanned", {
                                count: detectedOutputsCount,
                            })}
                        </span>
                    </div>

                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        {t("vbCableGuard.instruction")}
                    </p>
                </div>

                {errorDetail && (
                    <div className="p-3 ui-inner bg-rose-950/40 border border-rose-800/70 text-rose-200 text-xs flex items-start gap-2 leading-relaxed">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                        <span>{errorDetail}</span>
                    </div>
                )}

                {/* Actions (non-dismissible — only Download & Re-check) */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
                    <a
                        href={VB_CABLE_DOWNLOAD_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleDownloadClick}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 ui-control border border-[var(--border-input)] bg-[var(--bg-inner)] hover:border-[var(--accent-border)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
                    >
                        <Download className="w-4 h-4 text-[var(--accent-text)]" />
                        <span>{t("vbCableGuard.downloadButton")}</span>
                    </a>

                    <motion.button
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.96 }}
                        disabled={isScanning}
                        onClick={() => void checkDevices(true)}
                        className="btn-accent flex items-center justify-center gap-2 px-5 py-2.5 ui-control text-xs font-semibold transition-colors disabled:opacity-60 cursor-pointer"
                    >
                        <RefreshCw
                            className={`w-4 h-4 ${isScanning ? "animate-spin" : ""}`}
                        />
                        <span>
                            {status === "permission-needed"
                                ? t("vbCableGuard.recheckButton")
                                : isScanning
                                  ? t("common.loading")
                                  : t("vbCableGuard.recheckButton")}
                        </span>
                    </motion.button>
                </div>
            </motion.div>
        </motion.div>
    );
}
