const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  
  // File dialog
  openFileDialog: () => ipcRenderer.invoke('dialog:openSoundFile'),
  
  // Global shortcuts
  registerHotkeys: (hotkeys) => ipcRenderer.invoke('shortcuts:registerAll', hotkeys),
  unregisterAllHotkeys: () => ipcRenderer.invoke('shortcuts:unregisterAll'),
  onTriggerHotkey: (callback) => {
    const subscription = (_event, key) => callback(key);
    ipcRenderer.on('hotkey:triggered', subscription);
    return () => ipcRenderer.removeListener('hotkey:triggered', subscription);
  },

  // Window controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // System info
  getPlatform: () => process.platform,
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  openUpdateRelease: (url) => ipcRenderer.send('updates:openRelease', url),
  
  // Open external links (VB-Audio cable download, github, etc.)
  openExternal: (url) => ipcRenderer.send('shell:openExternal', url)
});
