const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store();
let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the app
  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
  mainWindow.loadURL(startUrl);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    if (!store.get('startInBackground')) {
      mainWindow.show();
    }
  });

  // Hide on close instead of quitting
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

function createTray() {
  // Create a simple tray icon (we'll use a basic icon for now)
  tray = new Tray(path.join(__dirname, '../public/icon.png'));
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        mainWindow.show();
      }
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Backupr');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow.show();
  });
}

// IPC handlers for database operations and settings
ipcMain.handle('get-settings', async () => {
  return {
    serverHost: store.get('serverHost', ''),
    apiKey: store.get('apiKey', ''),
    dbConfig: store.get('dbConfig', {
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'backupr'
    })
  };
});

ipcMain.handle('save-settings', async (event, settings) => {
  store.set('serverHost', settings.serverHost);
  store.set('apiKey', settings.apiKey);
  if (settings.dbConfig) {
    store.set('dbConfig', settings.dbConfig);
  }
  return { success: true };
});

ipcMain.handle('get-backup-config', async () => {
  return store.get('backupConfig', {
    files: [],
    period: 'daily'
  });
});

ipcMain.handle('save-backup-config', async (event, config) => {
  store.set('backupConfig', config);
  return { success: true };
});

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Keep app running in background on all platforms
  // Don't quit when all windows are closed
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
