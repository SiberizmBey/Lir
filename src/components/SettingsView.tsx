import { useState, useEffect } from "react";
import {
    Check,
    Copy,
    ExternalLink,
    Music2,
    RefreshCw,
    Sliders,
    Volume2,
    AlertCircle,
    Laptop,
    Smartphone,
    Speaker,
    Radio,
    Play,
    Square,
    LogOut,
    Key,
    Shield,
    Sparkles,
    Globe,
    HelpCircle,
    Server,
} from "lucide-react";
import { AudioRoutingConfig, SpotifyAuthState, SpotifyDevice } from "../types/sound";
import { spotifyService } from "../utils/spotifyService";

interface SettingsViewProps {
    routingConfig: AudioRoutingConfig;
    onRoutingConfigChange: (config: AudioRoutingConfig) => void;
    onResetToDefaults: () => void;
}

export function SettingsView({
    routingConfig,
    onRoutingConfigChange,
    onResetToDefaults,
}: SettingsViewProps) {
    const [spotifyState, setSpotifyState] = useState<SpotifyAuthState>(() =>
        spotifyService.getState()
    );
    const [clientIdInput, setClientIdInput] = useState(spotifyState.clientId || "");
    const [clientSecretInput, setClientSecretInput] = useState(
        spotifyState.clientSecret || ""
    );
    const [redirectUriInput, setRedirectUriInput] = useState(
        spotifyState.redirectUri || "https://lir.anticvalley.com.tr/auth/callback"
    );
    const [isConnecting, setIsConnecting] = useState(false);
    const [isRefreshingDevices, setIsRefreshingDevices] = useState(false);
    const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
    const [testPlayStatus, setTestPlayStatus] = useState<string | null>(null);
    const [feedbackMessage, setFeedbackMessage] = useState<{
        type: "success" | "error" | "info";
        text: string;
    } | null>(null);

    // Synchronize spotify state
    useEffect(() => {
        const unsub = spotifyService.subscribe((newState) => {
            setSpotifyState(newState);
            if (newState.clientId && !clientIdInput) {
                setClientIdInput(newState.clientId);
            }
            if (newState.clientSecret && !clientSecretInput) {
                setClientSecretInput(newState.clientSecret);
            }
            if (newState.redirectUri) {
                setRedirectUriInput(newState.redirectUri);
            }
        });
        return () => unsub();
    }, []);

    const primaryCustomUrl = "https://lir.anticvalley.com.tr/auth/callback";

    // Specified test track: Kanye West - Flashing Lights
    const TEST_TRACK_URI = "spotify:track:5GOyyufqny38BvNu99ts2z";
    const TEST_TRACK_NAME = "Flashing Lights (Kanye West)";

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(id);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const handleSaveCredentials = () => {
        spotifyService.updateState({
            clientId: clientIdInput.trim(),
            clientSecret: clientSecretInput.trim(),
            redirectUri: redirectUriInput.trim() || primaryCustomUrl,
        });
        setFeedbackMessage({
            type: "success",
            text: "Spotify Client ID ve Redirect URI ayarları başarıyla kaydedildi.",
        });
        setTimeout(() => setFeedbackMessage(null), 4000);
    };

    const handleConnectSpotify = async () => {
        setFeedbackMessage(null);
        if (!clientIdInput.trim()) {
            setFeedbackMessage({
                type: "error",
                text: "Lütfen önce Spotify Developer Dashboard'dan aldığınız Client ID'yi girin.",
            });
            return;
        }

        // Save current settings before popup
        spotifyService.updateState({
            clientId: clientIdInput.trim(),
            clientSecret: clientSecretInput.trim(),
            redirectUri: redirectUriInput.trim() || primaryCustomUrl,
        });

        setIsConnecting(true);
        try {
            await spotifyService.initiateLogin();
            setFeedbackMessage({
                type: "info",
                text: "Yetkilendirme penceresi açıldı. Spotify hesabınızla giriş yapıp onay verin.",
            });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setFeedbackMessage({
                type: "error",
                text: msg,
            });
        } finally {
            setIsConnecting(false);
        }
    };

    const handleRefreshDevices = async () => {
        setIsRefreshingDevices(true);
        try {
            await spotifyService.refreshUserData();
            setFeedbackMessage({
                type: "success",
                text: "Cihaz listesi güncellendi.",
            });
            setTimeout(() => setFeedbackMessage(null), 3000);
        } catch {
            setFeedbackMessage({
                type: "error",
                text: "Cihazlar listelenirken hata oluştu.",
            });
        } finally {
            setIsRefreshingDevices(false);
        }
    };

    const handleSelectDevice = (deviceId: string) => {
        spotifyService.updateState({ activeDeviceId: deviceId });
    };

    const handleTestPlay = async () => {
        setTestPlayStatus("playing");
        try {
            const res = await spotifyService.playTrack(TEST_TRACK_URI);
            if (res.message) {
                setFeedbackMessage({ type: "info", text: res.message });
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setFeedbackMessage({ type: "error", text: msg });
        }
    };

    const handleTestStop = async () => {
        setTestPlayStatus(null);
        await spotifyService.pauseTrack();
    };

    const getDeviceIcon = (type: string) => {
        const lower = type.toLowerCase();
        if (lower.includes("phone") || lower.includes("mobile")) return Smartphone;
        if (lower.includes("speaker") || lower.includes("cast")) return Speaker;
        return Laptop;
    };

    return (
        <div className="flex-1 flex flex-col gap-6 p-6 overflow-y-auto max-w-5xl mx-auto w-full">
            {/* Header */}
            <div className="flex flex-col gap-1 pb-3 border-b border-zinc-800/80">
                <div className="flex items-center gap-2">
                    <h1 className="text-base font-semibold text-white tracking-tight">
                        Ayarlar & Spotify Köprüsü
                    </h1>
                    <span className="text-[11px] font-mono border border-zinc-800 bg-zinc-950 text-zinc-400 px-1.5 py-0.2 rounded">
                        SETTINGS
                    </span>
                </div>
                <p className="text-xs text-zinc-400">
                    Spotify hesabınızı bağlayarak şarkıları doğrudan Soundpad&apos;e entegre edin ve kısayol tuşlarıyla anında çalın.
                </p>
            </div>

            {feedbackMessage && (
                <div
                    className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-3 ${
                        feedbackMessage.type === "success"
                            ? "bg-emerald-950/40 border-emerald-700/80 text-emerald-200"
                            : feedbackMessage.type === "error"
                              ? "bg-rose-950/40 border-rose-700/80 text-rose-200"
                              : "bg-blue-950/40 border-blue-700/80 text-blue-200"
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{feedbackMessage.text}</span>
                    </div>
                    <button
                        onClick={() => setFeedbackMessage(null)}
                        className="text-zinc-400 hover:text-white text-xs px-1"
                    >
                        ✕
                    </button>
                </div>
            )}

            {spotifyState.error && (
                <div className="flex items-center gap-2 p-3 rounded-lg border bg-rose-950/40 border-rose-700/80 text-rose-200 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{spotifyState.error}</span>
                </div>
            )}

            {/* 1. SPOTIFY INTEGRATION SECTION */}
            <div className="rounded-xl bg-[#0a0a0a] border border-zinc-800 p-5 flex flex-col gap-5 shadow-xl">
                {/* Section title & connection pill */}
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#1db954]/10 border border-[#1db954]/30 flex items-center justify-center text-[#1db954]">
                            <Music2 className="w-4 h-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                                <span>Spotify Köprüsü</span>
                                {spotifyState.isConnected ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950 border border-emerald-700 text-emerald-300">
                                        Bağlandı
                                    </span>
                                ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400">
                                        Bağlı Değil
                                    </span>
                                )}
                            </h2>
                            <p className="text-[11px] text-zinc-400">
                                Şarkıları arayıp Soundpad kartlarına ekleyin ve oyun içi kısayollarla Spotify&apos;da yürütün.
                            </p>
                        </div>
                    </div>

                    {spotifyState.isConnected && (
                        <button
                            onClick={() => spotifyService.logout()}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-rose-300 transition-colors cursor-pointer"
                        >
                            <LogOut className="w-3 h-3" />
                            <span>Bağlantıyı Kes</span>
                        </button>
                    )}
                </div>

                {/* If Connected: Show User Profile, Test Track, & Active Devices */}
                {spotifyState.isConnected && spotifyState.user ? (
                    <div className="flex flex-col gap-4">
                        {/* Profile banner */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                            <div className="flex items-center gap-3">
                                {spotifyState.user.images && spotifyState.user.images[0] ? (
                                    <img
                                        src={spotifyState.user.images[0].url}
                                        alt={spotifyState.user.display_name}
                                        className="w-10 h-10 rounded-full border border-zinc-700 object-cover"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 font-semibold text-sm">
                                        {spotifyState.user.display_name?.charAt(0) || "S"}
                                    </div>
                                )}
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-white">
                                            {spotifyState.user.display_name}
                                        </span>
                                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#1db954]/10 border border-[#1db954]/30 text-[#1db954] uppercase">
                                            {spotifyState.user.product || "Premium"}
                                        </span>
                                    </div>
                                    <p className="text-xs text-zinc-400">
                                        {spotifyState.user.email || `Spotify ID: ${spotifyState.user.id}`}
                                    </p>
                                </div>
                            </div>

                            {/* Quick Test Playback Buttons with User's requested track */}
                            <div className="flex flex-col sm:items-end gap-1">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleTestPlay}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1db954] hover:bg-[#1ed760] text-black text-xs font-semibold transition-colors cursor-pointer shadow-sm"
                                        title={`Test Şarkısı: ${TEST_TRACK_NAME}`}
                                    >
                                        <Play className="w-3 h-3 fill-current" />
                                        <span>Test Şarkısını Çal</span>
                                    </button>
                                    <button
                                        onClick={handleTestStop}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
                                    >
                                        <Square className="w-3 h-3" />
                                        <span>Durdur</span>
                                    </button>
                                </div>
                                <span className="text-[10px] font-mono text-zinc-500">
                                    Şarkı: {TEST_TRACK_NAME}
                                </span>
                            </div>
                        </div>

                        {/* Connected Devices */}
                        <div className="flex flex-col gap-2 p-3.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Radio className="w-3.5 h-3.5 text-[#1db954]" />
                                    <span className="text-xs font-semibold text-white">
                                        Aktif Çalma Cihazı (Spotify Connect)
                                    </span>
                                </div>
                                <button
                                    onClick={handleRefreshDevices}
                                    disabled={isRefreshingDevices}
                                    className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
                                >
                                    <RefreshCw
                                        className={`w-3 h-3 ${isRefreshingDevices ? "animate-spin" : ""}`}
                                    />
                                    <span>Cihazları Tara</span>
                                </button>
                            </div>

                            <p className="text-[11px] text-zinc-400">
                                Kısayola bastığınızda şarkının çalınacağı Spotify cihazı (Masaüstü Spotify uygulaması açık olmalıdır):
                            </p>

                            {spotifyState.devices.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mt-1">
                                    {spotifyState.devices.map((device: SpotifyDevice) => {
                                        const DeviceIcon = getDeviceIcon(device.type);
                                        const isSelected =
                                            spotifyState.activeDeviceId === device.id ||
                                            (!spotifyState.activeDeviceId && device.is_active);
                                        return (
                                            <button
                                                key={device.id}
                                                onClick={() => handleSelectDevice(device.id)}
                                                className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                                                    isSelected
                                                        ? "bg-[#1db954]/10 border-[#1db954]/60 text-white shadow-sm"
                                                        : "bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:bg-zinc-850"
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <DeviceIcon
                                                        className={`w-4 h-4 shrink-0 ${isSelected ? "text-[#1db954]" : "text-zinc-500"}`}
                                                    />
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-medium truncate">
                                                            {device.name}
                                                        </p>
                                                        <p className="text-[10px] text-zinc-500 capitalize">
                                                            {device.type} {device.is_active && "· Aktif"}
                                                        </p>
                                                    </div>
                                                </div>
                                                {isSelected && (
                                                    <Check className="w-3.5 h-3.5 text-[#1db954] shrink-0 ml-1.5" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="p-3 rounded-lg bg-zinc-900/40 border border-zinc-800/80 text-xs text-zinc-400 flex items-center justify-between">
                                    <span>
                                        Şu anda açık bir Spotify cihazı algılanmadı. Bilgisayarınızda veya telefonunuzda Spotify uygulamasını açıp bir şarkı başlatın.
                                    </span>
                                    <button
                                        onClick={handleRefreshDevices}
                                        className="text-[11px] font-semibold text-[#1db954] hover:underline shrink-0 ml-2"
                                    >
                                        Yeniden Dene
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    /* Connection Setup Instructions & Credentials Form */
                    <div className="flex flex-col gap-4">
                        {/* Custom Domain Callback URL Banner */}
                        <div className="p-4 rounded-lg bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-zinc-700/80 flex flex-col gap-3">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <Globe className="w-4 h-4 text-[#1db954]" />
                                    <span className="text-xs font-semibold text-white">
                                        Özel Alan Adı Redirect URI (lir.anticvalley.com.tr)
                                    </span>
                                </div>
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#1db954]/10 border border-[#1db954]/40 text-[#1db954]">
                                    ÖNERİLEN
                                </span>
                            </div>

                            <p className="text-xs text-zinc-300 leading-relaxed">
                                Spotify Developer paneline eklenecek birincil callback adresiniz:
                            </p>

                            <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-black border border-zinc-700 text-xs font-mono">
                                <span className="text-emerald-400 font-semibold truncate">
                                    {primaryCustomUrl}
                                </span>
                                <button
                                    onClick={() => handleCopy(primaryCustomUrl, "custom")}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1db954] hover:bg-[#1ed760] text-black text-xs font-semibold shrink-0 transition-colors cursor-pointer"
                                >
                                    {copiedIndex === "custom" ? (
                                        <>
                                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                            <span>Kopyalandı</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-3.5 h-3.5" />
                                            <span>Adresi Kopyala</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Step-by-step setup cards */}
                        <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800/80 flex flex-col gap-3">
                            <div className="flex items-center gap-2 text-xs font-semibold text-white">
                                <Key className="w-3.5 h-3.5 text-[#1db954]" />
                                <span>Spotify Developer Dashboard Kurulumu</span>
                            </div>

                            <ol className="text-xs text-zinc-400 flex flex-col gap-2 list-decimal list-inside leading-relaxed">
                                <li>
                                    <a
                                        href="https://developer.spotify.com/dashboard"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[#1db954] hover:underline inline-flex items-center gap-1 font-medium"
                                    >
                                        Spotify Developer Dashboard
                                        <ExternalLink className="w-3 h-3" />
                                    </a>{" "}
                                    paneline giriş yapıp uygulamanızı seçin veya yeni bir app oluşturun.
                                </li>
                                <li>
                                    Uygulama ayarlarındaki <strong>&quot;Redirect URIs&quot;</strong> bölümüne <code>https://lir.anticvalley.com.tr/auth/callback</code> adresini ekleyip kaydedin.
                                </li>
                                <li>
                                    Panelden aldığınız <strong>Client ID</strong> değerini aşağıdaki alana yapıştırıp <strong>&quot;Spotify ile Bağlan&quot;</strong> butonuna tıklayın.
                                </li>
                            </ol>
                        </div>

                        {/* Domain & Hosting Checklist Box */}
                        <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800/80 flex flex-col gap-2.5">
                            <div className="flex items-center gap-2 text-xs font-semibold text-white">
                                <Server className="w-3.5 h-3.5 text-blue-400" />
                                <span>Domaininizde (lir.anticvalley.com.tr) Yapılması Gerekenler:</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs text-zinc-400 mt-1">
                                <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 flex flex-col gap-1">
                                    <strong className="text-white text-[11px] flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                        1. DNS Kaydı
                                    </strong>
                                    <p className="text-[11px] text-zinc-500 leading-normal">
                                        Domain DNS yönetiminizde <code>lir.anticvalley.com.tr</code> için CNAME kaydını bu uygulamanın sunucu adresine yönlendirin.
                                    </p>
                                </div>

                                <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 flex flex-col gap-1">
                                    <strong className="text-white text-[11px] flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                        2. SSL / HTTPS
                                    </strong>
                                    <p className="text-[11px] text-zinc-500 leading-normal">
                                        Spotify OAuth güvenliği için HTTPS zorunludur. Cloudflare veya Let&apos;s Encrypt ile SSL sertifikasını aktif edin.
                                    </p>
                                </div>

                                <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 flex flex-col gap-1">
                                    <strong className="text-white text-[11px] flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                        3. Reverse Proxy
                                    </strong>
                                    <p className="text-[11px] text-zinc-500 leading-normal">
                                        Nginx veya Caddy kullanıyorsanız gelen istekleri port 3000&apos;e <code>proxy_pass</code> ile iletin.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Client ID, Secret, and Redirect URI Inputs */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-zinc-300">
                                    Spotify Client ID <span className="text-rose-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={clientIdInput}
                                    onChange={(e) => setClientIdInput(e.target.value)}
                                    placeholder="Spotify Developer Client ID"
                                    className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-600 font-mono focus:outline-none focus:border-[#1db954]"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-zinc-300">
                                    Spotify Client Secret <span className="text-zinc-500">(İsteğe bağlı)</span>
                                </label>
                                <input
                                    type="password"
                                    value={clientSecretInput}
                                    onChange={(e) => setClientSecretInput(e.target.value)}
                                    placeholder="••••••••••••••••••••••••••••••••"
                                    className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-600 font-mono focus:outline-none focus:border-[#1db954]"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-zinc-300">
                                    Aktif Redirect URI
                                </label>
                                <input
                                    type="text"
                                    value={redirectUriInput}
                                    onChange={(e) => setRedirectUriInput(e.target.value)}
                                    placeholder="https://lir.anticvalley.com.tr/auth/callback"
                                    className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-600 font-mono focus:outline-none focus:border-[#1db954]"
                                />
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                            <button
                                onClick={handleSaveCredentials}
                                className="px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
                            >
                                Bilgileri Kaydet
                            </button>

                            <button
                                onClick={handleConnectSpotify}
                                disabled={isConnecting || !clientIdInput.trim()}
                                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#1db954] hover:bg-[#1ed760] disabled:opacity-50 text-black text-xs font-semibold transition-all cursor-pointer shadow-md hover:shadow-lg"
                            >
                                <Sparkles className="w-3.5 h-3.5 fill-current" />
                                <span>{isConnecting ? "Bağlanılıyor..." : "Spotify ile Bağlan"}</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* 2. GENERAL SOUNDPAD AUDIO SETTINGS */}
            <div className="rounded-xl bg-[#0a0a0a] border border-zinc-800 p-5 flex flex-col gap-4 shadow-lg">
                <div className="flex items-center gap-2 pb-2 border-b border-zinc-800/80">
                    <Sliders className="w-4 h-4 text-zinc-400" />
                    <h2 className="text-xs font-semibold text-white">Genel Soundpad Ayarları</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Playback Mode */}
                    <div className="flex flex-col gap-2 p-3.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                        <label className="text-xs font-medium text-white">Çalma Modu</label>
                        <p className="text-[11px] text-zinc-500">
                            Yeni bir ses veya Spotify şarkısı tetiklendiğinde önceki sesin davranışı:
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                            <button
                                onClick={() =>
                                    onRoutingConfigChange({
                                        ...routingConfig,
                                        playbackMode: "overlap",
                                    })
                                }
                                className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium border text-center transition-colors cursor-pointer ${
                                    routingConfig.playbackMode === "overlap"
                                        ? "bg-zinc-800 border-zinc-700 text-white"
                                        : "bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:text-white"
                                }`}
                            >
                                Üst Üste Bindir (Overlap)
                            </button>
                            <button
                                onClick={() =>
                                    onRoutingConfigChange({
                                        ...routingConfig,
                                        playbackMode: "cutoff",
                                    })
                                }
                                className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium border text-center transition-colors cursor-pointer ${
                                    routingConfig.playbackMode === "cutoff"
                                        ? "bg-zinc-800 border-zinc-700 text-white"
                                        : "bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:text-white"
                                }`}
                            >
                                Öncekini Kes (Cutoff)
                            </button>
                        </div>
                    </div>

                    {/* Master Volume */}
                    <div className="flex flex-col gap-2 p-3.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-white">Genel Ses Seviyesi</label>
                            <span className="text-xs font-mono text-zinc-300">
                                %{Math.round(routingConfig.masterVolume * 100)}
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.02"
                            value={routingConfig.masterVolume}
                            onChange={(e) =>
                                onRoutingConfigChange({
                                    ...routingConfig,
                                    masterVolume: parseFloat(e.target.value),
                                })
                            }
                            className="w-full mt-2 accent-white cursor-pointer"
                        />
                        <p className="text-[11px] text-zinc-500">
                            Tüm yerel ses efektleri ve önizlemeler bu seviyede çalınır.
                        </p>
                    </div>
                </div>

                {/* Reset to Defaults */}
                <div className="flex items-center justify-between pt-3 border-t border-zinc-800/80">
                    <div>
                        <p className="text-xs font-medium text-white">Fabrika Ayarlarına Sıfırla</p>
                        <p className="text-[11px] text-zinc-500">
                            Tüm sesleri ve kısayolları başlangıç durumuna döndürür.
                        </p>
                    </div>
                    <button
                        onClick={onResetToDefaults}
                        className="px-3 py-1.5 rounded-md bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800 text-rose-300 text-xs font-medium transition-colors cursor-pointer"
                    >
                        Sesleri Sıfırla
                    </button>
                </div>
            </div>
        </div>
    );
}
