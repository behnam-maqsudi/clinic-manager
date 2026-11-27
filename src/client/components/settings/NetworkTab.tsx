import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { NetworkConnectSection } from '../NetworkConnectSection';

export function NetworkTab() {
  const role = useAppStore((s) => s.role);
  const clientId = useAppStore((s) => s.clientId);
  const notify = useAppStore((s) => s.notify);
  const connectToRemoteUrl = useAppStore((s) => s.connectToRemoteUrl);

  const [remoteUrlInput, setRemoteUrlInput] = useState('');
  const [activeRemoteUrl, setActiveRemoteUrl] = useState('');

  useEffect(() => {
    const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocalHost && window.clinicDesktop?.isElectron) {
      window.clinicDesktop
        .getRemoteUrl()
        .then((u) => {
          setActiveRemoteUrl(u || '');
          setRemoteUrlInput(u || '');
        })
        .catch(() => {});
    }
  }, []);

  return (
    <NetworkConnectSection
      role={role}
      clientId={clientId}
      isElectron={Boolean(window.clinicDesktop?.isElectron)}
      remoteUrlInput={remoteUrlInput}
      setRemoteUrlInput={setRemoteUrlInput}
      activeRemoteUrl={activeRemoteUrl}
      onConnectUrl={connectToRemoteUrl}
      onDisconnectRemote={() => window.clinicDesktop?.setRemoteUrl('')}
      notify={notify}
    />
  );
}
