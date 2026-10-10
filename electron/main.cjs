const { app, BrowserWindow, globalShortcut, ipcMain, dialog, shell, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');

// Allow audio autoplay, unthrottled Web Audio, and automatic frameless media permissions
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('allow-file-access-from-files');
app.commandLine.appendSwitch('enable-features', 'AudioServiceOutOfProcess');

// Completely disable default File, Edit, View, Window menu
Menu.setApplicationMenu(null);

let mainWindow = null;
let registeredShortcuts = new Set();

const GITHUB_RELEASE_API = 'https://api.github.com/repos/SiberizmBey/Lir/releases/latest';

function parseVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) return null;

  return {
    core: match.slice(1, 4).map(Number),
    prerelease: match[4] ? match[4].split('.') : null
  };
}

function isNewerVersion(latestVersion, currentVersion) {
  const latest = parseVersion(latestVersion);
  const current = parseVersion(currentVersion);
  if (!latest || !current) {
    throw new Error(`Geçersiz sürüm biçimi: ${!latest ? latestVersion : currentVersion}`);
  }

  for (let index = 0; index < latest.core.length; index++) {
    if (latest.core[index] !== current.core[index]) {
      return latest.core[index] > current.core[index];
    }
  }

  if (!latest.prerelease) return !!current.prerelease;
  if (!current.prerelease) return false;

  for (let index = 0; index < Math.max(latest.prerelease.length, current.prerelease.length); index++) {
    const latestPart = latest.prerelease[index];
    const currentPart = current.prerelease[index];
    if (latestPart === undefined) return false;
    if (currentPart === undefined) return true;
    if (latestPart === currentPart) continue;

    const latestNumber = /^\d+$/.test(latestPart) ? Number(latestPart) : null;
    const currentNumber = /^\d+$/.test(currentPart) ? Number(currentPart) : null;
    if (latestNumber !== null && currentNumber !== null) return latestNumber > currentNumber;
    if (latestNumber !== null) return false;
    if (currentNumber !== null) return true;
    return latestPart > currentPart;
  }

  return false;
}

function getAppIconPath() {
  const possiblePaths = [
    // 1. Packaged resources paths
    path.join(process.resourcesPath, 'assets/img/icon.ico'),
    path.join(process.resourcesPath, 'public/assets/img/icon.ico'),
    path.join(process.resourcesPath, 'app.asar.unpacked/public/assets/img/icon.ico'),
    // 2. Local development paths
    path.join(__dirname, '../public/assets/img/icon.ico'),
    path.join(__dirname, '../public/assets/img/icon.png'),
    // 3. Built dist paths
    path.join(__dirname, '../dist/assets/img/icon.ico'),
    path.join(__dirname, '../dist/assets/img/icon.png')
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
    backgroundColor: '#000000',
    title: 'Lir - Modern Soundpad',
    icon: iconPath,
    frame: false, // Pure custom frameless window on all platforms
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false, // Allows loading local file:/// audio URLs without CORS issues
      backgroundThrottling: false // Soundpad must never throttle or pause audio in background!
    }
  });

  // Load local built dist file or dev server
  const distFile = path.join(__dirname, '../dist/index.html');

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (fs.existsSync(distFile)) {
    // When built, always load local HTML file immediately (Zero network dependency!)
    mainWindow.loadFile(distFile);
  } else {
    // Only attempt localhost if dist is not yet built
    mainWindow.loadURL('http://localhost:3000').catch(() => {
      console.log('Lir: localhost:3000 hazır değil. Lütfen önce "npm run build" yapın.');
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Global shortcut registration
function registerGlobalHotkeys(hotkeyList) {
  // Clear existing
  globalShortcut.unregisterAll();
  registeredShortcuts.clear();

  if (!Array.isArray(hotkeyList)) return { success: false, registeredCount: 0 };

  let successCount = 0;
  const failedKeys = [];

  for (const item of hotkeyList) {
    const key = item.hotkey;
    if (!key || typeof key !== 'string') continue;

    // Normalize accelerator for Electron (e.g. "CTRL+1" -> "CommandOrControl+1")
    let accelerator = key
      .replace(/CTRL/gi, 'CommandOrControl')
      .replace(/CONTROL/gi, 'CommandOrControl')
      .replace(/WIN/gi, 'Super')
      .replace(/META/gi, 'Super');

    try {
      const isRegistered = globalShortcut.register(accelerator, () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('hotkey:triggered', key);
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
    failedKeys
  };
}

// App lifecycle
app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.lir.soundboard');
  }

  // Automatically grant microphone and media permissions without OS prompt blocking
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return true;
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(true);
  });

  if (session.defaultSession.setDevicePermissionHandler) {
    session.defaultSession.setDevicePermissionHandler(() => true);
  }

  createWindow();

  // Setup IPC Handlers
  ipcMain.handle('dialog:openSoundFile', async () => {
    if (!mainWindow) return null;

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Ses Dosyası Seç (Lir)',
      buttonLabel: 'Soundboard\'a Ekle',
      filters: [
        { name: 'Ses Dosyaları', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'] },
        { name: 'Tüm Dosyalar', extensions: ['*'] }
      ],
      properties: ['openFile', 'multiSelections']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    // Process chosen files and extract metadata
    return result.filePaths.map((filePath) => {
      const fileName = path.basename(filePath);
      const ext = path.extname(filePath).replace('.', '').toUpperCase();
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
        fileUrl: `file://${filePath.replace(/\\/g, '/')}`,
        size
      };
    });
  });

  ipcMain.handle('shortcuts:registerAll', (_event, hotkeyList) => {
    return registerGlobalHotkeys(hotkeyList);
  });

  ipcMain.handle('shortcuts:unregisterAll', () => {
    globalShortcut.unregisterAll();
    registeredShortcuts.clear();
    return true;
  });

  ipcMain.handle('updates:check', async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(GITHUB_RELEASE_API, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Lir-Desktop-Updater'
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`GitHub releases API yanıtı: ${response.status} ${response.statusText}`);
      }

      const release = await response.json();
      if (
        typeof release.tag_name !== 'string' ||
        typeof release.html_url !== 'string' ||
        !release.html_url.startsWith('https://github.com/SiberizmBey/Lir/releases/')
      ) {
        throw new Error('GitHub yanıtında geçerli bir release bilgisi bulunamadı.');
      }

      if (!isNewerVersion(release.tag_name, app.getVersion())) return null;

      return {
        version: release.tag_name,
        title: typeof release.name === 'string' && release.name.trim()
          ? release.name
          : `Lir ${release.tag_name}`,
        notes: typeof release.body === 'string' ? release.body : '',
        url: release.html_url
      };
    } finally {
      clearTimeout(timeout);
    }
  });

  ipcMain.on('updates:openRelease', (_event, url) => {
    if (typeof url === 'string' && url.startsWith('https://github.com/SiberizmBey/Lir/releases/')) {
      shell.openExternal(url);
    }
  });

  // Window operations
  ipcMain.on('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window:close', () => {
    if (mainWindow) mainWindow.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());

  ipcMain.on('shell:openExternal', (_event, url) => {
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
      shell.openExternal(url);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  // Unregister all global shortcuts to avoid locking OS shortcuts
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
