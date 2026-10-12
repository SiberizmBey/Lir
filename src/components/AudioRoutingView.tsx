import { useState, useEffect } from "react";
import {
    Radio,
    Headphones,
    Mic,
    ArrowRight,
    Volume2,
    ExternalLink,
    Sliders,
    Play,
    HelpCircle,
    Activity,
    CheckCircle2,
    AlertTriangle,
} from "lucide-react";
import { AudioRoutingConfig } from "../types/sound";
import { audioEngine } from "../utils/audioEngine";

interface AudioRoutingViewProps {
    routingConfig: AudioRoutingConfig;
    onRoutingConfigChange: (config: AudioRoutingConfig) => void;
    isElectron: boolean;
}

export function AudioRoutingView({
    routingConfig,
    onRoutingConfigChange,
    isElectron,
}: AudioRoutingViewProps) {
    const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
    const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
    const [isPlayingTestTone, setIsPlayingTestTone] = useState(false);
    const [micLevel, setMicLevel] = useState(0);
    const [micError, setMicError] = useState<string | null>(null);

    // Load and auto-detect system audio devices
    useEffect(() => {
        let isMounted = true;

        const scanDevices = async () => {
            try {
                if (!navigator.mediaDevices?.enumerateDevices) return;

                let allDevices =
                    await navigator.mediaDevices.enumerateDevices();

                // If labels are empty, request brief audio permission to populate device labels
                if (allDevices.some((d) => !d.label)) {
                    try {
                        const stream =
                            await navigator.mediaDevices.getUserMedia({
                                audio: true,
                            });
                        stream.getTracks().forEach((t) => t.stop());
                        allDevices =
                            await navigator.mediaDevices.enumerateDevices();
                    } catch (e) {
                        // User may not have granted yet
                    }
                }

                if (!isMounted) return;

                const outputs = allDevices.filter(
                    (d) => d.kind === "audiooutput",
                );
                const inputs = allDevices.filter(
                    (d) => d.kind === "audioinput",
                );

                setOutputDevices(outputs);
                setInputDevices(inputs);

                // Auto-detect VB-CABLE Output device if not yet configured
                let updated = false;
                let newConfig = { ...routingConfig };

                const vbCableOutput = outputs.find(
                    (d) =>
                        d.label.toLowerCase().includes("cable input") ||
                        d.label.toLowerCase().includes("vb-audio"),
                );

                if (
                    vbCableOutput &&
                    (newConfig.primaryDeviceId === "default" ||
                        !newConfig.primaryDeviceId)
                ) {
                    newConfig.primaryDeviceId = vbCableOutput.deviceId;
                    newConfig.primaryDeviceLabel = vbCableOutput.label;
                    updated = true;
                }

                // Auto-detect user's physical microphone (ignoring virtual cable inputs)
                const physicalMic = inputs.find(
                    (d) =>
                        !d.label.toLowerCase().includes("cable") &&
                        !d.label.toLowerCase().includes("voicemeeter"),
                );

                if (
                    physicalMic &&
                    (!newConfig.micDeviceId ||
                        newConfig.micDeviceId === "default")
                ) {
                    newConfig.micDeviceId = physicalMic.deviceId;
                    newConfig.micDeviceLabel = physicalMic.label;
                    updated = true;
                }

                if (updated) {
                    onRoutingConfigChange(newConfig);
                }
            } catch (err) {
                console.warn("Audio device enumeration error:", err);
            }
        };

        scanDevices();

        navigator.mediaDevices?.addEventListener?.("devicechange", scanDevices);

        return () => {
            isMounted = false;
            navigator.mediaDevices?.removeEventListener?.(
                "devicechange",
                scanDevices,
            );
        };
    }, []);

    const [micStatus, setMicStatus] = useState<{
        active: boolean;
        label: string;
        muted: boolean;
    }>({
        active: false,
        label: "",
        muted: false,
    });

    // Live microphone level and hardware status polling
    useEffect(() => {
        if (!routingConfig.micPassThrough) {
            setMicLevel(0);
            setMicStatus({ active: false, label: "", muted: false });
            return;
        }

        const interval = setInterval(() => {
            const info = audioEngine.getMicStatusInfo();
            setMicLevel(info.level);
            setMicStatus({
                active: info.active,
                label: info.label,
                muted: info.muted,
            });
        }, 50);

        return () => clearInterval(interval);
    }, [routingConfig.micPassThrough]);

    const handleTestTone = async () => {
        setIsPlayingTestTone(true);
        await audioEngine.playSound(
            {
                id: "test-tone",
                title: "Test Sinyali",
                hotkey: "",
                duration: 0.8,
                category: "Özel",
                volume: 1.0,
                isFavorite: false,
                loop: false,
                playMode: "overlap",
                synthPreset: "coin",
                addedAt: Date.now(),
            },
            routingConfig.masterVolume,
            false,
            routingConfig.primaryDeviceId,
            routingConfig.secondaryDeviceId,
            true, // Always hear the test tone locally so user knows the engine is healthy!
        );
        setTimeout(() => setIsPlayingTestTone(false), 900);
    };

    const isVbCableDetected = outputDevices.some(
        (d) =>
            d.label.toLowerCase().includes("cable") ||
            d.label.toLowerCase().includes("vb-audio"),
    );

    return (
        <div className="flex-1 flex flex-col gap-5 p-6 overflow-y-auto max-w-5xl mx-auto w-full">
            {/* Title */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                    <h1 className="text-base font-semibold text-white tracking-tight">
                        Ses Yönlendirme & Sanal Kablo Mimarisi
                    </h1>
                    <span className="text-[11px] font-mono border border-zinc-800 bg-zinc-950 text-zinc-400 px-1.5 py-0.2 rounded">
                        {isVbCableDetected
                            ? "VB-CABLE ALGILANDI"
                            : "CABLE BEKLENİYOR"}
                    </span>
                </div>
                <p className="text-xs text-zinc-400">
                    Lir ses efektlerini ve mikrofonunuzu Discord/oyunlara
                    iletmek için sanal ses hattını yapılandırın.
                </p>
            </div>

            {/* Pipeline Diagram */}
            <div className="app-card p-4 rounded-xl bg-[#0a0a0a] border border-zinc-800/80 flex flex-col gap-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
                    {/* Node 1: Sources */}
                    <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-col items-center text-center gap-1.5 relative">
                        <Radio className="w-4 h-4 text-zinc-300" />
                        <span className="text-xs font-medium text-white">
                            Lir + Gerçek Mikrofon
                        </span>
                        <span className="text-[11px] text-zinc-500 font-mono">
                            Sesler & Konuşmanız
                        </span>
                        <div className="hidden md:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 text-zinc-600">
                            <ArrowRight className="w-3.5 h-3.5" />
                        </div>
                    </div>

                    {/* Node 2: Cable Input */}
                    <div className="p-3 rounded-lg bg-zinc-950 border border-emerald-800/50 flex flex-col items-center text-center gap-1.5 relative">
                        <Sliders className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-medium text-emerald-300">
                            CABLE Input
                        </span>
                        <span className="text-[11px] text-zinc-500 font-mono">
                            Sanal Mikser Hattı
                        </span>
                        <div className="hidden md:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 text-zinc-600">
                            <ArrowRight className="w-3.5 h-3.5" />
                        </div>
                    </div>

                    {/* Node 3: Discord */}
                    <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-col items-center text-center gap-1.5">
                        <Mic className="w-4 h-4 text-zinc-300" />
                        <span className="text-xs font-medium text-white">
                            Discord & Oyun Girişi
                        </span>
                        <span className="text-[11px] text-zinc-500 font-mono">
                            CABLE Output (Mikrofon)
                        </span>
                    </div>
                </div>

                {/* Status Callout */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950 border border-zinc-850 text-xs text-zinc-400">
                    <div className="flex items-center gap-2">
                        <Headphones className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
                        <span>
                            Çift Çıkış (Monitoring):{" "}
                            <strong
                                className={
                                    routingConfig.dualOutputEnabled
                                        ? "text-white"
                                        : "text-zinc-500"
                                }
                            >
                                {routingConfig.dualOutputEnabled
                                    ? "AÇIK (Kulaklığında Duyuyorsun)"
                                    : "KAPALI (Sadece Karşı Taraf Duyar)"}
                            </strong>
                        </span>
                    </div>
                    <span className="font-mono text-[11px] text-zinc-500">
                        {routingConfig.dualOutputEnabled
                            ? "2 Kanal Aktif"
                            : "1 Kanal Aktif"}
                    </span>
                </div>
            </div>

            {/* Main Grid: Device Configuration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Output Routing Box */}
                <div className="app-card p-4 rounded-xl bg-[#0a0a0a] border border-zinc-800/80 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Radio className="w-3.5 h-3.5 text-zinc-400" />
                            <h2 className="text-xs font-semibold text-white">
                                Birincil Ses Çıkışı (VB-CABLE)
                            </h2>
                        </div>
                        <button
                            onClick={handleTestTone}
                            disabled={isPlayingTestTone}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-850 text-zinc-300 text-xs font-mono border border-zinc-700 transition-colors cursor-pointer"
                        >
                            <Play className="w-3 h-3 fill-current" />
                            <span>
                                {isPlayingTestTone ? "Çalıyor..." : "Test Sesi"}
                            </span>
                        </button>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-zinc-500">
                            Seslerin Gönderileceği Aygıt (Discord'a gidecek hat)
                        </label>
                        <select
                            value={routingConfig.primaryDeviceId}
                            onChange={(e) => {
                                const newId = e.target.value;
                                const selected = outputDevices.find(
                                    (d) => d.deviceId === newId,
                                );
                                const nextConfig = {
                                    ...routingConfig,
                                    primaryDeviceId: newId,
                                    primaryDeviceLabel:
                                        selected?.label || "CABLE Input",
                                };
                                onRoutingConfigChange(nextConfig);
                                audioEngine.setRoutingConfig(
                                    newId,
                                    routingConfig.secondaryDeviceId,
                                    routingConfig.dualOutputEnabled,
                                    routingConfig.masterVolume,
                                );
                            }}
                            className="px-2.5 py-1.5 rounded-md bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
                        >
                            <option value="default">
                                Varsayılan Sistem Çıkışı
                            </option>
                            {outputDevices.map((device) => (
                                <option
                                    key={device.deviceId}
                                    value={device.deviceId}
                                >
                                    {device.label ||
                                        `Aygıt ${device.deviceId.slice(0, 8)}`}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Dual Output Toggle (User Hear Sound Toggle) */}
                    <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-xs font-medium text-zinc-200">
                                Çift Çıkış (Kulaklığında da Duy)
                            </span>
                            <span className="text-[11px] text-zinc-500">
                                Kapatırsanız sesi sadece karşı taraf duyar, siz
                                duymazsınız
                            </span>
                        </div>
                        <button
                            onClick={() =>
                                onRoutingConfigChange({
                                    ...routingConfig,
                                    dualOutputEnabled:
                                        !routingConfig.dualOutputEnabled,
                                })
                            }
                            className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                                routingConfig.dualOutputEnabled
                                    ? "bg-white justify-end"
                                    : "bg-zinc-800 justify-start"
                            }`}
                        >
                            <div
                                className={`w-4 h-4 rounded-full ${routingConfig.dualOutputEnabled ? "bg-black" : "bg-zinc-400"}`}
                            />
                        </button>
                    </div>

                    {/* Secondary Device selection */}
                    {routingConfig.dualOutputEnabled && (
                        <div className="flex flex-col gap-1 pt-1">
                            <label className="text-[11px] text-zinc-500">
                                Kendi Kulaklığınız (Monitoring Aygıtı)
                            </label>
                            <select
                                value={routingConfig.secondaryDeviceId}
                                onChange={(e) => {
                                    const selected = outputDevices.find(
                                        (d) => d.deviceId === e.target.value,
                                    );
                                    onRoutingConfigChange({
                                        ...routingConfig,
                                        secondaryDeviceId: e.target.value,
                                        secondaryDeviceLabel:
                                            selected?.label || "Kulaklık",
                                    });
                                }}
                                className="px-2.5 py-1.5 rounded-md bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
                            >
                                <option value="default">
                                    Varsayılan Sistem Kulaklığı / Hoparlör
                                </option>
                                {outputDevices.map((device) => (
                                    <option
                                        key={device.deviceId}
                                        value={device.deviceId}
                                    >
                                        {device.label ||
                                            `Kulaklık ${device.deviceId.slice(0, 8)}`}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* Microphone Pass-Through Box (CRITICAL FIX FOR USER'S VOICE CUTTING OFF) */}
                <div className="app-card p-4 rounded-xl bg-[#0a0a0a] border border-zinc-800/80 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Mic className="w-3.5 h-3.5 text-zinc-400" />
                            <h2 className="text-xs font-semibold text-white">
                                Mikrofon Geçişi (Mic Pass-Through)
                            </h2>
                        </div>
                        <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                routingConfig.micPassThrough
                                    ? "border-emerald-700 bg-emerald-950 text-emerald-300"
                                    : "border-zinc-800 bg-zinc-950 text-zinc-500"
                            }`}
                        >
                            {routingConfig.micPassThrough
                                ? "MİKROFON AKTİF"
                                : "DEVRE DIŞI"}
                        </span>
                    </div>

                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                        Discord'da mikrofon olarak{" "}
                        <strong className="text-zinc-200">CABLE Output</strong>{" "}
                        seçtiğinizde kendi normal sesinizin gitmesi için burayı
                        açın. Lir mikrofonunuzu alıp sanal kabloya miksler.
                    </p>

                    {/* Toggle Switch */}
                    <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60">
                        <span className="text-xs font-medium text-zinc-200">
                            Mikrofonumu Yayına / Sanal Kabloya Aktar
                        </span>
                        <button
                            onClick={async () => {
                                const nextState = !routingConfig.micPassThrough;
                                if (nextState) {
                                    setMicError(null);
                                    const res =
                                        await audioEngine.setMicrophonePassThrough(
                                            true,
                                            routingConfig.micDeviceId,
                                            routingConfig.micVolume,
                                        );
                                    if (res.success) {
                                        onRoutingConfigChange({
                                            ...routingConfig,
                                            micPassThrough: true,
                                        });
                                        if (
                                            navigator.mediaDevices
                                                ?.enumerateDevices
                                        ) {
                                            const all =
                                                await navigator.mediaDevices.enumerateDevices();
                                            setInputDevices(
                                                all.filter(
                                                    (d) =>
                                                        d.kind === "audioinput",
                                                ),
                                            );
                                            setOutputDevices(
                                                all.filter(
                                                    (d) =>
                                                        d.kind ===
                                                        "audiooutput",
                                                ),
                                            );
                                        }
                                    } else {
                                        setMicError(
                                            res.error ||
                                                "Mikrofona erişilemedi.",
                                        );
                                    }
                                } else {
                                    setMicError(null);
                                    await audioEngine.setMicrophonePassThrough(
                                        false,
                                    );
                                    onRoutingConfigChange({
                                        ...routingConfig,
                                        micPassThrough: false,
                                    });
                                }
                            }}
                            className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                                routingConfig.micPassThrough
                                    ? "bg-emerald-500 justify-end"
                                    : "bg-zinc-800 justify-start"
                            }`}
                        >
                            <div className="w-4 h-4 rounded-full bg-black" />
                        </button>
                    </div>

                    {micError && (
                        <div className="p-2 rounded bg-red-950/70 border border-red-800 text-red-300 text-[11px] flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400" />
                            <span>{micError}</span>
                        </div>
                    )}

                    {/* Physical Mic Selector */}
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-zinc-500">
                            Gerçek Mikrofonunuz (Kulaklık Mikrofonu)
                        </label>
                        <select
                            value={routingConfig.micDeviceId}
                            onChange={(e) => {
                                const newId = e.target.value;
                                const selected = inputDevices.find(
                                    (d) => d.deviceId === newId,
                                );
                                onRoutingConfigChange({
                                    ...routingConfig,
                                    micDeviceId: newId,
                                    micDeviceLabel:
                                        selected?.label || "Mikrofon",
                                });
                            }}
                            className="px-2.5 py-1.5 rounded-md bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
                        >
                            <option value="default">Varsayılan Mikrofon</option>
                            {inputDevices.map((device) => (
                                <option
                                    key={device.deviceId}
                                    value={device.deviceId}
                                >
                                    {device.label ||
                                        `Mikrofon ${device.deviceId.slice(0, 8)}`}
                                </option>
                            ))}
                        </select>

                        {/* Hardware Link Status */}
                        {routingConfig.micPassThrough && (
                            <div className="flex items-center gap-1.5 text-[10px] font-mono mt-0.5 px-1 py-0.5 rounded bg-zinc-950/80 border border-zinc-900">
                                <span
                                    className={`w-1.5 h-1.5 rounded-full ${micStatus.active ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`}
                                />
                                <span
                                    className={
                                        micStatus.active
                                            ? "text-zinc-300"
                                            : "text-amber-400"
                                    }
                                >
                                    {micStatus.active
                                        ? `Donanım: ${micStatus.label || "Aktif"}`
                                        : "Mikrofon taranıyor / Yeniden Başlatın"}
                                </span>
                                {micStatus.muted && (
                                    <span className="text-red-400 bg-red-950 px-1 rounded ml-auto">
                                        Windows Sessizde!
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Live Mic VU Meter */}
                    {routingConfig.micPassThrough && (
                        <div className="flex flex-col gap-1.5 pt-1">
                            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                                <span className="flex items-center gap-1.5">
                                    <Activity
                                        className={`w-3 h-3 ${micLevel > 0 ? "text-emerald-400 animate-pulse" : "text-zinc-500"}`}
                                    />
                                    <span>Mikrofon Sinyal Düzeyi:</span>
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={async () => {
                                            setMicError(null);
                                            await audioEngine.setMicrophonePassThrough(
                                                false,
                                            );
                                            const res =
                                                await audioEngine.setMicrophonePassThrough(
                                                    true,
                                                    routingConfig.micDeviceId,
                                                    routingConfig.micVolume,
                                                );
                                            if (!res.success) {
                                                setMicError(
                                                    res.error ||
                                                        "Mikrofona bağlanılamadı. Windows mikrofon izinlerini kontrol edin.",
                                                );
                                            }
                                        }}
                                        title="Mikrofon bağlantısını yeniden başlat"
                                        className="text-[10px] text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-750 transition-colors cursor-pointer"
                                    >
                                        Yeniden Başlat
                                    </button>
                                    <span className="text-emerald-400 tabular-nums font-bold">
                                        %{micLevel}
                                    </span>
                                </div>
                            </div>
                            <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden border border-zinc-800">
                                <div
                                    className="h-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-75"
                                    style={{
                                        width: `${Math.max(micLevel > 0 ? 5 : 0, micLevel)}%`,
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Discord Quick Configuration Guide */}
            <div className="app-card p-4 rounded-xl bg-[#0a0a0a] border border-zinc-800/80 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <HelpCircle className="w-4 h-4 text-zinc-400" />
                        <h2 className="text-xs font-semibold text-white">
                            Discord & Oyun Nasıl Ayarlanmalı?
                        </h2>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-400">
                        Çokomelli Adımlar
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-zinc-400">
                    <div className="app-card p-3 rounded-lg bg-zinc-950 border border-zinc-850 flex flex-col gap-1.5">
                        <span className="font-mono text-zinc-300 font-bold">
                            1. Lir Ayarı
                        </span>
                        <p className="text-[11px] leading-relaxed">
                            <strong>Ses çıkış ayarları</strong>
                            <strong>Birincil Çıkış:</strong> CABLE Input seçin.
                            <br />
                            <strong>Mikrofon Geçişi:</strong> AÇIK yapıp kendi
                            mikrofonunuzu (örn. Fuxi-H3) seçin.
                        </p>
                    </div>

                    <div className="app-card p-3 rounded-lg bg-zinc-950 border border-zinc-850 flex flex-col gap-1.5">
                        <span className="font-mono text-zinc-300 font-bold">
                            2. Discord Ayarı (Çokomelli!)
                        </span>
                        <p className="text-[11px] leading-relaxed">
                            <strong>Ses giriş ayarları</strong>•{" "}
                            <strong>Giriş Aygıtı:</strong>{" "}
                            <span className="text-white">
                                VB-Audio Virtual Cable (CABLE Output)
                            </span>
                            <br />• <strong>Giriş Sesi:</strong> %100'e getirin.
                            <br />• <strong>
                                Gürültü Azaltma (Krisp):
                            </strong>{" "}
                            <span className="text-amber-300 font-semibold">
                                Devre Dışı / Kapalı
                            </span>{" "}
                            yapın (Krisp sesleri gürültü sanıp aşırı kısar!).
                            <br />• <strong>Yankı Engelleme:</strong> Kapatın.
                            <br />• <strong>Giriş Hassasiyeti:</strong>{" "}
                            Otomatiği kapatıp seviyeyi sola (-60 dB) çekin.
                        </p>
                    </div>

                    <div className="app-card p-3 rounded-lg bg-zinc-950 border border-zinc-850 flex flex-col gap-1.5">
                        <span className="font-mono text-zinc-300 font-bold">
                            3. Kulaklık Durumu
                        </span>
                        <p className="text-[11px] leading-relaxed">
                            <strong>Çift Çıkış</strong> açıkken bastığınız
                            sesleri siz de duyarsınız; kapatırsanız sadece
                            Discord'dakiler duyar.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
