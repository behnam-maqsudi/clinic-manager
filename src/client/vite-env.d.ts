/// <reference types="vite/client" />

interface DownloadProgressPayload {
  status: 'downloading' | 'done' | 'error';
  percent: number;
  filePath?: string;
  message?: string;
}

interface ClinicDesktopApi {
  isElectron: boolean;
  getRemoteUrl: () => Promise<string>;
  setRemoteUrl: (url: string) => Promise<{ ok: boolean; remoteUrl: string }>;
  downloadUpdate: (url: string, fileName: string) => Promise<{ ok: boolean; filePath?: string; message?: string }>;
  installDownloadedUpdate: (filePath: string) => Promise<void>;
  onDownloadProgress: (cb: (payload: DownloadProgressPayload) => void) => () => void;
}

interface Window {
  clinicDesktop?: ClinicDesktopApi;
}
