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

ipcMain.handle('clinic:download-update', async (_event, url: string, fileName: string) => {
  try {
    const safeName = path.basename(fileName || 'Clinic-Manager-Update.exe');
    const destPath = path.join(app.getPath('downloads'), safeName);

    const res = await fetch(url, { headers: { 'User-Agent': 'clinic-manager-app' } });
    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status}`);
    }

    const totalBytes = Number(res.headers.get('content-length') || 0);
    let receivedBytes = 0;
    const fileStream = fs.createWriteStream(destPath);
    const reader = res.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        fileStream.write(Buffer.from(value));
        receivedBytes += value.byteLength;
        const percent = totalBytes > 0 ? Math.min(99, Math.round((receivedBytes / totalBytes) * 100)) : 50;
        mainWindow?.webContents.send('clinic:download-progress', {
          status: 'downloading',
          percent,
        });
      }
    }

    await new Promise<void>((resolve, reject) => {
      fileStream.end(() => resolve());
      fileStream.on('error', reject);
    });

    mainWindow?.webContents.send('clinic:download-progress', {
      status: 'done',
      percent: 100,
      filePath: destPath,
    });
    return { ok: true, filePath: destPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    mainWindow?.webContents.send('clinic:download-progress', {
      status: 'error',
      percent: 0,
      message,
    });
    return { ok: false, message };
  }
});

ipcMain.handle('clinic:install-downloaded-update', async (_event, filePath: string) => {
  if (filePath && fs.existsSync(filePath)) {
    await shell.openPath(filePath);
    if (process.platform === 'win32') {
      setTimeout(() => app.quit(), 800);
    }
  }
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
