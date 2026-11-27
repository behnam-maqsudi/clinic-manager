/// <reference types="vite/client" />

interface ClinicDesktopApi {
  isElectron: boolean;
  getRemoteUrl: () => Promise<string>;
  setRemoteUrl: (url: string) => Promise<{ ok: boolean; remoteUrl: string }>;
}

interface Window {
  clinicDesktop?: ClinicDesktopApi;
}
