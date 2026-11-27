import { contextBridge, ipcRenderer } from 'electron';

export interface DownloadProgressPayload {
  status: 'downloading' | 'done' | 'error';
  percent: number;
  filePath?: string;
  message?: string;
}

contextBridge.exposeInMainWorld('clinicDesktop', {
  isElectron: true,
  getRemoteUrl: (): Promise<string> => ipcRenderer.invoke('clinic:get-remote-url'),
  setRemoteUrl: (url: string): Promise<{ ok: boolean; remoteUrl: string }> =>
    ipcRenderer.invoke('clinic:set-remote-url', url),
  downloadUpdate: (url: string, fileName: string): Promise<{ ok: boolean; filePath?: string; message?: string }> =>
    ipcRenderer.invoke('clinic:download-update', url, fileName),
  installDownloadedUpdate: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('clinic:install-downloaded-update', filePath),
  onDownloadProgress: (cb: (payload: DownloadProgressPayload) => void) => {
    const handler = (_event: unknown, payload: DownloadProgressPayload) => cb(payload);
    ipcRenderer.on('clinic:download-progress', handler);
    return () => ipcRenderer.removeListener('clinic:download-progress', handler);
  },
});
