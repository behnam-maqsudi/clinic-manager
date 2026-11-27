import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';

let mainWindow: BrowserWindow | null = null;
let closeServer: (() => void) | null = null;

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'clinic-config.json');
}

function readRemoteUrl(): string {
  try {
    const cfg = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')) as { remoteUrl?: string };
    return (cfg.remoteUrl || '').trim();
  } catch {
    return '';
  }
}

function writeRemoteUrl(url: string) {
  const clean = url.trim().replace(/\/+$/, '');
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify({ remoteUrl: clean }, null, 2), 'utf8');
  return clean;
}

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

async function ensureLocalServer(): Promise<number> {
  if (app.isPackaged && !process.env.CLINIC_DATA_DIR) {
    process.env.CLINIC_DATA_DIR = path.join(app.getPath('userData'), 'clinic-data');
  }
  const port = Number(process.env.PORT) || 3000;
  if (!closeServer) {
    const { startServer } = await import('../server');
    const started = await startServer(port);
    closeServer = started.close;
  }
  return port;
}

async function createWindow() {
  const remoteUrl = readRemoteUrl();
  let targetUrl = '';

  if (remoteUrl) {
    targetUrl = remoteUrl;
  } else {
    const port = await ensureLocalServer();
    targetUrl = `http://localhost:${port}`;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'مطب دکتر بهامین جهانیان',
    backgroundColor: '#faf8ff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('/api/attachments/')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-fail-load', async () => {
    // If remote server is unreachable, fall back to local server so user isn't stuck
    if (readRemoteUrl()) {
      const port = await ensureLocalServer();
      mainWindow?.loadURL(`http://localhost:${port}`);
    }
  });

  await mainWindow.loadURL(targetUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('clinic:get-remote-url', () => readRemoteUrl());

ipcMain.handle('clinic:set-remote-url', async (_event, url: string) => {
  const clean = writeRemoteUrl(url || '');
  if (clean) {
    await mainWindow?.loadURL(clean);
  } else {
    const port = await ensureLocalServer();
    await mainWindow?.loadURL(`http://localhost:${port}`);
  }
  return { ok: true, remoteUrl: clean };
});

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
