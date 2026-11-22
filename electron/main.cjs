const {
    app,
    BrowserWindow,
    globalShortcut,
    ipcMain,
    dialog,
    shell,
    Menu,
    session,
    screen,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile, spawn } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

// Allow audio autoplay, unthrottled Web Audio, and automatic frameless media permissions
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("use-fake-ui-for-media-stream");
app.commandLine.appendSwitch("allow-file-access-from-files");
app.commandLine.appendSwitch("enable-features", "AudioServiceOutOfProcess");

// Completely disable default File, Edit, View, Window menu
Menu.setApplicationMenu(null);

let mainWindow = null;
let subtitleOverlayWindow = null;
let registeredShortcuts = new Set();
let lastRequestedHotkeys = [];
let hotkeyFilterConfig = {
    enabled: true,
    manuallyPaused: false,
    pauseInTextInputs: true,
    pausedApps: [],
};
let hotkeyFilterStatus = {
    paused: false,
    reason: undefined,
    activeProcess: undefined,
    activeTitle: undefined,
    matchedRuleName: undefined,
};
let fgWatcherTimer = null;
let fgPsProcess = null;
let subtitleOverlayVisible = false;
let subtitleOverlayText = "";
let subtitleOverlaySettings = {
    x: 100,
    y: 4,
    width: 400,
    height: 510,
    fontSize: 17,
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function applySubtitleOverlaySettings() {
    if (!subtitleOverlayWindow || subtitleOverlayWindow.isDestroyed()) return;

    const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
    const overlayWidth = Math.min(subtitleOverlaySettings.width, width - 16);
    const overlayHeight = Math.min(subtitleOverlaySettings.height, height - 16);
    const maxX = x + width - overlayWidth;
    const maxY = y + height - overlayHeight;
    const bounds = {
        x: Math.round(x + ((maxX - x) * subtitleOverlaySettings.x) / 100),
        y: Math.round(y + ((maxY - y) * subtitleOverlaySettings.y) / 100),
        width: overlayWidth,
        height: overlayHeight,
    };

    subtitleOverlayWindow.setBounds(bounds);
    if (!subtitleOverlayWindow.webContents.isLoading()) {
        subtitleOverlayWindow.webContents.send(
            "subtitle-overlay:settings",
            subtitleOverlaySettings,
        );
    }
}

function sendSubtitleOverlayVisibility() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(
            "subtitle-overlay:visibility",
            subtitleOverlayVisible,
        );
    }
}

function createSubtitleOverlayWindow() {
    if (subtitleOverlayWindow && !subtitleOverlayWindow.isDestroyed()) {
        return subtitleOverlayWindow;
    }

    subtitleOverlayWindow = new BrowserWindow({
        width: subtitleOverlaySettings.width,
        height: subtitleOverlaySettings.height,
        minWidth: 320,
        maxWidth: 1200,
        frame: false,
        transparent: true,
        backgroundColor: "#00000000",
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        focusable: false,
        skipTaskbar: true,
        hasShadow: false,
        alwaysOnTop: true,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            backgroundThrottling: false,
        },
    });
    subtitleOverlayWindow.setAlwaysOnTop(true);
    subtitleOverlayWindow.setContentProtection(true);
    subtitleOverlayWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
    });
    subtitleOverlayWindow.setIgnoreMouseEvents(true, { forward: true });

    const distFile = path.join(__dirname, "../dist/index.html");
    if (process.env.VITE_DEV_SERVER_URL) {
        subtitleOverlayWindow.loadURL(
            `${process.env.VITE_DEV_SERVER_URL}#subtitle-overlay`,
        );
    } else if (fs.existsSync(distFile)) {
        subtitleOverlayWindow.loadFile(distFile, {
            hash: "subtitle-overlay",
        });
    } else {
        subtitleOverlayWindow.loadURL(
            "http://localhost:3000/#subtitle-overlay",
        );
    }

    subtitleOverlayWindow.webContents.on("did-finish-load", () => {
        applySubtitleOverlaySettings();
        if (subtitleOverlayText) {
            subtitleOverlayWindow?.webContents.send(
                "subtitle-overlay:update",
                subtitleOverlayText,
            );
        }
    });
    subtitleOverlayWindow.on("closed", () => {
        subtitleOverlayWindow = null;
        subtitleOverlayVisible = false;
        sendSubtitleOverlayVisibility();
    });

    return subtitleOverlayWindow;
}

