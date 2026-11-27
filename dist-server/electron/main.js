"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const electron_1 = require("electron");
let mainWindow = null;
let closeServer = null;
function getConfigPath() {
    return node_path_1.default.join(electron_1.app.getPath('userData'), 'clinic-config.json');
}
function readRemoteUrl() {
    try {
        const cfg = JSON.parse(node_fs_1.default.readFileSync(getConfigPath(), 'utf8'));
        return (cfg.remoteUrl || '').trim();
    }
    catch {
        return '';
    }
}
function writeRemoteUrl(url) {
    const clean = url.trim().replace(/\/+$/, '');
    node_fs_1.default.mkdirSync(electron_1.app.getPath('userData'), { recursive: true });
    node_fs_1.default.writeFileSync(getConfigPath(), JSON.stringify({ remoteUrl: clean }, null, 2), 'utf8');
    return clean;
}
const gotLock = electron_1.app.requestSingleInstanceLock();
if (!gotLock) {
    electron_1.app.quit();
}
else {
    electron_1.app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.focus();
        }
    });
}
async function ensureLocalServer() {
    if (electron_1.app.isPackaged && !process.env.CLINIC_DATA_DIR) {
        process.env.CLINIC_DATA_DIR = node_path_1.default.join(electron_1.app.getPath('userData'), 'clinic-data');
    }
    const port = Number(process.env.PORT) || 3000;
    if (!closeServer) {
        const { startServer } = await Promise.resolve().then(() => __importStar(require('../server')));
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
    }
    else {
        const port = await ensureLocalServer();
        targetUrl = `http://localhost:${port}`;
    }
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 840,
        minWidth: 960,
        minHeight: 640,
        title: 'مطب دکتر بهامین جهانیان',
        backgroundColor: '#faf8ff',
        autoHideMenuBar: true,
        webPreferences: {
            preload: node_path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.includes('/api/attachments/')) {
            return { action: 'allow' };
        }
        electron_1.shell.openExternal(url);
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
electron_1.ipcMain.handle('clinic:get-remote-url', () => readRemoteUrl());
electron_1.ipcMain.handle('clinic:set-remote-url', async (_event, url) => {
    const clean = writeRemoteUrl(url || '');
    if (clean) {
        await mainWindow?.loadURL(clean);
    }
    else {
        const port = await ensureLocalServer();
        await mainWindow?.loadURL(`http://localhost:${port}`);
    }
    return { ok: true, remoteUrl: clean };
});
electron_1.app.whenReady().then(createWindow).catch((err) => {
    console.error('Electron startup error:', err);
    electron_1.app.quit();
});
electron_1.app.on('window-all-closed', () => {
    if (closeServer) {
        closeServer();
        closeServer = null;
    }
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createWindow().catch(console.error);
    }
});
