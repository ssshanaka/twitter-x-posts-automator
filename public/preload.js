/**
 * Preload Script - Secure IPC Bridge
 * 
 * This script runs in an isolated context and creates a controlled bridge
 * between the Electron main process (Node.js) and the renderer process (web).
 * 
 * Security Features:
 * - contextIsolation: true - Preload runs in separate context
 * - nodeIntegration: false - Renderer cannot access Node.js
 * - Only exposes specific, safe APIs via contextBridge
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose a controlled API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform information (safe to expose)
  platform: process.platform,
  
  // Version information (safe to expose)
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  },

  // App information
  isElectron: true,

  // Future: Add more controlled APIs here as needed
  // Example: File operations, system dialogs, etc.
  // Always validate and sanitize data in main process before executing
  
  // Example for future use:
  // openFile: () => ipcRenderer.invoke('dialog:openFile'),
  // saveFile: (data) => ipcRenderer.invoke('dialog:saveFile', data)
});

// Log that preload script loaded successfully (dev only)
window.addEventListener('DOMContentLoaded', () => {
  console.log('✅ Electron preload script loaded');
  console.log('✅ Security: Node.js integration disabled');
  console.log('✅ Security: Context isolation enabled');
  console.log('✅ Platform:', process.platform);
});