function setSubtitleOverlayVisible(visible) {
    if (visible) {
        const overlay = createSubtitleOverlayWindow();
        applySubtitleOverlaySettings();
        overlay.showInactive();
    } else if (subtitleOverlayWindow && !subtitleOverlayWindow.isDestroyed()) {
        subtitleOverlayWindow.hide();
    }

    subtitleOverlayVisible = visible;
    sendSubtitleOverlayVisibility();
}

function registerSubtitleOverlayShortcut() {
    globalShortcut.unregister("Control+Shift+Y");
    const registered = globalShortcut.register("Control+Shift+Y", () => {
        setSubtitleOverlayVisible(!subtitleOverlayVisible);
    });
    if (!registered) {
        console.warn("Altyazı penceresi kısayolu kaydedilemedi: Ctrl+Shift+Y");
    }
}

// Discord Rich Presence (RPC) Configuration
let DiscordRPC = null;
try {
    DiscordRPC = require("discord-rpc");
} catch (e) {
    console.warn("discord-rpc paketi yüklenemedi:", e);
}

const DISCORD_CLIENT_ID = "1558769862053077114";
let rpcClient = null;
let isRpcConnected = false;
let isRpcEnabled = false;
let appStartTime = Math.floor(Date.now() / 1000);

if (DiscordRPC) {
    try {
        DiscordRPC.register(DISCORD_CLIENT_ID);
    } catch (e) {
        console.warn("DiscordRPC.register uyarısı:", e);
    }
}

function initDiscordRPC() {
    if (!DiscordRPC || !isRpcEnabled) return;
    if (rpcClient) {
        try {
            rpcClient.destroy();
        } catch (e) {}
        rpcClient = null;
    }

    try {
        rpcClient = new DiscordRPC.Client({ transport: "ipc" });

        rpcClient.on("ready", () => {
            if (!isRpcEnabled) return;
            isRpcConnected = true;
            console.log(
                "Discord RPC: Bağlantı kuruldu! Kullanıcı:",
                rpcClient.user?.username || "Lir",
            );
            updateDiscordActivity({
                details: "Lir",
                state: "Hazırda bekliyor",
                startTimestamp: appStartTime,
                largeImageKey: "icon",
                largeImageText: "Lir - Modern Soundpad",
                smallImageKey: "mic",
                smallImageText: "VB-Audio Aktif",
            });
            sendDiscordStatus();
        });

        rpcClient.on("disconnected", () => {
            isRpcConnected = false;
            sendDiscordStatus();
        });

        rpcClient.login({ clientId: DISCORD_CLIENT_ID }).catch((err) => {
            isRpcConnected = false;
            console.log(
                "Discord RPC: Discord istemcisi kapalı veya bağlantı başarısız:",
                err?.message || err,
            );
            sendDiscordStatus({ error: err?.message });
        });
    } catch (err) {
        console.warn("Discord RPC başlatma hatası:", err);
        isRpcConnected = false;
        sendDiscordStatus({ error: err?.message || String(err) });
    }
}

function getDiscordStatus(extra = {}) {
    return {
        connected: isRpcConnected,
        clientId: DISCORD_CLIENT_ID,
        username: rpcClient?.user?.username || undefined,
        ...extra,
    };
}

function sendDiscordStatus(extra = {}) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("discord:status", getDiscordStatus(extra));
    }
}

function setDiscordRPCEnabled(enabled) {
    isRpcEnabled = enabled;
    if (enabled) {
        initDiscordRPC();
    } else {
        isRpcConnected = false;
        if (rpcClient) {
            try {
                rpcClient.destroy();
            } catch (err) {
                console.warn("Discord RPC kapatma hatası:", err);
            }
            rpcClient = null;
        }
        sendDiscordStatus();
    }
    return getDiscordStatus();
}

function updateDiscordActivity(activity) {
    if (!isRpcEnabled || !rpcClient || !isRpcConnected) return;
    try {
        const act = {
            details: activity.details || "Lir • Gelişmiş Soundpad",
            state: activity.state || "Hazırda bekliyor",
            startTimestamp: activity.startTimestamp || appStartTime,
            largeImageKey: activity.largeImageKey || "icon",
            largeImageText: activity.largeImageText || "Lir - Modern Soundpad",
            smallImageKey: activity.smallImageKey,
            smallImageText: activity.smallImageText,
            instance: false,
        };
        rpcClient.setActivity(act).catch((err) => {
            console.warn("Discord RPC setActivity hatası:", err);
        });
    } catch (err) {
        console.warn("Discord RPC güncelleme hatası:", err);
    }
}

