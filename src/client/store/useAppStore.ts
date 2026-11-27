import { create } from 'zustand';
import type { ClinicSetupState, UserRole } from '../../shared/types';
import { playGentleChime, THEMES } from '../utils/clinicHelpers';

export interface InviteBannerData {
  fromName: string;
  fromUrl: string;
  message: string;
}

interface AppState {
  role: UserRole;
  theme: string;
  devMode: boolean;
  setupState: ClinicSetupState;
  sseConnected: boolean;
  clientId: string;
  toast: string;
  callBanner: string;
  inviteBanner: InviteBannerData | null;

  setRole: (role: UserRole) => void;
  setTheme: (theme: string) => void;
  setDevMode: (devMode: boolean) => void;
  setSetupState: (state: ClinicSetupState) => void;
  setSseConnected: (connected: boolean) => void;
  setCallBanner: (msg: string) => void;
  setInviteBanner: (banner: InviteBannerData | null) => void;
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

export const useAppStore = create<AppState>((set, get) => ({
  role: initialRole,
  theme: initialTheme,
  devMode: localStorage.getItem('clinic_dev_mode') === 'true',
  setupState: { setupCompleted: true, primaryRole: null, hasDoctorPin: false },
  sseConnected: false,
  clientId: initialClientId,
  toast: '',
  callBanner: '',
  inviteBanner: null,

  setRole: (role) => {
    localStorage.setItem('clinic_role', role);
    set({ role });
  },

  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('clinic_theme', theme);
    set({ theme });
  },

  setDevMode: (devMode) => {
    localStorage.setItem('clinic_dev_mode', String(devMode));
    set({ devMode });
  },

  setSetupState: (setupState) => set({ setupState }),
  setSseConnected: (sseConnected) => set({ sseConnected }),
  setCallBanner: (callBanner) => set({ callBanner }),
  setInviteBanner: (inviteBanner) => set({ inviteBanner }),

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

  connectToRemoteUrl: (rawUrl) => {
    const raw = rawUrl.trim();
    if (!raw) return;
    const normalized = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    if (window.clinicDesktop?.isElectron) {
      window.clinicDesktop.setRemoteUrl(normalized);
    } else {
      navigator.clipboard?.writeText(normalized).catch(() => {});
      window.open(normalized, '_blank', 'noopener,noreferrer');
      get().notify(`آدرس سرور (${normalized}) باز و کپی شد.`);
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
    try {
      const res = await fetch('/api/setup');
      const data = await res.json();
      if (data.ok) {
        set({
          setupState: {
            setupCompleted: Boolean(data.setupCompleted),
            primaryRole: data.primaryRole || null,
            hasDoctorPin: Boolean(data.hasDoctorPin),
          },
        });
      }
    } catch {}
  },
}));
