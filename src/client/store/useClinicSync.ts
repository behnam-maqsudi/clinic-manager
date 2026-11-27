import { useEffect } from 'react';
import type { ClinicMessage } from '../../shared/types';
import { playGentleChime, toPersianDigits } from '../utils/clinicHelpers';
import { sendClientLog, setClientDebugLogging } from '../utils/debugLogger';
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
    fetch('/api/dev/logs/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setClientDebugLogging(Boolean(data.enabled));
      })
      .catch(() => {});
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

    evtSource.addEventListener('connected', (e) => {
      useAppStore.getState().setSseConnected(true);
      sendClientLog('CLIENT_SSE', 'connected', undefined, 'EVENT');
      try {
        const data = JSON.parse((e as MessageEvent).data) as { connectedIps?: string[] };
        if (Array.isArray(data.connectedIps)) {
          useAppStore.getState().setConnectedPeerIps(data.connectedIps);
        }
      } catch {}
      usePatientsStore.getState().fetchPatients();
      useMessagesStore.getState().fetchMessages();
    });

    evtSource.addEventListener('peers_changed', (e) => {
      try {
        const data = JSON.parse(e.data) as { connectedIps?: string[] };
        if (Array.isArray(data.connectedIps)) {
          useAppStore.getState().setConnectedPeerIps(data.connectedIps);
          sendClientLog('CLIENT_SSE', 'peers_changed', { connectedIps: data.connectedIps }, 'EVENT');
        }
      } catch {}
    });

    evtSource.addEventListener('patients_changed', (e) => {
      sendClientLog('CLIENT_SSE', 'patients_changed', e.data, 'EVENT');
      usePatientsStore.getState().fetchPatients();
      patientSseCallbacks.forEach((cb) => cb());
    });

    evtSource.addEventListener('attachments_changed', (e) => {
      sendClientLog('CLIENT_SSE', 'attachments_changed', e.data, 'EVENT');
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
        sendClientLog('CLIENT_SSE', 'patient_called', payload, 'EVENT');
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
        sendClientLog('CLIENT_SSE', 'new_message', { id: msg.id, kind: msg.kind, from: msg.sender_role }, 'EVENT');
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
        const { clientId, setInviteBanner, connectToRemoteUrl, notify } = useAppStore.getState();
        sendClientLog('CLIENT_SSE', 'connection_invite', payload);
        if (payload.senderClientId && payload.senderClientId === clientId) {
          return;
        }
        if (payload.requestType === 'approved' && payload.fromUrl) {
          notify('درخواست اتصال توسط پزشک تأیید شد! در حال اتصال...');
          connectToRemoteUrl(payload.fromUrl);
          return;
        }
        playGentleChime();
        setInviteBanner(payload);
      } catch {}
    });

    evtSource.addEventListener('peer_connected', (e) => {
      try {
        const payload = JSON.parse(e.data) as { ip?: string; hostname?: string };
        const { addConnectedPeerIp, triggerCallAlert } = useAppStore.getState();
        sendClientLog('CLIENT_SSE', 'peer_connected', payload);
        if (payload.ip) addConnectedPeerIp(payload.ip);
        triggerCallAlert(`دستگاه «${payload.hostname || 'سیستم فرعی'}» دعوت را پذیرفت و به سیستم اصلی متصل شد.`);
      } catch {}
    });

    evtSource.onerror = () => {
      sendClientLog('CLIENT_SSE', 'SSE connection error/reconnecting', undefined, 'WARN');
      useAppStore.getState().setSseConnected(false);
    };
    return () => evtSource.close();
  }, []);
}