const GITHUB_RELEASES_API =
    "https://api.github.com/repos/SiberizmBey/Lir/releases?per_page=100";

function parseVersion(version) {
    const match =
        /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
            version,
        );
    if (!match) return null;

    return {
        core: match.slice(1, 4).map(Number),
        prerelease: match[4] ? match[4].split(".") : null,
    };
}

function isNewerVersion(latestVersion, currentVersion) {
    const latest = parseVersion(latestVersion);
    const current = parseVersion(currentVersion);
    if (!latest || !current) {
        throw new Error(
            `Geçersiz sürüm biçimi: ${!latest ? latestVersion : currentVersion}`,
        );
    }

    for (let index = 0; index < latest.core.length; index++) {
        if (latest.core[index] !== current.core[index]) {
            return latest.core[index] > current.core[index];
        }
    }

    if (!latest.prerelease) return !!current.prerelease;
    if (!current.prerelease) return false;

    for (
        let index = 0;
        index < Math.max(latest.prerelease.length, current.prerelease.length);
        index++
    ) {
        const latestPart = latest.prerelease[index];
        const currentPart = current.prerelease[index];
        if (latestPart === undefined) return false;
        if (currentPart === undefined) return true;
        if (latestPart === currentPart) continue;

        const latestNumber = /^\d+$/.test(latestPart)
            ? Number(latestPart)
            : null;
        const currentNumber = /^\d+$/.test(currentPart)
            ? Number(currentPart)
            : null;
        if (latestNumber !== null && currentNumber !== null)
            return latestNumber > currentNumber;
        if (latestNumber !== null) return false;
        if (currentNumber !== null) return true;
        return latestPart > currentPart;
    }

    return false;
}

function getAppIconPath() {
    const possiblePaths = [
        // 1. Packaged resources paths
        path.join(process.resourcesPath, "assets/img/icon.ico"),
        path.join(process.resourcesPath, "public/assets/img/icon.ico"),
        path.join(
            process.resourcesPath,
            "app.asar.unpacked/public/assets/img/icon.ico",
        ),
        // 2. Local development paths
        path.join(__dirname, "../public/assets/img/icon.ico"),
        path.join(__dirname, "../public/assets/img/icon.png"),
        // 3. Built dist paths
        path.join(__dirname, "../dist/assets/img/icon.ico"),
        path.join(__dirname, "../dist/assets/img/icon.png"),
    ];

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) return p;
    }
    return undefined;
}

function createWindow() {
    const iconPath = getAppIconPath();

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 1024,
        minHeight: 680,
        backgroundColor: "#000000",
        title: "Lir - Modern Soundpad",
        icon: iconPath,
        frame: false, // Pure custom frameless window on all platforms
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            webSecurity: false, // Allows loading local file:/// audio URLs without CORS issues
            backgroundThrottling: false, // Soundpad must never throttle or pause audio in background!
        },
    });

    // Load local built dist file or dev server
    const distFile = path.join(__dirname, "../dist/index.html");

    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else if (fs.existsSync(distFile)) {
        // When built, always load local HTML file immediately (Zero network dependency!)
        mainWindow.loadFile(distFile);
    } else {
        // Only attempt localhost if dist is not yet built
        mainWindow.loadURL("http://localhost:3000").catch(() => {
            console.log(
                'Lir: localhost:3000 hazır değil. Lütfen önce "npm run build" yapın.',
            );
        });
    }

    mainWindow.on("closed", () => {
        mainWindow = null;
        if (subtitleOverlayWindow && !subtitleOverlayWindow.isDestroyed()) {
            subtitleOverlayWindow.close();
        }
    });
}

