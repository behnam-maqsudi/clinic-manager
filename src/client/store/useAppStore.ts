import { create } from 'zustand';
import type { ClinicSetupState, UserRole } from '../../shared/types';
import { playGentleChime, THEMES } from '../utils/clinicHelpers';
import { sendClientLog } from '../utils/debugLogger';
import { withStoreLogger } from './withLogger';

export interface InviteBannerData {
  fromName: string;
  fromUrl: string;
  message: string;
  requestType?: 'host_invite' | 'join_request' | 'approved';
}

interface AppState {
  role: UserRole;
  isAuthenticated: boolean;
  doctorToken: string;
  theme: string;
  devMode: boolean;
  setupState: ClinicSetupState;
  remoteHostUrl: string;
  sseConnected: boolean;
  clientId: string;
  toast: string;
  callBanner: string;
  inviteBanner: InviteBannerData | null;
  connectedPeerIps: string[];
  devNetworkOffline: boolean;

  setRole: (role: UserRole) => void;
  setDoctorToken: (token: string) => void;
  loginSuccess: (role: UserRole, doctorToken?: string) => void;
  logout: () => void;
  setTheme: (theme: string) => void;
  setDevMode: (devMode: boolean) => void;
  setDevNetworkOffline: (offline: boolean) => void;
  setSetupState: (state: ClinicSetupState) => void;
  setSseConnected: (connected: boolean) => void;
  setCallBanner: (msg: string) => void;
  setInviteBanner: (banner: InviteBannerData | null) => void;
  setConnectedPeerIps: (ips: string[]) => void;
  addConnectedPeerIp: (ip: string) => void;
  notify: (msg: string) => void;
  triggerCallAlert: (msg: string) => void;
  connectToRemoteUrl: (rawUrl: string) => void;
  cycleTheme: () => void;
  loadSetupState: () => Promise<void>;
}

let toastTimer: number | undefined;
let callTimer: number | undefined;

const initialTheme = localStorage.getItem('clinic_theme') || 'teal';
document.documentElement.setAttribute('data-theme', initialTheme);

const savedRole = localStorage.getItem('clinic_role');
const initialRole: UserRole = savedRole === 'doctor' || savedRole === 'secretary' ? savedRole : 'secretary';

const initialClientId =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const useAppStore = create<AppState>(
  withStoreLogger('App', (set, get) => ({
  role: initialRole,
  isAuthenticated: localStorage.getItem('clinic_logged_in') === 'true',
  doctorToken: localStorage.getItem('clinic_doctor_token') || '',
  theme: initialTheme,
  devMode: localStorage.getItem('clinic_dev_mode') === 'true',
  setupState: { setupCompleted: true, hasDoctorPin: false, hasSecretaryPin: false },
  remoteHostUrl: '',
  sseConnected: false,
  clientId: initialClientId,
  toast: '',
  callBanner: '',
  inviteBanner: null,
  connectedPeerIps: [],
  devNetworkOffline: false,

  setRole: (role) => {
    localStorage.setItem('clinic_role', role);
    if (role === 'secretary') {
      localStorage.removeItem('clinic_doctor_token');
      set({ role, doctorToken: '' });
    } else {
      set({ role });
    }
  },

  setDoctorToken: (doctorToken) => {
    if (doctorToken) {
      localStorage.setItem('clinic_doctor_token', doctorToken);
    } else {
      localStorage.removeItem('clinic_doctor_token');
    }
    set({ doctorToken });
  },

  loginSuccess: (role, doctorToken = '') => {
    localStorage.setItem('clinic_role', role);
    localStorage.setItem('clinic_logged_in', 'true');
    if (role === 'doctor' && doctorToken) {
      localStorage.setItem('clinic_doctor_token', doctorToken);
    } else {
      localStorage.removeItem('clinic_doctor_token');
    }
    sendClientLog('STATE', 'loginSuccess', { role, hasToken: Boolean(doctorToken) });
    set({ role, isAuthenticated: true, doctorToken: role === 'doctor' ? doctorToken : '' });
  },

  logout: () => {
    localStorage.removeItem('clinic_logged_in');
    localStorage.removeItem('clinic_doctor_token');
    sendClientLog('STATE', 'logout');
    set({ isAuthenticated: false, doctorToken: '' });
  },

  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('clinic_theme', theme);
    set({ theme });
  },

  setDevMode: (devMode) => {
    localStorage.setItem('clinic_dev_mode', String(devMode));
    set({ devMode, ...(devMode ? {} : { devNetworkOffline: false }) });
  },

  setDevNetworkOffline: (devNetworkOffline) => set({ devNetworkOffline }),

  setSetupState: (setupState) => set({ setupState }),
  setSseConnected: (sseConnected) => set({ sseConnected }),
  setCallBanner: (callBanner) => set({ callBanner }),
  setInviteBanner: (inviteBanner) => set({ inviteBanner }),
  setConnectedPeerIps: (connectedPeerIps) => set({ connectedPeerIps }),
  addConnectedPeerIp: (ip) =>
    set((s) => (ip && !s.connectedPeerIps.includes(ip) ? { connectedPeerIps: [...s.connectedPeerIps, ip] } : s)),

  notify: (msg) => {
    set({ toast: msg });
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => set({ toast: '' }), 3200);
  },

  triggerCallAlert: (msg) => {
    playGentleChime();
    set({ callBanner: msg });
    window.clearTimeout(callTimer);
    callTimer = window.setTimeout(() => set({ callBanner: '' }), 6000);
  },

  connectToRemoteUrl: async (rawUrl) => {
    const raw = rawUrl.trim();
    if (!raw) return;
    const normalized = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    try {
      await fetch('/api/network/notify-accepted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl: normalized }),
      });
    } catch {}
    if (window.clinicDesktop?.isElectron) {
      window.clinicDesktop.setRemoteUrl(normalized);
    } else {
      navigator.clipboard?.writeText(normalized).catch(() => {});
      window.open(normalized, '_blank', 'noopener,noreferrer');
      get().notify('به سیستم اصلی مطب متصل شدید.');
    }
  },

  cycleTheme: () => {
    const { theme, setTheme, notify } = get();
    const idx = THEMES.findIndex((t) => t.id === theme);
    const next = THEMES[(idx + 1) % THEMES.length];
    setTheme(next.id);
    notify(`تم تغییر کرد: ${next.name}`);
  },

  loadSetupState: async () => {
    const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocalHost && window.clinicDesktop?.isElectron) {
      window.clinicDesktop
        .getRemoteUrl()
        .then((u) => set({ remoteHostUrl: u || '' }))
        .catch(() => {});
    } else {
      set({ remoteHostUrl: '' });
    }
    try {
      const res = await fetch('/api/setup');
      const data = await res.json();
      if (data.ok) {
        const nextSetup: ClinicSetupState = {
          setupCompleted: Boolean(data.setupCompleted),
          hasDoctorPin: Boolean(data.hasDoctorPin),
          hasSecretaryPin: Boolean(data.hasSecretaryPin),
        };
        set({ setupState: nextSetup });

        const { role, isAuthenticated, doctorToken, devMode, logout } = get();
        if (nextSetup.setupCompleted && isAuthenticated && role === 'doctor' && nextSetup.hasDoctorPin && !devMode) {
          if (!doctorToken) {
            logout();
          } else {
            const vRes = await fetch('/api/auth/verify-token', {
              headers: { 'x-doctor-token': doctorToken },
            });
            const vData = await vRes.json();
            if (!vData.valid) {
              logout();
            }
          }
        }
      }
    } catch {}
  },
}))
);
