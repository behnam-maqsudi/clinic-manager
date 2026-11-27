import { useEffect } from 'react';
import type { ClinicMessage } from '../../shared/types';
import { playGentleChime, toPersianDigits } from '../utils/clinicHelpers';
import { type InviteBannerData, useAppStore } from './useAppStore';
import { usePatientsStore } from './usePatientsStore';
import { useMessagesStore } from './useMessagesStore';

const patientSseCallbacks = new Set<() => void>();
const attachmentSseCallbacks = new Set<(patientId: number) => void>();

export function subscribePatientsSse(cb: () => void): () => void {
  patientSseCallbacks.add(cb);
  return () => patientSseCallbacks.delete(cb);
}

export function subscribeAttachmentsSse(cb: (patientId: number) => void): () => void {
  attachmentSseCallbacks.add(cb);
  return () => attachmentSseCallbacks.delete(cb);
}

export function useClinicSync(): void {
  const query = usePatientsStore((s) => s.query);
  const debouncedQuery = usePatientsStore((s) => s.debouncedQuery);
  const dateFilter = usePatientsStore((s) => s.dateFilter);
  const customRange = usePatientsStore((s) => s.customRange);
  const statusFilter = usePatientsStore((s) => s.statusFilter);
  const setDebouncedQuery = usePatientsStore((s) => s.setDebouncedQuery);
  const fetchPatients = usePatientsStore((s) => s.fetchPatients);
  const loadSetupState = useAppStore((s) => s.loadSetupState);

  useEffect(() => {
    loadSetupState();
  }, [loadSetupState]);

  useEffect(() => {
    if (!query.trim()) {
      setDebouncedQuery('');
      return;
    }
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 1000);
    return () => clearTimeout(t);
  }, [query, setDebouncedQuery]);

  useEffect(() => {
    fetchPatients();
  }, [debouncedQuery, dateFilter, customRange, statusFilter, fetchPatients]);

  useEffect(() => {
    const evtSource = new EventSource('/api/events');

    evtSource.addEventListener('connected', () => {
      useAppStore.getState().setSseConnected(true);
      usePatientsStore.getState().fetchPatients();
      useMessagesStore.getState().fetchMessages();
    });

    evtSource.addEventListener('patients_changed', () => {
      usePatientsStore.getState().fetchPatients();
      patientSseCallbacks.forEach((cb) => cb());
    });

    evtSource.addEventListener('attachments_changed', (e) => {
      usePatientsStore.getState().fetchPatients();
      try {
        const payload = JSON.parse(e.data);
        if (payload.patientId) {
          attachmentSseCallbacks.forEach((cb) => cb(payload.patientId));
        }
      } catch {}
    });

    evtSource.addEventListener('patient_called', (e) => {
      try {
        const payload = JSON.parse(e.data);
        const { role, triggerCallAlert } = useAppStore.getState();
        if (role === 'secretary' && payload.by === 'doctor') {
          triggerCallAlert(
            payload.status === 'in_progress'
              ? `دکتر جهانیان بیمار «${payload.full_name}»${payload.file_number ? ` (پرونده ${toPersianDigits(payload.file_number)})` : ''} را فراخوانی کرد`
              : `ویزیت «${payload.full_name}» به پایان رسید`
          );
        }
      } catch {}
    });

    evtSource.addEventListener('new_message', (e) => {
      try {
        const msg = JSON.parse(e.data) as ClinicMessage;
        useMessagesStore.getState().appendMessage(msg);
        const { role, notify } = useAppStore.getState();
        if (msg.sender_role !== role && msg.kind !== 'connection_invite') {
          if (useMessagesStore.getState().messagesModalOpen) {
            useMessagesStore.getState().markMessagesAsRead(role);
          } else {
            playGentleChime();
            const senderLabel = msg.sender_role === 'doctor' ? 'دکتر' : msg.sender_role === 'secretary' ? 'منشی' : 'سیستم';
            notify(`پیام جدید از ${senderLabel}: ${msg.body}`);
          }
        }
      } catch {}
    });

    evtSource.addEventListener('connection_invite', (e) => {
      try {
        const payload = JSON.parse(e.data) as InviteBannerData & { senderClientId?: string };
        const { clientId, setInviteBanner } = useAppStore.getState();
        if (payload.senderClientId && payload.senderClientId === clientId) {
          return;
        }
        playGentleChime();
        setInviteBanner(payload);
      } catch {}
    });

    evtSource.onerror = () => useAppStore.getState().setSseConnected(false);
    return () => evtSource.close();
  }, []);
}