// Global shortcut registration
function registerGlobalHotkeys(hotkeyList) {
    // Clear existing
    globalShortcut.unregisterAll();
    registeredShortcuts.clear();
    registerSubtitleOverlayShortcut();

    if (!Array.isArray(hotkeyList))
        return { success: false, registeredCount: 0 };

    let successCount = 0;
    const failedKeys = [];

    for (const item of hotkeyList) {
        const key = item.hotkey;
        if (!key || typeof key !== "string") continue;

        // Normalize accelerator for Electron (e.g. "CTRL+1" -> "CommandOrControl+1")
        let accelerator = key
            .replace(/CTRL/gi, "CommandOrControl")
            .replace(/CONTROL/gi, "CommandOrControl")
            .replace(/WIN/gi, "Super")
            .replace(/META/gi, "Super")
            .replace(/\bNUMPAD\s*([0-9])\b/gi, "num$1")
            .replace(/^ESC$/i, "Escape")
            .replace(/\+ESC$/i, "+Escape")
            .replace(/^SPACE$/i, "Space")
            .replace(/\+SPACE$/i, "+Space");

        try {
            const isRegistered = globalShortcut.register(accelerator, () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send("hotkey:triggered", key);
                }
            });

            if (isRegistered) {
                registeredShortcuts.add(key);
                successCount++;
            } else {
                failedKeys.push(key);
            }
        } catch (err) {
            console.warn(`Failed to register shortcut ${key}:`, err);
            failedKeys.push(key);
        }
    }

    return {
        success: true,
        registeredCount: successCount,
        failedKeys,
    };
}

const ELECTRON_COMMON_APPS = [
    { name: "Google Chrome", processName: "chrome.exe", source: "catalog" },
    { name: "Microsoft Edge", processName: "msedge.exe", source: "catalog" },
    { name: "Mozilla Firefox", processName: "firefox.exe", source: "catalog" },
    { name: "Brave Browser", processName: "brave.exe", source: "catalog" },
    { name: "Opera", processName: "opera.exe", source: "catalog" },
    { name: "Opera GX", processName: "opera_gx.exe", source: "catalog" },
    { name: "1Password", processName: "1Password.exe", source: "catalog" },
    { name: "Bitwarden", processName: "Bitwarden.exe", source: "catalog" },
    { name: "KeePassXC", processName: "KeePassXC.exe", source: "catalog" },
    { name: "Discord", processName: "Discord.exe", source: "catalog" },
    { name: "Steam", processName: "steam.exe", source: "catalog" },
    { name: "Valorant", processName: "VALORANT-Win64-Shipping.exe", source: "catalog" },
    { name: "Counter-Strike 2", processName: "cs2.exe", source: "catalog" },
    { name: "League of Legends", processName: "League of Legends.exe", source: "catalog" },
    { name: "Minecraft / Java", processName: "javaw.exe", source: "catalog" },
    { name: "Roblox", processName: "RobloxPlayerBeta.exe", source: "catalog" },
    { name: "Visual Studio Code", processName: "Code.exe", source: "catalog" },
];

function normProcName(name) {
    return String(name || "").trim().toLowerCase().replace(/\.exe$/, "");
}

function sendHotkeyFilterStatus(nextStatus) {
    const changed =
        hotkeyFilterStatus.paused !== nextStatus.paused ||
        hotkeyFilterStatus.reason !== nextStatus.reason ||
        hotkeyFilterStatus.activeProcess !== nextStatus.activeProcess ||
        hotkeyFilterStatus.matchedRuleName !== nextStatus.matchedRuleName;
    hotkeyFilterStatus = nextStatus;
    if (changed && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("shortcuts:filterStatus", hotkeyFilterStatus);
    }
}

function applyEffectiveHotkeyState(nextStatus) {
    const wasPaused = hotkeyFilterStatus.paused;
    sendHotkeyFilterStatus(nextStatus);
    if (nextStatus.paused && !wasPaused) {
        globalShortcut.unregisterAll();
        registeredShortcuts.clear();
        registerSubtitleOverlayShortcut();
    } else if (!nextStatus.paused && wasPaused) {
        registerGlobalHotkeys(lastRequestedHotkeys);
    }
}

