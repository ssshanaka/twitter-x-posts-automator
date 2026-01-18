const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const crypto = require('crypto');
const Store = require('electron-store');
const isDev = process.env.NODE_ENV !== 'production';

// Initialize secure storage
const store = new Store({
  encryptionKey: 'twitter-automator-secure-key', // In production, use a more secure key
  defaults: {
    config: {
      geminiKey: '',
      twitterConsumerKey: '',
      twitterConsumerSecret: '',
      twitterAccessToken: '',
      twitterTokenSecret: ''
    },
    topics: []
  }
});

// Keep a global reference to prevent garbage collection
let mainWindow;

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

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Error Details:', errorText);
      throw new Error(`Gemini API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Gemini Generate Error:', error);
    throw error;
  }
});

// 2. Twitter Post Handler
ipcMain.handle('twitter-post', async (event, { keys, text }) => {
  const { consumerKey, consumerSecret, accessToken, tokenSecret } = keys;
  
  console.log('Twitter Auth Debug:', {
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

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      // Try to get error details
      const errorText = await response.text();
      console.error('Twitter API Error Details:', errorText);
      throw new Error(`Twitter API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Twitter Post Error:', error);
    throw error;
  }
});

// --- Secure Storage Handlers ---

// 1. Get Config
ipcMain.handle('store-get-config', async () => {
  return store.get('config');
});

// 2. Save Config
ipcMain.handle('store-save-config', async (event, config) => {
  store.set('config', config);
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

  // Load your React app
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    // Open DevTools automatically in development
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
  }

  // Handle failed loads
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorDescription);
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

  // Handle window closed
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
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // On macOS, apps stay active until user explicitly quits
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});


