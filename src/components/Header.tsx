import {
    Volume2,
    VolumeX,
    Plus,
    Search,
    Square,
    Headphones,
    Minus,
    Maximize2,
    X,
} from "lucide-react";
import { AudioVisualizer } from "./AudioVisualizer";
import { AudioRoutingConfig, DiscordStatus } from "../types/sound";

interface HeaderProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    onAddNewSound: () => void;
    onStopAll: () => void;
    routingConfig: AudioRoutingConfig;
    onRoutingConfigChange: (newConfig: AudioRoutingConfig) => void;
    activePlayingCount: number;
    onOpenRoutingTab: () => void;
    discordStatus?: DiscordStatus;
    backgroundImageEnabled: boolean;
    transparency: number;
}

export function Header({
    searchQuery,
    onSearchChange,
    onAddNewSound,
    onStopAll,
    routingConfig,
    onRoutingConfigChange,
    activePlayingCount,
    onOpenRoutingTab,
    discordStatus,
    backgroundImageEnabled,
    transparency,
}: HeaderProps) {
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

    return (
        <header
            className="h-16 px-2 py-2 flex items-center justify-between gap-3 shrink-0 select-none window-drag-region"
            style={{
                backgroundColor: backgroundImageEnabled
                    ? "transparent"
                    : "var(--bg-canvas)",
            }}
        >
            {/* Floating Capsule Bar Container */}
            <div
                className="w-full h-11 flex items-center justify-between gap-2.5 px-3 bg-zinc-950/90 backdrop-blur-md border border-zinc-800/90 rounded-full"
                style={{
                    backgroundColor: backgroundImageEnabled
                        ? `color-mix(in srgb, var(--bg-inner) ${100 - transparency}%, transparent)`
                        : undefined,
                }}
            >
                {/* Left zone: Audio Device & Equalizer Capsule */}
                <div className="flex items-center gap-2 window-no-drag">
                    {/* Device Routing Indicator */}
                    {/* <button
                        onClick={onOpenRoutingTab}
                        title="Ses çıkış ayarlarını düzenle"
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800/90 border border-zinc-800/80 text-xs text-zinc-300 transition-all group cursor-pointer"
                    >
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="font-mono text-[11px] truncate max-w-[170px] text-zinc-200">
                            {routingConfig.primaryDeviceLabel || "CABLE Input"}
                        </span>
                        {routingConfig.dualOutputEnabled && (
                            <div className="flex items-center gap-1 text-[10px] text-zinc-400 border border-zinc-800 bg-zinc-950 px-1.5 py-0.2 rounded-full font-mono">
                                <Headphones className="w-2.5 h-2.5" />
                                <span>Çift</span>
                            </div>
                        )}
                    </button> */}

                    {/* Equalizer Visualizer Capsule */}
                    <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 bg-zinc-900/60 rounded-full border border-zinc-800/80">
                        <AudioVisualizer
                            isPlaying={activePlayingCount > 0}
                            height={16}
                        />
                    </div>

                    {/* Discord RPC Capsule */}
                    {/* <button
                        onClick={onOpenRoutingTab}
                        title={`Discord Rich Presence (Bot ID: ${discordStatus?.clientId || "1558769862053077114"}) - ${discordStatus?.connected ? "Bağlandı (Aktif)" : "Bekleniyor"}`}
                        className={`hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono transition-colors cursor-pointer ${
                            discordStatus?.connected
                                ? "bg-indigo-950/60 border-indigo-700/80 text-indigo-300 hover:bg-indigo-950/80"
                                : "bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200"
                        }`}
                    >
                        <div
                            className={`w-1.5 h-1.5 rounded-full ${discordStatus?.connected ? "bg-indigo-400 animate-pulse" : "bg-zinc-600"}`}
                        />
                        <span>Discord RPC</span>
                    </button> */}
                </div>

                {/* Center Zone: Capsule Search Bar */}
                <div className="flex-1 max-w-sm relative window-no-drag">
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Ses veya kısayol ara..."
                        className="w-full bg-zinc-900/80 text-xs text-zinc-200 placeholder-zinc-500 pl-8.5 pr-7 py-1.5 rounded-full border border-zinc-800/80 focus:outline-none focus:border-zinc-600 focus:bg-zinc-900 transition-all"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => onSearchChange("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-200"
                        >
                            ✕
                        </button>
                    )}
                </div>

                {/* Right Zone: Master Volume, Stop All, Yeni Ses, and Window Controls */}
                <div className="flex items-center gap-2 window-no-drag">
                    {/* Master Volume Capsule */}
                    <div className="group hidden sm:flex h-9 w-10 shrink-0 items-center gap-0 overflow-hidden rounded-full border border-zinc-800/80 bg-zinc-900/80 p-1.5 transition-[width] duration-300 ease-in-out hover:w-[144px] hover:gap-2 focus-within:w-[144px] focus-within:gap-2">
                        <button
                            onClick={handleToggleMute}
                            className="flex h-5 w-5 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:text-zinc-200 cursor-pointer"
                            title={isMuted ? "Sesi Aç" : "Sesi Kapat"}
                        >
                            {isMuted ? (
                                <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                            ) : (
                                <Volume2 className="w-3.5 h-3.5 text-zinc-300" />
                            )}
                        </button>
                        <div className="flex w-0 min-w-0 items-center gap-2 overflow-hidden opacity-0 transition-[width,opacity] duration-300 group-hover:w-[100px] group-hover:opacity-100 group-focus-within:w-[100px] group-focus-within:opacity-100">
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.02"
                                value={routingConfig.masterVolume}
                                onChange={(e) =>
                                    handleVolumeSlider(parseFloat(e.target.value))
                                }
                                className="w-16 shrink-0 accent-white cursor-pointer"
                                title={`Ana Ses: %${Math.round(routingConfig.masterVolume * 100)}`}
                            />
                            <span className="w-7 shrink-0 text-right text-[11px] font-mono tabular-nums text-zinc-400">
                                %{Math.round(routingConfig.masterVolume * 100)}
                            </span>
                        </div>
                    </div>

                    {/* Stop All Capsule */}
                    <button
                        onClick={onStopAll}
                        title={`Tüm sesleri durdur (${routingConfig.stopAllHotkey})`}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                            activePlayingCount > 0
                                ? "bg-rose-950/60 border-rose-700 text-rose-300 hover:bg-rose-950/80"
                                : "bg-zinc-900/80 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850"
                        }`}
                    >
                        <Square className="w-3 h-3 fill-current" />
                    </button>

                    {/* Primary Action Capsule: Yeni Ses */}
                    <button
                        onClick={onAddNewSound}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white hover:bg-zinc-200 active:bg-zinc-300 text-black text-xs font-semibold transition-all cursor-pointer whitespace-nowrap"
                    >
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>

                    {/* Circular Window Controls inside capsule (Electron only) */}
                    {window.electronAPI?.isElectron && (
                        <div className="flex items-center pl-2 ml-0.5 border-l border-zinc-800/90 gap-0.5">
                            <button
                                onClick={handleMinimize}
                                title="Simge Durumuna Küçült"
                                className="w-7 h-7 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
                            >
                                <Minus className="w-3.5 h-3.5" />
                            </button>

                            <button
                                onClick={handleMaximize}
                                title="Ekranı Kapla / Geri Yükle"
                                className="w-7 h-7 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
                            >
                                <Maximize2 className="w-3 h-3" />
                            </button>

                            <button
                                onClick={handleClose}
                                title="Kapat"
                                className="w-7 h-7 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-rose-600 transition-colors cursor-pointer"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
