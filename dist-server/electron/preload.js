"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('clinicDesktop', {
    isElectron: true,
    getRemoteUrl: () => electron_1.ipcRenderer.invoke('clinic:get-remote-url'),
    setRemoteUrl: (url) => electron_1.ipcRenderer.invoke('clinic:set-remote-url', url),
    downloadUpdate: (url, fileName) => electron_1.ipcRenderer.invoke('clinic:download-update', url, fileName),
    installDownloadedUpdate: (filePath) => electron_1.ipcRenderer.invoke('clinic:install-downloaded-update', filePath),
    onDownloadProgress: (cb) => {
        const handler = (_event, payload) => cb(payload);
        electron_1.ipcRenderer.on('clinic:download-progress', handler);
        return () => electron_1.ipcRenderer.removeListener('clinic:download-progress', handler);
    },
});
