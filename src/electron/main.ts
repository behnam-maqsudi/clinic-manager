import path from 'node:path';
import { app, BrowserWindow, shell } from 'electron';

let mainWindow: BrowserWindow | null = null;
let closeServer: (() => void) | null = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

async function createWindow() {
  if (app.isPackaged && !process.env.CLINIC_DATA_DIR) {
    process.env.CLINIC_DATA_DIR = path.join(app.getPath('userData'), 'clinic-data');
  }

  // Import server after CLINIC_DATA_DIR is configured
  const { startServer } = await import('../server');
  const port = Number(process.env.PORT) || 3000;
  const started = await startServer(port);
  closeServer = started.close;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'مطب دکتر بهامین جهانیان',
    backgroundColor: '#faf8ff',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Allow opening attachments (PDF/images) in default OS viewer or new window
    if (url.startsWith(`http://localhost:${port}/api/attachments/`)) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(`http://localhost:${port}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow).catch((err) => {
  console.error('Electron startup error:', err);
  app.quit();
});

app.on('window-all-closed', () => {
  if (closeServer) {
    closeServer();
    closeServer = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch(console.error);
  }
});