function evaluateForegroundApp(activeProcess, activeTitle) {
    if (hotkeyFilterConfig.manuallyPaused) {
        applyEffectiveHotkeyState({
            paused: true,
            reason: "manual",
            activeProcess,
            activeTitle,
        });
        return;
    }

    if (!hotkeyFilterConfig.enabled) {
        applyEffectiveHotkeyState({
            paused: false,
            activeProcess,
            activeTitle,
        });
        return;
    }

    const enabledRules = (hotkeyFilterConfig.pausedApps || []).filter((r) => r && r.enabled);
    const procNorm = normProcName(activeProcess);
    const titleLower = String(activeTitle || "").toLowerCase();

    const matchedRule = enabledRules.find((rule) => {
        const ruleProc = normProcName(rule.processName);
        if (!ruleProc || ruleProc !== procNorm) return false;
        if (rule.titleMatch && rule.titleMatch.trim()) {
            return titleLower.includes(rule.titleMatch.trim().toLowerCase());
        }
        return true;
    });

    if (matchedRule) {
        applyEffectiveHotkeyState({
            paused: true,
            reason: "app",
            activeProcess,
            activeTitle,
            matchedRuleName: matchedRule.name || matchedRule.processName,
        });
    } else {
        applyEffectiveHotkeyState({
            paused: false,
            activeProcess,
            activeTitle,
        });
    }
}

function stopForegroundWatcher() {
    if (fgWatcherTimer) {
        clearInterval(fgWatcherTimer);
        fgWatcherTimer = null;
    }
    if (fgPsProcess) {
        try {
            fgPsProcess.kill();
        } catch {}
        fgPsProcess = null;
    }
}

