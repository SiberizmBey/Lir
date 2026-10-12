import { useEffect, useState } from "react";
import { SubtitleOverlaySettings } from "../types/sound";

export function SubtitleOverlay() {
    const [translation, setTranslation] = useState(
        "Canlı altyazı çevirisi burada görünecek.",
    );
    const [settings, setSettings] = useState<SubtitleOverlaySettings>({
        x: 100,
        y: 4,
        width: 400,
        height: 510,
        fontSize: 17,
    });

    useEffect(() => {
        const unsubscribeTranslation = window.electronAPI?.onSubtitleOverlayUpdate(
            setTranslation,
        );
        const unsubscribeSettings = window.electronAPI?.onSubtitleOverlaySettings(
            setSettings,
        );
        return () => {
            unsubscribeTranslation?.();
            unsubscribeSettings?.();
        };
    }, []);

    return (
        <div className="h-screen w-screen bg-transparent p-3">
            <div
                aria-live="polite"
                className="flex h-full w-full flex-col rounded-2xl border border-white/15 bg-black/95 px-5 py-4 text-center"
            >
                <p
                    className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words font-semibold leading-relaxed text-white"
                    style={{ fontSize: settings.fontSize }}
                >
                    {translation || " "}
                </p>
                <span className="mt-1 shrink-0 text-[10px] font-medium tracking-wide text-emerald-300/80">
                    LIR · CANLI ÇEVİRİ
                </span>
            </div>
        </div>
    );
}
