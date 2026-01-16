const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV !== 'production';

// Keep a global reference to prevent garbage collection
let mainWindow;

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
          ? ["default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:* https://generativelanguage.googleapis.com https://api.twitter.com https://cors-anywhere.herokuapp.com"]
          : ["default-src 'self' 'unsafe-inline'; connect-src 'self' https://generativelanguage.googleapis.com https://api.twitter.com https://cors-anywhere.herokuapp.com"]
      }
    });
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
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

// Security: Prevent navigation to external URLs
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    // Allow localhost navigation in dev mode
    if (isDev && parsedUrl.host === 'localhost:3000') {
      return;
    }
    
    // Prevent navigation to external URLs
    if (parsedUrl.origin !== 'file://') {
      event.preventDefault();
    }
  });
});
