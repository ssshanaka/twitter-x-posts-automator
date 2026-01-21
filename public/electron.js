const { app, BrowserWindow, Menu, ipcMain, safeStorage, Tray } = require('electron');
const path = require('path');
const crypto = require('crypto');
const Store = require('electron-store');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');
const isDev = process.env.NODE_ENV !== 'production';

// Configure electron-log
// In production: logs saved to %APPDATA%/twitter-x-automator/logs/
// In development: logs to console + file
log.transports.file.level = 'info';
log.transports.console.level = isDev ? 'debug' : 'info';
log.info('=== Twitter Automator Started ===');
log.info(`Environment: ${isDev ? 'Development' : 'Production'}`);
log.info(`App Version: ${app.getVersion()}`);
log.info(`Electron Version: ${process.versions.electron}`);
log.info(`Log file location: ${log.transports.file.getFile().path}`);

// Configure auto-updater to use electron-log
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false; // Let user decide to download
autoUpdater.autoInstallOnAppQuit = true; // Install on quit if downloaded
log.info('Auto-updater configured');


// First, try to migrate from old encrypted storage (with hardcoded key)
let oldStore;
let needsMigration = false;
try {
  // Try to read with old encryption key
  oldStore = new Store({
    encryptionKey: 'twitter-automator-secure-key',
    name: 'config' // electron-store default name
  });
  
  // Check if there's old config data to migrate
  const oldConfig = oldStore.get('config');
  if (oldConfig && (oldConfig.geminiKey || oldConfig.twitterConsumerKey)) {
    needsMigration = true;
  }
} catch (error) {
  // If migration fails, that's okay - we'll start fresh
  log.info('No old config to migrate or migration failed:', error.message);
}

// Initialize new storage without encryption (we'll use safeStorage for sensitive data)
const store = new Store({
  name: 'config',
  clearInvalidConfig: true, // Clear if JSON is invalid
  defaults: {
    topics: [],
    autoLaunch: false // Auto-launch on system startup
  }
});

// Helper functions for secure storage using OS-level encryption
const secureStorage = {
  // Encrypt and store sensitive data using OS keychain
  set: (key, value) => {
    if (!value) {
      store.delete(key);
      return;
    }
    
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(value);
      // Store as base64 for safe JSON serialization
      store.set(key, encrypted.toString('base64'));
    } else {
      // Fallback for systems where encryption is not available
      log.warn('safeStorage not available, storing unencrypted');
      store.set(key, value);
    }
  },
  
  // Retrieve and decrypt sensitive data
  get: (key, defaultValue = '') => {
    const stored = store.get(key);
    if (!stored) return defaultValue;
    
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(stored, 'base64');
        return safeStorage.decryptString(buffer);
      } catch (error) {
        log.error(`Failed to decrypt ${key}:`, error);
        return defaultValue;
      }
    } else {
      // Fallback: data was stored unencrypted
      return stored;
    }
  }
};

// Keep a global reference to prevent garbage collection
let mainWindow;
let tray = null;

// --- OAuth 1.0a Helper (Node.js version) ---
const OAuth = {
  percentEncode: (str) => {
    return encodeURIComponent(str)
      .replace(/!/g, '%21')
      .replace(/\*/g, '%2A')
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29');
  },

  getNonce: () => {
    return crypto.randomBytes(16).toString('hex'); // Generate random nonce
  },

  getTimestamp: () => {
    return Math.floor(Date.now() / 1000).toString();
  },

  generateSignature: (method, url, params, consumerSecret, tokenSecret) => {
    const sortedKeys = Object.keys(params).sort();
    let paramString = '';
    
    sortedKeys.forEach((key, index) => {
      paramString += `${key}=${OAuth.percentEncode(params[key])}`;
      if (index < sortedKeys.length - 1) paramString += '&';
    });

    const signatureBase = `${method.toUpperCase()}&${OAuth.percentEncode(url)}&${OAuth.percentEncode(paramString)}`;
    const signingKey = `${OAuth.percentEncode(consumerSecret)}&${OAuth.percentEncode(tokenSecret)}`;
    
    return crypto.createHmac('sha1', signingKey).update(signatureBase).digest('base64');
  }
};

// --- IPC Handlers ---

