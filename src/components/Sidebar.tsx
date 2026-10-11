import lirIcon from "../assets/icon.png";
import {
    Volume2,
    Sliders,
    Keyboard,
    Mic,
    HelpCircle,
    Activity,
    Settings,
} from "lucide-react";

export type NavTab =
    | "soundboard"
    | "recorder"
    | "routing"
    | "hotkeys"
    | "settings"
    | "guide";

interface SidebarProps {
    currentTab: NavTab;
    onTabChange: (tab: NavTab) => void;
    soundCount: number;
    favoriteCount: number;
    isElectron: boolean;
    activePlayingCount: number;
    spotifyConnected?: boolean;
}

export function Sidebar({
    currentTab,
    onTabChange,
    soundCount,
    favoriteCount,
    isElectron,
    activePlayingCount,
    spotifyConnected = false,
}: SidebarProps) {
    const navItems = [
        {
            id: "soundboard" as NavTab,
            label: "Soundboard",
            icon: Volume2,
            badge: soundCount,
        },
        {
            id: "recorder" as NavTab,
            label: "Ses Kaydedici",
            icon: Mic,
            badge: null,
        },
        {
            id: "routing" as NavTab,
            label: "Ses Kablosu & Çıkış",
            icon: Sliders,
            badge: "CABLE",
        },
        {
            id: "hotkeys" as NavTab,
            label: "Kısayol Matrisi",
            icon: Keyboard,
            badge: null,
        },
        {
            id: "settings" as NavTab,
            label: "Ayarlar & Spotify",
            icon: Settings,
            badge: spotifyConnected ? "SPOTIFY" : null,
        },
        {
            id: "guide" as NavTab,
            label: "Kullanım Kılavuzu",
            icon: HelpCircle,
            badge: null,
        },
    ];

    return (
        <aside className="w-60 h-screen flex flex-col justify-between bg-[#000000] border-r border-zinc-800/80 p-3 select-none shrink-0 z-20">
            {/* Brand Header */}
            <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between px-2 pt-2">
                    <div className="flex items-center gap-2.5">
                        {/* Lir App Logo */}
                        <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shrink-0 border border-zinc-800/80 bg-zinc-950 shadow-sm">
                            <img
                                src={lirIcon}
                                alt="Lir Logo"
                                className="w-full h-full object-contain p-0.5"
                            />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="font-semibold text-sm tracking-tight text-white">
                                Lir
                            </span>
                        </div>
                    </div>

                    <span className="text-[10px] font-mono text-zinc-500 border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 rounded">
                        v1.0.2
                    </span>
                </div>

                {/* Navigation list */}
                <nav className="flex flex-col gap-0.5">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = currentTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => onTabChange(item.id)}
                                className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                                    isActive
                                        ? "bg-zinc-900 text-white border border-zinc-800"
                                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                                }`}
                            >
                                <div className="flex items-center gap-2.5">
                                    <Icon
                                        className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-zinc-400"}`}
                                    />
                                    <span>{item.label}</span>
                                </div>
                                {item.badge !== null && (
                                    <span
                                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                                            isActive
                                                ? "border-zinc-700 bg-zinc-800 text-zinc-200"
                                                : "border-zinc-800/80 bg-zinc-950 text-zinc-400"
                                        }`}
                                    >
                                        {item.badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Footer Info Box */}
            <div className="flex flex-col gap-2">
                {activePlayingCount > 0 && (
                    <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-[11px] text-zinc-200 font-mono">
                                {activePlayingCount} aktif ses
                            </span>
                        </div>
                        <Activity className="w-3.5 h-3.5 text-zinc-400 animate-pulse" />
                    </div>
                )}

                <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                        <span className="text-zinc-500">Ortam</span>
                        <span className="font-mono text-zinc-300">
                            {isElectron ? "Desktop (Electron)" : "Web Preview"}
                        </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                        <span className="text-zinc-500">Favoriler</span>
                        <span className="font-mono text-zinc-300">
                            {favoriteCount}
                        </span>
                    </div>

                    <div className="pt-1.5 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                        <span>Açık Kaynak</span>
                        <span className="text-zinc-400">MIT Lisans</span>
                    </div>
                </div>
            </div>
        </aside>
    );
}
