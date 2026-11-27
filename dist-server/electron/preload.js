"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('clinicDesktop', {
    isElectron: true,
    getRemoteUrl: () => electron_1.ipcRenderer.invoke('clinic:get-remote-url'),
    setRemoteUrl: (url) => electron_1.ipcRenderer.invoke('clinic:set-remote-url', url),
});
