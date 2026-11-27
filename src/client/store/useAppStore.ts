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
  doctorToken: string;
  theme: string;
  devMode: boolean;
  setupState: ClinicSetupState;
  sseConnected: boolean;
  clientId: string;
  toast: string;
  callBanner: string;
  inviteBanner: InviteBannerData | null;
  devNetworkOffline: boolean;

  setRole: (role: UserRole) => void;
  setDoctorToken: (token: string) => void;
  setTheme: (theme: string) => void;
  setDevMode: (devMode: boolean) => void;
  setDevNetworkOffline: (offline: boolean) => void;
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
  doctorToken: localStorage.getItem('clinic_doctor_token') || '',
  theme: initialTheme,
  devMode: localStorage.getItem('clinic_dev_mode') === 'true',
  setupState: { setupCompleted: true, primaryRole: null, hasDoctorPin: false },
  sseConnected: false,
  clientId: initialClientId,
  toast: '',
  callBanner: '',
  inviteBanner: null,
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
        const nextSetup = {
          setupCompleted: Boolean(data.setupCompleted),
          primaryRole: data.primaryRole || null,
          hasDoctorPin: Boolean(data.hasDoctorPin),
        };
        set({ setupState: nextSetup });

        // Prevent localStorage tampering: verify doctorToken if role is doctor
        const { role, doctorToken, devMode, setRole, setDoctorToken } = get();
        if (nextSetup.setupCompleted && role === 'doctor' && !devMode) {
          if (nextSetup.hasDoctorPin) {
            if (!doctorToken) {
              setRole('secretary');
            } else {
              const vRes = await fetch('/api/auth/verify-token', {
                headers: { 'x-doctor-token': doctorToken },
              });
              const vData = await vRes.json();
              if (!vData.valid) {
                setDoctorToken('');
                setRole('secretary');
              }
            }
          } else if (nextSetup.primaryRole === 'secretary') {
            setRole('secretary');
          }
        }
      }
    } catch {}
  },
}));