// 1. Gemini Generation Handler
ipcMain.handle('gemini-generate', async (event, { apiKey, prompt }) => {
  if (!apiKey) throw new Error('Missing Gemini API Key');

  const maxRetries = 3;
  let delay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal: AbortSignal.timeout(30000) // 30 second timeout
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        log.error(`Gemini API Error (Attempt ${attempt}):`, errorText);
        
        // Retry on 503 Service Unavailable
        if (response.status === 503 && attempt < maxRetries) {
          log.info(`Gemini model overloaded. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
          continue;
        }

        throw new Error(`Gemini API Error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      log.error(`Gemini Generate Error (Attempt ${attempt}):`, error);
      if (attempt === maxRetries) throw error;
      
      // Retry on network errors
      log.info(`Network error occurred. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
});

// 2. Twitter Post Handler
ipcMain.handle('twitter-post', async (event, { keys, text }) => {
  const { consumerKey, consumerSecret, accessToken, tokenSecret } = keys;
  
  log.debug('Twitter Auth Debug:', {
    consumerKeyPrefix: consumerKey?.substring(0, 4),
    accessTokenPrefix: accessToken?.substring(0, 4),
    hasConsumerSecret: !!consumerSecret,
    hasTokenSecret: !!tokenSecret
  });
  
  if (!consumerKey || !consumerSecret || !accessToken || !tokenSecret) {
    throw new Error('Missing Twitter Credentials');
  }

  const method = 'POST';
  const url = 'https://api.twitter.com/2/tweets';
  
  const maxRetries = 3;
  let delay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const oauthParams = {
        oauth_consumer_key: consumerKey,
        oauth_token: accessToken,
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: OAuth.getTimestamp(),
        oauth_nonce: OAuth.getNonce(),
        oauth_version: '1.0'
      };

      const signature = OAuth.generateSignature(
        method,
        url,
        oauthParams,
        consumerSecret,
        tokenSecret
      );

      const authHeader = `OAuth oauth_consumer_key="${oauthParams.oauth_consumer_key}",oauth_token="${oauthParams.oauth_token}",oauth_signature_method="HMAC-SHA1",oauth_timestamp="${oauthParams.oauth_timestamp}",oauth_nonce="${oauthParams.oauth_nonce}",oauth_version="1.0",oauth_signature="${OAuth.percentEncode(signature)}"`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });

      if (!response.ok) {
        // Try to get error details
        const errorText = await response.text();
        log.error(`Twitter API Error (Attempt ${attempt}):`, errorText);
        
        // Don't retry on client errors (4xx) except maybe 429
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new Error(`Twitter API Error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        if (attempt < maxRetries) {
          log.info(`Twitter API error ${response.status}. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }

        throw new Error(`Twitter API Error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      log.error(`Twitter Post Error (Attempt ${attempt}):`, error);
      if (attempt === maxRetries) throw error;
      
      log.info(`Network error or timeout. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
});

// --- Secure Storage Handlers ---

// 1. Get Config - Decrypt sensitive data using OS-level encryption
ipcMain.handle('store-get-config', async () => {
  return {
    geminiKey: secureStorage.get('geminiKey'),
    twitterConsumerKey: secureStorage.get('twitterConsumerKey'),
    twitterConsumerSecret: secureStorage.get('twitterConsumerSecret'),
    twitterAccessToken: secureStorage.get('twitterAccessToken'),
    twitterTokenSecret: secureStorage.get('twitterTokenSecret')
  };
});

// 2. Save Config - Encrypt sensitive data using OS-level encryption
ipcMain.handle('store-save-config', async (event, config) => {
  // Store each sensitive key individually using OS-level encryption
  secureStorage.set('geminiKey', config.geminiKey || '');
  secureStorage.set('twitterConsumerKey', config.twitterConsumerKey || '');
  secureStorage.set('twitterConsumerSecret', config.twitterConsumerSecret || '');
  secureStorage.set('twitterAccessToken', config.twitterAccessToken || '');
  secureStorage.set('twitterTokenSecret', config.twitterTokenSecret || '');
  return true;
});

// 3. Get Topics
ipcMain.handle('store-get-topics', async () => {
  return store.get('topics', []);
});

// 4. Save Topics
ipcMain.handle('store-save-topics', async (event, topics) => {
  store.set('topics', topics);
  return true;
});

// 5. Get Auto-Launch Preference
ipcMain.handle('store-get-autolaunch', async () => {
  return store.get('autoLaunch', false);
});

// 6. Set Auto-Launch Preference
ipcMain.handle('store-set-autolaunch', async (event, enabled) => {
  store.set('autoLaunch', enabled);
  
  // Update OS login item settings
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: false, // Show window on startup
    args: []
  });
  
  log.info(`Auto-launch ${enabled ? 'enabled' : 'disabled'}`);
  return true;
});

// --- Auto-Updater Event Handlers ---

autoUpdater.on('checking-for-update', () => {
  log.info('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  log.info(`Update available: ${info.version}`);
  log.info(`Release notes: ${info.releaseNotes}`);
  
  // Notify main window about update
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate
    });
  }
});

autoUpdater.on('update-not-available', (info) => {
  log.info('Update not available. Current version is up to date.');
});

autoUpdater.on('error', (err) => {
  log.error('Error in auto-updater:', err);
});

autoUpdater.on('download-progress', (progressObj) => {
  const percent = Math.round(progressObj.percent);
  log.info(`Download progress: ${percent}% (${progressObj.bytesPerSecond} bytes/sec)`);
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-download-progress', {
      percent: progressObj.percent,
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total
    });
  }
});

autoUpdater.on('update-downloaded', (info) => {
  log.info(`Update downloaded: ${info.version}`);
  log.info('Update will be installed on app restart');
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-downloaded', {
      version: info.version
    });
  }
});

// --- Auto-Updater IPC Handlers ---

// Download update (user-initiated)
ipcMain.handle('download-update', async () => {
  try {
    log.info('User initiated update download');
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    log.error('Failed to download update:', error);
    return { success: false, error: error.message };
  }
});

// Install update and restart
ipcMain.handle('install-update', () => {
  log.info('User initiated update installation - restarting app');
  autoUpdater.quitAndInstall();
});

// Manual update check (user-initiated)
ipcMain.handle('check-for-updates', async () => {
  if (isDev) {
    log.info('Update check requested but disabled in development mode');
    return { available: false, message: 'Updates disabled in development mode' };
  }
  
  try {
    const result = await autoUpdater.checkForUpdates();
    return { 
      available: result.updateInfo.version !== app.getVersion(),
      currentVersion: app.getVersion(),
      latestVersion: result.updateInfo.version
    };
  } catch (error) {
    log.error('Update check failed:', error);
    return { available: false, error: error.message };
  }
});

// Update check function
function checkForUpdates() {
  if (isDev) {
    log.info('Auto-updater disabled in development mode');
    return;
  }
  
  log.info('Checking for updates automatically...');
  autoUpdater.checkForUpdates().catch(err => {
    log.error('Auto update check failed:', err);
  });
}


function createTray() {
  // Use favicon.ico for Windows, logo192.png for other platforms
  const iconPath = process.platform === 'win32' 
    ? path.join(__dirname, 'favicon.ico')
    : path.join(__dirname, 'logo192.png');
  
  tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Quit',
      click: () => {
        log.info('User quit from tray menu');
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Twitter Automator - Running in background');
  tray.setContextMenu(contextMenu);
  
  // Show window when tray icon is clicked (Windows/Linux)
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
  
  log.info('System tray icon created');
}

function createWindow() {
  // Create the browser window with security settings
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      // Security: Disable Node.js integration in renderer
      nodeIntegration: false,
      // Security: Enable context isolation
      contextIsolation: true,
      // Security: Load preload script for controlled IPC bridge
      preload: path.join(__dirname, 'preload.js'),
      // Security: Disable web security in dev (for CORS), enable in production
      // Note: With API calls moved to main process, we might not need to disable webSecurity in dev anymore,
      // but keeping it strictly for hot-reload of images/resources if needed.
      // For APIs, it's irrelevant now as Main process has no CORS.
      webSecurity: !isDev,
      // Security: Disable remote module
      enableRemoteModule: false
    },
    icon: path.join(__dirname, 'logo512.png'),
    backgroundColor: '#020617', // Match app's dark theme
    show: false // Don't show until ready-to-show
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load your Twitter (X) Automator app
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    // Open DevTools automatically in development
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
  }

  // Handle failed loads
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    log.error('Failed to load:', errorDescription);
    if (isDev && errorCode === -102) {
      // ERR_CONNECTION_REFUSED - React dev server not ready yet
      setTimeout(() => {
        mainWindow.loadURL('http://localhost:3000');
      }, 1000);
    }
  });

  // Security: Set Content Security Policy
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': isDev 
          ? ["default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:* https://generativelanguage.googleapis.com https://api.twitter.com"]
          : ["default-src 'self' 'unsafe-inline'; connect-src 'self' https://generativelanguage.googleapis.com https://api.twitter.com"]
      }
    });
  });

  // Minimize to tray instead of closing (critical for automation)
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      log.info('Window minimized to tray - automation continues in background');
      
      // Show notification on first minimize (optional but helpful)
      if (!mainWindow.hasShownTrayNotice) {
        mainWindow.webContents.executeJavaScript(`
          if (window.Notification && Notification.permission === 'granted') {
            new Notification('Twitter Automator', {
              body: 'App minimized to system tray. Automation continues in background.',
              icon: '${path.join(__dirname, 'logo192.png').replace(/\\/g, '/')}'
            });
          }
        `).catch(err => log.debug('Notification error:', err));
        mainWindow.hasShownTrayNotice = true;
      }
      
      return false;
    }
  });

  // Handle window closed (only when actually quitting)
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle window.open (e.g. from openWebIntent)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external URLs in the user's default browser
    if (url.startsWith('https:') || url.startsWith('http:')) {
      require('electron').shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Security: Prevent navigation to external URLs within the main window
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    // Allow localhost navigation in dev mode
    if (isDev && parsedUrl.host === 'localhost:3000') {
      return;
    }
    
    // Prevent navigation to external URLs (keep user in app)
    if (parsedUrl.origin !== 'file://') {
      event.preventDefault();
    }
  });

  // Create application menu
  createMenu();
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App lifecycle events
app.whenReady().then(() => {
  // Perform migration if needed (must be done after app is ready for safeStorage)
  if (needsMigration && oldStore) {
    try {
      log.info('Migrating from old encrypted storage to OS-level safeStorage...');
      const oldConfig = oldStore.get('config');
      
      // Save to new secure storage using safeStorage
      if (oldConfig.geminiKey) secureStorage.set('geminiKey', oldConfig.geminiKey);
      if (oldConfig.twitterConsumerKey) secureStorage.set('twitterConsumerKey', oldConfig.twitterConsumerKey);
      if (oldConfig.twitterConsumerSecret) secureStorage.set('twitterConsumerSecret', oldConfig.twitterConsumerSecret);
      if (oldConfig.twitterAccessToken) secureStorage.set('twitterAccessToken', oldConfig.twitterAccessToken);
      if (oldConfig.twitterTokenSecret) secureStorage.set('twitterTokenSecret', oldConfig.twitterTokenSecret);
      
      // Migrate topics if they exist
      const oldTopics = oldStore.get('topics');
      if (oldTopics && oldTopics.length > 0) {
        store.set('topics', oldTopics);
      }
      
      // Clear old config data (keep the store file but remove sensitive data)
      oldStore.delete('config');
      
      log.info('✅ Migration complete! API keys now secured with OS-level encryption.');
    } catch (error) {
      log.error('Migration failed:', error);
      log.warn('You may need to re-enter your API keys.');
    }
  }
  
  // Sync auto-launch preference with OS login items
  const autoLaunchEnabled = store.get('autoLaunch', false);
  app.setLoginItemSettings({
    openAtLogin: autoLaunchEnabled,
    openAsHidden: false,
    args: []
  });
  log.info(`Auto-launch on startup: ${autoLaunchEnabled ? 'enabled' : 'disabled'}`);
  
  // Create system tray icon for background operation
  createTray();
  
  createWindow();
  
  // Check for updates 5 seconds after launch (give app time to initialize)
  setTimeout(() => {
    checkForUpdates();
  }, 5000);
});

app.on('window-all-closed', () => {
  // Don't quit when all windows are closed - keep running in tray for automation
  // This is critical for background automation to continue
  // Only quit if explicitly requested from tray menu or app.quit() is called
  if (app.isQuitting) {
    app.quit();
  } else {
    log.info('All windows closed - app continues running in system tray');
  }
});

app.on('activate', () => {
  // On macOS, re-create/show window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else if (mainWindow) {
    mainWindow.show();
  }
});


// Global error handlers - Ensure all crashes are logged
process.on('uncaughtException', (error) => {
  log.error('=== UNCAUGHT EXCEPTION ===');
  log.error('Error:', error);
  log.error('Stack:', error.stack);
  // Don't exit immediately - give time for log to be written
  setTimeout(() => {
    app.quit();
  }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('=== UNHANDLED PROMISE REJECTION ===');
  log.error('Promise:', promise);
  log.error('Reason:', reason);
});

// Log when app is about to quit
app.on('before-quit', () => {
  log.info('=== App is shutting down ===');
});
