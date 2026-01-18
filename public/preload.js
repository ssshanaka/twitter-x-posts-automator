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

  // --- API Bridges ---
  
  // Call Gemini API via Main Process (No CORS)
  geminiGenerate: (apiKey, prompt) => ipcRenderer.invoke('gemini-generate', { apiKey, prompt }),

  // Post to Twitter via Main Process (No CORS, Secure Signing)
  twitterPost: (keys, text) => ipcRenderer.invoke('twitter-post', { keys, text }),

  // --- Secure Storage ---
  
  // Get configuration from secure storage
  getConfig: () => ipcRenderer.invoke('store-get-config'),
  
  // Save configuration to secure storage
  saveConfig: (config) => ipcRenderer.invoke('store-save-config', config),
  
  // Get topics from secure storage
  getTopics: () => ipcRenderer.invoke('store-get-topics'),
  
  // Save topics to secure storage
  saveTopics: (topics) => ipcRenderer.invoke('store-save-topics', topics),
});

// Log that preload script loaded successfully (dev only)
window.addEventListener('DOMContentLoaded', () => {
  console.log('✅ Electron preload script loaded');
  console.log('✅ Security: Node.js integration disabled');
  console.log('✅ Security: Context isolation enabled');
  console.log('✅ Platform:', process.platform);
});
