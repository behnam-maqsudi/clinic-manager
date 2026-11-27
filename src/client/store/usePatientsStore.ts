import { create } from 'zustand';
import type { DateObject } from 'react-multi-date-picker';
import type { Patient, PatientStatus } from '../../shared/types';
import { getTodayIso, toIsoDateString } from '../utils/clinicHelpers';
import { useAppStore } from './useAppStore';

interface PatientsState {
  patients: Patient[];
  query: string;
  debouncedQuery: string;
  dateFilter: 'today' | 'all' | 'custom';
  customRange: DateObject[];
  statusFilter: 'all' | PatientStatus;

  setQuery: (q: string) => void;
  setDebouncedQuery: (q: string) => void;
  setDateFilter: (filter: 'today' | 'all' | 'custom') => void;
  setCustomRange: (range: DateObject[]) => void;
  setStatusFilter: (status: 'all' | PatientStatus) => void;
  fetchPatients: () => Promise<void>;
  quickStatus: (id: number, status: PatientStatus) => Promise<Patient | null>;
}

export const usePatientsStore = create<PatientsState>((set, get) => ({
  patients: [],
  query: '',
  debouncedQuery: '',
  dateFilter: 'today',
  customRange: [],
  statusFilter: 'all',

  setQuery: (query) => set({ query }),
  setDebouncedQuery: (debouncedQuery) => set({ debouncedQuery }),
  setDateFilter: (dateFilter) => set({ dateFilter }),
  setCustomRange: (customRange) => set({ customRange }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),

  fetchPatients: async () => {
    const { debouncedQuery, statusFilter, dateFilter, customRange } = get();
    const params = new URLSearchParams();
    if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim());
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (dateFilter === 'today') {
      params.set('date', getTodayIso());
    } else if (dateFilter === 'custom' && customRange.length > 0) {
      const fromIso = toIsoDateString(customRange[0]);
      const toIso = customRange[1] ? toIsoDateString(customRange[1]) : fromIso;
      params.set('date_from', fromIso);
      params.set('date_to', toIso);
    } else {
      params.set('date', 'all');
    }

    try {
      const res = await fetch(`/api/patients?${params.toString()}`);
      const data = await res.json();
      if (data.ok) {
        set({ patients: data.patients || [] });
      }
    } catch {}
  },

  quickStatus: async (id, status) => {
    const { role, notify } = useAppStore.getState();
    try {
      const res = await fetch(`/api/patients/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, actor_role: role }),
      });
      const data = await res.json();
      if (data.ok) {
        notify('وضعیت مراجعه‌کننده بروزرسانی شد.');
        get().fetchPatients();
        return data.patient;
      }
    } catch {
      notify('خطا در بروزرسانی وضعیت');
    }
    return null;
  },
}));