function startForegroundWatcherIfNeeded() {
    const hasRules =
        hotkeyFilterConfig.enabled &&
        Array.isArray(hotkeyFilterConfig.pausedApps) &&
        hotkeyFilterConfig.pausedApps.some((r) => r && r.enabled);

    if (!hasRules) {
        stopForegroundWatcher();
        if (hotkeyFilterConfig.manuallyPaused) {
            applyEffectiveHotkeyState({ paused: true, reason: "manual" });
        } else {
            applyEffectiveHotkeyState({ paused: false });
        }
        return;
    }

    if (fgWatcherTimer || fgPsProcess) return;

    if (process.platform === "win32") {
        const psScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class LirFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@
while ($true) {
  try {
    $hwnd = [LirFg]::GetForegroundWindow()
    if ($hwnd -ne [IntPtr]::Zero) {
      [uint32]$pid = 0
      [void][LirFg]::GetWindowThreadProcessId($hwnd, [ref]$pid)
      $sb = New-Object System.Text.StringBuilder 256
      [void][LirFg]::GetWindowText($hwnd, $sb, 256)
      $p = Get-Process -Id $pid -ErrorAction SilentlyContinue
      if ($p) {
        $obj = @{ proc = "$($p.ProcessName).exe"; title = $sb.ToString() } | ConvertTo-Json -Compress
        Write-Output $obj
      }
    }
  } catch {}
  Start-Sleep -Milliseconds 650
}
`;
        try {
            const child = spawn("powershell", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", psScript], {
                windowsHide: true,
            });
            fgPsProcess = child;
            let buffer = "";
            child.stdout.on("data", (chunk) => {
                buffer += chunk.toString("utf8");
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || "";
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    try {
                        const parsed = JSON.parse(trimmed);
                        evaluateForegroundApp(parsed.proc, parsed.title);
                    } catch {}
                }
            });
            child.on("exit", () => {
                if (fgPsProcess === child) fgPsProcess = null;
            });
            return;
        } catch (err) {
            console.warn("Foreground watcher fallback:", err);
        }
    }

    // macOS / Linux lightweight poll fallback
    fgWatcherTimer = setInterval(async () => {
        try {
            if (process.platform === "darwin") {
                const { stdout } = await execFileAsync("osascript", [
                    "-e",
                    'tell application "System Events" to get {name of first application process whose frontmost is true, ""}',
                ]);
                const proc = stdout.split(",")[0]?.trim();
                if (proc) evaluateForegroundApp(proc, "");
            } else if (process.platform === "linux") {
                const { stdout } = await execFileAsync("sh", [
                    "-c",
                    'wid=$(xprop -root _NET_ACTIVE_WINDOW 2>/dev/null | awk "{print \\$NF}"); if [ -n "$wid" ] && [ "$wid" != "0x0" ]; then pid=$(xprop -id "$wid" _NET_WM_PID 2>/dev/null | awk "{print \\$NF}"); title=$(xprop -id "$wid" _NET_WM_NAME 2>/dev/null | cut -d\\\" -f2); proc=$(ps -p "$pid" -o comm= 2>/dev/null); echo "$proc|$title"; fi',
                ]);
                const [proc, title] = stdout.trim().split("|");
                if (proc) evaluateForegroundApp(proc, title || "");
            }
        } catch {}
    }, 800);
}

async function scanElectronSystemApps() {
    const appMap = new Map();
    const put = (item) => {
        if (!item || !item.processName) return;
        const key = normProcName(item.processName);
        if (!key) return;
        const existing = appMap.get(key);
        if (!existing || (existing.source === "catalog" && item.source !== "catalog")) {
            appMap.set(key, item);
        }
    };

    try {
        if (process.platform === "win32") {
            const { stdout } = await execFileAsync(
                "powershell",
                [
                    "-NoProfile",
                    "-Command",
                    "Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object ProcessName,MainWindowTitle,Path | ConvertTo-Json -Compress",
                ],
                { timeout: 4500, windowsHide: true },
            );
            const parsed = JSON.parse(stdout || "[]");
            const list = Array.isArray(parsed) ? parsed : [parsed];
            for (const p of list) {
                if (!p || !p.ProcessName) continue;
                put({
                    name: p.ProcessName,
                    processName: `${p.ProcessName}.exe`,
                    windowTitle: p.MainWindowTitle || undefined,
                    path: p.Path || undefined,
                    source: "running",
                });
            }

            // Start Menu shortcuts
            const { stdout: lnkOut } = await execFileAsync(
                "powershell",
                [
                    "-NoProfile",
                    "-Command",
                    "$sh=New-Object -ComObject WScript.Shell; @(\"$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\",\"$env:AppData\\Microsoft\\Windows\\Start Menu\\Programs\") | ForEach-Object { if (Test-Path $_) { Get-ChildItem $_ -Filter *.lnk -Recurse -ErrorAction SilentlyContinue } } | Select-Object -First 80 | ForEach-Object { try { $s=$sh.CreateShortcut($_.FullName); if($s.TargetPath -like '*.exe'){ [PSCustomObject]@{Name=$_.BaseName;Exe=[System.IO.Path]::GetFileName($s.TargetPath);Path=$s.TargetPath} } } catch {} } | ConvertTo-Json -Compress",
                ],
                { timeout: 6000, windowsHide: true },
            );
            const lnkParsed = JSON.parse(lnkOut || "[]");
            const lnkList = Array.isArray(lnkParsed) ? lnkParsed : [lnkParsed];
            for (const item of lnkList) {
                if (!item || !item.Exe) continue;
                put({
                    name: item.Name || item.Exe.replace(/\.exe$/i, ""),
                    processName: item.Exe,
                    path: item.Path,
                    source: "installed",
                });
            }
        } else if (process.platform === "darwin") {
            if (fs.existsSync("/Applications")) {
                for (const entry of fs.readdirSync("/Applications")) {
                    if (entry.endsWith(".app")) {
                        const base = entry.replace(/\.app$/, "");
                        put({
                            name: base,
                            processName: base,
                            path: `/Applications/${entry}`,
                            source: "installed",
                        });
                    }
                }
            }
        } else {
            const { stdout } = await execFileAsync("ps", ["-e", "-o", "comm="], { timeout: 2500 });
            for (const line of stdout.split(/\r?\n/)) {
                const comm = line.trim();
                if (comm && !comm.startsWith("kworker")) {
                    put({ name: comm, processName: comm, source: "running" });
                }
            }
            for (const dir of ["/usr/share/applications", path.join(os.homedir(), ".local/share/applications")]) {
                if (!fs.existsSync(dir)) continue;
                for (const file of fs.readdirSync(dir)) {
                    if (!file.endsWith(".desktop")) continue;
                    try {
                        const txt = fs.readFileSync(path.join(dir, file), "utf8");
                        const nm = txt.match(/^Name=(.+)$/m)?.[1]?.trim();
                        const ex = txt.match(/^Exec=(.+)$/m)?.[1]?.trim()?.split(/\s+/)[0];
                        if (nm && ex) {
                            put({ name: nm, processName: path.basename(ex), source: "installed" });
                        }
                    } catch {}
                }
            }
        }
    } catch (err) {
        console.warn("App scan error:", err);
    }

    for (const c of ELECTRON_COMMON_APPS) {
        put(c);
    }

    const rank = { running: 0, installed: 1, catalog: 2 };
    return Array.from(appMap.values()).sort((a, b) => {
        if (rank[a.source] !== rank[b.source]) return rank[a.source] - rank[b.source];
        return a.name.localeCompare(b.name);
    });
}

// App lifecycle
app.whenReady().then(() => {
    if (process.platform === "win32") {
        app.setAppUserModelId("com.lir.soundboard");
    }

    // Automatically grant microphone and media permissions without OS prompt blocking
    session.defaultSession.setPermissionCheckHandler(
        (_webContents, permission) => {
            return true;
        },
    );

    session.defaultSession.setPermissionRequestHandler(
        (_webContents, permission, callback) => {
            callback(true);
        },
    );

    if (session.defaultSession.setDevicePermissionHandler) {
        session.defaultSession.setDevicePermissionHandler(() => true);
    }

    createWindow();
    // Setup IPC Handlers
    registerSubtitleOverlayShortcut();

    ipcMain.handle("subtitle-overlay:setVisible", (event, visible) => {
        if (
            !mainWindow ||
            event.sender !== mainWindow.webContents ||
            typeof visible !== "boolean"
        ) {
            return false;
        }

        setSubtitleOverlayVisible(visible);
        return true;
    });

    ipcMain.handle("subtitle-overlay:setSettings", (event, settings) => {
        if (
            !mainWindow ||
            event.sender !== mainWindow.webContents ||
            !settings ||
            !["x", "y", "width", "height", "fontSize"].every((key) =>
                Number.isFinite(settings[key]),
            )
        ) {
            return false;
        }

        subtitleOverlaySettings = {
            x: clamp(Math.round(settings.x), 0, 100),
            y: clamp(Math.round(settings.y), 0, 100),
            width: clamp(Math.round(settings.width), 320, 1200),
            height: clamp(Math.round(settings.height), 100, 700),
            fontSize: clamp(Math.round(settings.fontSize), 14, 48),
        };
        applySubtitleOverlaySettings();
        return true;
    });

    ipcMain.on("subtitle-overlay:update", (event, translation) => {
        if (
            !mainWindow ||
            event.sender !== mainWindow.webContents ||
            typeof translation !== "string"
        ) {
            return;
        }

        subtitleOverlayText = translation.slice(0, 2000);
        if (
            subtitleOverlayWindow &&
            !subtitleOverlayWindow.isDestroyed() &&
            subtitleOverlayWindow.webContents.isLoading() === false
        ) {
            subtitleOverlayWindow.webContents.send(
                "subtitle-overlay:update",
                subtitleOverlayText,
            );
        }
    });

    ipcMain.handle("dialog:openSoundFile", async () => {
        if (!mainWindow) return null;

        const result = await dialog.showOpenDialog(mainWindow, {
            title: "Ses Dosyası Seç (Lir)",
            buttonLabel: "Soundboard'a Ekle",
            filters: [
                {
                    name: "Ses Dosyaları",
                    extensions: ["mp3", "wav", "ogg", "flac", "m4a", "aac"],
                },
                { name: "Tüm Dosyalar", extensions: ["*"] },
            ],
            properties: ["openFile", "multiSelections"],
        });

        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }

        // Process chosen files and extract metadata
        return result.filePaths.map((filePath) => {
            const fileName = path.basename(filePath);
            const ext = path.extname(filePath).replace(".", "").toUpperCase();
            let size = 0;
            try {
                const stats = fs.statSync(filePath);
                size = stats.size;
            } catch (e) {
                // ignore
            }

            return {
                path: filePath,
                name: fileName.replace(/\.[^/.]+$/, ""),
                format: ext,
                fileUrl: `file://${filePath.replace(/\\/g, "/")}`,
                size,
            };
        });
    });

    ipcMain.handle("shortcuts:registerAll", (_event, hotkeyList) => {
        lastRequestedHotkeys = Array.isArray(hotkeyList) ? hotkeyList : [];
        if (hotkeyFilterStatus.paused) {
            return {
                success: true,
                registeredCount: 0,
                failedKeys: [],
            };
        }
        return registerGlobalHotkeys(lastRequestedHotkeys);
    });

    ipcMain.handle("shortcuts:unregisterAll", () => {
        lastRequestedHotkeys = [];
        globalShortcut.unregisterAll();
        registeredShortcuts.clear();
        registerSubtitleOverlayShortcut();
        return true;
    });

    ipcMain.handle("apps:listInstalled", async () => {
        return await scanElectronSystemApps();
    });

    ipcMain.handle("shortcuts:setFilterConfig", (_event, cfg) => {
        if (!cfg || typeof cfg !== "object") return false;
        hotkeyFilterConfig = {
            enabled: Boolean(cfg.enabled),
            manuallyPaused: Boolean(cfg.manuallyPaused),
            pauseInTextInputs: Boolean(cfg.pauseInTextInputs),
            pausedApps: Array.isArray(cfg.pausedApps) ? cfg.pausedApps : [],
        };
        if (hotkeyFilterConfig.manuallyPaused) {
            applyEffectiveHotkeyState({ paused: true, reason: "manual" });
        } else if (!hotkeyFilterConfig.enabled) {
            applyEffectiveHotkeyState({ paused: false });
        }
        startForegroundWatcherIfNeeded();
        return true;
    });

    ipcMain.handle("updates:check", async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch(GITHUB_RELEASES_API, {
                headers: {
                    Accept: "application/vnd.github+json",
                    "User-Agent": "Lir-Desktop-Updater",
                },
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(
                    `GitHub releases API yanıtı: ${response.status} ${response.statusText}`,
                );
            }

            const releases = await response.json();
            if (!Array.isArray(releases)) {
                throw new Error(
                    "GitHub yanıtında geçerli bir release listesi bulunamadı.",
                );
            }

            const currentVersion = app.getVersion();
            const release = releases.reduce((latest, candidate) => {
                if (
                    !candidate ||
                    candidate.draft ||
                    typeof candidate.tag_name !== "string" ||
                    typeof candidate.html_url !== "string" ||
                    !candidate.html_url.startsWith(
                        "https://github.com/SiberizmBey/Lir/releases/",
                    ) ||
                    !parseVersion(candidate.tag_name) ||
                    !isNewerVersion(candidate.tag_name, currentVersion)
                ) {
                    return latest;
                }

                return !latest ||
                    isNewerVersion(candidate.tag_name, latest.tag_name)
                    ? candidate
                    : latest;
            }, null);

            if (!release) return null;

            return {
                version: release.tag_name,
                title:
                    typeof release.name === "string" && release.name.trim()
                        ? release.name
                        : `Lir ${release.tag_name}`,
                notes: typeof release.body === "string" ? release.body : "",
                url: release.html_url,
            };
        } finally {
            clearTimeout(timeout);
        }
    });

    ipcMain.on("updates:openRelease", (_event, url) => {
        if (
            typeof url === "string" &&
            url.startsWith("https://github.com/SiberizmBey/Lir/releases/")
        ) {
            shell.openExternal(url);
        }
    });

    // Window operations
    ipcMain.on("window:minimize", () => {
        if (mainWindow) mainWindow.minimize();
    });

    ipcMain.on("window:maximize", () => {
        if (mainWindow) {
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize();
            } else {
                mainWindow.maximize();
            }
        }
    });

    ipcMain.on("window:close", () => {
        if (mainWindow) mainWindow.close();
    });

    ipcMain.handle("window:isMaximized", () => {
        return mainWindow ? mainWindow.isMaximized() : false;
    });

    ipcMain.handle("app:getVersion", () => app.getVersion());

    ipcMain.on("shell:openExternal", (_event, url) => {
        if (url && (url.startsWith("https://") || url.startsWith("http://"))) {
            shell.openExternal(url);
        }
    });

    // Discord Rich Presence IPC
    ipcMain.handle("discord:getStatus", () => getDiscordStatus());

    ipcMain.handle("discord:setEnabled", (_event, enabled) => {
        if (typeof enabled !== "boolean") {
            throw new Error("Discord RPC ayarı geçersiz.");
        }
        return setDiscordRPCEnabled(enabled);
    });

    ipcMain.handle("discord:setActivity", (_event, activity) => {
        updateDiscordActivity(activity);
        return true;
    });

    ipcMain.handle("discord:reconnect", () => {
        if (!isRpcEnabled) return false;
        initDiscordRPC();
        return isRpcConnected;
    });

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("will-quit", () => {
    stopForegroundWatcher();
    // Clean up Discord RPC
    if (rpcClient) {
        try {
            rpcClient.destroy();
        } catch (e) {}
        rpcClient = null;
    }
    // Unregister all global shortcuts to avoid locking OS shortcuts
    globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
