import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('clinicDesktop', {
  isElectron: true,
  getRemoteUrl: (): Promise<string> => ipcRenderer.invoke('clinic:get-remote-url'),
  setRemoteUrl: (url: string): Promise<{ ok: boolean; remoteUrl: string }> =>
    ipcRenderer.invoke('clinic:set-remote-url', url),
});
